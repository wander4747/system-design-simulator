import { app, EVENTS, on } from './app.js';
import { byId, fmt, fmt1 } from './dom.js';

const OK_WARN_BELOW = 0.99;
const OK_BAD_BELOW = 0.9;
const LATENCY_WARN_MS = 300;
const LATENCY_BAD_MS = 1000;

const CHARTS = [
  { canvasId: 'chLat', color: '#60a5fa', minScale: 100, pick: (sample) => sample.lat },
  { canvasId: 'chErr', color: '#f87171', minScale: 5, pick: (sample) => (1 - sample.ok) * 100 },
  { canvasId: 'chRps', color: '#34d399', minScale: 10, pick: (sample) => sample.rps },
];

function drawSeries(canvas, values, color, minScale) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  if (values.length < 2) return;
  const max = Math.max(minScale, ...values);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - 4 - (value / max) * (height - 12);
    if (index) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = '#8a96b4';
  ctx.font = '11px system-ui';
  ctx.fillText(fmt(max), 4, 11);
}

function setKpi(id, text, level = '') {
  const element = byId(id);
  element.textContent = text;
  element.className = level;
}

export function paintMetrics() {
  const { rps, ok, lat, p99 } = app.sim.summary;
  setKpi('kRps', fmt(rps));
  setKpi('kOk', `${fmt1(ok * 100)}%`, ok < OK_BAD_BELOW ? 'bad' : ok < OK_WARN_BELOW ? 'warn' : '');
  setKpi('kLat', `${fmt(lat)} ms`, lat > LATENCY_BAD_MS ? 'bad' : lat > LATENCY_WARN_MS ? 'warn' : '');
  setKpi('kP99', `${fmt(p99)} ms`);
  for (const { canvasId, color, minScale, pick } of CHARTS) {
    drawSeries(byId(canvasId), app.sim.history.map(pick), color, minScale);
  }
}

export function initMetrics() {
  on(EVENTS.RESET, paintMetrics);
  paintMetrics();
}
