import { TYPES } from '../engine/types.js';
import { PRESETS } from '../presets.js';
import {
  addNode,
  killRandomNode,
  loadGraph,
  restart,
  setPattern,
  setPaused,
  setSpeed,
  setUsers,
  triggerSpike,
} from './actions.js';
import { app, EVENTS, on } from './app.js';
import { byId, fmt, h } from './dom.js';
import { ICONS } from './node-meta.js';

function setupPalette() {
  const palette = byId('palette');
  for (const [type, { label }] of Object.entries(TYPES)) {
    palette.append(
      h('button', { type: 'button', textContent: `${ICONS[type]} ${label}`, onclick: () => addNode(type) }),
    );
  }
}

function setupPresets() {
  const select = byId('preset');
  select.append(...Object.entries(PRESETS).map(([value, { label }]) => h('option', { value, textContent: label })));
  select.addEventListener('change', () => loadGraph(PRESETS[select.value].build()));
}

function setupUsersSlider() {
  const slider = byId('users');
  slider.addEventListener('input', () => {
    byId('usersOut').textContent = fmt(Number(slider.value));
    setUsers(Number(slider.value));
  });
  // Keep the slider in sync with the first client whenever a graph is loaded.
  on(EVENTS.RESET, () => {
    const client = app.sim.nodes.find((node) => node.type === 'client');
    if (!client) return;
    slider.value = client.cfg.users;
    byId('usersOut').textContent = fmt(client.cfg.users);
  });
}

function playLabel() {
  if (!app.paused) return '⏸ Pausar';
  return app.started ? '▶ Continuar' : '▶ Iniciar';
}

export function initControls() {
  setupPalette();
  setupPresets();
  setupUsersSlider();
  byId('play').addEventListener('click', () => setPaused(!app.paused));
  byId('speed').addEventListener('change', (event) => setSpeed(Number(event.target.value)));
  byId('reset').addEventListener('click', restart);
  byId('pattern').addEventListener('change', (event) => setPattern(event.target.value));
  byId('spike3').addEventListener('click', () => triggerSpike(3));
  byId('spike10').addEventListener('click', () => triggerSpike(10));
  byId('chaos').addEventListener('click', killRandomNode);
  on(EVENTS.RUN, () => {
    byId('play').textContent = playLabel();
  });
  byId('play').textContent = playLabel();
}
