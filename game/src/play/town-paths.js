// The town's walkable path graph (owner 13.11: "make them all walk ONLY on the paths"). Nodes and edges on the cobbled
// streets, the stairs and the square, in town-local metres [x, y, z] (TOWN_DATA frame). Built from the town's own
// walking lines: the jury route Iris walks, the exported NPC routes, every townsperson's program walks, and short
// connectors from each post and shop door to the nearest node. Every edge is checked against the town's real ground
// (tests/client/town-paths.test.mjs with the recorded table tests/fixtures/town-ground.json, re-recorded by
// scripts/record-town-ground.mjs): no point off the ground or inside a wall, no vertical step over 0.45 m.
// Townsfolk walks are edges of this graph, trade and home walks are found on it (pathBetween), and the demo player
// can use the same graph. Pure: no imports (townsfolk-plan.js adds the lines, so no chunk can loop through here).

/** The largest ground step between two samples 0.25 m apart that a walker may take (m). */
export const MAX_STEP = 0.45;
const SNAP = 0.05; // nodes closer than this are one node
const key = (p) => `${Math.round(p[0] / SNAP)},${Math.round(p[1] / SNAP)},${Math.round(p[2] / SNAP)}`;
const flat = (a, b) => Math.hypot(b[0] - a[0], b[2] - a[2]);

/**
 * A graph from polylines (each [[x, y, z], ...]): {nodes: [[x, y, z]], edges: [[i, j]], adj: Map<i, [[j, len]]>}.
 * Polylines are cut where they cross an existing node so walkers can turn there.
 */
export function createPathGraph(polylines) {
  // 1. raw segments; 2. split them where they cross (same height) or where a point of another line sits on them;
  // 3. nodes and edges from the split pieces
  const segs = [];
  for (const line of polylines) for (let i = 0; i + 1 < line.length; i++) if (flat(line[i], line[i + 1]) > 1e-6) segs.push([line[i], line[i + 1]]);
  const cuts = segs.map(() => []);
  const at = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const onSeg = (p, a, b) => { // t in (0, 1) where p lies on a-b (within JOIN m across, JOIN_Y m in height), else -1
    const dx = b[0] - a[0], dz = b[2] - a[2], L2 = dx * dx + dz * dz; if (!L2) return -1;
    const t = ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / L2; if (t <= 1e-3 || t >= 1 - 1e-3) return -1;
    const q = at(a, b, t); return Math.hypot(q[0] - p[0], q[2] - p[2]) <= JOIN && Math.abs(q[1] - p[1]) <= JOIN_Y ? t : -1;
  };
  for (let i = 0; i < segs.length; i++) for (let j = 0; j < segs.length; j++) {
    if (i === j) continue;
    const [a, b] = segs[i], [c, d] = segs[j];
    for (const p of [c, d]) { const t = onSeg(p, a, b); if (t > 0) cuts[i].push(t); } // a T-junction
    if (j < i) continue;
    const r = [b[0] - a[0], b[2] - a[2]], s2 = [d[0] - c[0], d[2] - c[2]], den = r[0] * s2[1] - r[1] * s2[0];
    if (Math.abs(den) < 1e-9) continue;
    const qp = [c[0] - a[0], c[2] - a[2]], t = (qp[0] * s2[1] - qp[1] * s2[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
    if (t <= 1e-3 || t >= 1 - 1e-3 || u <= 1e-3 || u >= 1 - 1e-3) continue;
    if (Math.abs(at(a, b, t)[1] - at(c, d, u)[1]) > JOIN_Y) continue; // a crossing over or under: not a junction
    cuts[i].push(t); cuts[j].push(u);
  }
  const nodes = [], index = new Map(), edges = [], seen = new Set();
  const node = (p) => { const k = key(p); if (!index.has(k)) { index.set(k, nodes.length); nodes.push([p[0], p[1], p[2]]); } return index.get(k); };
  const edge = (a, b) => { if (a === b) return; const k = a < b ? a + ':' + b : b + ':' + a; if (seen.has(k)) return; seen.add(k); edges.push([Math.min(a, b), Math.max(a, b)]); };
  segs.forEach(([a, b], i) => {
    const ts = [0, ...cuts[i].sort((x, y) => x - y), 1]; let prev = node(a);
    for (let k = 1; k < ts.length; k++) { if (ts[k] - ts[k - 1] < 1e-4) continue; const n = node(k === ts.length - 1 ? b : at(a, b, ts[k])); edge(prev, n); prev = n; }
  });
  const adj = new Map(nodes.map((_, i) => [i, []]));
  for (const [a, b] of edges) { const l = flat(nodes[a], nodes[b]); adj.get(a).push([b, l]); adj.get(b).push([a, l]); }
  return { nodes, edges, adj };
}
const JOIN = 0.35, JOIN_Y = 0.3; // a point this close to another line (across / in height) joins it

/** The nearest node to a point (by ground distance, with height counted double so a terrace above never wins). */
export function nearestNode(g, p) {
  let best = -1, d = Infinity;
  for (let i = 0; i < g.nodes.length; i++) { const n = g.nodes[i], e = flat(n, p) + Math.abs(n[1] - p[1]) * 2; if (e < d) { d = e; best = i; } }
  return best;
}

/** Shortest path between two nodes (Dijkstra): [i, ...] or null. */
export function shortestPath(g, from, to) {
  const dist = new Map([[from, 0]]), prev = new Map(), done = new Set();
  while (true) {
    let u = -1, du = Infinity; for (const [k, v] of dist) if (!done.has(k) && v < du) { du = v; u = k; }
    if (u < 0) return null;
    if (u === to) break;
    done.add(u);
    for (const [v, l] of g.adj.get(u)) { const nd = du + l; if (nd < (dist.has(v) ? dist.get(v) : Infinity)) { dist.set(v, nd); prev.set(v, u); } }
  }
  const out = [to]; while (out[0] !== from) out.unshift(prev.get(out[0]));
  return out;
}

/** A walk from `from` to `to` along the graph: [[x, y, z], ...] (the end points included). */
export function pathBetween(g, from, to) {
  const a = nearestNode(g, from), b = nearestNode(g, to);
  const ids = shortestPath(g, a, b) || [a, b];
  const pts = ids.map((i) => g.nodes[i].slice());
  if (flat(pts[0], from) > 0.05) pts.unshift(from.slice());
  if (flat(pts[pts.length - 1], to) > 0.05) pts.push(to.slice());
  return pts;
}

/** Polyline points sampled every `step` metres along an edge (for the ground checks). */
export function edgeSamples(a, b, step = 0.25) {
  const n = Math.max(1, Math.ceil(flat(a, b) / step)), out = [];
  for (let k = 0; k <= n; k++) { const t = k / n; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  return out;
}

let graph = null, extra = [];
/** Adds polylines (townsfolk-plan.js adds every program walk and the post connectors); resets the cached graph. */
export function addTownLines(lines) { extra = extra.concat(lines); graph = null; }
/** The town's graph (built on first use, so module order never matters). */
export function townPaths() { if (!graph) graph = createPathGraph(extra); return graph; }

/** A stable id for an edge (its end points rounded to 5 cm, in order): the ground table's key. */
export const edgeKey = (a, b) => { const k = (p) => p.map((v) => (Math.round(v / SNAP) * SNAP).toFixed(2)).join(','); const ka = k(a), kb = k(b); return ka < kb ? ka + '|' + kb : kb + '|' + ka; };
