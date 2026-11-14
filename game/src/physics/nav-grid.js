// Click-to-move and "walk to" routes over the town's real colliders (owner 14.11: a click on the ground walked in a
// straight line and she got stuck on walls and props). A lazy walkability grid: a node is a 1 m cell at a height (the
// ground found by a ray cast down from just above the previous node, so roofs and bridges overhead never count and
// stairs climb), an edge between neighbours is passable when the height step is a step (not a wall or a drop) and two
// rays at knee and chest height find nothing between them (a little beyond, for her radius). Every ground probe and edge
// is cached; after the town is shown `warm` floods the reachable town in idle slices, so a plan is a cached A* (a few
// ms). An unreachable click walks to the nearest reachable point. The path is string-pulled over the same edges.
// Pure: the caller passes the ray cast; no three.js.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const dirOf = (dx, dz) => DIRS.findIndex(([a, b]) => a === dx && b === dz);

/**
 * @param {object} o
 * @param {(origin: number[], dir: number[], max: number) => ({point: number[], normal?: number[]}|null)} o.ray the town's ray cast (player colliders)
 * @param {number} [o.cell] grid size (m) @param {number} [o.step] largest height step between neighbours (m)
 * @param {number} [o.drop] largest step down (m) @param {number[]} [o.heights] clearance ray heights above the ground (m)
 * @param {number} [o.radius] how far beyond the next cell a clearance ray reaches (her capsule) @param {number} [o.maxNodes]
 * @param {() => unknown} [o.version] changes when colliders are added or removed (a streamed piece): the caches start over
 */
export function createNav({ ray, cell = 1, step = 0.6, drop = 0.9, heights = [0.5, 1.3], radius = 0.35, maxNodes = 9000, version = () => 0 }) {
  const ground = new Map(), edges = new Map();
  let probes = 0, casts = 0, seenVersion = version();
  const fresh = () => { const v = version(); if (v !== seenVersion) { seenVersion = v; ground.clear(); edges.clear(); flood = null; } };
  const lvl = (y) => Math.round(y / 1.5);
  // numeric keys (a plan touches thousands of them): cells within +-4096 m, levels of 1.5 m within +-96 m
  const nodeKey = (ix, iz, y) => ((ix + 4096) * 8192 + (iz + 4096)) * 128 + (lvl(y) + 64);
  /** The ground under cell (ix, iz) found from just above height `y` (null: none within reach). */
  function groundAt(ix, iz, y) {
    const k = ((ix + 4096) * 8192 + (iz + 4096)) * 512 + (Math.round(y * 2) + 256);
    if (ground.has(k)) return ground.get(k);
    probes++;
    const hit = ray([ix * cell, y + 1.2, iz * cell], [0, -1, 0], 1.2 + drop + 0.2);
    const g = hit && (!hit.normal || hit.normal[1] > 0.55) ? hit.point[1] : null;
    ground.set(k, g);
    return g;
  }
  /** The neighbour node of (ix, iz, y) in direction d, or null when the edge is not walkable. */
  function neighbour(ix, iz, y, d) {
    const k = nodeKey(ix, iz, y) * 8 + d;
    if (edges.has(k)) return edges.get(k);
    const [dx, dz] = DIRS[d], nx = ix + dx, nz = iz + dz, len = Math.hypot(dx, dz) * cell;
    let out = null;
    const y2 = groundAt(nx, nz, y);
    if (y2 != null && y2 - y <= step * Math.hypot(dx, dz) && y - y2 <= drop) {
      let clear = true;
      for (const h of heights) {
        casts++;
        const o = [ix * cell, y + h, iz * cell], to = [nx * cell, y2 + h, nz * cell];
        const dir = [to[0] - o[0], to[1] - o[1], to[2] - o[2]];
        if (ray(o, dir, len + radius)) { clear = false; break; }
      }
      if (clear && dx && dz) clear = !!neighbour(ix, iz, y, dirOf(dx, 0)) && !!neighbour(ix, iz, y, dirOf(0, dz)); // no corner cutting
      if (clear) out = { ix: nx, iz: nz, y: y2 };
    }
    edges.set(k, out);
    return out;
  }
  const cellOf = (p) => [Math.round(p[0] / cell), Math.round(p[2] / cell)];
  /** The node under a world point: her own feet height, else the ground found from a little above it. */
  function startNode(p) {
    const [ix, iz] = cellOf(p);
    const y = groundAt(ix, iz, p[1] + 0.3);
    return y == null ? null : { ix, iz, y };
  }

  /** Whether a straight walk from node a to node b crosses only walkable edges (grid line walk; for string pulling). */
  function sees(a, b) {
    const lx = b.ix - a.ix, lz = b.iz - a.iz, L = Math.hypot(lx, lz) || 1, sx = Math.sign(lx), sz = Math.sign(lz);
    const steps = [sx && sz ? [sx, sz] : null, sx ? [sx, 0] : null, sz ? [0, sz] : null].filter(Boolean);
    let { ix, iz, y } = a;
    for (let guard = 0; guard < 400; guard++) {
      if (ix === b.ix && iz === b.iz) return Math.abs(y - b.y) < 1;
      // the next cell: of the steps toward b, the one that stays closest to the straight line a -> b
      let best = null, bestErr = Infinity;
      for (const [dx, dz] of steps) { const cx = ix + dx - a.ix, cz = iz + dz - a.iz, err = Math.abs(cx * lz - cz * lx) / L; if (err < bestErr) { bestErr = err; best = [dx, dz]; } }
      const n = neighbour(ix, iz, y, dirOf(best[0], best[1])); if (!n) return false;
      ({ ix, iz, y } = n);
    }
    return false;
  }


  /**
   * A route from `from` to `to` (world [x, y, z]): {path: [[x, y, z], ...] (her start excluded, the goal or the nearest
   * reachable point last), reached, ms, nodes} or null when she stands on no ground.
   */
  function plan(from, to, { budget = maxNodes } = {}) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    fresh();
    const s = startNode(from); if (!s) return null;
    const [gx, gz] = cellOf(to);
    const h = (n) => Math.hypot(gx - n.ix, gz - n.iz) * cell;
    const heap = [], push = (n) => { heap.push(n); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p].f <= heap[i].f) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].f < heap[m].f) m = l; if (r < heap.length && heap[r].f < heap[m].f) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const seen = new Map();
    // greedy (f = g + 2 h): far fewer nodes on a long detour, and string pulling straightens the route anyway
    const W = 2;
    const start = { ...s, g: 0, f: W * h(s), p: null, k: nodeKey(s.ix, s.iz, s.y) };
    push(start); seen.set(start.k, 0);
    let best = start, goal = null, n = 0;
    while (heap.length && n++ < budget) {
      const cur = pop();
      if (cur.g > (seen.get(cur.k) ?? Infinity)) continue;
      if (h(cur) < h(best)) best = cur;
      if (cur.ix === gx && cur.iz === gz && Math.abs(cur.y - to[1]) < 2.5) { goal = cur; break; }
      for (let d = 0; d < 8; d++) {
        const nb = neighbour(cur.ix, cur.iz, cur.y, d); if (!nb) continue;
        const k = nodeKey(nb.ix, nb.iz, nb.y), g = cur.g + Math.hypot(DIRS[d][0], DIRS[d][1]) * cell;
        if (g >= (seen.get(k) ?? Infinity)) continue;
        seen.set(k, g); push({ ix: nb.ix, iz: nb.iz, y: nb.y, g, f: g + W * h(nb), p: cur, k });
      }
    }
    const end = goal || best;
    const chain = []; for (let c = end; c; c = c.p) chain.push(c);
    chain.reverse();
    // string pulling over the same edges, between the corners of the grid route (where its direction changes): from each
    // kept corner, the farthest corner it still sees
    const corners = chain.filter((c, i) => i === 0 || i === chain.length - 1 || (c.ix - chain[i - 1].ix !== chain[i + 1].ix - c.ix) || (c.iz - chain[i - 1].iz !== chain[i + 1].iz - c.iz));
    const kept = [corners[0]];
    for (let i = 0; i < corners.length - 1;) {
      let j = i + 1;
      while (j + 1 < corners.length && sees(corners[i], corners[j + 1])) j++;
      kept.push(corners[j]); i = j;
    }
    const path = kept.slice(1).map((c) => [c.ix * cell, c.y, c.iz * cell]);
    if (goal) { if (path.length) path[path.length - 1] = [to[0], goal.y, to[2]]; else path.push([to[0], goal.y, to[2]]); }
    const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return { path, reached: !!goal, ms, nodes: n };
  }

  /**
   * Floods the walkable town from `from` within `radius` metres, `sliceMs` at a time (each call does one slice):
   * returns true when done. Every probe it makes is cached for the plans that follow.
   */
  let flood = null;
  function warm(from, { radius: R = 140, sliceMs = 6, cap = 60000 } = {}) {
    fresh();
    if (!flood) { const s = startNode(from); if (!s) return true; flood = { q: [s], qi: 0, seen: new Set([nodeKey(s.ix, s.iz, s.y)]), o: s, done: false }; }
    if (flood.done) return true;
    const t0 = performance.now();
    while (flood.qi < flood.q.length && performance.now() - t0 < sliceMs) {
      const cur = flood.q[flood.qi++];
      for (let d = 0; d < 8; d++) {
        const nb = neighbour(cur.ix, cur.iz, cur.y, d); if (!nb) continue;
        const k = nodeKey(nb.ix, nb.iz, nb.y);
        if (flood.seen.has(k) || Math.hypot(nb.ix - flood.o.ix, nb.iz - flood.o.iz) * cell > R || flood.seen.size > cap) continue;
        flood.seen.add(k); flood.q.push(nb);
      }
    }
    if (flood.qi >= flood.q.length) flood.done = true;
    return flood.done;
  }

  return {
    plan, warm, sees, startNode,
    get stats() { return { probes, casts, ground: ground.size, edges: edges.size, warmed: flood ? flood.seen.size : 0, warmDone: !!(flood && flood.done) }; },
  };
}

/** The town's navigator, set by the world when the town is up (boot-world.js); auto-walk plans with it too. */
let townNav = null;
export const setTownNav = (n) => { townNav = n; };
export const getTownNav = () => townNav;
