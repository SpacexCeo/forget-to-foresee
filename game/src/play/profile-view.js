// The Profile tab of the game menu, to the owner's reference (docs/art/ui/profile-owner-ref.jpg, night plan 12.11
// "Profile look"): dark green-black panels with thin borders and soft corners, a serif display face for the name and
// the numbers, small gold small-caps labels, the heroine's portrait in a teal rim light, level + title + XP bar, the
// town silk card, three agent tiles, the town-silk chart, the stats grid and Open trades / Trade log tabs. Real data
// only (the town ledger, src/game/town-economy.js); every block has an honest empty state.

export const PROFILE_CSS = `
.gm-pv { --pv-bg: #0f1615; --pv-panel: #131c1b; --pv-line: rgba(214, 226, 214, .12); --pv-text: #e9e6dc; --pv-muted: rgba(233, 230, 220, .62);
  --pv-gold: #d9b26a; --pv-teal: #2fc4b2; --pv-serif: "Cormorant Garamond", Georgia, "Times New Roman", serif;
  display: grid; gap: 14px; color: var(--pv-text); font: 14px/1.45 system-ui, sans-serif; }
.gm-pv h3, .gm-pv h4 { margin: 0; }
.pv-label { font: 600 11px/1.3 system-ui, sans-serif; letter-spacing: .16em; text-transform: uppercase; color: var(--pv-gold); }
.pv-muted { color: var(--pv-muted); }
.pv-panel { background: var(--pv-panel); border: 1px solid var(--pv-line); border-radius: 16px; padding: 18px 20px; }
.pv-hero { display: grid; grid-template-columns: 120px 1fr; gap: 20px; align-items: end; }
.pv-portrait { height: 190px; display: grid; place-items: end center; border-bottom: 1px solid var(--pv-line); overflow: hidden; }
.pv-portrait img { height: 184px; width: auto; object-fit: contain; filter: drop-shadow(0 0 14px rgba(47, 196, 178, .35)); }
.pv-portrait img.pv-card { height: 184px; border-radius: 10px; }
.pv-portrait img.pv-ring { outline: 2px solid var(--pv-teal); outline-offset: 3px; border-radius: 10px; }
.pv-level { font: 500 12px/1.3 system-ui; letter-spacing: .14em; text-transform: uppercase; color: var(--pv-muted); margin-top: 6px; }
.pv-title { font: 600 34px/1.1 var(--pv-serif); margin: 4px 0 14px; }
.pv-name { font: 500 15px/1.3 system-ui; color: var(--pv-muted); }
.pv-xp { display: flex; justify-content: space-between; font-size: 13px; color: var(--pv-muted); }
.pv-bar { height: 4px; border-radius: 2px; background: rgba(233, 230, 220, .12); margin: 8px 0 12px; overflow: hidden; }
.pv-bar > i { display: block; height: 100%; width: calc(var(--p, 0) * 100%); background: linear-gradient(90deg, var(--pv-teal), var(--pv-gold)); border-radius: 2px; }
.pv-silk { display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; align-items: start; background: linear-gradient(120deg, #2a2716, #1a211b 55%, #151d1b); border-color: rgba(217, 178, 106, .4); }
.pv-silk .pv-num { font: 600 38px/1 var(--pv-serif); letter-spacing: .02em; }
.pv-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--pv-teal); margin-right: 7px; vertical-align: middle; }
.pv-tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.pv-tile { padding: 14px 16px; }
.pv-tile .pv-head { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--pv-muted); }
.pv-tile .pv-head svg { flex: 0 0 auto; color: var(--pv-gold); }
.pv-tile .pv-num { font: 600 28px/1.1 var(--pv-serif); margin: 8px 0 2px; }
.pv-chart-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.pv-chart-head h3 { font: 500 24px/1.2 var(--pv-serif); }
.pv-badge { padding: 4px 9px; border-radius: 6px; background: rgba(233, 230, 220, .08); font: 600 11px/1.3 system-ui; letter-spacing: .08em; text-transform: uppercase; color: var(--pv-muted); }
.pv-chart { position: relative; height: 150px; margin: 14px 0 10px; background: repeating-linear-gradient(to bottom, transparent 0 44px, var(--pv-line) 44px 45px); }
.pv-chart svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.pv-empty { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; gap: 4px; }
.pv-empty b { font-weight: 500; font-size: 15px; } .pv-empty span { color: var(--pv-muted); font-size: 13px; }
.pv-empty-box { display: grid; place-content: center; text-align: center; gap: 4px; padding: 26px 8px 12px; }
.pv-empty-box b { font-weight: 500; font-size: 15px; } .pv-empty-box span { color: var(--pv-muted); font-size: 13px; }
.pv-caption { display: flex; justify-content: space-between; font-size: 12px; color: var(--pv-muted); padding: 10px 0; border-top: 1px solid var(--pv-line); }
.pv-stats { display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; }
.pv-stats > div { display: flex; justify-content: space-between; gap: 10px; padding: 10px 0; border-top: 1px solid var(--pv-line); font-size: 13px; }
.pv-stats > div b { font-weight: 600; font-variant-numeric: tabular-nums; }
.pv-tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--pv-line); }
.pv-tabs button { background: none; border: 0; padding: 0 0 10px; color: var(--pv-muted); font: 500 15px/1.2 system-ui; cursor: pointer; border-bottom: 2px solid transparent; min-height: 36px; }
.pv-tabs button[aria-selected="true"] { color: var(--pv-gold); border-bottom-color: var(--pv-gold); }
.pv-tabs .pv-count { margin-left: 6px; padding: 1px 6px; border-radius: 5px; background: rgba(233, 230, 220, .1); font-size: 11px; color: var(--pv-muted); }
.pv-row { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 10px 0; border-bottom: 1px solid var(--pv-line); font-size: 13px; }
.pv-row b { font-weight: 600; } .pv-pos { color: #7fd18b; } .pv-neg { color: #ff8a7a; }
.pv-foot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 12px; color: var(--pv-muted); }
.pv-chip { padding: 3px 9px; border-radius: 10px; border: 1px solid rgba(47, 196, 178, .45); color: var(--pv-teal); font: 600 11px/1.5 system-ui; }
.pv-ghost { min-height: 40px; padding: 8px 16px; border-radius: 10px; border: 1px solid var(--pv-line); background: transparent; color: var(--pv-text); font: 600 13px/1 system-ui; cursor: pointer; }
@media (max-width: 640px) {
  .pv-hero { grid-template-columns: 88px 1fr; gap: 14px; } .pv-portrait { height: 150px; } .pv-portrait img { height: 146px; }
  .pv-title { font-size: 28px; } .pv-silk .pv-num { font-size: 30px; }
  .pv-tiles { grid-template-columns: 1fr; } .pv-stats { grid-template-columns: 1fr; } .pv-panel { padding: 14px 14px; }
}
`;

const ICON = {
  trend: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3 17l6-6 4 4 7-7M15 8h5v5"/></svg>',
  people: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c.6-3.3 3-5 6-5s5.4 1.7 6 5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 15c1.7.6 2.7 2.2 3 5"/></svg>',
  cycle: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 9h13l-3-3M20 15H7l3 3"/></svg>',
};

const money = (cents) => (cents / 100).toFixed(2);
const signed = (cents) => (cents >= 0 ? '+' : '') + money(cents);

/**
 * What the Profile shows, from the ledger alone (pure; node-tested).
 * @param {object} ledger the town ledger @returns {object}
 */
export function profileModel(ledger) {
  const lv = ledger.level, st = ledger.stats;
  const known = ledger.agentsKnown ? ledger.agentsKnown() : [];
  let best = null;
  for (const npc of known) {
    const recs = ledger.results ? ledger.results(npc) : [];
    const net = recs.reduce((s, r) => s + (r.net || 0), 0);
    if (recs.length && (!best || net > best.net)) best = { npc, net };
  }
  const equity = (ledger.equity || []).slice();
  const open = ledger.hires ? ledger.hires() : [];
  return {
    level: lv.level, title: lv.title, into: lv.into, need: lv.need, progress: lv.need ? Math.min(1, lv.into / lv.need) : 0,
    silk: ledger.silk,
    net: st.net || 0, hired: st.agentsHired || 0, working: open.length, rounds: st.rounds || 0, wins: st.wins || 0,
    signsRead: st.signsRead || 0, trialsVerified: st.trialsVerified || 0, memoriesForgotten: st.memoriesForgotten || 0,
    best,
    equity, hasHistory: equity.length > 1,
    open, log: ledger.log ? ledger.log() : [],
  };
}

const svgEl = (doc, tag) => (doc.createElementNS ? doc.createElementNS('http://www.w3.org/2000/svg', tag) : doc.createElement(tag));

/** The town silk line: an area under a gold line, scaled to the panel. */
function chart(doc, values) {
  const w = 600, h = 150;
  const svg = svgEl(doc, 'svg'); svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 8 - ((v - lo) / span) * (h - 16)]);
  const line = pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = svgEl(doc, 'polygon'); area.setAttribute('points', `0,${h} ${line} ${w},${h}`); area.setAttribute('fill', 'rgba(217,178,106,.12)');
  const pl = svgEl(doc, 'polyline'); pl.setAttribute('points', line); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', '#d9b26a'); pl.setAttribute('stroke-width', '2'); pl.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(area, pl);
  return svg;
}

/**
 * The Profile view's nodes.
 * @param {object} o
 * @param {Document} o.doc @param {Function} o.t @param {object} o.ledger @param {string} o.base
 * @param {string|null} [o.nickname] @param {boolean} [o.elise] the heroine shown is Elise
 * @param {object|null} [o.holder] holder perks (net/holder.js) @param {string[]} [o.titles] wheel titles won
 * @param {Function|null} [o.exportKey]
 */
export function renderProfileView({ doc, t, ledger, base, nickname = null, elise = false, holder = null, titles = [], exportKey = null }) {
  if (!(doc.getElementById && doc.getElementById('gm-pv-style'))) { const st = doc.createElement('style'); st.id = 'gm-pv-style'; st.textContent = PROFILE_CSS; doc.head.append(st); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const m = profileModel(ledger);
  const root = el('div', 'gm-pv');

  // hero: portrait, story label, level, title, XP
  const hero = el('section', 'pv-hero');
  const portrait = el('div', 'pv-portrait');
  const img = el('img'); img.alt = '';
  if (elise) { img.src = base + 'assets/cards/elise.webp'; img.className = 'pv-card'; } else img.src = base + 'assets/ui/loading_iris.webp';
  if (holder && holder.perks && holder.perks.includes('ring')) img.className = (img.className + ' pv-ring').trim();
  portrait.append(img);
  const info = el('div');
  info.append(el('div', 'pv-label', t('profile.story')), el('div', 'pv-level', t('profile.level', { level: m.level })),
    el('h3', 'pv-title', t('profile.title.' + m.title)));
  if (nickname) info.append(el('div', 'pv-name', nickname));
  const xp = el('div', 'pv-xp'); xp.append(el('span', null, t('profile.progressTo', { level: m.level + 1 })), el('span', null, t('profile.xpOf', { into: m.into, need: m.need })));
  const bar = el('div', 'pv-bar'); const fill = el('i'); bar.style.setProperty('--p', String(m.progress)); bar.append(fill);
  bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(m.need)); bar.setAttribute('aria-valuenow', String(m.into));
  info.append(xp, bar, el('p', 'pv-muted', t('profile.titlesNote')));
  if (holder && holder.title) info.append(el('span', 'pv-chip', t('holder.title.' + holder.title)));
  if (titles.length) info.append(el('p', 'pv-muted', t('menu.titles', { list: titles.map((x) => t('wheel.title.' + x)).join(', ') })));
  hero.append(portrait, info);

  // town silk
  const silk = el('section', 'pv-panel pv-silk');
  const sl = el('div'); const stored = el('p', 'pv-muted'); stored.append(el('span', 'pv-dot'), doc.createTextNode(t('profile.silk.stored')));
  sl.append(el('div', 'pv-label', t('inv.townSilk')), stored, el('p', 'pv-muted', t('profile.silk.note')));
  silk.append(sl, el('div', 'pv-num', money(m.silk)));

  // three agent tiles
  const tiles = el('section', 'pv-tiles');
  const tile = (icon, label, num, sub) => {
    const c = el('div', 'pv-panel pv-tile'); const h = el('div', 'pv-head'); const ic = el('span'); ic.innerHTML = icon; h.append(ic, el('span', null, label));
    c.append(h, el('div', 'pv-num', num), el('div', 'pv-muted', sub)); return c;
  };
  tiles.append(
    tile(ICON.trend, t('profile.stat.net'), signed(m.net), t('profile.tile.netSub')),
    tile(ICON.people, t('profile.stat.agentsHired'), String(m.hired), m.hired ? t('profile.tile.working', { n: m.working }) : t('profile.tile.hiredNone')),
    tile(ICON.cycle, t('profile.stat.rounds'), String(m.rounds), t('profile.tile.wins', { wins: m.rounds ? String(m.wins) : '—' })));

  // chart + stats
  const panel = el('section', 'pv-panel');
  const ch = el('div', 'pv-chart-head'); ch.append(el('h3', null, t('profile.equity')), el('span', 'pv-badge', m.hasHistory ? t('profile.chart.points', { n: m.equity.length }) : t('profile.chart.none')));
  const box = el('div', 'pv-chart');
  if (m.hasHistory) box.append(chart(doc, m.equity));
  else { const e = el('div', 'pv-empty'); e.append(el('b', null, t('profile.chart.empty')), el('span', null, t('profile.chart.emptySub'))); box.append(e); }
  const cap = el('div', 'pv-caption'); cap.append(el('span', null, t('profile.chart.caption')), el('span', null, m.rounds ? t('profile.chart.rounds', { n: m.rounds }) : t('profile.chart.noRounds')));
  const stats = el('div', 'pv-stats');
  const stat = (label, v) => { const d = el('div'); d.append(el('span', 'pv-muted', label), el('b', null, v)); return d; };
  stats.append(stat(t('profile.stat.signsRead'), String(m.signsRead)), stat(t('profile.stat.trialsVerified'), String(m.trialsVerified)),
    stat(t('profile.stat.memoriesForgotten'), String(m.memoriesForgotten)), stat(t('profile.stat.bestAgent'), m.best ? `${t('folk.name.' + m.best.npc)} · ${signed(m.best.net)}` : '—'));
  panel.append(ch, box, cap, stats);

  // open trades / trade log
  const trades = el('section', 'pv-panel');
  const tabs = el('div', 'pv-tabs'); tabs.setAttribute('role', 'tablist');
  const list = el('div'); list.setAttribute('role', 'tabpanel');
  const tabBtn = (id, label, count) => { const b = el('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.pvTab = id; b.append(doc.createTextNode(label)); if (count != null) b.append(el('span', 'pv-count', String(count))); b.addEventListener('click', () => showTrades(id)); return b; };
  const bOpen = tabBtn('open', t('profile.trades.open'), m.open.length), bLog = tabBtn('log', t('profile.trades.log'), null);
  tabs.append(bOpen, bLog);
  const empty = (a, b) => { const e = el('div', 'pv-empty-box'); e.append(el('b', null, a), el('span', null, b)); return e; };
  function showTrades(id) {
    bOpen.setAttribute('aria-selected', String(id === 'open')); bLog.setAttribute('aria-selected', String(id === 'log'));
    const rows = [];
    if (id === 'open') {
      for (const h of m.open) {
        const r = el('div', 'pv-row'); const u = h.unrealised || 0;
        r.append(el('b', null, t('folk.name.' + h.npc)), el('span', u >= 0 ? 'pv-pos' : 'pv-neg', signed(u)),
          el('span', 'pv-muted', t('profile.trades.progress', { done: h.done, total: h.rounds })), el('span'));
        rows.push(r);
      }
      list.replaceChildren(...(rows.length ? rows : [empty(t('profile.trades.openEmpty'), t('profile.trades.openEmptySub'))]));
    } else {
      for (const l of m.log.slice(0, 30)) {
        const r = el('div', 'pv-row');
        r.append(el('b', null, `${t('folk.name.' + l.npc)} · ${t('log.side.' + l.side)}`), el('span', l.result >= 0 ? 'pv-pos' : 'pv-neg', signed(l.result)),
          el('span', 'pv-muted', `${new Date(l.at).toLocaleTimeString()} · ${t('exch.echo.' + l.echo)} · ${money(l.entry)} → ${money(l.exit)}`), el('span'));
        rows.push(r);
      }
      list.replaceChildren(...(rows.length ? rows : [empty(t('profile.trades.logEmpty'), t('profile.trades.logEmptySub'))]));
    }
  }
  trades.append(tabs, list);
  showTrades('open');

  const foot = el('div', 'pv-foot'); foot.append(el('span', null, t('menu.localProfile')));
  if (exportKey) {
    const kb = el('button', 'pv-ghost', t('profile.exportKey')); kb.type = 'button';
    kb.addEventListener('click', async () => { try { await navigator.clipboard.writeText(exportKey()); kb.textContent = t('profile.exportKey.done'); } catch { kb.textContent = t('profile.exportKey.failed'); } });
    foot.append(kb, el('span', null, t('profile.exportKey.note')));
  }
  root.append(hero, silk, tiles, panel, trades, foot);
  return [root];
}
