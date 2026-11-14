// Dragon allies in the Glass Shoal (night 14.11, brief 3 step 4): the companion dragons that fly with the heroine (the
// chain says she holds them: net/companions.js, the Hatchkeeper's pet) join the fight with a small bolt of their own
// element every few seconds. A help, never the win: a dragon deals a few percent of the boss's health over a whole
// fight, never fills the Tempest, and stops when she is down or the fight is won. Pure (no three.js); the arena
// (scenes/shoal-arena.js) flies the bolts and draws them. game/shoal-rules.js is not touched.

/** Per dragon: seconds between bolts (the first comes after `first`), damage, bolt speed (m/s), hit radius (m), reach (m). */
export const ALLY = Object.freeze({ every: 3.2, first: 1.6, damage: 5, speed: 18, radius: 0.6, range: 28, max: 2 });
/** Each kind's bolt colour (scenes/companion-rules.js tints, a touch brighter). */
export const ALLY_COLOR = Object.freeze({ nacre: 0xfff4e2, rill: 0x7ff3e6, cinder: 0xffb85a });

/** A fresh timer per dragon: staggered so two dragons never fire on the same frame. */
export const freshAllies = (n) => Array.from({ length: Math.min(ALLY.max, Math.max(0, n)) }, (_, i) => ({ t: ALLY.first + i * ALLY.every * 0.5 }));

/**
 * Advances the dragons' timers by `dt`; returns the indices that fire this step (at most one bolt per dragon per step).
 * `live` false (she is down, the fight is over, the Tempest is running) holds them. Mutates `timers`.
 */
export function alliesStep(timers, dt, live = true) {
  const fire = [];
  if (!live) return fire;
  timers.forEach((s, i) => { s.t -= dt; if (s.t <= 0) { s.t += ALLY.every; if (s.t < 0) s.t = ALLY.every; fire.push(i); } });
  return fire;
}

/**
 * What a dragon at `from` [x, z] aims at: the nearest add within reach, else the boss (its body, `bossAt` [x, z],
 * `contact` m round) when within reach, else nothing. Returns {kind: 'add'|'boss', at: [x, z], id?} or null.
 */
export function allyTarget(from, adds, bossAt, contact, bossAlive = true) {
  let best = null, bd = ALLY.range;
  for (const a of adds || []) { const d = Math.hypot(a.x - from[0], a.z - from[1]); if (d < bd) { bd = d; best = { kind: 'add', at: [a.x, a.z], id: a.id }; } }
  if (best) return best;
  if (bossAlive && bossAt && Math.hypot(bossAt[0] - from[0], bossAt[1] - from[1]) - contact < ALLY.range) return { kind: 'boss', at: [bossAt[0], bossAt[1]] };
  return null;
}
