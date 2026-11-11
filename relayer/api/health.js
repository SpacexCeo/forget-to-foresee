// GET /api/health -> {ok, contract, configured, stats}; never reveals the key.
import { cors, envConfig } from '../lib/core.js';
import { createTxClient } from '../lib/near-tx.js';

export default async function handler(req, res) {
  const cfg = envConfig();
  if (cors(req, res, cfg.origins)) return;
  let stats = null;
  try { stats = await createTxClient({ rpcUrls: cfg.rpcUrls, timeoutMs: 8000 }).view(cfg.guests, 'stats', {}); } catch { /* reported as null */ }
  res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ ok: true, contract: cfg.guests, configured: !!cfg.secretKey, stats }));
}
