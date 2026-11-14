// First-seen coach marks (sprint plan 1.5, 7.7, 8.3): one registry, one queue, each tip once. Persisted in
// localStorage ftf.tips.v1 = {seen: {id: true}, off: false}. "Got it" marks it seen; "Skip tips" turns all off;
// resetTips() clears both; showTip(id, {force}) re-shows one (the "?" handles). Never during the intro (npe) or while a
// modal is open (#ftf-modal-open / body.ftf-modal-open). Emits tip.shown / tip.dismissed.
import { emit, on, state } from './bus.js';

export const TIPS_KEY = 'ftf.tips.v1';
const registry = new Map();
const queue = [];
let showing = null, store = null, docRef = null, touchOverride = null;

const getStore = () => { if (store) return store; try { return globalThis.localStorage || null; } catch { return null; } };
function load() { try { const v = JSON.parse(getStore().getItem(TIPS_KEY) || 'null'); return v && typeof v === 'object' ? { seen: v.seen || {}, off: !!v.off } : { seen: {}, off: false }; } catch { return { seen: {}, off: false }; } }
function save(v) { try { getStore().setItem(TIPS_KEY, JSON.stringify(v)); } catch { /* not kept */ } }

/** Tests and the sprint mount: use this storage and document. */
export function _configure({ storage = null, doc = null, touch = null } = {}) { store = storage; docRef = doc; touchOverride = touch; }

/** Owner rule (13.11): on a phone nothing pops up on its own; tips show only from an explicit "?" tap (force). */
export function isTouch(doc) {
  if (touchOverride !== null) return !!touchOverride;
  try {
    if (doc && doc.body && doc.body.classList.contains('ts-touch')) return true;
    const win = (doc && doc.defaultView) || globalThis;
    return !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches);
  } catch { return false; }
}
export function _reset() { registry.clear(); queue.length = 0; showing = null; if (drainTimer) { clearInterval(drainTimer); drainTimer = null; } }

/** registerTip({id, trigger, anchor, title, body}): trigger = bus event name (fires the tip once) or null (manual). */
export function registerTip(tip) {
  if (!tip || !tip.id || registry.has(tip.id)) return;
  registry.set(tip.id, tip);
  if (tip.trigger) on(tip.trigger, () => showTip(tip.id));
}
export function resetTips() { save({ seen: {}, off: false }); }
export function skipTips() { const v = load(); v.off = true; save(v); hideCurrent(); queue.length = 0; }

// a tip waits while the intro runs or a window is open (the game menu, a chest reveal, a Day-1 card): it never pops over one (jury path 14.11)
const blocked = (doc) => !!(state.get('npe.active') || (doc && (doc.getElementById && doc.getElementById('ftf-modal-open') || (doc.body && (doc.body.classList.contains('ftf-modal-open') || doc.body.classList.contains('ftf-in-shoal'))) || (doc.querySelector && doc.querySelector('.gm, .co, .cb, .d1-panel, .d1-card, .ftf-portal-panel, dialog[open]')))));

// a tip held back by an open window shows once the window closes (checked every 1.5 s while one waits)
let drainTimer = null;
function drainLater(doc) {
  if (drainTimer || typeof setInterval !== 'function') return;
  drainTimer = setInterval(() => {
    if (!queue.length) { clearInterval(drainTimer); drainTimer = null; return; }
    if (!showing && !blocked(doc)) { clearInterval(drainTimer); drainTimer = null; showTip(queue.shift()); }
  }, 1500);
}

/** Shows (or queues) a tip. {force: true} ignores seen/off (the "?" handle). Returns true when shown or queued. */
export function showTip(id, { force = false } = {}) {
  const tip = registry.get(id); if (!tip) return false;
  const v = load();
  if (!force && (v.off || v.seen[id])) return false;
  const doc0 = docRef || globalThis.document;
  if (!force && isTouch(doc0)) return false;
  if (showing) { if (showing.id !== id && !queue.includes(id)) queue.push(id); return true; }
  const doc = docRef || globalThis.document;
  if (!doc || !doc.body) return false;
  if (!force && blocked(doc)) { if (!queue.includes(id)) queue.push(id); drainLater(doc); return true; }
  render(doc, tip);
  return true;
}

function hideCurrent() { if (showing && showing.off) showing.off(); if (showing && showing.el) showing.el.remove(); showing = null; }
function done(markSeen) {
  if (!showing) return;
  const id = showing.id;
  if (markSeen) { const v = load(); v.seen[id] = true; save(v); }
  hideCurrent();
  emit('tip.dismissed', { id });
  const next = queue.shift(); if (next) showTip(next);
}

/** A visible element's box, or null (missing, hidden or zero-size anchors fall back to the default spot). */
function rectOf(e) {
  if (!e || !e.getBoundingClientRect) return null;
  const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null;
}
/** Boxes of the visible buttons on screen (the tip itself excluded): the tip must not cover any of them. */
function buttonRects(doc, self) {
  if (!doc.querySelectorAll) return [];
  const out = [];
  for (const e of doc.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="tab"]')) {
    if (self.contains(e)) continue;
    const r = rectOf(e); if (!r) continue;
    try { const s = (doc.defaultView || globalThis).getComputedStyle(e); if (s.visibility === 'hidden' || +s.opacity === 0 || s.pointerEvents === 'none') continue; } catch { /* keep it */ }
    out.push(r);
  }
  return out;
}
/**
 * Where a w x h tip goes in a W x H screen: next to the anchor (below, above, right, left), else upper centre; the
 * first spot that covers no button wins, else the nearest free spot on a 24 px grid, else the least covering one.
 */
export function placeTip({ W, H, w, h, anchor = null, avoid = [] }) {
  const clamp = (l, t) => ({ left: Math.max(8, Math.min(l, W - w - 8)), top: Math.max(8, Math.min(t, H - h - 8)) });
  const cover = (p) => { let s = 0; for (const r of avoid) { const x = Math.min(p.left + w, r.right) - Math.max(p.left, r.left), y = Math.min(p.top + h, r.bottom) - Math.max(p.top, r.top); if (x > 0 && y > 0) s += x * y; } return s; };
  const prefer = [];
  if (anchor) prefer.push(clamp(anchor.left, anchor.bottom + 10), clamp(anchor.left, anchor.top - h - 10), clamp(anchor.right + 10, anchor.top), clamp(anchor.left - w - 10, anchor.top));
  prefer.push(clamp((W - w) / 2, H * 0.18));
  for (const p of prefer) if (!cover(p)) return p;
  const home = prefer[0]; const grid = [];
  for (let t = 8; t <= H - h - 8; t += 24) for (let l = 8; l <= W - w - 8; l += 24) grid.push({ left: l, top: t });
  grid.sort((p, q) => Math.hypot(p.left - home.left, p.top - home.top) - Math.hypot(q.left - home.left, q.top - home.top));
  let best = home, bestCover = cover(home);
  for (const p of grid) { const c = cover(p); if (c < bestCover) { best = p; bestCover = c; if (!c) break; } }
  return best;
}

function render(doc, tip) {
  const el = doc.createElement('div'); el.className = 'ftf-tip'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', tip.title || 'Tip');
  el.style.cssText = 'position:fixed;left:0;top:0;z-index:var(--z-coach,35);width:max-content;max-width:min(340px, calc(100vw - 32px));box-sizing:border-box;padding:12px 14px;'
    // owner 14.11: minimalism, no backing panel - text straight on the scene with a light shadow, like the HUD
    + 'background:none;border:0;color:#f1ead8;text-shadow:0 1px 3px rgba(0,0,0,.85),0 0 8px rgba(0,0,0,.45);'
    + 'font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-wrap:anywhere';
  const h = doc.createElement('div'); h.style.cssText = 'font-weight:700;color:#e9b44c;margin-bottom:4px'; h.textContent = tip.title || '';
  const p = doc.createElement('div'); p.textContent = tip.body || '';
  const row = doc.createElement('div'); row.style.cssText = 'display:flex;gap:14px;margin-top:8px;justify-content:flex-end';
  const mk = (text, fn, primary) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = text; b.style.cssText = `min-height:32px;padding:0 4px;border:0;background:none;cursor:pointer;font:600 13px system-ui,sans-serif;text-shadow:inherit;${primary ? 'color:#f6df9b;text-decoration:underline;text-underline-offset:3px' : 'color:#c9cfc6'}`; b.addEventListener('click', fn); return b; };
  row.append(mk('Skip tips', () => { skipTips(); emit('tip.dismissed', { id: tip.id, skipped: true }); }, false), mk('Got it', () => done(true), true));
  el.append(h, p, row);
  // a click on the tip stays on the tip: an open window (the inventory) must not read it as a click outside and close
  for (const ev of ['pointerdown', 'mousedown', 'click']) el.addEventListener(ev, (e) => { if (e && e.stopPropagation) e.stopPropagation(); });
  doc.body.append(el);
  // place next to the anchor (selector or element), else upper centre; never over a visible button (owner, 14.11)
  const a = typeof tip.anchor === 'string' ? doc.querySelector(tip.anchor) : tip.anchor;
  const win = doc.defaultView || globalThis, W = win.innerWidth || 1280, H = win.innerHeight || 720;
  const b = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 300, height: 120 };
  const { left, top } = placeTip({ W, H, w: b.width, h: b.height, anchor: rectOf(a), avoid: buttonRects(doc, el) });
  el.style.left = Math.round(left) + 'px'; el.style.top = Math.round(top) + 'px';
  // closes on a tap anywhere outside it, or on Esc
  const outside = (e) => { if (!el.contains(e.target)) done(true); };
  const esc = (e) => { if (e.key === 'Escape') done(true); };
  // a window opened over the tip (the inventory, the menu): the tip steps back unseen and returns when it closes,
  // so a click meant for the tip never lands on the window's backdrop and closes it (critic play test 14.11)
  const watch = typeof setInterval === 'function' ? setInterval(() => { if (showing && showing.el === el && blocked(doc)) { const id = tip.id; hideCurrent(); if (!queue.includes(id)) queue.unshift(id); drainLater(doc); } }, 400) : null;
  if (watch && watch.unref) watch.unref();
  const off = () => { if (watch) clearInterval(watch); if (doc.removeEventListener) { doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('keydown', esc, true); } };
  if (doc.addEventListener) { doc.addEventListener('pointerdown', outside, true); doc.addEventListener('keydown', esc, true); }
  showing = { id: tip.id, el, off };
  emit('tip.shown', { id: tip.id });
}

/** Module contract (registry.js): mount(ctx) -> {dispose}. */
export function mount(ctx = {}) {
  if (ctx.storage) _configure({ storage: ctx.storage });
  return { dispose() { hideCurrent(); } };
}
