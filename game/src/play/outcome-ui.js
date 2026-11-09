// "What changed" card (readiness audit 09.11, P2): a small non-modal card that appears after a reveal
// and after a forget, so the player sees what their choice did without opening a panel. After a
// reveal: the seal fact, your reading slot by slot, the stake, the word Iris learned (from-obs.js
// outcomeLines over play/outcome.js). After a forget: what changed for Iris and who may buy the shard
// (outcome.js forgetLines). One card at a time: a newer one replaces the older; it stays while
// hovered or focused, closes on its button, and re-renders in place on a language switch.
import { renderMsg } from './i18n.js';
import { outcomeLines } from '../ui/world-hud/from-obs.js';
import { forgetLines } from './outcome.js';

const CSS = `
.oc-region { position: fixed; inset: 0; pointer-events: none; z-index: 39; }
.oc-card { position: absolute; left: 50%; top: 200px; transform: translateX(-50%); width: min(440px, calc(100vw - 32px)); box-sizing: border-box;
  pointer-events: auto; padding: 12px 40px 12px 16px; border-radius: 14px; border: 1px solid var(--wh-gold, #e4c272);
  background: rgba(12, 20, 21, .94); color: var(--wh-text, #faf7ee); box-shadow: 0 10px 30px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.05);
  font: var(--wh-font-body-weight, 500) 13px/1.4 var(--wh-font-body, system-ui, sans-serif); transition: opacity .24s ease, translate .24s ease; }
.oc-card.oc-out { opacity: 0; translate: 0 -8px; }
.oc-eyebrow { margin: 0 0 2px; font: 600 10.5px/1.2 var(--wh-font-body, system-ui, sans-serif); letter-spacing: .14em; text-transform: uppercase; color: var(--wh-gold, #e4c272); }
.oc-title { margin: 0 0 6px; font: 400 17px/1.25 var(--wh-font, Georgia, serif); color: var(--wh-text, #faf7ee); }
.oc-lines { list-style: none; margin: 0; padding: 0; display: grid; row-gap: 3px; }
.oc-lines li { color: var(--wh-text-2, #e6e3d7); }
.oc-lines li[data-tone="ok"] { color: var(--wh-gold-text, #f2dca0); }
.oc-lines li[data-tone="miss"] { color: #f1b6a6; }
.oc-lines li[data-tone="muted"] { color: var(--wh-text-muted, #c9c6b8); }
.oc-lines li[data-tone="learn"] { color: var(--wh-gold-bright, #fbe6a6); }
.oc-lines li[data-tone="tutorial"] { margin-top: 2px; padding-top: 5px; border-top: 1px solid rgba(232,214,172,.25); color: var(--wh-text-muted, #c9c6b8); font-style: italic; }
.oc-row { display: flex; gap: 8px; margin-top: 8px; }
.oc-card button { min-height: 32px; padding: 0 12px; font: 600 12.5px/1 var(--wh-font-body, system-ui, sans-serif); color: var(--wh-text, #faf7ee);
  background: var(--wh-btn-bg, rgba(10,22,23,.78)); border: 1px solid rgba(232,214,172,.45); border-radius: 999px; cursor: pointer; }
.oc-card button:hover { border-color: var(--wh-gold, #e4c272); }
.oc-card button:focus-visible { outline: 2px solid var(--wh-gold-bright, #fbe6a6); outline-offset: 2px; }
.oc-card .oc-close { position: absolute; top: 8px; right: 8px; width: 28px; min-height: 28px; padding: 0; font-size: 16px; }
@media (max-width: 700px) {
  .oc-card { top: 120px; padding: 10px 36px 10px 12px; font-size: 12px; }
  .oc-title { font-size: 15px; }
  .oc-card button { min-height: 40px; }
  .oc-card .oc-close { width: 36px; min-height: 36px; top: 4px; right: 4px; }
}
@media (prefers-reduced-motion: reduce) { .oc-card { transition: none; } }
html[data-motion="reduce"] .oc-card { transition: none; }
`;

function el(doc, tag, attrs = {}, ...kids) {
  const e = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(typeof c === 'string' ? doc.createTextNode(c) : c);
  return e;
}

const args = (ref) => (typeof ref.args === 'function' ? ref.args() : ref.args || {});

/** The card's content for a reveal: [{tone, ref}] plus the title (pure; tests read it). */
export function outcomeCard(report, chronicleEntry, i18n) {
  const L = outcomeLines(chronicleEntry, report, i18n);
  const lines = [
    { id: 'sealed', tone: report.proof === 'ok' ? 'ok' : report.proof === 'fail' ? 'miss' : 'muted', ref: L.sealed },
    L.reading ? { id: 'reading', tone: 'plain', ref: L.reading } : null,
    L.slots ? { id: 'slots', tone: report.verdict.every(Boolean) ? 'ok' : 'miss', ref: L.slots } : null,
    L.stake && report.stake.result !== 'none' ? { id: 'stake', tone: report.stake.result === 'paid' ? 'ok' : report.stake.result === 'burned' ? 'miss' : 'muted', ref: L.stake } : null,
    L.learned ? { id: 'learned', tone: 'learn', ref: L.learned } : null,
    L.tutorial ? { id: 'tutorial', tone: 'tutorial', ref: L.tutorial } : null,
  ].filter(Boolean);
  // a reveal that touched a stake outranks a quiet one: automatic trials must not wipe it before it is read
  return { kind: 'outcome', title: L.title, lines, weight: report.stake && report.stake.result !== 'none' ? 2 : 1 };
}

/** The card's content after a forget. */
export function forgetCard(f) {
  const L = forgetLines(f);
  return { kind: 'forget', weight: 2, title: L.title, lines: [{ id: 'now', tone: 'plain', ref: L.now }, { id: 'gain', tone: 'ok', ref: L.gain }, L.shard ? { id: 'shard', tone: 'muted', ref: L.shard } : null].filter(Boolean) };
}

/**
 * @param {HTMLElement} host  the world HUD host (its .wh-root gives the layout for placement)
 * @param {{i18n: object, doc?: Document, ttl?: number, onDetails?: Function}} o
 */
export function createOutcomeToast(host, { i18n, doc = host.ownerDocument || document, ttl = 20000, onDetails = null } = {}) {
  if (!doc.getElementById('oc-style')) doc.head.append(el(doc, 'style', { id: 'oc-style', text: CSS }));
  const region = el(doc, 'div', { class: 'oc-region', role: 'status', 'aria-live': 'polite' });
  host.append(region);
  const t = (ref) => renderMsg(i18n, ref.key, args(ref));
  let current = null, node = null, timer = 0;

  function draw() {
    if (!current) return;
    const c = current;
    const fresh = el(doc, 'section', { class: 'oc-card', 'data-kind': c.kind, 'aria-label': t(c.title) },
      el(doc, 'p', { class: 'oc-eyebrow', text: i18n.t('wh.outcome.eyebrow') }),
      el(doc, 'h3', { class: 'oc-title', text: t(c.title) }),
      el(doc, 'ul', { class: 'oc-lines' }, c.lines.map((l) => el(doc, 'li', { 'data-line': l.id, 'data-tone': l.tone, text: t(l.ref) }))),
      c.kind === 'outcome' && onDetails ? el(doc, 'div', { class: 'oc-row' }, el(doc, 'button', { type: 'button', 'data-oc': 'details', onclick: () => { close(); onDetails(); } }, i18n.t('wh.outcome.details'))) : null,
      el(doc, 'button', { type: 'button', class: 'oc-close', 'data-oc': 'close', 'aria-label': i18n.t('wh.outcome.close'), onclick: () => close() }, '×'));
    const hold = () => clearTimeout(timer);
    const release = () => { clearTimeout(timer); timer = setTimeout(close, 4000); };
    fresh.addEventListener('pointerenter', hold); fresh.addEventListener('focusin', hold);
    fresh.addEventListener('pointerleave', release); fresh.addEventListener('focusout', release);
    // keep the world from reading a tap on the card as a walk order (ui/input.js listens on the page)
    for (const type of ['pointerdown', 'pointerup', 'click']) fresh.addEventListener(type, (e) => e.stopPropagation());
    if (node) node.replaceWith(fresh); else region.append(fresh);
    node = fresh;
    place(fresh);
  }

  /** Under the quest banner and the hub's status pill, clear of the trial card and the Signs panel (desktop); under the top bar (phone). */
  function place(card) {
    const root = doc.querySelector('.wh-root[data-layout]') || doc.querySelector('.wh-root');
    if (!root) return;
    const vw = doc.documentElement.clientWidth;
    const box = (sel, scope = root) => { const e = scope.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left < vw && r.right > 0 ? r : null; };
    let top, left = 16, right = vw - 16;
    if (root.dataset.layout === 'mobile') {
      // under the top bar and, on the island, under the hub's Shell dock (which sits over the HUD on phones)
      const bar = box('.wh-topbar'), dock = box('.hub-dock', doc);
      top = Math.max(bar ? bar.bottom + 8 : 0, dock ? dock.bottom + 8 : 0) || null;
    } else {
      const quest = box('.wh-quest'), trial = box('.wh-trial'), signs = box('.wh-signs');
      top = (quest ? quest.bottom : 8) + 58; // leaves room for the hub's status pill under the banner
      if (quest) { left = Math.max(left, quest.left); right = Math.min(right, quest.right); }
      if (trial && trial.right + 12 > left && trial.bottom > top) left = trial.right + 12;
      if (signs && signs.left - 12 < right) right = Math.max(left + 300, signs.left - 12);
    }
    const width = Math.min(440, Math.max(260, right - left));
    if (top != null) card.style.top = Math.round(top) + 'px';
    card.style.width = Math.round(width) + 'px';
    card.style.left = Math.round(left + (right - left - width) / 2) + 'px';
    card.style.transform = 'none';
  }

  function show(card) {
    if (current && (card.weight || 1) < (current.weight || 1)) return false;
    current = card;
    clearTimeout(timer);
    draw();
    timer = setTimeout(close, ttl);
    return true;
  }
  function close() {
    clearTimeout(timer);
    if (!node) { current = null; return; }
    const gone = node;
    node = null; current = null;
    gone.classList.add('oc-out');
    setTimeout(() => gone.remove(), 260);
  }
  const unsub = i18n.subscribe ? i18n.subscribe(() => draw()) : null;

  return {
    /** A reveal's report (play/outcome.js) and its chronicle entry. */
    showOutcome(report, entry) { return show(outcomeCard(report, entry, i18n)); },
    /** A forget follow-up (play/outcome.js forgetFollowup). */
    showForget(f) { return show(forgetCard(f)); },
    close,
    get current() { return current; },
    get el() { return node; },
    destroy() { close(); if (unsub) unsub(); region.remove(); },
  };
}
