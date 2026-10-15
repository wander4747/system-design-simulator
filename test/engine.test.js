import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeNode, normalizeGraph, wouldCycle } from '../src/engine/graph.js';
import { Simulation } from '../src/engine/simulation.js';

const edge = (from, to) => ({ id: `${from}>${to}`, from, to });
const run = (sim, seconds, dt = 0.1) => {
  for (let i = 0; i < seconds / dt; i++) sim.step(dt);
};

function client(users = 500, rpsPerUser = 0.2) {
  const n = makeNode('client', 'c', 0, 0);
  n.cfg.users = users;
  n.cfg.rpsPerUser = rpsPerUser;
  return n;
}
function withCfg(type, id, cfg) {
  const n = makeNode(type, id, 0, 0);
  Object.assign(n.cfg, cfg);
  return n;
}

test('load below capacity: everything is ok and nothing is dropped', () => {
  const sim = new Simulation({
    nodes: [client(500), withCfg('server', 's', { capacity: 200 })],
    edges: [edge('c', 's')],
  });
  run(sim, 10);
  assert.equal(sim.runtime('s').status, 'ok');
  assert.ok(sim.summary.ok > 0.999);
});

test('overload: server turns red, drops requests and users see errors', () => {
  const sim = new Simulation({
    nodes: [client(5000), withCfg('server', 's', { capacity: 200 })],
    edges: [edge('c', 's')],
  });
  run(sim, 10);
  const r = sim.runtime('s');
  assert.equal(r.status, 'bad');
  assert.ok(r.dropped > 0);
  assert.ok(sim.summary.ok < 0.5);
  assert.match(sim.diagnose(sim.nodes[1]), /aguenta 200/);
});

test('load balancer splits traffic evenly across servers that are up', () => {
  const sim = new Simulation({
    nodes: [client(600), makeNode('lb', 'lb', 0, 0), makeNode('server', 'a', 0, 0), makeNode('server', 'b', 0, 0)],
    edges: [edge('c', 'lb'), edge('lb', 'a'), edge('lb', 'b')],
  });
  run(sim, 5);
  assert.ok(Math.abs(sim.runtime('a').incoming - sim.runtime('b').incoming) < 1e-6);
  assert.ok(Math.abs(sim.runtime('a').incoming - 60) < 1e-6);
});

test('load balancer redistributes traffic when a server goes down (health check)', () => {
  const nodes = [client(600), makeNode('lb', 'lb', 0, 0), makeNode('server', 'a', 0, 0), makeNode('server', 'b', 0, 0)];
  const sim = new Simulation({ nodes, edges: [edge('c', 'lb'), edge('lb', 'a'), edge('lb', 'b')] });
  nodes[3].up = false;
  run(sim, 5);
  assert.equal(sim.runtime('b').incoming, 0);
  assert.ok(Math.abs(sim.runtime('a').incoming - 120) < 1e-6);
  assert.ok(sim.summary.ok > 0.99);
});

test('least-loaded LB sends more traffic to the server with spare capacity', () => {
  const lb = makeNode('lb', 'lb', 0, 0);
  lb.cfg.algo = 'least';
  const nodes = [
    client(1500),
    lb,
    withCfg('server', 'a', { capacity: 100 }),
    withCfg('server', 'b', { capacity: 1000 }),
  ];
  const sim = new Simulation({ nodes, edges: [edge('c', 'lb'), edge('lb', 'a'), edge('lb', 'b')] });
  run(sim, 20);
  assert.ok(sim.runtime('b').incoming > sim.runtime('a').incoming);
});

test('without a load balancer, a downed server is a single point of failure', () => {
  const nodes = [client(100), makeNode('server', 's', 0, 0)];
  nodes[1].up = false;
  const sim = new Simulation({ nodes, edges: [edge('c', 's')] });
  run(sim, 2);
  assert.equal(sim.summary.ok, 0);
  assert.match(sim.diagnose(nodes[1]), /SPOF/);
});

test('all backends down: the LB returns errors', () => {
  const nodes = [client(100), makeNode('lb', 'lb', 0, 0), makeNode('server', 'a', 0, 0)];
  nodes[2].up = false;
  const sim = new Simulation({ nodes, edges: [edge('c', 'lb'), edge('lb', 'a')] });
  run(sim, 2);
  assert.equal(sim.summary.ok, 0);
});

test('cache reduces database load according to its hit rate', () => {
  const nodes = [client(1000), withCfg('cache', 'k', { hitRate: 0.9 }), withCfg('db', 'd', { capacity: 400 })];
  const sim = new Simulation({ nodes, edges: [edge('c', 'k'), edge('k', 'd')] });
  run(sim, 5);
  assert.ok(Math.abs(sim.runtime('d').incoming - 20) < 1e-6);
});

test('downed cache removes protection: the database gets everything and breaks', () => {
  const nodes = [client(3000), withCfg('cache', 'k', { hitRate: 0.9 }), withCfg('db', 'd', { capacity: 400 })];
  const sim = new Simulation({ nodes, edges: [edge('c', 'k'), edge('k', 'd')] });
  run(sim, 5);
  assert.equal(sim.runtime('d').status, 'ok');
  nodes[1].up = false;
  run(sim, 10);
  assert.equal(sim.runtime('d').status, 'bad');
});

test('queue absorbs a spike without losing messages and then drains', () => {
  const nodes = [
    client(500),
    withCfg('queue', 'q', { drain: 150, maxQueue: 20000 }),
    withCfg('server', 'w', { capacity: 200 }),
  ];
  const sim = new Simulation({ nodes, edges: [edge('c', 'q'), edge('q', 'w')] });
  sim.triggerSpike(5, 10);
  run(sim, 10);
  assert.ok(sim.runtime('q').backlog > 0);
  assert.equal(sim.runtime('q').dropped, 0);
  run(sim, 150);
  assert.ok(sim.runtime('q').backlog < 1);
});

test('temporary spike: server breaks during it and recovers afterwards', () => {
  const sim = new Simulation({
    nodes: [client(500), withCfg('server', 's', { capacity: 200 })],
    edges: [edge('c', 's')],
  });
  sim.triggerSpike(10, 5);
  run(sim, 5);
  assert.equal(sim.runtime('s').status, 'bad');
  run(sim, 20);
  assert.equal(sim.runtime('s').status, 'ok');
});

test('wouldCycle and normalizeGraph reject cycles, invalid types and absurd values', () => {
  const edges = [edge('a', 'b'), edge('b', 'c')];
  assert.ok(wouldCycle(edges, 'c', 'a'));
  assert.ok(!wouldCycle(edges, 'a', 'c'));
  const g = normalizeGraph({
    nodes: [
      { id: 'a', type: 'server', x: 1e9, y: -5, name: 'x'.repeat(100), cfg: { capacity: -10, latency: 'ruim' } },
      { id: 'b', type: 'hacker' },
      { id: 'c', type: 'db' },
      { id: '<img>', type: 'db' },
    ],
    edges: [edge('a', 'c'), edge('c', 'a'), edge('a', 'zzz')],
  });
  assert.equal(g.nodes.length, 2);
  assert.equal(g.nodes[0].x, 5000);
  assert.equal(g.nodes[0].name.length, 40);
  assert.equal(g.nodes[0].cfg.capacity, 1);
  assert.equal(g.nodes[0].cfg.latency, 40);
  assert.equal(g.edges.length, 1);
  assert.equal(normalizeGraph('lixo'), null);
});

test('abuse: tampered input (prototype keys, limits, types) is neutralized', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ id: `n${i}`, type: 'server' }));
  const g = normalizeGraph({
    nodes: [
      { id: 'ok', type: '__proto__' },
      { id: 'constructor', type: 'constructor' },
      { id: '__proto__', type: 'db', cfg: { capacity: Infinity, hitRate: 99, algo: { x: 1 } } },
      ...many,
    ],
    edges: Array.from({ length: 500 }, () => edge('n1', 'n2')),
  });
  assert.ok(g.nodes.length <= 60);
  assert.ok(g.edges.length <= 1);
  const db = g.nodes.find((n) => n.id === '__proto__');
  assert.equal(db.cfg.capacity, 400);
  assert.equal(Object.getPrototypeOf(db.cfg), Object.prototype);
  assert.equal({}.polluted, undefined);
});

test('abuse: a name containing HTML is kept as plain text (rendering uses textContent)', () => {
  const g = normalizeGraph({ nodes: [{ id: 'a', type: 'server', name: '<img src=x onerror=alert(1)>' }], edges: [] });
  assert.equal(g.nodes[0].name, '<img src=x onerror=alert(1)>');
});

test('abuse: an edge pointing into a client is rejected', () => {
  const g = normalizeGraph({
    nodes: [
      { id: 'a', type: 'server' },
      { id: 'c', type: 'client' },
    ],
    edges: [edge('a', 'c')],
  });
  assert.equal(g.edges.length, 0);
});

test('reset restores the initial state: clock, spike, metrics, queues and nodes up', () => {
  const nodes = [client(500), withCfg('server', 's', { capacity: 100 })];
  const sim = new Simulation({ nodes, edges: [edge('c', 's')] });
  sim.triggerSpike(10, 30);
  run(sim, 5);
  nodes[1].up = false;
  assert.ok(sim.summary.ok < 1 && sim.history.length > 0);
  sim.reset();
  assert.equal(sim.t, 0);
  assert.equal(sim.spike, null);
  assert.equal(sim.history.length, 0);
  assert.equal(sim.summary.ok, 1);
  assert.equal(sim.summary.rps, 0);
  assert.equal(sim.runtime('s').backlog, 0);
  assert.ok(nodes.every((n) => n.up));
});
