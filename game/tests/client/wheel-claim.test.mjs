// The wheel's rework (owner, 12.11): sectors show their prizes, a spin waits as a pending result until Claim puts it
// into the real stores (persisted, survives a reload), and the grand prize (the Sheriffchenko NFT skin) mints through
// the relayer or stays pending with its reason. Rules: game/wheel.js; screen: play/wheel-view.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEGMENTS, odds, createWheel, claimPrize, SKIN_CAP } from '../../src/game/wheel.js';
import { createInventory } from '../../src/game/inventory.js';
import { createChestBag } from '../../src/game/chests.js';
import { memoryStorage } from '../../src/ui/storage.js';
import { installDom } from '../lib/mini-dom.mjs';
import en from '../../src/play/locales/en.js';
import ru from '../../src/play/locales/ru.js';
import uk from '../../src/play/locales/uk.js';
import it from '../../src/play/locales/it.js';
import zh from '../../src/play/locales/zh.js';

const MANIFEST = JSON.parse(readFileSync(new URL('../../public/assets/items/manifest.json', import.meta.url), 'utf8')).items;
const fakeLedger = () => { const l = { silk: 0, xp: 0, grant({ silk = 0, xp = 0 }) { l.silk += silk; l.xp += xp; } }; return l; };
/** A wheel whose next spin lands on `segId` (searches wheel ids; the rules stay seeded and honest). */
function wheelLanding(segId, storage) {
  for (let k = 0; k < 20000; k++) {
    const s = memoryStorage(); const w = createWheel({ storage: s, random: () => k / 20000 });
    const r = w.spin(MANIFEST);
    if (r.segment.id === segId) { storage.setItem('ftf.wheel.v1', JSON.stringify({ ...JSON.parse(s.getItem('ftf.wheel.v1')) })); return createWheel({ storage }); }
  }
  throw new Error('no wheel id lands on ' + segId);
}

test('twelve sectors, one grand prize (the NFT skin), a chest; odds sum to 100 % and are shown', () => {
  assert.equal(SEGMENTS.length, 12);
  const grand = SEGMENTS.filter((s) => s.grand);
  assert.equal(grand.length, 1); assert.equal(grand[0].kind, 'skin'); assert.equal(grand[0].skin, 'sheriffchenko');
  assert.ok(SEGMENTS.some((s) => s.kind === 'chest'));
  assert.ok(Math.abs(odds().reduce((a, o) => a + o.p, 0) - 1) < 1e-12);
  assert.equal(odds().find((o) => o.id === 'skin_sheriffchenko').p, 0.005);
  assert.equal(SKIN_CAP, 100);
  for (const s of SEGMENTS) assert.ok(s.rarity, s.id + ' has a rarity colour');
});

test('a spin waits until Claim; claimed prizes land in the real stores and persist', async () => {
  const storage = memoryStorage();
  const w = createWheel({ storage, random: () => 0.3 });
  const r = w.spin(MANIFEST);
  assert.equal(w.pending.length, 1); assert.equal(w.pending[0].seed, r.seed);
  assert.equal(createWheel({ storage }).pending.length, 1, 'an unclaimed result survives a reload');
  assert.equal(w.spin(MANIFEST), null, 'no more spins today anyway');
  const inventory = createInventory({ storage }), ledger = fakeLedger(), chests = createChestBag({ storage });
  const c = await claimPrize(w, r.seed, { inventory, ledger, chests });
  assert.ok(c.ok);
  assert.equal(w.pending.length, 0); assert.equal(createWheel({ storage }).pending.length, 0, 'claimed is persisted');
  const seg = r.segment;
  if (seg.kind === 'silk') assert.equal(ledger.silk, seg.amount);
  if (seg.kind === 'xp') assert.equal(ledger.xp, seg.amount);
  if (seg.kind === 'part' || seg.kind === 'shard') assert.equal(createInventory({ storage }).count(r.item.id), 1);
  if (seg.kind === 'chest') assert.equal(createChestBag({ storage }).sealed().length, 1);
  assert.equal((await claimPrize(w, r.seed, { inventory, ledger, chests })).reason, 'gone', 'a prize is claimed once');
});

for (const id of ['silk5', 'xp25', 'chest', 'part_common', 'title']) {
  test(`claim: ${id} goes where it belongs`, async () => {
    const storage = memoryStorage(); const w = wheelLanding(id, storage);
    const p = w.pending[0]; assert.equal(p.segment, id);
    const inventory = createInventory({ storage }), ledger = fakeLedger(), chests = createChestBag({ storage });
    await claimPrize(w, p.seed, { inventory, ledger, chests });
    if (id === 'silk5') assert.equal(ledger.silk, 500);
    if (id === 'xp25') assert.equal(ledger.xp, 25);
    if (id === 'chest') assert.equal(chests.sealed()[0].source, 'wheel');
    if (id === 'part_common') assert.equal(inventory.count(p.item), 1);
    if (id === 'title') assert.ok(w.titles.includes(p.title));
  });
}

test('the grand prize mints through the relayer, or stays pending with its reason (never faked)', async () => {
  const storage = memoryStorage(); const w = wheelLanding('skin_sheriffchenko', storage);
  const seed = w.pending[0].seed;
  let r = await claimPrize(w, seed, { mintSkin: async () => ({ ok: false, reason: 'not_configured' }) });
  assert.deepEqual(r, { ok: false, kind: 'skin', reason: 'not_configured' });
  assert.equal(w.pending[0].status, 'minting'); assert.equal(createWheel({ storage }).pending[0].reason, 'not_configured');
  r = await claimPrize(w, seed, { mintSkin: async () => { throw new Error('down'); } });
  assert.equal(r.reason, 'network');
  r = await claimPrize(w, seed, { mintSkin: async (p) => ({ ok: true, tokenId: 'sheriffchenko-7', txHash: 'abc', seen: p.seed }) });
  assert.deepEqual(r, { ok: true, kind: 'skin', tokenId: 'sheriffchenko-7' });
  assert.equal(w.pending.length, 0); assert.equal(w.history[0].tokenId, 'sheriffchenko-7');
});

test('every new wheel label exists in five locales', () => {
  const keys = ['wheel.claim', 'wheel.claimRetry', 'wheel.cap', 'wheel.kind.title', 'wheel.skin.note', 'wheel.skin.pending', ...SEGMENTS.map((s) => 'wheel.seg.' + s.id),
    ...['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].map((r) => 'wheel.rarity.' + r),
    ...['not_configured', 'sold_out', 'rate', 'invalid', 'network', 'need_guest', 'already_owned'].map((r) => 'wheel.skin.reason.' + r)];
  for (const [n, m] of Object.entries({ en, ru, uk, it, zh })) for (const k of keys) assert.ok(typeof m[k] === 'string' && m[k], `${n} ${k}`);
});

test('screen: sectors show icons and amounts; spin lands on the result; claim empties the card; pending returns', async () => {
  const { doc } = installDom();
  doc.createElementNS = (ns, tag) => doc.createElement(tag);
  const { renderWheel, landingAngle, pegAt, sectorLabel } = await import('../../src/play/wheel-view.js');
  assert.equal(((landingAngle(0, 3) % 360) + 360) % 360, 270, 'sector 3 under the pointer');
  assert.ok(landingAngle(725, 0) >= 725 + 360 * 5, 'always several full turns forward');
  assert.equal(pegAt(0), 0); assert.equal(pegAt(30), 1);
  assert.equal(sectorLabel(SEGMENTS[0], (k) => k), '5'); assert.equal(sectorLabel(SEGMENTS[3], (k) => k), '25 XP'); assert.equal(sectorLabel(SEGMENTS[11], (k) => k), 'NFT');
  const storage = memoryStorage(); const w = createWheel({ storage, random: () => 0.42 });
  const inventory = createInventory({ storage }), ledger = fakeLedger(), chests = createChestBag({ storage });
  const cues = [];
  const t = (k, a) => (en[k] || k).replace(/\{(\w+)\}/g, (_, x) => (a && a[x] != null ? a[x] : ''));
  const v = renderWheel({ doc, t, wheel: w, items: MANIFEST, base: '/', inventory, ledger, chests, cue: (c) => cues.push(c), reduced: true });
  doc.body.append(v.root);
  const sectors = v.root.querySelectorAll('.wv-sector');
  assert.equal(sectors.length, 12);
  assert.ok(sectors.filter((s) => s.querySelector('image')).length >= 4, 'item sectors show item icons');
  assert.ok(v.root.querySelector('.wv-grand'), 'the grand prize sector is special');
  const r = v.spin();
  assert.ok(r); assert.equal(((v.angle % 360) + 360) % 360, ((360 - r.index * 30) % 360));
  const card = v.root.querySelector('.wv-card');
  assert.equal(card.hidden, false); assert.ok(card.querySelector('.wv-claim'));
  assert.ok(v.root.querySelector('.wv-go').disabled, 'claim before the next spin');
  const v2 = renderWheel({ doc, t, wheel: createWheel({ storage }), items: MANIFEST, base: '/', inventory, ledger, chests, reduced: true });
  assert.equal(v2.root.querySelector('.wv-card').hidden, false, 'the unclaimed result is back after a reload');
  if (!r.segment.grand) { await v.claim(r.seed); assert.equal(card.hidden, true); assert.equal(w.pending.length, 0); assert.ok(cues.includes('gift_chime')); }
});

test('with a guest account the wheel id is bound to it (the relayer re-derives the roll from the seed)', async () => {
  const { wheelIdFor, spinResult } = await import('../../src/game/wheel.js');
  const storage = memoryStorage();
  const w0 = createWheel({ storage, random: () => 0.1 }); const local = w0.id;
  const w = createWheel({ storage, account: 'ann-7.ftf-guests.testnet' });
  assert.equal(w.id, wheelIdFor('ann-7.ftf-guests.testnet')); assert.notEqual(w.id, local);
  assert.match(w.nextSeed, new RegExp('^' + w.id + '-'));
  const r = w.spin(MANIFEST); assert.equal(spinResult(r.seed, MANIFEST).index, r.index, 'anyone can recompute the roll');
  assert.equal(createWheel({ storage, account: 'ann-7.ftf-guests.testnet' }).id, w.id, 'stable');
});
