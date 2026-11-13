// Account login (docs/account-login.md): a NEAR, EVM or Solana wallet signs one plain-text message; the relayer checks
// the signature and maps that login to the player's Day-1 guest account (identity -> account). No passwords, no
// private keys of players here: the browser keeps its own keys, the relayer only verifies public signatures.
//   - EVM: EIP-191 personal_sign, secp256k1 recovery to the 0x address (the key type intents.near accepts for EVM).
//   - Solana: ed25519 over the UTF-8 message bytes, the public key is the base58 address (the Solana signMessage form).
//   - NEAR: NEP-413 signMessage (borsh payload, sha256, ed25519) with a full-access key of the named account.
// Replay: every message carries a one-time nonce the relayer issued (10 min TTL, deleted on first use) and an expiry.
// Guarding the guest: linking an existing guest account also needs the same message signed by that account's
// full-access key (the browser's Day-1 key), checked on chain, so nobody can link someone else's account.
import { createPublicKey, randomBytes, verify as edVerify, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { recoverPersonal } from './tee-crypto.js';
import { b58decode } from './near-tx.js';

export const AUTH = Object.freeze({
  recipient: 'forget-to-foresee', // the NEP-413 recipient
  nep413Tag: 2147484061, // 2^31 + 413
  nonceTtlMs: 10 * 60 * 1000,
  resolveTtlMs: 5 * 60 * 1000,
  maxNonces: 20_000,
});
export const LOGIN_KINDS = Object.freeze(['near', 'evm', 'sol']);

/**
 * The one message every login signs. Built from fields on both sides (never parsed back), so the relayer verifies
 * exactly what it would have shown.
 * @param {{kind: string, address: string, account: string|null, deviceKey: string|null, nonce: string, expires: string}} f
 */
export function loginMessage(f) {
  return [
    'Forget to Foresee: sign in',
    `Login: ${f.kind}:${f.address}`,
    `Game account: ${f.account || 'new'}`,
    `Device key: ${f.deviceKey || 'none'}`,
    `Nonce: ${f.nonce}`,
    `Expires: ${f.expires}`,
    'This proves you own this login. It sends no transaction and costs nothing. Your account lives on NEAR testnet; nothing here has real-world value.',
  ].join('\n');
}

// ---- ed25519 and NEP-413 ------------------------------------------------------------------------------------------
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');
const edKey = (raw32) => createPublicKey({ key: Buffer.concat([SPKI_ED25519, Buffer.from(raw32)]), format: 'der', type: 'spki' });
/** ed25519 verify of `msg` bytes with a raw 32-byte public key; false on any malformed input. */
export function ed25519Valid(msg, sig, pub32) {
  try { return sig.length === 64 && pub32.length === 32 && edVerify(null, Buffer.from(msg), edKey(pub32), Buffer.from(sig)); } catch { return false; }
}
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const bstr = (s) => { const b = Buffer.from(s, 'utf8'); return Buffer.concat([u32(b.length), b]); };
/** NEP-413 payload bytes: u32 tag, message, [u8;32] nonce, recipient, Option<callbackUrl> (always None here). */
export const nep413Bytes = (message, nonce32, recipient = AUTH.recipient) => Buffer.concat([u32(AUTH.nep413Tag), bstr(message), Buffer.from(nonce32), bstr(recipient), Buffer.from([0])]);
export const nep413Hash = (message, nonce32, recipient) => createHash('sha256').update(nep413Bytes(message, nonce32, recipient)).digest();

/** Signature text -> bytes: 0x-hex, base58 or base64 (wallets differ); null when none fits. */
export function sigBytes(s) {
  if (typeof s !== 'string' || !s) return null;
  if (/^0x[0-9a-fA-F]+$/.test(s)) return Buffer.from(s.slice(2), 'hex');
  if (/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(s)) { try { return Buffer.from(b58decode(s)); } catch { /* fall through */ } }
  try { const b = Buffer.from(s, 'base64'); return b.length ? b : null; } catch { return null; }
}
const edPub = (text) => { try { const k = b58decode(String(text).replace(/^ed25519:/, '')); return k.length === 32 ? k : null; } catch { return null; } };
const nonceBytes = (hex) => Buffer.from(hex, 'hex');

/** Normalised identity id for a login: evm:0x…(lowercase), sol:<base58>, near:<account>. */
export function identityOf(kind, address) {
  if (kind === 'evm') return /^0x[0-9a-fA-F]{40}$/.test(address) ? 'evm:' + address.toLowerCase() : null;
  if (kind === 'sol') return edPub(address) ? 'sol:' + address : null;
  if (kind === 'near') return /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(address) && address.length >= 2 && address.length <= 64 ? 'near:' + address : null;
  return null;
}

/**
 * Checks the login signature over `message`. NEAR also needs `accessKey(account, publicKey)` (on chain) for a named
 * account; an implicit account (64 hex) must equal hex(publicKey).
 * @returns {Promise<{ok: boolean, identity?: string, error?: string}>}
 */
export async function verifyLogin(login, message, nonceHex, { accessKey } = {}) {
  const id = login && identityOf(login.kind, login.address);
  if (!id) return { ok: false, error: 'bad_login' };
  const sig = sigBytes(login.signature);
  if (!sig) return { ok: false, error: 'bad_signature' };
  if (login.kind === 'evm') {
    const who = recoverPersonal(message, '0x' + sig.toString('hex'));
    return who && who.toLowerCase() === login.address.toLowerCase() ? { ok: true, identity: id } : { ok: false, error: 'bad_signature' };
  }
  if (login.kind === 'sol') return ed25519Valid(Buffer.from(message, 'utf8'), sig, edPub(login.address)) ? { ok: true, identity: id } : { ok: false, error: 'bad_signature' };
  // near
  const pub = edPub(login.publicKey);
  if (!pub) return { ok: false, error: 'bad_public_key' };
  if (!ed25519Valid(nep413Hash(message, nonceBytes(nonceHex)), sig, pub)) return { ok: false, error: 'bad_signature' };
  if (/^[0-9a-f]{64}$/.test(login.address)) return login.address === Buffer.from(pub).toString('hex') ? { ok: true, identity: id } : { ok: false, error: 'not_account_key' };
  if (!accessKey) return { ok: false, error: 'no_rpc' };
  const ak = await accessKey(login.address, login.publicKey).catch(() => null);
  return ak && ak.permission === 'FullAccess' ? { ok: true, identity: id } : { ok: false, error: 'not_full_access_key' };
}

/** The guest's own proof: the same message signed (raw ed25519) by a full-access key of `account_id`, checked on chain. */
export async function verifyGuest(account, message, { accessKey } = {}) {
  if (!account || typeof account.account_id !== 'string' || !identityOf('near', account.account_id)) return { ok: false, error: 'bad_account' };
  const pub = edPub(account.public_key), sig = sigBytes(account.signature);
  if (!pub || !sig || !ed25519Valid(Buffer.from(message, 'utf8'), sig, pub)) return { ok: false, error: 'bad_account_signature' };
  if (!accessKey) return { ok: false, error: 'no_rpc' };
  const ak = await accessKey(account.account_id, account.public_key).catch(() => null);
  return ak && ak.permission === 'FullAccess' ? { ok: true } : { ok: false, error: 'not_account_key' };
}

// ---- nonces ---------------------------------------------------------------------------------------------------------
/** One-time nonces: issue() -> {nonce, expires}; take(nonce) -> true once, while unexpired. In memory (one process). */
export function createNonces({ ttlMs = AUTH.nonceTtlMs, now = () => Date.now(), max = AUTH.maxNonces, rand = (n) => randomBytes(n) } = {}) {
  const m = new Map();
  const sweep = () => { const t = now(); for (const [k, v] of m) if (v <= t) m.delete(k); };
  return {
    issue() {
      if (m.size >= max) sweep();
      if (m.size >= max) m.delete(m.keys().next().value);
      const nonce = Buffer.from(rand(32)).toString('hex'), exp = now() + ttlMs;
      m.set(nonce, exp);
      return { nonce, expires: new Date(exp).toISOString() };
    },
    /** Consumes the nonce; returns its expiry ISO string, or null (unknown, used or expired). */
    take(nonce) {
      const exp = m.get(nonce);
      if (exp === undefined) return null;
      m.delete(nonce);
      return exp > now() ? new Date(exp).toISOString() : null;
    },
    get size() { return m.size; },
  };
}

// ---- the identity -> account store ---------------------------------------------------------------------------------
/**
 * identities.json in the relayer's data dir: {identities: {id: {account, guest_key, kind, address, linked_at, history}}}.
 * Written atomically (tmp + rename), mode 600. Holds only public data.
 */
export function createIdentityStore(file) {
  let data = { identities: {} };
  try { if (file && existsSync(file)) data = JSON.parse(readFileSync(file, 'utf8')); } catch { data = { identities: {} }; }
  if (!data.identities) data.identities = {};
  const save = () => { if (!file) return; mkdirSync(dirname(file), { recursive: true }); writeFileSync(file + '.tmp', JSON.stringify(data), { mode: 0o600 }); renameSync(file + '.tmp', file); };
  return {
    get: (id) => data.identities[id] || null,
    set(id, rec) { data.identities[id] = rec; save(); return rec; },
    get size() { return Object.keys(data.identities).length; },
  };
}
export const identityFile = (env = process.env) => join(env.FTF_DATA_DIR || new URL('../data', import.meta.url).pathname, 'auth', 'identities.json');

// ---- the link decision ----------------------------------------------------------------------------------------------
/**
 * The whole POST /api/auth/link step, pure apart from the injected store, nonces and access-key lookup.
 * body: {kind, address, public_key?, signature, account?: {account_id, public_key, signature, guest_key?}, device_key?,
 *        nonce, expires, choice?: 'existing'|'current', resolve?: token}
 * Answers {status, body}:
 *   200 {status:'new'}                      login known nowhere and no guest given: the browser makes a guest, then links
 *   200 {status:'linked', account_id}       this login now maps to the given guest account
 *   200 {status:'existing', account_id, guest_key}   this login already has an account (another device): use it
 *   409 {status:'conflict', existing, current, resolve}   both exist: the player chooses; nothing is dropped
 */
export function createLinker({ store, nonces, accessKey, now = () => Date.now(), rand = (n) => randomBytes(n) }) {
  const pending = new Map(); // resolve token -> {identity, existing, current, guestKey, exp}
  return async function link(body) {
    if (!body || typeof body !== 'object') return { status: 400, body: { error: 'bad_body' } };
    // a conflict answer: the choice with the token from the 409, no new signature needed
    if (body.resolve) {
      const p = pending.get(body.resolve);
      pending.delete(body.resolve);
      if (!p || p.exp <= now()) return { status: 410, body: { error: 'resolve_expired' } };
      const cur = store.get(p.identity);
      if (body.choice === 'existing') return { status: 200, body: { status: 'existing', account_id: cur ? cur.account : p.existing, guest_key: cur ? cur.guest_key || null : null } };
      if (body.choice === 'current') {
        const history = [...((cur && cur.history) || []), { account: p.existing, guest_key: (cur && cur.guest_key) || null, until: new Date(now()).toISOString() }];
        store.set(p.identity, { ...(cur || {}), account: p.current, guest_key: p.guestKey, linked_at: new Date(now()).toISOString(), history });
        return { status: 200, body: { status: 'linked', account_id: p.current, previous: p.existing } };
      }
      return { status: 400, body: { error: 'bad_choice' } };
    }
    if (!LOGIN_KINDS.includes(body.kind)) return { status: 400, body: { error: 'bad_kind' } };
    if (typeof body.nonce !== 'string' || !/^[0-9a-f]{64}$/.test(body.nonce)) return { status: 400, body: { error: 'bad_nonce' } };
    const expires = nonces.take(body.nonce);
    if (!expires) return { status: 401, body: { error: 'nonce_used_or_expired' } };
    if (body.expires !== expires) return { status: 401, body: { error: 'expiry_mismatch' } };
    const account = body.account && typeof body.account === 'object' ? body.account : null;
    const message = loginMessage({ kind: body.kind, address: String(body.address || ''), account: account ? account.account_id : null, deviceKey: body.device_key || null, nonce: body.nonce, expires });
    const v = await verifyLogin({ kind: body.kind, address: String(body.address || ''), publicKey: body.public_key, signature: body.signature }, message, body.nonce, { accessKey });
    if (!v.ok) return { status: 401, body: { error: v.error } };
    if (account) {
      const g = await verifyGuest(account, message, { accessKey });
      if (!g.ok) return { status: 401, body: { error: g.error } };
    }
    const cur = store.get(v.identity);
    const stamp = new Date(now()).toISOString();
    if (!cur && !account) return { status: 200, body: { status: 'new' } };
    if (!cur) {
      store.set(v.identity, { account: account.account_id, guest_key: account.guest_key || account.public_key, kind: body.kind, address: body.address, linked_at: stamp, history: [] });
      return { status: 200, body: { status: 'linked', account_id: account.account_id } };
    }
    if (!account || account.account_id === cur.account) return { status: 200, body: { status: 'existing', account_id: cur.account, guest_key: cur.guest_key || null } };
    const resolve = Buffer.from(rand(24)).toString('hex');
    if (pending.size > 5000) pending.delete(pending.keys().next().value);
    pending.set(resolve, { identity: v.identity, existing: cur.account, current: account.account_id, guestKey: account.guest_key || account.public_key, exp: now() + AUTH.resolveTtlMs });
    return { status: 409, body: { status: 'conflict', existing: cur.account, current: account.account_id, resolve } };
  };
}
