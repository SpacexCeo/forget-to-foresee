// TEE agents, the browser side (docs/tee.md): asks the relayer for a townsperson's line or a trader's decision made
// by a model inside a TEE on NEAR AI Cloud, re-checks the TEE signature here in the browser (net/tee-crypto.js, a
// byte-identical copy of relayer/lib/tee-crypto.js), and records a decision on the agent ledger with the player's
// guest key (the contract checks the signature again). Every call resolves to null on any failure: the caller keeps
// its scripted line. Loaded lazily (dynamic import).
import { recoverPersonal, sha256Hex } from './tee-crypto.js';
import { createTxClient, importSecretKey } from './near-tx.js';
import { DAY1_DEPLOYMENT } from './day1-deployment.js';
import { NEAR_DEPLOYMENT } from './near-deployment.js';
import { guestFrom, ledgerContract, LEDGER_DEPOSIT, LEDGER_GAS } from './agent-ledger.js';

const envRelayer = () => { try { return import.meta.env && import.meta.env.VITE_FTF_RELAYER_URL; } catch { return undefined; } };
export const relayerUrl = (dep = DAY1_DEPLOYMENT) => String(envRelayer() || (dep && dep.relayer) || '').replace(/\/$/, '');

/** Whether the relayer has a TEE key (cached per page; one health call). */
let health = null;
export function teeAvailable({ base = relayerUrl(), fetch = globalThis.fetch, timeoutMs = 6000 } = {}) {
  if (!base || typeof fetch !== 'function') return Promise.resolve(false);
  return (health ||= withTimeout(fetch(base + '/api/health'), timeoutMs).then((r) => r.json()).then((j) => !!(j && j.tee && j.tee.configured)).catch(() => false));
}
export const _resetTeeHealth = () => { health = null; };

function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }

/** Re-checks a relayer answer's proof in this browser: both body hashes and the recovered signer. */
export async function checkInBrowser(tee) {
  if (!tee || !tee.signed_text || !tee.signature) return { ok: false, request_hash_ok: false, response_hash_ok: false, signature_ok: false };
  const parts = String(tee.signed_text).split(':');
  const [rq, rs] = parts.length === 3 ? parts.slice(1) : parts;
  const request_hash_ok = rq === await sha256Hex(tee.request_body || '');
  const response_hash_ok = rs === await sha256Hex(tee.response_body || '');
  const recovered = recoverPersonal(tee.signed_text, tee.signature);
  const signature_ok = !!recovered && recovered === String(tee.signing_address || '').toLowerCase();
  return { ok: request_hash_ok && response_hash_ok && signature_ok, request_hash_ok, response_hash_ok, signature_ok, recovered };
}

/** POSTs to /api/agent/{say|decide}; resolves {body, check} only when the relayer and this browser both verified it. */
export async function askTee(kind, payload, { base = relayerUrl(), fetch = globalThis.fetch, timeoutMs = 20000 } = {}) {
  try {
    if (!(await teeAvailable({ base, fetch }))) return null;
    const r = await withTimeout(fetch(`${base}/api/agent/${kind === 'decide' ? 'decide' : 'say'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), timeoutMs);
    if (!r.ok) return null;
    const body = await r.json();
    if (!body || !body.tee || !body.tee.verified) return null;
    const check = await checkInBrowser(body.tee);
    return check.ok ? { body, check } : null;
  } catch { return null; }
}

/** The JSON a person or tools/verify-tee/verify.mjs checks (the answer's proof, nothing private). */
export const answerJson = (tee) => JSON.stringify({ tee }, null, 2);

/** Records a TEE decision on the ledger with the guest key. Resolves {ok, hash?, reason?}. */
export async function recordTeeDecision({ storage, npc, decision, tee, deployment = DAY1_DEPLOYMENT, fetch = globalThis.fetch, rpcUrls = NEAR_DEPLOYMENT.rpcUrls }) {
  if (!ledgerContract(deployment)) return { ok: false, reason: 'not_deployed' };
  const g = guestFrom(storage);
  if (!g) return { ok: false, reason: 'need_guest' };
  const client = createTxClient({ rpcUrls, fetch });
  const key = await importSecretKey(g.secretKey);
  const args = { npc, action: decision.action, decision_hash: decision.decision_hash, model: tee.model, chat_id: tee.chat_id, signed_text: tee.signed_text, response_hash: tee.response_hash, signature: tee.signature, signing_address: tee.signing_address };
  const r = await client.call({ key, signerId: g.accountId, receiverId: ledgerContract(deployment), methodName: 'record_tee_decision', args, gas: LEDGER_GAS, deposit: LEDGER_DEPOSIT });
  return r.ok ? { ok: true, hash: r.hash } : { ok: false, reason: 'tx_failed', hash: r.hash };
}
