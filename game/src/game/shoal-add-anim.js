// The Hollow Tide's spawn (the adds of the boss fight): which clip one of them plays (pure: no three.js). The model
// `shoal_tideling.glb` ships five clips made in art/shoal/tideling/build_tideling.py: idle and walk (loops), bite,
// spawn, death (one-shots). The rules (game/shoal-rules.js addsStep) only move an add and reset its bite cooldown;
// this module reads that: it rises out of the mirror when it appears, scuttles while its position changes, snaps
// when the cooldown jumps back up, waits otherwise. scenes/shoal-adds-view.js plays the result.

export const ADD_CLIPS = Object.freeze(['idle', 'walk', 'bite', 'spawn', 'death']);
/** Clip lengths in seconds (the model's own; tests read them from the file too) and the walk clip's ground speed. */
export const ADD_ANIM = Object.freeze({
  fade: 0.1, walkSpeed: 3.6,
  len: Object.freeze({ idle: 2.0, walk: 0.5, bite: 0.5, spawn: 0.7, death: 0.9 }),
});

/** A new add: it comes up through the mirror. */
export const freshAddAnim = () => ({ clip: 'spawn', time: 0, x: null, z: null, cd: null });

/**
 * @param {{clip: string, time: number, x: number|null, z: number|null, cd: number|null}} a the animation state
 * @param {{x: number, z: number, cd: number}} add the add of game/shoal-rules.js after this step
 * @param {number} dt
 */
export function addAnimStep(a, add, dt, A = ADD_ANIM) {
  const moved = a.x == null ? 0 : Math.hypot(add.x - a.x, add.z - a.z);
  const bit = a.cd != null && add.cd > a.cd + 1e-6;                // the cooldown went back up: it bit this step
  const at = { x: add.x, z: add.z, cd: add.cd };
  if (bit) return { ...at, clip: 'bite', time: 0 };
  if (a.clip === 'spawn' || a.clip === 'bite') {                    // a one-shot runs to its end
    const time = a.time + dt;
    if (time < A.len[a.clip]) return { ...at, clip: a.clip, time };
  }
  const want = moved > 1e-5 ? 'walk' : 'idle';
  return { ...at, clip: want, time: a.clip === want ? (a.time + dt) % A.len[want] : 0 };
}

/** A killed add: the death clip once; `done` when it has sunk. */
export function addDeathStep(a, dt, A = ADD_ANIM) {
  const time = a.clip === 'death' ? Math.min(A.len.death, a.time + dt) : 0;
  return { ...a, clip: 'death', time, done: time >= A.len.death };
}

/** Cross-fade weights towards a clip. `w` is mutated and returned ({clip: weight}, sums to 1). */
export function addFade(w, clip, dt, A = ADD_ANIM) {
  const k = A.fade > 0 ? Math.min(1, dt / A.fade) : 1; let sum = 0;
  for (const n of ADD_CLIPS) { w[n] = (w[n] || 0) + ((n === clip ? 1 : 0) - (w[n] || 0)) * k; sum += w[n]; }
  if (sum > 0) for (const n of ADD_CLIPS) w[n] /= sum; else w[clip] = 1;
  return w;
}
