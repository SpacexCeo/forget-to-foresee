// The minimap (sprint plan 5.4 / 5.5): a north-up circle around Iris, 40 / 60 / 100 m radius, creatures as red dots
// (all of them while the Omniscient Eye runs), the shared markers (sprint/markers.js: quests, NPCs, the portal, the
// market), other players as purple dots and town-local coordinates under it. Canvas 2D, redrawn a few times a second.
// The canvas may be larger than its 200 px frame (crisp on HiDPI): every size below is in frame pixels times `k`.
export const ZOOMS = Object.freeze([40, 60, 100]);
const KIND_COLOR = { 'quest-available': '#f6c860', 'quest-ready': '#6ee59a', 'quest-area': 'rgba(246,200,96,.18)', npc: '#8fb8ff', portal: '#b98cff', market: '#e8dcb4' };
const MOB = '#ff5a4f', ELITE = '#f6c860', PLAYER = '#a98bff', OUTLINE = 'rgba(6,8,10,.7)';

/** World point -> canvas pixel for a centre, a radius in metres and a canvas size (north up: -z is up). Pure. */
export function toMap(p, centre, radius, size) {
  const k = (size / 2) / radius;
  return [size / 2 + (p[0] - centre[0]) * k, size / 2 + (p[2] - centre[2]) * k];
}

/** Clamp a canvas point to the rim (inset px from the edge); returns [x, y, clamped]. Pure. */
export function clampToRim(x, y, size, inset) {
  const c = size / 2, d = Math.hypot(x - c, y - c), r = c - inset;
  if (d <= r) return [x, y, false];
  return [c + (x - c) * r / d, c + (y - c) * r / d, true];
}

export function createMinimap({ canvas, markers = null, mobs, player, origin, players = () => [], reveal = () => false }) {
  const g = canvas.getContext && canvas.getContext('2d');
  let zi = 1, acc = 1;
  const O = () => origin() || [0, 0, 0];
  const dot = (x, y, r, fill, k) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.lineWidth = 1.5 * k; g.strokeStyle = OUTLINE; g.stroke(); };
  return {
    get radius() { return ZOOMS[zi]; },
    get atMin() { return zi === 0; }, get atMax() { return zi === ZOOMS.length - 1; },
    zoom(d) { zi = Math.max(0, Math.min(ZOOMS.length - 1, zi + d)); acc = 1; },
    coords() { const p = player.pos, o = O(); return [Math.round(p[0] - o[0]) || 0, Math.round(p[2] - o[2]) || 0]; },   // no "-0"
    draw(dt) {
      acc += dt; if (acc < 0.15 || !g) return; acc = 0;
      const S = canvas.width, k = S / 200, C = S / 2, R = ZOOMS[zi], c = player.pos, o = O();
      g.clearRect(0, 0, S, S);
      // the disc itself is the frame's translucent background (hud-style.js); faint range rings at a third and two thirds
      g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1 * k;
      for (const r of [1 / 3, 2 / 3]) { g.beginPath(); g.arc(C, C, C * r, 0, Math.PI * 2); g.stroke(); }
      // the player's view cone (heading 0 faces +z, which is down on a north-up map)
      const h = player.heading || 0, a = Math.PI / 2 - h;   // canvas angle of the heading
      const cone = g.createRadialGradient(C, C, 0, C, C, C * 0.55);
      cone.addColorStop(0, 'rgba(255,255,255,.2)'); cone.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = cone; g.beginPath(); g.moveTo(C, C); g.arc(C, C, C * 0.55, a - 0.5, a + 0.5); g.closePath(); g.fill();
      // markers: quest areas as soft discs, quest givers as gold "!" pins, the rest as outlined dots
      const list = markers && markers.getMarkers ? markers.getMarkers() : [];
      for (const m of list) {
        const [x0, y0] = toMap([m.pos[0] + o[0], 0, m.pos[1] + o[2]], c, R, S);
        const [x, y, off] = clampToRim(x0, y0, S, 7 * k);
        const col = m.color || KIND_COLOR[m.kind] || '#eef0f6';
        if (m.kind === 'quest-area') { if (m.radius && !off) { g.fillStyle = col; g.beginPath(); g.arc(x, y, m.radius * C / R, 0, Math.PI * 2); g.fill(); } continue; }
        const quest = m.kind === 'quest-available' || m.kind === 'quest-ready';   // quest givers: larger gold (ready: green) dots
        dot(x, y, (quest ? (off ? 4 : 5) : (off ? 2.5 : 3.5)) * k, col, k);
      }
      // other players
      let others = []; try { others = players() || []; } catch { others = []; }
      for (const p of others) {
        if (!p) continue;
        const [x, y] = clampToRim(...toMap([p[0] + o[0], 0, p[2] + o[2]], c, R, S), S, 6 * k);
        dot(x, y, 4 * k, PLAYER, k);
      }
      // creatures
      const M = mobs && mobs();
      if (M && M.brain) {
        const far = reveal() ? R * 4 : R;
        for (const m of M.brain.mobs) {
          if (m.state === 'dead' || m.state === 'gone') continue;
          const d = Math.hypot(m.pos[0] - c[0], m.pos[2] - c[2]); if (d > far) continue;
          const elite = !!(m.T && m.T.elite);
          const [x, y] = clampToRim(...toMap(m.pos, c, R, S), S, 5 * k);
          dot(x, y, (elite ? 5 : 3.5) * k, elite ? ELITE : MOB, k);
        }
      }
      // Iris: a white outlined arrow along her heading
      g.save(); g.translate(C, C); g.rotate(-h + Math.PI);
      g.beginPath(); g.moveTo(0, -10 * k); g.lineTo(7 * k, 8 * k); g.lineTo(0, 4 * k); g.lineTo(-7 * k, 8 * k); g.closePath();
      g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 1.5 * k; g.strokeStyle = OUTLINE; g.stroke(); g.restore();
    },
  };
}
