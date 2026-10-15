import { diagnoseNode } from './diagnose.js';
import { topoOrder } from './graph.js';
import { resolvePaths } from './paths.js';
import { processorFor } from './processors.js';
import { createSpike, offeredLoad, trafficMultiplier } from './traffic.js';

const SAMPLE_EVERY_S = 0.5;
const HISTORY_LENGTH = 240;
const P99_SATURATION_FACTOR = 2; // p99 ~ mean * (1 + factor * worstUtilization^2)

const emptySummary = () => ({ rps: 0, ok: 1, lat: 0, p99: 0 });

/** @returns {import('./types.js').NodeRuntime} */
function createRuntime() {
  return {
    incoming: 0,
    served: 0,
    dropped: 0,
    backlog: 0,
    load: 0,
    rho: 0,
    lat: 0,
    ok: 1,
    status: 'ok',
    waitMs: 0,
    passthrough: false,
  };
}

/**
 * Fluid-model simulation of a graph. Call `step(dt)` repeatedly; read per-node state with
 * `runtime(id)`, per-edge traffic from `flow`, and end-to-end figures from `summary`/`history`.
 */
export class Simulation {
  /** @type {import('./types.js').GraphNode[]} */ nodes;
  /** @type {import('./types.js').GraphEdge[]} */ edges;
  /** Edge id -> rps sent during the last tick. */
  flow = new Map();
  t = 0;
  pattern = 'steady';
  spike = null;
  history = [];
  summary = emptySummary();

  #runtimes = new Map();
  #lastSampleAt = 0;

  constructor(graph) {
    this.nodes = graph?.nodes ?? [];
    this.edges = graph?.edges ?? [];
  }

  /** Node runtime state, created on demand so nodes can be drawn before the first tick. */
  runtime(id) {
    if (!this.#runtimes.has(id)) this.#runtimes.set(id, createRuntime());
    return this.#runtimes.get(id);
  }

  setGraph(graph) {
    this.nodes = graph.nodes;
    this.edges = graph.edges;
    this.reset();
  }

  /** Back to t=0 with every node up and all queues empty. */
  reset() {
    this.#runtimes.clear();
    this.flow.clear();
    this.t = 0;
    this.spike = null;
    this.history = [];
    this.summary = emptySummary();
    this.#lastSampleAt = 0;
    for (const node of this.nodes) node.up = true;
  }

  triggerSpike(factor, seconds) {
    this.spike = createSpike(factor, this.t, seconds);
  }

  diagnose(node) {
    return diagnoseNode(node, this.runtime(node.id));
  }

  step(dt) {
    this.t += dt;
    const nodesById = new Map(this.nodes.map((node) => [node.id, node]));
    for (const id of [...this.#runtimes.keys()]) if (!nodesById.has(id)) this.#runtimes.delete(id);

    const order = topoOrder(this.nodes, this.edges);
    const outEdges = new Map(this.nodes.map((node) => [node.id, []]));
    for (const edge of this.edges) outEdges.get(edge.from)?.push(edge);
    const inflow = new Map(this.nodes.map((node) => [node.id, 0]));
    const multiplier = trafficMultiplier(this.pattern, this.t, this.spike);
    this.flow.clear();

    for (const id of order) {
      const node = nodesById.get(id);
      const runtime = this.runtime(id);
      const edges = outEdges.get(id);
      const offered = offeredLoad(node, inflow.get(id), multiplier);
      runtime.incoming = offered;
      runtime.passthrough = false;
      const children = edges.map((edge) => ({ node: nodesById.get(edge.to), rho: this.runtime(edge.to).rho }));
      const shares = processorFor(node)({ node, runtime, offered, dt, children });
      for (const edge of edges) {
        const amount = shares.get(edge.to) ?? 0;
        this.flow.set(edge.id, amount);
        inflow.set(edge.to, inflow.get(edge.to) + amount);
      }
    }

    resolvePaths({ nodes: this.nodes, order, outEdges, runtimes: this.#runtimes, flow: this.flow });
    this.#updateSummary();
  }

  #updateSummary() {
    let rps = 0,
      okWeighted = 0,
      latWeighted = 0,
      worstRho = 0;
    for (const node of this.nodes) {
      const runtime = this.runtime(node.id);
      if (node.type === 'client') {
        rps += runtime.incoming;
        okWeighted += runtime.incoming * runtime.ok;
        latWeighted += runtime.incoming * runtime.lat;
      } else if (node.up) {
        worstRho = Math.max(worstRho, runtime.rho);
      }
    }
    const lat = rps > 0 ? latWeighted / rps : 0;
    this.summary = {
      rps,
      ok: rps > 0 ? okWeighted / rps : 1,
      lat,
      p99: lat * (1 + P99_SATURATION_FACTOR * worstRho ** 2),
    };
    if (this.t - this.#lastSampleAt >= SAMPLE_EVERY_S) {
      this.#lastSampleAt = this.t;
      this.history.push({ t: this.t, ...this.summary });
      if (this.history.length > HISTORY_LENGTH) this.history.shift();
    }
  }
}
