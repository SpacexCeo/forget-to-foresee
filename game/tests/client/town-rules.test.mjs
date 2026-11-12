// The town's integer rules in JS (game/src/game/town-rules.js) equal the contract's (contracts/town/src/rules.rs):
// both read contracts/town/tests/vectors.json, written from this module by tools/town/vectors.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_PARAMS as P, swapQuote, tradeFee, stakeCap, lpAdd, splitBought, planDistribution, pendingReward, fmt, UNIT } from '../../src/game/town-rules.js';

const V = JSON.parse(readFileSync(new URL('../../../contracts/town/tests/vectors.json', import.meta.url), 'utf8'));
const s = (v) => v.toString();

test('town rules: every shared vector matches (the contract checks the same file)', () => {
  for (const c of V.swaps) { const q = swapQuote(P, c.x, c.y, c.amount); assert.deepEqual([s(q.out), s(q.fee), s(q.to_stakers)], [c.out, c.fee, c.to_stakers]); }
  for (const c of V.fees) assert.equal(s(tradeFee(P, c.silk)), c.fee);
  for (const c of V.caps) assert.equal(s(stakeCap(P, c.tvl)), c.cap);
  for (const c of V.lps) assert.deepEqual(lpAdd(c.x, c.y, c.total, c.wool_max, c.silk_max).map(s), [c.shares, c.wool, c.silk]);
  for (const c of V.splits) { const r = splitBought(P, c.bought); assert.deepEqual([r.stakers, r.purse, r.reserve, r.burn].map(s), [c.stakers, c.purse, c.reserve, c.burn]); }
  for (const c of V.plans) { const r = planDistribution(P, c.pot, c.weights); assert.deepEqual([...r.pots.map(s), s(r.overflow)], [...c.pots, c.overflow]); }
  for (const c of V.pendings) assert.equal(s(pendingReward(c.weight, c.snapshot, c.index)), c.pending);
});

test('town rules: the AMM never lowers k, the sweep split loses nothing, wash trading has negative EV', () => {
  let x = 10_000n * UNIT, y = 20_000n * UNIT;
  for (let i = 1n; i < 200n; i++) {
    const k = x * y, q = swapQuote(P, x, y, i * 1_337n);
    x += i * 1_337n - q.to_stakers; y -= q.out;
    assert.ok(x * y >= k);
  }
  for (const b of [0n, 1n, 7n, 123_456_789n]) { const r = splitBought(P, b); assert.equal(r.stakers + r.purse + r.reserve + r.burn, b); }
  // the washer pays the fee on every trade and gets back at most 65 % x (1 - 12 %) of it, times its weight share
  const share = (P.tithe_stakers_bps / 10_000) * (1 - P.station_tax_bps / 10_000);
  assert.ok(share < 1 && Math.abs(share - 0.572) < 1e-9);
  assert.equal(fmt(2_400n, 4), '0.0024'); assert.equal(fmt(2n * UNIT), '2');
});
