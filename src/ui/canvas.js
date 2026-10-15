import { app, EVENTS, nodeById, on } from './app.js';
import { byId, fmt, svg } from './dom.js';
import { ICONS } from './node-meta.js';
import { connect, removeSelected, select } from './actions.js';

const NODE_W = 170;
const NODE_H = 74;
const CANVAS_W = 1400;
const CANVAS_H = 640;
const BAR_W = NODE_W - 24;
const MIN_VISIBLE_FLOW = 0.5;
const MAX_FLOW_STROKE = 6;
const MAX_DASH_SPEED = 4;
const TEXT_INPUT_TAGS = ['INPUT', 'SELECT', 'TEXTAREA'];

const canvas = byId('canvas');
const nodeViews = new Map();
const edgeViews = new Map();
let ghostLink = null;
/** @type {{ type: 'move', node: object, dx: number, dy: number } | { type: 'connect', node: object } | null} */
let drag = null;

const pointerPosition = (event) => {
  const box = canvas.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
};

// ---------- construction ----------

function buildDefs() {
  const defs = svg('defs', {}, canvas);
  const arrow = svg(
    'marker',
    {
      id: 'arrow',
      viewBox: '0 0 10 10',
      refX: 9,
      refY: 5,
      markerWidth: 7,
      markerHeight: 7,
      orient: 'auto-start-reverse',
    },
    defs,
  );
  svg('path', { d: 'M0 0 L10 5 L0 10 z', fill: '#3b4a75' }, arrow);
}

function buildEdge(edge, layer) {
  const group = svg('g', {}, layer);
  const path = svg('path', { class: 'edge', 'marker-end': 'url(#arrow)' }, group);
  const hit = svg('path', { class: 'edgehit' }, group);
  const label = svg('text', { class: 'edgelabel', 'text-anchor': 'middle' }, group);
  hit.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    select({ kind: 'edge', id: edge.id });
  });
  edgeViews.set(edge.id, { path, hit, label, dashOffset: 0 });
}

function buildNode(node, layer) {
  const group = svg('g', { class: 'node' }, layer);
  svg('rect', { class: 'body', width: NODE_W, height: NODE_H, rx: 10 }, group);
  svg('text', { x: 12, y: 24, 'font-size': 18 }, group).textContent = ICONS[node.type];
  const name = svg('text', { class: 'name', x: 38, y: 24 }, group);
  const sub = svg('text', { class: 'sub', x: 12, y: 46 }, group);
  svg('rect', { class: 'barbg', x: 12, y: 56, width: BAR_W, height: 8, rx: 4 }, group);
  const bar = svg('rect', { class: 'bar', x: 12, y: 56, width: 0, height: 8, rx: 4 }, group);
  if (node.type !== 'client') svg('circle', { class: 'port', cx: 0, cy: NODE_H / 2, r: 6 }, group);
  const outPort = svg('circle', { class: 'port', cx: NODE_W, cy: NODE_H / 2, r: 7 }, group);
  group.addEventListener('pointerdown', (event) => startMove(event, node));
  outPort.addEventListener('pointerdown', (event) => startConnect(event, node));
  nodeViews.set(node.id, { group, name, sub, bar });
}

function rebuild() {
  canvas.replaceChildren();
  nodeViews.clear();
  edgeViews.clear();
  buildDefs();
  const edgeLayer = svg('g', {}, canvas);
  const nodeLayer = svg('g', {}, canvas);
  ghostLink = svg('path', { class: 'ghost', d: '', display: 'none' }, canvas);
  for (const edge of app.sim.edges) buildEdge(edge, edgeLayer);
  for (const node of app.sim.nodes) buildNode(node, nodeLayer);
  paintCanvas();
}

// ---------- interaction ----------

function startMove(event, node) {
  event.stopPropagation();
  select({ kind: 'node', id: node.id });
  const { x, y } = pointerPosition(event);
  drag = { type: 'move', node, dx: x - node.x, dy: y - node.y };
  canvas.setPointerCapture(event.pointerId);
}

function startConnect(event, node) {
  event.stopPropagation();
  drag = { type: 'connect', node };
  canvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (!drag) return;
  const { x, y } = pointerPosition(event);
  if (drag.type === 'move') {
    drag.node.x = Math.max(0, Math.min(CANVAS_W - NODE_W, x - drag.dx));
    drag.node.y = Math.max(0, Math.min(CANVAS_H - NODE_H, y - drag.dy));
    paintGeometry();
    return;
  }
  ghostLink.setAttribute('d', `M${drag.node.x + NODE_W} ${drag.node.y + NODE_H / 2} L${x} ${y}`);
  ghostLink.removeAttribute('display');
}

function onPointerUp(event) {
  if (!drag) return;
  if (drag.type === 'connect') {
    const { x, y } = pointerPosition(event);
    const target = app.sim.nodes.find(
      (node) =>
        node !== drag.node &&
        node.type !== 'client' &&
        x >= node.x &&
        x <= node.x + NODE_W &&
        y >= node.y &&
        y <= node.y + NODE_H,
    );
    if (target) connect(drag.node.id, target.id);
    ghostLink?.setAttribute('display', 'none');
  }
  drag = null;
}

function onKeyDown(event) {
  if (TEXT_INPUT_TAGS.includes(document.activeElement?.tagName)) return;
  if (event.key === 'Delete' || event.key === 'Backspace') removeSelected();
}

// ---------- painting ----------

function edgeGeometry(edge) {
  const from = nodeById(edge.from);
  const to = nodeById(edge.to);
  const x1 = from.x + NODE_W,
    y1 = from.y + NODE_H / 2,
    x2 = to.x,
    y2 = to.y + NODE_H / 2;
  const curve = Math.max(40, Math.abs(x2 - x1) / 2);
  return {
    d: `M${x1} ${y1} C${x1 + curve} ${y1} ${x2 - curve} ${y2} ${x2} ${y2}`,
    labelX: (x1 + x2) / 2,
    labelY: (y1 + y2) / 2 - 6,
  };
}

function paintGeometry() {
  for (const node of app.sim.nodes) {
    nodeViews.get(node.id)?.group.setAttribute('transform', `translate(${node.x} ${node.y})`);
  }
  for (const edge of app.sim.edges) {
    const view = edgeViews.get(edge.id);
    if (!view) continue;
    const { d, labelX, labelY } = edgeGeometry(edge);
    view.path.setAttribute('d', d);
    view.hit.setAttribute('d', d);
    view.label.setAttribute('x', labelX);
    view.label.setAttribute('y', labelY);
  }
}

function nodeSubtitle(node, runtime) {
  if (!node.up) return 'FORA DO AR';
  if (node.type === 'client') return `${fmt(runtime.incoming)} rps`;
  if (node.type === 'queue') return `fila ${fmt(runtime.backlog)} · ${fmt(runtime.incoming)} rps`;
  return `${fmt(runtime.incoming)} / ${fmt(node.cfg.capacity)} rps`;
}

const isSelected = (kind, id) => app.selected?.kind === kind && app.selected.id === id;

function paintNodes() {
  for (const node of app.sim.nodes) {
    const view = nodeViews.get(node.id);
    if (!view) continue;
    const runtime = app.sim.runtime(node.id);
    view.name.textContent = node.name;
    view.sub.textContent = nodeSubtitle(node, runtime);
    const fill = node.type === 'queue' ? runtime.rho : Math.min(runtime.load, 1);
    const showBar = node.up && node.type !== 'client';
    view.bar.setAttribute('width', Math.max(0, BAR_W * (showBar ? fill : 0)));
    view.group.setAttribute('class', `node s-${runtime.status}${isSelected('node', node.id) ? ' selected' : ''}`);
  }
}

function paintEdges() {
  for (const edge of app.sim.edges) {
    const view = edgeViews.get(edge.id);
    if (!view) continue;
    const flow = app.sim.flow.get(edge.id) ?? 0;
    const flowing = flow > MIN_VISIBLE_FLOW;
    const targetStatus = app.sim.runtime(edge.to).status;
    const hot = flowing && (targetStatus === 'bad' || targetStatus === 'down');
    const classes = ['edge', flowing && 'flow', hot && 'hot', isSelected('edge', edge.id) && 'selected'];
    view.path.setAttribute('class', classes.filter(Boolean).join(' '));
    view.path.setAttribute('stroke-width', String(Math.min(2 + Math.log10(1 + flow), MAX_FLOW_STROKE)));
    if (flowing && !app.paused) {
      view.dashOffset -= Math.min(0.6 + Math.log10(1 + flow) * 0.8, MAX_DASH_SPEED);
      view.path.setAttribute('stroke-dashoffset', String(view.dashOffset));
    }
    view.label.textContent = flowing ? `${fmt(flow)} rps` : '';
  }
}

export function paintCanvas() {
  paintGeometry();
  paintNodes();
  paintEdges();
}

export function initCanvas() {
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerdown', () => select(null));
  document.addEventListener('keydown', onKeyDown);
  on(EVENTS.GRAPH, rebuild);
  on(EVENTS.SELECTION, paintCanvas);
  rebuild();
}
