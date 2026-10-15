import { clamp } from './math.js';
import { LB_ALGORITHMS, MAX_NAME_LENGTH, RANGES, TYPES } from './types.js';

const MAX_NODES = 60;
const MAX_EDGES = 200;
const MAX_COORDINATE = 5000;
const NODE_ID_PATTERN = /^[\w-]{1,40}$/;

/** @returns {import('./types.js').GraphNode} */
export function makeNode(type, id, x, y, name) {
  return { id, type, name: name ?? TYPES[type].label, x, y, up: true, cfg: { ...TYPES[type].defaults } };
}

/** True if adding `from -> to` would create a cycle (or a self-loop). */
export function wouldCycle(edges, from, to) {
  if (from === to) return true;
  const seen = new Set();
  const stack = [to];
  while (stack.length) {
    const current = stack.pop();
    if (current === from) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) if (edge.from === current) stack.push(edge.to);
  }
  return false;
}

/** Kahn's algorithm: node ids ordered so every edge goes from an earlier to a later id. */
export function topoOrder(nodes, edges) {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) indegree.set(edge.to, indegree.get(edge.to) + 1);
  const ready = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const edge of edges) {
      if (edge.from !== id) continue;
      indegree.set(edge.to, indegree.get(edge.to) - 1);
      if (indegree.get(edge.to) === 0) ready.push(edge.to);
    }
  }
  return order;
}

function sanitizeNode(raw) {
  if (!raw || typeof raw.id !== 'string' || !NODE_ID_PATTERN.test(raw.id)) return null;
  if (!Object.hasOwn(TYPES, raw.type)) return null;
  const name = typeof raw.name === 'string' ? raw.name.slice(0, MAX_NAME_LENGTH) : undefined;
  const node = makeNode(
    raw.type,
    raw.id,
    clamp(Number(raw.x) || 0, 0, MAX_COORDINATE),
    clamp(Number(raw.y) || 0, 0, MAX_COORDINATE),
    name,
  );
  node.up = raw.up !== false;
  for (const key of Object.keys(node.cfg)) {
    const value = raw.cfg?.[key];
    if (key === 'algo') node.cfg.algo = LB_ALGORITHMS.includes(value) ? value : 'rr';
    else if (Number.isFinite(value)) node.cfg[key] = clamp(value, ...RANGES[key]);
  }
  return node;
}

/** Validates and sanitizes a graph coming from outside (imports, shared links). Returns null if invalid. */
export function normalizeGraph(raw) {
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;

  const nodes = [];
  const typeById = new Map();
  for (const candidate of raw.nodes.slice(0, MAX_NODES)) {
    const node = sanitizeNode(candidate);
    if (!node || typeById.has(node.id)) continue;
    typeById.set(node.id, node.type);
    nodes.push(node);
  }

  const edges = [];
  const seenIds = new Set();
  for (const edge of raw.edges.slice(0, MAX_EDGES)) {
    if (!edge || !typeById.has(edge.from) || !typeById.has(edge.to)) continue;
    const id = `${edge.from}>${edge.to}`;
    const invalid = seenIds.has(id) || typeById.get(edge.to) === 'client' || wouldCycle(edges, edge.from, edge.to);
    if (invalid) continue;
    seenIds.add(id);
    edges.push({ id, from: edge.from, to: edge.to });
  }
  return { nodes, edges };
}
