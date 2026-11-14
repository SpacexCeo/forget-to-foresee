// The Hollow Tide's clip choice (pure: no three.js). The model `hollow_tide.glb` ships eight clips made in
// art/shoal/boss/b02_clips.py: idle (loop), rise, slam, lunge, sweep, hit, roar, death. When a phase breaks it recoils
// (`hit`) and then roars, unless the next telegraph cuts in. Every attack clip starts with
// exactly `wind` seconds of wind-up; the fight's telegraph (1.4 / 1.15 / 0.9 s by phase, game/shoal-rules.js) is
// mapped onto that part, so the blow in the clip lands when the rules strike, at any phase. scenes/shoal-arena.js
// asks `bossAnimStep` every frame for the clip and its time and cross-fades to it.

export const BOSS_CLIPS = Object.freeze(['idle', 'rise', 'slam', 'lunge', 'sweep', 'hit', 'roar', 'death']);
/** Clip lengths in seconds (report/b02.json of the art pipeline; tests read them from the file too). */
export const BOSS_ANIM = Object.freeze({
  wind: 1.0, fade: 0.2,
  len: Object.freeze({ idle: 4.0, rise: 2.4, slam: 2.55, lunge: 2.4, sweep: 2.55, hit: 1.0, roar: 2.2, death: 3.4 }),
});
const ATTACKS = new Set(['slam', 'lunge', 'sweep']);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** The boss as it enters the fight: it rises out of the mirror. `down` = it is already defeated (a return visit). */
export const freshBossAnim = (down = false) => ({ clip: down ? 'death' : 'rise', time: down ? BOSS_ANIM.len.death : 0, phase: 0 });

/**
 * @param {{clip: string, time: number, phase: number}} a the animation state
 * @param {object} b the boss of game/shoal-rules.js ({state, t, attack, phase, dead})
 * @param {number} dt @param {number} telegraph the phase's telegraph seconds @param {boolean} [won]
 */
export function bossAnimStep(a, b, dt, telegraph, won = false, A = BOSS_ANIM) {
  const L = A.len;
  if (won || b.dead) return a.clip === 'death' ? { ...a, time: Math.min(L.death, a.time + dt) } : { clip: 'death', time: 0, phase: b.phase };
  const kind = b.attack && ATTACKS.has(b.attack.kind) ? b.attack.kind : null;
  if (kind && b.state === 'telegraph') return { clip: kind, time: A.wind * clamp01(1 - Math.max(0, b.t) / (telegraph || 1)), phase: b.phase };
  if (kind && b.state === 'active') return { clip: kind, time: Math.min(L[kind], Math.max(A.wind, a.clip === kind ? a.time : A.wind) + dt), phase: b.phase };
  if (b.phase > a.phase) return { clip: 'hit', time: 0, phase: b.phase };          // a phase breaks: it recoils
  if (a.clip === 'idle') return { clip: 'idle', time: (a.time + dt) % L.idle, phase: b.phase };
  const time = a.time + dt;                                                          // finish the one-shot (recover, rise, hit)
  if (time >= L[a.clip]) return { clip: a.clip === 'hit' ? 'roar' : 'idle', time: 0, phase: b.phase };   // after the recoil of a broken phase: the roar
  return { clip: a.clip, time, phase: b.phase };
}

/** Cross-fade weights towards the current clip. `w` is mutated and returned ({clip: weight}, sums to 1). */
export function fadeWeights(w, clip, dt, A = BOSS_ANIM) {
  const k = A.fade > 0 ? Math.min(1, dt / A.fade) : 1; let sum = 0;
  for (const n of BOSS_CLIPS) { const target = n === clip ? 1 : 0; w[n] = (w[n] || 0) + (target - (w[n] || 0)) * k; sum += w[n]; }
  if (sum > 0) for (const n of BOSS_CLIPS) w[n] /= sum; else w[clip] = 1;
  return w;
}
