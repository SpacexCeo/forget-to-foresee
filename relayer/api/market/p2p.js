// The player market (lib/p2p.js; docs/market.md). Paths:
//   GET  /api/market/p2p/book?item=<id>          -> {listings, referenceUnitC, band: {minC, maxC}, settlement: 'chain', live}
//   GET  /api/market/p2p/mine?account_id=<guest> -> {listings, fills, volumeTodayC, settlement, live}
// Settlement is on NEAR testnet only (no demo mode). `live` is false until town trade_for and items
// coordinator_transfer are deployed and the keys are set; then list and buy answer 503 market_not_live.
//   GET  /api/market/p2p/stats                   -> {today, volumeC, lastTrades, settlement}
//   POST /api/market/p2p/list   {account_id, public_key, at, signature, item, qty, unit_price_c}
//   POST /api/market/p2p/buy    {..., listing_id, qty, request_id}
//   POST /api/market/p2p/cancel {..., listing_id}
// A POST is signed by the guest key over "ftf-market|<account>|<action>|<args joined by ','>|<at>": list
// item,qty,unit_price_c · buy listing_id,qty,request_id · cancel listing_id. 5-minute skew, each signature used once.
import { join } from 'node:path';
import { cors, createBucket, envConfig, clientIp, DEFAULTS } from '../../lib/core.js';
import { createTxClient, importSecretKey } from '../../lib/near-tx.js';
import { createReplayGuard } from '../../lib/chest.js';
import { signatureValid, townGateEnv, queuedClient } from '../../lib/town-gate.js';
import { createP2P, microOf } from '../../lib/p2p.js';
import { TRADABLE } from '../../lib/market-rules.js';
import { resourceById } from '../../lib/resource-desk.js';
import { priceOf } from '../../market/prices.js';
import { marketDaemon, marketEnv } from '../../market/index.js';

const bucket = createBucket({ capacity: 20, refillMs: 60 * 1000 });
const replay = createReplayGuard(15 * 60 * 1000);
const json = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let s = ''; for await (const c of req) { s += c; if (s.length > 4096) return null; }
  try { return JSON.parse(s); } catch { return null; }
}
const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/;
export const marketMessage = (account, action, args, at) => `ftf-market|${account}|${action}|${args.join(',')}|${at}`;
const FIELDS = { list: ['item', 'qty', 'unit_price_c'], buy: ['listing_id', 'qty', 'request_id'], cancel: ['listing_id'] };

/** Shape check of a signed market request. */
export function validateMarket(action, b, now = Date.now()) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'bad_body' };
  if (typeof b.account_id !== 'string' || !ACCOUNT_RE.test(b.account_id)) return { ok: false, error: 'bad_account' };
  if (typeof b.public_key !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(b.public_key)) return { ok: false, error: 'bad_public_key' };
  if (!Number.isSafeInteger(b.at) || Math.abs(now - b.at) > 5 * 60 * 1000) return { ok: false, error: 'stale' };
  if (typeof b.signature !== 'string' || b.signature.length > 100) return { ok: false, error: 'bad_signature' };
  if (action === 'list' && (!TRADABLE.includes(b.item) || !Number.isInteger(b.qty) || !Number.isInteger(b.unit_price_c))) return { ok: false, error: 'bad_args' };
  if ((action === 'buy' || action === 'cancel') && (typeof b.listing_id !== 'string' || !/^lst_[0-9a-f]{8}$/.test(b.listing_id))) return { ok: false, error: 'bad_args' };
  if (action === 'buy' && (!Number.isInteger(b.qty) || typeof b.request_id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(b.request_id))) return { ok: false, error: 'bad_args' };
  return { ok: true, account: b.account_id, publicKey: b.public_key, signature: b.signature, message: marketMessage(b.account_id, action, FIELDS[action].map((f) => b[f]), b.at) };
}

/** The reference unit price in cents: the stall's buy price for one, from the market's state (else the base). */
export const referenceFrom = (st) => (item) => { const r = resourceById(item); if (!r) return 0; const p = priceOf(r, (st && st.stock && st.stock[item]) ?? r.start ?? 0, (st && st.demand && st.demand[item]) || 0).price; return p * 20; };

let shared = null;
function marketFor(env, client, opts) {
  if (opts.p2p) return opts.p2p;
  if (shared) return shared;
  const g = townGateEnv(env), items = env.FTF_ITEMS_CONTRACT || 'items.' + g.town;
  const d = marketDaemon(env);
  const holdings = async (account) => {
    const [row, bal] = await Promise.all([client.view(g.town, 'balance_of', { account_id: account }).catch(() => null), client.view(items, 'mt_batch_balance_of', { account_id: account, token_ids: TRADABLE }).catch(() => null)]);
    return { silkC: row ? Number(BigInt(row.silk) / 10_000n) : 0, items: Object.fromEntries(TRADABLE.map((t, i) => [t, bal ? Number(bal[i]) : 0])) };
  };
  const chain = {
    async transferItems({ from, to, item, qty, requestHash }) {
      return client.call({ key: await importSecretKey(env.FTF_ITEMS_KEY), signerId: env.FTF_ITEMS_MINTER, receiverId: items, methodName: 'coordinator_transfer', args: { from, to, token_id: item, amount: String(qty), request_hash: requestHash }, gas: 30_000_000_000_000n });
    },
    async tradeSilk({ buyer, seller, totalC, feeC, requestHash }) {
      return client.call({ key: await importSecretKey(g.coordKey), signerId: g.coord, receiverId: g.town, methodName: 'trade_for', args: { account_id: buyer, counterparty: seller, silk: microOf(totalC), fee: microOf(feeC), reference: 'p2p', request_hash: requestHash }, gas: 30_000_000_000_000n });
    },
  };
  // live = both keys on this server and both contract methods deployed (read once a minute)
  let liveAt = -Infinity, liveVal = false;
  const live = async () => {
    if (!env.FTF_ITEMS_MINTER || !env.FTF_ITEMS_KEY || !g.coord || !g.coordKey) return false;
    if (Date.now() - liveAt < 60_000) return liveVal;
    liveAt = Date.now();
    try { await client.view(g.town, 'p2p_trades', {}); await client.view(items, 'request_used', { request_hash: '0'.repeat(64) }); liveVal = true; } catch { liveVal = false; }
    return liveVal;
  };
  shared = createP2P({ file: join(marketEnv(env).dataDir, 'p2p-book.json'), refUnitC: (item) => referenceFrom(d && d.state ? d.state() : null)(item), holdings, chain, live });
  return shared;
}

export function p2pHandler(opts = {}) {
  return async function handler(req, res) {
    const env = opts.env || process.env, cfg = envConfig(env);
    if (cors(req, res, cfg.origins)) return;
    const client = opts.client || queuedClient(createTxClient({ rpcUrls: cfg.rpcUrls.length ? cfg.rpcUrls : DEFAULTS.rpcUrls, fetch: opts.fetch || globalThis.fetch, timeoutMs: 30_000 }));
    const m = marketFor(env, client, opts);
    const u = new URL(req.url, 'http://x'), action = u.pathname.replace(/\/$/, '').split('/').pop();
    try {
      if (req.method === 'GET') {
        const live = await m.live().catch(() => false);
        if (action === 'book') { const item = u.searchParams.get('item'); if (!TRADABLE.includes(item)) return json(res, 400, { error: 'not_tradable' }); return json(res, 200, { ...m.book(item), live }); }
        if (action === 'mine') { const a = u.searchParams.get('account_id') || ''; if (!ACCOUNT_RE.test(a)) return json(res, 400, { error: 'bad_account' }); return json(res, 200, { ...(await m.mine(a)), live }); }
        if (action === 'stats') return json(res, 200, m.stats());
        return json(res, 404, { error: 'not_found' });
      }
      if (req.method !== 'POST' || !FIELDS[action]) return json(res, 405, { error: 'method' });
      const lim = (opts.bucket || bucket).take(clientIp(req, env.TRUST_PROXY !== '0'));
      if (!lim.ok) { res.setHeader('Retry-After', String(lim.retryAfterS)); return json(res, 429, { error: 'rate_limited' }); }
      const b = await readBody(req);
      const v = validateMarket(action, b, opts.now ? opts.now() : Date.now());
      if (!v.ok) return json(res, 400, { error: v.error });
      if (!(await signatureValid(v.publicKey, v.signature, v.message))) return json(res, 401, { error: 'bad_signature' });
      try { await client.rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: v.account, public_key: v.publicKey }); } catch { return json(res, 403, { error: 'not_your_key' }); }
      if (!(opts.replay || replay).use(v.signature)) return json(res, 409, { error: 'replayed' });
      const r = action === 'list' ? await m.list({ account: v.account, item: b.item, qty: b.qty, unitC: b.unit_price_c })
        : action === 'buy' ? await m.buy({ account: v.account, listingId: b.listing_id, qty: b.qty, requestId: b.request_id })
          : await m.cancel({ account: v.account, listingId: b.listing_id });
      return json(res, r.status, r.body);
    } catch (e) { return json(res, 502, { error: 'network', message: String((e && e.message) || e).slice(0, 120) }); }
  };
}
export default p2pHandler();
