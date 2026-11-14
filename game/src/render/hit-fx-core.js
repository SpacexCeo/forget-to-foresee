// Impact feel, the pure part (night 14.11, combat pass): what each kind of blow looks and feels like where it lands.
// General action-game technique, our own numbers: a blow is confirmed at once by a flash in its element's colour, a few
// fragments thrown off the struck side, a short freeze of the struck creature (hit-stop), and a camera kick along the
// blow that springs back (not a random shake). A finishing blow gets a little more of everything. Under reduced motion
// the flash and the fragments stay (they carry the information), the camera does not move.
//
// Sources: lance (Frost Lance), snare (Storm Snare), strike (combo 1-2), strike3 (the combo's third blow),
// super (the charged strike), seed (a monster's bolt reaching the ground or Iris); in the Glass Shoal ember, gale,
// blade, blade_heavy. Only the super strike rings the
// ground (owner 12.11: no ground arc on ordinary hits).

/** Per source: colour (hex), flash size (m), fragments (count, kind), crackles, ground ring (m, 0 none), camera shake and kick, hit-stop (s), crit. */
export const IMPACT = Object.freeze({
  lance: Object.freeze({ color: 0xa8e4ff, flash: 0.6, frags: 7, frag: 'ice', crackle: 0, ring: 0, shake: 0.1, kick: 0.1, stop: 0.07, crit: false }),
  snare: Object.freeze({ color: 0xc9a8ff, flash: 0.55, frags: 4, frag: 'spark', crackle: 3, ring: 0, shake: 0.08, kick: 0.05, stop: 0.07, crit: false }),
  strike: Object.freeze({ color: 0xfff0d2, flash: 0.4, frags: 3, frag: 'spark', crackle: 0, ring: 0, shake: 0.05, kick: 0.07, stop: 0.07, crit: false }),
  strike3: Object.freeze({ color: 0xffd28c, flash: 0.65, frags: 6, frag: 'spark', crackle: 0, ring: 0, shake: 0.22, kick: 0.16, stop: 0.1, crit: true }),
  super: Object.freeze({ color: 0xffc36b, flash: 0.95, frags: 10, frag: 'spark', crackle: 0, ring: 1.6, shake: 0.35, kick: 0.24, stop: 0.16, crit: true }),
  // the Glass Shoal (scenes/shoal-arena.js): Elise's Ember Palms and Gale Discs, Iris's Loomblade combo and heavy slash
  ember: Object.freeze({ color: 0xff8a3a, flash: 0.7, frags: 6, frag: 'spark', crackle: 0, ring: 0, shake: 0.04, kick: 0.04, stop: 0, crit: false }),
  gale: Object.freeze({ color: 0xc8f0ff, flash: 0.55, frags: 5, frag: 'ice', crackle: 0, ring: 0, shake: 0.03, kick: 0.03, stop: 0, crit: false }),
  blade: Object.freeze({ color: 0xfff4dc, flash: 0.55, frags: 4, frag: 'spark', crackle: 0, ring: 0, shake: 0.06, kick: 0.08, stop: 0.04, crit: false }),
  blade_heavy: Object.freeze({ color: 0xffe2a0, flash: 0.9, frags: 9, frag: 'spark', crackle: 0, ring: 0, shake: 0.28, kick: 0.2, stop: 0.08, crit: true }),
  dragon: Object.freeze({ color: 0xfff4e2, flash: 0.6, frags: 5, frag: 'spark', crackle: 0, ring: 0, shake: 0, kick: 0.02, stop: 0, crit: false }), // a companion's bolt (game/shoal-allies.js); the caller tints it by kind
  seed: Object.freeze({ color: 0x9ff5ea, flash: 0.45, frags: 5, frag: 'spark', crackle: 0, ring: 0, shake: 0, kick: 0, stop: 0, crit: false }),
});
/** What a finishing blow adds. */
export const KILL = Object.freeze({ frags: 4, flash: 1.25, shake: 0.12, kick: 0.06, stop: 0.12 });
/** Fragment physics: speed range (m/s), upward bias, gravity (m/s²), life (s). Ice shards are heavier and slower. */
export const FRAG = Object.freeze({
  ice: Object.freeze({ speed: [1.6, 3.2], up: 1.6, gravity: 9, life: 0.55, size: 0.11 }),
  spark: Object.freeze({ speed: [2.4, 4.6], up: 1.0, gravity: 4, life: 0.32, size: 0.07 }),
});
/** The camera kick spring: stiffness and damping (critically damped near 2·√k), and its largest offset (m). */
export const KICK = Object.freeze({ k: 260, damp: 30, max: 0.35 });

/**
 * The impact of one blow: the source's look scaled by the creature's size, plus the finishing-blow extra.
 * Unknown sources fall back to the plain strike. Pure.
 * @param {string} src @param {{radius?: number, heavy?: boolean, kill?: boolean, reduced?: boolean}} [o]
 */
export function impactOf(src, { radius = 0.5, heavy = false, kill = false, reduced = false } = {}) {
  const b = IMPACT[src] || IMPACT.strike;
  const size = Math.min(1.8, Math.max(0.8, 0.6 + radius * 0.8));             // a hulker's flash is bigger than a skitter's
  const k = kill ? KILL : null;
  const shake = (b.shake + (k ? k.shake : 0) + (heavy ? 0.06 : 0));
  return {
    src: IMPACT[src] ? src : 'strike', color: b.color, frag: b.frag, crackle: b.crackle,
    flash: b.flash * size * (k ? k.flash : 1),
    frags: b.frags + (k ? k.frags : 0),
    ring: b.ring * (src === 'super' ? 1 : size),
    stop: Math.max(b.stop, k ? k.stop : 0),
    crit: b.crit,
    shake: reduced ? 0 : shake,
    kick: reduced ? 0 : Math.min(KICK.max, b.kick + (k ? k.kick : 0)),
  };
}

/**
 * Fragment launch velocities: `n` directions in a cone away from the attacker (`away` [x, z], unit), spread ±70°,
 * upward biased, from a seeded random in [0, 1). Pure. Returns [[vx, vy, vz], ...].
 */
export function fragVelocities(n, away, kind, rand) {
  const F = FRAG[kind] || FRAG.spark, out = [];
  const base = Math.atan2(away[0], away[1]);
  for (let i = 0; i < n; i++) {
    const a = base + (rand() * 2 - 1) * 1.22, s = F.speed[0] + rand() * (F.speed[1] - F.speed[0]);
    out.push([Math.sin(a) * s, F.up * (0.5 + rand()), Math.cos(a) * s]);
  }
  return out;
}

/**
 * One step of the camera kick spring (semi-implicit Euler): offset `x` and velocity `v` (each [x, y, z]) pulled back
 * to rest. Mutates and returns {x, v}. Pure maths.
 */
export function kickStep(state, dt) {
  const { x, v } = state;
  for (let i = 0; i < 3; i++) { v[i] += (-KICK.k * x[i] - KICK.damp * v[i]) * dt; x[i] += v[i] * dt; }
  return state;
}

/** A jagged crackle polyline from `a` to `b` ([x, y, z]) in `segments` steps, jittered sideways by `amp`. Pure. */
export function crackle(a, b, segments, amp, rand) {
  const pts = [a.slice()];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    pts.push([a[0] + (b[0] - a[0]) * t + (rand() * 2 - 1) * amp, a[1] + (b[1] - a[1]) * t + (rand() * 2 - 1) * amp, a[2] + (b[2] - a[2]) * t + (rand() * 2 - 1) * amp]);
  }
  pts.push(b.slice());
  return pts;
}
