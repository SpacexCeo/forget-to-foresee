// The Hollow Tide's clip choice (pure: no three.js). The model `hollow_tide.glb` ships eight clips made in
// art/shoal/boss/b02_clips.py: idle (loop), rise, slam, lunge, sweep, hit, roar, death. When a phase breaks it recoils
// (`hit`) and then roars, unless the next telegraph cuts in. Every attack clip starts with
// exactly `wind` seconds of wind-up; the fight's telegraph (1.4 / 1.15 / 0.9 s by phase, game/shoal-rules.js) is
// mapped onto that part, so the blow in the clip lands when the rules strike, at any phase. scenes/shoal-arena.js
// asks `bossAnimStep` every frame for the clip and its time and cross-fades to it.

export const BOSS_CLIPS = Object.freeze(['idle', 'rise', 'slam', 'lunge', 'sweep', 'hit', 'roar', 'death']);
/**
 * The ice dragon (owner 14.11) adds its own moves: breath (ice breath: the wind-up is the inhale), claw, takeoff (it
 * rises into the air), dive (from the air onto her: the landing slam) and fly (its idle in the air). A model without
 * one of them plays its stand-in (CLIP_STANDIN), so the Hollow Tide still fights and the dragon is a model swap.
 */
export const DRAGON_CLIPS = Object.freeze(['breath', 'claw', 'takeoff', 'dive', 'fly']);
export const ALL_CLIPS = Object.freeze([...BOSS_CLIPS, ...DRAGON_CLIPS]);
export const CLIP_STANDIN = Object.freeze({ breath: 'lunge', claw: 'sweep', takeoff: 'rise', dive: 'slam', fly: 'idle' });
/** The clip a model plays for `clip`: its own, else the stand-in, else idle. Pure. */
export const clipOn = (clip, has) => (has(clip) ? clip : has(CLIP_STANDIN[clip]) ? CLIP_STANDIN[clip] : 'idle');
/** Clip lengths in seconds (report/b02.json of the art pipeline; tests read them from the file too). */
export const BOSS_ANIM = Object.freeze({
  wind: 1.0, fade: 0.2,
  len: Object.freeze({ idle: 4.0, rise: 2.4, slam: 2.55, lunge: 2.4, sweep: 2.55, hit: 1.0, roar: 2.2, death: 3.4,
    breath: 2.4, claw: 2.55, takeoff: 2.4, dive: 2.55, fly: 4.0 }), // the dragon's: as their stand-ins until its clips are measured
});
const ATTACKS = new Set(['slam', 'lunge', 'sweep', 'breath', 'claw', 'takeoff', 'dive']);
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
  const rest = b.airborne ? 'fly' : 'idle';                                          // in the air it hovers
  if (a.clip === 'idle' || a.clip === 'fly') return { clip: rest, time: (a.time + dt) % L[rest], phase: b.phase };
  const time = a.time + dt;                                                          // finish the one-shot (recover, rise, hit)
  if (time >= L[a.clip]) return { clip: a.clip === 'hit' ? 'roar' : rest, time: 0, phase: b.phase };   // after the recoil of a broken phase: the roar
  return { clip: a.clip, time, phase: b.phase };
}

/** Cross-fade weights towards the current clip. `w` is mutated and returned ({clip: weight}, sums to 1). */
export function fadeWeights(w, clip, dt, A = BOSS_ANIM) {
  const k = A.fade > 0 ? Math.min(1, dt / A.fade) : 1; let sum = 0;
  for (const n of ALL_CLIPS) { const target = n === clip ? 1 : 0; w[n] = (w[n] || 0) + (target - (w[n] || 0)) * k; sum += w[n]; }
  if (sum > 0) for (const n of ALL_CLIPS) w[n] /= sum; else w[clip] = 1;
  return w;
}
