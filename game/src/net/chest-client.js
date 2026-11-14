// The chest service as the open-case moment sees it (play/chest-open.js): a thin adapter over net/chest.js (the TEE
// worker's browser client for chests.ftf-coordinator.testnet, docs/chests.md). net/chest.js signs the open request
// with the Day-1 guest key, the relayer opens the chest on chain (the outcome is drawn in that block), and the answer
// is re-checked here in the browser: the outcome's leaf and Merkle proof lead to the root committed on chain and the
// draw's random value follows from the on-chain season seed. This adapter only maps the shapes and the reasons.
// No relayer, no opening: nothing is ever invented here.
export const CHEST_OUTCOMES = Object.freeze(['nft', 'item', 'silk', 'xp']);

// Every relayer code has its own plain message (chest.err.<key>); only a code nobody knows falls back to 'bad'.
const REASON = Object.freeze({ need_guest: 'no_guest', not_your_key: 'no_key', not_configured: 'soon', chest_not_configured: 'soon', season_not_ready: 'soon',
  daily_cap: 'daily', rate_limited: 'rate', sold_out: 'sold_out', network: 'network', rpc: 'network', timeout: 'network',
  tx_failed: 'tx_failed', no_opening: 'no_opening', stale: 'stale', replayed: 'replayed', deck_mismatch: 'deck_mismatch',
  bad_count: 'request', bad_request_id: 'request', bad_signature: 'request', bad_body: 'request', bad_account: 'request', bad_public_key: 'request' });
/** The plain message keys a chest panel may show (chest.err.<key>). */
export const CHEST_ERRORS = Object.freeze(['off', 'soon', 'rate', 'daily', 'sold_out', 'no_guest', 'no_key', 'network', 'tx_failed', 'no_opening', 'stale', 'replayed', 'deck_mismatch', 'request', 'bad']);
/** The relayer's code → the message key (unknown codes → 'bad'; the real code is logged for Details). Pure. */
export const chestErrorKey = (code) => REASON[code] || (CHEST_ERRORS.includes(code) ? code : 'bad');

/** net/chest.js's answer → the reveal's opening: {index, outcome {kind, id, amount, rarity}, verification, tx, nft, proof}. Pure. */
export function toOpening(r) {
  const o = r.outcome || {};
  return {
    index: r.index, position: r.position,
    outcome: { kind: o.kind, id: o.item || null, amount: o.amount || 0, rarity: o.tier || 'common' },
    verification: { verified: !!r.verified, leafOk: !!(r.check && r.check.leaf_ok), proofOk: !!(r.check && r.check.proof_ok), randomOk: !!(r.check && r.check.random_ok), chainOk: r.check ? !!r.check.proof_ok : null },
    tx: r.tx_hash || null, nft: r.nft ? { contract: r.nft.contract, tokenId: r.nft.token_id } : null,
    proof: r.proof || null,
  };
}

/**
 * @param {{storage?: object, load?: () => Promise<object>}} [o] `load` returns the net/chest.js module (tests pass a fake)
 */
export function createChestClient({ storage = null, load = () => import('./chest.js') } = {}) {
  return {
    available: true, // the answer says when it is not (not_configured / season_not_ready → 'off')
    /** {ok: true, opening} | {ok: false, error: 'off'|'rate'|'sold_out'|'no_guest'|'network'|'bad'} */
    async open() {
      let m; try { m = await load(); } catch { return { ok: false, error: 'network' }; }
      let r; try { r = await m.openChest({ storage }); } catch { return { ok: false, error: 'network' }; }
      if (!r || !r.ok) { if (r && r.reason) console.warn('[chest] relayer code', r.reason); return { ok: false, error: chestErrorKey(r && r.reason), code: (r && r.reason) || null }; }
      if (!r.outcome || !CHEST_OUTCOMES.includes(r.outcome.kind)) return { ok: false, error: 'bad' };
      return { ok: true, opening: toOpening(r) };
    },
    /** Up to 10 at once (one relayer transaction): {ok: true, openings: [opening], cut, batch, tx} | {ok: false, error}. */
    async openMany(count) {
      let m; try { m = await load(); } catch { return { ok: false, error: 'network' }; }
      if (!m.openChests) return { ok: false, error: 'off' };
      let r; try { r = await m.openChests({ storage, count }); } catch { return { ok: false, error: 'network' }; }
      if (!r || !r.ok) { if (r && r.reason) console.warn('[chest] relayer code', r.reason); return { ok: false, error: chestErrorKey(r && r.reason), code: (r && r.reason) || null }; }
      const openings = (r.openings || []).filter((x) => x && x.outcome && CHEST_OUTCOMES.includes(x.outcome.kind)).map(toOpening);
      if (!openings.length) return { ok: false, error: 'bad' };
      return { ok: true, openings, cut: r.cut || null, batch: !!r.batch, tx: r.tx_hash || null };
    },
  };
}

/**
 * Loot NFTs the guest account holds on the chests contract (read-only): {state: 'loaded', items: [{tokenId, title, item, href}]} |
 * {state: 'none'} | {state: 'offline'}.
 * @param {{owner?: string|null, deployment?: object, rpcUrls?: string[], fetch?: Function}} o
 */
export async function readLootNfts({ owner = null, deployment = null, rpcUrls = null, fetch = globalThis.fetch, explorer = 'https://testnet.nearblocks.io' } = {}) {
  const [{ createNearClient }, { DAY1_DEPLOYMENT }, { NEAR_DEPLOYMENT }] = await Promise.all([import('./near.js'), import('./day1-deployment.js'), import('./near-deployment.js')]);
  const dep = deployment || DAY1_DEPLOYMENT;
  if (!owner || !dep || !dep.chests) return { state: 'none' };
  try {
    const near = createNearClient({ contractId: dep.chests, rpcUrls: rpcUrls || NEAR_DEPLOYMENT.rpcUrls, fetch, timeoutMs: 10000 });
    const r = await near.view('nft_tokens_for_owner', { account_id: owner, from_index: '0', limit: 20 });
    const list = Array.isArray(r.value) ? r.value : [];
    // the contract's extra is {season, index, position, tier}: the deck position names the item (play/chest-history.js nftItemAt)
    return { state: 'loaded', items: list.map((tk) => { let x = {}; try { x = JSON.parse((tk.metadata && tk.metadata.extra) || '{}') || {}; } catch { /* plain */ } return { tokenId: tk.token_id, title: (tk.metadata && tk.metadata.title) || tk.token_id, item: x.item || null, tier: x.tier || null, position: Number.isInteger(x.position) ? x.position : null, href: `${explorer}/nft-token/${dep.chests}/${tk.token_id}` }; }) };
  } catch { return { state: 'offline' }; }
}
