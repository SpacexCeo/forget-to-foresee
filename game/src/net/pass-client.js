// The whitelist pass, the browser side (story TZ §11.4): wallet id syntax (the same vectors as the relayer,
// relayer/tests/fixtures/account-ids.json), the signed claim (the Day 1 guest key signs it, as the wheel claim), the
// relayer calls, and the view model. The view model only shows a transaction hash for a response whose status is
// `minted` (or its replay) and that carries a well-formed hash: nothing here can produce, cache or invent one.
import { b58encode, importSecretKey } from './near-tx.js';
import { guestFrom } from './agent-ledger.js';
import { relayerUrl } from './tee-agent.js';
import { PASS_DEPLOYMENT } from './pass-deployment.js';
import { EXPEDITION } from '../game/expedition-config.js';

export const BOARD_SEASON = 1;
export const NAMED_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
export const IMPLICIT_RE = /^[0-9a-f]{64}$/;
const HASH_RE = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;

/** relayer lib/pass.js checkWallet, same rules: {ok, implicit} | {ok: false}. Uppercase is refused, never lowercased. */
export function checkWallet(id, { network = 'testnet', forbidden = [] } = {}) {
  if (typeof id !== 'string' || id.length < 2 || id.length > 64) return { ok: false };
  const implicit = IMPLICIT_RE.test(id);
  if (!implicit && !NAMED_RE.test(id)) return { ok: false };
  if (forbidden.filter(Boolean).includes(id)) return { ok: false };
  if (!implicit && network === 'mainnet' && id.endsWith('.testnet')) return { ok: false };
  if (!implicit && network === 'testnet' && !id.endsWith('.testnet')) return { ok: false };
  return { ok: true, implicit };
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function claimIdFor(guest, season = BOARD_SEASON) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ftf-pass-1|${season}|${guest}`)));
}
export const canonicalClaim = (c, wallet) => ['ftf-pass-claim', c.v, c.board_season, c.claim_id, c.log_head, c.log_len, c.issued_at, wallet].join('|');

/** Every status the relayer can answer, mapped to the modal's state and message key (TZ §11.3 table). */
export const STATUS_VIEW = Object.freeze({
  minted: { state: 'minted', key: 'pass.minted' }, already_claimed: { state: 'minted', key: 'pass.already' },
  queued: { state: 'queued', key: 'pass.queued' }, paused: { state: 'queued', key: 'pass.paused' },
  budget_exhausted: { state: 'queued', key: 'pass.budget' }, rpc_unavailable: { state: 'queued', key: 'pass.rpc' },
  invalid_account: { state: 'error', key: 'pass.err.invalid' }, bad_body: { state: 'error', key: 'pass.err.generic' },
  account_missing: { state: 'error', key: 'pass.err.missing' }, not_eligible: { state: 'error', key: 'pass.err.eligible' },
  wallet_taken: { state: 'error', key: 'pass.err.taken' }, signature_invalid: { state: 'error', key: 'pass.err.signature' },
  rate_limited: { state: 'error', key: 'pass.err.rate' }, captcha_required: { state: 'error', key: 'pass.err.captcha' },
  sold_out: { state: 'error', key: 'pass.err.soldout' }, tx_failed: { state: 'error', key: 'pass.err.failed' },
  not_configured: { state: 'error', key: 'pass.err.closed' }, offline: { state: 'error', key: 'pass.err.offline' },
  expired: { state: 'error', key: 'pass.err.expired' }, unknown: { state: 'error', key: 'pass.err.generic' },
});

/**
 * Server answer -> view model {state, key, args, hash, tokenId, explorer, claimId}. `hash` is set only for a minted (or
 * replayed) answer with a well-formed hash; a minted answer without one shows the token id and no link.
 */
export function viewModel(ans, { explorerBase = PASS_DEPLOYMENT.explorerBase } = {}) {
  const status = ans && typeof ans.status === 'string' && STATUS_VIEW[ans.status] ? ans.status : 'unknown';
  const v = STATUS_VIEW[status];
  const out = { status, state: v.state, key: v.key, args: {}, hash: null, tokenId: null, explorer: null, claimId: (ans && ans.claim_id) || null };
  if (v.state === 'minted') {
    out.tokenId = ans.token_id != null ? String(ans.token_id) : null;
    if (typeof ans.tx_hash === 'string' && HASH_RE.test(ans.tx_hash)) { out.hash = ans.tx_hash; out.explorer = explorerBase + ans.tx_hash; }
  }
  if (status === 'not_eligible') {
    const fee = Number.isFinite(+ans.needed) && +ans.needed > 0 ? Math.round(+ans.needed) : EXPEDITION.PORTAL_FEE_C / 100;
    out.args = { earned: Math.floor(+ans.earned || 0).toLocaleString('en-US'), fee: fee.toLocaleString('en-US') };
  }
  if (status === 'rate_limited') out.args = { n: Math.max(1, Math.ceil((+ans.retry_after_s || 60) / 60)) };
  if (status === 'tx_failed') out.args = { code: String(ans.code || 'tx_failed').replace(/[^A-Z_a-z]/g, '').slice(0, 32) };
  return out;
}

/**
 * The relayer client. `fetch` is injectable (tests use a fake); every failure resolves to {status: 'offline'}.
 * @param {{base?: string, fetch?: Function, storage?: object, network?: string, timeoutMs?: number}} o
 */
export function createPassClient({ base = PASS_DEPLOYMENT.relayerBase || relayerUrl(), fetch = globalThis.fetch, storage = null, network = PASS_DEPLOYMENT.network, timeoutMs = 60000 } = {}) {
  const url = base ? String(base).replace(/\/$/, '') : null;
  const call = async (path, init) => {
    if (!url || typeof fetch !== 'function') return { status: 'not_configured' };
    try {
      const r = await Promise.race([fetch(url + path, init), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]);
      const j = await r.json().catch(() => null);
      return j && typeof j.status === 'string' ? j : { status: r.status === 404 ? 'not_configured' : 'offline' };
    } catch { return { status: 'offline' }; }
  };
  return {
    network,
    guest: () => guestFrom(storage),
    async eligibility() { const g = guestFrom(storage); if (!g) return { eligible: false }; const r = await call('/api/pass/eligibility?guest=' + encodeURIComponent(g.accountId)); return r.eligible === true ? r : { eligible: false, ...r }; },
    /** Signs and sends the claim for `wallet`. */
    async claim(wallet, { logHead = '', logLen = 0, now = Date.now } = {}) {
      const g = guestFrom(storage);
      if (!g) return { status: 'signature_invalid' };
      const key = await importSecretKey(g.secretKey);
      const claim = { v: 1, board_season: BOARD_SEASON, claim_id: await claimIdFor(g.accountId), log_head: String(logHead).slice(0, 128), log_len: Math.max(0, logLen | 0), issued_at: now() };
      const signature = 'ed25519:' + b58encode(await key.sign(new TextEncoder().encode(canonicalClaim(claim, wallet))));
      const r = await call('/api/pass/claim', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': claim.claim_id }, body: JSON.stringify({ guest_account: g.accountId, public_key: key.publicKey, wallet, claim, signature }) });
      return { claim_id: claim.claim_id, ...r };
    },
    status: (claimId) => call('/api/pass/status?claim_id=' + encodeURIComponent(claimId)),
  };
}
