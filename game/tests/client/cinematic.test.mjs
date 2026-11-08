// Cinematic capture (src/cinematic): the frame-stepped clock fires timers and animation frames in
// order and only when stepped; the easing and spline math is continuous and hits its endpoints; the
// camera vocabulary compiles to poses that start and end where the script says and never dip under
// the ground. No browser, no three.js scene: the pure parts only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TimerQueue, seededRandom, hashString } from '../../src/cinematic/clock.js';
import { EASES, ease, Spline, Track, envelope, catmullRom } from '../../src/cinematic/ease.js';
import { compileCamera, minHeight, maxStep } from '../../src/cinematic/camera.js';

test('clock: timers fire in time order only when stepped; intervals re-arm; frames get the new time', () => {
  const q = new TimerQueue(1000);
  const log = [];
  q.setTimeout(() => log.push('b'), 30);
  q.setTimeout(() => log.push('a'), 10);
  const iv = q.setInterval(() => log.push('i'), 25);
  q.requestAnimationFrame((t) => { log.push('f' + t); q.requestAnimationFrame(() => log.push('next')); });
  assert.deepEqual(log, [], 'nothing runs before a step');
  q.step(1000 / 60);
  assert.deepEqual(log, ['a', 'f' + (1000 + 1000 / 60)], 'the 10 ms timer and the frame; the frame registered inside waits');
  q.step(1000 / 60);
  assert.deepEqual(log.slice(2), ['i', 'b', 'next'], 'interval at 25 ms before the 30 ms timeout, then the next frame');
  q.clearTimer(iv);
  q.step(100);
  assert.equal(log.filter((x) => x === 'i').length, 1, 'a cleared interval stops');
  assert.equal(q.now, 1000 + (2000 / 60) + 100);
  const id = q.setTimeout(() => log.push('never'), 5);
  q.clearTimer(id);
  q.step(10);
  assert.ok(!log.includes('never'));
});

test('clock: a timer that re-schedules itself runs once per due time, and a 0 ms timer runs next step', () => {
  const q = new TimerQueue(0);
  let n = 0;
  const tick = () => { n++; q.setTimeout(tick, 16); };
  q.setTimeout(tick, 0);
  for (let i = 0; i < 60; i++) q.step(1000 / 60);
  assert.ok(n >= 60 && n <= 63, 'about one per frame: ' + n);
});

test('clock: seeded random is repeatable and uniform-ish; hashString is stable', () => {
  const a = seededRandom(42), b = seededRandom(42);
  const xs = Array.from({ length: 1000 }, () => a());
  assert.deepEqual(xs.slice(0, 5), Array.from({ length: 5 }, () => b()));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(Math.abs(mean - 0.5) < 0.05, 'mean ' + mean);
  assert.equal(hashString('demo'), hashString('demo'));
  assert.notEqual(hashString('demo'), hashString('trailer'));
});

test('ease: every curve maps 0→0 and 1→1 and is monotonic', () => {
  for (const [name, f] of Object.entries(EASES)) {
    assert.ok(Math.abs(f(0)) < 1e-9 && Math.abs(f(1) - 1) < 1e-9, name);
    let prev = -1;
    for (let i = 0; i <= 100; i++) { const v = f(i / 100); assert.ok(v >= prev - 1e-9, name + ' monotonic at ' + i); prev = v; }
  }
  assert.equal(ease('nope', 0.5), EASES.inOutCubic(0.5), 'unknown names fall back');
  assert.equal(ease('linear', 2), 1); assert.equal(ease('linear', -1), 0); assert.equal(ease('linear', NaN), 0);
});

test('spline: passes through its waypoints, arc-length parameter is even, two points make a line', () => {
  const s = new Spline([[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 5, 10]]);
  assert.deepEqual(s.atLength(0).map((v) => +v.toFixed(6)), [0, 0, 0]);
  assert.deepEqual(s.atLength(1).map((v) => +v.toFixed(6)), [0, 5, 10]);
  const mid = s.at(1 / 3);
  assert.deepEqual(mid.map((v) => +v.toFixed(6)), [10, 0, 0], 'segment-uniform parameter hits the second waypoint');
  // Even pacing: consecutive arc-length samples are about the same distance apart.
  const d = [];
  let prev = s.atLength(0);
  for (let i = 1; i <= 50; i++) { const p = s.atLength(i / 50); d.push(Math.hypot(...p.map((v, k) => v - prev[k]))); prev = p; }
  const avg = d.reduce((a, b) => a + b) / d.length;
  assert.ok(d.every((x) => Math.abs(x - avg) < avg * 0.25), 'step spread ' + Math.max(...d) / avg);
  const line = new Spline([[0, 0, 0], [4, 0, 0]]);
  assert.deepEqual(line.atLength(0.5).map((v) => +v.toFixed(6)), [2, 0, 0]);
  assert.deepEqual(catmullRom([0, 0], [1, 1], [2, 2], [3, 3], 0.5), [1.5, 1.5]);
});

test('track and envelope: keys interpolate with the destination ease; envelopes fade in and out', () => {
  const tr = new Track([{ t: 0, value: [0, 0, 0] }, { t: 2, value: [2, 4, 6], ease: 'linear' }, { t: 3, value: [2, 4, 6] }]);
  assert.deepEqual(tr.at(-1), [0, 0, 0]); assert.deepEqual(tr.at(9), [2, 4, 6]);
  assert.deepEqual(tr.at(1), [1, 2, 3]);
  const sc = new Track([{ t: 0, value: 10 }, { t: 1, value: 20, ease: 'linear' }]);
  assert.equal(sc.at(0.25), 12.5);
  assert.equal(envelope(0, 1, 5), 0); assert.equal(envelope(3, 1, 5), 1); assert.equal(envelope(6, 1, 5), 0);
  assert.ok(envelope(1.3, 1, 5, 0.6, 0.6) > 0 && envelope(1.3, 1, 5, 0.6, 0.6) < 1);
  assert.equal(envelope(1.0001, 1, 5, 0, 0.6), 1, 'no fade-in: full at once');
});

test('camera: orbit, dolly, crane, push and static compile to smooth poses with the scripted endpoints', () => {
  const orbit = compileCamera({ type: 'orbit', center: [0, 0, 0], radius: [70, 60], height: [30, 24], yawFrom: 60, yawTo: 100, lookHeight: 6, fov: [36, 40], ease: 'linear' });
  const a = orbit(0), b = orbit(1);
  assert.ok(Math.abs(Math.hypot(a.pos[0], a.pos[2]) - 70) < 1e-6 && a.pos[1] === 30 && a.fov === 36);
  assert.ok(Math.abs(Math.hypot(b.pos[0], b.pos[2]) - 60) < 1e-6 && b.pos[1] === 24 && b.fov === 40);
  assert.deepEqual(a.look, [0, 6, 0]);
  assert.ok(maxStep(orbit) < 0.6, 'no jumps along the orbit');
  const dolly = compileCamera({ type: 'dolly', path: [[0, 10, 60], [0, 8, 20]], look: [0, 2, 0], fov: 38 });
  assert.deepEqual(dolly(0).pos.map((v) => +v.toFixed(6)), [0, 10, 60]);
  assert.deepEqual(dolly(1).pos.map((v) => +v.toFixed(6)), [0, 8, 20]);
  assert.ok(dolly(0.5).pos[2] < 60 && dolly(0.5).pos[2] > 20);
  const ahead = compileCamera({ type: 'dolly', path: [[0, 5, 0], [10, 5, 0]], look: 'ahead' });
  assert.ok(ahead(0.5).look[0] > ahead(0.5).pos[0], 'looks along the motion');
  const crane = compileCamera({ type: 'crane', path: [[0, 0, 40], [0, 0, 30]], from: 3, to: 20, look: [0, 0, 0] });
  assert.equal(crane(0).pos[1], 3); assert.equal(crane(1).pos[1], 20);
  const push = compileCamera({ type: 'push', from: [0, 10, 30], look: [0, 2, 0], dist1: 8, ease: 'linear' });
  const d0 = Math.hypot(0, 8, 30);
  assert.ok(Math.abs(Math.hypot(...push(0).pos.map((v, i) => v - [0, 2, 0][i])) - d0) < 1e-6);
  assert.ok(Math.abs(Math.hypot(...push(1).pos.map((v, i) => v - [0, 2, 0][i])) - 8) < 1e-6);
  const still = compileCamera({ type: 'static', pos: [5, 5, 5], look: [0, 1, 0], drift: 0.2 });
  assert.ok(Math.hypot(...still(0.37).pos.map((v) => v - 5)) <= 0.2 * 1.2, 'drift stays within its radius');
  assert.equal(minHeight(crane), 3);
  assert.equal(compileCamera({ type: 'rig' }), null);
  assert.throws(() => compileCamera({ type: 'teleport' }));
});

test('camera: keyframed moves follow their tracks in shot seconds', () => {
  const keys = compileCamera({ type: 'keys', duration: 4, pos: [{ t: 0, value: [0, 1, 0] }, { t: 4, value: [4, 1, 0], ease: 'linear' }], look: [{ t: 0, value: [0, 0, -10] }], fov: [{ t: 0, value: 30 }, { t: 4, value: 50, ease: 'linear' }] });
  assert.deepEqual(keys(0.5).pos, [2, 1, 0]);
  assert.equal(keys(0.5).fov, 40);
  assert.deepEqual(keys(1).look, [0, 0, -10]);
});
