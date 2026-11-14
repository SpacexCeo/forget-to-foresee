// The Shell's own curve, in model space (pure math, no three.js; node-tested). The v2 Shells are one analytic
// surface (art/shells/shell_v2_geo.py): a whorl section swept along a logarithmic helico-spiral, apex up. The same
// numbers here give the suture (the groove where a whorl meets the one above it) and the outline of the spire, so
// the effects in render/shell-aura.js sit on the real model without reading its geometry.
// Model space is the glTF's: Y up, metres, pivot at the bottom centre, 18 m tall.

const TAU = Math.PI * 2;
/** Constants of art/shells/shell_v2_geo.py (keep in step with it; tests/client/shell-aura.test.mjs holds reference points). */
export const SHELL = Object.freeze({
  W: 1.19, G0: 0.036, RHO: 1.22, A: 1.18, B: 1.62, H: 14.70, SUPER: 2.5, FLARE_BACK: 0.20,
  PSI_SUTURE: 0.60 * Math.PI,       // PSI_HI: the upper edge of the visible arc of a whorl
  ZB: -17.873578060826375,          // bottom_z(): the tip of the canal in build space
  SCALE: 1.0070731186975206,        // TARGET_H / -ZB
  HEIGHT: 18,
});
/** Whorls from the apex to the aperture, and the spiral angle where the apex ring sits (the aperture is at 0). */
export const SHELL_WHORLS = Math.log(1 / SHELL.G0) / Math.log(SHELL.W);
export const SHELL_THETA_START = -TAU * SHELL_WHORLS;

const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const spow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);
/** Scale of the whorl at spiral angle theta (1 at the aperture, G0 at the apex). */
export const shellScale = (theta) => Math.pow(SHELL.W, theta / TAU);

/**
 * A point of the suture at spiral angle `theta` (<= 0; 0 is the aperture end), lifted `lift` metres (at scale 1)
 * out of the groove, away from the axis. Returns [x, y, z] in model space.
 */
export function suturePoint(theta, lift = 0) {
  const S = SHELL, g = shellScale(theta), psi = S.PSI_SUTURE;
  const x = S.A * spow(Math.cos(psi), 2 / S.SUPER);
  const qf = Math.pow(smooth((theta + TAU * S.FLARE_BACK) / (TAU * S.FLARE_BACK)), 2);
  const y = S.B * spow(Math.sin(psi), 2 / S.SUPER) * (1 + 0.07 * qf);
  const r = g * (S.RHO + x + lift);
  const bx = r * Math.cos(theta), by = -r * Math.sin(theta), bz = g * (y - S.H);
  // build space (Z up, the aperture toward -Y) -> glTF (Y up, the aperture toward +Z)
  return [bx * S.SCALE, (bz - S.ZB) * S.SCALE, -by * S.SCALE];
}

/**
 * The suture as a polyline from the aperture up toward the apex: `whorls` turns, `perWhorl` samples each.
 * Each sample: {p: [x, y, z], g: whorl scale, u: turns from the aperture (0..whorls), out: [x, z] unit, away from the axis}.
 */
export function sutureSamples({ whorls = 12, perWhorl = 40, lift = 0.05 } = {}) {
  const n = Math.max(2, Math.round(whorls * perWhorl));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * whorls, theta = -TAU * u;
    const p = suturePoint(theta, lift);
    const d = Math.hypot(p[0], p[2]) || 1;
    out.push({ p, g: shellScale(theta), u, out: [p[0] / d, p[2] / d] });
  }
  return out;
}

/**
 * The spire's outline: radius (m) of the Shell around its axis at height y. Zero above the apex and below the
 * canal's tip; the widest whorl is about 2.4 m out, a little above the base.
 */
export function spireRadius(y) {
  const S = SHELL;
  if (y <= 0 || y >= S.HEIGHT) return 0;
  // the whorl whose centre sits at this height: y = (g * -H - ZB) * SCALE
  const g = (-S.ZB - y / S.SCALE) / S.H;
  if (g >= 1) { // below the body whorl's centre: the body's lower half, then the canal narrowing to its tip
    const t = Math.min(1, y / ((-S.ZB - S.H) * S.SCALE));
    return (S.RHO + S.A) * S.SCALE * Math.sqrt(Math.max(0, t)) * (0.55 + 0.45 * t);
  }
  return Math.max(0, g) * (S.RHO + S.A) * S.SCALE;
}
