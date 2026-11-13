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

/**
 * Pure: the ground-trail dots (sprint §4.9) from her position along the route, one every `gap` metres up to `reach`
 * metres ahead: [[x, y, z], ...]. The first dot sits one gap ahead of her.
 */
export function trailDots(from, path, { gap = 2, reach = 40 } = {}) {
  const out = []; if (!path || !path.length) return out;
  let a = from, walked = 0, next = gap;
  for (const b of path) {
    const seg = Math.hypot(b[0] - a[0], b[2] - a[2]);
    while (seg > 0 && next <= walked + seg && next <= reach) { const t = (next - walked) / seg; out.push([a[0] + (b[0] - a[0]) * t, b[1], a[2] + (b[2] - a[2]) * t]); next += gap; }
    walked += seg; a = b; if (next > reach) break;
  }
  return out;
}

/** The trail itself: instanced 0.18 m discs, additive gold at 55 % opacity, one draw call; shown only during auto-walk. */
export function createTrail({ THREE, scene, max = 20 }) {
  const geo = new THREE.CircleGeometry(0.18, 16); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xf6c860, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, max); mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.name = 'ftf-autowalk-trail';
  scene.add(mesh);
  const m = new THREE.Matrix4();
  return {
    mesh,
    /** dots: [[x, y, z], ...] or null to hide. */
    set(dots) {
      const n = dots ? Math.min(dots.length, max) : 0;
      for (let i = 0; i < n; i++) { m.makeTranslation(dots[i][0], dots[i][1] + 0.04, dots[i][2]); mesh.setMatrixAt(i, m); }
      mesh.count = n; mesh.visible = n > 0; mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
