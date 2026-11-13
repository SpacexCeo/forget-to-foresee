// The lab prologue as data (sprint plan 9.4): shots with their cameras, Iris's path, the cues and the wake-up.
// Pure: no renderer. Room: 10 m (x, east) by 8 m (z, south) by 3.4 m, origin at the room's centre, y up; the door in
// the south wall at x = -3, the desk against the north wall at (2.2, -3.4), the Glass Resonator at (3.2, 0.4).

export const PROLOGUE_S = 38.0;
export const WAKEUP_S = 9.0;
export const SKIP_S = 1.2; // a skip snaps to the end within this long

/** Camera per shot: position p0 -> p1, look-at l0 -> l1, fov f0 -> f1 (degrees); ease: smooth in and out. */
export const SHOTS = Object.freeze([
  { id: 'P1', t0: 0.0, t1: 3.0, p0: [-4.8, 1.9, 5.2], p1: [-4.8, 1.9, 5.2], l0: [-3, 1.3, 3.6], l1: [-3, 1.3, 3.6], f0: 40, f1: 40 },
  { id: 'P2', t0: 3.0, t1: 7.0, p0: [-4.8, 1.9, 5.2], p1: [-3.9, 1.6, 3.2], l0: [-3, 1.2, 3.8], l1: [-3, 1.2, 3.8], f0: 40, f1: 36, ease: true },
  { id: 'P3', t0: 7.0, t1: 10.0, p0: [-2.6, 1.45, -1.4], p1: [0.3, 1.45, -1.0], l0: [-2.3, 1.25, 1.6], l1: [0.6, 1.25, -2.4], f0: 34, f1: 34 },
  { id: 'P4', t0: 10.0, t1: 13.5, p0: [0.1, 1.55, -1.6], p1: [0.9, 1.5, -2.2], l0: [2.2, 1.3, -3.4], l1: [2.2, 1.3, -3.4], f0: 32, f1: 32, ease: true },
  { id: 'P5', t0: 13.5, t1: 15.5, p0: [2.0, 1.35, -2.85], p1: [2.0, 1.35, -2.85], l0: [2.9, 0.86, -3.1], l1: [2.9, 0.86, -3.1], f0: 24, f1: 24, shake: 0.004 },
  { id: 'P6', t0: 15.5, t1: 19.5, p0: [-1.2, 1.7, 2.8], p1: [0.4, 1.6, 1.6], l0: [3.2, 1.5, 0.4], l1: [3.2, 1.5, 0.4], f0: 38, f1: 34, ease: true },
  { id: 'P7', t0: 19.5, t1: 23.5, p0: [0.3, 0.9, 1.8], p1: [1.3, 1.0, 1.4], l0: [3.2, 1.4, 0.4], l1: [3.2, 1.4, 0.4], f0: 34, f1: 34 },
  { id: 'P8', t0: 23.5, t1: 26.5, p0: [1.75, 1.62, 0.95], p1: [1.85, 1.62, 0.75], l0: [2.3, 1.58, 0.5], l1: [2.3, 1.58, 0.5], f0: 28, f1: 28 },
  { id: 'P9', t0: 26.5, t1: 31.0, p0: [0.6, 1.55, 1.1], p1: [1.2, 1.5, 0.7], l0: [3.2, 1.5, 0.4], l1: [3.2, 1.5, 0.4], f0: 45, f1: 72, shake: 0.12, roll: 4 },
  { id: 'P10', t0: 31.0, t1: 35.5, tunnel: true, f0: 80, f1: 80, roll: 25 },
  { id: 'P11', t0: 35.5, t1: 38.0, tunnel: true, f0: 80, f1: 80 },
]);

/** Cues (9.5): id, time, and what the dialogue layer shows. Emitted on the bus as `prologue.cue`. */
export const CUES = Object.freeze([
  { id: 'title', t: 0.0, text: 'FORGET TO FORESEE', durMs: 2800, card: true },
  { id: 'year', t: 3.0, text: "2048. Dr. Iris's laboratory.", durMs: 3800 },
  { id: 'check', t: 10.4, speaker: 'Iris', text: 'One more check on the signal...', durMs: 2800 },
  { id: 'key_press', t: 14.0 },
  { id: 'device_on', t: 15.8 },
  { id: 'oh_no', t: 24.3, speaker: 'Iris', text: 'Oh no...', durMs: 1400, voice: 'voice_iris_oh_no' },
  { id: 'vortex_start', t: 26.5 },
  { id: 'tunnel', t: 31.0 },
  { id: 'whiteout', t: 34.6 },
]);
export const WAKE_CUES = Object.freeze([{ id: 'eyes_open', t: 0.0 }, { id: 'crowd', t: 3.0 }, { id: 'sit_up', t: 6.0 }]);

/** Iris: where she is and which clip plays. [t0, t1, from [x, z], to [x, z], clip]; she stands at `to` afterwards. */
export const IRIS_PATH = Object.freeze([
  [3.0, 3.6, [-3, 5.5], [-3, 5.5], 'idle'],            // behind the door while it opens
  [3.6, 7.4, [-3, 5.5], [-2.6, 1.6], 'run'],
  [7.4, 9.6, [-2.6, 1.6], [0.6, -2.4], 'walk'],
  [9.6, 10.6, [0.6, -2.4], [0.6, -2.4], 'idle'],
  [10.6, 12.0, [0.6, -2.4], [1.9, -2.75], 'walk'],     // to the desk
  [12.0, 15.9, [1.9, -2.75], [1.9, -2.75], 'idle'],
  [15.9, 19.5, [1.9, -2.75], [-0.3, 0.6], 'walk'],     // she turns and steps back into the room
  [19.5, 23.2, [-0.3, 0.6], [2.2, 0.5], 'walk'],       // toward the device
  [23.2, 26.5, [2.2, 0.5], [2.2, 0.5], 'idle'],
  [26.5, 31.0, [2.2, 0.5], [3.1, 0.42], 'idle'],       // the pull
]);

const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** The shot playing at time t (the last one past the end). */
export function shotAt(t) {
  for (const s of SHOTS) if (t < s.t1) return s;
  return SHOTS[SHOTS.length - 1];
}

/** Camera at t: {pos, look, fov, shake, roll, tunnel, k} with k the shot's progress 0..1. */
export function cameraAt(t, { reduced = false } = {}) {
  const s = shotAt(t), k0 = clamp01((t - s.t0) / (s.t1 - s.t0)), k = s.ease ? smooth(k0) : k0;
  const out = { id: s.id, k: k0, tunnel: !!s.tunnel, fov: reduced ? (s.tunnel ? 60 : Math.min(50, s.f0)) : lerp(s.f0, s.f1, k), shake: reduced ? 0 : (s.shake || 0) * (s.id === 'P9' ? k0 : 1), roll: reduced ? 0 : (s.roll || 0) };
  if (!s.tunnel) { out.pos = s.p0.map((v, i) => lerp(v, s.p1[i], k)); out.look = s.l0.map((v, i) => lerp(v, s.l1[i], k)); }
  return out;
}

/** Iris at t: {x, z, heading (radians, 0 = +z), clip, moving}. Before her entrance: null. */
export function irisAt(t) {
  if (t < IRIS_PATH[0][0]) return null;
  let seg = IRIS_PATH[IRIS_PATH.length - 1], prevDir = 0;
  for (const s of IRIS_PATH) { if (t < s[1]) { seg = s; break; } const dx = s[3][0] - s[2][0], dz = s[3][1] - s[2][1]; if (Math.hypot(dx, dz) > 1e-3) prevDir = Math.atan2(dx, dz); }
  const [t0, t1, a, b, clip] = seg, k = clamp01((t - t0) / (t1 - t0));
  const dx = b[0] - a[0], dz = b[1] - a[1], moving = Math.hypot(dx, dz) > 1e-3 && t < t1;
  return { x: lerp(a[0], b[0], k), z: lerp(a[1], b[1], k), heading: moving ? Math.atan2(dx, dz) : prevDir, clip, moving };
}

/** The cues that fall in (from, to]. */
export function cuesBetween(from, to, list = CUES) {
  return list.filter((c) => c.t > from && c.t <= to || (from < 0 && c.t === 0 && to >= 0));
}

/**
 * Reduced motion shortens the film (9.4): the cool-down walk and half the tunnel are cut. Maps the wall-clock time of
 * the reduced film onto the full film's time.
 */
export const REDUCED_CUTS = Object.freeze([[7.4, 9.6], [31.5, 34.0]]);
export const REDUCED_S = PROLOGUE_S - REDUCED_CUTS.reduce((s, [a, b]) => s + (b - a), 0);
export function reducedTime(t) {
  let out = t;
  for (const [a, b] of REDUCED_CUTS) if (out >= a) out += b - a;
  return Math.min(PROLOGUE_S, out);
}
