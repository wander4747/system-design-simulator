import { app, EVENTS, on } from './app.js';
import { byId, h } from './dom.js';

const MAX_ENTRIES = 60;
const lastStatus = new Map();

export function log(message, level = 'warn') {
  const list = byId('log');
  list.prepend(h('li', { className: level, textContent: `[${Math.floor(app.sim.t)}s] ${message}` }));
  while (list.children.length > MAX_ENTRIES) list.lastChild.remove();
}

/** Logs every node whose status changed since the last call (the "where it broke" feed). */
export function logStatusChanges() {
  for (const node of app.sim.nodes) {
    const { status } = app.sim.runtime(node.id);
    const previous = lastStatus.get(node.id);
    if (previous === status) continue;
    lastStatus.set(node.id, status);
    if (previous === undefined && status === 'ok') continue;
    if (status === 'ok') log(`${node.name} voltou ao normal.`, 'ok');
    else log(app.sim.diagnose(node) ?? `${node.name}: ${status}`, status === 'warn' ? 'warn' : 'bad');
  }
}

export function initLog() {
  on(EVENTS.RESET, () => {
    lastStatus.clear();
    byId('log').replaceChildren();
  });
}
