// Demo walkers for the shared town (docs/multiplayer.md): where bot k is at time t (seconds), in town coordinates
// (world minus TOWN_ORIGIN). They walk the jury route from the spawn to the altar stand and back, each offset to the
// side and in time, with a pause at each end. Used by presence/tools/bots.mjs (real sockets, local or test servers
// only) and by the game's ?bots=N (simulated in the browser, no network).

/** The jury route, town coordinates (a test checks it against scenes/town-layout.js TOWN_ROUTE). */
export const BOT_ROUTE = Object.freeze([[0, 0, 25], [0, 0, 18], [0, 2.5, 12], [0, 2.5, 2.6], [0, 4.5, -2], [0, 4.5, -7.7], [0, 5, -9]].map(Object.freeze));
export const BOT_NAMES = Object.freeze(['wren', 'tamsin', 'odo', 'mira', 'bram', 'liesel', 'corin', 'hale', 'yara', 'pim', 'sorrel', 'ivo', 'nell', 'ruan']);
const SPEED = 1.6, PAUSE = 4;

const seg = BOT_ROUTE.slice(1).map((b, i) => { const a = BOT_ROUTE[i]; return { a, b, len: Math.hypot(b[0] - a[0], b[2] - a[2]) }; });
const LEN = seg.reduce((s, x) => s + x.len, 0);

/** Point at distance d along the route, and the heading of travel. */
function along(d) {
  for (const s of seg) {
    if (d <= s.len) { const k = d / s.len; return { p: s.a.map((v, j) => v + (s.b[j] - v) * k), h: Math.atan2(s.b[0] - s.a[0], s.b[2] - s.a[2]) }; }
    d -= s.len;
  }
  const s = seg[seg.length - 1]; return { p: s.b.slice(), h: Math.atan2(s.b[0] - s.a[0], s.b[2] - s.a[2]) };
}

/** Bot k at time t: {p, h, a} in town coordinates. */
export function botAt(k, t) {
  const cycle = 2 * (LEN / SPEED + PAUSE), u = ((t + k * 7.3) % cycle + cycle) % cycle;
  const leg = LEN / SPEED + PAUSE;
  const back = u >= leg, w = back ? u - leg : u;
  const moving = w < LEN / SPEED;
  const d = moving ? w * SPEED : LEN;
  const { p, h } = along(back ? LEN - d : d);
  const side = ((k % 5) - 2) * 0.9;            // lanes across the street
  const nx = Math.cos(h), nz = -Math.sin(h);
  return { p: [p[0] + nx * side, p[1], p[2] + nz * side], h: back ? h + Math.PI : h, a: moving ? 'walk' : 'idle' };
}
