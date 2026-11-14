// The "back from the Tournament" card (owner 14.11): shown once in town after Return to town, with what the season
// actually granted (play/season-loot.js). A short celebratory card with icons; Continue (or Esc, Enter, a click
// outside) and the town resumes. It is an open <dialog>, so the game's keys and the mouse aim wait while it shows. Desktop and phone; the rows rise in one after another unless motion is reduced.
import { LOOT_ICONS, silkText } from './season-loot.js';

const CSS = `
.sl-wrap { position: fixed; inset: 0; z-index: calc(var(--z-modal, 40) + 3); display: grid; place-items: center; padding: 16px; box-sizing: border-box;
  width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; border: 0; color: inherit;
  background: radial-gradient(ellipse at 50% 45%, rgba(20, 16, 8, .25), rgba(3, 6, 6, .7)), var(--sl-bg, none) center / cover no-repeat, #0b0f0e; animation: sl-fade .35s ease both; }
.sl-card { position: relative; width: min(420px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; box-sizing: border-box; padding: 22px 22px 18px;
  border: 1px solid rgba(220, 192, 138, .55); border-radius: 14px; background: linear-gradient(180deg, #17221e, #0e1614 70%);
  box-shadow: 0 18px 50px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 240, 200, .08); color: #ecebe4; font: 15px/1.45 var(--font-ui, system-ui, sans-serif);
  animation: sl-rise .45s cubic-bezier(.2, .9, .3, 1.2) both; }
.sl-card::before { content: ""; position: absolute; left: 50%; top: -34px; width: 68px; height: 68px; margin-left: -34px; border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 226, 150, .9), rgba(220, 170, 70, .25) 55%, transparent 72%); filter: blur(1px); pointer-events: none; }
.sl-kicker { margin: 0; text-align: center; font: 600 12px/1.2 var(--font-ui, system-ui, sans-serif); letter-spacing: .14em; text-transform: uppercase; color: #dcc08a; }
.sl-title { margin: 6px 0 2px; text-align: center; font: 600 22px/1.25 "Libre Caslon Text", Georgia, serif; color: #fff6dc; }
.sl-outcome { margin: 0 0 14px; text-align: center; color: rgba(236, 235, 228, .72); font-size: 14px; }
.sl-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.sl-row { display: grid; grid-template-columns: 40px 1fr; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 10px;
  background: rgba(255, 255, 255, .04); border: 1px solid rgba(220, 192, 138, .16); animation: sl-rise .4s ease both; }
.sl-row[data-kind="level"], .sl-row[data-kind="title"], .sl-row[data-kind="shard"] { border-color: rgba(220, 192, 138, .5); background: rgba(220, 192, 138, .09); }
.sl-row[data-tier="rare"] { border-color: rgba(120, 190, 220, .45); } .sl-row[data-tier="legendary"] { border-color: rgba(240, 200, 255, .55); }
.sl-ic { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: rgba(0, 0, 0, .35); }
.sl-ic img { width: 28px; height: 28px; object-fit: contain; }
.sl-txt { min-width: 0; overflow-wrap: anywhere; } .sl-txt b { color: #fff6dc; font-weight: 700; } .sl-txt a { color: #dcc08a; }
.sl-empty { margin: 0; text-align: center; color: rgba(236, 235, 228, .8); }
.sl-hint { margin: 12px 0 0; text-align: center; font-size: 13px; color: rgba(236, 235, 228, .6); }
.sl-go { display: block; width: 100%; min-height: 44px; margin-top: 16px; border: 1px solid #fbe6a6; border-radius: 10px; background: linear-gradient(180deg, #e2b553, #b88a2c);
  color: #1d1708; font: 700 15px var(--font-ui, system-ui, sans-serif); cursor: pointer; }
.sl-go:hover { filter: brightness(1.08); } .sl-go:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
@keyframes sl-fade { from { opacity: 0; } } @keyframes sl-rise { from { opacity: 0; transform: translateY(12px) scale(.98); } }
@media (prefers-reduced-motion: reduce) { .sl-wrap, .sl-card, .sl-row { animation: none; } }
.sl-wrap.sl-still, .sl-wrap.sl-still .sl-card, .sl-wrap.sl-still .sl-row { animation: none; }
@media (max-width: 480px) { .sl-card { padding: 18px 14px 14px; } .sl-title { font-size: 19px; } .sl-row { grid-template-columns: 34px 1fr; gap: 10px; } .sl-ic { width: 34px; height: 34px; } .sl-ic img { width: 24px; height: 24px; } }
`;

/** The text of one row (play/locales loot.row.*). */
export function lootRowText(row, t) {
  switch (row.kind) {
    case 'level': return t('loot.row.level', { n: row.level });
    case 'title': return t('loot.row.title', { title: t('profile.title.' + row.title) });
    case 'shard': return t('loot.row.shard', { token: row.tokenId });
    case 'chest': return t('loot.row.chest', { n: row.n, chest: t('chest.tier.' + row.tier) });
    case 'silk': return t('loot.row.silk', { n: silkText(row.n) });
    default: return t('loot.row.' + row.kind, { n: row.n });
  }
}

/**
 * Opens the card. Returns {close, root}; `onClose` runs once when it goes.
 * @param {{rows: Array, outcome?: string|null, t: Function, base?: string, reduced?: boolean, onClose?: Function, doc?: Document}} o
 */
export function openSeasonLoot({ rows, outcome = null, t, base = '/', reduced = false, onClose = null, doc = globalThis.document }) {
  if (!doc.getElementById('sl-css')) { const st = doc.createElement('style'); st.id = 'sl-css'; st.textContent = CSS; doc.head.append(st); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  // an open <dialog> (not modal: the page keeps its own layers): the world's keys and the mouse aim stand down while it shows
  const wrap = el('dialog', 'sl-wrap' + (reduced ? ' sl-still' : '')); wrap.setAttribute('open', ''); wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'sl-title');
  // the homecoming scene behind the card (owner's GPT art: the town gate at dusk, the trophies by the doors)
  wrap.style.setProperty('--sl-bg', `url("${base}assets/ui/season/season_return_bg_${(globalThis.innerWidth || 1280) > 900 ? 1600 : 800}.webp")`);
  const card = el('div', 'sl-card'); wrap.append(card);
  const title = el('h2', 'sl-title', t('loot.title')); title.id = 'sl-title';
  card.append(el('p', 'sl-kicker', t('loot.kicker')), title);
  if (outcome) card.append(el('p', 'sl-outcome', t('goal.season_over', { outcome })));
  if (rows.length) {
    const list = el('ul', 'sl-list');
    rows.forEach((row, i) => {
      const li = el('li', 'sl-row'); li.dataset.kind = row.kind; if (row.tier) li.dataset.tier = row.tier; li.style.animationDelay = (0.12 + i * 0.08).toFixed(2) + 's';
      const ic = el('span', 'sl-ic'), img = el('img'); img.alt = ''; img.decoding = 'async';
      const name = LOOT_ICONS[row.kind] || 'hud/bag';
      img.src = base + 'assets/ui/icons/' + (name === 'silk' ? 'silk_coin_48.webp' : name + '_48.webp');
      ic.append(img);
      const txt = el('span', 'sl-txt');
      if (row.kind === 'shard' && row.href) { const a = el('a', null, lootRowText(row, t)); a.href = row.href; a.target = '_blank'; a.rel = 'noopener'; txt.append(a); }
      else txt.append(el('b', null, lootRowText(row, t)));
      li.append(ic, txt); list.append(li);
    });
    card.append(list);
    if (rows.some((r) => r.kind === 'chest')) card.append(el('p', 'sl-hint', t('loot.hint.chests')));
  } else card.append(el('p', 'sl-empty', t('loot.empty')));
  const go = el('button', 'sl-go', t('loot.continue')); go.type = 'button'; card.append(go);
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    doc.removeEventListener('keydown', onKey, true); wrap.remove();
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); close(); } else e.stopPropagation(); };
  go.addEventListener('click', close);
  wrap.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === wrap) close(); });
  doc.addEventListener('keydown', onKey, true);
  doc.body.append(wrap);
  try { go.focus({ preventScroll: true }); } catch { go.focus(); }
  return { root: wrap, close };
}
