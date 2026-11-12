// Loot chests, the browser side (docs/chests.md). The player's Day 1 guest key signs an open request; the relayer
// opens the chest on chests.<coordinator>.testnet, where the outcome is drawn at that moment; this module then
// re-checks in the browser that the outcome's Merkle proof leads to the root committed on chain and that the draw's
// random value follows from the on-chain season seed. (The full replay of every draw is tools/verify-chest.)
// Every failure resolves to {ok: false, reason}; the caller keeps its local fallback. Loaded lazily.
import { b58encode, createTxClient, importSecretKey } from './near-tx.js';
import { sha256Hex, unhex, hex } from './tee-crypto.js';
import { DAY1_DEPLOYMENT } from './day1-deployment.js';
import { NEAR_DEPLOYMENT } from './near-deployment.js';
import { guestFrom } from './agent-ledger.js';
import { relayerUrl } from './tee-agent.js';

export const CHEST_DECK_VERSION = 'ftf-chest-1';
export const chestContract = (dep = DAY1_DEPLOYMENT) => (dep && dep.chests) || null;
const explorer = (h) => 'https://testnet.nearblocks.io/txns/' + h;
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/** Whether the relayer can open chests (one health call per page). */
let health = null;
export function chestAvailable({ base = relayerUrl(), fetch = globalThis.fetch } = {}) {
  if (!base || typeof fetch !== 'function' || !chestContract()) return Promise.resolve(false);
  return (health ||= withTimeout(fetch(base + '/api/health'), 6000).then((r) => r.json()).then((j) => !!(j && j.chests && j.chests.configured)).catch(() => false));
}
export const _resetChestHealth = () => { health = null; };

/** Season counters from the contract, or null. */
export async function chestStats({ deployment = DAY1_DEPLOYMENT, fetch = globalThis.fetch, rpcUrls = NEAR_DEPLOYMENT.rpcUrls } = {}) {
  try {
    const i = await createTxClient({ rpcUrls, fetch }).view(chestContract(deployment), 'season_info', {});
    return i ? { season: i.season, opened: i.opened, size: i.size, nft_minted: i.nft_minted, nft_slots: i.nft_slots, daily_cap: i.daily_cap, seeded: !!i.seed } : null;
  } catch { return null; }
}

const bytes = (s) => new TextEncoder().encode(s);
async function sha(b) { return unhex(await sha256Hex(b)); }

/** Leaf hash of an outcome at a position (the same text as relayer/lib/chest-deck.js leafText). */
export const leafOf = (season, position, o) => sha256Hex([CHEST_DECK_VERSION, season, position, o.kind, o.tier, o.item || '', o.amount].join('|'));

/** Root from a leaf (hex) and a proof [{hash, left}]. */
export async function rootOf(leafHex, proof) {
  let h = unhex(leafHex);
  for (const p of proof) { const s = unhex(p.hash); h = await sha(p.left ? new Uint8Array([...s, ...h]) : new Uint8Array([...h, ...s])); }
  return hex(h);
}

/** sha256(seed || index u32 LE || block random), hex. */
export async function drawRandomHex(seedHex, index, blockRandomHex) {
  const ix = new Uint8Array(4); new DataView(ix.buffer).setUint32(0, index, true);
  return sha256Hex(new Uint8Array([...unhex(seedHex), ...ix, ...unhex(blockRandomHex)]));
}

/** Checks a relayer answer against the chain's season_info. {ok, leaf_ok, proof_ok, random_ok}. */
export async function checkOpening(ans, info) {
  const o = ans.opening;
  const leaf = await leafOf(ans.season, o.position, ans.outcome);
  const leaf_ok = leaf === ans.leaf;
  const proof_ok = leaf_ok && info && (await rootOf(leaf, ans.proof)) === info.root;
  const random_ok = !!(info && info.seed) && (await drawRandomHex(info.seed.seed, o.index, o.block_random)) === o.random;
  const nft_ok = o.nft === (ans.outcome.kind === 'nft');
  return { ok: !!(leaf_ok && proof_ok && random_ok && nft_ok), leaf_ok, proof_ok: !!proof_ok, random_ok, nft_ok };
}

/**
 * Opens one chest for this browser's guest account.
 * ok: {ok: true, index, position, outcome: {kind, tier, item, amount}, nft: {token_id, contract} | null, tx_hash, explorer, verified, check, proof}
 * fail: {ok: false, reason: 'need_guest' | 'not_configured' | 'season_not_ready' | 'daily_cap' | 'sold_out' | 'rate_limited' | 'network' | 'tx_failed' | …}
 */
export async function openChest({ storage, deployment = DAY1_DEPLOYMENT, base = relayerUrl(deployment), fetch = globalThis.fetch, rpcUrls = NEAR_DEPLOYMENT.rpcUrls, now = Date.now } = {}) {
  const g = guestFrom(storage);
  if (!g) return { ok: false, reason: 'need_guest' };
  if (!base || !chestContract(deployment)) return { ok: false, reason: 'not_configured' };
  try {
    const key = await importSecretKey(g.secretKey);
    const at = now();
    const signature = b58encode(await key.sign(bytes(`ftf-chest-open|${g.accountId}|${at}`)));
    const r = await withTimeout(fetch(base + '/api/chest/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: g.accountId, public_key: key.publicKey, at, signature }) }), 60000);
    const ans = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, reason: ans.error === 'chest_not_configured' ? 'not_configured' : ans.error || 'network', tx_hash: ans.tx_hash || null };
    const info = await createTxClient({ rpcUrls, fetch }).view(chestContract(deployment), 'season_info', {});
    const check = await checkOpening(ans, info);
    const o = ans.opening;
    return { ok: true, index: o.index, position: o.position, outcome: ans.outcome, nft: o.nft ? { token_id: o.token_id, contract: chestContract(deployment) } : null,
      tx_hash: ans.tx_hash, explorer: explorer(ans.tx_hash), verified: check.ok, check, proof: { leaf: ans.leaf, proof: ans.proof, root: ans.root, random: o.random, block_random: o.block_random, seed: info && info.seed ? info.seed.seed : null } };
  } catch { return { ok: false, reason: 'network' }; }
}

/**
 * Opens up to `count` chests (1-10) in ONE relayer request: the relayer sends one transaction of `open_chest`
 * actions (docs/chests.md "Batch opening"). Each opening is read back from the chain (get_opening) and checked here
 * like a single one. When the relayer has no batch (an older relayer), it opens them one by one instead.
 * ok: {ok: true, openings: [openChest's ok shape], tx_hash, cut, batch} | fail: {ok: false, reason}
 */
export async function openChests({ storage, count, deployment = DAY1_DEPLOYMENT, base = relayerUrl(deployment), fetch = globalThis.fetch, rpcUrls = NEAR_DEPLOYMENT.rpcUrls, now = Date.now, rand = Math.random } = {}) {
  const n = Math.max(1, Math.min(10, Math.floor(Number(count) || 1)));
  const one = async () => {
    const out = [];
    for (let i = 0; i < n; i++) { const r = await openChest({ storage, deployment, base, fetch, rpcUrls, now }); if (!r.ok) { if (!out.length) return r; break; } out.push(r); }
    return { ok: true, openings: out, tx_hash: out.length ? out[out.length - 1].tx_hash : null, cut: out.length < n ? 'stopped' : null, batch: false };
  };
  if (n === 1) return one();
  const g = guestFrom(storage);
  if (!g) return { ok: false, reason: 'need_guest' };
  if (!base || !chestContract(deployment)) return { ok: false, reason: 'not_configured' };
  try {
    const key = await importSecretKey(g.secretKey);
    const at = now();
    const requestId = 'b' + at.toString(36) + Math.floor(rand() * 1e9).toString(36);
    const signature = b58encode(await key.sign(bytes(`ftf-chest-open|${g.accountId}|${at}|${n}|${requestId}`)));
    const r = await withTimeout(fetch(base + '/api/chest/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: g.accountId, public_key: key.publicKey, at, signature, count: n, request_id: requestId }) }), 90000);
    const ans = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (ans.error === 'bad_count' || ans.error === 'bad_signature' || ans.error === 'batch_off') return one(); // a relayer without batches
      return { ok: false, reason: ans.error === 'chest_not_configured' ? 'not_configured' : ans.error || 'network', tx_hash: ans.tx_hash || null };
    }
    if (!Array.isArray(ans.openings)) return ans.opening ? one() : { ok: false, reason: 'network' };
    const client = createTxClient({ rpcUrls, fetch });
    const contract = chestContract(deployment);
    const info = await client.view(contract, 'season_info', {});
    const openings = [];
    for (const x of ans.openings) {
      const full = await client.view(contract, 'get_opening', { index: x.opening.index }).catch(() => null) || x.opening;
      const a = { season: ans.season, opening: full, outcome: x.outcome, leaf: x.leaf, proof: x.proof };
      const check = await checkOpening(a, info).catch(() => ({ ok: false }));
      openings.push({ ok: true, index: full.index, position: full.position, outcome: x.outcome, nft: full.nft ? { token_id: full.token_id, contract } : null,
        tx_hash: ans.tx_hash, explorer: explorer(ans.tx_hash), verified: !!check.ok, check, proof: { leaf: x.leaf, proof: x.proof, root: x.root, random: full.random, block_random: full.block_random, seed: info && info.seed ? info.seed.seed : null } });
    }
    return { ok: true, openings, tx_hash: ans.tx_hash, cut: ans.cut || null, batch: true };
  } catch { return { ok: false, reason: 'network' }; }
}

/** The command anyone runs to check one opening and the whole season so far. */
export const verifyCommand = (index) => `node tools/verify-chest/verify.mjs --index ${index} --attest`;
