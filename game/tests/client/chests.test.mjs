// Loot chests (night plan 12.11): drop rules, the bag, the opening check (leaf + sorted-pair Merkle proof against the
// root), the client's error mapping, the cast hit test, the reveal's honest failure path, five locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installDom } from '../lib/mini-dom.mjs';
import { rollDrop, chestTier, createChestBag, CHEST_KEY } from '../../src/game/chests.js';
import { leafString, verifyOpening, rootFromProof, createChestClient } from '../../src/net/chest-client.js';
import { memoryStorage } from '../../src/ui/storage.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const pair = (a, b) => { const [x, y] = a <= b ? [a, b] : [b, a]; return sha(Buffer.concat([Buffer.from(x, 'hex'), Buffer.from(y, 'hex')])); };
/** A small deck tree and the proof for one index (the same rules as the server). */
function deck(outcomes) {
  const leaves = outcomes.map((o, i) => sha(leafString(i, o)));
  const levels = [leaves];
  while (levels.at(-1).length > 1) { const l = levels.at(-1), n = []; for (let i = 0; i < l.length; i += 2) n.push(i + 1 < l.length ? pair(l[i], l[i + 1]) : l[i]); levels.push(n); }
  const proofFor = (idx) => { const p = []; let i = idx; for (let k = 0; k < levels.length - 1; k++) { const l = levels[k], s = i ^ 1; if (s < l.length) p.push(l[s]); i >>= 1; } return p; };
  return { root: levels.at(-1)[0], leaves, proofFor };
}
const OUT = [{ kind: 'item', id: 'gear_brass', rarity: 'common' }, { kind: 'silk', amount: 25, rarity: 'uncommon' }, { kind: 'nft', id: 'loot-1', rarity: 'legendary' }, { kind: 'xp', amount: 40, rarity: 'common' }, { kind: 'title', id: 'seeker', rarity: 'rare' }];

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

test('an opening verifies only when the leaf and the proof reach the root (and the chain root, when read)', async () => {
  const d = deck(OUT);
  for (let i = 0; i < OUT.length; i++) {
    const op = { index: i, outcome: OUT[i], leaf: d.leaves[i], proof: d.proofFor(i), root: d.root };
    assert.equal(await rootFromProof(op.leaf, op.proof), d.root);
    const v = await verifyOpening(op);
    assert.deepEqual(v, { leafOk: true, proofOk: true, chainOk: null, verified: true });
    assert.equal((await verifyOpening(op, d.root)).chainOk, true);
    assert.equal((await verifyOpening(op, 'ff' + d.root.slice(2))).verified, false, 'another chain root');
  }
  const op = { index: 2, outcome: { ...OUT[2], kind: 'item' }, leaf: d.leaves[2], proof: d.proofFor(2), root: d.root };
  assert.equal((await verifyOpening(op)).verified, false, 'a changed outcome breaks the leaf');
  assert.equal((await verifyOpening({ ...op, outcome: OUT[2], proof: d.proofFor(1) })).verified, false, 'a wrong proof');
  assert.equal((await verifyOpening(null)).verified, false);
});

test('the client: no relayer, no opening; server errors map to honest reasons', async () => {
  assert.deepEqual(await createChestClient({}).open({ guest: 'g', chestId: 'c' }), { ok: false, error: 'off' });
  const fake = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });
  const c = (s, b) => createChestClient({ relayer: 'https://r.example/', fetch: fake(s, b) });
  assert.equal((await c(429, {}).open({ guest: 'g', chestId: 'c' })).error, 'rate');
  assert.equal((await c(409, {}).open({ guest: 'g', chestId: 'c' })).error, 'sold_out');
  assert.equal((await c(503, {}).open({ guest: 'g', chestId: 'c' })).error, 'off');
  assert.equal((await c(200, { outcome: { kind: 'gold' } }).open({ guest: 'g', chestId: 'c' })).error, 'bad');
  assert.equal((await c(200, { index: 1, outcome: OUT[1] }).open({ guest: '', chestId: 'c' })).error, 'no_guest');
  const ok = await c(200, { index: 1, outcome: OUT[1], leaf: 'aa', proof: [], root: 'bb' }).open({ guest: 'g', chestId: 'c' });
  assert.equal(ok.ok, true); assert.equal(ok.opening.index, 1);
  let sent = null;
  await createChestClient({ relayer: 'https://r.example', fetch: async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return { status: 503, ok: false, json: async () => ({}) }; } }).open({ guest: 'g.testnet', chestId: 'c1' });
  assert.deepEqual(sent, { url: 'https://r.example/api/chest/open', body: { guest: 'g.testnet', chestId: 'c1', source: 'monster' } });
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
  const r = openChestReveal({ doc, t, chest: { id: 'c', tier: 'common', source: 'monster' }, client: createChestClient({}), guest: 'g', items: [], onSettled: () => settled++ });
  await new Promise((res) => setTimeout(res, 20));
  r.close();
  const out = await r.result;
  assert.deepEqual(out, { ok: false, error: 'off' }); assert.equal(settled, 0);
});

test('chest strings in five locales', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('chest.'));
  assert.ok(keys.length >= 40);
  for (const loc of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[loc][k], `${loc} ${k}`);
});
