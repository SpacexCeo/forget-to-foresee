// VFX pure logic: presets, pooling, timing, tiers, logogram geometry (src/vfx/*.js without three.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EFFECTS, EMITTERS, EFFECT_NAMES, ATLASES, validatePresets } from '../../src/vfx/presets.js';
import { SlotRing, ObjectPool, Timeline, envelope, scaledCount, tierConfig, VFX_TIERS, lightningPath, sampleShape, rng } from '../../src/vfx/core.js';
import { logogramStrokes, rasterizeLogogram, penAt, strokeTimes, slotAngle } from '../../src/vfx/logogram-shape.js';

test('presets validate: every reference, range and duration is sound', () => {
  assert.deepEqual(validatePresets(), []);
});

test('the documented effect set exists', () => {
  for (const n of ['logogram', 'vision', 'anchor_plant', 'storm_hit', 'gift', 'shard_auction', 'shell_mist', 'shell_crack_pulse', 'tension', 'vote_finale']) {
    assert.ok(EFFECT_NAMES.includes(n), n);
  }
  assert.equal(EFFECTS.vision.duration, 10, 'spec 6: vision 10 s');
  assert.equal(EFFECTS.vote_finale.duration, 12, 'spec 6: collective finale 12 s');
  for (const a of Object.values(ATLASES)) assert.equal(a.grid * a.grid, a.frames);
});

test('validator catches broken presets', () => {
  const bad = validatePresets({ x: { ...EMITTERS.gift_motes, atlas: 'nope' } }, { y: { duration: 1, layers: [{ at: 0, kind: 'burst', emitter: 'missing' }] } });
  assert.ok(bad.some((e) => e.includes('unknown atlas')));
  assert.ok(bad.some((e) => e.includes('unknown emitter')));
});

test('tiers: low has fewer particles, no distortion, no soft particles, no lights', () => {
  assert.ok(scaledCount(100, 'low') < scaledCount(100, 'high'));
  assert.ok(scaledCount(100, 'high') < scaledCount(100, 'ultra'));
  assert.equal(scaledCount(100, 'ultra'), 100);
  assert.equal(scaledCount(1, 'low'), 1, 'never rounds a burst to zero');
  assert.equal(scaledCount(0, 'ultra'), 0);
  assert.equal(VFX_TIERS.low.distortion, false);
  assert.equal(VFX_TIERS.low.soft, false);
  assert.equal(VFX_TIERS.low.lights, 0);
  assert.equal(tierConfig('bogus'), VFX_TIERS.high);
});

test('SlotRing wraps, splits ranges and counts stolen live slots', () => {
  const r = new SlotRing(10);
  assert.deepEqual(r.allocate(6, 0, 5), [{ start: 0, count: 6 }]);
  assert.deepEqual(r.allocate(6, 1, 5), [{ start: 6, count: 4 }, { start: 0, count: 2 }]);
  assert.equal(r.stolen, 2, 'two still-alive slots were reused');
  assert.equal(r.used, 10);
  assert.equal(r.live(1), 10);
  assert.equal(r.live(6), 0);
  assert.equal(r.lastDeath(), 5);
  assert.equal(r.allocate(50, 10, 20).reduce((a, b) => a + b.count, 0), 10, 'never more than capacity');
  assert.throws(() => new SlotRing(0));
});

test('ObjectPool reuses and caps', () => {
  let made = 0;
  const p = new ObjectPool(() => ({ id: made++ }), 2);
  const a = p.acquire(), b = p.acquire();
  assert.equal(p.acquire(), null);
  assert.ok(p.release(a));
  assert.equal(p.release(a), false, 'double release is ignored');
  assert.equal(p.acquire(), a);
  assert.equal(made, 2); void b;
});

test('Timeline fires layers at their start, ends one-shots at the duration', () => {
  const tl = new Timeline({ duration: 2, layers: [{ at: 0, kind: 'burst' }, { at: 0.5, kind: 'ring', dur: 1 }, { at: 1.5, kind: 'burst' }] });
  let r = tl.advance(0.1);
  assert.deepEqual(r.start, [0]);
  r = tl.advance(0.5);
  assert.deepEqual(r.start, [1]);
  assert.ok(tl.localTime(1) > 0);
  r = tl.advance(1.0);
  assert.deepEqual(r.start, [2]);
  assert.ok(r.end.includes(1));
  assert.equal(r.done, false);
  r = tl.advance(0.5);
  assert.equal(r.done, true);
});

test('Timeline: a looping effect runs until stop(), then winds down', () => {
  const tl = new Timeline({ duration: 1, loop: true, layers: [{ at: 0, kind: 'stream', release: 0.5 }, { at: 0, kind: 'burst', every: 1 }] });
  let bursts = 0;
  for (let i = 0; i < 100; i++) bursts += tl.advance(0.05).start.filter((x) => x === 1).length;
  assert.equal(tl.done, false);
  assert.equal(bursts, 5, 'a repeating layer fires once per period (t = 0..4)');
  tl.stop();
  tl.advance(0.3);
  assert.equal(tl.done, false);
  tl.advance(0.3);
  assert.equal(tl.done, true);
});

test('envelope: attack, hold, release, zero outside', () => {
  assert.equal(envelope(-1, 2, 0.5, 0.5), 0);
  assert.equal(envelope(0.25, 2, 0.5, 0.5), 0.5);
  assert.equal(envelope(1, 2, 0.5, 0.5), 1);
  assert.ok(Math.abs(envelope(1.75, 2, 0.5, 0.5) - 0.5) < 1e-9);
  assert.equal(envelope(3, 2, 0.5, 0.5), 0);
  assert.ok(envelope(0.5, 1, 2, 2) <= 1, 'shrinks attack/release that do not fit');
});

test('every one-shot effect has all its layers inside the duration', () => {
  for (const [name, fx] of Object.entries(EFFECTS)) {
    if (fx.loop) continue;
    const tl = new Timeline(fx);
    const started = new Set();
    for (let t = 0; t < fx.duration + 0.5; t += 1 / 60) for (const i of tl.advance(1 / 60).start) started.add(i);
    assert.equal(started.size, fx.layers.length, name + ': all layers start');
    assert.ok(tl.done, name + ' finishes');
  }
});

test('lightning path is deterministic, connects the endpoints, 2^depth segments', () => {
  const a = lightningPath([0, 10, 0], [0, 0, 0], { seed: 3, depth: 5 });
  const b = lightningPath([0, 10, 0], [0, 0, 0], { seed: 3, depth: 5 });
  assert.deepEqual(a, b);
  assert.equal(a.length, 33);
  assert.deepEqual(a[0], [0, 10, 0]);
  assert.deepEqual(a[32], [0, 0, 0]);
});

test('shape sampling stays inside its bounds', () => {
  const r = rng(5);
  for (let i = 0; i < 500; i++) {
    const s = sampleShape({ type: 'sphere', radius: 2 }, r); assert.ok(Math.hypot(...s) <= 2 + 1e-9);
    const d = sampleShape({ type: 'disc', radius: 1 }, r); assert.ok(Math.hypot(d[0], d[2]) <= 1 + 1e-9);
    const b = sampleShape({ type: 'box', size: [2, 4, 6] }, r); assert.ok(Math.abs(b[0]) <= 1 && Math.abs(b[1]) <= 2 && Math.abs(b[2]) <= 3);
  }
});

test('logogram: deterministic strokes, four slots clockwise from the top, dots, draw order', () => {
  const a = logogramStrokes({ forms: [0, 1, 2, 3], dots: 2, seed: 7 });
  assert.deepEqual(a, logogramStrokes({ forms: [0, 1, 2, 3], dots: 2, seed: 7 }));
  assert.notDeepEqual(a, logogramStrokes({ forms: [3, 2, 1, 0], dots: 2, seed: 7 }));
  assert.equal(logogramStrokes({ dots: 3 }).length - logogramStrokes({ dots: 0 }).length, 3);
  assert.ok(Math.abs(slotAngle(0) - Math.PI / 2) < 1e-9, 'slot 0 at the top');
  assert.ok(Math.abs(slotAngle(1)) < 1e-9, 'slot 1 to the right (clockwise)');
  const times = strokeTimes(a);
  for (let i = 1; i < times.length; i++) assert.ok(times[i][0] > times[i - 1][1], 'pen lifts between strokes');
  assert.ok(Math.abs(times[times.length - 1][1] - 1) < 1e-9);
  assert.ok(penAt(a, 0.01));
  assert.equal(penAt(a, 1.5), null);
});

test('logogram field: ring pixels are ink, the centre is empty, draw time grows along the ring', () => {
  const s = logogramStrokes({ forms: [1, 1, 1, 1], dots: 0 });
  const f = rasterizeLogogram(s, 64);
  const at = (x, y) => { const px = Math.floor((x + 1) / 2 * 64), py = Math.floor((1 - y) / 2 * 64); return f.data.subarray((py * 64 + px) * 4, (py * 64 + px) * 4 + 4); };
  assert.ok(at(-0.62, 0)[0] < 40, 'left of the ring is on a stroke');
  assert.equal(at(0, 0)[0], 255, 'centre is far from every stroke');
  assert.ok(at(0.62, 0.1)[1] < at(-0.62, -0.1)[1], 'the ring sweeps clockwise: right before left');
});
