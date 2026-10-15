import { app } from './app.js';
import { paintCanvas, initCanvas } from './canvas.js';
import { initControls } from './controls.js';
import { initInspector, paintInspectorLive } from './inspector.js';
import { initLog, logStatusChanges } from './log.js';
import { initMetrics, paintMetrics } from './metrics.js';

const TICK_S = 0.1; // simulated seconds per engine step
const MAX_FRAME_S = 0.25; // clamp long frames (e.g. background tab) so we don't simulate a huge jump
const MAX_STEPS_PER_FRAME = 40;

let pendingTime = 0;
let lastFrameAt = performance.now();

function frame(now) {
  const elapsed = Math.min((now - lastFrameAt) / 1000, MAX_FRAME_S);
  lastFrameAt = now;
  if (!app.paused) {
    pendingTime += elapsed * app.speed;
    let steps = 0;
    while (pendingTime >= TICK_S && steps < MAX_STEPS_PER_FRAME) {
      app.sim.step(TICK_S);
      pendingTime -= TICK_S;
      steps++;
    }
    if (steps) {
      logStatusChanges();
      paintMetrics();
      paintInspectorLive();
    }
  }
  paintCanvas();
  requestAnimationFrame(frame);
}

initLog();
initControls();
initInspector();
initMetrics();
initCanvas();
requestAnimationFrame(frame);
