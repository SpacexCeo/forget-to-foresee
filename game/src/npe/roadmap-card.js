// "What waits for you" (sprint 1.3): seven rows (quests, tournaments, chests, trade, leaderboard, NFT, Season 1 and the
// way home) with Start and Show me later. Shown after the wake-up dialogue and reopenable from the menu ("What's next").
export const ROWS = Object.freeze([
  { id: 'quests', icon: '📜' }, { id: 'tournaments', icon: '🏆' }, { id: 'chests', icon: '🎁' }, { id: 'trade', icon: '🪙' },
  { id: 'leaderboard', icon: '🐚' }, { id: 'nft', icon: '🏅' }, { id: 'home', icon: '🌀' },
]);

const CSS = `
.npe-card-wrap { position: fixed; inset: 0; z-index: 9985; display: grid; place-items: center; padding: 12px; background: rgba(0, 0, 0, .5); }
.npe-card { --uu: var(--u, calc(min(100vw, 100vh * 1.7778) / 1920)); width: min(100%, max(340px, calc(760 * var(--uu)))); max-height: calc(100vh - 24px); overflow: auto; box-sizing: border-box;
  padding: max(16px, calc(28 * var(--uu))); background: #0e1018; border: 1px solid #3a3f55; border-radius: 14px; color: #eef0f6; font: 15px/1.4 system-ui, sans-serif; }
.npe-card h2 { margin: 0 0 10px; font: 700 max(20px, calc(30 * var(--uu)))/1.2 Georgia, serif; color: #f6c860; }
.npe-card ol { list-style: none; margin: 0; padding: 0; }
.npe-card li { display: grid; grid-template-columns: 40px 1fr; gap: 12px; align-items: center; min-height: max(56px, calc(72 * var(--uu))); border-top: 1px solid rgba(255, 255, 255, .07); }
.npe-card li .ic { font-size: 24px; text-align: center; }
.npe-card li b { display: block; color: #f6c860; font-size: 16px; }
.npe-card li .txt { color: #eef0f6; font-size: 15px; }
.npe-card .row { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; margin-top: 14px; }
.npe-card button { min-height: 44px; padding: 0 22px; border-radius: 10px; font: 700 15px system-ui, sans-serif; cursor: pointer; border: 1px solid #3a3f55; background: transparent; color: #eef0f6; }
.npe-card button.primary { background: #f6c860; color: #1b1608; border-color: #f6c860; }
.npe-card button:focus-visible { outline: 2px solid #f6c860; outline-offset: 2px; }
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
    const ic = el('span', 'ic', r.icon); ic.setAttribute('aria-hidden', 'true');
    const body = el('div'); body.append(el('b', null, t(`card.${r.id}.title`)), el('span', 'txt', t(`card.${r.id}.text`, vars)));
    li.append(ic, body); list.append(li);
  }
  const row = el('div', 'row');
  const later = el('button', null, t('card.later')); later.type = 'button';
  const start = el('button', 'primary', t('card.start')); start.type = 'button';
  row.append(later, start); card.append(h, list, row); wrap.append(card); doc.body.append(wrap);
  let resolve, ended = false; const result = new Promise((r) => { resolve = r; });
  const finish = (how) => { if (ended) return; ended = true; wrap.remove(); if (doc.removeEventListener) doc.removeEventListener('keydown', onKey, true); resolve(how === 'close' ? 'later' : how); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish('later'); } };
  start.addEventListener('click', () => finish('start'));
  later.addEventListener('click', () => finish('later'));
  if (doc.addEventListener) doc.addEventListener('keydown', onKey, true);
  try { start.focus(); } catch { /* */ }
  return { result, close: () => finish('close') };
}
