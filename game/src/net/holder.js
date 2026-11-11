// Holder access (audit QW-6, NFTs track "NFTs that do something"): read-only. Any NEAR testnet account id is checked
// with `nft_tokens_for_owner` on the game's three NFT contracts; what it holds unlocks visible, cosmetic perks in the
// game menu (a title, an ink-ring frame on the portrait, the Elise portrait). No wallet, no signature, no chain write:
// the perk lives in this browser's storage and is re-checked on demand. Nothing is invented when RPC fails.
import { NEAR_DEPLOYMENT } from './near-deployment.js';
import { DAY1_DEPLOYMENT } from './day1-deployment.js';
import { createTxClient } from './near-tx.js';

export const JUDGE_ACCOUNT = 'lambada_eth.testnet';
export const HOLDER_KEY = 'ftf.holder.v1';
const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

export const isAccountId = (s) => typeof s === 'string' && s.length >= 2 && s.length <= 64 && ACCOUNT_RE.test(s);

/** The contracts read, in order: kind -> contract id. */
export function holderContracts(deployment = NEAR_DEPLOYMENT, day1 = DAY1_DEPLOYMENT) {
  const out = [];
  if (deployment && deployment.shardContractId) out.push({ kind: 'shard', contractId: deployment.shardContractId });
  if (day1 && day1.agents) out.push({ kind: 'agent', contractId: day1.agents });
  if (day1 && day1.heroine) out.push({ kind: 'heroine', contractId: day1.heroine });
  return out;
}

/** Perks from the tokens an account holds (pure). */
export function perksFor(tokens) {
  const has = (k) => tokens.some((x) => x.kind === k);
  const perks = [];
  if (has('shard')) perks.push('ring');      // the shard's ink ring frames the portrait
  if (has('heroine')) perks.push('elise');   // the player's Elise becomes the portrait
  const title = has('shard') ? 'shardkeeper' : has('agent') ? 'cardholder' : has('heroine') ? 'elise' : null;
  return { title, perks };
}

/**
 * Reads what `account` holds. Returns {state: 'holder'|'none'|'offline'|'invalid', account, tokens, title, perks}.
 * A contract that fails to answer makes the whole result 'offline' unless another one confirmed a token.
 */
export async function checkHolder(account, { deployment = NEAR_DEPLOYMENT, day1 = DAY1_DEPLOYMENT, fetch = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const acc = String(account || '').trim().toLowerCase();
  if (!isAccountId(acc)) return { state: 'invalid', account: acc, tokens: [], title: null, perks: [] };
  const client = createTxClient({ rpcUrls: (deployment && deployment.rpcUrls) || [], fetch, timeoutMs });
  const explorer = ((deployment && deployment.explorer) || 'https://testnet.nearblocks.io').replace(/\/$/, '');
  const tokens = []; let failed = false;
  for (const { kind, contractId } of holderContracts(deployment, day1)) {
    try {
      const list = await client.view(contractId, 'nft_tokens_for_owner', { account_id: acc, limit: 50 });
      for (const t of list || []) {
        if (!t || t.owner_id !== acc) continue; // only what the contract says this account owns
        tokens.push({ kind, contractId, tokenId: t.token_id, title: (t.metadata && t.metadata.title) || t.token_id, href: `${explorer}/nft-token/${contractId}/${encodeURIComponent(t.token_id)}` });
      }
    } catch { failed = true; }
  }
  const state = tokens.length ? 'holder' : failed ? 'offline' : 'none';
  return { state, account: acc, tokens, ...perksFor(tokens) };
}

/** The stored perk (cosmetic, this browser only) or null. */
export function loadHolder(storage) {
  try { const v = JSON.parse((storage && storage.getItem(HOLDER_KEY)) || 'null'); return v && v.account && Array.isArray(v.perks) ? v : null; } catch { return null; }
}
export function saveHolder(storage, r) {
  if (!storage) return;
  try {
    if (r && r.state === 'holder') storage.setItem(HOLDER_KEY, JSON.stringify({ account: r.account, title: r.title, perks: r.perks, tokens: r.tokens.length, checkedAt: Date.now() }));
    else if (storage.removeItem) storage.removeItem(HOLDER_KEY);
  } catch { /* storage blocked: the perk simply does not persist */ }
}
