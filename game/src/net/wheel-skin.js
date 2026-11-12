// The wheel's grand prize, the browser side: the "Sheriffchenko" NFT skin, minted on testnet to the player's Day 1
// guest account by the relayer (POST /api/wheel/claim; the contract caps the series at game/wheel.js SKIN_CAP). The
// guest key signs the claim so only the account's owner can claim for it. Every failure resolves to
// {ok: false, reason}; the wheel keeps the prize pending and retries later. Nothing here fakes a mint. Loaded lazily.
import { b58encode, importSecretKey, createTxClient } from './near-tx.js';
import { NEAR_DEPLOYMENT } from './near-deployment.js';
import { DAY1_DEPLOYMENT } from './day1-deployment.js';
import { guestFrom } from './agent-ledger.js';
import { relayerUrl } from './tee-agent.js';

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const bytes = (s) => new TextEncoder().encode(s);
/** Relayer error codes (relayer /api/wheel/claim) -> the wheel's reasons; the rest read as a generic failure. */
const REASON = { wheel_not_configured: 'not_configured', not_found: 'not_configured', sold_out: 'sold_out', already_owned: 'already_owned', rate_limited: 'rate', invalid_spin: 'invalid',
  bad_signature: 'failed', not_your_key: 'failed', stale: 'failed', replayed: 'failed', tx_failed: 'failed', rpc: 'network' };
/** The skin contract (contracts/skin-nft; views skin_info, skin_of). */
export const SKIN_CONTRACT = 'skins.ftf-coordinator.testnet';
export const skinContract = (dep = DAY1_DEPLOYMENT) => (dep && dep.skins) || SKIN_CONTRACT;

/** The text the guest key signs (the relayer checks the same text). */
export const claimText = (accountId, wheelId, seed, at) => `ftf-wheel-claim|${accountId}|${wheelId}|${seed}|${at}`;

/**
 * Claims the skin for this browser's guest account.
 * ok: {ok: true, tokenId, txHash, explorer}; fail: {ok: false, reason: 'need_guest'|'not_configured'|'sold_out'|'already_owned'|'rate'|'invalid'|'network'}
 * @param {{storage: object, wheelId: string, seed: string}} o
 */
export async function claimWheelSkin({ storage, wheelId, seed, deployment = DAY1_DEPLOYMENT, base = relayerUrl(deployment), fetch = globalThis.fetch, now = Date.now } = {}) {
  const g = guestFrom(storage);
  if (!g) return { ok: false, reason: 'need_guest' };
  if (!base || typeof fetch !== 'function') return { ok: false, reason: 'not_configured' };
  try {
    const key = await importSecretKey(g.secretKey);
    const at = now();
    const signature = b58encode(await key.sign(bytes(claimText(g.accountId, wheelId, seed, at))));
    const r = await withTimeout(fetch(base + '/api/wheel/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: g.accountId, public_key: key.publicKey, wheel_id: wheelId, seed, at, signature }) }), 60000);
    const ans = await r.json().catch(() => ({}));
    // the relayer verified the win (every check passed) but cannot mint yet (no minter key): 202 {status: 'mint_pending', verified, recorded, contract, left}
    if (!ans.token_id && (r.status === 202 || ans.pending === true || ans.status === 'pending' || ans.status === 'recorded' || ans.status === 'mint_pending')) return { ok: false, reason: 'recorded', verified: ans.verified === true, left: Number.isFinite(+ans.left) ? +ans.left : null, claimId: ans.claim_id || ans.id || null };
    if (ans.error === 'already_owned') return { ok: false, reason: 'already_owned', tokenId: ans.token_id || null }; // a retry after the mint: the existing token
    if (!r.ok || !ans.token_id) return { ok: false, reason: r.status === 404 ? 'not_configured' : REASON[ans.error] || (r.status >= 500 ? 'network' : 'failed') };
    return { ok: true, tokenId: ans.token_id, txHash: ans.tx_hash || null, contract: ans.contract || skinContract(deployment), explorer: ans.tx_hash ? 'https://testnet.nearblocks.io/txns/' + ans.tx_hash : null };
  } catch { return { ok: false, reason: 'network' }; }
}

/** The series' supply from the contract: {cap, minted, left} or null (not deployed yet, offline). */
export async function skinSupply({ deployment = DAY1_DEPLOYMENT, fetch = globalThis.fetch, rpcUrls = NEAR_DEPLOYMENT.rpcUrls } = {}) {
  try {
    const i = await withTimeout(createTxClient({ rpcUrls, fetch }).view(skinContract(deployment), 'skin_info', {}), 8000);
    return i && Number.isFinite(+i.cap) ? { cap: +i.cap, minted: +i.minted || 0, left: Number.isFinite(+i.left) ? +i.left : Math.max(0, +i.cap - (+i.minted || 0)) } : null;
  } catch { return null; }
}

/** The account's skin token id, or null. */
export async function skinOf(accountId, { deployment = DAY1_DEPLOYMENT, fetch = globalThis.fetch, rpcUrls = NEAR_DEPLOYMENT.rpcUrls } = {}) {
  try { return (await withTimeout(createTxClient({ rpcUrls, fetch }).view(skinContract(deployment), 'skin_of', { account_id: accountId }), 8000)) || null; } catch { return null; }
}
