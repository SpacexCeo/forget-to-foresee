// The abstract hunt (TZ §7.3): how a headless scripted agent "kills ten spiders". It is an ABSTRACTION of the real
// combat, not a simulation of it: per creature, time to kill = hp / dps × a seeded factor in 0.85..1.15; damage taken
// = damage × hitRate × (seconds alive / cooldown) (one swing per cooldown, most of them dodged on the telegraph);
// the hunt fails when the damage reaches Iris's health. Only accounts in the scripted registry may hunt (the room
// checks it); a hunt's kills are T2 (rule-computed), never T1. Pure; no clock, no randomness outside the seed.
import { sha256 } from './crypto.js';

/** hp / damage / cooldown per creature: the numbers of play/mobs.js MOB_TYPES (a test keeps them equal). */
export const HUNT_MOBS = Object.freeze({
  skitter: Object.freeze({ hp: 55, damage: 3, cooldown: 1.6 }),
  hulker: Object.freeze({ hp: 380, damage: 18, cooldown: 2.4 }),
  veilbell: Object.freeze({ hp: 120, damage: 10, cooldown: 2.8 }),
  crownrift: Object.freeze({ hp: 900, damage: 26, cooldown: 2.2 }),
});
export const HUNT = Object.freeze({ dps: 18, hitRate: 0.35, factorMin: 0.85, factorMax: 1.15, irisHp: 100, maxCount: 20 });

/** Display aliases (owner R1: a skitter is shown as a spider). */
export const resolveHuntMob = (m) => ({ spider: 'skitter', spiders: 'skitter', skitter: 'skitter', hulker: 'hulker', veilbell: 'veilbell', crownrift: 'crownrift', crown: 'crownrift' })[String(m || '').toLowerCase()] || null;

/**
 * @param {{seed: string, mob: string, count: number, irisHp?: number}} o
 * @returns {{ok: boolean, reason?: string, won?: boolean, kills?: number, seconds?: number, damage?: number, factors?: number[]}}
 */
export function resolveHunt({ seed, mob, count, irisHp = HUNT.irisHp }) {
  const id = resolveHuntMob(mob), T = id && HUNT_MOBS[id];
  if (!T) return { ok: false, reason: 'bad_mob' };
  if (!Number.isInteger(count) || count < 1 || count > HUNT.maxCount) return { ok: false, reason: 'bad_count' };
  const h = sha256('ftf-hunt-1|' + String(seed) + '|' + id + '|' + count);
  let seconds = 0, damage = 0, kills = 0; const factors = [];
  for (let i = 0; i < count; i++) {
    const r = parseInt(h.slice((i * 3) % 60, (i * 3) % 60 + 4), 16) / 0xffff;
    const f = HUNT.factorMin + (HUNT.factorMax - HUNT.factorMin) * r; factors.push(Math.round(f * 1000) / 1000);
    const alive = (T.hp / HUNT.dps) * f;
    damage += T.damage * HUNT.hitRate * (alive / T.cooldown);
    seconds += alive;
    if (damage >= irisHp) return { ok: true, won: false, mob: id, kills, seconds: Math.round(seconds * 10) / 10, damage: Math.round(damage * 10) / 10, factors };
    kills++;
  }
  return { ok: true, won: true, mob: id, kills, seconds: Math.round(seconds * 10) / 10, damage: Math.round(damage * 10) / 10, factors };
}
