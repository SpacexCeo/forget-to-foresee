// "What waits for you" (sprint 1.3, cut to three rows by the design review 13.11): Quests (J), Trade (B) and the way
// home (the Gate-Loom fee from config), each with a thin gold line glyph, and one Start button. Shown after the wake-up
// dialogue and reopenable from the menu ("What's next").
const G = (d) => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ROWS = Object.freeze([
  { id: 'quests', key: 'J', glyph: G('<path d="M6 4h10a2 2 0 012 2v14H8a2 2 0 01-2-2z"/><path d="M9 8h6M9 12h6M9 16h4"/>') },
  { id: 'trade', key: 'B', glyph: G('<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>') },
  { id: 'home', key: null, glyph: G('<path d="M6 20V10a6 6 0 0112 0v10"/><path d="M4 20h16"/><path d="M12 8v8"/>') },
]);

const CSS = `
.npe-card-wrap { position: fixed; inset: 0; z-index: var(--z-dialogue, 50); display: grid; place-items: center; padding: 12px; background: rgba(0, 0, 0, .5); }
.npe-card li .ic { color: var(--ftf-gold, #c5a469); display: grid; place-items: center; }
.npe-card li kbd { margin-left: 6px; padding: 0 6px; border: 1px solid var(--ftf-line, rgba(197,164,105,.4)); border-radius: 4px; font: 700 12px ui-monospace, monospace; color: var(--ftf-text, #eef0ea); }
.npe-card { --uu: var(--u, calc(min(100vw, 100vh * 1.7778) / 1920)); width: min(100%, max(340px, calc(760 * var(--uu)))); max-height: calc(100vh - 24px); overflow: auto; box-sizing: border-box;
  padding: max(16px, calc(28 * var(--uu))); background: var(--ftf-panel-solid, #101f1a); border: 1px solid var(--ftf-line, rgba(197,164,105,.4)); border-radius: var(--radius-modal, 14px); color: var(--ftf-text, #eef0ea); font: 15px/1.4 var(--font-ui, system-ui, sans-serif); }
.npe-card h2 { margin: 0 0 10px; font: 600 max(24px, calc(34 * var(--uu)))/1.15 var(--font-title, Georgia, serif); color: var(--ftf-gold-bright, #dcc08a); }
.npe-card ol { list-style: none; margin: 0; padding: 0; }
.npe-card li { display: grid; grid-template-columns: 40px 1fr; gap: 12px; align-items: center; min-height: max(56px, calc(72 * var(--uu))); border-top: 1px solid var(--ftf-line, rgba(197,164,105,.25)); }
.npe-card li .ic { font-size: 24px; text-align: center; }
.npe-card li b { display: block; color: var(--ftf-gold-bright, #dcc08a); font-size: 16px; }
.npe-card li .txt { color: var(--ftf-text, #eef0ea); font-size: 15px; }
.npe-card .row { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; margin-top: 14px; }
.npe-card button { min-height: 44px; padding: 0 22px; border-radius: 10px; font: 700 15px system-ui, sans-serif; cursor: pointer; border: 1px solid var(--ftf-line, rgba(197,164,105,.4)); background: transparent; color: var(--ftf-text, #eef0ea); }
.npe-card button.primary { background: var(--ftf-gold, #c5a469); color: #14110a; border-color: var(--ftf-gold, #c5a469); }
.npe-card button:focus-visible { outline: 2px solid var(--ftf-gold-bright, #dcc08a); outline-offset: 2px; }
`;

/**
 * @param {{doc: Document, t: (k: string, a?: object) => string, vars: object}} o
 * @returns {{result: Promise<'start'|'later'>, close(): void}}
 */
export function openRoadmapCard({ doc, t, vars }) {
  if (!(doc.getElementById && doc.getElementById('npe-card-style'))) { const s = doc.createElement('style'); s.id = 'npe-card-style'; s.textContent = CSS; (doc.head || doc.body).append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const wrap = el('div', 'npe-card-wrap'); const card = el('div', 'npe-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
  const h = el('h2', null, t('card.title')); card.setAttribute('aria-label', h.textContent);
  const list = el('ol');
  for (const r of ROWS) {
    const li = el('li'); li.dataset.row = r.id;
    const ic = el('span', 'ic'); ic.innerHTML = r.glyph; ic.setAttribute('aria-hidden', 'true');
    const title = el('b', null, t(`card.${r.id}.title`)); if (r.key) title.append(el('kbd', null, r.key));
    const body = el('div'); body.append(title, el('span', 'txt', t(`card.${r.id}.text`, vars)));
    li.append(ic, body); list.append(li);
  }
  const row = el('div', 'row');
  const start = el('button', 'primary', t('card.start')); start.type = 'button';
  row.append(start);                                                                 // one button (Esc or a tap outside also close)
  card.append(h, list, row); wrap.append(card); doc.body.append(wrap);
  let resolve, ended = false; const result = new Promise((r) => { resolve = r; });
  const finish = (how) => { if (ended) return; ended = true; wrap.remove(); if (doc.removeEventListener) doc.removeEventListener('keydown', onKey, true); resolve(how === 'close' ? 'later' : how); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish('later'); } };
  start.addEventListener('click', () => finish('start'));
  wrap.addEventListener('click', (e) => { if (e.target === wrap) finish('later'); });   // a tap outside closes it
  if (doc.addEventListener) doc.addEventListener('keydown', onKey, true);
  try { start.focus(); } catch { /* */ }
  return { result, close: () => finish('close') };
}
