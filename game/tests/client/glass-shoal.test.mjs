// The Glass Shoal rules (src/game/shoal-rules.js, src/rpg/shoal-skills.js): quest steps, the ride's leash, the boss's
// phases, damage, the weak point, adds, checkpoints and pickups.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../src/game/shoal-rules.js';
import { shoalSkillsFor, shoalExtrasFor, SHOAL_SKILLS, comboStep } from '../../src/rpg/shoal-skills.js';
import { SHOAL_TEXT } from '../../src/locales/shoal.js';
import { simulateElise } from './shoal-sim.mjs';

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
  assert.equal(R.checkpointHp(0), R.BOSS.hp); assert.equal(R.checkpointHp(1), Math.round(0.66 * R.BOSS.hp)); assert.equal(R.checkpointHp(2), Math.round(0.33 * R.BOSS.hp));
  assert.equal(R.freshBoss(1).hp, R.checkpointHp(1));
});

test('the closed crest shrugs off blows; a dodge opens the weak point', () => {
  const b = R.freshBoss();
  const closed = R.hitBoss(b, 100); assert.equal(closed.dealt, Math.round(100 * R.BOSS.armor)); assert.ok(R.BOSS.armor < 1);
  const open = R.hitBoss(R.exposeBoss(b), 100); assert.equal(open.dealt, Math.round(100 * R.BOSS.exposedMult)); assert.ok(R.BOSS.exposedMult > 1);
  assert.equal(R.hitBoss(b, 0).dealt, 0);
  // the weak point closes again with time
  let x = R.exposeBoss(b);
  for (let i = 0; i < 200; i++) x = R.bossStep(x, 0.05, [0, 20]).boss;
  assert.equal(x.exposed, 0);
});

test('crossing a phase line rears the boss up and resets its rotation; death is final', () => {
  let b = { ...R.freshBoss(), hp: R.checkpointHp(1) + 20, idx: 3, exposed: 1 };
  const r = R.hitBoss(b, 100); // exposed: well past the phase line
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
  const r = R.respawnAfterDeath({ ...R.freshBoss(1), hp: R.checkpointHp(2) + 50, adds: [{ id: 1 }] });
  assert.equal(r.boss.hp, R.checkpointHp(1)); assert.equal(r.boss.phase, 1); assert.equal(r.boss.adds.length, 0);
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
  assert.deepEqual(shoalExtrasFor('elise').map((s) => s.id), ['lift', 'tempest']); assert.equal(shoalExtrasFor('iris').length, 0);
  for (const s of SHOAL_SKILLS) assert.ok(SHOAL_TEXT.en['shoal.skill.' + s.id], 'label ' + s.id);
  for (const s of SHOAL_SKILLS) assert.ok(s.slot && s.icon && s.text && s.cooldownMs > 0, s.id);
  assert.deepEqual([1, 2, 3, 4].map(comboStep), [0, 1, 2, 0]);
});

test('Elise takes off, climbs under a soft ceiling, and flies slower than she runs, with momentum', () => {
  const h = R.freshHero();
  let fl = R.freshFlight();
  assert.equal(R.takeOff(fl, { ...h, stamina: R.FLIGHT.minStamina - 1 }), fl, 'too tired to take off');
  fl = R.takeOff(fl, h); assert.equal(fl.mode, 'fly'); assert.ok(R.airborne(fl));
  // hold Space: she climbs, but never past the ceiling
  let maxY = 0;
  for (let i = 0; i < 200; i++) { fl = R.flightStep(fl, [0, 0], 1, 100, 0.05).flight; maxY = Math.max(maxY, fl.y); }
  assert.ok(maxY <= R.FLIGHT.ceiling + 1e-9 && maxY > R.FLIGHT.ceiling - 0.5, String(maxY));
  // full stick: the speed builds up over time (momentum) and tops out below the run speed
  let st = { ...fl, vx: 0, vz: 0 };
  const s1 = R.flightStep(st, [1, 0], 0, 100, 0.05).flight; assert.ok(s1.vx > 0 && s1.vx < R.FLIGHT.airSpeed * 0.3, 'not instant');
  for (let i = 0; i < 200; i++) st = R.flightStep(st, [1, 0], 0, 100, 0.05).flight;
  assert.ok(Math.abs(st.vx - R.FLIGHT.airSpeed) < 0.05 && R.FLIGHT.airSpeed < R.HERO.speed);
  assert.ok(Math.abs(st.y - fl.y) < 1e-9, 'no vertical input holds the height');
  // letting go keeps her drifting for a moment
  const drift = R.flightStep(st, [0, 0], 0, 100, 0.05).flight; assert.ok(drift.vx > R.FLIGHT.airSpeed * 0.8);
  // turning banks her into the turn, gently
  let turn = st; for (let i = 0; i < 20; i++) turn = R.flightStep(turn, [0, 1], 0, 100, 0.05).flight;
  assert.ok(Math.abs(turn.bank) > 0.05 && Math.abs(turn.bank) <= R.FLIGHT.bank);
});

test('flight drains stamina (hover < move < climb); at zero she glides down and lands; the ground refills it', () => {
  const fl = { ...R.freshFlight(), mode: 'fly', y: 3 };
  const hover = R.flightStep(fl, [0, 0], 0, 100, 0.05).drain;
  const move = R.flightStep({ ...fl, vx: R.FLIGHT.airSpeed }, [1, 0], 0, 100, 0.05).drain;
  const climb = R.flightStep({ ...fl, vx: R.FLIGHT.airSpeed }, [1, 0], 1, 100, 0.05).drain;
  assert.ok(hover > 0 && hover < move && move < climb, `${hover} ${move} ${climb}`);
  // drained by heroTick, no refill in the air
  let h = R.freshHero();
  h = R.heroTick(h, 1, { drain: hover, air: true }); assert.equal(h.stamina, 100 - hover);
  assert.equal(R.heroTick({ ...h, stamina: 50 }, 1, { air: true }).stamina, 50, 'no refill while gliding');
  assert.equal(R.heroTick({ ...h, stamina: 50 }, 1).stamina, 50 + R.HERO.staminaRegen, 'refills on the ground');
  // stamina gone: glide, no drain, down to the mirror, landed
  let f = fl, landed = false, t = 0;
  let r = R.flightStep(f, [1, 0], 1, 0, 0.05); assert.equal(r.flight.mode, 'glide'); assert.equal(r.drain, 0);
  f = r.flight;
  for (; t < 10 && !landed; t += 0.05) { r = R.flightStep(f, [1, 0], 1, 0, 0.05); f = r.flight; landed = r.landed; }
  assert.equal(landed, true); assert.equal(f.mode, 'ground'); assert.equal(f.y, 0);
  assert.ok(t > 1, 'a glide, not a drop');
  // a released Lift (touch) sinks slowly; the descend key faster; both land
  const slow = R.flightStep(fl, [0, 0], R.releaseVert(), 100, 0.1).flight.y, fast = R.flightStep(fl, [0, 0], -1, 100, 0.1).flight.y;
  assert.ok(fast < slow && slow < fl.y);
  // a stamina orb refills
  assert.equal(R.pickUp({ ...R.freshHero(), stamina: 10 }, 'stamina').stamina, 10 + R.HERO.staminaPickup);
});

test('height matters: rising over a sweep and out of the adds\' reach, but not over a slam', () => {
  const sweep = { kind: 'sweep', at: [0, 0] };
  assert.equal(R.inDanger(sweep, 12, 0, R.BOSS, 0), true);
  assert.equal(R.inDanger(sweep, 12, 0, R.BOSS, R.BOSS.attacks.sweep.reach + 0.5), false);
  assert.equal(R.inDanger({ kind: 'slam', at: [0, 0] }, 1, 1, R.BOSS, R.FLIGHT.ceiling), true, 'the slam reaches the ceiling');
  const adds = [{ id: 1, hp: 100, x: 0, z: 0, cd: 0 }];
  assert.equal(R.addsStep(adds, 0.1, [0.5, 0], R.BOSS, 0).damage, R.BOSS.add.damage);
  assert.equal(R.addsStep(adds, 0.1, [0.5, 0], R.BOSS, 4).damage, 0);
});

test('the Tempest of Embers: charged by blows dealt and taken, ~3 s of pulses that pierce the crest', () => {
  let h = R.freshHero();
  assert.equal(R.ultReady(h), false); assert.equal(R.startUlt(h), h, 'not charged');
  h = { ...h, ult: R.chargeUlt(h.ult, 1000, 0) }; assert.ok(h.ult > 0 && h.ult < R.ULT.max);
  h = { ...h, ult: R.chargeUlt(h.ult, 0, 100) }; h = { ...h, ult: R.chargeUlt(h.ult, 1e6, 0) };
  assert.equal(h.ult, R.ULT.max, 'capped'); assert.equal(R.ultReady(h), true);
  const u = R.startUlt(h); assert.equal(u.ult, 0); assert.ok(u.iframes >= R.ULT.duration);
  assert.ok(R.ULT.duration >= 2.5 && R.ULT.duration <= 3.5);
  // every pulse lands once over its length, however the frames fall
  let n = 0; for (let t = 0; t < R.ULT.duration; t += 1 / 60) n += R.ultPulses(t, t + 1 / 60);
  assert.equal(n, R.ULT.pulses); assert.equal(R.ultPulses(0, R.ULT.duration), R.ULT.pulses);
  // it pierces the closed crest (full damage) and still doubles on the weak point
  const b = R.freshBoss();
  assert.equal(R.hitBoss(b, 100, R.BOSS, { pierce: true }).dealt, 100);
  assert.equal(R.hitBoss(R.exposeBoss(b), 100, R.BOSS, { pierce: true }).dealt, 100 * R.BOSS.exposedMult);
  assert.equal(R.inTempest([0, 0], [R.ULT.radius + 1, 0], 2), true); assert.equal(R.inTempest([0, 0], [R.ULT.radius + 3, 0], 2), false);
});

test('touch aim: the nearest add in range, else the boss', () => {
  assert.deepEqual(R.autoAim([0, 20], []), [...R.ARENA.boss]);
  assert.deepEqual(R.autoAim([0, 20], [{ x: 30, z: 20 }, { x: 3, z: 22 }]), [3, 22]);
  assert.deepEqual(R.autoAim([0, 20], [{ x: 30, z: 20 }]), [...R.ARENA.boss], 'too far: the boss');
});

test('balance: a scripted average Elise beats the Hollow Tide in about 2.5 to 5 minutes', () => {
  const runs = []; for (let s = 1; s <= 12; s++) runs.push(simulateElise(s));
  assert.ok(runs.every((r) => r.won), 'every run wins');
  const t = runs.map((r) => r.seconds).sort((a, b) => a - b), median = t[6];
  // the scripted player stands still and never misses a pickup: a real fight adds walking, aiming and flying
  assert.ok(median >= 150 && median <= 300, `median ${median} s`);
  assert.ok(runs.reduce((a, r) => a + r.ults, 0) / runs.length >= 2, 'the Tempest comes up a few times a fight');
  // a strong player is faster but still needs a while
  const good = []; for (let s = 1; s <= 8; s++) good.push(simulateElise(s, { aim: 0.8, dodge: 0.7, evade: 0.2 }).seconds);
  assert.ok(good.sort((a, b) => a - b)[4] >= 75, 'not a melt');
});

test('every Shoal text exists in all five locales', () => {
  const keys = Object.keys(SHOAL_TEXT.en);
  for (const loc of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(SHOAL_TEXT[loc][k], `${loc} ${k}`);
});
