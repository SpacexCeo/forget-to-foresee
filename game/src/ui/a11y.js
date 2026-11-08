// Accessibility helpers (Task Q, docs/accessibility.md). Browser parts: the stylesheet that turns
// the prefs' data attributes into UI scale / contrast / font / palette (a11y.css), the readable font
// loader, hold-to-confirm for destructive buttons, a target-size audit. Pure parts (used by tests
// and by the docs): WCAG contrast and a colour-vision-deficiency simulation.
import { createNarration } from '../play/narration.js';

/** Adds a11y.css once (Vite dev, build and static serving). */
export function ensureA11yStyles(doc = globalThis.document) {
  if (!doc || doc.querySelector('link[data-ftf-a11y]')) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./a11y.css', import.meta.url).href;
  link.dataset.ftfA11y = '';
  doc.head.appendChild(link);
}

let fontLoading = null;
/** Loads Atkinson Hyperlegible (OFL, bundled) the first time the readable font is chosen. */
export function loadReadableFont() {
  if (fontLoading) return fontLoading;
  fontLoading = Promise.all([import('@fontsource/atkinson-hyperlegible/400.css'), import('@fontsource/atkinson-hyperlegible/700.css')]).catch(() => { /* system sans fallback */ });
  return fontLoading;
}

/**
 * Keeps the stylesheet, the font and the shared narration in step with the prefs.
 * Returns the narration instance (also stored as ctx.narration so Settings and the play layer share it).
 */
export function attachA11y(ctx, doc = globalThis.document) {
  ensureA11yStyles(doc);
  const sync = (p) => { if (p.font === 'readable') loadReadableFont(); };
  sync(ctx.prefs.get());
  ctx.prefs.subscribe(sync);
  if (!ctx.narration) ctx.narration = createNarration({ prefs: ctx.prefs, i18n: ctx.i18n });
  return ctx.narration;
}

/**
 * Hold-to-confirm: the button fires `onConfirm` after being held for `ms` (pointer or Enter/Space),
 * never on a tap. Works with one finger or one key; releasing early cancels. Progress is drawn by
 * a11y.css through the --hold custom property. Returns a detach function.
 * @param {HTMLElement} button
 * @param {{ms?: number, onConfirm: () => void, onProgress?: (t:number)=>void, now?: () => number, raf?: (fn:Function)=>any, hint?: string}} o
 */
export function holdToConfirm(button, { ms = 700, onConfirm, onProgress, now = () => performance.now(), raf = (fn) => setTimeout(fn, 16), hint } = {}) {
  button.classList.add('a11y-hold');
  button.setAttribute('aria-keyshortcuts', 'Enter Space');
  if (hint) button.setAttribute('title', hint);
  let start = null, fired = false, keyHeld = false;
  const setProgress = (t) => { button.style.setProperty('--hold', Math.round(t * 100) + '%'); if (onProgress) onProgress(t); };
  function tick() {
    if (start == null) return;
    const t = Math.min(1, (now() - start) / ms);
    setProgress(t);
    if (t >= 1) { start = null; fired = true; button.dataset.holding = 'false'; setProgress(0); onConfirm(); return; }
    raf(tick);
  }
  function begin() { if (start != null || button.disabled) return; fired = false; start = now(); button.dataset.holding = 'true'; raf(tick); }
  function end() { if (start == null) return; start = null; button.dataset.holding = 'false'; setProgress(0); }
  const onDown = (e) => { if (e.button != null && e.button !== 0) return; begin(); };
  const onKeyDown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && !keyHeld) { keyHeld = true; e.preventDefault(); begin(); } };
  const onKeyUp = (e) => { if (e.key === 'Enter' || e.key === ' ') { keyHeld = false; e.preventDefault(); end(); } };
  const onClick = (e) => { if (e.preventDefault) e.preventDefault(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); else if (e.stopPropagation) e.stopPropagation(); }; // a click alone never confirms
  button.addEventListener('pointerdown', onDown);
  for (const t of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) button.addEventListener(t, end);
  button.addEventListener('keydown', onKeyDown);
  button.addEventListener('keyup', onKeyUp);
  button.addEventListener('click', onClick, true);
  return () => {
    end();
    button.removeEventListener('pointerdown', onDown);
    for (const t of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) button.removeEventListener(t, end);
    button.removeEventListener('keydown', onKeyDown); button.removeEventListener('keyup', onKeyUp); button.removeEventListener('click', onClick, true);
    button.classList.remove('a11y-hold');
  };
}

/**
 * Audits visible interactive targets under `root`: returns those smaller than `min` CSS px in either
 * dimension (WCAG 2.2 target size; the game's own bar is 48 px). Browser only.
 */
export function auditTargets(root = globalThis.document, { min = 48, selector = 'button, a[href], input, select, [role="button"]' } = {}) {
  const out = [];
  for (const el of root.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue; // hidden
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
    if (r.width < min || r.height < min) out.push({ el, w: Math.round(r.width), h: Math.round(r.height), label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40), cls: el.className });
  }
  return out;
}

/* ---------- pure colour math (tests, docs) ---------- */

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}
const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export function luminance(hex) { const [r, g, b] = hexToRgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
/** WCAG 2.x contrast ratio between two hex colours. */
export function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

/** Machado, Oliveira & Fernandes (2009) matrices, severity 1.0, applied in linear RGB. */
export const CVD_MATRICES = Object.freeze({
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
});
/** Simulated appearance of a hex colour for a dichromat, as [r, g, b] 0–255 (sRGB). */
export function simulateCvd(hex, kind) {
  const m = CVD_MATRICES[kind];
  const l = hexToRgb(hex).map(lin);
  const out = m.map((row) => row[0] * l[0] + row[1] * l[1] + row[2] * l[2]);
  return out.map((c) => { const v = Math.min(1, Math.max(0, c)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)); });
}
/** Perceptual distance (CIE76 ΔE) between two sRGB triplets. */
export function deltaE(rgbA, rgbB) {
  const lab = ([r, g, b]) => {
    const [R, G, B] = [r, g, b].map(lin);
    let [x, y, z] = [(R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, R * 0.2126 + G * 0.7152 + B * 0.0722, (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883];
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    [x, y, z] = [f(x), f(y), f(z)];
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const a = lab(rgbA), b = lab(rgbB);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
