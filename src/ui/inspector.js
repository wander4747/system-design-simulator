import { MAX_NAME_LENGTH } from '../engine/types.js';
import { removeSelected, toggleNode } from './actions.js';
import { app, EVENTS, on, selectedNode } from './app.js';
import { byId, fmt, fmt1, h } from './dom.js';

// [setting, label, min, max, step] per node type (slider bounds are tighter than the engine's accepted ranges).
const FIELDS = {
  client: [
    ['users', 'Usuários', 0, 20000, 50],
    ['rpsPerUser', 'Req/usuário/s', 0, 5, 0.05],
  ],
  lb: [
    ['capacity', 'Capacidade (rps)', 100, 100000, 100],
    ['latency', 'Latência base (ms)', 0, 100, 1],
  ],
  server: [
    ['capacity', 'Capacidade (rps)', 10, 5000, 10],
    ['latency', 'Latência base (ms)', 1, 2000, 1],
    ['maxQueue', 'Fila máx. (req)', 0, 5000, 10],
  ],
  cache: [
    ['hitRate', 'Hit rate', 0, 1, 0.01],
    ['capacity', 'Capacidade (rps)', 100, 200000, 100],
    ['latency', 'Latência (ms)', 0, 50, 1],
  ],
  cdn: [
    ['hitRate', 'Hit rate', 0, 1, 0.01],
    ['capacity', 'Capacidade (rps)', 1000, 500000, 1000],
    ['latency', 'Latência (ms)', 0, 200, 1],
  ],
  db: [
    ['capacity', 'Capacidade (rps)', 10, 5000, 10],
    ['latency', 'Latência base (ms)', 1, 2000, 1],
    ['maxQueue', 'Fila máx. (req)', 0, 5000, 10],
  ],
  queue: [
    ['drain', 'Consumo (msg/s)', 1, 5000, 10],
    ['maxQueue', 'Tamanho máx. (msgs)', 100, 200000, 100],
    ['capacity', 'Ingestão máx. (rps)', 100, 100000, 100],
  ],
};

const LB_ALGORITHM_LABELS = [
  ['rr', 'Round robin'],
  ['least', 'Menos carregado'],
];

let liveBox = null;
let diagnosisBox = null;

function field(label, input, extra) {
  const caption = h('label', {}, h('span', { textContent: label }));
  if (extra) caption.append(extra);
  return h('div', { className: 'field' }, caption, input);
}

function nameField(node) {
  const input = h('input', { type: 'text', value: node.name, maxLength: MAX_NAME_LENGTH });
  input.addEventListener('input', () => {
    node.name = input.value.slice(0, MAX_NAME_LENGTH);
  });
  return field('Nome', input);
}

function settingField(node, [key, label, min, max, step]) {
  const readout = h('span');
  const show = () => {
    readout.textContent = key === 'hitRate' ? `${Math.round(node.cfg[key] * 100)}%` : fmt1(node.cfg[key]);
  };
  const input = h('input', { type: 'range', min, max, step, value: node.cfg[key] });
  input.addEventListener('input', () => {
    node.cfg[key] = Number(input.value);
    show();
  });
  show();
  return field(label, input, readout);
}

function algorithmField(node) {
  const select = h('select');
  select.append(...LB_ALGORITHM_LABELS.map(([value, text]) => h('option', { value, textContent: text })));
  select.value = node.cfg.algo;
  select.addEventListener('change', () => {
    node.cfg.algo = select.value;
  });
  return field('Algoritmo', select);
}

function render() {
  const box = byId('inspector');
  box.replaceChildren(h('h2', { textContent: 'Propriedades' }));
  liveBox = diagnosisBox = null;

  if (app.selected?.kind === 'edge') {
    box.append(
      h('p', { className: 'muted', textContent: `Conexão ${app.selected.id.replace('>', ' → ')}` }),
      h('button', { textContent: 'Remover conexão', onclick: removeSelected }),
    );
    return;
  }
  const node = selectedNode();
  if (!node) {
    box.append(h('p', { className: 'muted', textContent: 'Selecione um nó.' }));
    return;
  }

  box.append(nameField(node), ...FIELDS[node.type].map((spec) => settingField(node, spec)));
  if (node.type === 'lb') box.append(algorithmField(node));

  diagnosisBox = h('div', { className: 'diag', hidden: true });
  liveBox = h('div', { className: 'live' });
  const toggle = h('button', { textContent: node.up ? '💥 Derrubar' : '▶ Ligar', onclick: () => toggleNode(node) });
  const remove = h('button', { textContent: '🗑 Remover', onclick: removeSelected });
  box.append(liveBox, diagnosisBox, h('div', { className: 'actions' }, toggle, remove));
  paintInspectorLive();
}

/** Refreshes the live numbers and the diagnosis for the selected node. Cheap enough to call every tick. */
export function paintInspectorLive() {
  const node = liveBox && selectedNode();
  if (!node) return;
  const runtime = app.sim.runtime(node.id);
  const rows = [
    ['Entrada', `${fmt(runtime.incoming)} rps`],
    ['Atendido', `${fmt(runtime.served)} rps`],
    ['Descartado', `${fmt(runtime.dropped)} rps`],
    ['Fila', fmt(runtime.backlog)],
    ['Latência', `${fmt(runtime.lat)} ms`],
    ['Status', runtime.status],
  ];
  liveBox.replaceChildren(
    ...rows.map(([key, value]) => h('div', {}, h('span', { textContent: key }), h('b', { textContent: value }))),
  );
  const diagnosis = app.sim.diagnose(node);
  diagnosisBox.hidden = !diagnosis;
  diagnosisBox.textContent = diagnosis ?? '';
}

export function initInspector() {
  for (const event of [EVENTS.SELECTION, EVENTS.GRAPH, EVENTS.NODE]) on(event, render);
  render();
}
