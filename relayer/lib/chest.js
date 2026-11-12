// Loot chests, the relayer side (docs/chests.md): a player's Day 1 guest account asks to open a chest; the relayer
// checks the request is signed by a key of that account, calls `open_chest` on the chest contract with its
// open_chest-only key, and answers with the recorded opening, the outcome at that deck position and its Merkle proof.
import { b58decode, createTxClient, importSecretKey } from './near-tx.js';
import { buildDeck, commitment, leafHash, merkleProof, hexOf } from './chest-deck.js';

export const CHEST_DEFAULTS = Object.freeze({ chests: 'chests.ftf-coordinator.testnet', season: 's1', maxSkewMs: 5 * 60 * 1000 });
const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/;

/** The text a player's key signs to open a chest. */
export const openMessage = (accountId, atMs, count = null, requestId = null) => (count == null ? `ftf-chest-open|${accountId}|${atMs}` : `ftf-chest-open|${accountId}|${atMs}|${count}|${requestId}`);
/** Most openings in one batch transaction, and the gas each open_chest action gets (10 x 28 = 280 of 300 Tgas). */
export const BATCH_MAX = 10;
export const BATCH_ACTION_GAS = 28_000_000_000_000n;

/** Validates {account_id, public_key, at, signature} (signature: base58 ed25519 over openMessage). */
export function validateOpen(b, now = Date.now(), maxSkewMs = CHEST_DEFAULTS.maxSkewMs) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'bad_body' };
  if (typeof b.account_id !== 'string' || !ACCOUNT_RE.test(b.account_id)) return { ok: false, error: 'bad_account' };
  if (typeof b.public_key !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(b.public_key)) return { ok: false, error: 'bad_public_key' };
  if (!Number.isSafeInteger(b.at) || Math.abs(now - b.at) > maxSkewMs) return { ok: false, error: 'stale' };
  if (typeof b.signature !== 'string' || b.signature.length > 100) return { ok: false, error: 'bad_signature' };
  // a batch (count 1-10) signs its count and a request id: "ftf-chest-open|<account>|<at>|<count>|<request id>"
  if (b.count != null && (!Number.isInteger(b.count) || b.count < 1 || b.count > BATCH_MAX)) return { ok: false, error: 'bad_count' };
  if (b.count != null && (typeof b.request_id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(b.request_id))) return { ok: false, error: 'bad_request_id' };
  return { ok: true, accountId: b.account_id, publicKey: b.public_key, at: b.at, signature: b.signature, count: b.count ?? null, requestId: b.count != null ? b.request_id : null };
}

/** ed25519 check of the open request (WebCrypto). */
export async function signatureValid({ accountId, publicKey, at, signature, count = null, requestId = null }) {
  try {
    const pub = b58decode(publicKey.slice(8)), sig = b58decode(signature);
    if (pub.length !== 32 || sig.length !== 64) return false;
    const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, sig, new TextEncoder().encode(openMessage(accountId, at, count, requestId)));
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

/** The chest_opened events of a final outcome, in order: [{index, position, nft}]. */
export function openedEvents(outcome) {
  const out = [];
  for (const r of (outcome && outcome.receipts_outcome) || []) for (const l of (r.outcome && r.outcome.logs) || []) {
    if (!l.startsWith('EVENT_JSON:')) continue;
    try { const j = JSON.parse(l.slice(11)); if (j.standard === 'ftf_chest' && j.event === 'chest_opened') for (const d of j.data) out.push({ index: d.index, position: d.position, nft: !!d.nft, account_id: d.account_id }); } catch { /* not ours */ }
  }
  return out;
}

/** How many chests `account` may still open today (the contract's 30-a-day cap), from its recent openings. */
export function leftToday(openings, cap = 30, nowNs = BigInt(Date.now()) * 1_000_000n) {
  const day = nowNs / 86_400_000_000_000n;
  const used = (openings || []).filter((o) => BigInt(o.at_ns) / 86_400_000_000_000n === day).length;
  return Math.max(0, cap - used);
}

/** Counted separately on purpose: one batch is one transaction with N openings. */
export const chestCounters = { transactions: 0, openings: 0, batches: 0 };
const journal = new Map(); // request id -> the answer (a repeated request never re-sends)

/**
 * Opens up to `count` chests in ONE transaction of `open_chest` actions (owner's batch design; no contract change).
 * The batch is cut to the account's daily allowance and the deck; if the transaction fails as a whole it is retried
 * once with the same count; the openings are read back from the chain's chest_opened events.
 */
export async function openChests({ accountId, publicKey, count, requestId }, { secretKey, chests = CHEST_DEFAULTS.chests, season = CHEST_DEFAULTS.season, rpcUrls, fetch = globalThis.fetch, queue = (fn) => fn(), now = () => Date.now(), client: given = null }) {
  if (!secretKey) return { status: 503, body: { error: 'chest_not_configured' } };
  if (journal.has(requestId)) return journal.get(requestId);
  const client = given || createTxClient({ rpcUrls, fetch });
  try { await client.rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKey }); } catch { return { status: 403, body: { error: 'not_your_key' } }; }
  const info = await client.view(chests, 'season_info', {});
  if (!info || !info.root || !info.seed) return { status: 503, body: { error: 'season_not_ready' } };
  if (info.root !== deckOf(info.season || season).root) return { status: 500, body: { error: 'deck_mismatch' } };
  const left = leftToday(await client.view(chests, 'openings_of', { account_id: accountId }), info.daily_cap || 30, BigInt(now()) * 1_000_000n);
  const n = Math.min(count, BATCH_MAX, left, info.size - info.opened);
  if (n <= 0) return { status: left <= 0 ? 429 : 410, body: { error: left <= 0 ? 'daily_cap' : 'sold_out' } };
  const key = await importSecretKey(secretKey);
  const calls = Array.from({ length: n }, () => ({ methodName: 'open_chest', args: { account_id: accountId }, gas: BATCH_ACTION_GAS }));
  const send = () => client.callMany({ key, signerId: chests, receiverId: chests, calls });
  let r = await queue(send);
  chestCounters.transactions++;
  if (!r.ok) { r = await queue(send); chestCounters.transactions++; } // all-or-nothing: nothing landed, retry once
  if (!r.ok) return { status: 502, body: { error: 'tx_failed', tx_hash: r.hash, failure: String(r.failure || '').slice(0, 160) } };
  const opened = openedEvents(r.outcome).filter((o) => o.account_id === accountId);
  chestCounters.openings += opened.length; chestCounters.batches++;
  const s = info.season || season;
  const answer = { status: 200, body: { requested: count, opened: opened.length, cut: n < count ? (left < count ? 'daily_cap' : 'batch_or_deck') : null, tx_hash: r.hash, transactions: 1, contract: chests, season: s, seed: info.seed.seed,
    openings: opened.map((o) => ({ opening: { index: o.index, position: o.position, nft: o.nft }, ...outcomeAt(s, o.position) })) } };
  journal.set(requestId, answer);
  if (journal.size > 5_000) journal.delete(journal.keys().next().value);
  return answer;
}

export const chestEnv = (env = process.env) => ({
  secretKey: env.FTF_CHEST_KEY || '',
  chests: env.FTF_CHESTS_CONTRACT || CHEST_DEFAULTS.chests,
  season: env.FTF_CHEST_SEASON || CHEST_DEFAULTS.season,
});
