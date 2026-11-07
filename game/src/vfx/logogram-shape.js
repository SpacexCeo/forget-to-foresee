// Logogram stroke geometry (pure, no three.js). A Guests' sign is round: a ring drawn in one
// sweep, four slot forms set on the ring (positions clockwise from the top, rules-baseline:
// encodeForms puts slot s's form at (dots + s) % 4) and 0..3 dots. Each form has one of four
// shapes. Strokes are drawn in order; the shader reveals them by arc length.
//
// The shapes are our own (no Arrival ink circles): a nacre-sail tendril, a split spike, a closed
// whorl, and a three-ray fan.
import { rng } from './core.js';

const TAU = Math.PI * 2;
export const FORM_NAMES = Object.freeze(['tendril', 'spike', 'whorl', 'fan']);

/** Slot position angle (radians, math convention) for position k: clockwise from the top. */
export const slotAngle = (k) => Math.PI / 2 - k * (Math.PI / 2);

function arc(cx, cy, r, a0, a1, n, wobble, r01, w0 = 1, w1 = 1) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t;
    const rr = r * (1 + wobble * Math.sin(a * 3 + r01 * 9) * 0.5);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, w0 + (w1 - w0) * t]);
  }
  return pts;
}

/** Point in a local frame at slot angle a on the ring: u along the outward normal, v along the tangent. */
function frame(a, R) {
  const nx = Math.cos(a), ny = Math.sin(a), tx = -ny, ty = nx;
  return (u, v) => [nx * (R + u) + tx * v, ny * (R + u) + ty * v];
}

function form(shape, a, R, r) {
  const F = frame(a, R);
  const strokes = [];
  const j = () => (r() - 0.5) * 0.02;
  if (shape === 0) {
    // Tendril: rises out of the ring and curls back like a sail edge.
    const s = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18, ang = t * 4.2;
      const rad = 0.2 * (1 - t * 0.7);
      s.push([...F(0.02 + t * 0.22 + Math.sin(ang) * rad * 0.4, Math.cos(ang) * rad * 0.6 - 0.05 + j()), 1.15 - t * 0.85]);
    }
    strokes.push(s);
  } else if (shape === 1) {
    // Split spike: a wedge pointing inward, opening into two short barbs.
    strokes.push([[...F(0.06, 0), 1.3], [...F(-0.18, j()), 0.9], [...F(-0.36, 0), 0.25]]);
    strokes.push([[...F(-0.2, 0), 0.8], [...F(-0.3, 0.11), 0.5], [...F(-0.33, 0.17), 0.2]]);
    strokes.push([[...F(-0.2, 0), 0.8], [...F(-0.3, -0.11), 0.5], [...F(-0.33, -0.17), 0.2]]);
  } else if (shape === 2) {
    // Whorl: a closed loop sitting astride the ring.
    const c = F(0.0, 0);
    const loop = arc(c[0], c[1], 0.12, a + Math.PI, a + Math.PI + TAU * 1.08, 26, 0.12, r(), 1.1, 0.6);
    strokes.push(loop);
  } else {
    // Fan: three rays splayed outward from a short stem.
    for (const v of [-0.12, 0, 0.12]) strokes.push([[...F(0.0, v * 0.3), 1.0], [...F(0.12, v * 0.7 + j()), 0.7], [...F(0.26, v * 1.3), 0.25]]);
  }
  return strokes;
}

/**
 * Strokes for a sign. forms: 4 form ids (0..3) by ring position (top, right, bottom, left);
 * dots: 0..3. Coordinates are in the unit disc (ring radius 0.62). Each point is [x, y, width].
 */
export function logogramStrokes({ forms = [0, 1, 2, 3], dots = 0, seed = 7 } = {}) {
  const r = rng(seed);
  const R = 0.62;
  const strokes = [];
  // The ring: one sweep, starting just past the top, thick-to-thin like a brush running dry, with
  // a small open gap so the start stays readable.
  const start = Math.PI / 2 - 0.25;
  strokes.push(arc(0, 0, R, start, start - TAU + 0.42, 96, 0.035, r(), 1.25, 0.55));
  for (let k = 0; k < 4; k++) {
    const shape = ((forms[k] | 0) % 4 + 4) % 4;
    strokes.push(...form(shape, slotAngle(k), R, r));
  }
  // Dots: short blots outside the ring between the top and right slots.
  for (let d = 0; d < Math.min(3, Math.max(0, dots | 0)); d++) {
    const a = Math.PI / 2 - 0.42 - d * 0.22;
    const cx = Math.cos(a) * (R + 0.2), cy = Math.sin(a) * (R + 0.2);
    strokes.push([[cx - 0.012, cy, 1.4], [cx + 0.012, cy + 0.006, 1.4]]);
  }
  return strokes;
}

/** Cumulative arc length plan: each stroke's start/end in normalised draw time [0, 1], with pen lifts. */
export function strokeTimes(strokes, liftLength = 0.06) {
  const lens = strokes.map((s) => { let L = 0; for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); return Math.max(L, 0.02); });
  const total = lens.reduce((a, b) => a + b, 0) + liftLength * (strokes.length - 1);
  let acc = 0;
  return lens.map((L, i) => { const t0 = acc / total; acc += L; const t1 = acc / total; acc += liftLength; void i; return [t0, t1]; });
}

/** Pen tip position [x, y] at draw progress p in [0, 1], or null during a pen lift / after the end. */
export function penAt(strokes, p, times = strokeTimes(strokes)) {
  for (let i = 0; i < strokes.length; i++) {
    const [t0, t1] = times[i];
    if (p < t0) return null;
    if (p <= t1) {
      const s = strokes[i];
      const u = (p - t0) / Math.max(1e-9, t1 - t0);
      // walk by arc length
      let L = 0; const seg = [];
      for (let k = 1; k < s.length; k++) { const l = Math.hypot(s[k][0] - s[k - 1][0], s[k][1] - s[k - 1][1]); seg.push(l); L += l; }
      let d = u * L;
      for (let k = 0; k < seg.length; k++) {
        if (d <= seg[k] || k === seg.length - 1) { const f = seg[k] > 0 ? Math.min(1, d / seg[k]) : 0; return [s[k][0] + (s[k + 1][0] - s[k][0]) * f, s[k][1] + (s[k + 1][1] - s[k][1]) * f]; }
        d -= seg[k];
      }
      return [s[s.length - 1][0], s[s.length - 1][1]];
    }
  }
  return null;
}

/**
 * Rasterises strokes into an RGBA8 field (size x size) for the ink shader:
 *   R = distance to the nearest stroke centreline (0..1 maps to 0..maxDist disc units)
 *   G = draw time of that nearest point (0..1, stroke order with pen lifts)
 *   B = brush width (pressure) there (0..1 maps to 0..2)
 *   A = 255
 * Brute force over segments with a bounding cull: ~30 ms for 256^2 in a browser, done once per sign.
 */
export function rasterizeLogogram(strokes, size = 256, maxDist = 0.16) {
  const times = strokeTimes(strokes);
  const segs = [];
  strokes.forEach((s, si) => {
    let L = 0; const total = [];
    for (let k = 1; k < s.length; k++) { L += Math.hypot(s[k][0] - s[k - 1][0], s[k][1] - s[k - 1][1]); total.push(L); }
    const [t0, t1] = times[si];
    let prev = 0;
    for (let k = 1; k < s.length; k++) {
      const ta = t0 + (t1 - t0) * (L > 0 ? prev / L : 0), tb = t0 + (t1 - t0) * (L > 0 ? total[k - 1] / L : 1);
      segs.push([s[k - 1][0], s[k - 1][1], s[k][0], s[k][1], ta, tb, s[k - 1][2], s[k][2]]);
      prev = total[k - 1];
    }
  });
  const out = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    const y = 1 - (py + 0.5) / size * 2;   // row 0 = top (+y), matches flipY = false upload
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size * 2 - 1;
      let best = maxDist * maxDist, bt = 1, bw = 0;
      for (let i = 0; i < segs.length; i++) {
        const g = segs[i];
        const minx = Math.min(g[0], g[2]) - maxDist, maxx = Math.max(g[0], g[2]) + maxDist;
        if (x < minx || x > maxx) continue;
        const miny = Math.min(g[1], g[3]) - maxDist, maxy = Math.max(g[1], g[3]) + maxDist;
        if (y < miny || y > maxy) continue;
        const dx = g[2] - g[0], dy = g[3] - g[1];
        const l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((x - g[0]) * dx + (y - g[1]) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = g[0] + dx * t - x, ey = g[1] + dy * t - y;
        const d2 = ex * ex + ey * ey;
        if (d2 < best) { best = d2; bt = g[4] + (g[5] - g[4]) * t; bw = g[6] + (g[7] - g[6]) * t; }
      }
      const o = (py * size + px) * 4;
      out[o] = Math.round(Math.min(1, Math.sqrt(best) / maxDist) * 255);
      out[o + 1] = Math.round(Math.min(1, Math.max(0, bt)) * 255);
      out[o + 2] = Math.round(Math.min(1, bw / 2) * 255);
      out[o + 3] = 255;
    }
  }
  return { data: out, size, maxDist, times };
}
