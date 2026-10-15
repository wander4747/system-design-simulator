import { clamp } from './math.js';
import { isCacheLike } from './types.js';

// A processor advances one node by `dt` seconds. It updates the node's runtime in place and
// returns how much traffic it sends to each child: Map<childId, rps>.

const TIMEOUT_MS = 3000;

const DROP_RATIO_BAD = 0.01;
const WAIT_BAD_MS = 1000;
const WAIT_WARN_MS = 200;
const LOAD_WARN = 0.75;
const MAX_UTILIZATION = 0.99;
const CONTENTION_FACTOR = 3; // latency grows by up to (1 + CONTENTION_FACTOR) x at full utilization
const QUEUE_WARN_FILL = 0.2;
const MIN_LEAST_LOADED_WEIGHT = 0.02;

const sendAll = (children, amount) => new Map(children.map((child) => [child.node.id, amount]));

/** Outcome of the node itself (ignoring its dependencies): success probability and latency. */
export function ownOutcome(node, runtime) {
  if (runtime.passthrough) return { ok: 1, lat: 0 };
  if (!node.up) return { ok: 0, lat: TIMEOUT_MS };
  if (node.type === 'client') return { ok: 1, lat: 0 };
  const ok = runtime.incoming > 0 ? clamp(1 - runtime.dropped / runtime.incoming, 0, 1) : 1;
  return { ok, lat: runtime.lat };
}

function statusFor(dropRatio, load, waitMs) {
  if (dropRatio > DROP_RATIO_BAD || waitMs > WAIT_BAD_MS) return 'bad';
  return load > LOAD_WARN || waitMs > WAIT_WARN_MS ? 'warn' : 'ok';
}

function processClient({ node, runtime, offered, children }) {
  Object.assign(runtime, {
    served: offered,
    dropped: 0,
    load: 0,
    rho: 0,
    backlog: 0,
    waitMs: 0,
    status: node.up ? 'ok' : 'down',
  });
  return sendAll(children, offered);
}

function processDown({ node, runtime, offered, children }) {
  Object.assign(runtime, { backlog: 0, load: 0, rho: 0, waitMs: 0, status: 'down', served: 0, dropped: offered });
  if (!isCacheLike(node)) return new Map();
  // A downed cache forwards everything to the origin (cache stampede).
  Object.assign(runtime, { passthrough: true, served: offered, dropped: 0 });
  return sendAll(children, offered);
}

// A queue accepts messages up to its ingest capacity and drains them at a fixed consumer rate.
function processQueue({ node, runtime, offered, dt, children }) {
  const { capacity, maxQueue, drain, latency } = node.cfg;
  runtime.load = offered / capacity;
  const accepted = Math.min(offered, capacity) * dt;
  const stored = Math.min(accepted, Math.max(0, maxQueue - runtime.backlog));
  runtime.dropped = (offered * dt - stored) / dt;
  runtime.backlog += stored;
  const drained = Math.min(runtime.backlog, drain * dt);
  runtime.backlog -= drained;
  runtime.served = drained / dt;
  runtime.rho = Math.min(runtime.backlog / Math.max(maxQueue, 1), 1);
  runtime.waitMs = drain > 0 ? (runtime.backlog / drain) * 1000 : 0;
  runtime.lat = latency;
  runtime.status = runtime.dropped > 0 ? 'bad' : runtime.rho > QUEUE_WARN_FILL ? 'warn' : 'ok';
  return sendAll(children, runtime.served);
}

// Servers, databases, caches and LBs: finite capacity + bounded queue + dropping.
function processQueueing({ node, runtime, offered, dt, children }) {
  const { capacity, maxQueue, latency } = node.cfg;
  runtime.load = offered / capacity;
  const total = runtime.backlog + offered * dt;
  const servedAmount = Math.min(total, capacity * dt);
  const backlog = total - servedAmount;
  runtime.backlog = Math.min(backlog, maxQueue);
  runtime.dropped = (backlog - runtime.backlog) / dt;
  runtime.served = servedAmount / dt;
  runtime.rho = Math.min(runtime.served / capacity, MAX_UTILIZATION);
  runtime.waitMs = (runtime.backlog / capacity) * 1000;
  runtime.lat = latency * (1 + CONTENTION_FACTOR * runtime.rho ** 2) + runtime.waitMs;
  runtime.status = statusFor(offered > 0 ? runtime.dropped / offered : 0, runtime.load, runtime.waitMs);

  if (node.type === 'lb') return balance(node, runtime, children);
  if (isCacheLike(node)) return sendAll(children, runtime.served * (1 - node.cfg.hitRate));
  return sendAll(children, runtime.served);
}

// The LB only sees healthy backends (health check). A downed cache stays routable: it passes traffic through.
const isRoutable = (child) => child.node.up || isCacheLike(child.node);

function balance(node, runtime, children) {
  const healthy = children.filter(isRoutable);
  const weight = (child) => (node.cfg.algo === 'least' ? Math.max(MIN_LEAST_LOADED_WEIGHT, 1 - child.rho) : 1);
  const totalWeight = healthy.reduce((sum, child) => sum + weight(child), 0);
  if (totalWeight === 0) {
    if (children.length) {
      runtime.dropped += runtime.served;
      runtime.served = 0;
      runtime.status = 'bad';
    }
    return new Map();
  }
  return new Map(healthy.map((child) => [child.node.id, (runtime.served * weight(child)) / totalWeight]));
}

const PROCESSORS = {
  client: processClient,
  lb: processQueueing,
  server: processQueueing,
  cache: processQueueing,
  cdn: processQueueing,
  db: processQueueing,
  queue: processQueue,
};

export function processorFor(node) {
  return node.up || node.type === 'client' ? PROCESSORS[node.type] : processDown;
}
