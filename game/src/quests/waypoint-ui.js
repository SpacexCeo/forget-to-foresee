// The waypoint arrow (sprint §4.9): a gold chevron on a circle of radius 38 vh around the screen centre pointing to the
// pinned quest's target when it is off screen, with the distance under it; a diamond with the distance over the target
// when it is on screen. Hidden when the journal is open or the target is closer than 6 m. edgeArrow is pure.

/** Where the arrow goes (pure). sx, sy: the target in normalised device coordinates (-1..1); behind: behind the camera. */
export function edgeArrow({ sx, sy, behind = false, w, h, r }) {
  const cx = w / 2, cy = h / 2;
  let dx = sx * cx, dy = -sy * cy;
  if (behind) { dx = -dx; dy = -dy; }
  const on = !behind && Math.abs(sx) <= 0.95 && Math.abs(sy) <= 0.95;
  if (on) return { onScreen: true, x: cx + dx, y: cy + dy, angle: 0 };
  const a = Math.atan2(dy, dx), len = r;
  return { onScreen: false, x: cx + Math.cos(a) * len, y: cy + Math.sin(a) * len, angle: a };
}

/**
 * @param {object} o
 * @param {Document} o.doc @param {{project: (p: number[]) => {x: number, y: number, z: number, behind: boolean}}} o.view
 *   projects a world point (the host wraps THREE's camera)
 * @param {() => {pos: number[], from: number[]}|null} o.target the pinned target and Iris (world) @param {() => boolean} [o.hidden]
 */
export function createWaypoint({ doc, win = globalThis, view, target, hidden = () => false }) {
  const arrow = doc.createElement('div'); arrow.className = 'ftf-waypoint'; arrow.setAttribute('aria-hidden', 'true');
  arrow.style.cssText = 'position:fixed;left:0;top:0;z-index:12;pointer-events:none;display:none;text-align:center;color:#f6c860;font:700 12px/1.2 system-ui,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.8)';
  const glyph = doc.createElement('div'); glyph.style.cssText = 'font-size:28px;line-height:36px;width:36px;height:36px;margin:0 auto';
  const dist = doc.createElement('div');
  arrow.append(glyph, dist); doc.body.append(arrow);
  return {
    update() {
      const t = target();
      if (!t || hidden()) { arrow.style.display = 'none'; return null; }
      const d = Math.hypot(t.pos[0] - t.from[0], t.pos[2] - t.from[2]);
      if (d < 6) { arrow.style.display = 'none'; return null; }
      const w = win.innerWidth || 1280, h = win.innerHeight || 720, p = view.project(t.pos);
      const a = edgeArrow({ sx: p.x, sy: p.y, behind: p.behind, w, h, r: 0.38 * h });
      arrow.style.display = 'block';
      glyph.textContent = a.onScreen ? '◆' : '➤';
      glyph.style.transform = a.onScreen ? 'none' : `rotate(${a.angle}rad)`;
      dist.textContent = Math.round(d) + ' m';
      arrow.style.transform = `translate(${Math.round(a.x - 18)}px,${Math.round(a.y - 18)}px)`;
      return a;
    },
    dispose() { arrow.remove(); },
  };
}
