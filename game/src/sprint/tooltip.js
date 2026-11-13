// One tooltip component for the whole game (sprint plan 3.2, 8.3): #ftf-tooltip on body, role=tooltip, aria-describedby
// on the anchor; 250 ms hover delay, immediate on keyboard focus; hides on blur, Esc, scroll and pointerleave; max
// width 320 x --u; text only (never innerHTML); flips to stay inside the viewport (8 px margin); touch: first tap shows,
// second tap activates; a tap anywhere else or Esc closes it.
export const DELAY_MS = 250;
const MARGIN = 8;
let el = null, current = null, timer = 0;

function node(doc) {
  if (el && el.ownerDocument === doc && el.isConnected) return el;
  el = doc.createElement('div'); el.id = 'ftf-tooltip'; el.setAttribute('role', 'tooltip'); el.hidden = true;
  el.style.cssText = 'position:fixed;left:0;top:0;z-index:var(--z-tooltip,60);max-width:calc(320 * var(--u, 1px));min-width:120px;box-sizing:border-box;padding:8px 12px;'
    + 'background:var(--ftf-panel-solid,#0e1018);border:1px solid var(--ftf-border,#3a3f55);border-radius:var(--radius,10px);color:var(--ftf-text,#eef0f6);'
    + 'font:var(--fs-sm,14px)/1.35 var(--font-ui,system-ui,sans-serif);box-shadow:var(--shadow,0 8px 32px rgba(0,0,0,.55));pointer-events:none;overflow-wrap:anywhere';
  doc.body.append(el);
  if (!doc.__ftfTtWired && doc.addEventListener) {
    doc.__ftfTtWired = true;
    // closes on a tap anywhere but its anchor, and on Esc (owner rule 13.11)
    doc.addEventListener('pointerdown', onDocDown, true);
    doc.addEventListener('keydown', onDocKey, true);
  }
  return el;
}
/** Exported for tests: a pointerdown anywhere except on the anchor hides the open tooltip. */
export function onDocDown(e) { if (current && !(current === e.target || (current.contains && current.contains(e.target)))) hide(null); }
export function onDocKey(e) { if (e.key === 'Escape' && current) hide(null); }

/** Pure: where the box goes so it stays inside the viewport (prefers above the anchor, flips below). */
export function placeTooltip(anchor, box, view) {
  let top = anchor.top - box.height - MARGIN, left = anchor.left + anchor.width / 2 - box.width / 2;
  if (top < MARGIN) top = anchor.bottom + MARGIN;
  if (top + box.height > view.height - MARGIN) top = Math.max(MARGIN, view.height - MARGIN - box.height);
  left = Math.max(MARGIN, Math.min(left, view.width - MARGIN - box.width));
  return { left: Math.round(left), top: Math.round(top) };
}

/** Shows content at anchor now; returns hide(). content = {title, rarity?, lines: string[], footer?, wide?}. */
export function showTooltip(anchor, content) {
  const doc = anchor.ownerDocument || document, t = node(doc);
  t.replaceChildren();
  const add = (cls, text, css) => { const d = doc.createElement('div'); d.className = cls; d.textContent = String(text); if (css) d.style.cssText = css; t.append(d); };
  if (content.title) add('ftf-tt-title', content.title, `font-weight:700;color:${content.rarity ? `var(--rar-${content.rarity},#f6c860)` : 'var(--ftf-gold,#f6c860)'};margin-bottom:2px`);
  for (const l of content.lines || []) add('ftf-tt-line', l);
  if (content.footer) add('ftf-tt-footer', content.footer, 'margin-top:6px;color:var(--ftf-muted,#aab1c5);font-size:var(--fs-xs,12px)');
  t.style.maxWidth = content.wide ? 'calc(480 * var(--u, 1px))' : '';
  t.hidden = false;
  const a = anchor.getBoundingClientRect(), b = t.getBoundingClientRect();
  const win = doc.defaultView || globalThis;
  const p = placeTooltip(a, { width: b.width, height: b.height }, { width: win.innerWidth || 1280, height: win.innerHeight || 720 });
  t.style.left = p.left + 'px'; t.style.top = p.top + 'px';
  anchor.setAttribute('aria-describedby', 'ftf-tooltip');
  current = anchor;
  return () => hide(anchor);
}

function hide(anchor) {
  clearTimeout(timer);
  if (anchor && current && anchor !== current) return;
  if (el) el.hidden = true;
  if (current) current.removeAttribute('aria-describedby');
  current = null;
}
export const hideTooltip = () => hide(null);

/** Wires an element: hover (delayed), focus (immediate), Esc/blur/leave hide; touch first tap shows. Returns detach. */
export function attachTooltip(target, getContent) {
  const show = () => { const c = typeof getContent === 'function' ? getContent() : getContent; if (c) showTooltip(target, c); };
  const enter = (e) => { if (e.pointerType === 'touch') return; clearTimeout(timer); timer = setTimeout(show, DELAY_MS); };
  const leave = () => hide(target);
  const key = (e) => { if (e.key === 'Escape') hide(target); };
  const tap = (e) => { if (e.pointerType !== 'touch') return; if (current !== target) { e.preventDefault(); e.stopPropagation(); show(); } };
  target.addEventListener('pointerenter', enter); target.addEventListener('pointerleave', leave);
  target.addEventListener('focus', show); target.addEventListener('blur', leave); target.addEventListener('keydown', key);
  target.addEventListener('pointerdown', tap, true);
  const scroll = () => hide(target); (target.ownerDocument.defaultView || globalThis).addEventListener('scroll', scroll, true);
  return () => {
    hide(target);
    target.removeEventListener('pointerenter', enter); target.removeEventListener('pointerleave', leave);
    target.removeEventListener('focus', show); target.removeEventListener('blur', leave); target.removeEventListener('keydown', key);
    target.removeEventListener('pointerdown', tap, true);
    (target.ownerDocument.defaultView || globalThis).removeEventListener('scroll', scroll, true);
  };
}
