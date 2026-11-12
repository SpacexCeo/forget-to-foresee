// The portal on chain for guests (lib/town-gate.js; docs/town-gate.md):
//   GET  /api/town/gate?account_id=<guest>      -> {registered, silk, gate_price, gate (gate_paid_of), contract}
//   POST /api/town/gate {account_id, public_key, at, gate_id, signature}   signature over "ftf-gate|<account>|<gate_id>|<at>"
//        -> credits the guest's verified income, then ftf-town pay_gate_for -> {paid, tx_hash, request_hash, gate}
//   POST /api/town/gate {account_id, public_key, at, signature, credit_only: true}   signature over "ftf-town-credit|<account>|<at>"
//        -> registers + credits only -> {credited_now, credited_total, creditable, silk, gate_price, tx_hash}
import { cors, createBucket, envConfig, clientIp, DEFAULTS } from '../../lib/core.js';
import { createTxClient } from '../../lib/near-tx.js';
import { createReplayGuard } from '../../lib/chest.js';
import { townGateEnv, validateRequest, signatureValid, syncCredit, payGateFor, createCreditLedger } from '../../lib/town-gate.js';
import { jsonlLog } from '../../market/index.js';
import { join } from 'node:path';

const bucket = createBucket({ capacity: 6, refillMs: 60 * 1000 });
const replay = createReplayGuard(15 * 60 * 1000);
const json = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let s = ''; for await (const c of req) { s += c; if (s.length > 4096) return null; }
  try { return JSON.parse(s); } catch { return null; }
}

export function townGateHandler(opts = {}) {
  return async function handler(req, res) {
    const env = opts.env || process.env, cfg = envConfig(env), gcfg = townGateEnv(env);
    if (cors(req, res, cfg.origins)) return;
    const client = opts.client || createTxClient({ rpcUrls: cfg.rpcUrls.length ? cfg.rpcUrls : DEFAULTS.rpcUrls, fetch: opts.fetch || globalThis.fetch, timeoutMs: 30_000 });
    if (req.method === 'GET') {
      const acc = new URL(req.url, 'http://x').searchParams.get('account_id') || '';
      if (!/^[a-z0-9._-]{2,64}$/.test(acc)) return json(res, 400, { error: 'bad_account' });
      try {
        const [row, price, gate] = await Promise.all([client.view(gcfg.town, 'balance_of', { account_id: acc }), client.view(gcfg.town, 'gate_price', {}), client.view(gcfg.town, 'gate_paid_of', { account_id: acc })]);
        return json(res, 200, { registered: !!row, silk: row ? String(row.silk) : '0', gate_price: String(price), gate, contract: gcfg.town, configured: !!(gcfg.coord && gcfg.coordKey && gcfg.logDir) });
      } catch (e) { return json(res, 502, { error: 'rpc' }); }
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    if (!gcfg.coord || !gcfg.coordKey || !gcfg.logDir) return json(res, 503, { error: 'gate_not_configured' });
    const lim = (opts.bucket || bucket).take(clientIp(req, env.TRUST_PROXY !== '0'));
    if (!lim.ok) { res.setHeader('Retry-After', String(lim.retryAfterS)); return json(res, 429, { error: 'rate_limited' }); }
    const body = await readBody(req);
    const creditOnly = !!(body && body.credit_only);
    const v = validateRequest(body, opts.now ? opts.now() : Date.now(), { gate: !creditOnly });
    if (!v.ok) return json(res, 400, { error: v.error });
    const deps = { client, cfg: gcfg, ledger: opts.ledger || createCreditLedger(join(gcfg.dataDir, 'town-credits')), replay: opts.replay || replay, log: jsonlLog(join(gcfg.dataDir, 'town-gate')), key: opts.key, loadLog: opts.loadLog, now: opts.now };
    try {
      if (creditOnly) {
        if (!(await signatureValid(v.publicKey, v.signature, v.message))) return json(res, 401, { error: 'bad_signature' });
        try { await client.rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: v.accountId, public_key: v.publicKey }); } catch { return json(res, 403, { error: 'not_your_key' }); }
        const r = await syncCredit(v.accountId, deps); return json(res, r.status, r.body);
      }
      const r = await payGateFor(v, deps); return json(res, r.status, r.body);
    } catch (e) { return json(res, 502, { error: 'rpc', message: String((e && e.message) || e).slice(0, 120) }); }
  };
}
export default townGateHandler();
