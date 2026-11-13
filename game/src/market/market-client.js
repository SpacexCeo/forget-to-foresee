// The player market, the browser side (docs/market.md): reads the book and the player's listings, and signs list,
// buy and cancel with the Day 1 guest key ("ftf-market|<account>|<action>|<args>|<at>"), the same pattern as the
// portal and the town moves. Every failure resolves to {ok: false, error} with the relayer's code; nothing is invented.
import { b58encode, importSecretKey } from '../net/near-tx.js';
import { guestFrom } from '../net/agent-ledger.js';
import { relayerUrl } from '../net/tee-agent.js';

export const marketMessage = (account, action, args, at) => `ftf-market|${account}|${action}|${args.join(',')}|${at}`;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/** @param {{storage: object, base?: string, fetch?: Function, now?: () => number, rand?: () => number}} o */
export function createMarketClient({ storage, base = relayerUrl(), fetch = globalThis.fetch, now = () => Date.now(), rand = Math.random } = {}) {
  const url = (p) => String(base || '').replace(/\/$/, '') + '/api/market/p2p/' + p;
  async function get(p) {
    if (!base) return { ok: false, error: 'not_configured' };
    try { const r = await withTimeout(fetch(url(p)), 15000); const b = await r.json().catch(() => ({})); return r.ok ? { ok: true, ...b } : { ok: false, error: b.error || 'network' }; } catch { return { ok: false, error: 'network' }; }
  }
  async function post(action, fields, body) {
    const g = guestFrom(storage);
    if (!g) return { ok: false, error: 'need_guest' };
    if (!base) return { ok: false, error: 'not_configured' };
    try {
      const key = await importSecretKey(g.secretKey);
      const at = now();
      const signature = b58encode(await key.sign(new TextEncoder().encode(marketMessage(g.accountId, action, fields.map((f) => body[f]), at))));
      const r = await withTimeout(fetch(url(action), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, account_id: g.accountId, public_key: key.publicKey, at, signature }) }), 60000);
      const b = await r.json().catch(() => ({}));
      return r.ok ? { ok: true, ...b } : { ok: false, ...b, error: b.error || 'network' };
    } catch { return { ok: false, error: 'network' }; }
  }
  return {
    account: () => (guestFrom(storage) || {}).accountId || null,
    book: (item) => get('book?item=' + encodeURIComponent(item)),
    mine: () => { const a = (guestFrom(storage) || {}).accountId; return a ? get('mine?account_id=' + encodeURIComponent(a)) : Promise.resolve({ ok: false, error: 'need_guest' }); },
    stats: () => get('stats'),
    list: (item, qty, unitC) => post('list', ['item', 'qty', 'unit_price_c'], { item, qty, unit_price_c: unitC }),
    buy: (listingId, qty) => post('buy', ['listing_id', 'qty', 'request_id'], { listing_id: listingId, qty, request_id: 'm' + now().toString(36) + Math.floor(rand() * 1e9).toString(36) }),
    cancel: (listingId) => post('cancel', ['listing_id'], { listing_id: listingId }),
  };
}
