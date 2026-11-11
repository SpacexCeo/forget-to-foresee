// HTTP adapters for the TEE agent endpoints (api/agent/*.js and server.js share them).
import { cors, createBucket, envConfig, clientIp } from './core.js';
import { teeChat, teeEnv, validateSay, validateDecide, sayRequest, decideRequest, parseDecision, decisionHash, createAttestationCache, createDailyCap } from './tee.js';

const json = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
  let s = '';
  for await (const c of req) { s += c; if (s.length > 4096) return null; }
  try { return JSON.parse(s); } catch { return null; }
}

// One instance's limits: 6 answers at once per IP, then one per 20 s; a daily cap across all players.
const bucket = createBucket({ capacity: 6, refillMs: 20 * 1000 });
const cache = createAttestationCache();
let daily = null;
export const teeStats = () => ({ used_today: daily ? daily.used : 0 });

/** Builds a handler. `kind` is 'say' or 'decide'. Options are for tests (fetch, env, attest). */
export function teeHandler(kind, opts = {}) {
  return async function handler(req, res) {
    const cfg = envConfig(opts.env), tcfg = teeEnv(opts.env);
    daily ||= createDailyCap(tcfg.dailyCap);
    if (cors(req, res, cfg.origins)) return;
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    const v = (kind === 'say' ? validateSay : validateDecide)(await readBody(req));
    if (!v.ok) return json(res, 400, { error: v.error });
    if (!tcfg.apiKey) return json(res, 503, { error: 'tee_not_configured' });
    const lim = (opts.bucket || bucket).take(clientIp(req, (opts.env || process.env).TRUST_PROXY !== '0'));
    if (!lim.ok) { res.setHeader('Retry-After', String(lim.retryAfterS)); return json(res, 429, { error: 'rate_limited' }); }
    if (!(opts.daily || daily).take()) return json(res, 429, { error: 'daily_cap' });
    const reqObj = kind === 'say' ? sayRequest(v, tcfg.model) : decideRequest(v, tcfg.model);
    try {
      const r = await teeChat(reqObj, { apiKey: tcfg.apiKey, base: tcfg.base, nras: tcfg.nras, cache: opts.cache || cache, fetch: opts.fetch || globalThis.fetch, attest: opts.attest || null });
      if (r.status !== 200 || kind === 'say') return json(res, r.status, r.body);
      const d = parseDecision(r.body.text);
      const hash = await decisionHash({ ...v, action: d.action, chatId: r.body.tee.chat_id, responseHash: r.body.tee.response_hash });
      return json(res, 200, { decision: { action: d.action, reason: d.reason, parsed: d.parsed, npc: v.npc, echo: v.echo, bars: v.bars.length, decision_hash: hash }, text: r.body.text, tee: r.body.tee });
    } catch (e) {
      return json(res, 502, { error: 'tee', message: String((e && e.message) || e).slice(0, 120) });
    }
  };
}
