// The lab prologue's data and clock (cinematic/prologue): shots tile the 38 s, cues fire once and in order, a skip
// lands within 1.2 s, reduced motion is shorter and calmer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHOTS, CUES, PROLOGUE_S, SKIP_S, REDUCED_S, cameraAt, irisAt, shotAt, reducedTime, IRIS_PATH } from '../../src/cinematic/prologue/shots.js';
import { createTimeline } from '../../src/cinematic/prologue/timeline.js';

test('the shots tile 0..38 s without gaps; the cues are in order and inside the film', () => {
  assert.equal(SHOTS[0].t0, 0); assert.equal(SHOTS[SHOTS.length - 1].t1, PROLOGUE_S);
  for (let i = 1; i < SHOTS.length; i++) assert.equal(SHOTS[i].t0, SHOTS[i - 1].t1);
  for (let i = 1; i < CUES.length; i++) assert.ok(CUES[i].t > CUES[i - 1].t);
  assert.deepEqual(CUES.map((c) => c.id), ['title', 'year', 'check', 'key_press', 'device_on', 'oh_no', 'vortex_start', 'tunnel', 'whiteout']);
  assert.equal(CUES.find((c) => c.id === 'oh_no').t, 24.3);
  assert.equal(shotAt(24.3).id, 'P8'); assert.equal(shotAt(99).id, 'P11');
});

test('the camera interpolates inside a shot; reduced motion has no shake, no roll, no dolly zoom', () => {
  const a = cameraAt(26.5), b = cameraAt(30.99);
  assert.ok(Math.abs(a.fov - 45) < 1e-6 && b.fov > 71 && b.shake > 0.11 && b.roll === 4);
  const r = cameraAt(30.99, { reduced: true });
  assert.deepEqual([r.shake, r.roll], [0, 0]); assert.ok(r.fov <= 50);
  assert.equal(cameraAt(33).tunnel, true); assert.equal(cameraAt(33).pos, undefined);
  const m = cameraAt(5.0); assert.ok(m.pos[0] < 0.8 && m.pos[0] > 0.2 && m.fov < 42 && m.fov > 38);
});

test('Iris enters at 3 s, runs in, ends at the device; her path is continuous', () => {
  assert.equal(irisAt(1), null);
  for (let i = 1; i < IRIS_PATH.length; i++) { assert.equal(IRIS_PATH[i][0], IRIS_PATH[i - 1][1]); assert.deepEqual(IRIS_PATH[i][2], IRIS_PATH[i - 1][3]); }
  assert.equal(irisAt(5).clip, 'run'); assert.equal(irisAt(5).moving, true);
  const end = irisAt(25); assert.deepEqual([end.x, end.z, end.clip, end.moving], [2.2, 0.5, 'idle', false]);
  assert.ok(Math.abs(irisAt(25).heading - Math.atan2(2.5, -0.1)) < 1e-9); // still facing the way she walked: the device
});

test('the timeline fires every cue once, in order, and ends at 38 s', () => {
  let now = 0; const seen = [];
  const tl = createTimeline({ now: () => now, onCue: (c) => seen.push(c.id) });
  let st; for (now = 0; now <= 39000; now += 100) st = tl.tick();
  assert.deepEqual(seen, CUES.map((c) => c.id)); assert.equal(st.done, true); assert.equal(st.t, PROLOGUE_S);
});

test('a skip snaps to the end within 1.2 s and fires no subtitle on the way', () => {
  let now = 0; const seen = [];
  const tl = createTimeline({ now: () => now, onCue: (c) => seen.push(c.id) });
  for (now = 0; now <= 5000; now += 100) tl.tick();
  tl.skip(); assert.equal(tl.skipped, true);
  let st; for (let i = 0; i < 13; i++) { now += 100; st = tl.tick(); }
  assert.equal(st.done, true); assert.equal(st.t, PROLOGUE_S); assert.ok(SKIP_S <= 1.2);
  assert.deepEqual(seen, ['title', 'year', 'key_press', 'device_on', 'vortex_start', 'tunnel', 'whiteout']); // 'check' and 'oh_no' carry text: not after a skip
});

test('reduced motion: a shorter film on the same clock, cuts skipped, cue order kept', () => {
  assert.ok(REDUCED_S < PROLOGUE_S - 4 && REDUCED_S > 25);
  assert.equal(reducedTime(5), 5); assert.ok(Math.abs(reducedTime(7.4) - 9.6) < 1e-9); assert.equal(reducedTime(999), PROLOGUE_S);
  let now = 0; const seen = [];
  const tl = createTimeline({ reduced: true, now: () => now, onCue: (c) => seen.push(c.id) });
  let st, end = null; for (now = 0; now <= 39000; now += 100) { st = tl.tick(); if (st.done && end == null) end = now; }
  assert.deepEqual(seen, CUES.map((c) => c.id)); assert.ok(Math.abs(end / 1000 - REDUCED_S) < 0.11);
});

test('wake-up ring: people stand on the circle facing in, with a gap left open', async () => {
  const { ringPlaces, RING } = await import('../../src/cinematic/prologue/townsfolk-ring.js');
  const places = ringPlaces(RING.people.length);
  assert.equal(places.length, RING.people.length);
  for (const p of places) {
    assert.ok(Math.abs(Math.hypot(p.x, p.z) - RING.radius) < 1e-9);
    // facing the centre: one step along the heading comes closer to it
    assert.ok(Math.hypot(p.x + Math.sin(p.heading) * 0.1, p.z + Math.cos(p.heading) * 0.1) < RING.radius);
    const a = Math.atan2(p.x, p.z), d = Math.abs(Math.atan2(Math.sin(a - RING.gapAt), Math.cos(a - RING.gapAt)));
    assert.ok(d > RING.gap / 2 - 1e-9, 'nobody in the gap');
  }
});
