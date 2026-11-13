// Skills (sprint plan 5.7 and 5.8): the 15 nodes, learn rules, branch costs, cast validation order and messages,
// cooldowns with a fake clock (own and global), the active effects, the damage pipeline, respec, hotbar layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NODES, NODE, BASE_SKILLS, BRANCHES, GLOBAL_COOLDOWN_MS } from '../../src/rpg/skills-data.js';
import * as S from '../../src/rpg/skills.js';
import { initialProgress, skillPointsAt, LEVEL_CAP } from '../../src/rpg/progression.js';
import { ACTIONS } from '../../src/play/mobs.js';
import { CASTS } from '../../src/scenes/town-casting-fx.js';

const withLearned = (...ids) => ({ ...initialProgress(), learned: ids });

test('data: 4 base skills on slots 1-4 with the existing timings; 15 nodes, 5 per branch, a chain of requirements', () => {
  assert.deepEqual(BASE_SKILLS.map((s) => [s.id, s.slot]), [['strike', 1], ['lance', 2], ['snare', 3], ['dash', 4]]);
  assert.equal(BASE_SKILLS[0].cooldownMs, ACTIONS.strike.cooldown * 1000); assert.equal(BASE_SKILLS[1].cooldownMs, CASTS.lance.cooldown * 1000);
  assert.equal(BASE_SKILLS[1].mana, 8); assert.equal(BASE_SKILLS[2].mana, 12); assert.equal(BASE_SKILLS[0].mana, 0);
  assert.equal(NODES.length, 15);
  for (const b of BRANCHES) {
    const chain = NODES.filter((n) => n.branch === b.id).sort((x, y) => x.tier - y.tier);
    assert.deepEqual(chain.map((n) => n.tier), [1, 2, 3, 4, 5]);
    assert.deepEqual(chain.map((n) => n.cost), [1, 1, 2, 2, 3]); assert.deepEqual(chain.map((n) => n.level), [2, 3, 5, 7, 10]);
    chain.forEach((n, i) => assert.equal(n.requires, i ? chain[i - 1].id : null));
  }
  assert.equal(NODE.ling_echo.mana, 12); assert.equal(NODE.ling_echo.cooldownMs, 12000); assert.equal(NODE.war_shield.effect.pct, 0.3);
});

test('learn rules: cost, level, requirement, points, double learn; a full branch costs 9; three branches never fit at 20', () => {
  let rec = initialProgress();
  assert.equal(S.canLearn(1, rec, 'ling_diction').reason, 'level');
  assert.equal(S.canLearn(3, rec, 'ling_echo').reason, 'requires');
  assert.equal(S.canLearn(3, rec, 'nope').reason, 'unknown');
  rec = S.learn(2, rec, 'ling_diction').rec;
  assert.equal(S.canLearn(2, rec, 'ling_diction').reason, 'learned');
  assert.equal(S.canLearn(2, rec, 'war_stance').reason, 'points');
  assert.equal(S.pointsLeft(2, rec), 0);
  const full = (b) => NODES.filter((n) => n.branch === b).reduce((a, n) => a + n.cost, 0);
  for (const b of BRANCHES) assert.equal(full(b.id), 9);
  assert.ok(3 * 9 > skillPointsAt(LEVEL_CAP), 'all three branches cost more than the points at the cap');
  // greedy at level 20: learn everything learnable; at least one node stays out of reach
  let r = initialProgress(), changed = true;
  while (changed) { changed = false; for (const n of NODES) { const x = S.learn(20, r, n.id); if (x.ok) { r = x.rec; changed = true; } } }
  assert.ok(r.learned.length < 15); assert.ok(S.pointsLeft(20, r) >= 0);
});

test('cast validation order and messages; mana spent only on success; cooldowns with a fake clock, own and global', () => {
  const rec = withLearned('ling_diction', 'ling_echo');
  let c = S.initialCaster(60), now = 1000;
  assert.equal(S.validateCast(c, rec, 'lance', now, { dead: true }).reason, 'dead');
  assert.equal(S.validateCast(c, rec, 'ling_hush', now).reason, 'unlearned');
  assert.equal(S.validateCast(c, rec, 'ling_diction', now).reason, 'unlearned', 'a passive is never cast');
  assert.equal(S.validateCast(c, rec, 'ling_echo', now).reason, 'target');
  assert.equal(S.validateCast(c, rec, 'ling_echo', now, { target: { dist: 30 } }).reason, 'range');
  assert.equal(S.validateCast({ ...c, mana: 5 }, rec, 'lance', now).key, 'hud.fail.mana');
  const r = S.cast(c, rec, 'lance', now); assert.ok(r.ok); c = r.caster;
  assert.equal(c.mana, 52); assert.equal(r.manaCost, 8);
  assert.equal(S.validateCast(c, rec, 'strike', now + 100).reason, 'cooldown', 'the global cooldown blocks every skill');
  assert.ok(S.cast(c, rec, 'strike', now + GLOBAL_COOLDOWN_MS).ok);
  const cd = S.cooldownLeft(c, 'lance', now + 200); assert.equal(cd.global, false); assert.equal(cd.ms, CASTS.lance.cooldown * 1000 - 200);
  const failed = S.cast({ ...c, mana: 0 }, rec, 'snare', now + 5000); assert.equal(failed.ok, false); assert.equal(failed.caster.mana, 0);
  assert.equal(S.regenMana({ ...c, mana: 59 }, 3, 60, 2).mana, 60);
  const g = S.cooldownLeft(S.cast(S.initialCaster(60), rec, 'dash', 0).caster, 'strike', 100); assert.ok(g.global); assert.equal(g.ms, 400);
});

test('effects on fake combatants: echo, hush, insight, brace, shield, unbroken', () => {
  const now = 10000, self = { hp: 100, maxHP: 120, pos: [0, 0, 0], buffs: {} };
  const caster = S.noteDamage(S.initialCaster(60), 'lance', 30, 'm1');
  const target = { id: 'm1', hp: 50, pos: [3, 0, 0] }, enemies = [target, { id: 'm2', hp: 50, pos: [5, 0, 0], boss: true }, { id: 'm3', hp: 50, pos: [20, 0, 0] }];
  assert.deepEqual(S.applyEffect('ling_echo', { caster, self, target, enemies, now }).hits, [{ id: 'm1', amount: 18 }]);
  const h = S.applyEffect('ling_hush', { caster, self, target, enemies, now }).enemies;
  assert.equal(h[0].silencedUntil, now + 3000); assert.equal(h[1].silencedUntil, now + 1500); assert.equal(h[2].silencedUntil, undefined);
  const marked = S.applyEffect('sch_insight', { caster, self, target, enemies, now }).target;
  assert.deepEqual(marked.mark, { pct: 0.25, until: now + 15000 });
  assert.deepEqual(S.applyEffect('ling_echo', { caster, self, target: marked, enemies, now }).hits, [{ id: 'm1', amount: 23 }], 'the mark adds 25%');
  const burst = S.applyEffect('ling_babel', { caster, self, target, enemies, now, base: { lance: 20 } }).hits;
  assert.deepEqual(burst.map((x) => x.id), ['m1', 'm2']); assert.equal(burst[0].amount, 50);
  const braced = S.applyEffect('war_brace', { caster, self, now }).self;
  assert.equal(S.takeDamage(braced, 20, now + 100, initialProgress()).taken, 13);
  assert.equal(S.takeDamage(braced, 20, now + 5000, initialProgress()).taken, 20, 'brace over after 4 s');
  const shielded = S.applyEffect('war_shield', { caster, self, now }).self;
  assert.equal(shielded.buffs.shield.left, 36);
  const t1 = S.takeDamage(shielded, 30, now, initialProgress()); assert.equal(t1.taken, 0); assert.equal(t1.absorbed, 30);
  const t2 = S.takeDamage(t1.self, 30, now, initialProgress()); assert.equal(t2.absorbed, 6); assert.equal(t2.taken, 24);
  const tough = withLearned('war_stance', 'war_brace', 'war_wind', 'war_shield', 'war_unbroken');
  const u = S.takeDamage({ hp: 10, maxHP: 120, buffs: {} }, 500, now, tough); assert.equal(u.self.hp, 1); assert.ok(u.saved);
  assert.equal(S.takeDamage(u.self, 500, now + 1000, tough).self.hp, 0, 'once per 120 s');
  assert.equal(S.takeDamage({ hp: 100, maxHP: 120, buffs: {} }, 100, now, tough).taken, 95, 'unbroken: −5% always');
});

test('respec: free first, then a 5-minute cooldown; points come back exactly; passives fold into the stats', () => {
  let rec = { ...withLearned('war_stance', 'war_brace'), stats: { voice: 1, mind: 0, grit: 2 } };
  assert.equal(S.statsOf(5, rec).maxHP, Math.round((100 + 48 + 16) * 1.1));
  const a = S.respec(rec, 1000); assert.ok(a.ok && a.free); rec = a.rec;
  assert.deepEqual(rec.learned, []); assert.deepEqual(rec.stats, { voice: 0, mind: 0, grit: 0 }); assert.equal(S.pointsLeft(5, rec), 4);
  const b = S.respec(rec, 1000 + 60000); assert.equal(b.ok, false); assert.equal(b.reason, 'cooldown'); assert.equal(b.waitMs, S.RESPEC_COOLDOWN_MS - 60000);
  const c = S.respec(rec, 1000 + S.RESPEC_COOLDOWN_MS); assert.ok(c.ok); assert.equal(c.free, false);
  assert.equal(S.xpAfterPassives(withLearned('sch_notes'), 20, 'kill'), 22); assert.equal(S.xpAfterPassives(withLearned('sch_notes', 'sch_catalog', 'sch_insight', 'sch_reader'), 100, 'quest'), 115);
  assert.ok(Math.abs(S.damageMult(2, withLearned('ling_diction'), 'lance') - 1.1) < 1e-9);
});

test('hotbar: default layout, learned actives fill slots 5 to 9, placing moves, clean drops junk, respec prunes', () => {
  let bar = S.defaultHotbar();
  assert.deepEqual(bar.slice(0, 4), ['strike', 'lance', 'snare', 'dash']);
  bar = S.assignLearned(bar, 'ling_diction'); assert.equal(bar[4], null, 'a passive never goes on the bar');
  bar = S.assignLearned(bar, 'ling_echo'); assert.equal(bar[4], 'ling_echo');
  bar = S.assignLearned(bar, 'ling_echo'); assert.equal(bar.filter((x) => x === 'ling_echo').length, 1);
  bar = S.placeOnSlot(bar, 8, 'ling_echo'); assert.equal(bar[4], null); assert.equal(bar[8], 'ling_echo');
  assert.deepEqual(S.cleanHotbar(['strike', 'strike', 'junk', 7]), ['strike', null, null, null, null, null, null, null, null]);
  assert.deepEqual(S.cleanHotbar(null), S.defaultHotbar());
  assert.deepEqual(S.pruneHotbar(bar, initialProgress()), ['strike', 'lance', 'snare', 'dash', null, null, null, null, null]);
});
