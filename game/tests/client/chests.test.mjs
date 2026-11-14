// Loot chests (night plan 12.11): drop rules, the bag, the adapter over net/chest.js (its shapes and failure reasons;
// the proof checks themselves are tests/client/chest.test.mjs), the cast hit test, the reveal's honest failure path,
// five locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { rollDrop, chestTier, createChestBag, CHEST_KEY } from '../../src/game/chests.js';
import { createChestClient, toOpening } from '../../src/net/chest-client.js';
import { memoryStorage } from '../../src/ui/storage.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

const OUT = [{ kind: 'item', id: 'gear_brass', rarity: 'common' }];

test('drops: the first beaten monster always drops, then about one in three; the box tier is weighted', () => {
  assert.equal(rollDrop(0.99, 0), true);
  assert.equal(rollDrop(0.99, 3), false); assert.equal(rollDrop(0.1, 3), true);
  assert.equal(chestTier(0.1), 'common'); assert.equal(chestTier(0.9), 'rare'); assert.equal(chestTier(0.995), 'legendary');
});

test('the bag keeps sealed chests across reloads and settles each once', () => {
  const storage = memoryStorage();
  const bag = createChestBag({ storage, now: () => 5 });
  const c = bag.add({ tier: 'rare' });
  assert.equal(bag.sealed().length, 1); assert.equal(c.state, 'sealed');
  const again = createChestBag({ storage });
  assert.equal(again.get(c.id).tier, 'rare');
  assert.ok(again.settle(c.id, { index: 3, outcome: OUT[0] }));
  assert.equal(again.settle(c.id, { index: 4 }), null, 'once');
  assert.equal(createChestBag({ storage }).opened()[0].opening.index, 3);
  assert.ok(JSON.parse(storage.getItem(CHEST_KEY)).chests.length === 1);
});

test('the adapter maps net/chest.js answers and reasons; no answer, no outcome', async () => {
  const fake = (r) => () => Promise.resolve({ openChest: async () => r });
  const c = (r) => createChestClient({ load: fake(r) });
  // every relayer code has its own plain message; only an unknown code is 'bad' (the 13.11 batch failure showed 'bad' for 'rpc')
  for (const [reason, error] of [['need_guest', 'no_guest'], ['not_your_key', 'no_key'], ['replayed', 'replayed'], ['deck_mismatch', 'deck_mismatch'], ['not_configured', 'soon'], ['season_not_ready', 'soon'], ['daily_cap', 'daily'], ['rate_limited', 'rate'], ['sold_out', 'sold_out'], ['network', 'network'], ['tx_failed', 'tx_failed'],
    ['rpc', 'network'], ['stale', 'stale'], ['no_opening', 'no_opening'], ['bad_count', 'request'], ['bad_request_id', 'request'], ['bad_signature', 'request'], ['something_new', 'bad']]) {
    assert.deepEqual(await c({ ok: false, reason }).open(), { ok: false, error, code: reason }, reason);
  }
  { // every message key a panel can show exists in every play locale
    const { CHEST_ERRORS } = await import('../../src/net/chest-client.js');
    for (const lang of ['en', 'ru', 'uk', 'it', 'zh']) {
      const mod = await import(`../../src/play/locales/${lang}.js`); const dict = mod.default || Object.values(mod)[0];
      for (const k of CHEST_ERRORS) assert.ok(typeof dict['chest.err.' + k] === 'string', lang + ' chest.err.' + k);
    }
  }
  assert.deepEqual(await createChestClient({ load: () => Promise.reject(new Error('chunk')) }).open(), { ok: false, error: 'network' });
  assert.equal((await c({ ok: true, outcome: { kind: 'gold' } }).open()).error, 'bad');
  const ans = { ok: true, index: 41, position: 7, outcome: { kind: 'nft', tier: 'rare', item: 'part_gauge', amount: 1 }, nft: { token_id: 's1-41', contract: 'chests.ftf-coordinator.testnet' },
    tx_hash: 'TX', verified: true, check: { ok: true, leaf_ok: true, proof_ok: true, random_ok: true, nft_ok: true }, proof: { leaf: 'aa', proof: [], root: 'bb', random: 'cc' } };
  const r = await c(ans).open();
  assert.equal(r.ok, true);
  assert.deepEqual(r.opening.outcome, { kind: 'nft', id: 'part_gauge', amount: 1, rarity: 'rare' });
  assert.deepEqual(r.opening.verification, { verified: true, leafOk: true, proofOk: true, randomOk: true, chainOk: true });
  assert.deepEqual(r.opening.nft, { contract: 'chests.ftf-coordinator.testnet', tokenId: 's1-41' });
  assert.equal(toOpening({ ...ans, verified: false, check: { proof_ok: true, random_ok: false } }).verification.verified, false);
});

test('cast hits: the lance along its line, the snare in its circle', async () => {
  installDom();
  const { castHits, spawnPoint, MONSTERS } = await import('../../src/scenes/monster-rules.js');
  const lance = { id: 'lance', from: [0, 0, 0], point: [0, 0, 10] };
  assert.equal(castHits(lance, [0.5, 0, 5]), true); assert.equal(castHits(lance, [3, 0, 5]), false); assert.equal(castHits(lance, [0, 0, 12]), false);
  const snare = { id: 'snare', from: [0, 0, 0], point: [5, 0, 5] };
  assert.equal(castHits(snare, [7, 0, 6]), true); assert.equal(castHits(snare, [10, 0, 5]), false);
  let k = 0; const seq = [0.5, 0.5, 0.1, 0.9];
  const p = spawnPoint(() => seq[k++ % seq.length], [0, 55], 9);
  assert.ok(p[0] >= MONSTERS.area.x[0] && p[0] <= MONSTERS.area.x[1] && p[1] >= MONSTERS.area.z[0] && p[1] <= MONSTERS.area.z[1]);
  assert.ok(Math.hypot(p[0], p[1] - 55) >= 9);
});

test('the reveal says why when the service is off, and the chest stays sealed', async () => {
  const { doc } = installDom();
  const { openChestReveal, outcomeView } = await import('../../src/play/chest-open.js');
  const t = (k, a) => (a ? k + JSON.stringify(a) : k);
  assert.equal(outcomeView({ kind: 'nft' }, { t }).frame, 'mythic');
  assert.equal(outcomeView({ kind: 'item', id: 'x', rarity: 'rare' }, { t, items: [{ id: 'x', nameKey: 'item.x', icon: 'x.webp' }], base: '/b/' }).icon, '/b/assets/items/x.webp');
  let settled = 0;
  const r = openChestReveal({ doc, t, chest: { id: 'c', tier: 'common', source: 'monster' }, client: createChestClient({ load: () => Promise.resolve({ openChest: async () => ({ ok: false, reason: 'network' }) }) }), guest: 'g', items: [], onSettled: () => settled++ });
  await new Promise((res) => setTimeout(res, 20));
  // the sealed chest beat (sprint 6.5): no answer, no opening: the chest stops shaking and never opens its lid
  const chestEl = doc.body.querySelector('.co-chest');
  assert.ok(chestEl); assert.doesNotMatch(chestEl.className, /co-opened|co-shake/);
  r.close();
  const out = await r.result;
  assert.deepEqual(out, { ok: false, error: 'network' }); assert.equal(settled, 0);
});

test('chest strings in five locales', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('chest.'));
  assert.ok(keys.length >= 40);
  assert.ok(PLAY_MESSAGES.en['chest.verified.full']);
  for (const loc of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[loc][k], `${loc} ${k}`);
});

test('loot NFTs are read from the chests contract for the guest account; no guest, no read', async () => {
  const { readLootNfts } = await import('../../src/net/chest-client.js');
  assert.deepEqual(await readLootNfts({ owner: null }), { state: 'none' });
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.params.account_id, 'chests.ftf-coordinator.testnet');
    const args = JSON.parse(Buffer.from(body.params.args_base64, 'base64').toString());
    assert.equal(args.account_id, 'cy-8.guests.ftf-coordinator.testnet');
    // the second token carries the contract's real extra {season, index, position, tier}: the position names the item
    const value = [{ token_id: 's1-41', owner_id: args.account_id, metadata: { title: 'Loot NFT #41', extra: '{"item":"part_gauge"}' } },
      { token_id: 's1-63', owner_id: args.account_id, metadata: { title: 'Chest loot #63 (uncommon)', extra: '{"season":"s1","index":63,"position":302,"tier":"uncommon"}' } }];
    return { ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: body.id, result: { result: [...Buffer.from(JSON.stringify(value))], block_height: 1, block_hash: 'h' } }) };
  };
  const r = await readLootNfts({ owner: 'cy-8.guests.ftf-coordinator.testnet', rpcUrls: ['https://rpc.example'], fetch });
  assert.equal(r.state, 'loaded');
  assert.deepEqual(r.items[0], { tokenId: 's1-41', title: 'Loot NFT #41', item: 'part_gauge', tier: null, position: null, href: 'https://testnet.nearblocks.io/nft-token/chests.ftf-coordinator.testnet/s1-41' });
  assert.deepEqual([r.items[1].item, r.items[1].tier, r.items[1].position], [null, 'uncommon', 302]);
  assert.equal((await readLootNfts({ owner: 'x', rpcUrls: ['https://rpc.example'], fetch: async () => { throw new Error('down'); } })).state, 'offline');
});

test('loot on the ground: the rarity palette, beam heights and limits of the sprint spec (6.5)', async () => {
  const { LOOT_FX, LOOT, lootFxOf } = await import('../../src/game/chests.js');
  assert.deepEqual(Object.fromEntries(Object.entries(LOOT_FX).map(([k, v]) => [k, [v.beam, v.color.toString(16), v.ring, v.pulse]])),
    { common: [0, 'b8b8b8', 0, 0], uncommon: [3, '5ccf5c', 0.9, 0], rare: [5, '4aa3ff', 1, 1.6], epic: [7, 'b06cff', 1.1, 1.4], legendary: [10, 'ff9a2e', 1.3, 1.2], mythic: [12, 'ff5c8a', 1.5, 1] });
  assert.equal(LOOT_FX.common.sparkle, 0.5);
  assert.deepEqual([LOOT.maxBeams, LOOT.cullM, LOOT.autoBagS], [12, 40, 30]);
  assert.equal(lootFxOf('nonsense'), LOOT_FX.common);
});
