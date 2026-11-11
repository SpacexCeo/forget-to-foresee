// POST /api/chest/open {account_id, public_key, at, signature} -> {opening, outcome, leaf, proof, root, tx_hash, seed}
import { cors, createBucket, createQueue, envConfig, clientIp } from '../../lib/core.js';
import { chestEnv, createReplayGuard, openChest, signatureValid, validateOpen } from '../../lib/chest.js';

const bucket = createBucket({ capacity: 5, refillMs: 60 * 1000 });
const queue = createQueue();
const replay = createReplayGuard();
const json = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  let s = '';
  for await (const c of req) { s += c; if (s.length > 2048) return null; }
  try { return JSON.parse(s); } catch { return null; }
}

/** Options are for tests (env, fetch, bucket, replay). */
export function chestHandler(opts = {}) {
  return async function handler(req, res) {
    const env = opts.env || process.env;
    const cfg = envConfig(env), ccfg = chestEnv(env);
    if (cors(req, res, cfg.origins)) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    const v = validateOpen(await readBody(req));
    if (!v.ok) return json(res, 400, { error: v.error });
    if (!(await signatureValid(v))) return json(res, 401, { error: 'bad_signature' });
    if (!ccfg.secretKey) return json(res, 503, { error: 'chest_not_configured' });
    const lim = (opts.bucket || bucket).take(clientIp(req, env.TRUST_PROXY !== '0'));
    if (!lim.ok) { res.setHeader('Retry-After', String(lim.retryAfterS)); return json(res, 429, { error: 'rate_limited' }); }
    if (!(opts.replay || replay).use(v.signature)) return json(res, 409, { error: 'replayed' });
    try {
      const r = await openChest(v, { ...ccfg, rpcUrls: cfg.rpcUrls, fetch: opts.fetch || globalThis.fetch, queue });
      return json(res, r.status, r.body);
    } catch (e) { return json(res, 502, { error: 'rpc', message: String((e && e.message) || e).slice(0, 120) }); }
  };
}
export default chestHandler();
