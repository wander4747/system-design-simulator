import { makeNode, wouldCycle } from '../engine/graph.js';
import { app, emit, EVENTS, nodeById } from './app.js';
import { log } from './log.js';

const SPIKE_SECONDS = 15;
const GRID_COLUMNS = 5;
const GRID_ROWS = 5;

let nextNodeNumber = 1;

function newNodeId(type) {
  let id;
  do {
    id = `${type}${nextNodeNumber++}`;
  } while (nodeById(id));
  return id;
}

/** Places new nodes on a grid so they never stack on top of each other. */
function gridPosition(index) {
  return { x: 40 + (index % GRID_COLUMNS) * 220, y: 40 + (Math.floor(index / GRID_COLUMNS) % GRID_ROWS) * 110 };
}

export function select(selection) {
  app.selected = selection;
  emit(EVENTS.SELECTION);
}

export function addNode(type) {
  const { x, y } = gridPosition(app.sim.nodes.length);
  const node = makeNode(type, newNodeId(type), x, y);
  app.sim.nodes.push(node);
  emit(EVENTS.GRAPH);
  select({ kind: 'node', id: node.id });
}

export function connect(from, to) {
  const id = `${from}>${to}`;
  if (app.sim.edges.some((edge) => edge.id === id)) return;
  if (wouldCycle(app.sim.edges, from, to)) {
    log('Conexão ignorada: formaria um ciclo.');
    return;
  }
  app.sim.edges.push({ id, from, to });
  emit(EVENTS.GRAPH);
}

export function removeSelected() {
  const { selected, sim } = app;
  if (!selected) return;
  if (selected.kind === 'node') {
    sim.nodes = sim.nodes.filter((node) => node.id !== selected.id);
    sim.edges = sim.edges.filter((edge) => edge.from !== selected.id && edge.to !== selected.id);
  } else {
    sim.edges = sim.edges.filter((edge) => edge.id !== selected.id);
  }
  app.selected = null;
  emit(EVENTS.GRAPH);
  emit(EVENTS.SELECTION);
}

export function toggleNode(node) {
  node.up = !node.up;
  emit(EVENTS.NODE);
}

export function setPaused(paused) {
  app.paused = paused;
  if (!paused) app.started = true;
  emit(EVENTS.RUN);
}

export function setSpeed(speed) {
  app.speed = speed;
}

export function setPattern(pattern) {
  app.sim.pattern = pattern;
}

export function setUsers(users) {
  for (const node of app.sim.nodes) if (node.type === 'client') node.cfg.users = users;
  emit(EVENTS.NODE);
}

export function triggerSpike(factor) {
  app.sim.triggerSpike(factor, SPIKE_SECONDS);
  log(`Pico ×${factor} por ${SPIKE_SECONDS}s iniciado.`);
}

export function killRandomNode() {
  const alive = app.sim.nodes.filter((node) => node.up && node.type !== 'client');
  if (!alive.length) return;
  const victim = alive[Math.floor(Math.random() * alive.length)];
  victim.up = false;
  log(`Caos: ${victim.name} foi derrubado.`, 'bad');
  emit(EVENTS.NODE);
}

/** Back to the start of the current graph: stopped, t=0, everything up. */
export function restart() {
  app.sim.reset();
  app.started = false;
  app.paused = true;
  emit(EVENTS.RESET);
  emit(EVENTS.RUN);
  emit(EVENTS.NODE);
}

export function loadGraph(graph) {
  app.sim.setGraph(graph);
  app.selected = null;
  app.started = false;
  app.paused = true;
  emit(EVENTS.RESET);
  emit(EVENTS.GRAPH);
  emit(EVENTS.SELECTION);
  emit(EVENTS.RUN);
}
