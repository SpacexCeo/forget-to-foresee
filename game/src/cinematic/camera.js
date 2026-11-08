// Scripted camera moves for the shots, as data → pose functions. Every move is a pure function of
// normalised time u in [0, 1] returning {pos: [x,y,z], look: [x,y,z], fov, roll} in world metres, so the
// node tests can check start and end poses, continuity and that no move dips under the ground.
// Vocabulary (the shot scripts in tools/capture/shots use it):
//   dolly   straight or splined move through `path` points while looking at `look` (a point, a path
//           of the same length, or 'ahead' = along the motion)
//   orbit   circle around `center` at `radius`, from `yawFrom` to `yawTo` degrees, height `height`,
//           optional radius/height change over the move
//   crane   rises or lowers: `from` → `to` height over the same ground track as a dolly
//   push    dolly toward `look` along the view ray from `dist0` to `dist1`
//   static  hold a pose with a slow drift (`drift` metres), so nothing is ever perfectly still
//   rig     the game's own follow camera (handled by the runner; here it returns null)
import { Spline, Track, ease, lerp, lerpV } from './ease.js';

const DEG = Math.PI / 180;

/** Resolves `fov` given as a number or [start, end] at u. */
function fovAt(spec, u) {
  const f = spec.fov ?? 38;
  return Array.isArray(f) ? lerp(f[0], f[1], u) : f;
}
function rollAt(spec, u) {
  const r = spec.roll ?? 0;
  return (Array.isArray(r) ? lerp(r[0], r[1], u) : r) * DEG;
}

/** Point on a ring: angle in degrees, 0 = +X, 90 = +Z (same convention as scenes/layout.js). */
export const onRing = (center, radius, angleDeg, y) => [center[0] + Math.cos(angleDeg * DEG) * radius, y, center[2] + Math.sin(angleDeg * DEG) * radius];

/** Compiles a camera spec into pose(u). */
export function compileCamera(spec) {
  if (!spec || spec.type === 'rig') return null;
  const E = (u) => ease(spec.ease || 'inOutCubic', u);
  switch (spec.type) {
    case 'dolly': case 'crane': {
      const pts = spec.path.map((p) => p.slice());
      if (spec.type === 'crane') { pts[0][1] = spec.from ?? pts[0][1]; pts[pts.length - 1][1] = spec.to ?? pts[pts.length - 1][1]; }
      const path = new Spline(pts);
      const lookPath = Array.isArray(spec.look) && Array.isArray(spec.look[0]) ? new Spline(spec.look) : null;
      return (u) => {
        const e = E(u);
        const pos = path.atLength(e);
        let look;
        if (lookPath) look = lookPath.atLength(e);
        else if (spec.look === 'ahead') { const n = path.atLength(Math.min(1, e + 0.02)); look = [n[0] + (n[0] - pos[0]) * 20, n[1] + (n[1] - pos[1]) * 20, n[2] + (n[2] - pos[2]) * 20]; }
        else look = spec.look;
        return { pos, look: look.slice(), fov: fovAt(spec, e), roll: rollAt(spec, e) };
      };
    }
    case 'orbit': {
      const c = spec.center;
      const r0 = Array.isArray(spec.radius) ? spec.radius[0] : spec.radius, r1 = Array.isArray(spec.radius) ? spec.radius[1] : spec.radius;
      const h0 = Array.isArray(spec.height) ? spec.height[0] : spec.height, h1 = Array.isArray(spec.height) ? spec.height[1] : spec.height;
      const lookAt = spec.look || [c[0], c[1] + (spec.lookHeight ?? 0), c[2]];
      const lookTrack = Array.isArray(lookAt[0]) ? lookAt : null;
      return (u) => {
        const e = E(u);
        const yaw = lerp(spec.yawFrom, spec.yawTo, e);
        const pos = onRing(c, lerp(r0, r1, e), yaw, lerp(h0, h1, e));
        const look = lookTrack ? lerpV(lookTrack[0], lookTrack[1], e) : lookAt.slice();
        return { pos, look, fov: fovAt(spec, e), roll: rollAt(spec, e) };
      };
    }
    case 'push': {
      const look = spec.look;
      const dir = spec.dir ? norm(spec.dir) : norm([spec.from[0] - look[0], spec.from[1] - look[1], spec.from[2] - look[2]]);
      const d0 = spec.dist0 ?? Math.hypot(spec.from[0] - look[0], spec.from[1] - look[1], spec.from[2] - look[2]);
      return (u) => {
        const e = E(u);
        const d = lerp(d0, spec.dist1, e);
        const look2 = spec.lookTo ? lerpV(look, spec.lookTo, e) : look.slice();
        return { pos: [look2[0] + dir[0] * d, look2[1] + dir[1] * d, look2[2] + dir[2] * d], look: look2, fov: fovAt(spec, e), roll: rollAt(spec, e) };
      };
    }
    case 'static': {
      const drift = spec.drift ?? 0.25;
      return (u) => {
        // A slow figure-eight breath, never a hard freeze (pure beauty shots still feel alive).
        const a = u * Math.PI * 2 * (spec.driftCycles ?? 0.5);
        const pos = [spec.pos[0] + Math.sin(a) * drift, spec.pos[1] + Math.sin(2 * a) * drift * 0.3, spec.pos[2] + Math.cos(a) * drift * 0.6];
        return { pos, look: spec.look.slice(), fov: fovAt(spec, u), roll: rollAt(spec, u) };
      };
    }
    case 'keys': {
      // Fully keyframed: pos/look/fov tracks in shot seconds; `duration` scales u.
      const pos = new Track(spec.pos), look = new Track(spec.look), fov = spec.fov ? new Track(spec.fov) : null;
      return (u) => {
        const t = u * spec.duration;
        return { pos: pos.at(t), look: look.at(t), fov: fov ? fov.at(t) : 38, roll: rollAt(spec, u) };
      };
    }
    default: throw new Error('unknown camera type ' + spec.type);
  }
}

function norm(v) { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); }

/** Lowest camera height over the whole move (sampled); shots must stay above the walkable tops. */
export function minHeight(pose, samples = 64) {
  let m = Infinity;
  for (let i = 0; i <= samples; i++) m = Math.min(m, pose(i / samples).pos[1]);
  return m;
}

/** Largest position jump between adjacent samples (metres); a smooth move has small ones. */
export function maxStep(pose, samples = 240) {
  let m = 0, prev = pose(0).pos;
  for (let i = 1; i <= samples; i++) { const p = pose(i / samples).pos; m = Math.max(m, Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2])); prev = p; }
  return m;
}
