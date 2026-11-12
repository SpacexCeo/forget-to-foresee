// GET /api/pass/eligibility?guest=<guest account> -> {eligible, paid, earned, needed} from the replayed expedition log.
import { cors, envConfig } from '../../lib/core.js';
import { passService } from '../../lib/pass-service.js';
import { json, query } from './_http.js';

export function eligibilityHandler(opts = {}) {
  return async function handler(req, res) {
    const env = opts.env || process.env;
    if (cors(req, res, envConfig(env).origins)) return;
    if (req.method !== 'GET') return json(res, 405, { error: 'method' });
    const r = await (opts.service || passService(env)).eligibility(query(req).get('guest'));
    return json(res, r.http, r.body);
  };
}
export default eligibilityHandler();
