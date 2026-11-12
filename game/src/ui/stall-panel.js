// The stall panel for monster resources (net/stall-client.js; docs/town-items.md). Opened from a stall keeper's card
// (window 'ftf:stall-open' {npc}). Per resource: the live buy and buy-back price with the trader's reason, a quantity,
// Buy and Sell. States: quote -> signing -> settling -> done | error. Honest labels: NEAR testnet, scripted traders;
// while the relayer's desk is in dry run the buttons stay off and say why (nothing would be minted or paid back).
import { stallItems, silkText, canTrade, MAX_QTY } from '../net/stall-client.js';

const CSS = `
.sp-wrap { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .45); }
.sp { width: min(520px, 100%); max-height: calc(100vh - 32px); overflow: auto; background: #141a1c; color: #f3ead6; border: 1px solid rgba(233, 180, 76, .45); border-radius: 14px; padding: 18px; font: 14px/1.4 system-ui, sans-serif; box-shadow: 0 16px 40px rgba(0, 0, 0, .5); }
.sp h3 { margin: 0 0 4px; font: 700 19px/1.2 Georgia, serif; color: #f6d892; }
.sp .sp-tags { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }
.sp .sp-tags span { padding: 2px 8px; border-radius: 99px; font-size: 11px; background: rgba(233, 180, 76, .14); color: #e9cf95; }
.sp .sp-tags span.dry { background: #4a3410; color: #ffd98a; }
.sp .sp-row { border-top: 1px solid rgba(233, 180, 76, .2); padding: 10px 0; }
.sp .sp-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.sp .sp-name { font-weight: 700; text-transform: capitalize; }
.sp .sp-price { font-variant-numeric: tabular-nums; color: #f6d892; white-space: nowrap; }
.sp .sp-why { font-size: 12px; color: #b9ad97; margin: 2px 0 6px; }
.sp .sp-ctl { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.sp input[type=number] { width: 64px; padding: 6px; border-radius: 8px; border: 1px solid #5b5240; background: #0b0e10; color: #fff; font: 14px system-ui; }
.sp button { min-height: 34px; padding: 6px 12px; border-radius: 8px; border: 1px solid #8c6a2a; background: #d6a64c; color: #1b1406; font: 700 13px system-ui; cursor: pointer; }
.sp button.ghost { background: transparent; color: #f3ead6; border-color: #5b5240; }
.sp button[disabled] { opacity: .5; cursor: default; }
.sp .sp-state { min-height: 18px; font-size: 13px; margin-top: 6px; }
.sp .sp-state a { color: #8fe0b0; }
.sp .sp-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 10px; font-size: 12px; color: #a99f8e; }
@media (max-width: 420px) { .sp { padding: 14px 12px; font-size: 13px; } .sp h3 { font-size: 17px; } }
`;

/**
 * @param {{t: Function, client: object, doc?: Document}} o
 * @returns {{open(npc: string): void, close(): void, readonly isOpen: boolean}}
 */
export function createStallPanel({ t, client, doc = globalThis.document }) {
  if (!doc.getElementById('sp-style')) { const s = doc.createElement('style'); s.id = 'sp-style'; s.textContent = CSS; doc.head.append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let root = null, npc = null;
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };

  function row(item) {
    const r = el('div', 'sp-row');
    const head = el('div', 'sp-head'); const name = el('span', 'sp-name', t('res.' + item)); const price = el('span', 'sp-price', '…');
    head.append(name, price);
    const why = el('div', 'sp-why', '');
    const ctl = el('div', 'sp-ctl');
    const qty = el('input'); qty.type = 'number'; qty.min = '1'; qty.max = String(MAX_QTY); qty.value = '1'; qty.setAttribute('aria-label', t('stall.qty'));
    const buy = el('button', null, t('stall.buy')); buy.type = 'button';
    const sell = el('button', 'ghost', t('stall.sell')); sell.type = 'button';
    const state = el('div', 'sp-state'); state.setAttribute('aria-live', 'polite');
    ctl.append(qty, buy, sell); r.append(head, why, ctl, state);
    let quotes = { buy: null, sell: null };
    const n = () => Math.max(1, Math.min(MAX_QTY, Math.floor(Number(qty.value) || 1)));
    async function refresh() {
      const k = n();
      const [b, s] = await Promise.all([client.quote('buy', item, k), client.quote('sell', item, k)]);
      quotes = { buy: b, sell: s };
      price.textContent = t('stall.price', { buy: b.ok ? silkText(b.silk) : '—', sell: s.ok ? silkText(s.silk) : '—', n: k });
      why.textContent = b.reason || s.reason || (b.error ? t('stall.err.' + (b.error === 'not_configured' ? 'closed' : 'offline')) : '');
      const g = client.guest();
      for (const [btn, q] of [[buy, b], [sell, s]]) { const c = canTrade(q, g); btn.disabled = !c.ok; btn.title = c.why ? t('stall.why.' + c.why) : ''; }
      const dry = (b.ok && b.dryRun) || (s.ok && s.dryRun);
      if (dry) state.textContent = t('stall.why.dry_run'); else if (!g) state.textContent = t('stall.why.no_guest'); else if (!state.dataset.keep) state.textContent = '';
      if (root) root.querySelector('.dry').hidden = !dry;
    }
    async function go(side) {
      const q = quotes[side];
      buy.disabled = sell.disabled = true; state.dataset.keep = '1';
      state.textContent = t('stall.quote');
      const res = await client.trade(q, (step) => { state.textContent = t('stall.' + step); });
      state.textContent = '';
      if (res.state === 'done') {
        state.append(doc.createTextNode(t(res.settled ? (side === 'buy' ? 'stall.done.buy' : 'stall.done.sell') : 'stall.done.dry', { n: q.qty, item: t('res.' + item), silk: silkText(q.silk) }) + ' '));
        const link = res.url || res.playerUrl;
        if (link) { const a = el('a', null, t('stall.verified')); a.href = link; a.target = '_blank'; a.rel = 'noopener noreferrer'; state.append(a); }
      } else {
        state.append(doc.createTextNode(t('stall.err.' + (['dry_run', 'no_guest', 'no_deal', 'sign_failed', 'tx_failed', 'offline'].includes(res.error) ? res.error : 'failed')) + ' '));
        if (res.playerUrl) { const a = el('a', null, t('stall.yourTx')); a.href = res.playerUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; state.append(a); }
      }
      await refresh(); delete state.dataset.keep;
    }
    qty.addEventListener('change', refresh);
    buy.addEventListener('click', () => go('buy'));
    sell.addEventListener('click', () => go('sell'));
    refresh();
    return r;
  }

  function open(who) {
    close();
    npc = who;
    const items = stallItems(who);
    if (!items.length) return;
    root = el('div', 'sp-wrap');
    const box = el('div', 'sp'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    const nm = t('folk.name.' + who); const h = el('h3', null, nm === 'folk.name.' + who ? t('stall.open') : t('stall.title', { name: nm })); box.setAttribute('aria-label', h.textContent);
    const tags = el('div', 'sp-tags'); const dry = el('span', 'dry', t('stall.dry')); dry.hidden = true;
    tags.append(el('span', null, t('stall.testnet')), el('span', null, t('stall.scripted')), dry);
    box.append(h, tags, ...items.map(row));
    const foot = el('div', 'sp-foot'); const note = el('span', null, t('stall.note')); const x = el('button', 'ghost', t('quest.close')); x.type = 'button'; x.addEventListener('click', close);
    foot.append(note, x); box.append(foot);
    root.append(box); root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
    doc.body.append(root); doc.addEventListener('keydown', onKey, true);
    setTimeout(() => { try { x.focus(); } catch { /* */ } }, 0);
  }
  function close() { if (!root) return; root.remove(); root = null; npc = null; doc.removeEventListener('keydown', onKey, true); }
  return { open, close, get isOpen() { return !!root; }, get npc() { return npc; } };
}
