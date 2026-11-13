// Loom Dice (src/market/dice.js): the odds hold, the edge is 4 %, the limits hold, and only play silk moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICE, multiplierOf, payoutOf, stakeAllowed, oddsTable, rollOf, createDice } from '../../src/market/dice.js';
import { computeSilkView } from '../../src/net/silk-core.js';

test('dice: the table of the spec (x1.92 / x3.84 / x9.60, 96 % back, the payout cap)', () => {
  assert.deepEqual(DICE.bets.map((n) => multiplierOf(n).toFixed(2)), ['1.92', '3.84', '9.60']);
  assert.deepEqual(oddsTable().map((r) => [r.n, r.maxStakeC]), [[50, 1000], [25, 1000], [10, 500]]);
  assert.equal(stakeAllowed(1000, 10), false); assert.equal(stakeAllowed(500, 10), true); assert.equal(stakeAllowed(300, 50), false);
  assert.equal(payoutOf(100, 50), 192);
});

test('dice: over 200,000 seeded rolls each bet wins within ±0.5 % of N and returns 96 % ± 1 %', () => {
  for (const n of DICE.bets) {
    let wins = 0, back = 0; const R = 200_000;
    for (let k = 1; k <= R; k++) { const { roll } = rollOf('wheel-test', k); if (roll <= n) { wins++; back += payoutOf(100, n); } }
    assert.ok(Math.abs(wins / R - n / 100) < 0.005, `win rate for ${n}: ${wins / R}`);
    assert.ok(Math.abs(back / (R * 100) - 0.96) < 0.01, `return for ${n}: ${back / (R * 100)}`);
  }
});

function setup(playC = 2000) {
  const m = new Map(); const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  let silk = playC; const ledger = { get silk() { return silk; }, grant: ({ silk: s }) => { silk += s; }, spend: ({ silkC }) => (silk >= silkC ? (silk -= silkC, { ok: true }) : { ok: false }) };
  let t = Date.UTC(2026, 10, 13, 12);
  const dice = createDice({ storage, ledger, play: () => silk, wheelId: 'w-1', now: () => t });
  return { dice, ledger, step: (ms) => { t += ms; }, storage };
}

test('dice: a roll is checkable, moves play silk only, and keeps the cooldown', () => {
  const { dice, ledger, step } = setup(2000);
  const r = dice.roll(100, 50);
  assert.equal(r.ok, true); assert.equal(rollOf('w-1', 1).roll, r.roll); assert.equal(r.seed, rollOf('w-1', 1).seed);
  assert.equal(ledger.silk, 2000 - 100 + r.payoutC);
  assert.deepEqual(dice.roll(100, 50), { ok: false, reason: 'cooldown' });
  step(1500); assert.equal(dice.roll(100, 50).ok, true);
  // play silk never touches the silk recorded on NEAR: the silk view's on-chain part stays put
  const before = computeSilkView({ localTotalC: 5000, onChainC: 3000, creditableC: 3000, chainOk: true });
  const after = computeSilkView({ localTotalC: 5000 + 192, onChainC: 3000, creditableC: 3000, chainOk: true });
  assert.equal(after.gateC, before.gateC); assert.equal(after.playC - before.playC, 192);
});

test('dice: the daily loss cap, the win cap, no play silk, the payout cap, and the allowance once', () => {
  const { dice, step } = setup(100_000);
  let r; let guard = 0;
  do { step(1500); r = dice.roll(500, 10); guard++; } while (r.ok && guard < 400);
  assert.ok(['loss_cap', 'win_cap'].includes(r.reason), r.reason);
  const poor = setup(50).dice; assert.deepEqual(poor.roll(100, 50), { ok: false, reason: 'no_play_silk' });
  assert.deepEqual(setup().dice.roll(1000, 10), { ok: false, reason: 'max_payout' });
  const s = setup(0); assert.equal(s.dice.claimAllowance(), true); assert.equal(s.ledger.silk, DICE.allowanceC); assert.equal(s.dice.claimAllowance(), false);
});
