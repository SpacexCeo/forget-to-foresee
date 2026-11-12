// Floating numbers, the pure part (src/ui/float-numbers-core.js, a reference game teardown M5): the merge window, the growth
// cap, crits, the curve with and without reduced motion, the pool limit and the texts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeOrAdd, curve, textOf, sizeOf, alive, POOL, MERGE_MS, KIND } from '../../src/ui/float-numbers-core.js';

const P = [0, 0, 0];

test('numbers: hits on one target within 250 ms merge and grow (5 % a merge, at most 1.5x); later hits start a new number', () => {
  const live = [], m = { id: 1 };
  const a = mergeOrAdd(live, { kind: 'damage', amount: 14, target: m, pos: P }, 0);
  const b = mergeOrAdd(live, { kind: 'damage', amount: 14, target: m, pos: P }, 200);
  assert.equal(a, b); assert.equal(a.amount, 28); assert.equal(a.grow, 1.05);
  for (let i = 0; i < 20; i++) mergeOrAdd(live, { kind: 'damage', amount: 1, target: m, pos: P }, 200 + i * 10);
  assert.equal(a.grow, 1.5);
  const c = mergeOrAdd(live, { kind: 'damage', amount: 5, target: m, pos: P }, 200 + 19 * 10 + MERGE_MS + 1);
  assert.notEqual(c, a);
  assert.notEqual(mergeOrAdd(live, { kind: 'damage', amount: 5, target: { id: 2 }, pos: P }, 0), a, 'another target never merges');
});

test('numbers: a crit merged into a hit turns it into a crit; silk and XP never merge', () => {
  const live = [], m = {};
  const a = mergeOrAdd(live, { kind: 'damage', amount: 14, target: m, pos: P }, 0);
  mergeOrAdd(live, { kind: 'crit', amount: 26, target: m, pos: P }, 100);
  assert.equal(a.kind, 'crit'); assert.equal(a.amount, 40);
  const s1 = mergeOrAdd(live, { kind: 'silk_gain', amount: 2, target: m, pos: P }, 0), s2 = mergeOrAdd(live, { kind: 'silk_gain', amount: 2, target: m, pos: P }, 10);
  assert.notEqual(s1, s2);
});

test('numbers: the pool holds 24; the oldest goes first', () => {
  const live = [];
  for (let i = 0; i < 30; i++) mergeOrAdd(live, { kind: 'xp', amount: i, pos: P }, i);
  assert.equal(live.length, POOL);
  assert.equal(live[0].amount, 6);
});

test('numbers: the curve pops, rises and fades; crits pop ~3x and jitter; reduced motion only fades', () => {
  const d0 = curve('damage', 0), d1 = curve('damage', 120), dEnd = curve('damage', KIND.damage.life);
  assert.ok(Math.abs(d0.scale - 1.2) < 1e-9 && Math.abs(d1.scale - 1) < 1e-9);
  assert.equal(dEnd.opacity, 0);
  assert.ok(curve('damage', 500).rise > 20);
  const c0 = curve('crit', 0);
  assert.equal(c0.scale, 3); assert.equal(c0.jitter, 6); assert.equal(curve('crit', 400).jitter, 0);
  const r = curve('crit', 0, true);
  assert.deepEqual([r.scale, r.rise, r.jitter], [1, 0, 0]);
  assert.ok(alive({ kind: 'crit', born: 0 }, 1500) && !alive({ kind: 'damage', born: 0 }, 700));
});

test('numbers: texts and sizes (silk two decimals with a sign, XP with its unit; other players smaller)', () => {
  assert.equal(textOf('silk_gain', 3.5), '+3.50');
  assert.equal(textOf('silk_spend', 10), '−10.00');
  assert.equal(textOf('xp', 20, 'XP'), '+20 XP');
  assert.equal(textOf('damage', 13.6), '14');
  assert.equal(sizeOf({ kind: 'crit' }), 46); assert.equal(sizeOf({ kind: 'crit', other: true }), 28); assert.equal(sizeOf({ kind: 'damage', other: true }), 16);
});
