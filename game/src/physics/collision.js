// Collision world for the 3D client: triangle soup in a uniform XZ grid, a kinematic
// capsule with swept collide-and-slide movement, a sphere sweep for the camera and a ray cast.
// Pure math on plain numbers: no three.js, no DOM, so it runs under `node --test`.
//
// Units: meters, Y up. Triangles come from `_col` meshes of .glb assets and from greybox
// colliders, already transformed to world space by the caller.

export const MASK_PLAYER = 1;
export const MASK_CAMERA = 2;
export const MASK_ALL = MASK_PLAYER | MASK_CAMERA;

const EPS = 1e-9;

/* ---------- small vector helpers on [x, y, z] arrays ---------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len2 = (a) => dot(a, a);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Closest point on triangle abc to point p (Ericson, Real-Time Collision Detection 5.1.5). */
export function closestPointTriangle(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a.slice();
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b.slice();
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, scale(ab, d1 / (d1 - d3)));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c.slice();
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, scale(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, scale(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  return add(a, add(scale(ab, vb * denom), scale(ac, vc * denom)));
}

/** Closest points between segments p1q1 and p2q2 (Ericson 5.1.9). Returns [c1, c2]. */
export function closestSegmentSegment(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = len2(d1), e = len2(d2), f = dot(d2, r);
  let s, t;
  if (a <= EPS && e <= EPS) return [p1.slice(), p2.slice()];
  if (a <= EPS) { s = 0; t = clamp01(f / e); }
  else {
    const c = dot(d1, r);
    if (e <= EPS) { t = 0; s = clamp01(-c / a); }
    else {
      const b = dot(d1, d2), denom = a * e - b * b;
      s = denom > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); } else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  return [add(p1, scale(d1, s)), add(p2, scale(d2, t))];
}

/** Segment pq against triangle abc (two-sided): returns the hit parameter along pq in [0, 1], or -1. */
export function segmentTriangleHit(p, q, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), dir = sub(q, p);
  const h = cross(dir, ac), det = dot(ab, h);
  if (Math.abs(det) < EPS) return -1;
  const inv = 1 / det, s = sub(p, a), u = inv * dot(s, h);
  if (u < 0 || u > 1) return -1;
  const qv = cross(s, ab), v = inv * dot(dir, qv);
  if (v < 0 || u + v > 1) return -1;
  const t = inv * dot(ac, qv);
  return t >= 0 && t <= 1 ? t : -1;
}

/** Closest points between segment pq and triangle abc. Returns {d2, onSeg, onTri}. */
export function closestSegmentTriangle(p, q, a, b, c) {
  const t = segmentTriangleHit(p, q, a, b, c);
  if (t >= 0) { const x = add(p, scale(sub(q, p), t)); return { d2: 0, onSeg: x, onTri: x.slice() }; }
  let best = null;
  const consider = (s, tr) => { const d2 = len2(sub(s, tr)); if (!best || d2 < best.d2) best = { d2, onSeg: s, onTri: tr }; };
  consider(p, closestPointTriangle(p, a, b, c));
  consider(q, closestPointTriangle(q, a, b, c));
  for (const [e0, e1] of [[a, b], [b, c], [c, a]]) { const [s, tr] = closestSegmentSegment(p, q, e0, e1); consider(s, tr); }
  return best;
}

/* ---------- the world ---------- */
export class CollisionWorld {
  constructor({ cellSize = 2 } = {}) {
    this.cellSize = cellSize;
    this.cap = 0; this.count = 0;
    this.v = new Float64Array(0);      // 9 floats per triangle
    this.box = new Float64Array(0);    // 6 floats per triangle: min xyz, max xyz
    this.mask = new Uint8Array(0);
    this.stamp = new Uint32Array(0);
    this.byOwner = new Map();           // owner -> triangle ids
    this.cells = new Map();             // cell key -> triangle ids
    this.queryStamp = 0;
    this.liveCount = 0;
  }

  grow(n) {
    if (this.count + n <= this.cap) return;
    const cap = Math.max(1024, (this.count + n) * 2);
    const nv = new Float64Array(cap * 9); nv.set(this.v); this.v = nv;
    const nb = new Float64Array(cap * 6); nb.set(this.box); this.box = nb;
    const nm = new Uint8Array(cap); nm.set(this.mask); this.mask = nm;
    const ns = new Uint32Array(cap); ns.set(this.stamp); this.stamp = ns;
    this.cap = cap;
  }

  key(ix, iz) { return (ix + 32768) * 65536 + (iz + 32768); }

  /** Adds world-space triangles (flat array, 9 numbers per triangle) under `owner`. */
  addTriangles(owner, flat, mask = MASK_ALL) {
    const n = Math.floor(flat.length / 9);
    this.grow(n);
    let ids = this.byOwner.get(owner);
    if (!ids) { ids = []; this.byOwner.set(owner, ids); }
    const cs = this.cellSize;
    for (let i = 0; i < n; i++) {
      const id = this.count++;
      const o = i * 9;
      let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
      for (let k = 0; k < 3; k++) {
        const x = flat[o + k * 3], y = flat[o + k * 3 + 1], z = flat[o + k * 3 + 2];
        this.v[id * 9 + k * 3] = x; this.v[id * 9 + k * 3 + 1] = y; this.v[id * 9 + k * 3 + 2] = z;
        if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z;
        if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z;
      }
      const b = id * 6;
      this.box[b] = mnx; this.box[b + 1] = mny; this.box[b + 2] = mnz; this.box[b + 3] = mxx; this.box[b + 4] = mxy; this.box[b + 5] = mxz;
      this.mask[id] = mask;
      ids.push(id); this.liveCount++;
      for (let ix = Math.floor(mnx / cs); ix <= Math.floor(mxx / cs); ix++) {
        for (let iz = Math.floor(mnz / cs); iz <= Math.floor(mxz / cs); iz++) {
          const k = this.key(ix, iz);
          let cell = this.cells.get(k);
          if (!cell) { cell = []; this.cells.set(k, cell); }
          cell.push(id);
        }
      }
    }
    return n;
  }

  /** Axis-aligned box as 12 outward-facing triangles. */
  addBox(owner, min, max, mask = MASK_ALL) { return this.addTriangles(owner, boxTriangles(min, max), mask); }

  /** Removes every triangle that belongs to `owner` (slots are not reused; fine for a slice-sized world). */
  removeOwner(owner) {
    const ids = this.byOwner.get(owner);
    if (!ids) return 0;
    const dead = new Set(ids);
    this.liveCount -= ids.length;
    for (const [k, cell] of this.cells) {
      if (!cell.some((id) => dead.has(id))) continue;
      const kept = cell.filter((id) => !dead.has(id));
      if (kept.length) this.cells.set(k, kept); else this.cells.delete(k);
    }
    this.byOwner.delete(owner);
    return ids.length;
  }

  hasOwner(owner) { return this.byOwner.has(owner); }

  /** Triangle ids whose AABB overlaps the query box and whose mask matches. */
  query(min, max, mask, out = []) {
    out.length = 0;
    if (++this.queryStamp >= 0xffffffff) { this.stamp.fill(0); this.queryStamp = 1; }
    const s = this.queryStamp;
    const cs = this.cellSize;
    const x0 = Math.floor(min[0] / cs), x1 = Math.floor(max[0] / cs), z0 = Math.floor(min[2] / cs), z1 = Math.floor(max[2] / cs);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const cell = this.cells.get(this.key(ix, iz));
        if (!cell) continue;
        for (const id of cell) {
          if (this.stamp[id] === s || !(this.mask[id] & mask)) continue;
          this.stamp[id] = s;
          const b = id * 6;
          if (this.box[b] > max[0] || this.box[b + 3] < min[0] || this.box[b + 1] > max[1] || this.box[b + 4] < min[1] || this.box[b + 2] > max[2] || this.box[b + 5] < min[2]) continue;
          out.push(id);
        }
      }
    }
    return out;
  }

  tri(id) {
    const o = id * 9, v = this.v;
    return [[v[o], v[o + 1], v[o + 2]], [v[o + 3], v[o + 4], v[o + 5]], [v[o + 6], v[o + 7], v[o + 8]]];
  }
}

/** Axis-aligned box as a flat triangle array. */
export function boxTriangles(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const p = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]];
  const out = [];
  for (const [a, b, c, d] of quads) out.push(...p[a], ...p[b], ...p[c], ...p[a], ...p[c], ...p[d]);
  return out;
}

/** Closed vertical prism (cylinder approximation) as a flat triangle array. */
export function prismTriangles(cx, cz, radius, y0, y1, sides = 8) {
  const out = [];
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
    const ax = cx + Math.cos(a0) * radius, az = cz + Math.sin(a0) * radius;
    const bx = cx + Math.cos(a1) * radius, bz = cz + Math.sin(a1) * radius;
    out.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
    out.push(cx, y1, cz, bx, y1, bz, ax, y1, az);
    out.push(cx, y0, cz, ax, y0, az, bx, y0, bz);
  }
  return out;
}

/** Transforms a flat triangle array by a column-major 4x4 matrix (three.js Matrix4.elements layout). */
export function transformTriangles(flat, m) {
  const out = new Array(flat.length);
  for (let i = 0; i < flat.length; i += 3) {
    const x = flat[i], y = flat[i + 1], z = flat[i + 2];
    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  return out;
}

/* ---------- kinematic capsule ---------- */

/** Core segment of a vertical capsule standing with its feet at `pos`. */
export function capsuleSegment(pos, radius, height) {
  return [[pos[0], pos[1] + radius, pos[2]], [pos[0], pos[1] + height - radius, pos[2]]];
}

function triNormal(a, b, c) {
  const n = cross(sub(b, a), sub(c, a)); const l = Math.sqrt(len2(n));
  return l > EPS ? scale(n, 1 / l) : [0, 1, 0];
}

/**
 * Moves a vertical capsule (feet at `pos`) by `delta` with swept collide-and-slide.
 * The sweep is conservative: the motion is split into substeps of at most `radius * 0.5`, and the
 * capsule is pushed out of every overlapping triangle after each substep. A substep can never carry
 * the core segment across a surface without first overlapping it, so there is no tunneling however
 * large `delta` is. Low frame rates only run more fixed 30 Hz steps; the step size never grows.
 * @returns {{pos:number[], grounded:boolean, groundNormal:number[]|null, hitWall:boolean, substeps:number}}
 */
export function moveCapsule(world, pos, delta, { radius = 0.35, height = 1.75, mask = MASK_PLAYER, walkableY = 0.7, iterations = 4, ledgeGrip = 0 } = {}) {
  let p = pos.slice();
  let remaining = delta.slice();
  const total = Math.sqrt(len2(delta));
  const substeps = Math.min(256, Math.max(1, Math.ceil(total / (radius * 0.5))));
  let grounded = false, groundNormal = null, hitWall = false;
  const ids = [];
  for (let s = 0; s < substeps; s++) {
    const left = substeps - s;
    const prev = p.slice();
    p = add(p, scale(remaining, 1 / left));
    remaining = scale(remaining, (left - 1) / left);
    for (let it = 0; it < iterations; it++) {
      let pushed = false;
      world.query([p[0] - radius, p[1] - 0.01, p[2] - radius], [p[0] + radius, p[1] + height + 0.01, p[2] + radius], mask, ids);
      for (const id of ids) {
        const [a, b, c] = world.tri(id);
        const [c0, c1] = capsuleSegment(p, radius, height);
        const hit = closestSegmentTriangle(c0, c1, a, b, c);
        if (hit.d2 >= radius * radius) continue;
        const d = Math.sqrt(hit.d2);
        let n;
        if (d > 1e-6) n = scale(sub(hit.onSeg, hit.onTri), 1 / d);
        else {
          // The core touches the surface exactly: orient the face normal toward where we came from.
          n = triNormal(a, b, c);
          const [pc] = capsuleSegment(prev, radius, height);
          if (dot(sub(pc, a), n) < 0) n = scale(n, -1);
        }
        const depth = radius - d;
        // Rim contact (the capsule bottom touches a triangle edge, not a face: a bridge mouth, a step, a curb).
        // With `ledgeGrip`, an overhang up to that distance still counts as ground (lift straight up, no
        // outward shove, so nobody slides off an edge they stand on); beyond it the capsule is simply
        // unsupported and falls. Without it every such contact is a wall (the exact legacy behaviour).
        if (ledgeGrip > 0 && n[1] > 0.15 && n[1] < walkableY && d > 1e-6 && Math.abs(dot(n, triNormal(a, b, c))) < 0.999) {
          const horiz = d * Math.hypot(n[0], n[2]);
          if (horiz <= ledgeGrip) {
            const lift = Math.sqrt(Math.max(0, radius * radius - horiz * horiz)) - d * n[1];
            if (lift > 0) p[1] += lift + 1e-5;
            grounded = true; groundNormal = [0, 1, 0];
            if (remaining[1] < 0) remaining[1] = 0;
            pushed = true;
          }
          continue;
        }
        if (n[1] >= walkableY) {
          // Walkable ground: lift straight up so the capsule does not slide down gentle slopes.
          p[1] += depth / n[1] + 1e-5;
          grounded = true; groundNormal = n;
          if (remaining[1] < 0) remaining[1] = 0;
        } else {
          let m = n;
          if (n[1] > -walkableY) {
            // Wall: push horizontally only, then slide the rest of the motion along it.
            const hl = Math.hypot(n[0], n[2]);
            m = hl > EPS ? [n[0] / hl, 0, n[2] / hl] : n;
            hitWall = true;
          }
          const k = dot(m, n) > EPS ? depth / dot(m, n) : depth;
          p = add(p, scale(m, k + 1e-5));
          const into = dot(remaining, m);
          if (into < 0) remaining = sub(remaining, scale(m, into));
        }
        pushed = true;
      }
      if (!pushed) break;
    }
  }
  // Ground probe: a resting contact within a small skin also counts as grounded.
  if (!grounded) {
    const probe = 0.04;
    const [c0] = capsuleSegment(p, radius, height);
    world.query([p[0] - radius, p[1] - probe, p[2] - radius], [p[0] + radius, p[1] + radius, p[2] + radius], mask, ids);
    for (const id of ids) {
      const [a, b, c] = world.tri(id);
      const hit = closestSegmentTriangle([c0[0], c0[1] - probe, c0[2]], c0, a, b, c);
      if (hit.d2 < radius * radius) {
        const n = triNormal(a, b, c);
        const up = n[1] >= 0 ? n : scale(n, -1);
        if (up[1] < walkableY) continue;
        // With ledge handling, a rim further out than the grip is not support (the capsule is falling off it).
        if (ledgeGrip > 0 && Math.hypot(hit.onTri[0] - c0[0], hit.onTri[2] - c0[2]) > ledgeGrip && hit.onTri[1] < c0[1] - probe) continue;
        grounded = true; groundNormal = up; break;
      }
    }
  }
  return { pos: p, grounded, groundNormal, hitWall, substeps };
}

/**
 * Sweeps a sphere from `from` to `to` and returns the largest safe fraction in [0, 1]
 * (1 = no hit, 0 = already touching at the start). Used by the camera so it never ends up inside
 * geometry. A swept sphere is a capsule between the two points, so every candidate triangle is
 * tested exactly, then the first contact is found by bisection.
 */
export function sweepSphere(world, from, to, radius, mask = MASK_CAMERA, iterations = 18) {
  const min = [Math.min(from[0], to[0]) - radius, Math.min(from[1], to[1]) - radius, Math.min(from[2], to[2]) - radius];
  const max = [Math.max(from[0], to[0]) + radius, Math.max(from[1], to[1]) + radius, Math.max(from[2], to[2]) + radius];
  const ids = world.query(min, max, mask, []);
  const dir = sub(to, from);
  const r2 = radius * radius;
  let best = 1;
  const dd = len2(dir), bx = world.box;
  for (const id of ids) {
    // Cheap reject first (no allocation): the sphere around the triangle's box is farther than the radius from the
    // still-open part of the sweep. A long camera boom crosses many cells; most candidates end here.
    const o = id * 6;
    const cx = (bx[o] + bx[o + 3]) / 2, cy = (bx[o + 1] + bx[o + 4]) / 2, cz = (bx[o + 2] + bx[o + 5]) / 2;
    const hx = (bx[o + 3] - bx[o]) / 2, hy = (bx[o + 4] - bx[o + 1]) / 2, hz = (bx[o + 5] - bx[o + 2]) / 2;
    const px = cx - from[0], py = cy - from[1], pz = cz - from[2];
    const u = dd > EPS ? Math.min(best, Math.max(0, (px * dir[0] + py * dir[1] + pz * dir[2]) / dd)) : 0;
    const ex = px - dir[0] * u, ey = py - dir[1] * u, ez = pz - dir[2] * u;
    const reach = radius + Math.sqrt(hx * hx + hy * hy + hz * hz);
    if (ex * ex + ey * ey + ez * ez >= reach * reach) continue;
    const [a, b, c] = world.tri(id);
    if (closestSegmentTriangle(from, add(from, scale(dir, best)), a, b, c).d2 >= r2) continue;
    if (len2(sub(closestPointTriangle(from, a, b, c), from)) < r2) return 0;
    let lo = 0, hi = best;
    for (let i = 0; i < iterations; i++) {
      const mid = (lo + hi) / 2;
      if (closestSegmentTriangle(from, add(from, scale(dir, mid)), a, b, c).d2 < r2) hi = mid; else lo = mid;
    }
    best = lo;
  }
  return best;
}

/** Ray cast against the world. Returns {t, point, normal} for the nearest hit within maxDist, or null. */
export function rayCast(world, origin, direction, maxDist, mask = MASK_ALL) {
  const l = Math.sqrt(len2(direction));
  if (l < EPS) return null;
  const d = scale(direction, 1 / l);
  const end = add(origin, scale(d, maxDist));
  const ids = world.query([Math.min(origin[0], end[0]), Math.min(origin[1], end[1]), Math.min(origin[2], end[2])],
    [Math.max(origin[0], end[0]), Math.max(origin[1], end[1]), Math.max(origin[2], end[2])], mask, []);
  let best = null;
  for (const id of ids) {
    const [a, b, c] = world.tri(id);
    const t = segmentTriangleHit(origin, end, a, b, c);
    if (t >= 0 && (!best || t < best.t)) best = { t, a, b, c };
  }
  if (!best) return null;
  let n = triNormal(best.a, best.b, best.c);
  if (dot(n, d) > 0) n = scale(n, -1);
  return { t: best.t * maxDist, point: add(origin, scale(d, best.t * maxDist)), normal: n };
}

/** Fixed-timestep accumulator. Returns how many steps to run this frame, the leftover time and the interpolation alpha. */
export function fixedSteps(accumulator, frameDt, step = 1 / 30, maxSteps = 8, carry = 0) {
  // `carry` (seconds, optional): after a long frame the time beyond this frame's maxSteps is kept, up to `carry`,
  // and paid back over the next frames at no more than maxSteps each, so a hitch (texture upload, shader compile, a
  // software renderer) delays motion instead of deleting it: a stair climb or a click-to-move walk still arrives.
  // The per-frame step cap bounds the wall-clock cost (no spiral of death); with carry = 0 the excess is dropped.
  const cap = Math.max(step * maxSteps, carry);
  let acc = Math.min(accumulator + Math.min(Math.max(frameDt, 0), cap), cap);
  let steps = 0;
  while (acc >= step - 1e-9 && steps < maxSteps) { acc -= step; steps++; }
  if (acc < 0) acc = 0;
  return { steps, accumulator: acc, alpha: Math.min(1, acc / step) };
}
