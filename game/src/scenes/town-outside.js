// Outside the town walls (docs/town.md, "Outside the walls"): pure helpers, node-tested.
//
// The lower gate is an exit. Its file still carries the colliders that closed the passage (a slab between the
// leaves, the outer face of the gatehouse and the plane along the whole wall line), so the client carves a box out
// of the gate piece's collision triangles: every triangle is clipped against the six slabs around the box and only
// the parts outside it are kept. The walls, the gatehouse sides and the lintel above the arch stay solid.
//
// The hillside beyond the walls has no collision mesh in `town_terrain`; its visual ground and road
// (`town_terrain_ground`, `town_terrain_cobble`) become the walkable floor there. Coordinates are town-local metres.

/** The passage through the lower gate: x across, y up from the street, z out of town. */
export const GATE_PASSAGE = Object.freeze({ min: [-2.4, -2.0, 32.5], max: [2.4, 4.2, 39.0] });

/** The passage floor (street level): neither the gate nor the terrain carries a collider under it. */
export const GATE_FLOOR = Object.freeze({ min: [-2.6, -0.6, 33.5], max: [2.6, 0, 36.4] });

/** Ground beyond the walls: in front of the lower gate, or past the side walls. */
export const OUTSIDE_FRONT_Z = 33.5;
export const OUTSIDE_SIDE_X = 53;
/** Iris counts as outside (the casting field) once she is clear of the gatehouse. */
export const FIELD_FRONT_Z = 39.5;
/** The hillside runs about 110 m down into the cloud sea; the town's own kill height (−12 m) would catch her on it. */
export const OUTSIDE_KILL_Y = -118;
/** Visual meshes of `town_terrain` that become ground beyond the walls. */
export const OUTSIDE_GROUND_MESH = /^town_terrain_(ground|cobble)(?:$|[._])/;

/** True when a town-local point lies on the ground beyond the walls (where the visual ground becomes a collider). */
export function beyondWalls(x, z) {
  return z > OUTSIDE_FRONT_Z || Math.abs(x) > OUTSIDE_SIDE_X;
}

/** True when a town-local point is on the casting field: outside the walls and clear of the gatehouse. */
export function onField(x, z) {
  return z > FIELD_FRONT_Z || Math.abs(x) > OUTSIDE_SIDE_X + 2;
}

// Sutherland–Hodgman against one half-space {p : sign * (p[axis] - value) <= 0}.
function clipPoly(poly, axis, value, sign) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = sign * (a[axis] - value), db = sign * (b[axis] - value);
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

function polyArea2(p) {
  let x = 0, y = 0, z = 0;
  for (let i = 1; i + 1 < p.length; i++) {
    const ax = p[i][0] - p[0][0], ay = p[i][1] - p[0][1], az = p[i][2] - p[0][2];
    const bx = p[i + 1][0] - p[0][0], by = p[i + 1][1] - p[0][1], bz = p[i + 1][2] - p[0][2];
    x += ay * bz - az * by; y += az * bx - ax * bz; z += ax * by - ay * bx;
  }
  return Math.hypot(x, y, z);
}

/**
 * Removes an axis-aligned box from a flat triangle list. Walkable floors (normal within ~45° of up) are never cut, so
 * the street through the passage stays while the slabs and sills across it go down to their feet. ([x,y,z, x,y,z, x,y,z, ...]). Triangles that miss the box
 * are kept as they are; the others are split into the pieces outside it (same winding). Returns a new array.
 */
export function carveBox(flat, min, max, keepFloors = true) {
  const out = [];
  // The outside of the box as six disjoint convex regions: x below, x above, then inside x: y below, y above,
  // then inside x and y: z below, z above. Each is a list of half-spaces [axis, value, sign].
  const regions = [
    [[0, min[0], 1]],
    [[0, max[0], -1]],
    [[0, min[0], -1], [0, max[0], 1], [1, min[1], 1]],
    [[0, min[0], -1], [0, max[0], 1], [1, max[1], -1]],
    [[0, min[0], -1], [0, max[0], 1], [1, min[1], -1], [1, max[1], 1], [2, min[2], 1]],
    [[0, min[0], -1], [0, max[0], 1], [1, min[1], -1], [1, max[1], 1], [2, max[2], -1]],
  ];
  for (let i = 0; i + 8 < flat.length; i += 9) {
    const tri = [[flat[i], flat[i + 1], flat[i + 2]], [flat[i + 3], flat[i + 4], flat[i + 5]], [flat[i + 6], flat[i + 7], flat[i + 8]]];
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of tri) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    let touches = true;
    for (let k = 0; k < 3; k++) if (hi[k] <= min[k] || lo[k] >= max[k]) touches = false;
    if (touches && keepFloors) {
      const ax = tri[1][0] - tri[0][0], ay = tri[1][1] - tri[0][1], az = tri[1][2] - tri[0][2];
      const bx = tri[2][0] - tri[0][0], by = tri[2][1] - tri[0][1], bz = tri[2][2] - tri[0][2];
      const ny = az * bx - ax * bz, len = Math.hypot(ay * bz - az * by, ny, ax * by - ay * bx);
      if (len > 0 && Math.abs(ny) / len > 0.7) touches = false; // a floor (or a ceiling): keep it whole
    }
    if (!touches) { for (let j = 0; j < 9; j++) out.push(flat[i + j]); continue; }
    for (const region of regions) {
      let poly = tri;
      for (const [axis, value, sign] of region) { poly = clipPoly(poly, axis, value, sign); if (poly.length < 3) break; }
      if (poly.length < 3 || polyArea2(poly) < 1e-6) continue;
      for (let j = 1; j + 1 < poly.length; j++) out.push(...poly[0], ...poly[j], ...poly[j + 1]);
    }
  }
  return out;
}

/**
 * Keeps the triangles of a flat list with at least one vertex where `keep(x, z)` holds (town-local, given the
 * origin). Any vertex, not the centroid: the road's first strip past the gate shares long triangles with the street.
 */
export function filterTriangles(flat, origin, keep) {
  const out = [];
  for (let i = 0; i + 8 < flat.length; i += 9) {
    let any = false;
    for (let v = 0; v < 9 && !any; v += 3) any = keep(flat[i + v] - origin[0], flat[i + v + 2] - origin[2]);
    if (any) for (let j = 0; j < 9; j++) out.push(flat[i + j]);
  }
  return out;
}
