// Loot chests, the relayer side (docs/chests.md): a player's Day 1 guest account asks to open a chest; the relayer
// checks the request is signed by a key of that account, calls `open_chest` on the chest contract with its
// open_chest-only key, and answers with the recorded opening, the outcome at that deck position and its Merkle proof.
import { b58decode, createTxClient, importSecretKey } from './near-tx.js';
import { buildDeck, commitment, leafHash, merkleProof, hexOf } from './chest-deck.js';

export const CHEST_DEFAULTS = Object.freeze({ chests: 'chests.ftf-coordinator.testnet', season: 's1', maxSkewMs: 5 * 60 * 1000 });
const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/;

/** The text a player's key signs to open a chest. */
export const openMessage = (accountId, atMs) => `ftf-chest-open|${accountId}|${atMs}`;

/** Validates {account_id, public_key, at, signature} (signature: base58 ed25519 over openMessage). */
export function validateOpen(b, now = Date.now(), maxSkewMs = CHEST_DEFAULTS.maxSkewMs) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'bad_body' };
  if (typeof b.account_id !== 'string' || !ACCOUNT_RE.test(b.account_id)) return { ok: false, error: 'bad_account' };
  if (typeof b.public_key !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(b.public_key)) return { ok: false, error: 'bad_public_key' };
  if (!Number.isSafeInteger(b.at) || Math.abs(now - b.at) > maxSkewMs) return { ok: false, error: 'stale' };
  if (typeof b.signature !== 'string' || b.signature.length > 100) return { ok: false, error: 'bad_signature' };
  return { ok: true, accountId: b.account_id, publicKey: b.public_key, at: b.at, signature: b.signature };
}

/** ed25519 check of the open request (WebCrypto). */
export async function signatureValid({ accountId, publicKey, at, signature }) {
  try {
    const pub = b58decode(publicKey.slice(8)), sig = b58decode(signature);
    if (pub.length !== 32 || sig.length !== 64) return false;
    const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, sig, new TextEncoder().encode(openMessage(accountId, at)));
  } catch { return false; }
}

/** Remembers used signatures for the skew window (one opening per signed request). */
export function createReplayGuard(ttlMs = 2 * CHEST_DEFAULTS.maxSkewMs, now = () => Date.now()) {
  const seen = new Map();
  return { use(sig) { const t = now(); for (const [k, at] of seen) if (t - at > ttlMs) seen.delete(k); if (seen.has(sig)) return false; seen.set(sig, t); return true; } };
}

let cached = null;
/** Deck + Merkle levels of a season, built once per process. */
export function deckOf(season) {
  if (!cached || cached.season !== season) { const c = commitment(season); cached = { season, deck: buildDeck(), levels: c.levels, root: c.root }; }
  return cached;
}

/** The outcome at a deck position with its leaf and Merkle proof. */
export function outcomeAt(season, position) {
  const { deck, levels, root } = deckOf(season);
  const d = deck[position];
  return { outcome: { kind: d.kind, tier: d.tier, item: d.item || null, amount: d.amount }, leaf: hexOf(leafHash(season, d)), proof: merkleProof(levels, position), root };
}

/** Decodes a function call's JSON return value from a final outcome. */
export function returnValue(outcome) {
  const v = outcome && outcome.status && outcome.status.SuccessValue;
  if (!v) return null;
  try { return JSON.parse(Buffer.from(v, 'base64').toString('utf8')); } catch { return null; }
}

/**
 * Opens one chest for a checked request. Answers {status, body}.
 * @param {{accountId: string, publicKey: string}} req
 * @param {{secretKey: string, chests?: string, season?: string, rpcUrls: string[], fetch?: Function, queue?: Function}} o
 */
export async function openChest({ accountId, publicKey }, { secretKey, chests = CHEST_DEFAULTS.chests, season = CHEST_DEFAULTS.season, rpcUrls, fetch = globalThis.fetch, queue = (fn) => fn() }) {
  if (!secretKey) return { status: 503, body: { error: 'chest_not_configured' } };
  const client = createTxClient({ rpcUrls, fetch });
  // the request's key must be an access key of that account (the guest's browser key)
  try { await client.rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKey }); } catch { return { status: 403, body: { error: 'not_your_key' } }; }
  const info = await client.view(chests, 'season_info', {});
  if (!info || !info.root || !info.seed) return { status: 503, body: { error: 'season_not_ready' } };
  if (info.opened >= info.size) return { status: 410, body: { error: 'sold_out' } };
  if (info.root !== deckOf(info.season || season).root) return { status: 500, body: { error: 'deck_mismatch' } };
  const key = await importSecretKey(secretKey);
  const send = () => client.call({ key, signerId: chests, receiverId: chests, methodName: 'open_chest', args: { account_id: accountId }, gas: 100_000_000_000_000n });
  let r;
  try { r = await queue(send); } catch (e) {
    if (e && /InvalidNonce|nonce/i.test(JSON.stringify(e.rpc || e.message))) r = await queue(send); else throw e;
  }
  if (!r.ok) {
    const f = String(r.failure || '');
    const code = /ERR_DAILY/.test(f) ? 'daily_cap' : /ERR_SOLD_OUT/.test(f) ? 'sold_out' : 'tx_failed';
    return { status: code === 'daily_cap' ? 429 : code === 'sold_out' ? 410 : 502, body: { error: code, tx_hash: r.hash } };
  }
  const opening = returnValue(r.outcome);
  if (!opening) return { status: 502, body: { error: 'no_opening', tx_hash: r.hash } };
  return { status: 200, body: { opening, ...outcomeAt(info.season || season, opening.position), season: info.season || season, contract: chests, tx_hash: r.hash, seed: info.seed.seed } };
}

export const chestEnv = (env = process.env) => ({
  secretKey: env.FTF_CHEST_KEY || '',
  chests: env.FTF_CHESTS_CONTRACT || CHEST_DEFAULTS.chests,
  season: env.FTF_CHEST_SEASON || CHEST_DEFAULTS.season,
});
