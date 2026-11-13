// Placed props that carry no collider, as footprints the walkers keep clear of (owner 13.11: "NPCs must not run
// through objects"): circles in town-local metres [x, y, z] with radius r, the prop's own half-size plus a 0.5 m
// margin. The path graph is checked against them (tests/client/town-paths.test.mjs); everything with a collider
// (walls, stalls, tables, crates, lamp posts in the town's pieces) is checked against the recorded clearance instead.
// Pure: positions come from the same placement functions the props use.
import { TOWN_SHOPS, besideDoor, BOARD_SPOT, WHEEL_SPOT, TOWN_SPOTS, townToLocal } from './town-layout.js';
import { HATCHKEEPER, DRAGON_LOOPS } from './hatchkeeper-rules.js';
import { OBSTACLES } from './town-obstacles.js';

export const MARGIN = 0.5;
/** scenes/town-portal.js PORTAL_TOWN and scenes/town-board.js BOARD_TOWN (a test keeps them equal; not imported: they load three.js). */
export const PORTAL_AT = Object.freeze([4.4, 0, 24.8]);
export const NOTICE_AT = Object.freeze([-4, 0, 22.5]);

const shop = (id) => TOWN_SHOPS.find((s) => s.id === id);
const at = (spot) => { const s = shop(spot.shop); return s ? townToLocal(besideDoor(s.door, spot.out, spot.side).position) : null; }; // shop doors are world metres

/** Every footprint: {id, at: [x, y, z], r, height?} (height: how high above the ground it reaches; walkers pass under none). */
export function propFootprints() {
  const out = [];
  const add = (id, p, half) => { if (p) out.push(Object.freeze({ id, at: Object.freeze(p.slice()), r: half + MARGIN })); };
  add('trading_board', at(BOARD_SPOT), 1.0); // the slate board with its counter and lanterns (trading_board.glb, ~2 m wide)
  add('wheel_of_fortune', at(WHEEL_SPOT), 0.75);
  add('gate_loom', PORTAL_AT, 1.4);
  add('notice_board', NOTICE_AT, 0.8);
  add('notice_board_spot', TOWN_SPOTS.board, 0.75);
  add('mirror', TOWN_SPOTS.mirror, 0.45);
  add('hatchkeeper', HATCHKEEPER.pos, 0.35);
  add('hatchkeeper_dragons', HATCHKEEPER.pos, Math.max(...DRAGON_LOOPS.map((l) => l.radius))); // the loop the dragons fly
  OBSTACLES.forEach((p, i) => out.push(Object.freeze({ id: 'collider_' + i, at: p, r: BODY + 0.12, solid: true }))); // recorded solid points: a body clears them
  return out;
}
export const BODY = 0.35;

/** Distance in the ground plane from point p to segment a-b. */
export function segDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[2] - a[2], L2 = dx * dx + dz * dz;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / L2)) : 0;
  return Math.hypot(a[0] + dx * t - p[0], a[2] + dz * t - p[2]);
}
/** The footprints an edge a-b crosses (same level: within 2 m in height). */
export function edgeCrossings(a, b, prints = propFootprints()) {
  return prints.filter((f) => Math.abs((a[1] + b[1]) / 2 - f.at[1]) < 2 && segDist(f.at, a, b) < f.r);
}

/**
 * A polyline that walks round every footprint it would cross (pure): each crossing segment gets three waypoints on
 * an arc just outside the circle, on the side its closest point already lies. Heights follow the segment.
 */
export function detour(pts, prints = propFootprints()) {
  let out = pts.map((p) => p.slice());
  for (const p of out) for (const f of prints) { // a vertex inside a footprint moves out to its edge
    if (Math.abs(p[1] - f.at[1]) >= 2) continue;
    const dx = p[0] - f.at[0], dz = p[2] - f.at[2], d = Math.hypot(dx, dz);
    if (d < f.r) { const k = d > 1e-6 ? (f.r + 0.02) / d : 0; if (k) { p[0] = f.at[0] + dx * k; p[2] = f.at[2] + dz * k; } else p[0] += f.r + 0.02; }
  }
  for (let pass = 0; pass < 8; pass++) {
    let changed = false; const next = [out[0]];
    for (let i = 0; i + 1 < out.length; i++) {
      const a = out[i], b = out[i + 1], hit = edgeCrossings(a, b, prints)[0];
      if (hit) {
        const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, c = hit.at, R = hit.r + 0.15;
        const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[2] - a[2]) * dz) / (L * L)));
        const qx = a[0] + dx * t, qz = a[2] + dz * t; let nx = -uz, nz = ux;
        if ((qx - c[0]) * nx + (qz - c[2]) * nz < 0) { nx = -nx; nz = -nz; } // keep to the side the path already passes on
        const y = (s) => a[1] + (b[1] - a[1]) * Math.max(0, Math.min(1, s));
        for (const [along, across] of [[-0.75, 0.7], [0, 1], [0.75, 0.7]]) {
          const px = c[0] + ux * along * R + nx * across * R, pz = c[2] + uz * along * R + nz * across * R;
          next.push([px, y(((px - a[0]) * dx + (pz - a[2]) * dz) / (L * L)), pz]);
        }
        changed = true;
      }
      next.push(b);
    }
    out = next; if (!changed) break;
  }
  return out;
}
