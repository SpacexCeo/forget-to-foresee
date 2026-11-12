// POST /api/wheel/claim {account_id, public_key, wheel_id, seed, at, signature} -> 200 {token_id, tx_hash} (the Sheriffchenko skin),
// or 202 {status: 'mint_pending', verified: true} while the minter key is not on this server (the win is recorded)
import { cors, createBucket, createQueue, envConfig, clientIp } from '../../lib/core.js';
import { checkClaim, mintSkin, wheelEnv, createClaimLog } from '../../lib/wheel.js';
import { createReplayGuard } from '../../lib/chest.js';

const bucket = createBucket({ capacity: 3, refillMs: 5 * 60 * 1000 });
const queue = createQueue();
const replay = createReplayGuard();
const json = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  let s = ''; for await (const c of req) { s += c; if (s.length > 2048) return null; }
  try { return JSON.parse(s); } catch { return null; }
}

export function wheelHandler(opts = {}) {
  return async function handler(req, res) {
    const env = opts.env || process.env;
    const cfg = envConfig(env), wcfg = wheelEnv(env);
    if (cors(req, res, cfg.origins)) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    const v = await checkClaim(await readBody(req), opts.now ? opts.now() : Date.now());
    if (!v.ok) return json(res, v.error === 'bad_signature' ? 401 : 400, { error: v.error });
    const lim = (opts.bucket || bucket).take(clientIp(req, env.TRUST_PROXY !== '0'));
    if (!lim.ok) { res.setHeader('Retry-After', String(lim.retryAfterS)); return json(res, 429, { error: 'rate_limited' }); }
    if (!(opts.replay || replay).use(v.signature)) return json(res, 409, { error: 'replayed' });
    try { const r = await mintSkin(v, { ...wcfg, rpcUrls: cfg.rpcUrls, fetch: opts.fetch || globalThis.fetch, queue, log: opts.log || createClaimLog(wcfg.dataDir), now: opts.now || Date.now }); return json(res, r.status, r.body); }
    catch (e) { return json(res, 502, { error: 'rpc', message: String((e && e.message) || e).slice(0, 120) }); }
  };
}
export default wheelHandler();
