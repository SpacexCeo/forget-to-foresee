// GET /api/pass/status?claim_id=<64 hex> -> the stored claim's status (polled by the game every 15 s while queued).
import { cors, envConfig } from '../../lib/core.js';
import { passService } from '../../lib/pass-service.js';
import { json, query } from './_http.js';

export function statusHandler(opts = {}) {
  return async function handler(req, res) {
    const env = opts.env || process.env;
    if (cors(req, res, envConfig(env).origins)) return;
    if (req.method !== 'GET') return json(res, 405, { error: 'method' });
    const r = (opts.service || passService(env)).status(query(req).get('claim_id'));
    return json(res, r.http, r.body);
  };
}
export default statusHandler();
