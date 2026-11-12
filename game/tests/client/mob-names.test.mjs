// Stone spiders (story TZ §6.8): the skitter is displayed as a "stone spider"; ids, files and events keep "skitter".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { MOB_DISPLAY, MOB_ALIAS, resolveMobId, mobDisplayName } from '../../src/game/mob-names.js';
import { MOB_TYPES } from '../../src/play/mobs.js';

test('every alias resolves to its canonical id, unknown names to null; display strings', () => {
  for (const a of ['spider', 'spiders', 'Stone Spider', ' stone_spider ', 'stone-spider', 'skitter', 'SKITTERS']) assert.equal(resolveMobId(a), 'skitter', a);
  for (const [a, id] of Object.entries(MOB_ALIAS)) assert.equal(resolveMobId(a), id);
  assert.equal(resolveMobId('dragon'), null); assert.equal(resolveMobId(''), null); assert.equal(resolveMobId(7), null);
  assert.equal(mobDisplayName('skitter'), 'stone spider'); assert.equal(mobDisplayName('spider', 10), 'stone spiders');
  assert.equal(mobDisplayName('hulker'), 'hulker'); assert.equal(mobDisplayName('???'), '???');
  for (const id of Object.keys(MOB_TYPES)) assert.ok(MOB_DISPLAY[id], `${id} has a display name`);
  assert.ok(MOB_TYPES.skitter, 'the id itself is unchanged');
});

test('no player-visible locale string says "skitter"; art/mobs/mobs.json carries a display name for all four', () => {
  const dir = new URL('../../src/play/locales/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/^\s*'[^']+':\s*(['"])(.*)\1,?\s*$/gm)) assert.doesNotMatch(m[2], /skitter|скиттер|скітер|窜行兽/i, `${f}: ${m[2].slice(0, 60)}`);
  }
  const mobs = JSON.parse(readFileSync(new URL('../../../art/mobs/mobs.json', import.meta.url), 'utf8'));
  for (const id of ['skitter', 'hulker', 'veilbell', 'crownrift']) assert.ok(mobs[id] && mobs[id].display, `${id} display`);
  assert.equal(mobs.skitter.display, 'stone spider'); assert.equal(mobs.skitter.file, 'mob_skitter.glb', 'file names unchanged');
});

test('salvage (Q2): spiders 30 % with a guarantee on the 7th, deterministic, tables by type, 12 per UTC day', async () => {
  const { salvageRoll, initialSalvage, SALVAGE } = await import('../../src/game/salvage.js');
  // pity: never more than 6 misses in a row over 10,000 seeded spider kills (days rotate so the cap never bites)
  let s = initialSalvage(), run = 0, worst = 0, drops = 0, unc = 0;
  for (let i = 0; i < 10000; i++) {
    const r = salvageRoll(s, { killId: 'k' + i, mob: 'skitter', day: 'd' + Math.floor(i / 10) });
    s = r.state;
    if (r.partId) { drops++; if (SALVAGE.uncommon.includes(r.partId)) unc++; else assert.ok(SALVAGE.common.includes(r.partId)); run = 0; } else worst = Math.max(worst, ++run);
  }
  assert.ok(worst <= 6, `at most 6 misses in a row (${worst})`);
  const rate = drops / 10000; assert.ok(rate > 0.3 && rate < 0.42, `drop rate with the pity ${rate}`);
  assert.ok(Math.abs(unc / drops - 0.15) < 0.03, `uncommon share ${(unc / drops).toFixed(3)}`);
  // a fresh profile: the first part within 7 spider kills, always
  for (let p = 0; p < 200; p++) { let st = initialSalvage(), got = 0; for (let i = 0; i < 7 && !got; i++) { const r = salvageRoll(st, { killId: `p${p}_${i}`, mob: 'spider', day: 'x' }); st = r.state; if (r.partId) got = i + 1; } assert.ok(got >= 1 && got <= 7); }
  // determinism, aliases, no mutation
  const a = salvageRoll(initialSalvage(), { killId: 'same', mob: 'skitter', day: 'x' }), b = salvageRoll(initialSalvage(), { killId: 'same', mob: 'stone spider', day: 'x' });
  assert.deepEqual(a, b);
  const frozen = initialSalvage(); salvageRoll(frozen, { killId: 'z', mob: 'skitter', day: 'x' }); assert.deepEqual(frozen, { miss: 0, day: '', today: 0 });
  // tables by type
  for (let i = 0; i < 300; i++) {
    const c = salvageRoll(initialSalvage(), { killId: 'c' + i, mob: 'crownrift', day: 'x' }).partId;
    assert.ok([...SALVAGE.rare, ...SALVAGE.legendary].includes(c), 'the crownrift always drops a rare or the legendary');
    const h = salvageRoll(initialSalvage(), { killId: 'h' + i, mob: 'hulker', day: 'x' }).partId;
    if (h) assert.ok([...SALVAGE.uncommon, ...SALVAGE.rare].includes(h));
  }
  assert.equal(salvageRoll(initialSalvage(), { killId: 'q', mob: 'dragon', day: 'x' }).partId, null, 'unknown mob: nothing');
  // the daily cap: 12, then nothing until the next UTC day
  let d = initialSalvage(), got = 0;
  for (let i = 0; i < 200; i++) { const r = salvageRoll(d, { killId: 'cap' + i, mob: 'crownrift', day: '2026-11-12' }); d = r.state; if (r.partId) got++; }
  assert.equal(got, SALVAGE.dailyCap);
  assert.ok(salvageRoll(d, { killId: 'next', mob: 'crownrift', day: '2026-11-13' }).partId, 'a new day opens again');
});

test('salvage view (on with the Expedition, off with ?story=0): seven spider kills put a part in the inventory with the toast; flag off creates nothing', async () => {
  const { createSalvageView, SALVAGE_KEY } = await import('../../src/scenes/salvage-view.js');
  const { createInventory } = await import('../../src/game/inventory.js');
  const mem = new Map(), storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const win = new EventTarget(), toasts = [];
  const v = createSalvageView({ scene: null, storage, toast: (x) => toasts.push(x), t: (k) => k, win });
  for (let i = 0; i < 7; i++) win.dispatchEvent(new CustomEvent('ftf:mob-killed', { detail: { type: 'skitter', pos: [0, 0, 0], killId: 'test#' + i } }));
  const inv = createInventory({ storage }), owned = ['part_gear', 'part_spring_coil', 'part_chain_link', 'part_rivet_plate', 'part_spindle', 'part_crank', 'part_valve'].reduce((n, id) => n + inv.count(id), 0);
  assert.ok(owned >= 1, 'a part within seven spider kills'); assert.ok(toasts.includes('story.salvage.found'));
  assert.ok(JSON.parse(mem.get(SALVAGE_KEY)).today >= 1, 'the salvage state is kept');
  win.dispatchEvent(new CustomEvent('ftf:mob-killed', { detail: { type: 'skitter', pos: [0, 0, 0] } }));   // no killId: ignored
  v.dispose();
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(boot, /if \(params\.get\('story'\) !== '0' && !salvageView\) import\('\.\/scenes\/salvage-view\.js'\)/, 'off with ?story=0 (one entry: on by default)');
  const mobs = readFileSync(new URL('../../src/play/mobs.js', import.meta.url), 'utf8');
  assert.match(mobs, /killId: `\$\{SESSION\}:\$\{e\.mob\.id\}#\$\{e\.mob\.lives\}`/, 'a stable kill id per creature and life');
});
