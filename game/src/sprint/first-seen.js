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
export function _reset() { registry.clear(); queue.length = 0; showing = null; }

/** registerTip({id, trigger, anchor, title, body}): trigger = bus event name (fires the tip once) or null (manual). */
export function registerTip(tip) {
  if (!tip || !tip.id || registry.has(tip.id)) return;
  registry.set(tip.id, tip);
  if (tip.trigger) on(tip.trigger, () => showTip(tip.id));
}
export function resetTips() { save({ seen: {}, off: false }); }
export function skipTips() { const v = load(); v.off = true; save(v); hideCurrent(); queue.length = 0; }

const blocked = (doc) => !!(state.get('npe.active') || (doc && (doc.getElementById && doc.getElementById('ftf-modal-open') || (doc.body && doc.body.classList.contains('ftf-modal-open')))));

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
  if (!force && blocked(doc)) { if (!queue.includes(id)) queue.push(id); return true; }
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

function render(doc, tip) {
  const el = doc.createElement('div'); el.className = 'ftf-tip'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', tip.title || 'Tip');
  el.style.cssText = 'position:fixed;z-index:var(--z-tooltip,60);max-width:min(calc(320 * var(--u, 1px) + 40px), calc(100vw - 32px));box-sizing:border-box;padding:12px 14px;'
    + 'background:var(--ftf-panel-solid,#0e1018);border:1px solid var(--ftf-gold,#f6c860);border-radius:var(--radius,10px);color:var(--ftf-text,#eef0f6);'
    + 'font:var(--fs-sm,14px)/1.4 var(--font-ui,system-ui,sans-serif);box-shadow:var(--shadow,0 8px 32px rgba(0,0,0,.55));overflow-wrap:anywhere';
  const h = doc.createElement('div'); h.style.cssText = 'font-weight:700;color:var(--ftf-gold,#f6c860);margin-bottom:4px'; h.textContent = tip.title || '';
  const p = doc.createElement('div'); p.textContent = tip.body || '';
  const row = doc.createElement('div'); row.style.cssText = 'display:flex;gap:8px;margin-top:10px;justify-content:flex-end';
  const mk = (text, fn, primary) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = text; b.style.cssText = `min-height:40px;padding:0 14px;border-radius:8px;cursor:pointer;font-weight:700;${primary ? 'background:var(--ftf-gold,#f6c860);color:#1b1608;border:0' : 'background:transparent;color:var(--ftf-muted,#aab1c5);border:1px solid var(--ftf-border,#3a3f55)'}`; b.addEventListener('click', fn); return b; };
  row.append(mk('Skip tips', () => { skipTips(); emit('tip.dismissed', { id: tip.id, skipped: true }); }, false), mk('Got it', () => done(true), true));
  el.append(h, p, row);
  doc.body.append(el);
  // place next to the anchor (selector or element), else bottom centre
  const a = typeof tip.anchor === 'string' ? doc.querySelector(tip.anchor) : tip.anchor;
  const win = doc.defaultView || globalThis, W = win.innerWidth || 1280, H = win.innerHeight || 720;
  const b = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 300, height: 120 };
  let left = (W - b.width) / 2, top = H - b.height - 120;
  if (a && a.getBoundingClientRect) { const r = a.getBoundingClientRect(); left = Math.max(16, Math.min(r.left, W - b.width - 16)); top = r.bottom + 10 + b.height > H - 16 ? Math.max(16, r.top - b.height - 10) : r.bottom + 10; }
  left = Math.max(8, Math.min(left, W - b.width - 8)); top = Math.max(8, Math.min(top, H - b.height - 8));
  el.style.left = Math.round(left) + 'px'; el.style.top = Math.round(top) + 'px';
  // closes on a tap anywhere outside it, or on Esc
  const outside = (e) => { if (!el.contains(e.target)) done(true); };
  const esc = (e) => { if (e.key === 'Escape') done(true); };
  const off = () => { if (doc.removeEventListener) { doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('keydown', esc, true); } };
  if (doc.addEventListener) { doc.addEventListener('pointerdown', outside, true); doc.addEventListener('keydown', esc, true); }
  showing = { id: tip.id, el, off };
  emit('tip.shown', { id: tip.id });
}

/** Module contract (registry.js): mount(ctx) -> {dispose}. */
export function mount(ctx = {}) {
  if (ctx.storage) _configure({ storage: ctx.storage });
  return { dispose() { hideCurrent(); } };
}
