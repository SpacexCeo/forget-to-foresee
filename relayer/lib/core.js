// The Day 1 relayer's logic, free of any platform: validation (the guests contract's own rules), CORS, a per-IP token
// bucket, and the create-guest flow with injected RPC so it is unit-tested without a network. The serverless entry
// points in api/ only adapt Vercel's req/res to these functions.
import { b58decode, createTxClient, importSecretKey } from './near-tx.js';

export const DEFAULTS = Object.freeze({
  guests: 'guests.ftf-coordinator.testnet',
  rpcUrls: ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'],
  origins: ['https://spacexceo.github.io'],
});

/** The contract's nickname rule (contracts/guests `sanitize`): lowercase ASCII letters and digits, at most 12, else "guest". */
export function sanitizeNickname(nick) {
  const s = [...String(nick == null ? '' : nick).toLowerCase()].filter((c) => /^[a-z0-9]$/.test(c)).slice(0, 12).join('');
  return s || 'guest';
}

/** `ed25519:<base58 of 32 bytes>` or null. */
export function normalizePublicKey(pk) {
  if (typeof pk !== 'string' || pk.length > 64) return null;
  const m = /^ed25519:([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(pk.trim());
  if (!m) return null;
  try { return b58decode(m[1]).length === 32 ? 'ed25519:' + m[1] : null; } catch { return null; }
}

/** Validates a create-guest body. Returns {ok, publicKey, nickname} or {ok: false, error}. */
export function validateBody(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad_body' };
  const publicKey = normalizePublicKey(body.public_key);
  if (!publicKey) return { ok: false, error: 'bad_public_key' };
  if (body.nickname != null && (typeof body.nickname !== 'string' || body.nickname.length > 64)) return { ok: false, error: 'bad_nickname' };
  return { ok: true, publicKey, nickname: sanitizeNickname(body.nickname) };
}

/** Allowed origin for the CORS header, or null: the configured sites plus any localhost / 127.0.0.1 port. */
export function allowOrigin(origin, origins = DEFAULTS.origins) {
  if (typeof origin !== 'string') return null;
  if (origins.includes(origin)) return origin;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin) ? origin : null;
}

/** Best-effort per-key token bucket (memory of one serverless instance; the contract's daily cap is the hard limit). */
export function createBucket({ capacity = 3, refillMs = 10 * 60 * 1000, now = () => Date.now(), maxKeys = 5000 } = {}) {
  const m = new Map();
  return {
    take(key) {
      const t = now();
      let b = m.get(key);
      if (!b) { if (m.size >= maxKeys) m.delete(m.keys().next().value); b = { tokens: capacity, at: t }; m.set(key, b); }
      b.tokens = Math.min(capacity, b.tokens + (t - b.at) / refillMs); b.at = t;
      if (b.tokens < 1) return { ok: false, retryAfterS: Math.ceil(((1 - b.tokens) * refillMs) / 1000) };
      b.tokens -= 1; return { ok: true };
    },
  };
}

/**
 * The create-guest flow. Idempotent per public key: an already-minted guest is returned without a transaction.
 * Answers {status, body}; 200 only once the transaction is final and the contract reports `minted: true`.
 * @param {{publicKey: string, nickname: string}} req
 * @param {{secretKey: string, guests?: string, signerId?: string, rpcUrls?: string[], fetch?: Function, queue?: Function}} o
 */
export async function createGuest({ publicKey, nickname }, { secretKey, guests = DEFAULTS.guests, signerId = guests, rpcUrls = DEFAULTS.rpcUrls, fetch = globalThis.fetch, queue = (fn) => fn() } = {}) {
  if (!secretKey) return { status: 503, body: { error: 'not_configured' } };
  const client = createTxClient({ rpcUrls, fetch });
  const done = (g, txHash) => ({ status: 200, body: { account_id: g.account_id, token_id: g.token_id, tx_hash: txHash } });
  const before = await client.view(guests, 'guest_of', { public_key: publicKey });
  if (before && before.minted) return done(before, null);
  if (!before) {
    const st = await client.view(guests, 'stats', {});
    if (st && st.today >= st.daily_cap) return { status: 429, body: { error: 'daily_cap' } };
  }
  const key = await importSecretKey(secretKey);
  const send = () => client.call({ key, signerId, receiverId: guests, methodName: 'create_guest', args: { public_key: publicKey, nickname } });
  let r;
  try { r = await queue(send); } catch (e) {
    // two instances raced on the access-key nonce: once more with a fresh nonce
    if (e && /InvalidNonce|nonce/i.test(JSON.stringify(e.rpc || e.message))) r = await queue(send); else throw e;
  }
  if (!r.ok) return { status: 502, body: { error: 'tx_failed', tx_hash: r.hash, failure: r.failure } };
  const g = await client.view(guests, 'guest_of', { public_key: publicKey });
  if (!g || !g.minted) return { status: 502, body: { error: g ? 'not_minted' : 'no_guest', tx_hash: r.hash } };
  return done(g, r.hash);
}

/** One send at a time per instance (the access key's nonce is sequential). */
export function createQueue() {
  let tail = Promise.resolve();
  return (fn) => { const p = tail.then(fn, fn); tail = p.catch(() => {}); return p; };
}

/** Sets the CORS headers; true when the request was a preflight that is now answered. */
export function cors(req, res, origins) {
  const o = allowOrigin(req.headers && req.headers.origin, origins);
  if (o) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.setHeader('Access-Control-Max-Age', '600'); }
  if (req.method === 'OPTIONS') { res.statusCode = o ? 204 : 403; res.end(); return true; }
  return false;
}

export const envConfig = (env = process.env) => ({
  secretKey: env.FTF_GUEST_KEY || '',
  guests: env.FTF_GUESTS_CONTRACT || DEFAULTS.guests,
  rpcUrls: env.FTF_RPC_URLS ? env.FTF_RPC_URLS.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULTS.rpcUrls,
  origins: env.FTF_ALLOWED_ORIGINS ? env.FTF_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULTS.origins,
});

export const clientIp = (req) => String((req.headers && (req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0])) || (req.socket && req.socket.remoteAddress) || 'unknown').trim();
