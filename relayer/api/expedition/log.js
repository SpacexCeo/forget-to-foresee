// POST /api/expedition/log {account_id, public_key, at, signature, from_seq, entries} -> {stored, length, head}
//   signature: base58 ed25519 over "ftf-expedition-log|<account>|<at>|<from_seq>|<count>|<hash of the last entry>"
//   by an access key of the guest account (checked on testnet). Append-only; a retry of a stored batch is a no-op.
// GET  /api/expedition/log?guest=<account> -> {stored, length, head} (where the browser resumes)
// Without FTF_EXPEDITION_DIR nothing is stored: {stored: false, reason: 'storage_off'}.
import { cors, createBucket, envConfig, clientIp } from '../../lib/core.js';
import { createTxClient } from '../../lib/near-tx.js';
import { STORE, validateLogBatch, logSignatureValid, appendBatch, logStatus } from '../../lib/expedition-store.js';
import { creditEnv, creditStory, coordinatorSender } from '../../lib/story-credit.js';
import { loadLog } from '../../lib/pass-eligibility.js';

const ipBucket = createBucket({ capacity: 30, refillMs: 2 * 1000 });
const guestBucket = createBucket({ capacity: 20, refillMs: 3 * 1000 });
const json = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { if (req.body.length > STORE.bodyMax) return 'too_large'; try { return JSON.parse(req.body); } catch { return null; } }
  let s = '';
  for await (const c of req) { s += c; if (s.length > STORE.bodyMax) return 'too_large'; }
  try { return JSON.parse(s); } catch { return null; }
}

/** The guest's key is an access key of the account (testnet RPC). Tests inject `ownsKey`. */
async function rpcOwnsKey(cfg, fetch, accountId, publicKey) {
  const client = createTxClient({ rpcUrls: cfg.rpcUrls, fetch });
  try { await client.rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKey }); return true; } catch { return false; }
}

/** Options are for tests (env, fetch, ownsKey, buckets, now). */
export function expeditionLogHandler(opts = {}) {
  return async function handler(req, res) {
    const env = opts.env || process.env, cfg = envConfig(env), dir = env.FTF_EXPEDITION_DIR || null;
    if (cors(req, res, cfg.origins)) return;
    if (req.method === 'GET') {
      const guest = new URL(req.url || '/', 'http://x').searchParams.get('guest') || '';
      if (!/^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/.test(guest)) return json(res, 400, { error: 'bad_account' });
      return json(res, 200, logStatus(dir, guest));
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    const body = await readBody(req);
    if (body === 'too_large') return json(res, 413, { error: 'too_large' });
    const now = opts.now ? opts.now() : Date.now();
    const v = validateLogBatch(body, now);
    if (!v.ok) return json(res, 400, { error: v.error });
    const lim = (opts.ipBucket || ipBucket).take(clientIp(req, env.TRUST_PROXY !== '0'));
    if (!lim.ok) { res.setHeader('Retry-After', String(lim.retryAfterS)); return json(res, 429, { error: 'rate_limited' }); }
    const glim = (opts.guestBucket || guestBucket).take(v.accountId);
    if (!glim.ok) { res.setHeader('Retry-After', String(glim.retryAfterS)); return json(res, 429, { error: 'rate_limited' }); }
    if (!(await logSignatureValid(v))) return json(res, 401, { error: 'bad_signature' });
    if (!dir) return json(res, 200, { stored: false, reason: 'storage_off' });
    const owns = opts.ownsKey ? await opts.ownsKey(v.accountId, v.publicKey) : await rpcOwnsKey(cfg, opts.fetch || globalThis.fetch, v.accountId, v.publicKey);
    if (!owns) return json(res, 403, { error: 'not_your_key' });
    let r;
    try { r = await appendBatch(v, { dir, now }); } catch (e) { return json(res, 500, { error: 'store', message: String((e && e.message) || e).slice(0, 120) }); }
    // story credits on chain (rev 4): the stored, checked entries become credit_silk calls by the coordinator, capped
    if (r.status === 200 && r.body.stored) {
      const ccfg = creditEnv(env), send = opts.sendCredits || (ccfg.on ? coordinatorSender(ccfg, { rpcUrls: cfg.rpcUrls, fetch: opts.fetch || globalThis.fetch }) : null);
      if (send) { try { r.body.credit = await creditStory({ dir, guest: v.accountId, log: loadLog(dir, v.accountId) || [], now, send }); } catch (e) { r.body.credit = { credited: 0, error: 'credit_failed' }; } }
      else r.body.credit = { credited: 0, error: 'credits_off' };
    }
    return json(res, r.status, r.body);
  };
}
export default expeditionLogHandler();
