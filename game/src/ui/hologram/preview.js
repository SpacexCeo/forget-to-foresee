// Canvas 2D preview of a hologram recipe. Purely cosmetic: reads the recipe and a
// render profile (tier), never game state. Reduced motion → a single still frame.
import { normalizeRecipe, renderProfile, recipeHash } from './recipe.js';

const TAU = Math.PI * 2;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function shapePath(ctx, shape, R, t) {
  ctx.beginPath();
  switch (shape) {
    case 'sphere':
      ctx.arc(0, 0, R, 0, TAU);
      for (const k of [-0.5, 0, 0.5]) { ctx.moveTo(R, k * R); ctx.ellipse(0, k * R, R * Math.sqrt(1 - k * k), R * 0.18, 0, 0, TAU); }
      ctx.moveTo(R * 0.35, -R); ctx.ellipse(0, 0, R * 0.35, R, 0, 0, TAU);
      break;
    case 'ring':
      ctx.arc(0, 0, R, 0, TAU); ctx.moveTo(R * 0.72, 0); ctx.arc(0, 0, R * 0.72, 0, TAU);
      break;
    case 'spiral': {
      for (let a = 0; a <= 4 * Math.PI; a += 0.08) { const r = R * a / (4 * Math.PI); const x = r * Math.cos(a + t * 0.2), y = r * Math.sin(a + t * 0.2); a ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      break;
    }
    case 'lattice': {
      const s = R / 2.4;
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
        const x = (i + (j % 2 ? 0.5 : 0)) * s, y = j * s * 0.87;
        if (x * x + y * y > R * R) continue;
        ctx.moveTo(x + 2.5, y); ctx.arc(x, y, 2.5, 0, TAU);
        if (i < 3 && (x + s) ** 2 + y * y <= R * R) { ctx.moveTo(x, y); ctx.lineTo(x + s, y); }
      }
      ctx.moveTo(R, 0); ctx.arc(0, 0, R, 0, TAU);
      break;
    }
    case 'column':
      ctx.moveTo(-R * 0.32, -R); ctx.lineTo(R * 0.32, -R); ctx.lineTo(R * 0.32, R); ctx.lineTo(-R * 0.32, R); ctx.closePath();
      for (let k = -0.6; k <= 0.61; k += 0.4) { ctx.moveTo(-R * 0.32, k * R); ctx.lineTo(R * 0.32, k * R); }
      break;
    case 'shell':
    default: {
      const b = Math.log(3) / TAU, end = 3.1 * Math.PI, sc = R / Math.exp(b * end);
      for (let a = end - TAU; a <= end; a += 0.05) { const r = sc * Math.exp(b * a); const x = r * Math.cos(a), y = r * Math.sin(a); a === end - TAU ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.closePath();
      for (let a = end - 0.3; a > 0.8; a -= 0.5) { const r1 = sc * Math.exp(b * a), r2 = sc * Math.exp(b * (a - TAU)); ctx.moveTo(r1 * Math.cos(a), r1 * Math.sin(a)); ctx.lineTo(r2 * Math.cos(a), r2 * Math.sin(a)); }
    }
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{recipe?: object, tier?: 'high'|'low', reducedMotion?: boolean}} opts
 */
export function createHologramPreview(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  let recipe = normalizeRecipe(opts.recipe);
  let tier = opts.tier || 'high';
  let reduced = !!opts.reducedMotion;
  let profile = renderProfile(recipe, tier);
  let particles = [];
  let raf = 0, size = 0, t0 = performance.now(), frames = 0;

  function seedParticles() {
    const rand = seeded(parseInt(recipeHash(recipe).slice(0, 8), 16));
    particles = Array.from({ length: recipe.particles.count }, () => ({ a: rand() * TAU, r: 0.25 + rand() * 0.85, s: 0.3 + rand(), p: rand() * TAU }));
  }
  function resize() {
    // The backing store follows the CSS box. Before layout (a zero box: the card is still mounting or
    // animating in) the picker's nominal 300 px is used, so the first paint is never a blank frame.
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: 0 };
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, profile.maxDpr);
    size = Math.max(64, Math.round(rect.width || canvas.clientWidth || 300));
    canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b1110'; ctx.fillRect(0, 0, size, size);
  }

  function draw(t) {
    frames++;
    const r = recipe, L = new Set(profile.layers);
    const warm = rgb('#d4a15f');
    const prim = mix(rgb(r.palette.primary), warm, Math.max(0, r.light.warmth) * 0.5);
    const sec = mix(rgb(r.palette.secondary), warm, Math.max(0, r.light.warmth) * 0.3);
    const acc = rgb(r.palette.accent);
    const intensity = r.light.intensity;
    // trails: partial clear keeps a fading afterimage
    ctx.globalCompositeOperation = 'source-over';
    const clearA = profile.trails && !reduced ? 1 - r.trails.length * 0.8 * (0.4 + r.trails.fade * 0.6) : 1;
    ctx.fillStyle = `rgba(11,17,16,${Math.max(0.08, clearA)})`;
    ctx.fillRect(0, 0, size, size);

    const R = size * 0.3;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    switch (r.gesture) {
      case 'breathe': ctx.scale(1 + Math.sin(t * 1.2) * 0.04, 1 + Math.sin(t * 1.2) * 0.04); break;
      case 'orbit': ctx.rotate(t * 0.35); break;
      case 'beckon': ctx.translate(Math.sin(t * 1.4) * size * 0.02, 0); ctx.rotate(Math.sin(t * 1.4) * 0.08); break;
      case 'bow': ctx.transform(1, 0, Math.sin(t * 0.9) * 0.12, 1, 0, 0); break;
      case 'spiral': ctx.rotate(t * 0.5); ctx.scale(1 + Math.sin(t) * 0.05, 1 + Math.sin(t) * 0.05); break;
      default: break;
    }
    const comps = new Set(r.components);
    if (comps.has('halo')) {
      const g = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.5);
      g.addColorStop(0, css(sec, 0.18 * intensity)); g.addColorStop(1, css(sec, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 1.5, 0, TAU); ctx.fill();
    }
    if (comps.has('veil')) {
      for (let k = -4; k <= 4; k++) { ctx.fillStyle = css(sec, 0.05 + 0.03 * Math.sin(t + k)); ctx.fillRect(k * R * 0.22 - R * 0.05, -R * 1.2, R * 0.1, R * 2.4); }
    }
    const bloom = L.has('bloom');
    ctx.shadowColor = css(prim, 0.9);
    ctx.shadowBlur = bloom ? 16 * intensity : 0;
    const lw = Math.max(1.6, size / 120); // the figure reads at any box size (300 px in the picker)
    ctx.lineWidth = lw;
    if (L.has('chromatic')) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [dx, col] of [[-1.6, [220, 80, 90]], [1.6, [80, 140, 230]]]) { ctx.save(); ctx.translate(dx, 0); shapePath(ctx, r.shape, R, t); ctx.strokeStyle = css(col, 0.35 * intensity); ctx.stroke(); ctx.restore(); }
      ctx.globalCompositeOperation = 'source-over';
    }
    shapePath(ctx, r.shape, R, t);
    ctx.fillStyle = css(prim, 0.07 + 0.05 * Math.min(1, intensity)); // a faint body under the line work
    ctx.fill();
    ctx.strokeStyle = css(prim, Math.min(1, 0.7 + 0.3 * intensity));
    ctx.stroke();
    if (L.has('outline')) { ctx.shadowBlur = 0; ctx.lineWidth = 0.8; ctx.strokeStyle = css(acc, 0.7); shapePath(ctx, r.shape, R * 1.04, t); ctx.stroke(); }
    ctx.shadowBlur = 0;
    if (comps.has('core')) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.32);
      g.addColorStop(0, css(acc, 0.9 * Math.min(1, intensity))); g.addColorStop(1, css(acc, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 0.32, 0, TAU); ctx.fill();
    }
    if (comps.has('glyphRing')) {
      ctx.strokeStyle = css(sec, 0.8); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, R * 1.18, 0, TAU); ctx.stroke();
      for (let k = 0; k < 4; k++) { const a = -Math.PI / 2 + k * Math.PI / 2; ctx.beginPath(); ctx.arc(Math.cos(a) * R * 1.18, Math.sin(a) * R * 1.18, 4, 0, TAU); ctx.fillStyle = css(acc, 0.9); ctx.fill(); }
    }
    if (comps.has('orbiters')) {
      for (let k = 0; k < 3; k++) { const a = t * (0.6 + k * 0.2) + k * 2.1; ctx.fillStyle = css(prim, 0.9); ctx.beginPath(); ctx.arc(Math.cos(a) * R * (1.3 + k * 0.08), Math.sin(a) * R * (1.3 + k * 0.08) * 0.6, 3, 0, TAU); ctx.fill(); }
    }
    if (comps.has('shards')) {
      ctx.fillStyle = css(sec, 0.6);
      for (let k = 0; k < 7; k++) { const a = k * 0.9 + t * 0.1, d = R * (1.05 + (k % 3) * 0.12); ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(3, 4); ctx.lineTo(-3, 4); ctx.closePath(); ctx.fill(); ctx.restore(); }
    }
    // particles with drift and noise
    const n = Math.min(particles.length, profile.particles);
    const ps = r.particles.size, drift = r.particles.drift, na = r.noise.amount, ns = r.noise.scale;
    for (let i = 0; i < n; i++) {
      const q = particles[i];
      const a = q.a + t * drift * 0.25 * q.s;
      let rr = q.r * R * 1.35;
      rr += Math.sin(t * ns + q.p) * na * R * 0.15;
      if (profile.noiseOctaves > 1) rr += Math.sin(t * ns * 2.3 + q.p * 3) * na * R * 0.06;
      ctx.fillStyle = css(i % 5 ? prim : acc, 0.35 + 0.4 * Math.abs(Math.sin(q.p + t)));
      ctx.fillRect(Math.cos(a) * rr - ps / 2, Math.sin(a) * rr - ps / 2, ps, ps);
    }
    ctx.restore();
    // screen-space filter layers
    if (L.has('scanlines')) { ctx.fillStyle = 'rgba(11,17,16,0.28)'; for (let y = (t * 20) % 3; y < size; y += 3) ctx.fillRect(0, y, size, 1); }
    if (L.has('grain')) { const g = seeded(Math.floor(t * 30)); ctx.fillStyle = 'rgba(233,233,219,0.07)'; for (let k = 0; k < 220; k++) ctx.fillRect(g() * size, g() * size, 1, 1); }
    if (L.has('dither')) { ctx.fillStyle = 'rgba(11,17,16,0.18)'; for (let y = 0; y < size; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < size; x += 4) ctx.fillRect(x, y, 2, 2); }
  }

  const hidden = () => typeof document !== 'undefined' && document.hidden;
  function frame(now) { raf = 0; if (reduced || document.hidden) return; draw((now - t0) / 1000); raf = requestAnimationFrame(frame); }
  function restart() {
    cancelAnimationFrame(raf); raf = 0;
    profile = renderProfile(recipe, tier);
    resize();
    // Always paint now: a look is on screen the moment it is chosen, even when the animation loop is
    // starved (a busy main thread, a hidden tab) or off (reduced motion: this one still frame).
    if (reduced) draw(1.7);
    else { draw(Math.max(0, (performance.now() - t0) / 1000)); raf = requestAnimationFrame(frame); }
  }
  // Coming back to the tab resumes the loop (frame() stops itself while the document is hidden).
  const onVisible = () => { if (!hidden() && !reduced && !raf) raf = requestAnimationFrame(frame); };
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', onVisible);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => restart()) : null;
  if (ro) ro.observe(canvas);
  seedParticles();
  restart();

  return {
    setRecipe(next) { recipe = normalizeRecipe(next); seedParticles(); restart(); },
    setTier(next) { tier = next; restart(); },
    setReduced(v) { reduced = !!v; restart(); },
    get profile() { return profile; },
    /** Frames painted so far (tests and the picker's "is it drawn" check). */
    get frames() { return frames; },
    destroy() { cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (typeof document !== 'undefined' && document.removeEventListener) document.removeEventListener('visibilitychange', onVisible); },
  };
}
