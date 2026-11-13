// Dragon companions for every heroine (docs/companions.md). A dragon is an NFT on the companions contract
// (character-nft, companions.ftf-coordinator.testnet) owned by the heroine token's own account
// (`<token_id>.heroine.ftf-coordinator.testnet`), so it travels with Elise when she changes hands. The relayer mints:
//
//  - "welcome": ONE dragon for every heroine, once, right after the Day 1 guest and heroine mint. The kind
//    (nacre / rill / cinder) is seeded by the guest account, so the same guest always gets the same dragon.
//  - "boss":    a second dragon, of another kind, once the guest's stored expedition log (hash chain verified with the
//    shared rules) shows the first boss down: a crownrift kill or the boss quest done.
//
// Every claim is a request the guest signs with its own browser key: "ftf-companion|<account>|<at>|<reason>". The
// relayer checks the signature, that the key is an access key of that account (view_access_key) and that the guests
// contract maps that key to that account with a minted heroine; the heroine token comes from the contract, never from
// the request. The token id is fixed per heroine and reason, so a claim is idempotent: an existing dragon is returned
// without a transaction, and the contract itself refuses a second token with the same id.
//
// Key: FTF_COMPANION_KEY, a function-call key of the companions contract account (method nft_mint only), which the
// owner adds as a minter (add_minter). Made on the server with `node scripts/chest-key.mjs FTF_COMPANION_KEY`.
import { b58decode, createTxClient, importSecretKey, sha256 } from './near-tx.js';
import { loadLog } from './pass-eligibility.js';
import { verifyLog } from './expedition-rules/expedition-log.js';

export const COMPANION = Object.freeze({
  companions: 'companions.ftf-coordinator.testnet', heroine: 'heroine.ftf-coordinator.testnet', guests: 'guests.ftf-coordinator.testnet',
  maxSkewMs: 5 * 60 * 1000, gas: 30_000_000_000_000n,
});
export const DRAGON_KINDS = Object.freeze(['nacre', 'rill', 'cinder']);
export const REASONS = Object.freeze(['welcome', 'boss', 'tournament']);
// "tournament" (owner 13.11, "prove you are real"): the first pet, once per guest, after its first tournament: the town
// contract shows the guest entered that season (has_entered) and the season is settled. The player picks which of
// their heroine NFTs owns it; the relayer checks that heroine is theirs (the guests contract's token, or an NFT the
// account holds on the heroine contract) and mints the pet to that heroine token's account.
const NAMES = Object.freeze({ nacre: 'Nacre', rill: 'Rill', cinder: 'Cinder' });
const ACCOUNT_RE = /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/;

export const companionMessage = (accountId, at, reason, seasonId = '', heroineToken = '') => `ftf-companion|${accountId}|${at}|${reason}` + (reason === 'tournament' ? `|${seasonId}|${heroineToken}` : '');

export const companionEnv = (env = process.env) => ({
  secretKey: env.FTF_COMPANION_KEY || '',
  companions: env.FTF_COMPANIONS_CONTRACT || COMPANION.companions,
  heroine: env.FTF_HEROINE_CONTRACT || COMPANION.heroine,
  guests: env.FTF_GUESTS_CONTRACT || COMPANION.guests,
  logDir: env.FTF_EXPEDITION_DIR || '',
  town: env.FTF_TOWN_CONTRACT || 'ftf-town.testnet',
});

/** Shape check of a claim. */
export function validateClaim(b, now = Date.now()) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'bad_body' };
  if (typeof b.account_id !== 'string' || !ACCOUNT_RE.test(b.account_id)) return { ok: false, error: 'bad_account' };
  if (typeof b.public_key !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(b.public_key)) return { ok: false, error: 'bad_public_key' };
  if (!Number.isSafeInteger(b.at) || Math.abs(now - b.at) > COMPANION.maxSkewMs) return { ok: false, error: 'stale' };
  if (typeof b.signature !== 'string' || b.signature.length > 100) return { ok: false, error: 'bad_signature' };
  const reason = b.reason == null ? 'welcome' : b.reason;
  if (!REASONS.includes(reason)) return { ok: false, error: 'bad_reason' };
  let seasonId = '', heroineToken = '';
  if (reason === 'tournament') {
    if (typeof b.season_id !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(b.season_id)) return { ok: false, error: 'bad_season' };
    if (typeof b.heroine_token !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.heroine_token) || b.heroine_token.length > 64) return { ok: false, error: 'bad_heroine' };
    seasonId = b.season_id; heroineToken = b.heroine_token;
  }
  return { ok: true, accountId: b.account_id, publicKey: b.public_key, at: b.at, signature: b.signature, reason, seasonId, heroineToken, message: companionMessage(b.account_id, b.at, reason, seasonId, heroineToken) };
}

/** ed25519 over the claim message with the request's own public key. */
export async function claimSignatureValid({ publicKey, signature, message }) {
  try {
    const pub = b58decode(publicKey.slice(8)), sig = b58decode(signature);
    if (pub.length !== 32 || sig.length !== 64) return false;
    const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify('Ed25519', key, sig, new TextEncoder().encode(message));
  } catch { return false; }
}

/** The two kinds of a guest: welcome seeded by the account, boss one of the other two. */
export async function dragonKinds(accountId) {
  const h = await sha256(new TextEncoder().encode('ftf-dragon|' + accountId));
  const w = h[0] % 3;
  return { welcome: DRAGON_KINDS[w], boss: DRAGON_KINDS[(w + 1 + (h[1] % 2)) % 3], tournament: DRAGON_KINDS[w] };
}

/** The dragon's token id for a heroine token ("elise-<sub>") and reason: fixed, so a claim mints at most once. */
export function dragonTokenId(heroineTokenId, reason) {
  const sub = String(heroineTokenId).replace(/^elise-/, '');
  const id = (reason === 'boss' ? 'crown-dragon-' : reason === 'tournament' ? 'pet-' : 'dragon-') + sub;
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) && id.length <= 40 ? id : null;
}

/** Whether a stored log shows the first boss down: it verifies, and has a crownrift kill or the boss quest ready/done. Pure. */
export function bossDown(log) {
  if (!Array.isArray(log) || !log.length) return false;
  const v = verifyLog(log);
  if (!v || !v.ok) return false;
  return log.some((e) => (e.kind === 'kill_ticketed' && e.data && e.data.mob === 'crownrift')
    || ((e.kind === 'quest_ready' || e.kind === 'quest_turned_in') && e.data && e.data.questId === 'q_boss'));
}

export function dragonMetadata(kind, reason, heroineTokenId) {
  const name = NAMES[kind];
  return {
    title: `${name}, Elise's dragon`,
    description: reason === 'tournament'
      ? `${name} chose Elise after her first tournament: the Hatchkeeper's first pet. Owned by the heroine NFT ${heroineTokenId}; it moves with her.`
      : reason === 'boss'
      ? `${name} joined Elise after the crownrift fell. Owned by the heroine NFT ${heroineTokenId}; it moves with her.`
      : `${name} flies beside Elise from her first day. Owned by the heroine NFT ${heroineTokenId}; it moves with her.`,
    extra: JSON.stringify({ kind, reason, heroine: heroineTokenId }),
    copies: 1,
  };
}

/**
 * Mints the dragon a verified claim asks for, or returns the one already minted.
 * deps: {cfg (companionEnv + rpcUrls), client?, key?, fetch?, queue?, loadLog?}
 * @returns {Promise<{status, body}>}
 */
export async function claimCompanion(v, deps) {
  const { cfg } = deps, queue = deps.queue || ((fn) => fn());
  if (!cfg.secretKey && !deps.key) return { status: 503, body: { error: 'companion_not_configured' } };
  if (!(await claimSignatureValid(v))) return { status: 401, body: { error: 'bad_signature' } };
  const client = deps.client || createTxClient({ rpcUrls: cfg.rpcUrls, fetch: deps.fetch || globalThis.fetch });
  try { await client.rpc('query', { request_type: 'view_access_key', finality: 'final', account_id: v.accountId, public_key: v.publicKey }); } catch { return { status: 403, body: { error: 'not_your_key' } }; }
  const g = await client.view(cfg.guests, 'guest_of', { public_key: v.publicKey });
  if (!g || g.account_id !== v.accountId) return { status: 403, body: { error: 'not_your_key' } };
  if (!g.minted || !g.token_id) return { status: 409, body: { error: 'no_heroine' } };
  let heroineToken = g.token_id;
  if (v.reason === 'tournament') { // the first pet: one per guest, to the heroine the player picked, after a finished tournament
    const prior = await client.view(cfg.companions, 'nft_token', { token_id: dragonTokenId(g.token_id, 'tournament') }); // one pet per guest (its id follows the guest's own heroine)
    if (prior) { let x = {}; try { x = JSON.parse((prior.metadata && prior.metadata.extra) || '{}'); } catch { /* none */ } return { status: 200, body: { reason: v.reason, kind: x.kind || null, token_id: prior.token_id, owner_id: prior.owner_id, heroine_token: x.heroine || null, contract: cfg.companions, tx_hash: null, already: true } }; }
    const entered = await client.view(cfg.town, 'has_entered', { season_id: v.seasonId, account_id: v.accountId }).catch(() => false);
    const season = entered ? await client.view(cfg.town, 'season', { season_id: v.seasonId }).catch(() => null) : null;
    if (!entered || !season || !season.settled) return { status: 409, body: { error: 'no_tournament' } };
    if (v.heroineToken !== g.token_id) {
      const t = await client.view(cfg.heroine, 'nft_token', { token_id: v.heroineToken }).catch(() => null);
      if (!t || t.owner_id !== v.accountId) return { status: 403, body: { error: 'not_your_heroine' } };
    }
    heroineToken = v.heroineToken;
  }
  const tokenId = dragonTokenId(v.reason === 'tournament' ? g.token_id : heroineToken, v.reason); // the pet's id follows the guest; its owner is the chosen heroine
  if (!tokenId) return { status: 500, body: { error: 'bad_token_id' } };
  const kinds = await dragonKinds(v.accountId), kind = kinds[v.reason];
  const owner = `${heroineToken}.${cfg.heroine}`;
  const answer = (token, tx, already) => ({ status: 200, body: { reason: v.reason, kind, token_id: tokenId, owner_id: token ? token.owner_id : owner, heroine_token: heroineToken, contract: cfg.companions, tx_hash: tx, already } });
  const existing = await client.view(cfg.companions, 'nft_token', { token_id: tokenId });
  if (existing) return answer(existing, null, true);
  if (v.reason === 'boss' && !bossDown((deps.loadLog || loadLog)(cfg.logDir, v.accountId))) return { status: 409, body: { error: 'boss_not_down' } };
  const key = deps.key || (await importSecretKey(cfg.secretKey));
  const send = () => client.call({ key, signerId: cfg.companions, receiverId: cfg.companions, methodName: 'nft_mint', args: { token_id: tokenId, receiver_id: owner, metadata: dragonMetadata(kind, v.reason, heroineToken) }, gas: COMPANION.gas });
  let r;
  try { r = await queue(send); } catch (e) {
    if (e && /InvalidNonce|nonce/i.test(JSON.stringify(e.rpc || e.message))) r = await queue(send); else throw e;
  }
  if (!r.ok) {
    // a concurrent claim may have minted it first: then the token is there and the answer is the same
    const again = await client.view(cfg.companions, 'nft_token', { token_id: tokenId });
    if (again) return answer(again, null, true);
    const f = String(r.failure || '');
    return { status: 502, body: { error: /ERR_NOT_MINTER/.test(f) ? 'not_minter' : 'mint_failed', tx_hash: r.hash } };
  }
  return answer(null, r.hash, false);
}
