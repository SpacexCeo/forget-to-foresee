// Camera beats of the wake-up dialogue (QA pass 2 #2): lines W3/W4/W6/W9/W12 carry a `camera` cue (npe/dialogue-script.js)
// and the intro announces every line on the bus ('npe.camera', target or null). The town camera then leans toward the
// thing the line talks about (the Gate-Loom, Iris's badge, the Elder, the Shell monument) the way registration leans it
// toward the altar: the follow focus is pulled most of the way to the target and the zoom eases to the cue's distance.
// One beat glides into the next, and the camera eases back to Iris on a line without a cue and when the dialogue
// ends. Under reduced motion it cuts. Pure (no three.js): boot-world.js feeds the positions and applies the result.

/**
 * Where each cue looks. `at` names the subject (boot-world.js passes world positions of Iris, the Gate-Loom
 * (scenes/town-portal.js), the Shell monument (scenes/town-board.js) and the Elder), `pull` is how far the focus moves
 * from Iris to it, `dist` the camera distance for the beat, `lift` metres above the subject's feet.
 */
export const CUE_SHOTS = Object.freeze({
  gate_loom: { at: 'portal', pull: 0.75, dist: 11, lift: 1.6 },
  iris_badge: { at: 'iris', pull: 1, dist: 4.6, lift: 1.25 }, // the badge on her chest, the closest zoom (never first person)
  elder: { at: 'elder', pull: 0.75, dist: 8, lift: 1.4 },
  shell: { at: 'board', pull: 0.75, dist: 11, lift: 1.4 },
});

/** Seconds of the critically damped glide (it starts and lands softly; about 1.3 s from Iris to a beat). */
export const CUE_SMOOTH = 0.45;

/** One critically damped step of `cur` toward `target` with velocity `v[i]` (the classic SmoothDamp). */
function damp(cur, target, v, i, dt) {
  const w = 2 / CUE_SMOOTH, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target, tmp = (v[i] + w * change) * dt;
  v[i] = (v[i] - w * tmp) * e;
  return target + (change + tmp) * e;
}

/**
 * The world point and distance of one cue, or null (no cue, an unknown one, or its subject is not in the scene).
 * @param {string|null} name the line's `camera` value
 * @param {{iris: number[], portal?: number[]|null, board?: number[]|null, elder?: number[]|null}} at feet positions
 */
export function cueShot(name, at) {
  const s = name ? CUE_SHOTS[name] : null;
  const p = s ? at[s.at] : null;
  if (!p) return null;
  return { point: [p[0], p[1] + s.lift, p[2]], pull: s.pull, dist: s.dist };
}

/** A fresh beat state (inactive). */
export function cueState() { return { active: false, focus: [0, 0, 0], dist: 0, base: 0, v: [0, 0, 0, 0] }; }

/**
 * One frame of the beats. While a shot is on (or until the camera is back) it writes the eased focus and distance
 * into `st` and returns true: the caller follows `st.focus` and `st.dist` instead of its own. Returns false once the
 * camera is back on Iris at the player's own distance (`st.base`, remembered when the first beat began).
 * @param {object} st cueState() @param {{point:number[], pull:number, dist:number}|null} shot this line's cueShot
 * @param {number[]} focus Iris's follow focus @param {number} dist the player's camera distance now
 */
export function stepCue(st, shot, focus, dist, dt, reduced = false) {
  if (!st.active) {
    if (!shot) return false;
    st.active = true; st.v.fill(0); st.base = dist; st.dist = dist; st.focus[0] = focus[0]; st.focus[1] = focus[1]; st.focus[2] = focus[2];
  }
  let err = 0;
  for (let i = 0; i < 3; i++) {
    const want = shot ? focus[i] + (shot.point[i] - focus[i]) * shot.pull : focus[i];
    st.focus[i] = reduced ? want : damp(st.focus[i], want, st.v, i, dt); err = Math.max(err, Math.abs(want - st.focus[i]));
  }
  const wantDist = shot ? shot.dist : st.base;
  st.dist = reduced ? wantDist : damp(st.dist, wantDist, st.v, 3, dt);
  if (!shot && err < 0.02 && Math.abs(st.dist - st.base) < 0.02) { st.active = false; st.dist = st.base; return false; }
  return true;
}
