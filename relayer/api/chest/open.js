// POST /api/chest/open {account_id, public_key, at, signature} -> {opening, outcome, leaf, proof, root, tx_hash, seed}
// Batch: add {count: 1-10, request_id} (signed as "ftf-chest-open|<account>|<at>|<count>|<request id>") ->
//   {requested, opened, cut, tx_hash, tx_hashes, transactions: N, openings: [{opening, tx_hash, outcome, leaf, proof, root}]}
//   (one single-action transaction per chest: a function-call key cannot sign a multi-action transaction)
import { cors, createBucket, createQueue, envConfig, clientIp } from '../../lib/core.js';
import { chestEnv, createReplayGuard, openChest, openChests, signatureValid, validateOpen, journaled, countChestError } from '../../lib/chest.js';

const bucket = createBucket({ capacity: 20, refillMs: 60 * 1000 }); // one token per request; a batch is one request
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
    const fail = (status, body) => { countChestError(body.error); return json(res, status, body); };
    const v = validateOpen(await readBody(req));
    if (!v.ok) return fail(400, { error: v.error });
    if (!(await signatureValid(v))) return fail(401, { error: 'bad_signature' });
    if (!ccfg.secretKey) return fail(503, { error: 'chest_not_configured' });
    const done = v.count != null ? journaled(v.accountId, v.requestId) : null; // a retry of a batch whose answer was lost
    if (done) return json(res, done.status, done.body);
    const lim = (opts.bucket || bucket).take(clientIp(req, env.TRUST_PROXY !== '0'));
    if (!lim.ok) { res.setHeader('Retry-After', String(lim.retryAfterS)); return fail(429, { error: 'rate_limited', retry_after_s: lim.retryAfterS }); }
    if (!(opts.replay || replay).use(v.signature)) return fail(409, { error: 'replayed' });
    try {
      const r = v.count != null
        ? await openChests(v, { ...ccfg, rpcUrls: cfg.rpcUrls, fetch: opts.fetch || globalThis.fetch, queue, client: opts.client }) // a batch: one transaction per chest, sent together
        : await openChest(v, { ...ccfg, rpcUrls: cfg.rpcUrls, fetch: opts.fetch || globalThis.fetch, queue });
      if (r.status !== 200) countChestError(r.body.error);
      return json(res, r.status, r.body);
    } catch (e) { return fail(502, { error: 'rpc', message: String((e && e.message) || e).slice(0, 120) }); }
  };
}
export default chestHandler();
