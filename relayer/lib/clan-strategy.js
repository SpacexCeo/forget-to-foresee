// The clans' strategy layer (owner, 12.11; docs/town-economy.md "Clan strategies"). Once an hour (or a season) each
// of the 7 clan agents asks a model on NEAR AI Cloud (the relayer's TEE path, lib/tee.js teeChat) for a few BOUNDED
// strategy parameters, given its own state: how boldly to buy (risk), what to buy (staples, dear goods or a balance),
// and whose stall to favour. The rules engine (lib/town-traders.js) still makes every move, so trades stay ordinary
// contract calls. When the model does not answer (no key, 402 no credits, a timeout, unparseable JSON) the clan uses
// its scripted strategy. Every decision is journalled with what is needed to audit it (model, chat id, prompt hash,
// the exact response, the TEE signature check) and labelled truthfully: "LLM-chosen strategy (model X via NEAR AI
// Cloud), moves by the rules engine" or "Scripted strategy (rules engine)".
import { createHash } from 'node:crypto';
import { CLAN_AGENTS, ITEMS, TRADERS, START_BALANCE } from '../market/catalog.js';
import { teeChat, contentOf, TEE_DEFAULTS } from './tee.js';

export const BUY_STYLES = Object.freeze(['staples', 'dear', 'balanced']);
export const RISK = Object.freeze([0.5, 1.5]);
export const DEFAULT_STRATEGY = Object.freeze({ risk: 1, buy: 'balanced', favour: null });
const MICRO = 1_000_000;
const sha = (s) => createHash('sha256').update(s).digest('hex');
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** The clan's view of the town: its silk, its standing among the 20 traders, its goods' prices, the last hour's trades. */
export function clanState(clan, st, recentTrades = 0) {
  const balances = Object.entries(st.balances || {}).sort((a, b) => b[1] - a[1]);
  const rank = balances.findIndex(([k]) => k === clan) + 1;
  const silk = Math.round((st.balances[clan] || 0) / MICRO);
  const goods = ITEMS.filter((i) => i.maker === clan).map((i) => ({ id: i.id, base: i.base, price: (st.prices && st.prices[i.id]) || i.base }));
  return { clan, silk, start: START_BALANCE, rank, of: balances.length || TRADERS.length, goods, recent_trades: recentTrades };
}

/** The chat request: a short system prompt, the state as JSON, JSON-only answer, deterministic temperature. */
export function strategyRequest(state, model = TEE_DEFAULTS.model) {
  const sys = 'You set the trading strategy of a clan agent in a misty hill-town market in a game (in-game silk, no real money). '
    + 'Answer with JSON only: {"risk":0.5-1.5,"buy":"staples"|"dear"|"balanced","favour":"<a trader key or none>","reason":"at most twelve words"}. '
    + 'risk scales how much the clan buys per trade; favour names a stall to buy from more often.';
  const user = `State: ${JSON.stringify(state)}. Traders: ${TRADERS.join(', ')}.`;
  return { model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: 90, temperature: 0, stream: false };
}

/** Parses and BOUNDS the model's answer; returns null when it is not usable. */
export function parseStrategy(text, clan) {
  const m = /\{[\s\S]*?\}/.exec(String(text || ''));
  let j = null; try { j = m ? JSON.parse(m[0]) : null; } catch { j = null; }
  if (!j || typeof j !== 'object') return null;
  const risk = Number(j.risk);
  const buy = String(j.buy || '').toLowerCase();
  if (!Number.isFinite(risk) || !BUY_STYLES.includes(buy)) return null;
  const favour = TRADERS.includes(String(j.favour)) && j.favour !== clan ? String(j.favour) : null;
  return { risk: +clamp(risk, RISK[0], RISK[1]).toFixed(2), buy, favour, reason: String(j.reason || '').replace(/[^\p{L}\p{N} ,.'-]/gu, '').slice(0, 100) };
}

/** The scripted strategy: a richer clan buys more boldly, a poorer one buys staples; deterministic from the state. */
export function scriptedStrategy(state) {
  const r = state.silk / state.start;
  return { risk: +clamp(0.6 + 0.4 * r, RISK[0], RISK[1]).toFixed(2), buy: r < 0.8 ? 'staples' : r > 1.3 ? 'dear' : 'balanced', favour: null, reason: 'scripted: purse ' + (r < 0.8 ? 'thin' : r > 1.3 ? 'full' : 'steady') };
}

export const llmLabel = (model) => `LLM-chosen strategy (${model} via NEAR AI Cloud), moves by the rules engine`;
export const SCRIPTED_LABEL = 'Scripted strategy (rules engine)';
/**
 * The one label of a clan decision (C11, docs/ai-use.md): "LLM-chosen" only with the TEE attestation id (the signed
 * chat id), else "Scripted (model unavailable: <reason>)". A scripted label never says AI or LLM.
 */
export function labelFor({ source, model = null, attestationId = null, reason = null } = {}) {
  if (source === 'llm') {
    if (!attestationId) throw new Error('an LLM label needs an attestation id');
    return `LLM-chosen strategy (${model} via NEAR AI Cloud, attestation ${attestationId}), moves by the rules engine`;
  }
  return reason ? `Scripted (model unavailable: ${reason})` : SCRIPTED_LABEL;
}

/**
 * One decision for a clan: the model's bounded parameters when it answers, else the scripted ones.
 * @returns {Promise<object>} the journal record
 */
export async function decideStrategy(state, { apiKey = '', model = TEE_DEFAULTS.model, base, chat = teeChat, fetch, now = () => Date.now(), retryMs = 3000, sleep = (ms) => new Promise((res) => setTimeout(res, ms)) } = {}) {
  const req = strategyRequest(state, model);
  const promptHash = sha(JSON.stringify(req));
  const rec = { clan: state.clan, at: now(), state, prompt_hash: promptHash };
  let why = 'no_key';
  if (apiKey) {
    let r = null;
    const ask = async () => { try { return await chat(req, { apiKey, ...(base ? { base } : {}), ...(fetch ? { fetch } : {}), timeoutMs: 20_000 }); } catch (e) { return { status: 502, body: { error: String(e.message || e).slice(0, 60) } }; } };
    r = await ask();
    // NEAR AI Cloud dropped the connection or timed out (13 Nov 22:25-23:27 UTC every clan fell back this way while the
    // endpoint answered again minutes later): one more try after a short pause before the scripted fallback
    if (r && r.body && r.body.error === 'tee_unreachable' && retryMs > 0) { await sleep(retryMs); r = await ask(); }
    if (r && r.status === 200 && r.body && r.body.tee) {
      const params = parseStrategy(r.body.text, state.clan);
      const t = r.body.tee;
      if (params && t.chat_id && t.verified) {
        return { ...rec, source: 'llm', label: labelFor({ source: 'llm', model: t.model || model, attestationId: t.chat_id }), model: t.model || model, chat_id: t.chat_id, verified: !!t.verified,
          response: r.body.text, response_hash: t.response_hash, request_hash: t.request_hash, signature_check: t.signature_check, params };
      }
      why = !params ? 'unparseable' : 'unattested'; // no verified TEE signature: never labelled LLM
    } else why = (r && r.body && (r.body.upstream_status ? 'upstream_' + r.body.upstream_status : r.body.error === 'tee_unreachable' && /timeout/i.test(r.body.detail || '') ? 'tee_timeout' : r.body.error)) || 'no_answer';
  }
  return { ...rec, source: 'scripted', label: labelFor({ source: 'scripted', reason: why }), model: null, fallback_reason: why, params: scriptedStrategy(state) };
}

/** Holds the current strategy per clan, journals decisions and reports the AI-chosen vs scripted share. */
export function createStrategyBook({ log = () => {}, now = () => Date.now() } = {}) {
  const current = new Map(), counts = { llm: 0, scripted: 0 };
  let day = Math.floor(now() / 86_400_000);
  return {
    get: (clan) => (current.get(clan) || {}).params || null,
    record(rec) {
      const d = Math.floor(now() / 86_400_000); if (d !== day) { day = d; counts.llm = 0; counts.scripted = 0; }
      current.set(rec.clan, rec); counts[rec.source === 'llm' ? 'llm' : 'scripted']++;
      try { log(rec); } catch { /* the journal's disk is full: keep trading */ }
    },
    stats() {
      const total = counts.llm + counts.scripted;
      return {
        decisions_today: total, llm_today: counts.llm, scripted_today: counts.scripted, llm_share_today: total ? +(counts.llm / total).toFixed(3) : 0,
        clans: [...current.values()].map((r) => ({ clan: r.clan, at: r.at, source: r.source, label: r.label, model: r.model, chat_id: r.chat_id || null, verified: !!r.verified, prompt_hash: r.prompt_hash, params: r.params, fallback_reason: r.fallback_reason || null })),
      };
    },
  };
}

/** Asks every clan once (sequentially, so the TEE path's daily cap and rate stay gentle). */
export async function runStrategyRound({ book, st, opts = {}, clans = CLAN_AGENTS, recent = () => 0 }) {
  for (const clan of clans) book.record(await decideStrategy(clanState(clan, st, recent(clan)), opts));
}
