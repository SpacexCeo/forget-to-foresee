// The Town Ledger (flag townLedger; docs/plans/track-fit-gaps.md): the town economy in one in-game window. Today's
// trades against the daily target, the latest trades with the trader's reason for the price and the testnet
// transaction, a card per trader with its own NEAR account, purse and stall, and the clans' trading strategy chosen on
// NEAR AI Cloud. Plain DOM, no play/scenes imports (a ui -> play static import is a boot cycle): the caller passes `t`
// and the poll function (net/town-ledger.js fetchLedger) and mounts the returned root wherever it likes (the game
// menu's Town tab). It polls only while its root is on the page.
import { reasonText, traderCard, progressOf, agoOf, shortHash, silkOf, unitSilk, accountUrl, TRADERS } from './town-ledger-data.js';
import { loadGoals, goalsView } from './town-goals.js';

const localStore = () => { try { return globalThis.localStorage || null; } catch { return null; } };

const REPO = 'https://github.com/SpacexCeo/forget-to-foresee/blob/main/';
const CSS = `.tl { display: grid; gap: 12px; color: var(--ftf-text, #eef0ea); font: 14px/1.45 var(--font-ui, system-ui, sans-serif); }
.tl a { color: inherit; text-decoration: underline; text-decoration-color: rgba(197,164,105,.55); text-underline-offset: 2px; }
.tl a:hover { color: var(--ftf-gold, #c5a469); }
.tl-top { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; align-items: end; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(197,164,105,.35); background: rgba(197,164,105,.06); }
.tl-big { font: 600 34px/1 Georgia, 'Times New Roman', serif; font-variant-numeric: tabular-nums; color: var(--ftf-gold, #c5a469); }
.tl-big small { display: block; margin-top: 4px; font: 500 12px/1.2 var(--font-ui, system-ui, sans-serif); letter-spacing: .06em; text-transform: uppercase; color: rgba(233,230,220,.7); }
.tl-bar { height: 6px; border-radius: 3px; background: rgba(214,226,214,.12); overflow: hidden; }
.tl-bar > i { display: block; height: 100%; background: linear-gradient(90deg, #9c7e46, var(--ftf-gold, #c5a469)); }
.tl-meta { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12.5px; color: rgba(233,230,220,.72); }
.tl-dot { display: inline-block; width: 7px; height: 7px; margin-right: 5px; border-radius: 50%; background: #7fd29a; box-shadow: 0 0 6px #7fd29a; vertical-align: 1px; }
.tl-dot.off { background: #8a8577; box-shadow: none; }
.tl-cols { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 12px; align-items: start; }
@media (max-width: 760px) { .tl-cols { grid-template-columns: minmax(0, 1fr); } .tl-big { font-size: 28px; } }
.tl h3 { margin: 0 0 6px; font: 600 12px/1.3 var(--font-ui, system-ui, sans-serif); letter-spacing: .1em; text-transform: uppercase; color: var(--ftf-gold, #c5a469); }
.tl-note { margin: 0; font-size: 12.5px; color: rgba(233,230,220,.66); }
.tl-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.tl-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; padding: 7px 8px; border-radius: 8px; border-bottom: 1px solid rgba(214,226,214,.07); }
.tl-row.new { animation: tl-in .6s ease-out; }
@keyframes tl-in { from { background: rgba(197,164,105,.18); } }
.tl-row .why { grid-column: 1 / -1; font-size: 12.5px; color: rgba(233,230,220,.68); }
.tl-row .why b { font-weight: 600; color: rgba(233,230,220,.86); }
.tl-row .tx { font: 12px/1.4 ui-monospace, Consolas, monospace; white-space: nowrap; align-self: start; }
.tl-row .ago { color: rgba(233,230,220,.5); font-size: 12px; margin-right: 6px; font-variant-numeric: tabular-nums; }
.tl-name { padding: 0; border: 0; background: none; color: var(--ftf-gold, #c5a469); font: inherit; cursor: pointer; text-decoration: underline dotted rgba(197,164,105,.6); text-underline-offset: 3px; }
.tl-name:hover, .tl-name:focus-visible { color: #e8c98a; outline: none; text-decoration-style: solid; }
.tl-box { padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(214,226,214,.12); background: rgba(10,16,14,.35); }
.tl-ai { display: grid; gap: 8px; }
.tl-clan { padding: 6px 0; border-top: 1px solid rgba(214,226,214,.08); }
.tl-clan:first-of-type { border-top: 0; }
.tl-clan p { margin: 2px 0 0; font-size: 12.5px; color: rgba(233,230,220,.72); }
.tl-clan q { color: rgba(233,230,220,.92); font-style: italic; }
.tl-ok { color: #7fd29a; font-size: 12px; }
.tl-links { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.tl-card { display: grid; gap: 10px; }
.tl-card h4 { margin: 0; font: 600 20px/1.2 Georgia, 'Times New Roman', serif; }
.tl-card h4::first-letter { text-transform: uppercase; }
.tl-acct { font: 13px/1.4 ui-monospace, Consolas, monospace; word-break: break-all; }
.tl-back { justify-self: start; min-height: 36px; padding: 6px 14px; border-radius: 8px; border: 1px solid rgba(197,164,105,.5); background: transparent; color: inherit; font: inherit; cursor: pointer; }
.tl-goods { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px; }
.tl-good { padding: 6px 8px; border-radius: 8px; background: rgba(214,226,214,.05); font-size: 13px; }
.tl-good small { display: block; color: rgba(233,230,220,.62); }
.tl-goals { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.tl-goal { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 99px; font-size: 12px; border: 1px solid rgba(197,164,105,.35); color: rgba(233,230,220,.8); }
.tl-goal::before { content: ''; width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid rgba(197,164,105,.8); box-sizing: border-box; }
.tl-goal.done { color: #e6d6a8; border-color: rgba(127,210,154,.55); background: rgba(127,210,154,.08); }
.tl-goal.done::before { background: #7fd29a; border-color: #7fd29a; }
.tl-go { min-height: 36px; padding: 6px 14px; border-radius: 8px; border: 1px solid #8c6a2a; background: var(--ftf-gold, #c5a469); color: #1b1406; font: 700 13px var(--font-ui, system-ui, sans-serif); cursor: pointer; }
.tl-go:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .tl-row.new { animation: none; } }`;

/**
 * @param {{doc?: Document, t: Function, poll: () => Promise<object|null>, now?: () => number, pollMs?: number, timers?: object, base?: string, focus?: string|null}} o
 * @returns {{root: HTMLElement, refresh(): Promise<void>, openTrader(key: string): void, destroy(): void, state(): object}}
 */
export function mountTownLedger({ doc = globalThis.document, t, poll, now = () => Date.now(), pollMs = 20_000, timers = globalThis, base = '/', focus = null, storage = localStore(), win = globalThis }) {
  if (!(doc.getElementById && doc.getElementById('tl-css'))) { const s = doc.createElement('style'); s.id = 'tl-css'; s.textContent = CSS; doc.head.append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const link = (href, text, cls) => { const a = el('a', cls, text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  const num = (n) => (n == null ? '—' : Number(n).toLocaleString());
  const root = el('div', 'tl'); root.dataset.ledger = '1';
  root.append(el('p', 'tl-note', t('led.loading')));
  let data = null, card = focus, timer = null, dead = false;
  const seen = new Set();

  const name = (key) => {
    const b = el('button', 'tl-name', t('mk.t.' + key)); b.type = 'button'; b.dataset.trader = key;
    b.setAttribute('aria-label', t('led.card.open', { name: t('mk.t.' + key) }));
    b.addEventListener('click', () => openTrader(key));
    return b;
  };
  /** "{buyer} bought … from {seller}" with the two names as buttons, in the locale's own word order. */
  const tradeLine = (r) => {
    const span = el('span');
    const text = t('led.trade', { buyer: '\u0001b\u0001', seller: '\u0001s\u0001', qty: r.qty, item: t('mk.i.' + r.item) });
    for (const part of text.split(/\u0001([bs])\u0001/)) {
      if (part === 'b') span.append(name(r.buyer)); else if (part === 's') span.append(name(r.seller)); else if (part) span.append(doc.createTextNode(part));
    }
    return span;
  };
  const why = (r) => {
    const w = el('div', 'why');
    const each = r.silk ? silkOf(r.silk / r.qty) : unitSilk(r.price);
    w.append(el('span', null, t(r.base ? 'led.each.base' : 'led.each', { each, base: r.base ? unitSilk(r.base) : '' }) + ' · '));
    if (r.reason) { w.append(el('b', null, t('led.why') + ' ')); w.append(doc.createTextNode(reasonText(t, r.reason))); }
    return w;
  };
  const tradeRow = (r, fresh) => {
    const li = el('li', 'tl-row' + (fresh ? ' new' : ''));
    const main = el('div');
    const ago = agoOf(r.at, now());
    main.append(el('span', 'ago', t('led.ago.' + ago.k, { n: ago.n })), tradeLine(r), doc.createTextNode(' · ' + t('led.paid', { silk: r.silk ? silkOf(r.silk) : unitSilk(r.price * r.qty) })));
    li.append(main);
    if (r.url) { const a = link(r.url, shortHash(r.hash) + ' ↗', 'tx'); a.title = t('mk.tx'); a.setAttribute('aria-label', t('mk.tx')); li.append(a); } else li.append(el('span'));
    li.append(why(r));
    return li;
  };

  function header() {
    const top = el('div', 'tl-top');
    const big = el('div', 'tl-big', num(data.today)); big.append(el('small', null, t('led.todayLabel')));
    const right = el('div');
    const p = progressOf(data);
    right.append(el('p', 'tl-note', data.target ? t('led.target', { pct: Math.round((p || 0) * 100), target: num(data.target) }) : ''));
    const bar = el('div', 'tl-bar'); const fill = el('i'); fill.style.width = Math.round((p || 0) * 100) + '%'; bar.append(fill); right.append(bar);
    top.append(big, right);
    const meta = el('div', 'tl-meta');
    const live = el('span'); live.append(el('span', 'tl-dot' + (data.live ? '' : ' off')), doc.createTextNode(t(data.live ? 'led.live' : 'led.paused')));
    const contract = el('span'); contract.append(doc.createTextNode(t('led.contract') + ' '), link(accountUrl(data.contract), data.contract));
    meta.append(live, el('span', null, t('led.traders', { n: data.traders || TRADERS.length })), contract);
    top.append(meta);
    return top;
  }

  function aiBox() {
    const box = el('div', 'tl-box tl-ai');
    const s = data.strategy;
    box.append(el('h3', null, t('led.ai.title')));
    const model = (s.clans.find((c) => c.model) || {}).model;
    box.append(el('p', 'tl-note', s.decisions ? t('led.ai.sub', { llm: s.llm, n: s.decisions, model: model || 'LLM' }) : t('led.ai.none')));
    for (const c of s.clans) {
      const d = el('div', 'tl-clan');
      const head = el('div'); head.append(name(c.clan));
      if (c.llm && c.verified) head.append(doc.createTextNode(' '), el('span', 'tl-ok', '✓ ' + t('led.ai.verified')));
      d.append(head);
      const bits = [];
      if (c.risk != null) bits.push(t('led.ai.risk', { risk: c.risk }));
      if (c.buy) bits.push(t('led.buy.' + c.buy));
      if (c.favour) bits.push(t('led.ai.favour', { name: t('mk.t.' + c.favour) }));
      if (bits.length) d.append(el('p', null, bits.join(' · ')));
      if (c.reason) { const q = el('p'); q.append(el('q', null, c.reason)); d.append(q); }
      if (!c.llm && c.fallback) d.append(el('p', null, t('led.ai.fallback', { why: c.fallback })));
      if (c.chat) { const p = el('p', null, t('led.ai.chat') + ' '); p.append(el('code', null, c.chat.slice(0, 22) + (c.chat.length > 22 ? '…' : ''))); d.append(p); }
      box.append(d);
    }
    return box;
  }

  /** "Take part": the player's own goals (ui/town-goals.js) and the way into the Town works window. */
  function partBox() {
    const box = el('div', 'tl-box tl-part');
    box.append(el('h3', null, t('led.part.title')), el('p', 'tl-note', t('led.part.lead')));
    const goals = el('div', 'tl-goals');
    for (const g of goalsView(loadGoals(storage), now())) goals.append(el('span', 'tl-goal' + (g.done ? ' done' : ''), t('led.part.goal.' + g.id, { n: g.n, of: g.of })));
    box.append(goals);
    const go = el('button', 'tl-go', t('led.part.open')); go.type = 'button';
    go.addEventListener('click', () => { try { win.dispatchEvent(new CustomEvent('ftf:town-works-open')); } catch { /* no window */ } });
    box.append(go, el('p', 'tl-note', t('led.part.note')));
    return box;
  }

  function linksBox() {
    const box = el('div', 'tl-box');
    box.append(el('h3', null, t('led.more')));
    const ul = el('ul', 'tl-links');
    for (const [href, key] of [[base + 'economy-lab.html', 'led.link.week'], [base + 'pulse.html', 'led.link.pulse'], [REPO + 'relayer/market/prices.js', 'led.link.rules']]) { const li = el('li'); li.append(link(href, t(key))); ul.append(li); }
    box.append(ul);
    return box;
  }

  function cardView(key) {
    const c = traderCard(data, key);
    const wrap = el('div', 'tl-card'); wrap.dataset.card = key;
    const back = el('button', 'tl-back', '← ' + t('led.card.back')); back.type = 'button'; back.addEventListener('click', () => { card = null; render(new Set()); });
    wrap.append(back, el('h4', null, t('mk.t.' + key)));
    const acct = el('div', 'tl-box');
    acct.append(el('h3', null, t('led.card.account')));
    const a = el('p', 'tl-acct'); a.append(link(accountUrl(c.account), c.account + ' ↗')); acct.append(a);
    if (c.clanAccount) { acct.append(el('p', 'tl-note', t('led.card.clan'))); const b = el('p', 'tl-acct'); b.append(link(accountUrl(c.clanAccount), c.clanAccount + ' ↗')); acct.append(b); }
    acct.append(el('p', 'tl-note', t('led.card.keys')));
    if (c.silk != null) acct.append(el('p', null, t('led.card.silk', { silk: num(Math.round(Number(c.silk))) })));
    wrap.append(acct);
    if (c.sells.length) {
      const g = el('div', 'tl-box'); g.append(el('h3', null, t('led.card.sells')));
      const grid = el('div', 'tl-goods');
      for (const s of c.sells) {
        const it = el('div', 'tl-good', t('mk.i.' + s.item));
        it.append(el('small', null, s.closed ? t('led.card.closed') : t('led.card.price', { price: unitSilk(s.price), base: s.base ? unitSilk(s.base) : '—', n: num(s.stock) })));
        grid.append(it);
      }
      g.append(grid); wrap.append(g);
    }
    if (c.strategy) { const ai = el('div', 'tl-box'); ai.append(el('h3', null, t('led.ai.title'))); const s = c.strategy; ai.append(el('p', null, [s.risk != null ? t('led.ai.risk', { risk: s.risk }) : '', s.buy ? t('led.buy.' + s.buy) : ''].filter(Boolean).join(' · '))); if (s.reason) { const q = el('p'); q.append(el('q', null, s.reason)); ai.append(q); } wrap.append(ai); }
    const tr = el('div', 'tl-box'); tr.append(el('h3', null, t('led.card.trades')));
    if (c.trades.length) { const ul = el('ul', 'tl-list'); for (const r of c.trades) ul.append(tradeRow(r, false)); tr.append(ul); } else tr.append(el('p', 'tl-note', t('led.card.none')));
    wrap.append(tr);
    return wrap;
  }

  function render(fresh) {
    if (dead) return;
    if (!data) { root.replaceChildren(el('p', 'tl-note', t('led.offline'))); return; }
    if (card && TRADERS.includes(card)) { root.replaceChildren(cardView(card)); return; }
    const trades = el('div', 'tl-box');
    trades.append(el('h3', null, t('led.trades')), el('p', 'tl-note', t('mk.label')));
    if (data.recent.length) { const ul = el('ul', 'tl-list'); for (const r of data.recent.slice(0, 12)) ul.append(tradeRow(r, fresh.has(r.hash))); trades.append(ul); } else trades.append(el('p', 'tl-note', t('led.none')));
    const side = el('div'); side.style.cssText = 'display:grid;gap:12px';
    side.append(partBox(), aiBox(), linksBox());
    const cols = el('div', 'tl-cols'); cols.append(trades, side);
    root.replaceChildren(header(), cols);
  }

  async function refresh() {
    const j = await poll();
    if (dead) return;
    const first = !data;
    if (j) data = j;
    const fresh = new Set();
    if (j) for (const r of j.recent) if (r.hash && !seen.has(r.hash)) { seen.add(r.hash); if (!first) fresh.add(r.hash); }
    if (j || first) render(fresh);
  }
  function openTrader(key) { card = key; render(new Set()); if (root.scrollIntoView) try { root.scrollIntoView({ block: 'start' }); } catch { /* old browsers */ } }
  const visible = () => !doc.visibilityState || doc.visibilityState === 'visible';
  const tick = () => { timer = timers.setTimeout(async () => { if (dead) return; if (!root.isConnected) { destroy(); return; } if (visible() && !card) await refresh(); tick(); }, pollMs); };
  function destroy() { dead = true; if (timer) timers.clearTimeout(timer); timer = null; }
  refresh().catch(() => {}).finally(() => { if (!dead) tick(); });
  return { root, refresh, openTrader, destroy, state: () => ({ data, card }) };
}
