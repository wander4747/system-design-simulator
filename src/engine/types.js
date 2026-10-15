/**
 * @typedef {'client'|'lb'|'server'|'cache'|'cdn'|'db'|'queue'} NodeType
 * @typedef {'ok'|'warn'|'bad'|'down'} Status
 *
 * @typedef {object} GraphNode
 * @property {string} id
 * @property {NodeType} type
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {boolean} up
 * @property {Record<string, number|string>} cfg  Per-type settings, see TYPES[type].defaults.
 *
 * @typedef {{ id: string, from: string, to: string }} GraphEdge
 * @typedef {{ nodes: GraphNode[], edges: GraphEdge[] }} Graph
 *
 * @typedef {object} NodeRuntime  Per-tick state of a node. Rates are in requests per second.
 * @property {number} incoming     Offered load.
 * @property {number} served       Processed (or, for queues, drained) rate.
 * @property {number} dropped      Rejected rate.
 * @property {number} backlog      Requests waiting in the node's queue.
 * @property {number} load         incoming / capacity (may exceed 1).
 * @property {number} rho          Utilization used for latency, capped below 1.
 * @property {number} lat          Latency in ms, including queue wait.
 * @property {number} ok           Success probability seen by a caller, including dependencies.
 * @property {Status} status
 * @property {number} waitMs       Time a request spends in the queue.
 * @property {boolean} passthrough A downed cache forwarding everything to its origin.
 */

export const MAX_NAME_LENGTH = 40;

/** Default display name and settings for each node type. */
export const TYPES = {
  client: { label: 'Usuários', defaults: { users: 500, rpsPerUser: 0.2 } },
  lb: { label: 'Load Balancer', defaults: { capacity: 20000, latency: 1, maxQueue: 500, algo: 'rr' } },
  server: { label: 'Servidor', defaults: { capacity: 200, latency: 40, maxQueue: 200 } },
  cache: { label: 'Cache', defaults: { capacity: 20000, latency: 1, maxQueue: 2000, hitRate: 0.8 } },
  cdn: { label: 'CDN', defaults: { capacity: 100000, latency: 5, maxQueue: 5000, hitRate: 0.9 } },
  db: { label: 'Banco de dados', defaults: { capacity: 400, latency: 15, maxQueue: 200 } },
  queue: { label: 'Fila', defaults: { capacity: 5000, latency: 2, maxQueue: 20000, drain: 150 } },
};

/** Accepted [min, max] for each numeric setting; used when sanitizing imported graphs. */
export const RANGES = {
  users: [0, 1e7],
  rpsPerUser: [0, 100],
  capacity: [1, 1e7],
  latency: [0, 60000],
  maxQueue: [0, 1e7],
  hitRate: [0, 1],
  drain: [0, 1e7],
};

export const LB_ALGORITHMS = ['rr', 'least'];

export const isCacheLike = (node) => node.type === 'cache' || node.type === 'cdn';
