import { makeNode } from './engine/graph.js';

const edge = (from, to) => ({ id: `${from}>${to}`, from, to });

function node(type, id, x, y, name, cfg = {}) {
  const n = makeNode(type, id, x, y, name);
  Object.assign(n.cfg, cfg);
  return n;
}

export const PRESETS = {
  empty: { label: 'Canvas vazio', build: () => ({ nodes: [], edges: [] }) },
  basic: {
    label: 'Read user: cliente → servidor → banco',
    build: () => ({
      nodes: [
        node('client', 'c', 40, 220, 'Usuários', { users: 500, rpsPerUser: 0.2 }),
        node('server', 'api', 300, 220, 'API read-user', { capacity: 200 }),
        node('db', 'db', 560, 220, 'Postgres', { capacity: 150 }),
      ],
      edges: [edge('c', 'api'), edge('api', 'db')],
    }),
  },
  lb: {
    label: 'Com Load Balancer e 3 servidores',
    build: () => ({
      nodes: [
        node('client', 'c', 30, 230, 'Usuários', { users: 1000, rpsPerUser: 0.2 }),
        node('lb', 'lb', 250, 230, 'Load Balancer'),
        node('server', 'a1', 500, 90, 'API 1', { capacity: 120 }),
        node('server', 'a2', 500, 230, 'API 2', { capacity: 120 }),
        node('server', 'a3', 500, 370, 'API 3', { capacity: 120 }),
        node('db', 'db', 760, 230, 'Postgres', { capacity: 300 }),
      ],
      edges: [
        edge('c', 'lb'),
        edge('lb', 'a1'),
        edge('lb', 'a2'),
        edge('lb', 'a3'),
        edge('a1', 'db'),
        edge('a2', 'db'),
        edge('a3', 'db'),
      ],
    }),
  },
  cache: {
    label: 'LB + servidores + cache + banco',
    build: () => ({
      nodes: [
        node('client', 'c', 20, 230, 'Usuários', { users: 1500, rpsPerUser: 0.2 }),
        node('lb', 'lb', 210, 230, 'Load Balancer'),
        node('server', 'a1', 420, 130, 'API 1', { capacity: 200 }),
        node('server', 'a2', 420, 330, 'API 2', { capacity: 200 }),
        node('cache', 'k', 640, 230, 'Redis', { hitRate: 0.85 }),
        node('db', 'db', 860, 230, 'Postgres', { capacity: 100 }),
      ],
      edges: [edge('c', 'lb'), edge('lb', 'a1'), edge('lb', 'a2'), edge('a1', 'k'), edge('a2', 'k'), edge('k', 'db')],
    }),
  },
  queue: {
    label: 'Escrita assíncrona com fila',
    build: () => ({
      nodes: [
        node('client', 'c', 20, 230, 'Usuários', { users: 800, rpsPerUser: 0.2 }),
        node('lb', 'lb', 210, 230, 'Load Balancer'),
        node('server', 'a1', 420, 130, 'API 1', { capacity: 300 }),
        node('server', 'a2', 420, 330, 'API 2', { capacity: 300 }),
        node('queue', 'q', 640, 230, 'Kafka', { drain: 120 }),
        node('server', 'w', 850, 230, 'Worker', { capacity: 150 }),
        node('db', 'db', 1060, 230, 'Postgres', { capacity: 200 }),
      ],
      edges: [
        edge('c', 'lb'),
        edge('lb', 'a1'),
        edge('lb', 'a2'),
        edge('a1', 'q'),
        edge('a2', 'q'),
        edge('q', 'w'),
        edge('w', 'db'),
      ],
    }),
  },
};
