// A scripted "average player" Elise against the Hollow Tide, on the pure rules only (no DOM, no three.js).
// tests/client/glass-shoal.test.mjs runs it for the balance check: an average run should take about 3 to 5 minutes.
// The player: stands ~15 m off the boss and casts whenever mana allows, hits 60 % of her orbs and discs, dodges 45 %
// of the blows aimed at her, steps out of 30 % more and eats the rest, kills the adds first, takes an HP orb under
// 45 HP (3 s without casting), fires the Tempest as soon as it is full. A death costs the respawn and the walk back.
import * as R from '../../src/game/shoal-rules.js';
import { SHOAL_SKILL } from '../../src/rpg/shoal-skills.js';

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** @returns {{seconds: number, deaths: number, ults: number, won: boolean}} */
export function simulateElise(seed = 1, o = {}) {
  const P = { aim: 0.6, dodge: 0.45, evade: 0.3, ...o };
  const BB = { ...R.BOSS, ...(o.boss || {}) };
  const rand = rng(seed), dt = 0.05;
  const ember = SHOAL_SKILL.ember_palms, gale = SHOAL_SKILL.gale_discs;
  const me = [0, 5];
  let H = R.freshHero(), B = R.freshBoss(0, BB), t = 0, busy = 0, deaths = 0, ults = 0, hpOrbs = R.ARENA.pickups.filter((p) => p.kind === "hp").map(() => 0), ultT = 0, ultEl = 0;
  const dealBoss = (amt, opts) => { const r = R.hitBoss(B, amt, BB, opts || {}); B = r.boss; if (!opts) H = { ...H, ult: R.chargeUlt(H.ult, r.dealt, 0) }; };
  const hurt = (amt) => { const r = R.hitHero(H, amt); H = { ...r.hero, ult: R.chargeUlt(r.hero.ult, 0, r.taken) }; };
  while (!B.dead && t < 1200) {
    t += dt;
    H = R.heroTick(H, dt);
    hpOrbs = hpOrbs.map((x) => Math.max(0, x - dt));
    if (busy > 0) busy -= dt;
    // the boss
    const r = R.bossStep(B, dt, me, BB); B = r.boss;
    for (const e of r.events) {
      if (e.type !== 'strike' || !R.inDanger(e.attack, me[0], me[1], BB)) continue;
      if (ultT > 0) continue; // untouchable in the Tempest
      const roll = rand();
      if (roll < P.dodge && R.canDodge(H)) { H = R.startDodge(H); B = R.exposeBoss(B, BB); busy = Math.max(busy, 0.45); }
      else if (roll < P.dodge + P.evade) busy = Math.max(busy, 1);
      else hurt(e.damage);
    }
    const a = R.addsStep(B.adds, dt, me, BB); B = { ...B, adds: a.adds }; if (a.damage && ultT <= 0) hurt(a.damage);
    // the Tempest
    if (ultT > 0) {
      const t0 = ultEl; ultEl += dt; ultT -= dt;
      for (let n = R.ultPulses(t0, ultEl); n > 0; n--) { if (R.inTempest(me, R.ARENA.boss, BB.contact)) dealBoss(R.ULT.damage, { pierce: true }); B = { ...B, adds: R.hitAdds(B.adds, me, R.ULT.radius, R.ULT.damage).adds }; }
    } else if (R.ultReady(H)) { H = R.startUlt(H); ultT = R.ULT.duration; ultEl = 0; ults++; }
    // her turn
    if (H.hp <= 0) { deaths++; const d = R.respawnAfterDeath(B, BB); B = d.boss; H = d.hero; t += 2.2 + 3; continue; }
    if (busy > 0 || ultT > 0) continue;
    { const k = hpOrbs.findIndex((x) => x <= 0); if (H.hp < 45 && k >= 0) { H = R.pickUp(H, "hp"); hpOrbs[k] = R.HERO.pickupRespawn; busy = 3; continue; } }
    let h2 = null;
    if (B.adds.length) { h2 = R.useSkill(H, ember); if (h2) { H = h2; for (let k = 0; k < 2; k++) if (B.adds.length && rand() < P.aim + 0.1) { const h = R.hitAdds(B.adds, [B.adds[0].x, B.adds[0].z], 1, ember.damage, true); B = { ...B, adds: h.adds }; } } continue; }
    if (H.mana >= 40) h2 = R.useSkill(H, gale);
    if (h2) { H = h2; for (let k = 0; k < gale.count; k++) if (rand() < P.aim) dealBoss(gale.damage); continue; }
    h2 = R.useSkill(H, ember);
    if (h2) { H = h2; for (let k = 0; k < 2; k++) if (rand() < P.aim) dealBoss(ember.damage); }
  }
  return { seconds: Math.round(t), deaths, ults, won: B.dead };
}
