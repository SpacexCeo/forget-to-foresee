// The Glass Shoal rules (src/game/shoal-rules.js, src/rpg/shoal-skills.js): quest steps, the ride's leash, the boss's
// phases, damage, the weak point, adds, checkpoints and pickups.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../src/game/shoal-rules.js';
import { shoalSkillsFor, SHOAL_SKILLS, comboStep } from '../../src/rpg/shoal-skills.js';
import { SHOAL_TEXT } from '../../src/locales/shoal.js';

test('the quest unlocks at level 5 and runs its steps in order', () => {
  let s = R.freshShoal();
  assert.equal(R.questOffered(s, 4), false);
  assert.equal(R.questEvent(s, 'accept', 4), s, 'not offered below level 5');
  assert.equal(R.questOffered(s, 5), true);
  assert.equal(R.trackerKey(s, 5), 'shoal.track.offer');
  s = R.questEvent(s, 'accept', 5); assert.equal(s.step, 'find_blade');
  assert.equal(R.questEvent(s, 'stone'), s, 'out of order: unchanged');
  for (const [ev, step] of [['blade', 'reach_stone'], ['stone', 'ride'], ['mount', 'ride'], ['landed', 'defeat'], ['boss_down', 'return'], ['home', 'done']]) {
    s = R.questEvent(s, ev); assert.equal(s.step, step, ev);
  }
  assert.equal(s.title, R.REWARD.title); assert.equal(s.wins, 1); assert.equal(s.blade, true);
  assert.equal(R.questActive(s), false); assert.equal(R.trackerKey(s, 9), null);
});

test('dev jumps: a quest step, the ride or straight into the fight', () => {
  const s = R.freshShoal();
  const a = R.debugJump(s, 'arena'); assert.equal(a.jump, 'arena'); assert.equal(a.save.step, 'defeat'); assert.equal(a.save.blade, true);
  assert.equal(R.questEvent(a.save, 'boss_down').step, 'return', 'a win in the jumped fight still completes the quest');
  const r = R.debugJump(s, 'ride'); assert.equal(r.jump, 'ride'); assert.equal(R.questEvent(r.save, 'landed').step, 'defeat');
  const st = R.debugJump(s, 'reach_stone'); assert.equal(st.jump, null); assert.equal(st.save.step, 'reach_stone');
  assert.equal(R.debugJump(s, 'find_blade').save.blade, false);
  assert.equal(R.debugJump(s, 'bogus').save, s, 'unknown: unchanged');
});

test('a stored save is read safely', () => {
  assert.deepEqual(R.readShoal('nonsense'), R.freshShoal());
  assert.deepEqual(R.readShoal({ v: 2 }), R.freshShoal());
  assert.equal(R.readShoal(JSON.stringify({ v: 1, step: 'bogus' })).step, null);
  assert.equal(R.readShoal(JSON.stringify({ v: 1, step: 'defeat', blade: true })).step, 'defeat');
});

test('the ride stays inside its corridor and lasts 40 to 60 seconds', () => {
  const secs = R.rideSeconds(); assert.ok(secs >= 40 && secs <= 60, String(secs));
  let st = R.freshRide();
  for (let i = 0; i < 2000 && !st.done; i++) {
    st = R.rideStep(st, [1, 1], 1 / 30); // she steers hard right and up all the way
    assert.ok(Math.abs(st.x) <= R.RIDE.halfWidth && st.y <= R.RIDE.maxY && st.y >= R.RIDE.minY);
  }
  assert.equal(st.done, true);
  assert.ok(st.x < R.RIDE.halfWidth, 'the leash holds her off the wall');
  assert.ok(Math.abs(st.t - secs) < 0.2);
  assert.equal(R.rideProgress(st), 1);
});

test('boss phases follow HP and set their checkpoints', () => {
  assert.equal(R.phaseFor(1), 0); assert.equal(R.phaseFor(0.67), 0); assert.equal(R.phaseFor(0.66), 1);
  assert.equal(R.phaseFor(0.4), 1); assert.equal(R.phaseFor(0.33), 2); assert.equal(R.phaseFor(0), 2);
  assert.equal(R.checkpointHp(0), R.BOSS.hp); assert.equal(R.checkpointHp(1), 1980); assert.equal(R.checkpointHp(2), 990);
  assert.equal(R.freshBoss(1).hp, 1980);
});

test('the closed crest shrugs off blows; a dodge opens the weak point', () => {
  const b = R.freshBoss();
  const closed = R.hitBoss(b, 100); assert.equal(closed.dealt, 35);
  const open = R.hitBoss(R.exposeBoss(b), 100); assert.equal(open.dealt, 200);
  assert.equal(R.hitBoss(b, 0).dealt, 0);
  // the weak point closes again with time
  let x = R.exposeBoss(b);
  for (let i = 0; i < 200; i++) x = R.bossStep(x, 0.05, [0, 20]).boss;
  assert.equal(x.exposed, 0);
});

test('crossing a phase line rears the boss up and resets its rotation; death is final', () => {
  let b = { ...R.freshBoss(), hp: 2000, idx: 3, exposed: 1 };
  const r = R.hitBoss(b, 100); // 200 exposed -> 1800 (< 1980)
  assert.equal(r.phaseUp, true); assert.equal(r.boss.phase, 1); assert.equal(r.boss.idx, 0); assert.equal(r.boss.state, 'rest');
  b = { ...R.freshBoss(2), hp: 10 };
  const d = R.hitBoss(b, 100); assert.equal(d.boss.dead, true); assert.equal(d.phaseUp, false);
  assert.deepEqual(R.bossStep(d.boss, 1, [0, 0]).events, []);
});

test('every attack is telegraphed for at least 0.8 s before it strikes', () => {
  for (let ph = 0; ph < 3; ph++) {
    let b = R.freshBoss(ph), tele = null, seen = 0;
    for (let i = 0; i < 4000 && seen < 8; i++) {
      const r = R.bossStep(b, 0.01, [3, 20]); b = r.boss;
      for (const e of r.events) {
        if (e.type === 'telegraph') tele = { at: i, kind: e.attack.kind };
        if (e.type === 'strike') { assert.ok((i - tele.at) * 0.01 >= 0.8 - 1e-6, `phase ${ph} ${tele.kind}`); seen++; }
      }
    }
    assert.ok(seen >= 4, `phase ${ph} struck`);
  }
});

test('danger zones: slam ring, sweep band, lunge line', () => {
  assert.equal(R.inDanger({ kind: 'slam', at: [0, 0] }, 3, 3), true);
  assert.equal(R.inDanger({ kind: 'slam', at: [0, 0] }, 8, 0), false);
  assert.equal(R.inDanger({ kind: 'sweep', at: [0, 0] }, 3, 0), false, 'hugging the body is safe from the sweep');
  assert.equal(R.inDanger({ kind: 'sweep', at: [0, 0] }, 12, 0), true);
  const lunge = { kind: 'lunge', at: [0, 0], dir: [0, 1] };
  assert.equal(R.inDanger(lunge, 1, 20), true); assert.equal(R.inDanger(lunge, 4, 20), false); assert.equal(R.inDanger(lunge, 0, -3), false);
});

test('phase 2 summons adds, they chase and bite, and blows kill them', () => {
  let b = R.freshBoss(1), spawned = false;
  for (let i = 0; i < 3000 && !spawned; i++) { const r = R.bossStep(b, 0.02, [0, 20]); b = r.boss; spawned = r.events.some((e) => e.type === 'spawn'); }
  assert.equal(spawned, true); assert.equal(b.adds.length, 3);
  let adds = b.adds, dmg = 0;
  for (let i = 0; i < 400; i++) { const r = R.addsStep(adds, 0.05, [0, 20]); adds = r.adds; dmg += r.damage; }
  assert.ok(dmg > 0);
  const h = R.hitAdds(adds, [0, 20], 3, 500); assert.equal(h.adds.length, 0); assert.equal(h.killed, 3);
  assert.equal(R.hitAdds(b.adds, [0, 20], 1000, 500, true).killed, 1);
});

test('the hero: dodge spends stamina and grants invulnerable frames; skills cost mana and cool down', () => {
  let h = R.freshHero();
  h = R.startDodge(h); assert.equal(h.stamina, 75);
  const miss = R.hitHero(h, 30); assert.equal(miss.dodged, true); assert.equal(miss.hero.hp, 100);
  for (let i = 0; i < 20; i++) h = R.heroTick(h, 0.05);
  const hit = R.hitHero(h, 30); assert.equal(hit.taken, 30); assert.equal(hit.hero.hp, 70);
  let tired = { ...R.freshHero(), stamina: 10 }; assert.equal(R.startDodge(tired), tired);
  const heavy = shoalSkillsFor('iris').find((s) => s.id === 'loom_heavy');
  const used = R.useSkill(R.freshHero(), heavy); assert.equal(used.mana, 80); assert.equal(R.useSkill(used, heavy), null, 'on cooldown');
  assert.equal(R.useSkill({ ...R.freshHero(), mana: 5 }, heavy), null, 'no mana');
});

test('death returns her to the landing with the boss at its phase checkpoint', () => {
  const r = R.respawnAfterDeath({ ...R.freshBoss(1), hp: 1200, adds: [{ id: 1 }] });
  assert.equal(r.boss.hp, 1980); assert.equal(r.boss.phase, 1); assert.equal(r.boss.adds.length, 0);
  assert.deepEqual(r.at, [...R.ARENA.landing]); assert.equal(r.hero.hp, R.HERO.hp);
});

test('pickups heal, then come back after a while', () => {
  const p = R.pickupAt({}, -18, 8); assert.equal(p.kind, 'hp');
  assert.equal(R.pickupAt({ hp1: 5 }, -18, 8), null);
  assert.deepEqual(R.pickupsTick({ hp1: 0.5 }, 1), {});
  assert.equal(R.pickUp({ ...R.freshHero(), hp: 50 }, 'hp').hp, 85);
  assert.deepEqual(R.clampToArena(100, 0), [R.ARENA.radius, 0]);
});

test('skills: each heroine has three with HUD data; the combo cycles', () => {
  assert.deepEqual(shoalSkillsFor('iris').map((s) => s.id), ['loom_combo', 'loom_heavy', 'loom_dodge']);
  assert.deepEqual(shoalSkillsFor('elise').map((s) => s.id), ['ember_palms', 'gale_discs', 'hover']);
  for (const s of SHOAL_SKILLS) assert.ok(s.slot && s.icon && s.text && s.cooldownMs > 0, s.id);
  assert.deepEqual([1, 2, 3, 4].map(comboStep), [0, 1, 2, 0]);
});

test('every Shoal text exists in all five locales', () => {
  const keys = Object.keys(SHOAL_TEXT.en);
  for (const loc of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(SHOAL_TEXT[loc][k], `${loc} ${k}`);
});
