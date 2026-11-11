// POST /api/create-guest {public_key, nickname} -> {account_id, token_id, tx_hash} once final and minted.
import { cors, validateBody, createBucket, createGuest, createQueue, envConfig, clientIp } from '../lib/core.js';

const bucket = createBucket();
const queue = createQueue();

const json = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  let s = '';
  for await (const c of req) { s += c; if (s.length > 4096) return null; }
  try { return JSON.parse(s); } catch { return null; }
}

export default async function handler(req, res) {
  const cfg = envConfig();
  if (cors(req, res, cfg.origins)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  const v = validateBody(await readBody(req));
  if (!v.ok) return json(res, 400, { error: v.error });
  const lim = bucket.take(clientIp(req));
  if (!lim.ok) { res.setHeader('Retry-After', String(lim.retryAfterS)); return json(res, 429, { error: 'rate_limited' }); }
  try {
    const r = await createGuest(v, { ...cfg, queue });
    return json(res, r.status, r.body);
  } catch (e) {
    return json(res, 502, { error: 'rpc', message: String((e && e.message) || e).slice(0, 120) });
  }
}
