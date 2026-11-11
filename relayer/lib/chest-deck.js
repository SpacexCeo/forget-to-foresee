// Loot chests (docs/chests.md): the season deck, its Merkle tree, and the draw that the chest contract runs.
// Dependency-free (node:crypto sha256), shared by the relayer, tools/chest and
// tools/verify-chest.
//
// The deck is canonical and public: 10,000 outcomes in a fixed order, NFT slots first (positions 0..999), so the
// supply is exact and anyone can count it. Its Merkle root is committed on chain before the season. Which chest gets
// which position is decided only at opening time, inside the contract, from the season seed (TEE signature mixed
// with a block seed after the commit) and the opening block's random seed: the next outcome is unknown to everyone.
import { createHash } from 'node:crypto';

export const DECK_VERSION = 'ftf-chest-1';
export const DECK_SIZE = 10000;
export const NFT_SLOTS = 1000;
/** NFT tiers by position (the contract has the same bounds). */
export const NFT_TIERS = Object.freeze([['legendary', 60], ['rare', 240], ['uncommon', 700]]);
/** Items per rarity from game/public/assets/items/manifest.json (shards and mechanical parts). */
export const ITEMS = Object.freeze({
  common: ['shard_pearl_drop', 'shard_pearl_tablet', 'part_gear', 'part_spring_coil', 'part_chain_link', 'part_rivet_plate'],
  uncommon: ['shard_teal_twin', 'shard_teal_octa', 'part_spindle', 'part_crank', 'part_valve'],
  rare: ['shard_violet_cluster', 'shard_violet_spire', 'part_gauge', 'part_brass_lens'],
  legendary: ['shard_amber_crown', 'shard_amber_blade', 'part_glyph_cogring'],
});
/** The 9,000 in-game rewards: [kind, tier, item, amount, count]. */
export const REWARDS = Object.freeze([
  ['silk', 'common', '', 5, 2000], ['silk', 'uncommon', '', 10, 1200], ['silk', 'rare', '', 25, 400],
  ['xp', 'common', '', 10, 1500], ['xp', 'uncommon', '', 25, 500],
  ...ITEMS.common.map((id) => ['item', 'common', id, 1, 300]),
  ...ITEMS.uncommon.map((id) => ['item', 'uncommon', id, 1, 200]),
  ...ITEMS.rare.map((id) => ['item', 'rare', id, 1, 150]),
]);

const sha = (x) => createHash('sha256').update(x).digest();
export const hexOf = (b) => Buffer.from(b).toString('hex');

/** The canonical deck for a season: [{position, kind, tier, item, amount}] of exactly DECK_SIZE. */
export function buildDeck() {
  const deck = [];
  const nftItems = { legendary: ITEMS.legendary, rare: ITEMS.rare, uncommon: ITEMS.uncommon };
  for (const [tier, n] of NFT_TIERS) for (let i = 0; i < n; i++) deck.push({ kind: 'nft', tier, item: nftItems[tier][i % nftItems[tier].length], amount: 1 });
  for (const [kind, tier, item, amount, n] of REWARDS) for (let i = 0; i < n; i++) deck.push({ kind, tier, item, amount });
  if (deck.length !== DECK_SIZE || deck.filter((d) => d.kind === 'nft').length !== NFT_SLOTS) throw new Error('deck size');
  return deck.map((d, position) => ({ position, ...d }));
}

/** The leaf string and hash of one outcome. */
export const leafText = (season, d) => [DECK_VERSION, season, d.position, d.kind, d.tier, d.item, d.amount].join('|');
export const leafHash = (season, d) => sha(leafText(season, d));

/** Merkle levels over the leaves: parent = sha256(left || right); an odd last node moves up unchanged. */
export function merkleLevels(leaves) {
  const levels = [leaves];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1], next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? sha(Buffer.concat([cur[i], cur[i + 1]])) : cur[i]);
    levels.push(next);
  }
  return levels;
}

/** Proof for leaf `i`: [{hash, left}] siblings from the bottom (left = the sibling is on the left). */
export function merkleProof(levels, i) {
  const proof = [];
  for (let l = 0; l < levels.length - 1; l++) {
    const cur = levels[l], sib = i ^ 1;
    if (sib < cur.length) proof.push({ hash: hexOf(cur[sib]), left: sib < i });
    i >>= 1;
  }
  return proof;
}

/** Root from a leaf hash and its proof. */
export function rootFromProof(leaf, proof) {
  let h = Buffer.from(leaf);
  for (const p of proof) { const s = Buffer.from(p.hash, 'hex'); h = sha(p.left ? Buffer.concat([s, h]) : Buffer.concat([h, s])); }
  return hexOf(h);
}

/** The whole commitment of a season: root, deck sha256 (of the canonical JSON lines) and counts. */
export function commitment(season, deck = buildDeck()) {
  const levels = merkleLevels(deck.map((d) => leafHash(season, d)));
  const lines = deck.map((d) => leafText(season, d)).join('\n') + '\n';
  return { season, version: DECK_VERSION, size: deck.length, nft: deck.filter((d) => d.kind === 'nft').length, root: hexOf(levels[levels.length - 1][0]), deck_sha256: hexOf(sha(lines)), levels, lines };
}

/** The season seed the contract stores: sha256("ftf-chest-seed-1" || sha256(signature bytes) || block random seed). */
export function seasonSeed(signatureHex, blockRandom32) {
  const sig = Buffer.from(String(signatureHex).replace(/^0x/, ''), 'hex');
  return sha(Buffer.concat([Buffer.from('ftf-chest-seed-1'), sha(sig), Buffer.from(blockRandom32)]));
}

/** One draw's random value: sha256(season seed || opening index as u32 LE || the opening's block random seed). */
export function drawRandom(seed32, index, blockRandom32) {
  const ix = Buffer.alloc(4); ix.writeUInt32LE(index);
  return sha(Buffer.concat([Buffer.from(seed32), ix, Buffer.from(blockRandom32)]));
}

/**
 * Replays the sparse Fisher-Yates draws of openings 0..n-1 (each {index, random}); returns their deck positions.
 * Draw k: remaining = DECK_SIZE - k, j = u64 LE of random[0..8] mod remaining; position = slot j (moved value or j);
 * slot j takes the value of slot remaining-1.
 */
export function replayDraws(openings, size = DECK_SIZE) {
  const moved = new Map(), out = [];
  const at = (i) => (moved.has(i) ? moved.get(i) : i);
  openings.forEach((o, k) => {
    if (o.index !== k) throw new Error('openings must be 0..n-1 in order');
    const remaining = size - k;
    const r = Buffer.from(o.random, 'hex');
    const j = Number(r.readBigUInt64LE(0) % BigInt(remaining));
    const pos = at(j);
    moved.set(j, at(remaining - 1)); moved.delete(remaining - 1 === j ? -1 : remaining - 1);
    out.push(pos);
  });
  return out;
}

export const nftTierOf = (position) => { let b = 0; for (const [tier, n] of NFT_TIERS) { if (position < b + n) return tier; b += n; } return null; };
