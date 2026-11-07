// Lobby background: calm mist drifting around a spiral seashell silhouette.
// Canvas 2D, pointer-events: none, so it can never block input. With reduced
// motion it draws one still frame and schedules nothing. Pauses when hidden.

const TAU = Math.PI * 2;

/** Points of a nautilus-like logarithmic spiral, normalised to fit a unit box. */
function shellGeometry() {
  const b = Math.log(3) / TAU; // the shell triples its radius every turn
  const end = 3.15 * Math.PI;
  const r = (t) => Math.exp(b * t);
  const pt = (t) => [r(t) * Math.cos(t), r(t) * Math.sin(t)];
  const outer = [];
  for (let t = end - TAU; t <= end + 1e-6; t += 0.04) outer.push(pt(t));
  const seam = [];
  for (let t = 0; t <= end - TAU + 1e-6; t += 0.05) seam.push(pt(t));
  const septa = [];
  for (let t = end - 0.25; t > 0.6; t -= 0.42) septa.push([pt(t), pt(t - TAU)]);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of outer) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, s = 1 / Math.max(maxX - minX, maxY - minY);
  const n = ([x, y]) => [(x - cx) * s, (y - cy) * s];
  return { outer: outer.map(n), seam: seam.map(n), septa: septa.map(([a, c]) => [n(a), n(c)]), lip: [n(pt(end)), n(pt(end - TAU))] };
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * @param {HTMLElement} container  receives a full-size canvas
 * @param {{reducedMotion?: boolean, tier?: 'high'|'low'}} opts
 */
export function mountBackground(container, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const geo = shellGeometry();
  const rand = seeded(1307);
  const blobs = Array.from({ length: 7 }, () => ({ x: rand(), y: 0.25 + rand() * 0.7, r: 0.25 + rand() * 0.35, sx: 0.01 + rand() * 0.02, sy: 0.006 + rand() * 0.01, p: rand() * TAU, a: 0.035 + rand() * 0.04 }));
  const motes = Array.from({ length: 46 }, () => ({ x: rand(), y: rand(), v: 0.004 + rand() * 0.01, s: 0.6 + rand() * 1.6, p: rand() * TAU }));
  let reduced = !!opts.reducedMotion, tier = opts.tier || 'high', raf = 0, w = 0, hgt = 0, dpr = 1, t0 = performance.now();

  function resize() {
    const rect = container.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, tier === 'low' ? 1 : 1.5);
    w = Math.max(1, rect.width); hgt = Math.max(1, rect.height);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduced) draw(14);
  }

  function mist(t, alphaScale) {
    for (const b of blobs) {
      const x = (b.x + Math.sin(t * b.sx + b.p) * 0.12) * w;
      const y = (b.y + Math.cos(t * b.sy + b.p) * 0.05) * hgt;
      const r = b.r * Math.max(w, hgt);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(183,198,189,${b.a * alphaScale})`);
      g.addColorStop(1, 'rgba(183,198,189,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  function shell(t) {
    const narrow = w < 760;
    const size = Math.min(w, hgt) * (narrow ? 0.6 : 0.6);
    const cx = narrow ? w * 0.7 : w * 0.64, cy = narrow ? hgt * 0.24 : hgt * 0.4;
    const alpha = narrow ? 0.5 : 1;
    const breath = 1 + Math.sin(t * 0.35) * 0.012;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-2.05 + Math.sin(t * 0.05) * 0.05); // aperture faces down
    ctx.scale(size * breath, size * breath);
    const path = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
    // silhouette
    path(geo.outer); ctx.closePath();
    const g = ctx.createRadialGradient(0.05, 0.05, 0, 0, 0, 0.62);
    g.addColorStop(0, `rgba(83,100,93,${0.42 * alpha})`);
    g.addColorStop(0.7, `rgba(47,62,57,${0.32 * alpha})`);
    g.addColorStop(1, `rgba(17,26,25,${0.1 * alpha})`);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.4 / size;
    ctx.strokeStyle = `rgba(183,198,189,${0.34 * alpha})`; ctx.stroke();
    // chambers
    ctx.strokeStyle = `rgba(183,198,189,${0.16 * alpha})`;
    for (const [a, c] of geo.septa) {
      ctx.beginPath(); ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo((a[0] + c[0]) / 2 * 0.82, (a[1] + c[1]) / 2 * 0.82, c[0], c[1]);
      ctx.stroke();
    }
    path(geo.seam); ctx.strokeStyle = `rgba(183,198,189,${0.24 * alpha})`; ctx.stroke();
    // aperture lip, a faint amber thread: the human's choice
    ctx.beginPath(); ctx.moveTo(geo.lip[0][0], geo.lip[0][1]); ctx.lineTo(geo.lip[1][0], geo.lip[1][1]);
    ctx.lineWidth = 2 / size; ctx.strokeStyle = `rgba(212,161,95,${(0.28 + Math.sin(t * 0.6) * 0.06) * alpha})`; ctx.stroke();
    ctx.restore();
  }

  function draw(t) {
    const bg = ctx.createLinearGradient(0, 0, 0, hgt);
    bg.addColorStop(0, '#111a19'); bg.addColorStop(1, '#0b1110');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, hgt);
    mist(t, 0.8);
    shell(t);
    mist(t * 1.3 + 40, 0.55); // fog passing in front of the shell
    const fog = ctx.createLinearGradient(0, hgt * 0.62, 0, hgt);
    fog.addColorStop(0, 'rgba(183,198,189,0)'); fog.addColorStop(1, 'rgba(183,198,189,0.07)');
    ctx.fillStyle = fog; ctx.fillRect(0, hgt * 0.62, w, hgt * 0.38);
    const n = tier === 'low' ? 18 : motes.length;
    for (let i = 0; i < n; i++) {
      const m = motes[i];
      const y = ((m.y - t * m.v) % 1 + 1) % 1;
      ctx.fillStyle = `rgba(233,233,219,${0.08 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.7 + m.p))})`;
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
