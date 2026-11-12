// The resource desk (lib/resource-desk.js; docs/town-items.md):
//   GET  /api/market/resource?side=buy|sell&item=<id>&qty=<n>  -> the quote {silk, unit, reason, stall, reference}
//   POST /api/market/resource {side, item, qty, account_id, tx_hash} -> settles a player's on-chain payment (buy) or
//        item transfer (sell): the stall mints the items or pays the silk. Dry run unless FTF_TOWN_SEND=1.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cors, createBucket, envConfig, clientIp, DEFAULTS } from '../../lib/core.js';
import { createTxClient, importSecretKey } from '../../lib/near-tx.js';
import { townEnv } from '../../lib/town-traders.js';
import { createHashJournal, quote, settle, stallOf, resourceById } from '../../lib/resource-desk.js';
import { marketDaemon, marketEnv, loadTraderKeys } from '../../market/index.js';

const bucket = createBucket({ capacity: 10, refillMs: 60 * 1000 });
const json = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let s = ''; for await (const c of req) { s += c; if (s.length > 2048) return null; }
  try { return JSON.parse(s); } catch { return null; }
}
let journal = null;
function loadJournal(file) {
  if (journal) return journal;
  let hashes = [];
  try { hashes = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.settled || e.dry_run).map((e) => e.hash); } catch { /* a fresh desk */ }
  journal = createHashJournal(hashes);
  return journal;
}

export function resourceHandler(opts = {}) {
  return async function handler(req, res) {
    const env = opts.env || process.env, cfg = envConfig(env), mcfg = marketEnv(env), town = townEnv(env);
    if (cors(req, res, cfg.origins)) return;
    const items = env.FTF_ITEMS_CONTRACT || 'items.' + town.contract;
    const d = opts.daemon !== undefined ? opts.daemon : marketDaemon(env);
    const st = d && d.state ? d.state() : null;
    if (req.method === 'GET') {
      const u = new URL(req.url, 'http://x');
      const side = u.searchParams.get('side') === 'sell' ? 'sell' : 'buy', item = u.searchParams.get('item'), qty = Number(u.searchParams.get('qty') || 1);
      const q = quote(st, item, qty, side);
      if (!q) return json(res, 400, { error: 'bad_request' });
      return json(res, 200, { ...q, stall: stallOf(resourceById(item), town.contract), town: town.contract, items, reference: side === 'buy' ? `buy:${item}:${qty}` : null, dry_run: !town.send });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    const lim = (opts.bucket || bucket).take(clientIp(req, env.TRUST_PROXY !== '0'));
    if (!lim.ok) { res.setHeader('Retry-After', String(lim.retryAfterS)); return json(res, 429, { error: 'rate_limited' }); }
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: 'bad_request' });
    const file = join(mcfg.dataDir, 'resource-desk.jsonl');
    const client = opts.client || createTxClient({ rpcUrls: cfg.rpcUrls.length ? cfg.rpcUrls : DEFAULTS.rpcUrls, fetch: opts.fetch || globalThis.fetch, timeoutMs: 30_000 });
    const traders = loadTraderKeys(mcfg.keysFile);
    const deps = {
      client, st, town: town.contract, items, send: town.send, journal: opts.journal || loadJournal(file),
      async mint({ account, item, qty }) {
        if (!env.FTF_ITEMS_MINTER || !env.FTF_ITEMS_KEY) return { ok: false, failure: 'no minter key on this server' };
        return client.call({ key: await importSecretKey(env.FTF_ITEMS_KEY), signerId: env.FTF_ITEMS_MINTER, receiverId: items, methodName: 'mint', args: { account_id: account, token_id: item, amount: String(qty), memo: 'bought at the town stalls' }, gas: 30_000_000_000_000n });
      },
      async pay({ stall, account, silk, item }) {
        const w = traders.find((t) => t.account === stall);
        if (!w) return { ok: false, failure: 'no key for the stall' };
        return client.call({ key: await importSecretKey(w.secretKey), signerId: stall, receiverId: town.contract, methodName: 'trade', args: { counterparty: account, silk: String(silk), reference: `sell:${item}` }, gas: 10_000_000_000_000n });
      },
    };
    const out = await settle({ side: body.side, item: body.item, qty: body.qty, account: body.account_id, hash: body.tx_hash }, deps);
    try { mkdirSync(mcfg.dataDir, { recursive: true }); appendFileSync(file, JSON.stringify({ at: Date.now(), hash: body.tx_hash, account: body.account_id, ...out }) + '\n'); } catch { /* disk */ }
    const { status, ...rest } = out;
    return json(res, status, rest);
  };
}
export default resourceHandler();
