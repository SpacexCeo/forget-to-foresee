/* The Monte Carlo harness must stay reproducible and must never issue an intent the engine rejects. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSeason } from '../scripts/sim/lib/season.mjs';
import { STRATEGIES } from '../scripts/sim/lib/strategies.mjs';

const strip = (r) => { const { trace, ...rest } = r; return JSON.stringify(rest); };

test('sim: same seed and strategy reproduce the same record (v2 and baseline)', () => {
  for (const rules of ['v2', 'baseline-2d-1']) {
    const a = runSeason(42, STRATEGIES['coop-honest-anchor'], { rules });
    const b = runSeason(42, STRATEGIES['coop-honest-anchor'], { rules });
    assert.equal(strip(a), strip(b), rules);
  }
});

test('sim: strategies only issue accepted intents and the silk ledger balances', () => {
  for (const s of Object.values(STRATEGIES)) for (let seed = 1; seed <= 25; seed++) {
    const r = runSeason(seed, s);
    assert.deepEqual(r.rejected, [], `${s.name} seed ${seed}`);
    assert.equal(r.in.other, 0, `${s.name} seed ${seed}: unexplained silk ${r.in.other}`);
    assert.equal(r.final.outcome !== null, true);
  }
});

test('sim: v2 salts do not change the simulated gameplay (v2 vs v2-crypto vs baseline silk)', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const a = runSeason(seed, STRATEGIES['hold-defect-anchor'], { rules: 'v2-crypto' });
    const b = runSeason(seed, STRATEGIES['hold-defect-anchor'], { rules: 'baseline-2d-1' });
    assert.deepEqual(a.final.silk, b.final.silk, `seed ${seed}`);
  }
});