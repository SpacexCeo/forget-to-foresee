// The pearl dragon's clip mixing (pure: no three.js). The model `shoal_dragon.glb` ships seven clips made in
// art/shoal/dragon/s08_clips.py: glide, flap, bank_l, bank_r, idle (loops), land and takeoff (one-shots). The scene
// (scenes/glass-shoal.js) asks this module which clips play at which weight for the dragon's phase:
//  - 'land':  it descends beside the cliff stone flapping, the `land` one-shot starts so that its touch-down frame
//             meets the ground, then it folds its wings and idles;
//  - 'ride':  the `takeoff` one-shot, then glide with a few wing beats every cycle and a bank into the turn.

/** Clip names in the model file. */
export const DRAGON_CLIPS = Object.freeze(['glide', 'flap', 'bank_l', 'bank_r', 'idle', 'land', 'takeoff']);
/** Timing (seconds). `descent` is the scene's landing time; `touch` is where the land clip's hind feet meet the ground
 * (the front feet follow 0.2 s later; from there the paws are held by baked IK); `push` is where the take-off clip's
 * hind feet leave the ground after the crouch: the model is lifted only from that moment. */
export const DRAGON_ANIM = Object.freeze({
  descent: 2.5, land: 2.4, touch: 0.85, takeoff: 1.3, push: 0.45, fade: 0.3,
  cycle: 9, beats: 3.0,          // in a ride: `beats` seconds of wing beats at the start of every `cycle`
  bankFull: 0.3, bankShare: 0.85, // radians of roll for the full bank pose, and how much of the mix it takes
  bodyHeight: 2.3, hover: 0.5,    // the model's origin is at its feet: lift of the body centre, and the scene's landing hover
});

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/**
 * @param {'land'|'ride'} phase @param {number} t seconds in the phase @param {number} [bank] roll in radians
 * (positive = the left wing up = a right turn, as scenes/glass-shoal.js rolls the root)
 * @returns {{ weights: Record<string, number>, times: Record<string, number>, lift: number }} weights sum to 1;
 * `times` pins the one-shot clips; `lift` is how far the model sits below the scene's root (0 perched .. 1 flying).
 */
export function dragonMix(phase, t, bank = 0, A = DRAGON_ANIM) {
  const w = { glide: 0, flap: 0, bank_l: 0, bank_r: 0, idle: 0, land: 0, takeoff: 0 };
  const times = {};
  if (phase === 'land') {
    const start = A.descent - A.touch;                  // the land clip starts here so the feet touch at `descent`
    const inLand = smooth(start - A.fade, start, t), toIdle = smooth(start + A.land - A.fade, start + A.land, t);
    w.flap = 1 - inLand; w.land = inLand * (1 - toIdle); w.idle = inLand * toIdle;
    times.land = Math.max(0, Math.min(A.land, t - start));
    return { weights: w, times, lift: 0 };
  }
  const off = smooth(A.takeoff - A.fade, A.takeoff, t);
  w.takeoff = 1 - off; times.takeoff = Math.min(A.takeoff, Math.max(0, t));
  const c = ((t - A.takeoff) % A.cycle + A.cycle) % A.cycle;
  const out = 1 - smooth(A.beats - 0.6, A.beats, c);   // the first cycle continues the take-off strokes; later ones fade in
  const beat = t < A.takeoff ? 1 : (t - A.takeoff < A.cycle ? out : smooth(0, 0.6, c) * out);
  const b = clamp01(Math.abs(bank) / A.bankFull) * A.bankShare;
  const flying = off;
  if (bank > 0) w.bank_r = flying * b; else w.bank_l = flying * b;
  w.flap = flying * (1 - b) * clamp01(beat); w.glide = flying * (1 - b) * (1 - clamp01(beat));
  return { weights: w, times, lift: smooth(A.push, A.takeoff, t) };
}
