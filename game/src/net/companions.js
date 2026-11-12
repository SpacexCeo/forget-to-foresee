// Dragon companions owned by the heroine NFT (docs/companion-nft-plan.md): a read-only check of which dragons the
// heroine token's own account holds on the companions contract (character-nft, `companions.ftf-coordinator.testnet`).
// A dragon flies beside the heroine and is shown as "Owned by Elise" only when this read confirms it. Never signs.
import { createNearClient } from './near.js';
import { NEAR_DEPLOYMENT } from './near-deployment.js';
import { DAY1_DEPLOYMENT } from './day1-deployment.js';

export const DRAGON_KINDS = Object.freeze(['nacre', 'rill', 'cinder']);

/** The dragon kind of a token: metadata.extra {kind} first, then the title or the id. Pure. */
export function dragonKind(token) {
  const md = (token && token.metadata) || {};
  try { const x = md.extra ? JSON.parse(md.extra) : null; if (x && DRAGON_KINDS.includes(x.kind)) return x.kind; } catch { /* not JSON */ }
  const hay = `${md.title || ''} ${token && token.token_id || ''}`.toLowerCase();
  return DRAGON_KINDS.find((k) => hay.includes(k)) || null;
}

/** The heroine token's account on the heroine contract: `<token_id>.<contract>`. */
export const heroineAccount = (tokenId, deployment = DAY1_DEPLOYMENT) => (tokenId && deployment && deployment.heroine ? `${tokenId}.${deployment.heroine}` : null);

/**
 * The dragons a heroine token owns: {state: 'loaded', account, dragons: [{tokenId, kind, title, href}]} |
 * {state: 'none'} (no heroine yet or no contract) | {state: 'offline'}.
 * @param {{tokenId?: string|null, deployment?: object, rpcUrls?: string[], fetch?: Function}} o
 */
export async function readCompanions({ tokenId = null, deployment = DAY1_DEPLOYMENT, rpcUrls = NEAR_DEPLOYMENT.rpcUrls, fetch = globalThis.fetch, explorer = 'https://testnet.nearblocks.io' } = {}) {
  const account = heroineAccount(tokenId, deployment);
  if (!account || !deployment.companions) return { state: 'none' };
  try {
    const near = createNearClient({ contractId: deployment.companions, rpcUrls, fetch, timeoutMs: 10000 });
    const r = await near.view('nft_tokens_for_owner', { account_id: account, from_index: '0', limit: 10 });
    const list = Array.isArray(r.value) ? r.value : [];
    const dragons = list.map((tk) => ({ tokenId: tk.token_id, kind: dragonKind(tk), title: (tk.metadata && tk.metadata.title) || tk.token_id, href: `${explorer}/nft-token/${deployment.companions}/${tk.token_id}` })).filter((d) => d.kind);
    return { state: 'loaded', account, dragons };
  } catch { return { state: 'offline' }; }
}
