// The wheel of fortune's grand prize, the relayer side (game/src/game/wheel.js is the game's copy; a test checks the
// two give the same segment for thousands of seeds). The relayer never trusts the browser's roll: it re-derives the
// wheel id from the account, re-rolls the seed, checks the spin number is one the account could have reached, checks
// the request is signed by a key of that account, and only then mints the skin (contracts/skin-nft: cap, one each).
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { b58decode, createTxClient, importSecretKey } from './near-tx.js';

/** Segment ids and weights in wheel order (game/src/game/wheel.js SEGMENTS). */
export const WHEEL_WEIGHTS = Object.freeze([['silk5', 20], ['part_common', 18], ['shard_common', 14], ['xp25', 14], ['part_uncommon', 10], ['chest', 9],
  ['silk15', 6], ['part_rare', 3.5], ['shard_rare', 3], ['title', 1.5], ['part_legendary', 0.5], ['skin_sheriffchenko', 0.5]]);
export const GRAND = 'skin_sheriffchenko';
/** Day 1 of the wheel (UTC): the spin number may not exceed the days since then plus the spins play can earn. */
export const WHEEL_LAUNCH_MS = Date.UTC(2026, 10, 11);
export const EARNED_ALLOWANCE = 20;
export const WHEEL_DEFAULTS = Object.freeze({ skins: 'skins.ftf-coordinator.testnet', maxSkewMs: 5 * 60 * 1000 });

const sha256hex = (s) => createHash('sha256').update(s).digest('hex');
export const wheelIdFor = (accountId) => sha256hex('ftf-wheel:' + accountId).slice(0, 8);

/** game/town-economy.js seededRandom: mulberry32 seeded from sha256('ftf-town:' + seed). */
export function seededRandom(seed) {
  let a = parseInt(sha256hex('ftf-town:' + seed).slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The segment id a seed lands on (game/src/game/wheel.js spinResult, the first draw only). */
export function segmentFor(seed) {
  const rand = seededRandom('wheel:' + seed);
  const tot = WHEEL_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rand() * tot, i = 0;
  for (; i < WHEEL_WEIGHTS.length - 1; i++) { r -= WHEEL_WEIGHTS[i][1]; if (r < 0) break; }
  return WHEEL_WEIGHTS[i][0];
}

/** The highest spin number an account could have reached at time `now`. */
export const maxSpin = (now = Date.now()) => Math.max(1, Math.floor((now - WHEEL_LAUNCH_MS) / 864e5) + 1) + EARNED_ALLOWANCE;

export const claimText = (accountId, wheelId, seed, at) => `ftf-wheel-claim|${accountId}|${wheelId}|${seed}|${at}`;
const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/;

/**
 * Checks a claim body without the network. Returns {ok, accountId, publicKey, seed, n} or {ok: false, error}.
 * Errors: bad_body, bad_account, bad_public_key, stale, bad_signature, invalid_spin.
 */
export async function checkClaim(b, now = Date.now(), maxSkewMs = WHEEL_DEFAULTS.maxSkewMs) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'bad_body' };
  if (typeof b.account_id !== 'string' || !ACCOUNT_RE.test(b.account_id)) return { ok: false, error: 'bad_account' };
  if (typeof b.public_key !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(b.public_key)) return { ok: false, error: 'bad_public_key' };
  if (!Number.isSafeInteger(b.at) || Math.abs(now - b.at) > maxSkewMs) return { ok: false, error: 'stale' };
  if (typeof b.signature !== 'string' || b.signature.length > 100 || typeof b.seed !== 'string' || typeof b.wheel_id !== 'string') return { ok: false, error: 'bad_body' };
  try {
    const pub = b58decode(b.public_key.slice(8)), sig = b58decode(b.signature);
    const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
    if (sig.length !== 64 || !(await crypto.subtle.verify('Ed25519', key, sig, new TextEncoder().encode(claimText(b.account_id, b.wheel_id, b.seed, b.at))))) return { ok: false, error: 'bad_signature' };
  } catch { return { ok: false, error: 'bad_signature' }; }
  const wid = wheelIdFor(b.account_id);
  const m = /^([0-9a-f]{8})-([1-9]\d{0,5})$/.exec(b.seed);
  if (b.wheel_id !== wid || !m || m[1] !== wid) return { ok: false, error: 'invalid_spin' };
  const n = Number(m[2]);
  if (n > maxSpin(now) || segmentFor(b.seed) !== GRAND) return { ok: false, error: 'invalid_spin' };
  return { ok: true, accountId: b.account_id, publicKey: b.public_key, seed: b.seed, n, signature: b.signature };
}

/**
 * Pending claims (the minter key is not on this server yet): one JSON line per verified win in `dir`/wheel-claims.jsonl,
 * so `node scripts/mint-pending.mjs` can mint them once FTF_SKIN_KEY exists. The browser keeps the prize pending too.
 */
export function createClaimLog(dir) {
  return {
    record(c) { try { mkdirSync(dir, { recursive: true }); appendFileSync(join(dir, 'wheel-claims.jsonl'), JSON.stringify(c) + '\n', { mode: 0o600 }); return true; } catch { return false; } },
    list() { try { return readFileSync(join(dir, 'wheel-claims.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } },
  };
}

/** Mints the skin for a checked claim. {status, body}. Without a minter key: 202 {status: 'mint_pending'} after every check. */
export async function mintSkin({ accountId, publicKey, seed, n }, { secretKey, skins = WHEEL_DEFAULTS.skins, rpcUrls, fetch = globalThis.fetch, queue = (fn) => fn(), log = null, now = Date.now, skipKeyCheck = false }) {
  const client = createTxClient({ rpcUrls, fetch });
  if (!skipKeyCheck) try { await client.rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKey }); } catch { return { status: 403, body: { error: 'not_your_key' } }; }
  const owned = await client.view(skins, 'skin_of', { account_id: accountId });
  if (owned) return { status: 409, body: { error: 'already_owned', token_id: owned } };
  const info = await client.view(skins, 'skin_info', {});
  if (info && info.left <= 0) return { status: 410, body: { error: 'sold_out' } };
  if (!secretKey) {
    const recorded = log ? log.record({ account_id: accountId, seed, n, at: new Date(now()).toISOString(), contract: skins }) : false;
    return { status: 202, body: { status: 'mint_pending', verified: true, recorded, contract: skins, left: info ? info.left : null } };
  }
  const key = await importSecretKey(secretKey);
  const send = () => client.call({ key, signerId: skins, receiverId: skins, methodName: 'mint_skin', args: { receiver_id: accountId, claim: seed }, gas: 50_000_000_000_000n });
  let r;
  try { r = await queue(send); } catch (e) { if (e && /nonce/i.test(JSON.stringify(e.rpc || e.message))) r = await queue(send); else throw e; }
  if (!r.ok) { const f = String(r.failure || ''); const code = /ERR_OWNED/.test(f) ? 'already_owned' : /ERR_SOLD_OUT/.test(f) ? 'sold_out' : 'tx_failed'; return { status: code === 'tx_failed' ? 502 : code === 'sold_out' ? 410 : 409, body: { error: code, tx_hash: r.hash } }; }
  const v = r.outcome && r.outcome.status && r.outcome.status.SuccessValue;
  let token = null; try { token = JSON.parse(Buffer.from(v, 'base64').toString()); } catch { token = null; }
  return { status: 200, body: { token_id: token ? token.token_id : null, tx_hash: r.hash, contract: skins } };
}

export const wheelEnv = (env = process.env) => ({ secretKey: env.FTF_SKIN_KEY || '', skins: env.FTF_SKINS_CONTRACT || WHEEL_DEFAULTS.skins, dataDir: env.FTF_DATA_DIR || new URL('../data', import.meta.url).pathname });
