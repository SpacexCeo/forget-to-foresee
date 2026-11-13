// The demo player's feet (owner, 13.11): a scripted townsperson who wanders the town on a random path so a lone
// visitor can try the player card (profile, trade, friends). Pure logic, no three.js. It walks ONLY along the town's
// authored NPC routes (TOWN_DATA.npc.routes, laid on walkable ground and clear of the walls), joined where two routes
// meet, so it can never cut through a house; it keeps clear of the portal and of the shop doors. Steps: walk to a
// neighbouring route point, now and then stop to idle or look around. Town-local metres.
import { TOWN_DATA } from '../scenes/town-data.js';

export const DEMO_WALK = Object.freeze({ speed: 1.25, linkM: 1.6, stopChance: 0.35, stopS: [3, 8], clearPortalM: 4, clearDoorM: 2.2 });
const PORTAL = [4.4, 0, 24.8]; // scenes/town-portal.js PORTAL_TOWN (copied: this module must not import scenes three.js code)

const d2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
/** Points that are too close to the portal or a shop door: the walker never steps onto them. */
export function forbidden(p, { portal = PORTAL, doors = TOWN_DATA.shops.map((s) => s.door && s.door.position).filter(Boolean) } = {}) {
  return d2(p, portal) < DEMO_WALK.clearPortalM || doors.some((d) => d2(p, d) < DEMO_WALK.clearDoorM);
}

/**
 * The walk graph: every route point is a node; consecutive points of a route are joined (loop routes close), and
 * points of different routes closer than linkM are joined. Nodes near the portal or a door are left out.
 * @returns {{nodes: number[][], edges: number[][]}} edges[i] = neighbour indices of node i
 */
export function buildWalkGraph(routes = TOWN_DATA.npc.routes) {
  const nodes = [], edges = [], idx = [];
  for (const [name, r] of Object.entries(routes)) {
    const ids = r.points.map((p) => { if (forbidden(p)) return -1; nodes.push(p.slice()); edges.push([]); return nodes.length - 1; });
    idx.push(ids);
    const loop = /round|loop/.test(name);
    for (let i = 0; i < ids.length; i++) {
      const j = i + 1 < ids.length ? i + 1 : loop ? 0 : -1;
      if (j < 0 || ids[i] < 0 || ids[j] < 0 || ids[i] === ids[j]) continue;
      edges[ids[i]].push(ids[j]); edges[ids[j]].push(ids[i]);
    }
  }
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    if (!edges[a].includes(b) && d2(nodes[a], nodes[b]) < DEMO_WALK.linkM && Math.abs(nodes[a][1] - nodes[b][1]) < 0.6) { edges[a].push(b); edges[b].push(a); }
  }
  return { nodes, edges };
}

/** The walker: step(dt) moves it; read x, y, z, yaw, speed, state ('walk' | 'idle' | 'look'). */
export function createDemoWalker({ graph = buildWalkGraph(), rand = Math.random, start = null } = {}) {
  const { nodes, edges } = graph;
  const usable = nodes.map((_, i) => i).filter((i) => edges[i].length);
  let at = start != null ? start : usable[Math.floor(rand() * usable.length)] ?? 0, to = null, s = 0, len = 0, wait = 0, prev = -1;
  const w = { x: nodes[at][0], y: nodes[at][1], z: nodes[at][2], yaw: 0, speed: 0, state: 'idle', at: () => at, to: () => to,
    step(dt) {
      w.speed = 0;
      if (to == null) {
        if (wait > 0) { wait -= dt; if (w.state === 'look') w.yaw += Math.sin(wait * 1.3) * dt * 0.9; return w; }
        const nb = edges[at].filter((n) => n !== prev);
        const pool = nb.length ? nb : edges[at];
        if (!pool.length) { wait = 5; w.state = 'idle'; return w; }
        to = pool[Math.floor(rand() * pool.length)]; s = 0; len = Math.max(0.01, Math.hypot(nodes[to][0] - nodes[at][0], nodes[to][1] - nodes[at][1], nodes[to][2] - nodes[at][2]));
        w.state = 'walk';
      }
      const a = nodes[at], b = nodes[to];
      const ds = Math.min(DEMO_WALK.speed * dt, len - s); s += ds; w.speed = dt > 0 ? ds / dt : 0;
      const k = s / len;
      w.x = a[0] + (b[0] - a[0]) * k; w.y = a[1] + (b[1] - a[1]) * k; w.z = a[2] + (b[2] - a[2]) * k;
      const want = Math.atan2(b[0] - a[0], b[2] - a[2]), dy = Math.atan2(Math.sin(want - w.yaw), Math.cos(want - w.yaw));
      w.yaw += Math.max(-dt * 4, Math.min(dt * 4, dy));
      if (s >= len - 1e-6) {
        prev = at; at = to; to = null;
        if (rand() < DEMO_WALK.stopChance) { wait = DEMO_WALK.stopS[0] + rand() * (DEMO_WALK.stopS[1] - DEMO_WALK.stopS[0]); w.state = rand() < 0.5 ? 'idle' : 'look'; }
      }
      return w;
    },
  };
  return w;
}
