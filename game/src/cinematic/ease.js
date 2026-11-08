// Easing and interpolation for the scripted shots. Pure math on arrays (no three.js) so the camera
// paths are node-tested: eases, vector lerps, Catmull-Rom splines through waypoints with uniform arc
// length, and a keyframe track that evaluates any numeric property at a time.

export const EASES = Object.freeze({
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  smoothstep: (t) => t * t * (3 - 2 * t),
  smootherstep: (t) => t * t * t * (t * (t * 6 - 15) + 10),
});

export const clamp01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Number.isFinite(t) ? t : 0);
export const ease = (name, t) => (EASES[name] || EASES.inOutCubic)(clamp01(t));
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerpV = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

/** Catmull-Rom (centripetal-ish, uniform parameter) through control points; p0..p3 arrays. */
export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return p1.map((_, i) => 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
}

/**
 * A smooth path through waypoints, parameterised by arc length so the camera moves at a steady pace
 * between the eased endpoints. Two points degrade to a straight line.
 */
export class Spline {
  constructor(points, { samples = 64 } = {}) {
    this.points = points.map((p) => p.slice());
    const n = this.points.length;
    if (n === 1) this.points.push(this.points[0].slice());
    this.table = [0];
    let prev = this.at(0), len = 0;
    const steps = Math.max(1, (this.points.length - 1) * samples);
    for (let i = 1; i <= steps; i++) {
      const p = this.at(i / steps);
      len += Math.hypot(...p.map((v, k) => v - prev[k]));
      this.table.push(len);
      prev = p;
    }
    this.length = len;
  }

  /** Point at raw parameter u in [0, 1] (segment-uniform, not arc-length). */
  at(u) {
    const pts = this.points, segs = pts.length - 1;
    const s = clamp01(u) * segs, i = Math.min(segs - 1, Math.floor(s)), t = s - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(segs, i + 2)];
    return catmullRom(p0, p1, p2, p3, t);
  }

  /** Point at a fraction of the arc length (0 = start, 1 = end). */
  atLength(f) {
    const target = clamp01(f) * this.length;
    const tb = this.table;
    let lo = 0, hi = tb.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tb[mid] < target) lo = mid + 1; else hi = mid; }
    const i = Math.max(1, lo), a = tb[i - 1], b = tb[i];
    const seg = b > a ? (target - a) / (b - a) : 0;
    return this.at((i - 1 + seg) / (tb.length - 1));
  }
}

/**
 * Keyframe track: [{t, value, ease?}] with t in seconds (sorted). value is a number or an array.
 * Between keys the value is interpolated with the ease named on the destination key.
 */
export class Track {
  constructor(keys) {
    this.keys = keys.map((k) => ({ t: k.t, value: Array.isArray(k.value) ? k.value.slice() : k.value, ease: k.ease || 'inOutCubic' })).sort((a, b) => a.t - b.t);
  }

  at(t) {
    const k = this.keys;
    if (!k.length) return null;
    if (t <= k[0].t) return k[0].value;
    if (t >= k[k.length - 1].t) return k[k.length - 1].value;
    let i = 1;
    while (k[i].t < t) i++;
    const a = k[i - 1], b = k[i];
    const u = ease(b.ease, (t - a.t) / Math.max(1e-9, b.t - a.t));
    return Array.isArray(a.value) ? lerpV(a.value, b.value, u) : lerp(a.value, b.value, u);
  }
}

/** Opacity envelope for a card or caption: fades in over `fadeIn`, holds, fades out over `fadeOut`. */
export function envelope(t, from, to, fadeIn = 0.6, fadeOut = 0.6) {
  if (t <= from || t >= to) return 0;
  const a = fadeIn > 0 ? clamp01((t - from) / fadeIn) : 1;
  const b = fadeOut > 0 ? clamp01((to - t) / fadeOut) : 1;
  return EASES.inOutSine(Math.min(a, b));
}
