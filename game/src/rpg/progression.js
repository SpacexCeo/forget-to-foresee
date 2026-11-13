// Progression (sprint plan 5.6): levels 1 to 20 on the town ledger's existing XP curve (level n needs 50 · n · (n + 1)
// total XP, `levelOf` in game/town-economy.js), skill points and stat points per level, the three stats (Voice, Mind,
// Grit) and the derived numbers (max HP, max mana, regeneration, crit). Pure: no DOM, no storage.
import { levelOf } from '../game/town-economy.js';

export const LEVEL_CAP = 20;
export const STATS = Object.freeze(['voice', 'mind', 'grit']);

export const PROGRESSION = Object.freeze({
  hpBase: 100, hpPerLevel: 12, hpPerGrit: 8,
  manaBase: 60, manaPerLevel: 6, manaPerMind: 6,
  manaRegen: 3,                 // per second, × (1 + 0.01 · Mind) × (1 + passive %)
  regenPerMind: 0.01,
  voiceDamage: 0.02,            // +2 % skill damage per Voice point
  hpRegenShare: 0.015,          // out of combat: 1.5 % of max HP per second ...
  hpRegenDelay: 5,              // ... after 5 s without taking damage
  crit: 0.05, critMult: 1.5,
  skillPerLevel: 1, statPerLevel: 3,
});

/** Total XP to reach level L (1-based). */
export const xpForLevel = (L) => 50 * (L - 1) * L;

/** The level for a total XP, capped at LEVEL_CAP: {level, into, need, capped} (need 0 at the cap). */
export function levelInfo(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  const l = levelOf(x);
  if (l.level >= LEVEL_CAP) return { level: LEVEL_CAP, xp: x, into: x - xpForLevel(LEVEL_CAP), need: 0, capped: true };
  return { level: l.level, xp: x, into: l.into, need: l.need, capped: false };
}

/** Skill points earned by level L (1 per level from level 2). */
export const skillPointsAt = (L) => Math.max(0, Math.min(L, LEVEL_CAP) - 1) * PROGRESSION.skillPerLevel;
/** Stat points earned by level L (3 per level from level 2). */
export const statPointsAt = (L) => Math.max(0, Math.min(L, LEVEL_CAP) - 1) * PROGRESSION.statPerLevel;

/**
 * Derived numbers for a level, the stat spread and the passive bonuses.
 * @param {number} L level
 * @param {{voice?:number, mind?:number, grit?:number}} stats
 * @param {{hpPct?:number, manaRegenPct?:number, damagePct?:number, hpRegenMult?:number, damageTakenPct?:number}} passive
 */
export function derived(L, stats = {}, passive = {}) {
  const P = PROGRESSION, lv = Math.max(1, Math.min(L, LEVEL_CAP));
  const voice = stats.voice || 0, mind = stats.mind || 0, grit = stats.grit || 0;
  const maxHP = Math.round((P.hpBase + P.hpPerLevel * (lv - 1) + P.hpPerGrit * grit) * (1 + (passive.hpPct || 0)));
  const maxMana = P.manaBase + P.manaPerLevel * (lv - 1) + P.manaPerMind * mind;
  const manaRegen = P.manaRegen * (1 + P.regenPerMind * mind) * (1 + (passive.manaRegenPct || 0));
  const damageBonus = P.voiceDamage * voice + (passive.damagePct || 0);
  const hpRegen = maxHP * P.hpRegenShare * (passive.hpRegenMult || 1);
  return { level: lv, maxHP, maxMana, manaRegen, hpRegen, hpRegenDelay: P.hpRegenDelay, damageBonus, crit: P.crit, critMult: P.critMult, damageTaken: 1 - (passive.damageTakenPct || 0) };
}

/** A fresh progression record (saved beside the ledger): stat spread, skills learned, respec bookkeeping. */
export const initialProgress = () => ({ v: 1, stats: { voice: 0, mind: 0, grit: 0 }, learned: [], respecs: 0, respecAt: 0 });

/** Stat points left for a level and a record. */
export const statPointsLeft = (L, rec) => statPointsAt(L) - STATS.reduce((a, s) => a + ((rec.stats && rec.stats[s]) || 0), 0);

/** Spend one stat point: {ok, rec, reason?}; reason 'stat' (unknown) | 'points' (none left). Pure. */
export function spendStat(L, rec, stat) {
  if (!STATS.includes(stat)) return { ok: false, rec, reason: 'stat' };
  if (statPointsLeft(L, rec) <= 0) return { ok: false, rec, reason: 'points' };
  return { ok: true, rec: { ...rec, stats: { ...rec.stats, [stat]: (rec.stats[stat] || 0) + 1 } } };
}

/** Levels crossed by an XP change: [] or the new levels (for level-up events). */
export function levelsGained(xpBefore, xpAfter) {
  const a = levelInfo(xpBefore).level, b = levelInfo(xpAfter).level, out = [];
  for (let l = a + 1; l <= b; l++) out.push(l);
  return out;
}
