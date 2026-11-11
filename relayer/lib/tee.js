// TEE agents: townsfolk speech and a trader's buy/sell/hold, answered by a model running inside a TEE on NEAR AI
// Cloud (OpenAI-compatible, https://cloud-api.near.ai/v1). Every answer comes back with what anyone needs to check
// it without trusting this relayer: the exact request and response bodies, the TEE's signature over their hashes
// (GET /v1/signature/{chat_id}), the signing address, and a summary of that address's hardware attestation
// (GET /v1/attestation/report), checked here with lib/tee-attest.js. docs/tee.md has the full chain.
import { randomBytes } from 'node:crypto';
import { recoverPersonal, sha256Hex } from './tee-crypto.js';
import { verifyModelAttestation } from './tee-attest.js';

export const TEE_DEFAULTS = Object.freeze({
  base: 'https://cloud-api.near.ai',
  model: 'Qwen/Qwen3-VL-30B-A3B-Instruct',
  dailyCap: 1500,
});

/** Townsfolk ids and temperaments (mirrors game/src/game/town-economy.js FOLK_TEMPERAMENT; a test checks it). */
export const FOLK = Object.freeze({
  guard: 'cautious', shardkeeper: 'steady', scribe: 'cautious', innkeeper: 'steady', baker: 'steady', shrinekeeper: 'cautious', elder: 'cautious',
  musician: 'bold', sweeper: 'steady', lamplighter: 'bold', courier: 'bold', child_a: 'bold', child_b: 'bold',
});
const ROLE = { child_a: 'a child', child_b: 'a child' };
const roleOf = (npc) => ROLE[npc] || 'the ' + npc;
export const LANGS = Object.freeze({ en: 'English', ru: 'Russian', uk: 'Ukrainian', it: 'Italian', zh: 'Chinese' });
export const ACTIONS = Object.freeze(['buy', 'sell', 'hold']);

const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Validates /api/agent/say: {npc, question, facts?, lang?}. */
export function validateSay(b) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'bad_body' };
  if (!Object.prototype.hasOwnProperty.call(FOLK, b.npc)) return { ok: false, error: 'bad_npc' };
  const question = clean(b.question, 120);
  if (!question) return { ok: false, error: 'bad_question' };
  return { ok: true, npc: b.npc, question, facts: clean(b.facts, 300), lang: LANGS[b.lang] ? b.lang : 'en' };
}

/** Validates /api/agent/decide: {npc, echo, bars: int cents (2..32, published bars only), position: -1|0|1}. */
export function validateDecide(b) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'bad_body' };
  if (!Object.prototype.hasOwnProperty.call(FOLK, b.npc)) return { ok: false, error: 'bad_npc' };
  if (typeof b.echo !== 'string' || !/^[a-z0-9_]{1,16}$/.test(b.echo)) return { ok: false, error: 'bad_echo' };
  if (!Array.isArray(b.bars) || b.bars.length < 2 || b.bars.length > 32 || !b.bars.every((x) => Number.isInteger(x) && x > 0 && x < 1e9)) return { ok: false, error: 'bad_bars' };
  const position = b.position == null ? 0 : b.position;
  if (![-1, 0, 1].includes(position)) return { ok: false, error: 'bad_position' };
  return { ok: true, npc: b.npc, echo: b.echo, bars: b.bars.slice(), position };
}

/** The chat request for a townsperson's line. The facts are the game's own scripted answer (true state). */
export function sayRequest({ npc, question, facts, lang }, model = TEE_DEFAULTS.model) {
  const sys = `You are ${roleOf(npc)}, a ${FOLK[npc]} townsperson in a small sky town above the clouds in the game Forget to Foresee, ` +
    `where people trade on what the Echoes will do next. Reply to the traveller in ${LANGS[lang]}, in character, in at most two short sentences. ` +
    'Use only the facts given; never invent numbers, prices or promises; no lists, no markdown.';
  const user = (facts ? `Facts: ${facts}\n` : '') + `The traveller says: ${question}`;
  return { model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: 120, temperature: 0.7, stream: false };
}

/** The chat request for a trader's decision on the next bar. */
export function decideRequest({ npc, echo, bars, position }, model = TEE_DEFAULTS.model) {
  const sys = `You are ${roleOf(npc)}, a ${FOLK[npc]} trader in a game. You see the published prices of one market and decide the next step. ` +
    'Answer with JSON only: {"action":"buy"|"sell"|"hold","reason":"at most twelve words"}.';
  const user = `Market: ${echo}. Published prices in cents, oldest first: ${bars.join(', ')}. Your position: ${position > 0 ? 'long' : position < 0 ? 'short' : 'flat'}.`;
  return { model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], max_tokens: 80, temperature: 0, stream: false };
}

/** The model's text without reasoning blocks or quotes. */
export function contentOf(resp) {
  const c = resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content;
  return clean(String(c || '').replace(/<think>[\s\S]*?<\/think>/g, ''), 400).replace(/^["“]+|["”]+$/g, '');
}

/** Parses {"action","reason"} from the model's text; anything else is a hold. */
export function parseDecision(text) {
  const m = /\{[\s\S]*?\}/.exec(String(text));
  let j = null; try { j = m ? JSON.parse(m[0]) : null; } catch { j = null; }
  const action = j && ACTIONS.includes(String(j.action).toLowerCase()) ? String(j.action).toLowerCase() : 'hold';
  return { action, reason: clean(j && j.reason, 100), parsed: !!(j && ACTIONS.includes(String(j.action).toLowerCase())) };
}

/** Checks a NEAR AI signature payload against the exact bodies: both hashes and the recovered ECDSA address. */
export async function checkSignature({ requestBody, responseBody, sig }) {
  const requestHash = await sha256Hex(requestBody), responseHash = await sha256Hex(responseBody);
  const parts = String((sig && sig.text) || '').split(':');
  const [rq, rs] = parts.length === 3 ? parts.slice(1) : parts;
  const recovered = sig && sig.signature ? recoverPersonal(sig.text, sig.signature) : null;
  return {
    requestHash, responseHash,
    request_hash_ok: rq === requestHash, response_hash_ok: rs === responseHash,
    signature_ok: !!recovered && recovered === String(sig.signing_address || '').toLowerCase(),
    recovered,
  };
}

/** Attestation summaries, cached per signing address (a fresh nonce each time it is fetched). */
export function createAttestationCache({ ttlMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const m = new Map();
  return {
    async get(addr, fetchFn) {
      const k = String(addr).toLowerCase(), hit = m.get(k);
      if (hit && now() - hit.at < ttlMs) return hit.value;
      const value = await fetchFn();
      if (value && value.pass) m.set(k, { at: now(), value });
      return value;
    },
  };
}

/** One UTC-day counter per instance (best effort, like the mint's per-IP bucket; the API key's own limit is the hard one). */
export function createDailyCap(cap, now = () => Date.now()) {
  let day = -1, n = 0;
  return { take() { const d = Math.floor(now() / 864e5); if (d !== day) { day = d; n = 0; } if (n >= cap) return false; n++; return true; }, get used() { return n; } };
}

/**
 * Sends one chat request to NEAR AI Cloud and returns the answer with its proof.
 * @returns {{status: number, body: object}}
 */
export async function teeChat(reqObj, { apiKey, base = TEE_DEFAULTS.base, fetch = globalThis.fetch, attest = null, cache = null, nras = false, timeoutMs = 25000 } = {}) {
  if (!apiKey) return { status: 503, body: { error: 'tee_not_configured' } };
  const auth = { Authorization: 'Bearer ' + apiKey };
  const withTimeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]);
  const requestBody = JSON.stringify(reqObj);
  let r;
  try { r = await withTimeout(fetch(base + '/v1/chat/completions', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: requestBody })); } catch (e) { return { status: 502, body: { error: 'tee_unreachable', detail: String(e.message || e).slice(0, 80) } }; }
  const responseBody = await r.text();
  if (!r.ok) { let err = null; try { err = JSON.parse(responseBody).error; } catch { /* plain text */ } return { status: r.status === 429 ? 429 : 502, body: { error: 'tee_upstream', upstream_status: r.status, upstream_type: (err && err.type) || null } }; }
  let resp; try { resp = JSON.parse(responseBody); } catch { return { status: 502, body: { error: 'tee_bad_response' } }; }
  const chatId = resp.id, model = resp.model || reqObj.model;
  let sig = null;
  try {
    const s = await withTimeout(fetch(`${base}/v1/signature/${encodeURIComponent(chatId)}?model=${encodeURIComponent(reqObj.model)}&signing_algo=ecdsa`, { headers: auth }));
    if (s.ok) sig = await s.json();
  } catch { sig = null; }
  const check = sig ? await checkSignature({ requestBody, responseBody, sig }) : null;
  let attestation = null;
  if (check && check.signature_ok) {
    const run = attest || (async () => {
      const nonce = randomBytes(32).toString('hex');
      const a = await withTimeout(fetch(`${base}/v1/attestation/report?model=${encodeURIComponent(reqObj.model)}&signing_algo=ecdsa&nonce=${nonce}&signing_address=${sig.signing_address}`, { headers: auth })).then((x) => x.json());
      const entry = (a.model_attestations || []).find((x) => String(x.signing_address).toLowerCase() === check.recovered);
      if (!entry) return { pass: false, checks: { address_in_report: false }, summary: null };
      return verifyModelAttestation(entry, { signingAddress: check.recovered, nonce, nras, fetch });
    });
    try { attestation = cache ? await cache.get(check.recovered, run) : await run(); } catch (e) { attestation = { pass: false, error: String(e.message || e).slice(0, 80) }; }
  }
  const verified = !!(check && check.signature_ok && check.request_hash_ok && check.response_hash_ok && attestation && attestation.pass);
  return {
    status: 200,
    body: {
      text: contentOf(resp),
      tee: {
        provider: 'NEAR AI Cloud', base, model, chat_id: chatId, verified,
        request_body: requestBody, response_body: responseBody,
        request_hash: check ? check.requestHash : await sha256Hex(requestBody), response_hash: check ? check.responseHash : await sha256Hex(responseBody),
        signed_text: sig ? sig.text : null, signature: sig ? sig.signature : null, signing_address: sig ? String(sig.signing_address).toLowerCase() : null,
        signature_check: check ? { request_hash_ok: check.request_hash_ok, response_hash_ok: check.response_hash_ok, signature_ok: check.signature_ok } : null,
        attestation: attestation ? { pass: !!attestation.pass, checks: attestation.checks || null, summary: attestation.summary || null, checked_at: new Date().toISOString() } : null,
      },
    },
  };
}

/** sha256 of the canonical decision record that goes on the ledger (npc|echo|bar count|action|chat id|response hash). */
export const decisionHash = ({ npc, echo, bars, action, chatId, responseHash }) => sha256Hex(['ftf-tee-1', npc, echo, bars.length, bars[bars.length - 1], action, chatId, responseHash].join('|'));

export const teeEnv = (env = process.env) => ({
  apiKey: env.NEARAI_API_KEY || '',
  base: env.NEARAI_BASE_URL || TEE_DEFAULTS.base,
  model: env.NEARAI_MODEL || TEE_DEFAULTS.model,
  dailyCap: Number(env.FTF_TEE_DAILY_CAP) > 0 ? Number(env.FTF_TEE_DAILY_CAP) : TEE_DEFAULTS.dailyCap,
  nras: env.FTF_TEE_NRAS !== '0',
});
