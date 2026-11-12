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
  for (const [reason, error] of [['need_guest', 'no_guest'], ['not_configured', 'off'], ['season_not_ready', 'off'], ['daily_cap', 'rate'], ['rate_limited', 'rate'], ['sold_out', 'sold_out'], ['network', 'network'], ['tx_failed', 'bad']]) {
    assert.deepEqual(await c({ ok: false, reason }).open(), { ok: false, error }, reason);
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
  const r = openChestReveal({ doc, t, chest: { id: 'c', tier: 'common', source: 'monster' }, client: createChestClient({ load: () => Promise.resolve({ openChest: async () => ({ ok: false, reason: 'not_configured' }) }) }), guest: 'g', items: [], onSettled: () => settled++ });
  await new Promise((res) => setTimeout(res, 20));
  r.close();
  const out = await r.result;
  assert.deepEqual(out, { ok: false, error: 'off' }); assert.equal(settled, 0);
});

test('chest strings in five locales', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('chest.'));
  assert.ok(keys.length >= 40);
  assert.ok(PLAY_MESSAGES.en['chest.verified.full']);
  for (const loc of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[loc][k], `${loc} ${k}`);
});
