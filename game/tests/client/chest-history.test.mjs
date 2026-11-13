// The chest history and loot NFT pictures (src/play/chest-history.js, owner 13.11): sealed / opened / archived
// grouping, the archive kept in storage, "dust" leftovers, the verify link, the NFT deck position → item icon (the same
// deck as relayer/lib/chest-deck.js), and the five locales of the new lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupChests, loadArchive, saveArchive, archiveOpened, ARCHIVE_KEY, isDust, outcomeOf, verifyHref, nftItemAt, nftImage, NFT_DECK, nftArt, chestArt, rewardArt } from '../../src/play/chest-history.js';
import { existsSync } from 'node:fs';
import { NFT_TIERS, ITEMS } from '../../../relayer/lib/chest-deck.js';
import { memoryStorage } from '../../src/ui/storage.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

const TX = '7Hq1bQ4zRk9YxV3mW2nT8pL5sD6fG1hJ4kA9cE2uB3';
const sealed = (id, foundAt) => ({ id, tier: 'common', foundAt, state: 'sealed' });
const opened = (id, openedAt, outcome, extra = {}) => ({ id, tier: 'rare', foundAt: 1, openedAt, state: 'opened', opening: { outcome, verified: true, tx: TX, ...extra } });

test('grouping: sealed first-found first, opened newest first, archived ids out of the history, sealed never archived', () => {
  const list = [sealed('s2', 20), opened('o1', 100, { kind: 'xp', amount: 10, rarity: 'common' }), sealed('s1', 10), opened('o2', 300, { kind: 'item', id: 'part_gear', rarity: 'common' }), opened('o3', 200, { kind: 'silk', amount: 25, rarity: 'rare' })];
  const g = groupChests(list, new Set(['o3', 's1']));
  assert.deepEqual(g.sealed.map((c) => c.id), ['s1', 's2']);
  assert.deepEqual(g.opened.map((c) => c.id), ['o2', 'o1']);
  assert.deepEqual(g.archive.map((c) => c.id), ['o3']);
  assert.deepEqual(groupChests(null), { sealed: [], opened: [], archive: [] });
});

test('the archive is kept in storage; "move all opened" takes only opened chests and adds to what is there', () => {
  const storage = memoryStorage();
  assert.equal(loadArchive(storage).size, 0);
  saveArchive(storage, new Set(['old']));
  const ids = archiveOpened(storage, [sealed('s', 1), opened('a', 2, null), opened('b', 3, null)]);
  assert.deepEqual([...ids].sort(), ['a', 'b', 'old']);
  assert.deepEqual([...loadArchive(storage)].sort(), ['a', 'b', 'old']);
  storage.setItem(ARCHIVE_KEY, '{broken'); assert.equal(loadArchive(storage).size, 0);
  assert.equal(loadArchive(null).size, 0);
});

test('outcomes: common silk and XP are dust, the rest is not; the verify link needs a verified, well-formed hash', () => {
  assert.equal(isDust({ kind: 'silk', amount: 5, rarity: 'common' }), true);
  assert.equal(isDust({ kind: 'xp', amount: 10, rarity: 'common' }), true);
  assert.equal(isDust({ kind: 'xp', amount: 25, rarity: 'uncommon' }), false);
  assert.equal(isDust({ kind: 'item', id: 'part_gear', rarity: 'common' }), false);
  assert.equal(isDust({ kind: 'nft', id: 'part_valve', rarity: 'uncommon' }), false);
  const c = opened('x', 5, { kind: 'item', id: 'part_gear', amount: 1, rarity: 'common' });
  assert.deepEqual(outcomeOf(c), { kind: 'item', id: 'part_gear', amount: 1, rarity: 'common', dust: false });
  assert.equal(outcomeOf({ state: 'opened' }), null);
  assert.equal(verifyHref(c), 'https://testnet.nearblocks.io/txns/' + TX);
  assert.equal(verifyHref(opened('y', 5, null, { verified: false })), null);
  assert.equal(verifyHref(opened('z', 5, null, { tx: 'javascript:alert(1)' })), null);
});

test('the NFT deck here equals the relayer deck: tiers, counts and items in order', () => {
  assert.deepEqual(NFT_DECK.map((t) => [t.tier, t.n]), NFT_TIERS.map(([t, n]) => [t, n]));
  for (const t of NFT_DECK) assert.deepEqual([...t.items], ITEMS[t.tier]);
  assert.deepEqual(nftItemAt(0), { item: 'shard_amber_crown', tier: 'legendary' });
  assert.deepEqual(nftItemAt(61), { item: 'shard_violet_spire', tier: 'rare' });
  assert.deepEqual(nftItemAt(302), { item: 'part_spindle', tier: 'uncommon' });
  assert.equal(nftItemAt(1000), null); assert.equal(nftItemAt(-1), null); assert.equal(nftItemAt('x'), null);
});

test('an NFT picture: the item icon from its deck position, else the rarity frame alone (tier from the title)', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../public/assets/items/manifest.json', import.meta.url), 'utf8')).items;
  const p = nftImage({ title: 'Chest loot #63 (uncommon)', tier: 'uncommon', position: 302 }, manifest);
  assert.equal(p.item, 'part_spindle'); assert.equal(p.rarity, 'uncommon'); assert.equal(p.exact, true);
  assert.equal(p.src, 'icons/nft_part_spindle_256.webp'); assert.equal(p.nameKey, 'item.part_spindle');
  const q = nftImage({ title: 'Chest loot #9 (rare)' }, manifest);
  assert.deepEqual(q, { src: null, item: null, nameKey: null, rarity: 'rare', exact: false });
  // every NFT item has an icon in the manifest
  for (const t of NFT_DECK) for (const id of t.items) assert.ok(nftImage({ item: id }, manifest).exact, id);
});

test('the new chest lines exist in all five locales', () => {
  const keys = ['chest.noneSealed', 'chest.history', 'chest.archiveAll', 'chest.archiveAll.tip', 'chest.more', 'chest.archive', 'chest.dust', 'chest.dust.tip', 'chest.from', 'chest.verifyShort'];
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[loc][k], `${loc} ${k}`);
});

test('painted art: every NFT item, chest tier and deck silk/XP pile has its webp on disk', () => {
  const at = (rel) => existsSync(new URL('../../public/assets/items/' + rel, import.meta.url));
  for (const t of NFT_DECK) for (const id of t.items) { assert.ok(at(nftArt(id)), id); assert.ok(at(rewardArt({ kind: 'nft', id }, 128)), id + ' 128'); }
  assert.equal(nftArt('shard_pearl_drop'), null, 'common items are never NFTs');
  for (const tier of ['common', 'rare', 'legendary', 'odd']) assert.ok(at(chestArt(tier)), tier);
  assert.equal(chestArt('odd'), 'icons/chest_common_128.webp');
  for (const [kind, n] of [['silk', 5], ['silk', 10], ['silk', 25], ['xp', 10], ['xp', 25]]) for (const size of [128, 256]) assert.ok(at(rewardArt({ kind, amount: n }, size)), kind + n + '@' + size);
  assert.equal(rewardArt({ kind: 'silk', amount: 12 }), 'icons/reward_silk_10_128.webp', 'nearest smaller pile');
  assert.equal(rewardArt({ kind: 'xp', amount: 3 }), 'icons/reward_xp_10_128.webp', 'the smallest pile below the first step');
  assert.equal(rewardArt({ kind: 'item', id: 'part_gear' }), null, 'items keep their own icon');
  assert.equal(rewardArt(null), null);
});
