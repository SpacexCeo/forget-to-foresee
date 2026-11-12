// GET /api/health -> {ok, contract, configured, stats, tee: {configured, model, used_today}, chests: {configured, contract}, pass: {network, contract, configured, enabled}}; never reveals a key.
import { cors, envConfig } from '../lib/core.js';
import { createTxClient } from '../lib/near-tx.js';
import { teeEnv } from '../lib/tee.js';
import { teeStats } from '../lib/tee-http.js';
import { chestEnv } from '../lib/chest.js';
import { wheelEnv } from '../lib/wheel.js';
import { passService } from '../lib/pass-service.js';

export default async function handler(req, res) {
  const cfg = envConfig();
  if (cors(req, res, cfg.origins)) return;
  let stats = null;
  try { stats = await createTxClient({ rpcUrls: cfg.rpcUrls, timeoutMs: 8000 }).view(cfg.guests, 'stats', {}); } catch { /* reported as null */ }
  res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ ok: true, contract: cfg.guests, configured: !!cfg.secretKey, stats, tee: { configured: !!teeEnv().apiKey, model: teeEnv().model, ...teeStats() }, chests: { configured: !!chestEnv().secretKey, contract: chestEnv().chests }, wheel: { configured: !!wheelEnv().secretKey, contract: wheelEnv().skins }, pass: passService().health() }));
}
