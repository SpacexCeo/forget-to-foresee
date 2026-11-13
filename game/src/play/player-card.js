// The other-player card (owner, 13.11, Social track): tap or click another player in town and see what everyone
// sees of them: name, heroine, level, their silk as the one silk number, their NFTs read from NEAR testnet for
// their account, and three actions: Profile (read-only), Trade, Add friend. Real players trade through the market
// (both sides confirm, every price shown first, settled on NEAR testnet). The demo player is a scripted townsperson:
// its card says so plainly, and its trades are practice trades kept on this device, never presented as on chain.
// Phone: opens on tap only, closes on a tap outside or Esc; nothing pops up by itself.
import { formatSilkC } from '../net/silk-core.js';
import { createFriends } from './friends.js';

export const PRACTICE_KEY = 'ftf.practice.trades.v1';
const HERO_LABEL = { iris: 'Iris', elise: 'Elise', sheriffchenko: 'Sheriffchenko' };
/** What the demo player offers in a practice trade, at the stall's reference price (cents per unit). */
export const DEMO_OFFER = Object.freeze({ item: 'spider_silk_thread', unitC: 300, max: 5 });

const CSS = `
.pc-wrap { position: fixed; inset: 0; z-index: 74; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .35); }
.pc { width: min(420px, 100%); max-height: calc(100vh - 32px); overflow: auto; background: #141a1c; color: #f3ead6; border: 1px solid rgba(233, 180, 76, .45); border-radius: 14px; padding: 16px; font: 14px/1.45 system-ui, sans-serif; display: grid; gap: 10px; }
.pc-head { display: flex; align-items: center; gap: 12px; }
.pc-head img { width: 56px; height: 84px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(233, 180, 76, .4); }
.pc-head h3 { margin: 0; font: 700 20px/1.2 Georgia, serif; color: #f6d892; }
.pc-sub { color: #cdbfa5; font-size: 13px; }
.pc-demo { padding: 8px 10px; border-radius: 8px; background: rgba(176, 108, 255, .14); color: #e2ccff; font-size: 13px; }
.pc-row { display: flex; justify-content: space-between; gap: 8px; }
.pc-row b { color: #f6d892; font-variant-numeric: tabular-nums; }
.pc-nfts { display: grid; gap: 4px; font-size: 13px; } .pc-nfts a { color: #8fe0b0; }
.pc-note { font-size: 12px; color: #b9ad97; }
.pc-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.pc button { min-height: 40px; padding: 8px 14px; border-radius: 9px; border: 1px solid #8c6a2a; background: #d6a64c; color: #1b1406; font: 700 14px system-ui; cursor: pointer; }
.pc button.pc-ghost { background: transparent; color: #f3ead6; border-color: #5b5240; }
.pc button[disabled] { opacity: .5; cursor: default; }
.pc-box { border-top: 1px solid rgba(233, 180, 76, .2); padding-top: 10px; display: grid; gap: 8px; }
.pc-box input { width: 70px; padding: 6px; border-radius: 8px; border: 1px solid #5b5240; background: #0b0e10; color: #fff; font: 15px system-ui; }
.pc-ok { color: #8fe0b0; } .pc-err { color: #ff8a7a; }
@media (max-width: 480px) { .pc-wrap { place-items: end center; padding: 0; } .pc { border-radius: 14px 14px 0 0; width: 100%; } }
`;

/**
 * The public facts of an account from NEAR testnet: {silkC, nfts: [{title, href}]} | {offline: true}.
 * Lazily loads the readers (they live in net/).
 */
export async function readPublic(account) {
  try {
    const [{ createTxClient }, { readLootNfts }, { NEAR_DEPLOYMENT }, { DAY1_DEPLOYMENT }] = await Promise.all([import('../net/near-tx.js'), import('../net/chest-client.js'), import('../net/near-deployment.js'), import('../net/day1-deployment.js')]);
    const client = createTxClient({ rpcUrls: NEAR_DEPLOYMENT.rpcUrls, timeoutMs: 10000 });
    const [row, loot] = await Promise.all([client.view(DAY1_DEPLOYMENT.town || 'ftf-town.testnet', 'balance_of', { account_id: account }).catch(() => null), readLootNfts({ owner: account })]);
    if (loot.state === 'offline' && row == null) return { offline: true };
    return { silkC: row ? Math.floor(Number(BigInt(row.silk) / 10_000n)) : 0, nfts: loot.state === 'loaded' ? loot.items.map((i) => ({ title: i.title, href: i.href })) : [] };
  } catch { return { offline: true }; }
}

/**
 * @param {{t: Function, storage: object, me?: string|null, doc?: Document, read?: Function, base?: string, openMarket?: Function, now?: () => number, setTimer?: Function}} o
 * @returns {{open(rec: object): void, close(): void, readonly isOpen: boolean, friends: object}}
 */
export function createPlayerCard({ t, storage, me = null, doc = globalThis.document, read = readPublic, base = '/', openMarket = null, now = () => Date.now(), setTimer = setTimeout }) {
  if (!(doc.getElementById && doc.getElementById('pc-style'))) { const s = doc.createElement('style'); s.id = 'pc-style'; s.textContent = CSS; doc.head.append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (label, fn, cls = '') => { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const friends = createFriends({ storage, me, now });
  let root = null;
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };

  function open(rec) {
    close();
    if (!rec || !rec.name) return;
    root = el('div', 'pc-wrap');
    root.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === root) close(); }); // a tap outside closes it
    root.addEventListener('keydown', onKey);
    const card = el('div', 'pc'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', rec.name);
    const head = el('div', 'pc-head');
    const img = el('img'); img.alt = ''; img.src = base + 'assets/cards/' + (rec.skin || 'iris') + '.webp'; if (img.addEventListener) img.addEventListener('error', () => img.remove());
    const names = el('div'); names.append(el('h3', null, rec.name), el('div', 'pc-sub', t('pc.heroine', { name: HERO_LABEL[rec.skin] || HERO_LABEL.iris })));
    head.append(img, names);
    card.append(head);
    if (rec.demo) card.append(el('p', 'pc-demo', t('pc.demo')));
    const facts = el('div');
    const level = el('div', 'pc-row'); level.append(el('span', null, t('pc.levelLabel')), el('b', null, rec.lv != null ? String(rec.lv) : t('pc.notShared')));
    const silk = el('div', 'pc-row'); silk.append(el('span', null, rec.demo ? t('pc.practiceSilk') : t('pc.silkLabel')), el('b', null, rec.demo ? formatSilkC(rec.silkC || 0) : '…'));
    const nfts = el('div', 'pc-nfts'); nfts.append(el('span', 'pc-note', rec.demo ? t('pc.demoNfts') : rec.account ? t('pc.loading') : t('pc.noAccount')));
    facts.append(level, silk, el('div', 'pc-sub', t('pc.nfts')), nfts);
    card.append(facts);
    const panel = el('div', 'pc-box'); panel.hidden = true;
    const fBtn = btn('', () => { if (friends.has(rec)) { friends.remove(rec); say(t('pc.friendRemoved')); } else { friends.add(rec); say(t('pc.friendAdded')); } paintFriend(); }, 'pc-ghost');
    const paintFriend = () => { fBtn.textContent = friends.has(rec) ? t('pc.removeFriend') : t('pc.addFriend'); };
    const msg = el('p', 'pc-note');
    const say = (text, cls = 'pc-note') => { msg.className = cls; msg.textContent = text; };
    const actions = el('div', 'pc-btns');
    actions.append(btn(t('pc.profile'), () => showProfile()), btn(t('pc.trade'), () => showTrade()), fBtn);
    paintFriend();
    card.append(actions, msg, panel, el('p', 'pc-note', t('pc.friendsNote')));
    const x = btn(t('pc.close'), close, 'pc-ghost'); card.append(x);
    root.append(card); doc.body.append(root); if (x.focus) x.focus();

    // the public facts from NEAR testnet (real players with an account)
    let pub = null;
    if (!rec.demo && rec.account) {
      read(rec.account).then((r) => {
        pub = r; if (!root) return;
        silk.lastChild.textContent = r.offline ? t('pc.offline') : formatSilkC(r.silkC);
        nfts.replaceChildren(...(r.offline ? [el('span', 'pc-note', t('pc.offline'))] : !r.nfts.length ? [el('span', 'pc-note', t('pc.noNfts'))] : r.nfts.slice(0, 8).map((n) => { const a = el('a', null, n.title); a.href = n.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; })));
      }).catch(() => { if (root) silk.lastChild.textContent = t('pc.offline'); });
    } else if (!rec.demo) silk.lastChild.textContent = t('pc.notShared');

    function showProfile() {
      panel.hidden = false;
      const rows = [[t('pc.nameLabel'), rec.name], [t('pc.heroineLabel'), HERO_LABEL[rec.skin] || HERO_LABEL.iris], [t('pc.levelLabel'), rec.lv != null ? String(rec.lv) : t('pc.notShared')],
        [t('pc.accountLabel'), rec.demo ? t('pc.demoAccount') : rec.account || t('pc.notShared')], [t('pc.friendLabel'), friends.has(rec) ? t('pc.yes') : t('pc.no')]];
      panel.replaceChildren(el('b', null, t('pc.profileTitle')), ...rows.map(([k, v]) => { const r = el('div', 'pc-row'); r.append(el('span', null, k), el('b', null, v)); return r; }));
      if (pub && pub.nfts && pub.nfts.length) panel.append(el('span', 'pc-note', t('pc.nftCount', { n: pub.nfts.length })));
    }
    function showTrade() {
      panel.hidden = false;
      if (!rec.demo) { // a real player: the market, where both sides confirm and every price is shown first
        panel.replaceChildren(el('p', null, t('pc.tradeReal')), btn(t('pc.openMarket'), () => { close(); if (openMarket) openMarket(); }));
        return;
      }
      // the demo player: a practice trade on this device (scripted acceptance), never on chain
      let qty = 1;
      const q = el('input'); q.type = 'number'; q.min = '1'; q.max = String(DEMO_OFFER.max); q.value = '1'; q.setAttribute('aria-label', t('pc.qty'));
      const price = el('p');
      const paint = () => { price.textContent = t('pc.tradePrice', { qty, item: t('res.' + DEMO_OFFER.item), silk: formatSilkC(qty * DEMO_OFFER.unitC), unit: formatSilkC(DEMO_OFFER.unitC) }); };
      q.addEventListener('input', () => { qty = Math.max(1, Math.min(DEMO_OFFER.max, Math.floor(Number(q.value) || 1))); paint(); });
      const state = el('p', 'pc-note');
      const go = btn(t('pc.confirmTrade'), () => {
        go.disabled = true; state.className = 'pc-note'; state.textContent = t('pc.waiting', { name: rec.name });
        setTimer(() => {
          const rec2 = { at: now(), with: rec.name, give: { silkC: qty * DEMO_OFFER.unitC }, get: { item: DEMO_OFFER.item, qty }, practice: true };
          try { const l = JSON.parse(storage.getItem(PRACTICE_KEY) || '[]'); l.push(rec2); storage.setItem(PRACTICE_KEY, JSON.stringify(l.slice(-50))); } catch { /* memory only */ }
          if (!root) return; state.className = 'pc-ok'; state.textContent = t('pc.accepted', { name: rec.name }); go.disabled = false;
        }, 1200);
      });
      const lq = el('label', 'pc-note', t('pc.qty') + ' '); lq.append(q);
      panel.replaceChildren(el('b', null, t('pc.practiceTitle')), el('p', 'pc-note', t('pc.practiceNote')), lq, price, go, state);
      paint();
    }
  }
  function close() { if (!root) return; root.remove(); root = null; }
  return { open, close, get isOpen() { return !!root; }, friends };
}
