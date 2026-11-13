// The Market window (sprint 6.4; docs/market.md): Buy · Sell · My listings. Players trade monster resources for
// silk; the reference price is the stall's, a listing must stay within half to double of it, and 2 % of a sale is
// burned. Every sale settles on NEAR testnet (the owner's rule: no demo modes) and shows its two transaction links;
// until the trade contracts are deployed the window says plainly that the market is not live yet and nothing can be
// listed or bought. Every buy is confirmed first. Nothing here invents a result: an error says what happened, why,
// and what to do next.
import { MARKET, TRADABLE, feeOf, bandOf } from './market-rules.js';
import { formatSilkC, silkView, subscribeSilk, refreshSilk } from '../net/silk-core.js';
import { DICE, oddsTable, payoutOf, stakeAllowed, rollOf } from './dice.js';
import { artBox, resIconPath } from './art.js';

const TX = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const CSS = `
.mk2-wrap { position: fixed; inset: 0; z-index: calc(var(--z-modal, 40) + 1); display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .5); }
.mk2 { width: min(1180px, 100%); height: min(680px, calc(100vh - 32px)); display: grid; grid-template-rows: auto auto auto 1fr; background: var(--ftf-panel-solid, #101f1a); color: var(--ftf-text, #eef0ea); border: 1px solid rgba(197, 164, 105, .45); border-radius: 14px; font: 14px/1.4 var(--font-ui, system-ui, sans-serif); overflow: hidden; }
.mk2-head { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid rgba(197, 164, 105, .2); }
.mk2-head h3 { margin: 0; flex: 1; font: 700 20px/1.2 var(--font-title, Georgia, serif); color: var(--ftf-gold-bright, #dcc08a); }
.mk2-silk { font-variant-numeric: tabular-nums; color: var(--ftf-gold-bright, #dcc08a); font-weight: 700; }
.mk2-x { min-width: 40px; min-height: 40px; border-radius: 10px; border: 1px solid var(--ftf-border, rgba(197,164,105,.4)); background: transparent; color: var(--ftf-text, #eef0ea); font: 700 18px var(--font-ui, system-ui); cursor: pointer; }
.mk2-tabs { display: flex; gap: 4px; padding: 8px 16px 0; }
.mk2-tabs button { min-height: 40px; padding: 8px 16px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--ftf-muted, #aab6b0); font: 600 14px var(--font-ui, system-ui); cursor: pointer; }
.mk2-tabs button[aria-selected="true"] { color: var(--ftf-gold-bright, #dcc08a); border-bottom-color: var(--ftf-gold, #c5a469); }
.mk2-chip { margin: 8px 16px 0; padding: 6px 10px; border-radius: 8px; font-size: 12px; background: #4a3410; color: #ffd98a; }
.mk2-chip.chain { background: rgba(74, 163, 255, .14); color: #9ccfff; }
.mk2-body { overflow: auto; padding: 12px 16px 16px; }
.mk2-items { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.mk2-items button { min-height: 34px; padding: 6px 12px; border-radius: 99px; border: 1px solid var(--ftf-border, rgba(197,164,105,.4)); background: transparent; color: var(--ftf-text, #eef0ea); font: 600 13px var(--font-ui, system-ui); cursor: pointer; text-transform: capitalize; }
.mk2-items button[aria-pressed="true"] { background: rgba(197, 164, 105, .18); border-color: var(--ftf-gold, #c5a469); color: var(--ftf-gold-bright, #dcc08a); }
.mk2 table { width: 100%; border-collapse: collapse; }
.mk2 th { text-align: left; font: 600 12px var(--font-ui, system-ui); color: #a99f8e; padding: 8px 6px; border-bottom: 1px solid rgba(197, 164, 105, .2); }
.mk2 td { padding: 10px 6px; border-bottom: 1px solid rgba(197, 164, 105, .1); font-variant-numeric: tabular-nums; }
.mk2 td.mk2-name { text-transform: capitalize; font-weight: 600; }
.mk2 .mk2-badge { display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 99px; font-size: 11px; background: rgba(197, 164, 105, .14); color: #e9cf95; }
.mk2 .mk2-badge.agent { background: rgba(176, 108, 255, .16); color: #d6b6ff; }
.mk2 button.mk2-act { min-height: 32px; padding: 4px 12px; border-radius: 8px; border: 1px solid #8c6a2a; background: var(--ftf-gold, #c5a469); color: #1b1406; font: 700 13px var(--font-ui, system-ui); cursor: pointer; }
.mk2 button.mk2-ghost { background: transparent; color: var(--ftf-text, #eef0ea); border-color: var(--ftf-border, rgba(197,164,105,.4)); }
.mk2 button[disabled] { opacity: .5; cursor: default; }
.mk2-form { display: grid; gap: 10px; max-width: 520px; }
.mk2-form label { display: grid; gap: 4px; font-size: 13px; color: var(--ftf-muted, #aab6b0); }
.mk2-form input { padding: 8px; border-radius: 8px; border: 1px solid var(--ftf-border, rgba(197,164,105,.4)); background: #0b0e10; color: #fff; font: 15px var(--font-ui, system-ui); max-width: 160px; }
.mk2-note { font-size: 12px; color: var(--ftf-muted, #aab6b0); }
.mk2-state { min-height: 20px; margin-top: 8px; font-size: 13px; }
.mk2-state.err { color: #ff8a7a; } .mk2-state a { color: var(--ftf-ok, #5ccf8a); }
.mk2-confirm { margin-top: 10px; padding: 12px; border-radius: 10px; border: 1px solid rgba(197, 164, 105, .35); background: rgba(197, 164, 105, .06); display: grid; gap: 8px; }
.mk2-empty { padding: 28px 0; text-align: center; color: var(--ftf-muted, #aab6b0); }
.mk2-empty b { display: block; color: var(--ftf-text, #eef0ea); margin-bottom: 4px; }
.mk2-game { display: grid; gap: 10px; max-width: 560px; }
.mk2-game .mk2-items button { text-transform: none; }
.mk2-roll { font: 700 44px/1 var(--font-title, Georgia, serif); color: var(--ftf-gold-bright, #dcc08a); min-height: 48px; }
.mk2-win { color: var(--ftf-ok, #5ccf8a); font-weight: 700; } .mk2-lose { color: #ff8a7a; font-weight: 700; }
.mk2-modal { padding: 16px; border-radius: 12px; border: 1px solid rgba(197, 164, 105, .45); background: var(--ftf-panel-solid, #101f1a); display: grid; gap: 10px; max-width: 480px; }
@media (max-width: 640px) { .mk2 { height: calc(100vh - 32px); } .mk2 th:nth-child(6), .mk2 td:nth-child(6) { display: none; } }
@media (prefers-reduced-motion: reduce) { .mk2 * { transition: none !important; } }
`;

const age = (t, ms) => (ms < 3_600_000 ? t('p2p.age.min', { n: Math.max(1, Math.round(ms / 60_000)) }) : t('p2p.age.h', { n: Math.round(ms / 3_600_000) }));

/**
 * @param {{t: Function, client: object, doc?: Document, now?: () => number, explorer?: string}} o
 * @returns {{open(tab?: string): void, close(): void, readonly isOpen: boolean}}
 */
export function createMarketUi({ t, client, dice = null, storage = null, doc = globalThis.document, now = () => Date.now(), explorer = 'https://testnet.nearblocks.io' }) {
  if (!(doc.getElementById && doc.getElementById('mk2-style'))) { const s = doc.createElement('style'); s.id = 'mk2-style'; s.textContent = CSS; doc.head.append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (label, fn, cls = 'mk2-act') => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const name = (id) => t('res.' + id);
  const silk = (c) => t('p2p.silk', { n: formatSilkC(c) });
  const errText = (r) => t('p2p.err.' + (['outside_band', 'not_enough_items', 'not_enough_silk', 'listing_gone', 'limit_listings', 'daily_cap', 'self_trade', 'paused', 'rate_limited', 'network', 'need_guest', 'too_small', 'not_configured', 'market_not_live'].includes(r.error) ? r.error : 'other'),
    { min: formatSilkC(r.minC || 0), max: formatSilkC(r.maxC || 0), need: formatSilkC(r.needC || 0), have: formatSilkC(r.haveC || 0), qty: r.have ?? '' });
  let root = null, body = null, chip = null, silkEl = null, tab = 'buy', item = TRADABLE[0], unSilk = null, settlement = 'chain';
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } else if (['1', '2', '3', '4'].includes(e.key) && !(e.target && e.target.tagName === 'INPUT')) show(['buy', 'sell', 'mine', 'games'][Number(e.key) - 1]); };

  let live = null;
  function setChip(isLive) {
    if (isLive != null) live = !!isLive;
    if (!chip) return;
    chip.hidden = live == null || tab === 'games';
    chip.className = 'mk2-chip' + (live ? ' chain' : '');
    chip.textContent = live ? t('p2p.chain') : t('p2p.notLive');
  }
  const txLinks = (f) => [f.txItems, f.txSilk].filter((h) => TX.test(String(h || ''))).map((h) => { const a = el('a', null, t('p2p.viewTx')); a.href = `${explorer}/txns/${h}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; });
  function itemChips(onPick) {
    const row = el('div', 'mk2-items');
    for (const id of TRADABLE) { const b = btn('', () => { item = id; onPick(); }, ''); b.append(artBox(doc, resIconPath(id), name(id), { size: 22, radius: 11 }), ' ' + name(id)); b.setAttribute('aria-pressed', String(id === item)); row.append(b); }
    return row;
  }
  const loading = () => body.replaceChildren(el('p', 'mk2-note', t('p2p.loading')));

  async function buyTab() {
    loading();
    const r = await client.book(item);
    if (tab !== 'buy') return;
    const head = itemChips(buyTab);
    if (!r.ok) { body.replaceChildren(head, el('p', 'mk2-state err', errText(r))); return; }
    setChip(r.live);
    const ref = el('p', 'mk2-note', t('p2p.ref', { x: formatSilkC(r.referenceUnitC) }) + ' ' + t('p2p.refWhy'));
    if (!r.listings.length) { const e = el('div', 'mk2-empty'); e.append(el('b', null, t('p2p.empty')), el('span', null, t('p2p.emptyNext'))); body.replaceChildren(head, ref, e); return; }
    const table = el('table'); const tr = el('tr');
    for (const k of ['item', 'qty', 'unit', 'total', 'seller', 'age', '']) tr.append(el('th', null, k ? t('p2p.col.' + k) : ''));
    table.append(tr);
    const state = el('p', 'mk2-state');
    const me = client.account();
    for (const l of r.listings) {
      const row = el('tr');
      const seller = el('td', null, l.seller.split('.')[0]); seller.append(el('span', 'mk2-badge' + (l.sellerKind === 'agent' ? ' agent' : ''), t(l.sellerKind === 'agent' ? 'p2p.agent' : 'p2p.player')));
      const act = el('td'); const b = btn(t('p2p.buy'), () => confirmBuy(l, state)); b.disabled = l.seller === me || !live; if (b.disabled) b.title = !live ? t('p2p.notLive') : t('p2p.err.self_trade'); act.append(b);
      const nm = el('td', 'mk2-name'); nm.append(artBox(doc, resIconPath(l.item), name(l.item), { size: 32 }), ' ' + name(l.item));
      row.append(nm, el('td', null, String(l.qtyLeft)), el('td', null, silk(l.unitPriceC)), el('td', null, silk(l.qtyLeft * l.unitPriceC)), seller, el('td', null, age(t, now() - l.createdAt)), act);
      table.append(row);
    }
    body.replaceChildren(head, ref, table, state);
  }
  function confirmBuy(l, state) {
    let qty = 1;
    const box = el('div', 'mk2-confirm');
    const q = el('input'); q.type = 'number'; q.min = '1'; q.max = String(l.qtyLeft); q.value = '1'; q.setAttribute('aria-label', t('p2p.qty'));
    const sum = el('p', 'mk2-note'); const go = btn('', () => doBuy());
    const render = () => {
      const total = qty * l.unitPriceC, fee = feeOf(total), v = silkView();
      sum.textContent = t('p2p.confirm', { qty, item: name(l.item), t: formatSilkC(total), seller: l.seller.split('.')[0] }) + ' ' + t('p2p.sellerGets', { x: formatSilkC(total - fee) });
      go.textContent = t('p2p.buyFor', { t: formatSilkC(total) });
      go.disabled = !live || (v.chainOk && v.gateC < total); // a trade spends silk recorded on NEAR only
      go.title = go.disabled ? t('p2p.err.not_enough_silk', { need: formatSilkC(total), have: formatSilkC(v.gateC) }) : '';
    };
    q.addEventListener('input', () => { qty = Math.max(1, Math.min(l.qtyLeft, Math.floor(Number(q.value) || 1))); render(); });
    const lab = el('label', 'mk2-note', t('p2p.qty')); lab.append(q);
    box.append(lab, sum, el('div', null)); box.lastChild.append(go, btn(t('p2p.back'), () => box.remove(), 'mk2-act mk2-ghost'));
    state.replaceChildren(box); render();
    async function doBuy() {
      go.disabled = true; go.textContent = t('p2p.working');
      const r = await client.buy(l.id, qty);
      if (!r.ok) { state.replaceChildren(el('p', 'mk2-state err', errText(r))); return; }
      const ok = el('p', 'mk2-state', t('p2p.done.bought', { qty: r.fill.qty, item: name(l.item) }) + ' '); ok.append(...txLinks(r.fill));
      refreshSilk(true).catch(() => {});
      await buyTab(); body.append(ok);
    }
  }

  async function sellTab() {
    loading();
    const [book, mine] = await Promise.all([client.book(item), client.mine()]);
    if (tab !== 'sell') return;
    const head = itemChips(sellTab);
    if (!book.ok) { body.replaceChildren(head, el('p', 'mk2-state err', errText(book))); return; }
    setChip(book.live);
    const held = null; // the relayer checks the real holdings on NEAR when the listing is made
    const band = bandOf(book.referenceUnitC);
    const form = el('div', 'mk2-form');
    const qty = el('input'); qty.type = 'number'; qty.min = '1'; qty.max = String(MARKET.qtyMax); qty.value = '1';
    const price = el('input'); price.type = 'number'; price.step = '0.01'; price.value = String(book.referenceUnitC / 100);
    const lq = el('label', null, t('p2p.qty') + (held != null ? ' · ' + t('p2p.have', { n: held }) : '')); lq.append(qty);
    const lp = el('label', null, t('p2p.price')); lp.append(price, el('span', 'mk2-note', t('p2p.allowed', { min: formatSilkC(band.minC), max: formatSilkC(band.maxC) })));
    const preview = el('p', 'mk2-note'); const state = el('p', 'mk2-state');
    const go = btn(t('p2p.list'), async () => {
      go.disabled = true;
      const r = await client.list(item, Math.floor(Number(qty.value)), Math.round(Number(price.value) * 100));
      go.disabled = false;
      state.className = 'mk2-state' + (r.ok ? '' : ' err'); state.textContent = r.ok ? t('p2p.done.listed') : errText(r);
    });
    const render = () => { const total = Math.floor(Number(qty.value) || 0) * Math.round(Number(price.value) * 100); preview.textContent = t('p2p.youGet', { x: formatSilkC(Math.max(0, total - feeOf(total))) }); };
    qty.addEventListener('input', render); price.addEventListener('input', render); render();
    go.disabled = !live; if (!live) go.title = t('p2p.notLive');
    form.append(lq, lp, preview, go, el('p', 'mk2-note', t('p2p.duration')), state);
    body.replaceChildren(head, form);
  }

  async function mineTab() {
    loading();
    const r = await client.mine();
    if (tab !== 'mine') return;
    if (!r.ok) { body.replaceChildren(el('p', 'mk2-state err', errText(r))); return; }
    setChip(r.live);
    if (!r.listings.length) { const e = el('div', 'mk2-empty'); e.append(el('b', null, t('p2p.mineEmpty')), el('span', null, t('p2p.mineNext'))); body.replaceChildren(e); return; }
    const table = el('table'); const tr = el('tr');
    for (const k of ['item', 'qty', 'unit', 'status', '']) tr.append(el('th', null, k ? t('p2p.col.' + k) : ''));
    table.append(tr);
    const state = el('p', 'mk2-state');
    for (const l of r.listings) {
      const row = el('tr');
      const st = t('p2p.status.' + l.status, { sold: l.qtyTotal - l.qtyLeft, total: l.qtyTotal });
      const act = el('td');
      if (l.status === 'active' || l.status === 'partial') act.append(btn(t('p2p.cancelBtn'), async () => { const c = await client.cancel(l.id); state.className = 'mk2-state' + (c.ok ? '' : ' err'); state.textContent = c.ok ? t('p2p.done.cancelled') : errText(c); if (c.ok) mineTab(); }, 'mk2-act mk2-ghost'));
      const stTd = el('td', null, st); for (const f of l.fills || []) for (const a of txLinks(f)) stTd.append(' ', a);
      const nm = el('td', 'mk2-name'); nm.append(artBox(doc, resIconPath(l.item), name(l.item), { size: 32 }), ' ' + name(l.item));
      row.append(nm, el('td', null, `${l.qtyLeft}/${l.qtyTotal}`), el('td', null, silk(l.unitPriceC)), stTd, act);
      table.append(row);
    }
    body.replaceChildren(table, state);
  }

  // ---- Games: Loom Dice, play money only (sprint 6.8). Shown once: the legal frame, with "I understand" / "Back".
  const GAMES_OK = 'ftf.games.ok.v1';
  let bet = 50, stake = 100;
  function gamesTab() {
    if (!dice) { body.replaceChildren(el('p', 'mk2-note', t('games.off'))); return; }
    let agreed = false; try { agreed = !!(storage && storage.getItem(GAMES_OK)); } catch { /* ask again */ }
    if (!agreed) {
      const m = el('div', 'mk2-modal'); m.append(el('h4', null, t('games.title')), el('p', null, t('games.legal')));
      const row = el('div'); row.append(btn(t('games.agree'), () => { try { storage && storage.setItem(GAMES_OK, '1'); } catch { /* memory only */ } if (dice.claimAllowance()) refreshSilk(false).catch(() => {}); gamesTab(); }), btn(t('p2p.back'), () => show('buy'), 'mk2-act mk2-ghost'));
      m.append(row); body.replaceChildren(m); return;
    }
    const g = el('div', 'mk2-game');
    const bets = el('div', 'mk2-items'), stakes = el('div', 'mk2-items');
    const summary = el('p', 'mk2-note'), out = el('div'), hint = el('div'), rollEl = el('div', 'mk2-roll'), fair = el('p', 'mk2-note'), counters = el('p', 'mk2-note');
    const go = btn(t('games.roll'), () => doRoll());
    const odds = el('details'); odds.append(el('summary', null, t('games.odds')));
    const tb = el('table'); const hr = el('tr'); for (const k of ['bet', 'chance', 'pays', 'back', 'edge']) hr.append(el('th', null, t('games.col.' + k))); tb.append(hr);
    for (const r of oddsTable()) { const tr = el('tr'); tr.append(el('td', null, t('games.under', { n: r.n })), el('td', null, Math.round(r.chance * 100) + '%'), el('td', null, '×' + r.multiplier.toFixed(2)), el('td', null, Math.round(r.rtp * 100) + '%'), el('td', null, Math.round(r.edge * 100) + '%')); tb.append(tr); }
    odds.append(tb);
    const paint = () => {
      bets.replaceChildren(...DICE.bets.map((n) => { const b = btn(t('games.under', { n }) + ' · ×' + (96 / n).toFixed(2), () => { bet = n; if (!stakeAllowed(stake, bet)) stake = 100; paint(); }, ''); b.setAttribute('aria-pressed', String(n === bet)); return b; }));
      stakes.replaceChildren(...DICE.stakesC.map((c) => { const b = btn(formatSilkC(c), () => { stake = c; paint(); }, ''); b.setAttribute('aria-pressed', String(c === stake)); b.disabled = !stakeAllowed(c, bet); if (b.disabled) b.title = t('games.maxPayout'); return b; }));
      summary.textContent = t('games.summary', { x: formatSilkC(payoutOf(stake, bet)), p: bet });
      const s = dice.state(), why = dice.blocker(stake, bet);
      play.textContent = t('games.play', { n: formatSilkC(dice.play()) });
      counters.textContent = t('games.counters', { up: formatSilkC(Math.max(0, s.netC)), down: formatSilkC(Math.max(0, -s.netC)), rolls: s.rollsToday });
      go.disabled = !!why && why !== 'cooldown'; go.title = why ? t('games.why.' + why) : '';
      hint.replaceChildren(...(why && why !== 'cooldown' ? [el('p', 'mk2-note', t('games.why.' + why))] : []));
    };
    function doRoll() {
      const r = dice.roll(stake, bet);
      if (!r.ok) { out.replaceChildren(el('p', 'mk2-state err', t('games.why.' + r.reason))); return; }
      rollEl.textContent = String(r.roll);
      out.replaceChildren(el('p', r.win ? 'mk2-win' : 'mk2-lose', r.win ? t('games.win', { x: formatSilkC(r.payoutC - r.stakeC) }) : t('games.lose', { x: formatSilkC(r.stakeC) })));
      fair.replaceChildren(t('games.fair', { k: r.k, seed: r.seed.slice(0, 16) + '…' }) + ' ', btn(t('games.verify'), () => { const v = rollOf(dice.state().wheelId, r.k); fair.append(' ' + t(v.roll === r.roll ? 'games.verified' : 'games.mismatch', { roll: v.roll })); }, 'mk2-act mk2-ghost'));
      refreshSilk(false).catch(() => {}); paint();
    }
    const play = el('p', 'mk2-note');
    g.append(el('p', 'mk2-note', t('games.rule')), bets, stakes, summary, go, hint, rollEl, out, fair, counters, play, odds, el('p', 'mk2-note', t('games.footer')));
    body.replaceChildren(g); paint();
  }

  function show(next) {
    tab = next;
    for (const b of root.querySelectorAll('.mk2-tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    Promise.resolve((tab === 'buy' ? buyTab : tab === 'sell' ? sellTab : tab === 'games' ? gamesTab : mineTab)()).catch(() => body.replaceChildren(el('p', 'mk2-state err', t('p2p.err.network'))));
  }
  function open(first = 'buy') {
    if (root) { show(first); return; }
    root = el('div', 'mk2-wrap'); root.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === root) close(); });
    const box = el('div', 'mk2'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', t('p2p.title'));
    const head = el('div', 'mk2-head'); silkEl = el('span', 'mk2-silk');
    const x = btn('×', close, 'mk2-x'); x.setAttribute('aria-label', t('p2p.close'));
    head.append(el('h3', null, t('p2p.title')), silkEl, x);
    const tabs = el('div', 'mk2-tabs'); tabs.setAttribute('role', 'tablist');
    for (const k of ['buy', 'sell', 'mine', 'games']) { const b = btn(t(k === 'games' ? 'games.tab' : 'p2p.tab.' + k), () => show(k), ''); b.setAttribute('role', 'tab'); b.dataset.tab = k; tabs.append(b); }
    chip = el('div', 'mk2-chip'); chip.hidden = true; body = el('div', 'mk2-body');
    box.append(head, tabs, chip, body); root.append(box); doc.body.append(root);
    const paintSilk = () => { const v = silkView(); silkEl.textContent = v.chainOk ? silk(v.gateC) : ''; silkEl.title = t('silk.tip.gate', { n: formatSilkC(v.gateC) }); };
    unSilk = subscribeSilk(paintSilk); paintSilk();
    root.addEventListener('keydown', (e) => { e.stopPropagation(); onKey(e); }); // focus stays inside the window (the close button first)
    show(first); x.focus && x.focus();
  }
  function close() { if (!root) return; root.remove(); root = null; if (unSilk) unSilk(); }
  return { open, close, get isOpen() { return !!root; } };
}
