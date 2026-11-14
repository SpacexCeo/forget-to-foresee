// The Loom meter chip (flags loomMeter and presenceChip; ui/loom-meter-core.js does the numbers): "🔥 400 silk fed to the
// Loom today · 7 in the valley", a small pill in the town above the market ticker. A tap opens who fed the Gate-Loom last,
// each line linking to its receipt on the NEAR testnet explorer. When anyone pays the Gate (their own payment, a room
// act from another player, or a new receipt on the next poll) the chip glows and `onFed` flares the Loom in the world.
// The Loom's glow follows how fed it is today (`onHunger`). Plain DOM; polls only while shown and the tab is visible.
import { loomView, hunger, freshGates, chipParts, agoOf, shortName } from './loom-meter-core.js';

const CSS = `.ftf-loom { position: fixed; left: calc(12px + env(safe-area-inset-left, 0px)); bottom: calc(104px + env(safe-area-inset-bottom, 0px)); z-index: 11;
  max-width: min(360px, calc(100% - 24px)); font: 13px/1.35 var(--font-ui, system-ui, sans-serif); color: var(--ftf-text, #eef0ea); }
.ftf-loom[hidden], .ftf-loom .box[hidden] { display: none; }
.ftf-loom > button { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 5px 12px 5px 9px; border-radius: 16px; border: 1px solid var(--ftf-line, rgba(197,164,105,.4));
  background: var(--ftf-panel, rgba(14,20,18,.92)); color: inherit; font: inherit; cursor: pointer; transition: box-shadow .4s ease, border-color .4s ease; }
.ftf-loom svg { flex: none; width: 16px; height: 16px; color: #ffb45a; filter: drop-shadow(0 0 3px rgba(255,170,80,.6)); }
.ftf-loom .sep { color: var(--ftf-muted, #aab6b0); }
.ftf-loom .valley { color: var(--ftf-muted, #cfd8d2); }
.ftf-loom.fed > button { border-color: #ffc861; box-shadow: 0 0 0 2px rgba(255,200,97,.25), 0 0 18px rgba(255,170,80,.55); }
.ftf-loom.fed svg { animation: ftf-loom-flare 1.6s ease-out; }
@keyframes ftf-loom-flare { 0% { transform: scale(1); } 25% { transform: scale(1.45); color: #fff1c9; } 100% { transform: scale(1); } }
.ftf-loom .box { margin-top: 6px; padding: 8px 10px; border-radius: 12px; border: 1px solid var(--ftf-line, rgba(197,164,105,.4)); background: var(--ftf-panel-solid, #101f1a); }
.ftf-loom .lbl { margin: 0 0 6px; color: var(--ftf-muted, #aab6b0); font-size: 12px; }
.ftf-loom ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.ftf-loom a { color: var(--ftf-gold, #c5a469); text-underline-offset: 2px; }
@media (max-width: 640px) { .ftf-loom { bottom: calc(150px + env(safe-area-inset-bottom, 0px)); font-size: 12px; } .ftf-loom > button { min-height: 30px; padding: 4px 10px 4px 8px; } }
@media (prefers-reduced-motion: reduce) { .ftf-loom.fed svg { animation: none; } .ftf-loom > button { transition: none; } }`;
const FLAME = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8.4 1.2c.3 2.1-.8 3.2-1.8 4.3C5.5 6.7 4.5 7.9 4.5 9.9A3.6 3.6 0 0 0 8 13.6a3.6 3.6 0 0 0 3.5-3.7c0-1.3-.5-2.4-1.1-3.3-.1.9-.5 1.6-1.2 2 .3-2.6-.2-5.2-.8-7.4z"/></svg>';

/**
 * @param {{doc?: Document, t: Function, poll: () => Promise<object|null>, count?: () => number, acts?: () => object[],
 *   flags?: () => {loomMeter: boolean, presenceChip: boolean}, onFed?: (k: number) => void, onHunger?: (k: number) => void,
 *   pollMs?: number, timers?: object, win?: object, now?: () => number}} o
 */
export function createLoomMeter({ doc = globalThis.document, t, poll, count = () => 0, acts = () => [], flags = () => ({ loomMeter: true, presenceChip: true }),
  onFed = null, onHunger = null, pollMs = 30_000, timers = globalThis, win = globalThis.window, now = () => Date.now() }) {
  if (!(doc.getElementById && doc.getElementById('ftf-loom-css'))) { const s = doc.createElement('style'); s.id = 'ftf-loom-css'; s.textContent = CSS; doc.head.append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const root = el('div', 'ftf-loom'); root.hidden = true;
  const pill = el('button'); pill.type = 'button'; pill.setAttribute('aria-expanded', 'false');
  const icon = el('span'); icon.innerHTML = FLAME; icon.style.display = 'contents';
  const loomText = el('span', 'loom'), sep = el('span', 'sep', '·'), valley = el('span', 'valley');
  pill.append(icon, loomText, sep, valley);
  const box = el('div', 'box'); box.hidden = true;
  const lbl = el('p', 'lbl', t('loom.label')), list = el('ul');
  box.append(lbl, list); root.append(pill, box); doc.body.append(root);
  let shown = false, view = null, timer = null, glowTimer = null, lastCount = -1;
  const seenActs = new Set();
  pill.addEventListener('click', () => { box.hidden = !box.hidden; pill.setAttribute('aria-expanded', String(!box.hidden)); render(); });

  function fed(n = 1) {
    root.classList.remove('fed'); void root.offsetWidth; root.classList.add('fed');
    if (glowTimer) timers.clearTimeout(glowTimer);
    glowTimer = timers.setTimeout(() => root.classList.remove('fed'), 2400);
    if (onFed) { try { onFed(Math.min(1, 0.6 + 0.2 * n)); } catch { /* the world's problem */ } }
  }

  function render() {
    const f = flags(), c = count(), parts = chipParts(view, c, f);
    lastCount = c;
    root.hidden = !shown || (!parts.loom && !parts.valley);
    loomText.hidden = !parts.loom; loomText.textContent = parts.loom ? t(parts.loom.key, parts.loom.args) : '';
    valley.hidden = !parts.valley; valley.textContent = parts.valley ? t(parts.valley.key, parts.valley.args) : '';
    sep.hidden = !(parts.loom && parts.valley);
    pill.setAttribute('aria-label', [loomText.textContent, valley.textContent].filter(Boolean).join(', '));
    pill.disabled = !parts.loom; // the list is the Loom's: nothing to open with the valley count alone
    if (box.hidden) return;
    const rows = view ? view.recent : [];
    list.replaceChildren(...(rows.length ? rows.map((r) => {
      const li = el('li'), a = agoOf(r.at, now());
      li.append(doc.createTextNode(t('loom.fed', { name: shortName(r.account) }) + ' · ' + t(a.key, a.args) + ' · '));
      const link = el('a', '', t('loom.receipt')); link.href = r.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; li.append(link);
      return li;
    }) : [el('li', '', t(view && view.today ? 'loom.none' : 'loom.noLog'))]));
  }

  async function refresh() {
    let next = null; try { next = loomView(await poll()); } catch { next = null; }
    if (next) {
      const n = freshGates(view, next); view = next;
      if (onHunger) { try { onHunger(hunger(view)); } catch { /* */ } }
      if (n > 0) fed(n);
    }
    render();
  }

  // someone else in the room paid the Gate (presence act 'gate'): flare now and read the new numbers
  function watchActs() {
    let any = false;
    for (const m of acts() || []) {
      if (!m || !m.act || m.k !== 'gate' || m.old) continue;
      const id = m.name + '|' + m.at; if (seenActs.has(id)) continue; seenActs.add(id);
      if (!m.mine) any = true;
    }
    if (any) { fed(1); refresh().catch(() => {}); }
  }
  const onOwn = () => { fed(1); timers.setTimeout(() => refresh().catch(() => {}), 4000); }; // our own payment: the log has it a moment later
  if (win && win.addEventListener) win.addEventListener('ftf:gate-paid', onOwn);
  for (const m of acts() || []) if (m && m.act && m.k === 'gate') seenActs.add(m.name + '|' + m.at); // what was there before we looked never flares

  const visible = () => !doc.visibilityState || doc.visibilityState === 'visible';
  const tick = () => { timer = timers.setTimeout(async () => { if (shown && visible()) await refresh(); if (shown) tick(); }, pollMs); };

  return {
    el: root,
    refresh,
    /** Per second or so from the game loop: the valley count and the room's acts (cheap: no network). */
    update() { if (!shown) return; watchActs(); if (count() !== lastCount) render(); },
    show(on) {
      if (!!on === shown) return;
      shown = !!on;
      if (shown) { refresh().catch(() => {}); tick(); } else { if (timer) timers.clearTimeout(timer); timer = null; root.hidden = true; }
    },
    get view() { return view; },
    destroy() { if (timer) timers.clearTimeout(timer); if (glowTimer) timers.clearTimeout(glowTimer); if (win && win.removeEventListener) win.removeEventListener('ftf:gate-paid', onOwn); root.remove(); },
  };
}
