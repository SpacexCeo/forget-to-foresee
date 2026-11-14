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
import { EXPLORER } from '../net/network.js';

const TX = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const CSS = `
.mk2-wrap { position: fixed; inset: 0; z-index: calc(var(--z-modal, 40) + 1); display: grid; place-items: center; padding: clamp(12px, 2.2vw, 28px); background: rgba(3, 8, 7, .72); backdrop-filter: blur(5px) saturate(.8); }
.mk2 { --mk2-gold: var(--ftf-gold, #c5a469); --mk2-ink: #0a1713; width: min(1060px, 100%); max-height: min(760px, calc(100vh - 32px)); display: grid; grid-template-rows: auto auto auto minmax(0, 1fr); background: radial-gradient(circle at 82% 0%, rgba(197, 164, 105, .075), transparent 34%), var(--ftf-panel-solid, #101f1a); color: var(--ftf-text, #eef0ea); border: 1px solid rgba(211, 177, 112, .5); border-radius: 16px; font: 14px/1.45 var(--font-ui, system-ui, sans-serif); overflow: hidden; }
.mk2 ::selection { background: rgba(213, 175, 103, .32); color: #fff8e8; }
.mk2-head { display: flex; align-items: center; gap: 14px; min-height: 64px; padding: 0 18px 0 22px; border-bottom: 1px solid rgba(197, 164, 105, .16); }
.mk2-head h3 { display: flex; align-items: center; gap: 12px; margin: 0; flex: 1; font: 700 22px/1.15 var(--font-title, Georgia, serif); letter-spacing: -.015em; color: var(--ftf-gold-bright, #e2c58d); }
.mk2-head h3::before { content: ''; width: 10px; height: 10px; border: 1px solid var(--mk2-gold); transform: rotate(45deg); box-shadow: inset 0 0 0 2px var(--mk2-ink); background: var(--mk2-gold); }
.mk2-silk { display: inline-flex; align-items: center; gap: 8px; min-height: 34px; padding: 0 12px; border-radius: 999px; background: rgba(197, 164, 105, .1); color: var(--ftf-gold-bright, #e2c58d); font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mk2-silk::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: #e4bd67; box-shadow: 0 0 10px rgba(228, 189, 103, .45); }
.mk2-x { position: relative; width: 40px; height: 40px; flex: 0 0 40px; border-radius: 10px; border: 1px solid rgba(197,164,105,.38); background: rgba(4, 12, 10, .38); color: var(--ftf-text, #eef0ea); cursor: pointer; }
.mk2-x::before, .mk2-x::after { content: ''; position: absolute; left: 12px; top: 19px; width: 15px; height: 1.5px; border-radius: 2px; background: currentColor; transform: rotate(45deg); }
.mk2-x::after { transform: rotate(-45deg); }
.mk2-x:hover { color: #fff8e8; background: rgba(197, 164, 105, .12); border-color: rgba(225, 193, 132, .72); }
.mk2-tabs { display: flex; gap: 22px; padding: 0 22px; border-bottom: 1px solid rgba(197, 164, 105, .1); }
.mk2-tabs button { position: relative; min-height: 54px; padding: 0 2px; border: 0; background: transparent; color: var(--ftf-muted, #aab6b0); font: 650 14px var(--font-ui, system-ui); cursor: pointer; }
.mk2-tabs button::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; border-radius: 2px 2px 0 0; background: var(--mk2-gold); transform: scaleX(0); transform-origin: center; transition: transform 180ms cubic-bezier(.2, .8, .2, 1); }
.mk2-tabs button:hover { color: #f0e7d4; }
.mk2-tabs button[aria-selected="true"] { color: var(--ftf-gold-bright, #e2c58d); }
.mk2-tabs button[aria-selected="true"]::after { transform: scaleX(1); }
.mk2-chip { display: flex; align-items: center; gap: 8px; margin: 12px 22px 0; padding: 8px 11px; border-radius: 9px; font-size: 12px; background: rgba(134, 92, 22, .22); color: #f2cc80; }
.mk2-chip::before { content: ''; width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: currentColor; opacity: .8; }
.mk2-chip.chain { background: rgba(57, 143, 178, .14); color: #9fd7ee; }
.mk2-body { min-height: 0; overflow: auto; padding: 16px 22px 24px; scrollbar-width: thin; scrollbar-color: rgba(197,164,105,.5) rgba(0,0,0,.12); }
.mk2-body::-webkit-scrollbar { width: 8px; height: 8px; }
.mk2-body::-webkit-scrollbar-track { background: rgba(0,0,0,.12); }
.mk2-body::-webkit-scrollbar-thumb { border-radius: 8px; background: rgba(197,164,105,.48); }
.mk2-items { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
.mk2-items button { display: inline-flex; align-items: center; min-height: 42px; padding: 7px 13px 7px 8px; border-radius: 12px; border: 1px solid rgba(197,164,105,.27); background: rgba(7, 16, 13, .42); color: #d9ded9; font: 620 13px var(--font-ui, system-ui); cursor: pointer; text-transform: capitalize; transition: border-color 160ms ease, background 160ms ease, color 160ms ease, transform 160ms ease; }
.mk2-items button:hover { border-color: rgba(218, 181, 110, .58); color: #fff8e8; transform: translateY(-1px); }
.mk2-items button[aria-pressed="true"] { background: rgba(197, 164, 105, .15); border-color: var(--mk2-gold); color: var(--ftf-gold-bright, #e2c58d); }
.mk2 table { width: 100%; border-collapse: collapse; }
.mk2 th { text-align: left; font: 600 12px var(--font-ui, system-ui); color: #a99f8e; padding: 8px 6px; border-bottom: 1px solid rgba(197, 164, 105, .2); }
.mk2 td { padding: 10px 6px; border-bottom: 1px solid rgba(197, 164, 105, .1); font-variant-numeric: tabular-nums; }
.mk2 td.mk2-name { text-transform: capitalize; font-weight: 600; }
.mk2 .mk2-badge { display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 99px; font-size: 11px; background: rgba(197, 164, 105, .14); color: #e9cf95; }
.mk2 .mk2-badge.agent { background: rgba(176, 108, 255, .16); color: #d6b6ff; }
.mk2 button.mk2-act { min-height: 40px; padding: 8px 16px; border-radius: 10px; border: 0; background: var(--mk2-gold); color: #171006; font: 750 13px var(--font-ui, system-ui); cursor: pointer; transition: background 160ms ease, transform 160ms ease; }
.mk2 button.mk2-act:hover:not([disabled]) { background: #d9b874; transform: translateY(-1px); }
.mk2 button.mk2-ghost { background: transparent; color: var(--ftf-text, #eef0ea); border-color: var(--ftf-border, rgba(197,164,105,.4)); }
.mk2 button[disabled] { opacity: .5; cursor: default; }
.mk2 button:focus-visible, .mk2 input:focus-visible, .mk2 summary:focus-visible { outline: 2px solid #e5bf72; outline-offset: 3px; }
.mk2-sell-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(270px, 340px); gap: 18px; align-items: stretch; }
.mk2-form { display: grid; gap: 18px; min-width: 0; padding: 20px; border-radius: 14px; background: rgba(5, 13, 11, .42); }
.mk2-selected { display: flex; align-items: center; gap: 12px; min-height: 56px; padding-bottom: 16px; border-bottom: 1px solid rgba(197, 164, 105, .14); }
.mk2-selected-copy { display: grid; gap: 3px; min-width: 0; }
.mk2-selected-name { color: #f4efe5; font-weight: 700; font-size: 16px; text-transform: capitalize; }
.mk2-field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.mk2-form label { display: grid; align-content: start; gap: 7px; color: #bdc8c1; font-size: 12px; font-weight: 650; }
.mk2-form input { box-sizing: border-box; width: 100%; min-height: 46px; padding: 9px 12px; border-radius: 10px; border: 1px solid rgba(197,164,105,.32); background: #09110f; color: #fff8e8; font: 650 16px var(--font-ui, system-ui); font-variant-numeric: tabular-nums; caret-color: #e5bf72; }
.mk2-form input:hover { border-color: rgba(218,181,110,.55); }
.mk2-receipt { display: flex; flex-direction: column; min-width: 0; padding: 20px; border-radius: 14px; background: rgba(197, 164, 105, .085); }
.mk2-receipt-label { margin: 0 0 6px; color: #aebbb4; font-size: 12px; }
.mk2-receipt-value { margin: 0 0 18px; color: #f1d69f; font: 700 22px/1.25 var(--font-title, Georgia, serif); font-variant-numeric: tabular-nums; }
.mk2-receipt .mk2-act { width: 100%; min-height: 46px; margin-top: auto; }
.mk2-receipt .mk2-state { margin-bottom: 0; }
.mk2-note { font-size: 12px; color: var(--ftf-muted, #aab6b0); }
.mk2-state { min-height: 20px; margin-top: 8px; font-size: 13px; }
.mk2-state.err { color: #ff8a7a; } .mk2-state a { color: var(--ftf-ok, #5ccf8a); }
.mk2-confirm { margin-top: 10px; padding: 12px; border-radius: 10px; border: 1px solid rgba(197, 164, 105, .35); background: rgba(197, 164, 105, .06); display: grid; gap: 8px; }
.mk2-empty { padding: 48px 20px; text-align: center; color: var(--ftf-muted, #aab6b0); }
.mk2-empty b { display: block; color: var(--ftf-text, #eef0ea); margin-bottom: 4px; }
.mk2-game { display: grid; gap: 10px; max-width: 560px; }
.mk2-game .mk2-items button { text-transform: none; }
.mk2-roll { font: 700 44px/1 var(--font-title, Georgia, serif); color: var(--ftf-gold-bright, #dcc08a); min-height: 48px; }
.mk2-win { color: var(--ftf-ok, #5ccf8a); font-weight: 700; } .mk2-lose { color: #ff8a7a; font-weight: 700; }
.mk2-modal { padding: 16px; border-radius: 12px; border: 1px solid rgba(197, 164, 105, .45); background: var(--ftf-panel-solid, #101f1a); display: grid; gap: 10px; max-width: 480px; }
@media (max-width: 760px) { .mk2-wrap { padding: 0; } .mk2 { width: 100%; height: 100dvh; max-height: none; border-radius: 0; border: 0; } .mk2-head { padding-inline: 16px; } .mk2-silk { max-width: 38vw; overflow: hidden; text-overflow: ellipsis; } .mk2-tabs { gap: 0; justify-content: space-between; padding-inline: 16px; overflow-x: auto; } .mk2-tabs button { min-width: max-content; padding-inline: 10px; } .mk2-chip { margin-inline: 16px; } .mk2-body { padding: 14px 16px 24px; } .mk2-sell-layout { grid-template-columns: 1fr; } .mk2-receipt { min-height: 180px; } .mk2 th:nth-child(6), .mk2 td:nth-child(6) { display: none; } }
@media (max-width: 460px) { .mk2-head h3 { font-size: 19px; } .mk2-silk { padding-inline: 9px; font-size: 12px; } .mk2-field-grid { grid-template-columns: 1fr; } .mk2-items { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } .mk2-items button { width: 100%; } }
/* the one column never grows past the screen (mobile audit 14.11: at 360 px the old panel pushed its × and the Games tab off) */
@media (max-width: 760px) { .mk2-wrap { grid-template-columns: minmax(0, 1fr); } .mk2 { min-width: 0; } }
@media (prefers-reduced-motion: reduce) { .mk2 * { transition: none !important; } }
`;

const age = (t, ms) => (ms < 3_600_000 ? t('p2p.age.min', { n: Math.max(1, Math.round(ms / 60_000)) }) : t('p2p.age.h', { n: Math.round(ms / 3_600_000) }));

/**
 * @param {{t: Function, client: object, doc?: Document, now?: () => number, explorer?: string}} o
 * @returns {{open(tab?: string): void, close(): void, readonly isOpen: boolean}}
 */
export function createMarketUi({ t, client, dice = null, storage = null, doc = globalThis.document, now = () => Date.now(), explorer = EXPLORER }) {
  if (!(doc.getElementById && doc.getElementById('mk2-style'))) { const s = doc.createElement('style'); s.id = 'mk2-style'; s.textContent = CSS; doc.head.append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (label, fn, cls = 'mk2-act') => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const name = (id) => t('res.' + id);
  const silk = (c) => t('p2p.silk', { n: formatSilkC(c) });
  const errText = (r) => t('p2p.err.' + (['outside_band', 'not_enough_items', 'not_enough_silk', 'listing_gone', 'limit_listings', 'daily_cap', 'self_trade', 'paused', 'rate_limited', 'network', 'need_guest', 'too_small', 'not_configured', 'market_not_live'].includes(r.error) ? r.error : 'other'),
    { min: formatSilkC(r.minC || 0), max: formatSilkC(r.maxC || 0), need: formatSilkC(r.needC || 0), have: formatSilkC(r.haveC || 0), qty: r.have ?? '' });
  let paintSilk = () => {}; // the header balance, repainted on every silk change and every tab switch
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
      try { globalThis.dispatchEvent(new CustomEvent('ftf:feat', { detail: { k: 'trade' } })); } catch { /* the shared town's action feed is optional */ }
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
    const layout = el('div', 'mk2-sell-layout');
    const form = el('div', 'mk2-form');
    const qty = el('input'); qty.type = 'number'; qty.min = '1'; qty.max = String(MARKET.qtyMax); qty.value = '1';
    const price = el('input'); price.type = 'number'; price.step = '0.01'; price.value = String(book.referenceUnitC / 100);
    const lq = el('label', null, t('p2p.qty') + (held != null ? ' · ' + t('p2p.have', { n: held }) : '')); lq.append(qty);
    const lp = el('label', null, t('p2p.price')); lp.append(price, el('span', 'mk2-note', t('p2p.allowed', { min: formatSilkC(band.minC), max: formatSilkC(band.maxC) })));
    const selected = el('div', 'mk2-selected');
    const selectedCopy = el('div', 'mk2-selected-copy');
    selectedCopy.append(el('div', 'mk2-selected-name', name(item)), el('div', 'mk2-note', t('p2p.ref', { x: formatSilkC(book.referenceUnitC) })));
    selected.append(artBox(doc, resIconPath(item), name(item), { size: 46, radius: 12 }), selectedCopy);
    const fields = el('div', 'mk2-field-grid'); fields.append(lq, lp);
    const receipt = el('div', 'mk2-receipt');
    const preview = el('p', 'mk2-receipt-value'); const state = el('p', 'mk2-state');
    const go = btn(t('p2p.list'), async () => {
      go.disabled = true;
      const r = await client.list(item, Math.floor(Number(qty.value)), Math.round(Number(price.value) * 100));
      go.disabled = false;
      state.className = 'mk2-state' + (r.ok ? '' : ' err'); state.textContent = r.ok ? t('p2p.done.listed') : errText(r);
    });
    const render = () => { const total = Math.floor(Number(qty.value) || 0) * Math.round(Number(price.value) * 100); preview.textContent = t('p2p.youGet', { x: formatSilkC(Math.max(0, total - feeOf(total))) }); };
    qty.addEventListener('input', render); price.addEventListener('input', render); render();
    go.disabled = !live; if (!live) go.title = t('p2p.notLive');
    form.append(selected, fields);
    receipt.append(el('p', 'mk2-receipt-label', t('p2p.price')), preview, el('p', 'mk2-note', t('p2p.duration')), go, state);
    layout.append(form, receipt);
    body.replaceChildren(head, layout);
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
      paintSilk(); refreshSilk(false).catch(() => {}); paint();
    }
    const play = el('p', 'mk2-note');
    g.append(el('p', 'mk2-note', t('games.rule')), bets, stakes, summary, go, hint, rollEl, out, fair, counters, play, odds, el('p', 'mk2-note', t('games.footer')));
    body.replaceChildren(g); paint();
  }

  function show(next) {
    tab = next; paintSilk();
    for (const b of root.querySelectorAll('.mk2-tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    Promise.resolve((tab === 'buy' ? buyTab : tab === 'sell' ? sellTab : tab === 'games' ? gamesTab : mineTab)()).catch(() => body.replaceChildren(el('p', 'mk2-state err', t('p2p.err.network'))));
  }
  function open(first = 'buy') {
    if (root) { show(first); return; }
    root = el('div', 'mk2-wrap'); root.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === root) close(); });
    const box = el('div', 'mk2'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', t('p2p.title'));
    const head = el('div', 'mk2-head'); silkEl = el('span', 'mk2-silk');
    const x = btn('', close, 'mk2-x'); x.setAttribute('aria-label', t('p2p.close'));
    head.append(el('h3', null, t('p2p.title')), silkEl, x);
    const tabs = el('div', 'mk2-tabs'); tabs.setAttribute('role', 'tablist');
    for (const k of ['buy', 'sell', 'mine', 'games']) { const b = btn(t(k === 'games' ? 'games.tab' : 'p2p.tab.' + k), () => show(k), ''); b.setAttribute('role', 'tab'); b.dataset.tab = k; tabs.append(b); }
    chip = el('div', 'mk2-chip'); chip.hidden = true; body = el('div', 'mk2-body');
    box.append(head, tabs, chip, body); root.append(box); doc.body.append(root);
    // the header shows the balance this tab spends: play silk in Games (the dice change it on every roll; owner 14.11 saw the
    // chain balance stand still while the rolls won and lost), the silk on NEAR elsewhere. One source: the shared silk view.
    paintSilk = () => { if (!silkEl) return; const v = silkView(), games = tab === 'games';
      silkEl.textContent = games ? t('games.play', { n: formatSilkC(v.playC) }) : v.chainOk ? silk(v.gateC) : '';
      silkEl.title = games ? t('silk.tip.play', { n: formatSilkC(v.playC) }) : t('silk.tip.gate', { n: formatSilkC(v.gateC) }); };
    unSilk = subscribeSilk(paintSilk); paintSilk();
    root.addEventListener('keydown', (e) => { e.stopPropagation(); onKey(e); }); // focus stays inside the window (the close button first)
    show(first); x.focus && x.focus();
  }
  function close() { if (!root) return; root.remove(); root = null; if (unSilk) unSilk(); }
  return { open, close, get isOpen() { return !!root; } };
}
