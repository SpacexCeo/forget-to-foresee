// GET /api/market/stats -> {enabled, paused, contract, target, today, chain: {day, today, total}, recent: [{at, buyer,
// seller, item, qty, price, hash}], low_funds, ...} for the game's market ticker (docs/town-economy.md). Never reveals a key.
// Without the daemon on this process it still answers from the contract's own counters (recent is then empty).
import { cors, envConfig } from '../../lib/core.js';
import { createTxClient } from '../../lib/near-tx.js';
import { marketDaemon } from '../../market/index.js';
import { townEnv } from '../../lib/town-traders.js';

let cache = null;
export function marketStatsHandler(opts = {}) {
  return async function handler(req, res) {
    const env = opts.env || process.env, cfg = envConfig(env), mcfg = townEnv(env);
    if (cors(req, res, cfg.origins)) return;
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'public, max-age=5');
    if (req.method !== 'GET') { res.statusCode = 405; return res.end('{"error":"method"}'); }
    const d = opts.daemon !== undefined ? opts.daemon : marketDaemon(env);
    if (d) { res.statusCode = 200; return res.end(JSON.stringify(d.stats())); }
    const now = opts.now ? opts.now() : Date.now();
    if (!cache || now - cache.at > 15_000) {
      let chain = null;
      try { chain = await createTxClient({ rpcUrls: cfg.rpcUrls, fetch: opts.fetch || globalThis.fetch, timeoutMs: 8000 }).view(mcfg.contract, 'pulse', {}); } catch { /* null */ }
      cache = { at: now, body: { enabled: false, contract: mcfg.contract, target: mcfg.target, today: null, chain: chain && { day: chain.day, today: null, total: chain.counters ? chain.counters.trade : null, at: now }, recent: [] } };
    }
    res.statusCode = 200; res.end(JSON.stringify(cache.body));
  };
}
export default marketStatsHandler();
