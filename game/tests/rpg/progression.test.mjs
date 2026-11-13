// Progression (sprint plan 5.6): the XP table to level 20 on the existing curve, HP/mana/regeneration formulas,
// skill and stat point totals, stat spending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelInfo, xpForLevel, LEVEL_CAP, skillPointsAt, statPointsAt, derived, initialProgress, spendStat, statPointsLeft, levelsGained } from '../../src/rpg/progression.js';
import { levelOf } from '../../src/game/town-economy.js';

// the plan's table: [level, total XP, max HP, max mana, skill pts, stat pts]
const TABLE = [[1, 0, 100, 60, 0, 0], [2, 100, 112, 66, 1, 3], [3, 300, 124, 72, 2, 6], [4, 600, 136, 78, 3, 9], [5, 1000, 148, 84, 4, 12], [6, 1500, 160, 90, 5, 15],
  [7, 2100, 172, 96, 6, 18], [8, 2800, 184, 102, 7, 21], [9, 3600, 196, 108, 8, 24], [10, 4500, 208, 114, 9, 27], [11, 5500, 220, 120, 10, 30], [12, 6600, 232, 126, 11, 33],
  [13, 7800, 244, 132, 12, 36], [14, 9100, 256, 138, 13, 39], [15, 10500, 268, 144, 14, 42], [16, 12000, 280, 150, 15, 45], [17, 13600, 292, 156, 16, 48], [18, 15300, 304, 162, 17, 51],
  [19, 17100, 316, 168, 18, 54], [20, 19000, 328, 174, 19, 57]];

test('XP table: levelOf(50·(L−1)·L) is L for L = 1..20, one XP less is L − 1; the cap holds', () => {
  for (const [L, xp] of TABLE) {
    assert.equal(xpForLevel(L), xp, `xp for ${L}`);
    assert.equal(levelOf(xp).level, L); assert.equal(levelInfo(xp).level, L);
    if (L > 1) assert.equal(levelInfo(xp - 1).level, L - 1);
  }
  assert.equal(levelInfo(1e9).level, LEVEL_CAP); assert.equal(levelInfo(1e9).need, 0); assert.ok(levelInfo(1e9).capped);
  assert.deepEqual(levelInfo(150), { level: 2, xp: 150, into: 50, need: 200, capped: false });
  assert.deepEqual(levelsGained(90, 320), [2, 3]); assert.deepEqual(levelsGained(320, 330), []);
});

test('HP, mana and regeneration match the table and the formulas', () => {
  for (const [L, , hp, mana, sp, tp] of TABLE) {
    const d = derived(L);
    assert.equal(d.maxHP, hp, `hp ${L}`); assert.equal(d.maxMana, mana, `mana ${L}`);
    assert.equal(skillPointsAt(L), sp); assert.equal(statPointsAt(L), tp);
  }
  const d = derived(5, { voice: 3, mind: 4, grit: 2 }, { hpPct: 0.1, manaRegenPct: 0.25 });
  assert.equal(d.maxHP, Math.round((100 + 48 + 16) * 1.1));
  assert.equal(d.maxMana, 60 + 24 + 24);
  assert.ok(Math.abs(d.manaRegen - 3 * 1.04 * 1.25) < 1e-9);
  assert.ok(Math.abs(d.damageBonus - 0.06) < 1e-9);
  assert.ok(Math.abs(d.hpRegen - d.maxHP * 0.015) < 1e-9); assert.equal(d.hpRegenDelay, 5);
  assert.equal(d.crit, 0.05); assert.equal(d.critMult, 1.5);
});

test('stat points: spend while points remain, never an unknown stat, never beyond the total', () => {
  let rec = initialProgress();
  assert.equal(statPointsLeft(1, rec), 0); assert.equal(spendStat(1, rec, 'voice').reason, 'points');
  for (let i = 0; i < 3; i++) { const r = spendStat(2, rec, 'grit'); assert.ok(r.ok); rec = r.rec; }
  assert.equal(rec.stats.grit, 3); assert.equal(statPointsLeft(2, rec), 0); assert.equal(spendStat(2, rec, 'grit').ok, false);
  assert.equal(spendStat(5, rec, 'luck').reason, 'stat');
  assert.equal(derived(2, rec.stats).maxHP, 112 + 24);
});
