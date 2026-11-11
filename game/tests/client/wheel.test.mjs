// The wheel, the off-chain inventory and achievements (game/wheel.js, inventory.js, achievements.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEGMENTS, odds, spinResult, createWheel, dayOf } from '../../src/game/wheel.js';
import { createInventory } from '../../src/game/inventory.js';
import { achievementsFor, ACHIEVEMENTS } from '../../src/game/achievements.js';
import { memoryStorage } from '../../src/ui/storage.js';

const MANIFEST = JSON.parse(readFileSync(new URL('../../public/assets/items/manifest.json', import.meta.url), 'utf8')).items;

test('odds sum to 1 and 100 000 seeded spins match the table', () => {
  const o = odds();
  assert.ok(Math.abs(o.reduce((s, x) => s + x.p, 0) - 1) < 1e-12);
  const hits = new Array(SEGMENTS.length).fill(0);
  for (let i = 0; i < 100_000; i++) hits[spinResult('t-' + i, MANIFEST).index]++;
  o.forEach((x, i) => { const got = hits[i] / 100_000; assert.ok(Math.abs(got - x.p) < Math.max(0.006, x.p * 0.15), `${x.id}: ${got} vs ${x.p}`); });
});

test('every part/shard segment has items of its rarity in the manifest; the same seed gives the same prize', () => {
  for (const s of SEGMENTS.filter((x) => x.kind === 'part' || x.kind === 'shard')) assert.ok(MANIFEST.some((m) => m.kind === s.kind && m.rarity === s.rarity), s.id);
  assert.deepEqual(spinResult('abc-1', MANIFEST), spinResult('abc-1', MANIFEST));
});

test('one free spin per day, plus spins earned by play; nothing to buy', () => {
  let t = new Date(2026, 10, 11, 10).getTime(); let earned = 0;
  const storage = memoryStorage();
  const w = createWheel({ storage, now: () => t, earnedFrom: () => earned, random: () => 0.5 });
  assert.deepEqual(w.available, { free: true, earned: 0, total: 1 });
  const seed = w.nextSeed;
  const r = w.spin(MANIFEST); assert.ok(r && r.free && r.seed === seed);
  assert.equal(w.spin(MANIFEST), null, 'no second free spin today');
  earned = 2; assert.equal(w.available.total, 2);
  assert.equal(w.spin(MANIFEST).free, false); assert.equal(w.available.earned, 1);
  t += 24 * 3600 * 1000; assert.equal(w.available.free, true, 'a new day, a new free spin');
  const again = createWheel({ storage, now: () => t, earnedFrom: () => earned });
  assert.equal(again.id, w.id); assert.equal(again.history.length, 2, 'persisted');
  assert.equal(dayOf(new Date(2026, 0, 2, 23, 59).getTime()), '2026-01-02');
  const src = readFileSync(new URL('../../src/game/wheel.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /jackpot|\bbet\b|casino/i);
});

test('inventory: items land, count up, persist, rarest first', () => {
  const storage = memoryStorage();
  const inv = createInventory({ storage });
  inv.add('part_gear'); inv.add('part_gear'); inv.add('shard_amber_crown');
  const again = createInventory({ storage });
  assert.equal(again.count('part_gear'), 2);
  assert.deepEqual(again.list(MANIFEST).map((x) => x.id), ['shard_amber_crown', 'part_gear']);
  assert.equal(again.newest, 'shard_amber_crown');
});

test('achievements derive from recorded stats', () => {
  const a = achievementsFor({ signsRead: 3, trialsVerified: 3, memoriesForgotten: 0, agentsHired: 1, questSteps: 0, spins: 0, distinctItems: 2, eliseMinted: true, level: 2 });
  const by = Object.fromEntries(a.map((x) => [x.id, x]));
  assert.equal(by.first_sign.done, true); assert.equal(by.reader.progress, 0.3); assert.equal(by.verified.done, true);
  assert.equal(by.elise.done, true); assert.equal(by.price.done, false);
  assert.equal(a.length, ACHIEVEMENTS.length);
});
