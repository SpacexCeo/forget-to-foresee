// Loot chests: the deck is exact, the Merkle proofs hold, the draws are a permutation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildDeck, commitment, leafHash, merkleProof, rootFromProof, replayDraws, drawRandom, seasonSeed, nftTierOf, DECK_SIZE, NFT_SLOTS, ITEMS } from '../lib/chest-deck.js';

test('the deck has exactly 10,000 outcomes, 1,000 NFT slots first, items from the manifest', () => {
  const deck = buildDeck();
  assert.equal(deck.length, DECK_SIZE);
  assert.equal(deck.filter((d) => d.kind === 'nft').length, NFT_SLOTS);
  assert.ok(deck.slice(0, NFT_SLOTS).every((d) => d.kind === 'nft') && deck.slice(NFT_SLOTS).every((d) => d.kind !== 'nft'));
  assert.equal(nftTierOf(0), 'legendary'); assert.equal(nftTierOf(59), 'legendary'); assert.equal(nftTierOf(60), 'rare'); assert.equal(nftTierOf(299), 'rare'); assert.equal(nftTierOf(300), 'uncommon'); assert.equal(nftTierOf(999), 'uncommon'); assert.equal(nftTierOf(1000), null);
  const manifest = JSON.parse(readFileSync(new URL('../../game/public/assets/items/manifest.json', import.meta.url))).items;
  for (const [rarity, ids] of Object.entries(ITEMS)) for (const id of ids) assert.equal(manifest.find((m) => m.id === id).rarity, rarity, id);
  for (const d of deck) if (d.item) assert.ok(manifest.some((m) => m.id === d.item), d.item);
});

test('commitment is stable; every proof checks; a changed outcome does not', () => {
  const c = commitment('s1');
  assert.equal(c.root, commitment('s1').root);
  assert.notEqual(c.root, commitment('s2').root);
  assert.equal(c.deck_sha256, createHash('sha256').update(c.lines).digest('hex'));
  const deck = buildDeck();
  for (const i of [0, 1, 59, 999, 1000, 4097, 9998, 9999]) assert.equal(rootFromProof(leafHash('s1', deck[i]), merkleProof(c.levels, i)), c.root, String(i));
  assert.notEqual(rootFromProof(leafHash('s1', { ...deck[1000], amount: 500 }), merkleProof(c.levels, 1000)), c.root);
});

test('draws: a full season visits every position once; replay is deterministic', () => {
  const seed = seasonSeed('0x' + 'ab'.repeat(65), randomBytes(32));
  const openings = Array.from({ length: DECK_SIZE }, (_, k) => ({ index: k, random: drawRandom(seed, k, randomBytes(32)).toString('hex') }));
  const pos = replayDraws(openings);
  assert.equal(new Set(pos).size, DECK_SIZE);
  assert.equal(pos.filter((p) => p < NFT_SLOTS).length, NFT_SLOTS);
  assert.deepEqual(replayDraws(openings.slice(0, 50)), pos.slice(0, 50));
  assert.throws(() => replayDraws([{ index: 1, random: '00'.repeat(32) }]));
});

test('draw vector shared with the contract tests', () => {
  // seed = sha256("ftf-chest-seed-1" || sha256(0xab*65) || 0x01*32); draw 0 with block random 0x02*32; draw 1 with 0x03*32
  const seed = seasonSeed('ab'.repeat(65), Buffer.alloc(32, 1));
  const r0 = drawRandom(seed, 0, Buffer.alloc(32, 2)), r1 = drawRandom(seed, 1, Buffer.alloc(32, 3));
  const pos = replayDraws([{ index: 0, random: r0.toString('hex') }, { index: 1, random: r1.toString('hex') }]);
  assert.equal(seed.toString('hex'), 'a41f9c39bdc47c027e1d0798592501b8a5ac57434f4f69e292ffa5fb4bdf38c8');
  assert.deepEqual(pos, [933, 2901]);
});
