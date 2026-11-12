// POST /api/pass/claim {guest_account, public_key, wallet, claim, signature, captcha?} (header Idempotency-Key: claim_id)
// -> the status table of docs/pass-claim-api.md. A transaction hash is in the answer only with status `minted`.
import { cors, envConfig, clientIp } from '../../lib/core.js';
import { passService } from '../../lib/pass-service.js';
import { json, readBody } from './_http.js';

export function claimHandler(opts = {}) {
  return async function handler(req, res) {
    const env = opts.env || process.env;
    if (cors(req, res, envConfig(env).origins)) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    const body = await readBody(req);
    if (!body) return json(res, 400, { status: 'bad_body' });
    const r = await (opts.service || passService(env)).claim(body, clientIp(req, env.TRUST_PROXY !== '0'));
    if (r.body && r.body.retry_after_s) res.setHeader('Retry-After', String(r.body.retry_after_s));
    return json(res, r.http, r.body);
  };
}
export default claimHandler();
