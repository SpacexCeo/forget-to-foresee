// Standalone relayer: plain Node http serving the same handlers as the serverless entry points in api/.
// node server.js   (env: FTF_GUEST_KEY, NEARAI_API_KEY, FTF_MARKET=1, ALLOWED_ORIGIN, PORT=8787, HOST=0.0.0.0, TRUST_PROXY=1 behind a reverse proxy)
import http from 'node:http';
import { readFileSync } from 'node:fs';

/** KEY=value lines from relayer/.env (never committed); variables already set in the environment win. */
export function loadDotEnv(path = new URL('./.env', import.meta.url), env = process.env) {
  let text = '';
  try { text = readFileSync(path, 'utf8'); } catch { return 0; }
  let n = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (env[m[1]] === undefined) { env[m[1]] = v; n++; }
  }
  return n;
}
loadDotEnv();
import createGuest from './api/create-guest.js';
import health from './api/health.js';
import agentSay from './api/agent/say.js';
import agentDecide from './api/agent/decide.js';
import chestOpen from './api/chest/open.js';
import wheelClaim from './api/wheel/claim.js';
import marketStats from './api/market/stats.js';
import { marketDaemon } from './market/index.js';
import passClaim from './api/pass/claim.js';
import passStatus from './api/pass/status.js';
import passEligibility from './api/pass/eligibility.js';
import { passService } from './lib/pass-service.js';

const routes = { '/api/create-guest': createGuest, '/api/health': health, '/api/agent/say': agentSay, '/api/agent/decide': agentDecide, '/api/chest/open': chestOpen, '/api/wheel/claim': wheelClaim, '/api/market/stats': marketStats,
  '/api/pass/claim': passClaim, '/api/pass/status': passStatus, '/api/pass/eligibility': passEligibility };
if (!process.env.TRUST_PROXY) process.env.TRUST_PROXY = '0'; // direct exposure: do not trust X-Forwarded-For

export function createServer() {
  return http.createServer(async (req, res) => {
    const path = (req.url || '/').split('?')[0].replace(/\/$/, '');
    const fn = routes[path];
    if (!fn) { res.statusCode = 404; res.setHeader('Content-Type', 'application/json'); res.end('{"error":"not_found"}'); return; }
    try { await fn(req, res); } catch { if (!res.headersSent) { res.statusCode = 500; res.end('{"error":"internal"}'); } }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 8787, host = process.env.HOST || '0.0.0.0';
  const market = marketDaemon();
  // the pass queue worker: every 10 s (the kill switch is read on every attempt, so a STOP file halts sending within 10 s)
  if (process.env.FTF_PASS_KEY) setInterval(() => { passService().work().catch(() => {}); }, 10_000).unref();
  createServer().listen(port, host, () => console.log(`relayer on http://${host}:${port} (key ${process.env.FTF_GUEST_KEY ? 'set' : 'NOT set'}, TEE ${process.env.NEARAI_API_KEY ? 'set' : 'NOT set'}, chests ${process.env.FTF_CHEST_KEY ? 'set' : 'NOT set'}, skins ${process.env.FTF_SKIN_KEY ? 'set' : 'NOT set'}, market ${market ? market.stats().traders + ' traders' : 'off'}, pass ${process.env.FTF_PASS_KEY ? 'set' : 'dry-run'} ${process.env.FTF_PASS_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'})`));
  const bye = () => { if (market) market.stop(); process.exit(0); };
  process.on('SIGTERM', bye); process.on('SIGINT', bye);
}
