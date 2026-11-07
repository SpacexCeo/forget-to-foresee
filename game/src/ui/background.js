// Lobby background, after the owner's target concept (07.11): a sea of clouds
// drifting below, four nacre ammonite Shells hovering above it (IV cracked open),
// a faint archipelago with a gold-ringed plaza, soft light breathing from above.
// Canvas 2D, aria-hidden, pointer-events: none, so it can never block input.
// Reduced motion: one still frame, nothing scheduled. Pauses while the tab is hidden.
// The 3D client will later replace this with the real scene; no image assets are used.

const TAU = Math.PI * 2;

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Planispiral ammonite in unit space: silhouette, whorl seam and ribs. */
function ammoniteGeometry() {
  const b = Math.log(2.3) / TAU, end = 5.6 * Math.PI;
  const r = (t) => Math.exp(b * t);
  const pt = (t) => [r(t) * Math.cos(t), r(t) * Math.sin(t)];
  const outer = [];
  for (let t = end - TAU; t <= end + 1e-6; t += 0.03) outer.push(pt(t));
  const seam = [];
  for (let t = 0.5; t <= end - TAU + 1e-6; t += 0.04) seam.push(pt(t));
  const ribs = [];
  for (let t = end; t > 2.2; t -= 0.075 + (end - t) * 0.004) ribs.push([pt(t), pt(t - TAU), t]);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of outer) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, s = 1 / Math.max(maxX - minX, maxY - minY);
  const n = ([x, y]) => [(x - cx) * s, (y - cy) * s];
  return { outer: outer.map(n), seam: seam.map(n), ribs: ribs.map(([a, c, t]) => [n(a), n(c), t]), end, b, center: n([0, 0]), scale: s, shift: [cx, cy], r };
}

/** Renders one Shell into an offscreen canvas (cached per size). */
function renderShell(geo, px, { cracked = false, hue = 0, seed = 1 } = {}) {
  const pad = Math.ceil(px * 0.08);
  const cv = document.createElement('canvas');
  cv.width = cv.height = px + pad * 2;
  const c = cv.getContext('2d');
  c.translate(pad + px / 2, pad + px / 2);
  c.scale(px, px);
  const path = (pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
  // Nacre body: pearl lit from the upper left, stone in the shadow.
  path(geo.outer); c.closePath();
  const body = c.createLinearGradient(-0.45, -0.5, 0.45, 0.5);
  body.addColorStop(0, '#dfe2d6'); body.addColorStop(0.45, '#a9b6ae'); body.addColorStop(1, '#46544f');
  c.fillStyle = body; c.fill();
  c.save(); c.clip();
  // Iridescent sheen (violet / teal / amber) laid over the nacre.
  if (typeof c.createConicGradient === 'function') {
    const g = c.createConicGradient(hue, geo.center[0], geo.center[1]);
    [['rgba(143,134,168,0.7)', 0], ['rgba(127,169,160,0.6)', 0.25], ['rgba(212,161,95,0.5)', 0.5], ['rgba(233,233,219,0.45)', 0.72], ['rgba(143,134,168,0.7)', 1]].forEach(([col, k]) => g.addColorStop(k, col));
    c.globalCompositeOperation = 'soft-light';
    c.fillStyle = g; c.fillRect(-0.6, -0.6, 1.2, 1.2);
    c.globalCompositeOperation = 'source-over';
  }
  // Ribs across every visible whorl.
  for (const [a, d] of geo.ribs) {
    const mx = (a[0] + d[0]) / 2, my = (a[1] + d[1]) / 2;
    const qx = mx + (my - geo.center[1]) * 0.12, qy = my - (mx - geo.center[0]) * 0.12;
    c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(qx, qy, d[0], d[1]);
    c.lineWidth = 0.006; c.strokeStyle = 'rgba(40,52,48,0.34)'; c.stroke();
    c.beginPath(); c.moveTo(a[0] + 0.004, a[1] - 0.004); c.quadraticCurveTo(qx + 0.004, qy - 0.004, d[0] + 0.004, d[1] - 0.004);
    c.lineWidth = 0.003; c.strokeStyle = 'rgba(240,240,228,0.32)'; c.stroke();
  }
  path(geo.seam); c.lineWidth = 0.008; c.strokeStyle = 'rgba(30,40,37,0.45)'; c.stroke();
  // Volume: darker rim and umbilicus.
  const rim = c.createRadialGradient(geo.center[0] - 0.08, geo.center[1] - 0.1, 0.05, geo.center[0], geo.center[1], 0.62);
  rim.addColorStop(0, 'rgba(11,17,16,0)'); rim.addColorStop(0.75, 'rgba(11,17,16,0.08)'); rim.addColorStop(1, 'rgba(11,17,16,0.5)');
  c.fillStyle = rim; c.fillRect(-0.6, -0.6, 1.2, 1.2);
  const umb = c.createRadialGradient(geo.center[0], geo.center[1], 0, geo.center[0], geo.center[1], 0.09);
  umb.addColorStop(0, 'rgba(11,17,16,0.55)'); umb.addColorStop(1, 'rgba(11,17,16,0)');
  c.fillStyle = umb; c.fillRect(-0.6, -0.6, 1.2, 1.2);
  c.restore();
  path(geo.outer); c.closePath(); c.lineWidth = 0.006; c.strokeStyle = 'rgba(233,233,219,0.5)'; c.stroke();

  if (cracked) {
    // Break open the body chamber: cut a jagged wedge out of the last quarter turn.
    const rand = seeded(seed);
    const { end, b, scale, shift } = geo;
    const P = (t, f) => { const rr = Math.exp(b * t) * f; return [(rr * Math.cos(t) - shift[0]) * scale, (rr * Math.sin(t) - shift[1]) * scale]; };
    const t0 = end - 1.9;
    const edge = [];
    for (let t = t0; t <= end + 1e-6; t += 0.1) edge.push(P(t, 1.08));
    const jag = [];
    for (let t = end; t >= t0 - 1e-6; t -= 0.07) jag.push(P(t, 0.62 + rand() * 0.22));
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); [...edge, ...jag].forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill();
    c.globalCompositeOperation = 'source-over';
    c.beginPath(); jag.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.lineWidth = 0.007; c.strokeStyle = 'rgba(240,240,228,0.75)'; c.stroke();
  }
  return { canvas: cv, pad };
}

/** Desktop and narrow layouts keep the Shells clear of the title and menu. */
const LAYOUT = {
  wide: [{ x: 0.5, y: 0.19, s: 0.24 }, { x: 0.665, y: 0.12, s: 0.15 }, { x: 0.86, y: 0.2, s: 0.17 }, { x: 0.565, y: 0.48, s: 0.18, cracked: true }],
  narrow: [{ x: 0.8, y: 0.2, s: 0.24 }, { x: 0.6, y: 0.165, s: 0.12 }, { x: 0.93, y: 0.3, s: 0.13 }, { x: 0.7, y: 0.278, s: 0.12, cracked: true }],
};

/**
 * @param {HTMLElement} container  receives a full-size canvas
 * @param {{reducedMotion?: boolean, tier?: 'high'|'low'}} opts
 */
export function mountBackground(container, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const geo = ammoniteGeometry();
  const rand = seeded(1307);
  const layers = [
    { y: 0.62, speed: 5, alpha: 0.045, puffs: 14 },
    { y: 0.74, speed: 9, alpha: 0.055, puffs: 12 },
    { y: 0.88, speed: 15, alpha: 0.065, puffs: 10 },
  ].map((l) => ({ ...l, list: Array.from({ length: l.puffs }, () => ({ x: rand(), dy: (rand() - 0.5) * 0.06, r: 0.08 + rand() * 0.12 })) }));
  const sky = Array.from({ length: 6 }, () => ({ x: rand(), y: 0.08 + rand() * 0.3, r: 0.15 + rand() * 0.2 }));
  const motes = Array.from({ length: 40 }, () => ({ x: rand(), y: rand(), v: 0.004 + rand() * 0.01, s: 0.6 + rand() * 1.4, p: rand() * TAU }));
  const phases = [0.3, 1.9, 3.4, 5.1];
  let reduced = !!opts.reducedMotion, tier = opts.tier || 'high', raf = 0, w = 0, hgt = 0, dpr = 1, t0 = performance.now();
  let shells = [];

  function resize() {
    const rect = container.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, tier === 'low' ? 1 : 1.5);
    w = Math.max(1, rect.width); hgt = Math.max(1, rect.height);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const lay = w < 760 ? LAYOUT.narrow : LAYOUT.wide;
    const unit = w < 760 ? w : Math.min(w, hgt);
    shells = lay.map((L, i) => ({ ...L, px: Math.max(24, Math.round(unit * L.s * dpr)), img: renderShell(geo, Math.max(24, Math.round(unit * L.s * dpr)), { cracked: !!L.cracked, hue: phases[i], seed: 11 + i }) }));
    if (reduced) draw(14);
  }

  const puff = (x, y, r, a) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(203,214,207,${a})`); g.addColorStop(1, 'rgba(203,214,207,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };

  function cloudLayer(L, t) {
    const band = ctx.createLinearGradient(0, hgt * (L.y - 0.06), 0, hgt);
    band.addColorStop(0, 'rgba(183,198,189,0)'); band.addColorStop(0.25, `rgba(183,198,189,${L.alpha * 0.5})`); band.addColorStop(1, `rgba(183,198,189,${L.alpha * 0.7})`);
    ctx.fillStyle = band; ctx.fillRect(0, hgt * (L.y - 0.06), w, hgt);
    const n = tier === 'low' ? Math.ceil(L.list.length / 2) : L.list.length;
    for (let i = 0; i < n; i++) {
      const p = L.list[i];
      const span = w * 1.4;
      const x = ((p.x * span + t * L.speed) % span) - w * 0.2;
      puff(x, hgt * (L.y + p.dy), p.r * Math.max(w, hgt), L.alpha * 1.6);
    }
  }

  function archipelago(t) {
    const narrow = w < 760;
    const cx = narrow ? w * 0.5 : w * 0.58, cy = hgt * (narrow ? 0.82 : 0.7), s = narrow ? w * 0.24 : Math.min(w * 0.11, hgt * 0.17);
    ctx.save();
    ctx.globalAlpha = narrow ? 0.45 : 0.75;
    const spots = [[-0.95, -0.2, 0.5], [-0.5, -0.5, 0.45], [0.5, -0.5, 0.45], [0.95, -0.2, 0.5], [-0.6, 0.42, 0.55], [0.6, 0.42, 0.55]];
    ctx.strokeStyle = 'rgba(183,198,189,0.16)'; ctx.lineWidth = 1.2;
    for (const [dx, dy] of spots) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + dx * s * 0.5, cy + dy * s * 0.5 - s * 0.12, cx + dx * s, cy + dy * s); ctx.stroke(); }
    const plateau = (x, y, k) => {
      const rw = 0.2 * k * s, rh = 0.055 * k * s, depth = 1.5 * k * s;
      const g = ctx.createLinearGradient(0, y, 0, y + depth);
      g.addColorStop(0, '#1b2624'); g.addColorStop(1, 'rgba(17,26,25,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - rw, y); ctx.lineTo(x - rw * 0.7, y + depth * 0.35); ctx.lineTo(x - rw * 0.3, y + depth); ctx.lineTo(x + rw * 0.3, y + depth); ctx.lineTo(x + rw * 0.75, y + depth * 0.4); ctx.lineTo(x + rw, y); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y, rw, rh, 0, 0, TAU); ctx.fillStyle = '#26332f'; ctx.fill();
      ctx.strokeStyle = 'rgba(183,198,189,0.22)'; ctx.stroke();
    };
    for (const [dx, dy, k] of spots) plateau(cx + dx * s, cy + dy * s, k);
    plateau(cx, cy, 1.25);
    // The central plaza's gold medallion, breathing softly.
    ctx.beginPath(); ctx.ellipse(cx, cy, 0.2 * s, 0.056 * s, 0, 0, TAU);
    ctx.strokeStyle = `rgba(212,161,95,${0.42 + Math.sin(t * 0.5) * 0.12})`; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, 0.1 * s, 0.028 * s, 0, 0, TAU); ctx.strokeStyle = 'rgba(212,161,95,0.3)'; ctx.stroke();
    ctx.restore();
  }

  function drawShells(t) {
    const alpha = w < 760 ? 0.55 : 0.78;
    shells.forEach((sh, i) => {
      const ph = phases[i];
      const size = sh.px / dpr, pad = sh.img.pad / dpr;
      const x = w * sh.x, y = hgt * sh.y + Math.sin(t * 0.32 + ph) * hgt * 0.01;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.35 + i * 0.5 + Math.sin(t * 0.09 + ph) * 0.035);
      ctx.globalAlpha = alpha;
      ctx.drawImage(sh.img.canvas, -size / 2 - pad, -size / 2 - pad, size + pad * 2, size + pad * 2);
      // A slow pearly glint sliding across the nacre.
      ctx.globalCompositeOperation = 'lighter';
      const gx = Math.cos(t * 0.13 + ph) * size * 0.22, gy = -size * 0.16 + Math.sin(t * 0.11 + ph) * size * 0.06;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, size * 0.36);
      g.addColorStop(0, 'rgba(233,233,219,0.09)'); g.addColorStop(1, 'rgba(233,233,219,0)');
      ctx.fillStyle = g; ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
      if (sh.cracked) {
        // Fragments drifting near the break.
        ctx.save(); ctx.globalAlpha = alpha * 0.8; ctx.fillStyle = '#d9ddd2';
        for (let k = 0; k < 4; k++) {
          const fx = x + size * (0.38 + k * 0.07), fy = y - size * (0.25 - k * 0.12) + Math.sin(t * 0.4 + k) * size * 0.03;
          ctx.save(); ctx.translate(fx, fy); ctx.rotate(t * 0.05 * (k % 2 ? 1 : -1) + k);
          const q = size * (0.035 - k * 0.005);
          ctx.beginPath(); ctx.moveTo(-q, -q * 0.6); ctx.lineTo(q, -q); ctx.lineTo(q * 0.6, q); ctx.lineTo(-q * 0.8, q * 0.7); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }
    });
  }

  function draw(t) {
    const bg = ctx.createLinearGradient(0, 0, 0, hgt);
    bg.addColorStop(0, '#16211f'); bg.addColorStop(0.55, '#111a19'); bg.addColorStop(1, '#141f1d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, hgt);
    // Soft light breathing from above.
    const lx = w * (w < 760 ? 0.6 : 0.68), ly = -hgt * 0.15, lr = Math.max(w, hgt) * 0.95;
    const light = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
    light.addColorStop(0, `rgba(183,198,189,${0.11 + Math.sin(t * 0.4) * 0.025})`); light.addColorStop(1, 'rgba(183,198,189,0)');
    ctx.fillStyle = light; ctx.fillRect(0, 0, w, hgt);
    for (const c of sky) puff(((c.x * w * 1.3 + t * 2) % (w * 1.3)) - w * 0.15, c.y * hgt, c.r * Math.max(w, hgt), 0.035);
    archipelago(t);
    cloudLayer(layers[0], t);
    cloudLayer(layers[1], t);
    drawShells(t);
    cloudLayer(layers[2], t);
    const n = tier === 'low' ? 16 : motes.length;
    for (let i = 0; i < n; i++) {
      const m = motes[i];
      const y = ((m.y - t * m.v) % 1 + 1) % 1;
      ctx.fillStyle = `rgba(233,233,219,${0.07 + 0.1 * (0.5 + 0.5 * Math.sin(t * 0.7 + m.p))})`;
      ctx.beginPath(); ctx.arc((m.x + Math.sin(t * 0.1 + m.p) * 0.01) * w, y * hgt, m.s, 0, TAU); ctx.fill();
    }
  }

  function frame(now) {
    raf = 0;
    if (reduced || document.hidden) return;
    draw((now - t0) / 1000);
    raf = requestAnimationFrame(frame);
  }
  const start = () => { if (!reduced && !raf && !document.hidden) raf = requestAnimationFrame(frame); };
  const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else start(); };

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(container); else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVis);
  resize();
  if (reduced) draw(14); else start();

  return {
    canvas,
    setReduced(v) { reduced = !!v; cancelAnimationFrame(raf); raf = 0; if (reduced) draw(14); else start(); },
    setTier(v) { tier = v; resize(); },
    destroy() { cancelAnimationFrame(raf); if (ro) ro.disconnect(); else window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVis); canvas.remove(); },
  };
}
