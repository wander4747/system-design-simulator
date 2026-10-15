import { ownOutcome } from './processors.js';
import { isCacheLike } from './types.js';

/**
 * Walks the graph from the leaves back to the sources and sets `ok` (success probability) and
 * `lat` (latency) on every runtime, as seen by the caller of that node.
 */
export function resolvePaths({ nodes, order, outEdges, runtimes, flow }) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  for (const id of [...order].reverse()) {
    const node = nodesById.get(id);
    const runtime = runtimes.get(id);
    const deps = outEdges.get(id).map((edge) => ({ runtime: runtimes.get(edge.to), flow: flow.get(edge.id) ?? 0 }));
    const own = ownOutcome(node, runtime);
    // Calls to every dependency, one after another: all must succeed and latencies add up.
    const sequence = () => ({
      ok: deps.reduce((product, dep) => product * dep.runtime.ok, 1),
      lat: deps.reduce((sum, dep) => sum + dep.runtime.lat, 0),
    });

    if (node.type === 'queue') {
      runtime.ok = own.ok; // consumption is asynchronous: not part of the synchronous path
    } else if (node.type === 'lb') {
      const total = deps.reduce((sum, dep) => sum + dep.flow, 0);
      const hasBackends = total > 0;
      const weighted = (pick) => deps.reduce((sum, dep) => sum + (dep.flow / total) * pick(dep.runtime), 0);
      runtime.ok = deps.length ? own.ok * (hasBackends ? weighted((r) => r.ok) : 0) : own.ok;
      runtime.lat = own.lat + (hasBackends ? weighted((r) => r.lat) : 0);
    } else if (isCacheLike(node) && deps.length) {
      const hitRate = runtime.passthrough ? 0 : node.cfg.hitRate;
      const origin = sequence();
      runtime.ok = own.ok * (hitRate + (1 - hitRate) * origin.ok);
      runtime.lat = own.lat + (1 - hitRate) * origin.lat;
    } else {
      const chain = sequence();
      runtime.ok = own.ok * chain.ok;
      runtime.lat = own.lat + chain.lat;
    }
  }
}
