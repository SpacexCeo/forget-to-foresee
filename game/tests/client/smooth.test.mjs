// Motion smoothness: the client's frame loop (fixed 30 Hz physics + render interpolation) must give
// even per-frame motion at any frame rate, no backward steps, smooth start/stop, and Shift = run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld, fixedSteps } from '../../src/physics/collision.js';
import { CharacterController, PHYSICS_DT } from '../../src/physics/character.js';

function world() {
  const w = new CollisionWorld();
  w.addTriangles('floor', [-200, 0, -200, -200, 0, 200, 200, 0, 200, -200, 0, -200, 200, 0, 200, 200, 0, -200]);
  return w;
}

/** Runs the main.js loop for `seconds` with frame times from `frameDt(i)`; returns rendered x per frame. */
function run({ frameDt, seconds = 4, run: running = false, stopAt = Infinity }) {
  const ch = new CharacterController(world(), { spawn: [0, 0, 0], walkSpeed: 1.7 });
  ch.smooth = true; ch.run = running;
  let acc = 0, t = 0; const xs = [], dts = [];
  for (let i = 0; t < seconds; i++) {
    const dt = frameDt(i); t += dt;
    const f = fixedSteps(acc, dt, PHYSICS_DT, 8); acc = f.accumulator;
    for (let s = 0; s < f.steps; s++) ch.step(t < stopAt ? [1, 0] : [0, 0], PHYSICS_DT);
    xs.push(ch.renderPos(f.alpha)[0]); dts.push(dt);
  }
  return { xs, dts, ch };
}

for (const [name, fdt] of [['60 fps', () => 1 / 60], ['144 fps', () => 1 / 144], ['jittered 45-75 fps', (i) => 1 / (60 + 15 * Math.sin(i * 1.7))]]) {
  test(`smooth walk at ${name}: per-frame speed stays even and never goes backward`, () => {
    const { xs, dts } = run({ frameDt: fdt });
    const n = xs.length, speeds = [];
    for (let i = Math.floor(n / 2); i < n; i++) speeds.push((xs[i] - xs[i - 1]) / dts[i]); // steady state
    for (const v of speeds) assert.ok(v >= 0, 'no backward step');
    const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    assert.ok(Math.abs(mean - 1.7) < 0.05, `walk speed ${mean.toFixed(3)}`);
    const worst = Math.max(...speeds.map((v) => Math.abs(v - mean)));
    assert.ok(worst < 0.08 * mean, `frame speed varies by ${(worst / mean * 100).toFixed(1)}% (jitter)`);
  });
}

test('start and stop are smooth (no instant full speed, no instant halt)', () => {
  const { xs, dts } = run({ frameDt: () => 1 / 60, seconds: 3, stopAt: 1.5 });
  const v = xs.slice(1).map((x, i) => (x - xs[i]) / dts[i + 1]);
  const maxStep = Math.max(...v.slice(1).map((s, i) => Math.abs(s - v[i])));
  assert.ok(maxStep < 0.45, `largest frame-to-frame speed change ${maxStep.toFixed(3)} m/s`);
  assert.ok(v[v.length - 1] < 0.01, 'comes to rest');
});

test('Shift runs at about 2.1x walk speed, still smooth', () => {
  const { xs, dts } = run({ frameDt: () => 1 / 60, run: true });
  const n = xs.length, speeds = [];
  for (let i = Math.floor(n / 2); i < n; i++) speeds.push((xs[i] - xs[i - 1]) / dts[i]);
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  assert.ok(Math.abs(mean - 1.7 * 2.1) < 0.1, `run speed ${mean.toFixed(3)}`);
  assert.ok(Math.max(...speeds.map((s) => Math.abs(s - mean))) < 0.08 * mean);
});
