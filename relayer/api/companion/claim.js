// POST /api/companion/claim {account_id, public_key, at, signature, reason: "welcome"|"boss"}, signed by the guest key
// as "ftf-companion|<account>|<at>|<reason>" -> {reason, kind, token_id, owner_id, heroine_token, contract, tx_hash, already}.
// Idempotent: a dragon already minted for that heroine and reason is returned without a transaction (lib/companion.js).
import { cors, createBucket, createQueue, envConfig, clientIp } from '../../lib/core.js';
import { companionEnv, validateClaim, claimCompanion } from '../../lib/companion.js';

const bucket = createBucket({ capacity: 6, refillMs: 60 * 1000 });
const queue = createQueue();
const json = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  let s = '';
  for await (const c of req) { s += c; if (s.length > 2048) return null; }
  try { return JSON.parse(s); } catch { return null; }
}

/** Options are for tests (env, fetch, client, key, bucket, loadLog). */
export function companionHandler(opts = {}) {
  return async function handler(req, res) {
    const env = opts.env || process.env, cfg = envConfig(env), ccfg = companionEnv(env);
    if (cors(req, res, cfg.origins)) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    const v = validateClaim(await readBody(req));
    if (!v.ok) return json(res, 400, { error: v.error });
    const lim = (opts.bucket || bucket).take(clientIp(req, env.TRUST_PROXY !== '0'));
    if (!lim.ok) { res.setHeader('Retry-After', String(lim.retryAfterS)); return json(res, 429, { error: 'rate_limited' }); }
    try {
      const r = await claimCompanion(v, { cfg: { ...ccfg, rpcUrls: cfg.rpcUrls }, fetch: opts.fetch, client: opts.client, key: opts.key, loadLog: opts.loadLog, queue });
      return json(res, r.status, r.body);
    } catch (e) { return json(res, 502, { error: 'rpc', message: String((e && e.message) || e).slice(0, 120) }); }
  };
}
export default companionHandler();
