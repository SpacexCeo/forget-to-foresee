// The wheel's grand prize, the browser side: the "Sheriffchenko" NFT skin, minted on testnet to the player's Day 1
// guest account by the relayer (POST /api/wheel/claim; the contract caps the series at game/wheel.js SKIN_CAP). The
// guest key signs the claim so only the account's owner can claim for it. Every failure resolves to
// {ok: false, reason}; the wheel keeps the prize pending and retries later. Nothing here fakes a mint. Loaded lazily.
import { b58encode, importSecretKey } from './near-tx.js';
import { DAY1_DEPLOYMENT } from './day1-deployment.js';
import { guestFrom } from './agent-ledger.js';
import { relayerUrl } from './tee-agent.js';

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const bytes = (s) => new TextEncoder().encode(s);
/** Relayer error codes -> the wheel's reasons. */
const REASON = { wheel_not_configured: 'not_configured', not_found: 'not_configured', sold_out: 'sold_out', already_owned: 'already_owned', rate_limited: 'rate', invalid_spin: 'invalid' };

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
    if (!r.ok || !ans.token_id) return { ok: false, reason: r.status === 404 ? 'not_configured' : REASON[ans.error] || 'network' };
    return { ok: true, tokenId: ans.token_id, txHash: ans.tx_hash || null, explorer: ans.tx_hash ? 'https://testnet.nearblocks.io/txns/' + ans.tx_hash : null };
  } catch { return { ok: false, reason: 'network' }; }
}
