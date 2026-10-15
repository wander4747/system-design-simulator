import { Simulation } from '../engine/simulation.js';
import { PRESETS } from '../presets.js';

/** Shared UI state. Mutate it only through `actions.js` so views are notified. */
export const app = {
  sim: new Simulation(PRESETS.empty.build()),
  /** @type {{ kind: 'node'|'edge', id: string } | null} */
  selected: null,
  paused: true,
  started: false,
  speed: 1,
};

export const EVENTS = {
  GRAPH: 'graph', // nodes or edges were added, removed or replaced
  SELECTION: 'selection',
  NODE: 'node', // a node's state changed (up/down, users...)
  RUN: 'run', // paused/started changed
  RESET: 'reset', // the run was restarted or a new graph was loaded
};

const listeners = new Map();

export function on(event, listener) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(listener);
}

export function emit(event) {
  for (const listener of listeners.get(event) ?? []) listener();
}

export const nodeById = (id) => app.sim.nodes.find((node) => node.id === id);
export const selectedNode = () => (app.selected?.kind === 'node' ? nodeById(app.selected.id) : undefined);
