// The minimap (sprint plan 5.4 / 5.5): a north-up circle around Iris, 40 / 60 / 100 m radius, creatures as red dots
// (all of them while the Omniscient Eye runs), the shared markers (sprint/markers.js: quests, NPCs, the portal, the
// market) and town-local coordinates under it. Canvas 2D, redrawn a few times a second.
export const ZOOMS = Object.freeze([40, 60, 100]);
const KIND_COLOR = { 'quest-available': '#f6c860', 'quest-ready': '#5ccf8a', 'quest-area': 'rgba(246,200,96,.25)', npc: '#eef0f6', portal: '#b06cff', market: '#e8dcb4' };

/** World point -> canvas pixel for a centre, a radius in metres and a canvas size (north up: -z is up). Pure. */
export function toMap(p, centre, radius, size) {
  const k = (size / 2) / radius;
  return [size / 2 + (p[0] - centre[0]) * k, size / 2 + (p[2] - centre[2]) * k];
}

export function createMinimap({ canvas, markers = null, mobs, player, origin, reveal = () => false }) {
  const g = canvas.getContext && canvas.getContext('2d');
  let zi = 1, acc = 1;
  const O = () => origin() || [0, 0, 0];
  return {
    get radius() { return ZOOMS[zi]; },
    get atMin() { return zi === 0; }, get atMax() { return zi === ZOOMS.length - 1; },
    zoom(d) { zi = Math.max(0, Math.min(ZOOMS.length - 1, zi + d)); acc = 1; },
    coords() { const p = player.pos, o = O(); return [Math.round(p[0] - o[0]), Math.round(p[2] - o[2])]; },
    draw(dt) {
      acc += dt; if (acc < 0.15 || !g) return; acc = 0;
      const S = canvas.width, R = ZOOMS[zi], c = player.pos;
      g.clearRect(0, 0, S, S);
      g.fillStyle = 'rgba(30,36,48,.9)'; g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(170,177,197,.15)'; g.lineWidth = 1;
      for (const r of [0.33, 0.66]) { g.beginPath(); g.arc(S / 2, S / 2, S / 2 * r, 0, Math.PI * 2); g.stroke(); }
      const list = markers && markers.getMarkers ? markers.getMarkers() : [];
      for (const m of list) {
        const p = [m.pos[0] + O()[0], 0, m.pos[1] + O()[2]], [x, y] = toMap(p, c, R, S);
        const off = Math.hypot(x - S / 2, y - S / 2) > S / 2 - 6;
        const k = Math.min(1, (S / 2 - 6) / Math.max(1e-6, Math.hypot(x - S / 2, y - S / 2)));
        const px = off ? S / 2 + (x - S / 2) * k : x, py = off ? S / 2 + (y - S / 2) * k : y;
        g.fillStyle = m.color || KIND_COLOR[m.kind] || '#eef0f6';
        if (m.kind === 'quest-area' && m.radius && !off) { g.beginPath(); g.arc(x, y, m.radius * (S / 2) / R, 0, Math.PI * 2); g.fill(); continue; }
        g.beginPath(); g.arc(px, py, off ? 4 : 5, 0, Math.PI * 2); g.fill();
      }
      const M = mobs && mobs();
      if (M && M.brain) {
        const far = reveal() ? R * 4 : R;
        for (const m of M.brain.mobs) {
          if (m.state === 'dead' || m.state === 'gone') continue;
          const d = Math.hypot(m.pos[0] - c[0], m.pos[2] - c[2]); if (d > far) continue;
          let [x, y] = toMap(m.pos, c, R, S); const dd = Math.hypot(x - S / 2, y - S / 2); if (dd > S / 2 - 4) { x = S / 2 + (x - S / 2) * (S / 2 - 4) / dd; y = S / 2 + (y - S / 2) * (S / 2 - 4) / dd; }
          g.fillStyle = m.T && m.T.elite ? '#f6c860' : '#ff6b62'; g.beginPath(); g.arc(x, y, m.T && m.T.elite ? 5 : 3, 0, Math.PI * 2); g.fill();
        }
      }
      // Iris: an arrow along her heading (heading 0 faces +z, which is down on a north-up map)
      const h = player.heading || 0; g.save(); g.translate(S / 2, S / 2); g.rotate(-h + Math.PI);
      g.fillStyle = '#f6c860'; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.restore();
    },
  };
}
