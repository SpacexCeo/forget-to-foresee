// Breadcrumbs of the path the player actually walked in the 3D client, simplified into the waypoint
// list the room's `move {path}` accepts (at most 32 points [x, z]). The room re-simulates that walk
// with the same capsule and colliders, so a replay can never cut through walls the player could not.
// Pure functions: covered by node tests.

export const MAX_WAYPOINTS = 32;
const r3 = (v) => Math.round(v * 1000) / 1000;

export class Trail {
  /** @param {number[]} start [x, y, z] @param {{spacing?: number}} [o] */
  constructor(start, { spacing = 0.9 } = {}) {
    this.spacing = spacing;
    this.reset(start);
  }

  reset(pos) { this.points = [[r3(pos[0]), r3(pos[2])]]; this.length = 0; }

  /** Records the position when it moved at least `spacing` meters from the last breadcrumb. */
  record(pos) {
    const last = this.points[this.points.length - 1];
    const d = Math.hypot(pos[0] - last[0], pos[2] - last[1]);
    if (d >= this.spacing) { this.points.push([r3(pos[0]), r3(pos[2])]); this.length += d; }
  }

  /** Waypoints from the trail start to `pos` (the start itself is where the room avatar stands). */
  waypoints(pos) {
    const pts = this.points.slice();
    const last = pts[pts.length - 1];
    if (Math.hypot(pos[0] - last[0], pos[2] - last[1]) > 0.05) pts.push([r3(pos[0]), r3(pos[2])]);
    return capWaypoints(simplify(pts, 0.35)).slice(1);
  }
}

/** Ramer-Douglas-Peucker in the ground plane; keeps the first and last point. */
export function simplify(pts, eps = 0.35) {
  if (pts.length <= 2) return pts.slice();
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bestD = eps;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(pts[i], pts[a], pts[b]);
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0) { keep[best] = true; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Uniformly thins a list to at most `max` points, keeping the first and last. */
export function capWaypoints(pts, max = MAX_WAYPOINTS + 1) {
  if (pts.length <= max) return pts;
  const out = [];
  for (let k = 0; k < max; k++) out.push(pts[Math.round((k * (pts.length - 1)) / (max - 1))]);
  return out;
}

function segDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}
