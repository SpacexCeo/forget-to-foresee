// "On NEAR testnet", the first block of the menu's Profile tab (lead 14.11: the judge must see the chain in minutes):
// the game account with its explorer link and whether a login is linked to it, the transactions this browser made
// (net/receipts.js; the guest mint from the Day-1 record too), and the live contracts. Reads local records and the
// deployment files only: no chain call of its own.
import { loadReceipts, txLink } from '../net/receipts.js';
import { DAY1_DEPLOYMENT } from '../net/day1-deployment.js';
import { NEAR_DEPLOYMENT } from '../net/near-deployment.js';
import { DAY1_KEY } from './day1-mint.js';

export const LINKED_KEY = 'ftf.acct.linked.v1';
const SHOW = 6;

const CSS = `
.gm-chain { margin: 0 0 14px; padding: 12px 14px; border-radius: 16px; border: 1px solid rgba(233, 180, 76, .45); background: linear-gradient(160deg, rgba(233,180,76,.08), rgba(11,16,15,.6)); }
.gm-chain h3 { margin: 0 0 2px; display: flex; align-items: center; gap: 8px; font: 700 15px/1.2 system-ui; color: #e9b44c; letter-spacing: .02em; }
.gm-chain h3 i { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: #e9b44c; color: #14201c; font: 700 12px/1 system-ui; font-style: normal; }
.gm-chain .gm-note { margin: 2px 0 8px; }
.gm-chain a { color: #e9b44c; text-decoration: none; } .gm-chain a:hover, .gm-chain a:focus-visible { text-decoration: underline; }
.gm-chain-acc { display: grid; gap: 2px; padding: 8px 10px; margin-bottom: 8px; border-radius: 10px; background: rgba(0,0,0,.25); }
.gm-chain-acc code { font: 13px ui-monospace, monospace; color: #9fd4cf; word-break: break-all; }
.gm-chain-acc small { color: rgba(233,230,220,.7); } .gm-chain-acc small.gm-on { color: #7fd18b; }
.gm-chain ul { list-style: none; margin: 0 0 6px; padding: 0; display: grid; gap: 4px; }
.gm-chain li { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: baseline; font-size: 13px; }
.gm-chain li code { font: 12px ui-monospace, monospace; color: rgba(233,230,220,.6); margin-left: 6px; }
.gm-chain-ct { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; }
`;

const rel = (at, now) => { const s = Math.max(0, Math.round((now - at) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
const read = (storage, key) => { try { return JSON.parse((storage && storage.getItem(key)) || 'null'); } catch { return null; } };

/** The block's data: {account, accountUrl, linked, receipts: [{kind, hash, url, at}], contracts: [{id, url}]}. Pure but for storage. */
export function chainModel(storage) {
  const explorer = String(NEAR_DEPLOYMENT.explorer || 'https://testnet.nearblocks.io').replace(/\/$/, '');
  const day1 = read(storage, DAY1_KEY) || {};
  const account = (day1.guest && day1.guest.account_id) || null;
  const receipts = loadReceipts(storage);
  if (day1.txHash && !receipts.some((r) => r.hash === day1.txHash) && /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(day1.txHash)) receipts.push({ kind: 'guest', hash: day1.txHash, url: txLink(day1.txHash), at: day1.at || null });
  const ids = [DAY1_DEPLOYMENT.guests, DAY1_DEPLOYMENT.heroine, DAY1_DEPLOYMENT.chests, DAY1_DEPLOYMENT.skins, DAY1_DEPLOYMENT.town, DAY1_DEPLOYMENT.companions, NEAR_DEPLOYMENT.contractId].filter(Boolean);
  return {
    account, accountUrl: account ? `${explorer}/address/${account}` : null,
    linked: read(storage, LINKED_KEY),
    receipts,
    contracts: [...new Set(ids)].map((id) => ({ id, url: `${explorer}/address/${id}` })),
  };
}

/** The block for the menu. */
export function chainSection({ doc, t, storage, now = Date.now() }) {
  if (!(doc.getElementById && doc.getElementById('gm-chain-style'))) { const st = doc.createElement('style'); st.id = 'gm-chain-style'; st.textContent = CSS; doc.head.append(st); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const link = (text, href, cls) => { const a = el('a', cls || null, text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
  const m = chainModel(storage);
  const sec = el('section', 'gm-chain'); sec.setAttribute('aria-label', t('chain.title'));
  const h = el('h3'); h.append(el('i', null, 'Ⓝ'), doc.createTextNode(t('chain.title'))); sec.append(h, el('p', 'gm-note', t('chain.note')));
  const acc = el('div', 'gm-chain-acc'); acc.append(el('small', null, t('chain.account')));
  if (m.account) {
    const c = el('code'); c.append(link(m.account, m.accountUrl)); acc.append(c);
    acc.append(m.linked ? el('small', 'gm-on', '✓ ' + t('chain.linked', { when: new Date(m.linked.at || now).toLocaleDateString() })) : el('small', null, t('chain.guestOnly')));
  } else acc.append(el('small', null, t('chain.noAccount')));
  sec.append(acc);
  if (m.receipts.length) {
    const ul = el('ul');
    for (const r of m.receipts.slice(0, SHOW)) {
      const li = el('li'); const what = el('span', null, t('chain.kind.' + r.kind));
      what.append(el('code', null, r.hash.slice(0, 8) + '…' + (r.at ? ' · ' + rel(r.at, now) : '')));
      li.append(what, link(t('chain.view'), r.url)); ul.append(li);
    }
    sec.append(ul);
  } else sec.append(el('p', 'gm-note', t('chain.none')));
  const ct = el('div', 'gm-chain-ct'); ct.append(el('small', null, t('chain.contracts') + ':'));
  for (const c of m.contracts) ct.append(link(c.id, c.url));
  sec.append(ct);
  return sec;
}
