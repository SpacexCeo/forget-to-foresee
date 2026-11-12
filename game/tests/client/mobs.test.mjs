// Monsters outside the walls (play/mobs.js, MobBrain): spawned beyond the walls, wake when Iris comes near, chase and
// strike in range, take the casts' damage (the lance along its line, the snare in its ring with a root), die, report
// the kill, respawn; never leave the leash or cross into the town.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MobBrain, PACKS, MOB_TYPES, LEASH, CAST_DAMAGE, alongLine } from '../../src/play/mobs.js';
import { onField } from '../../src/scenes/town-outside.js';

const O = [0, 1200, 0];
const flat = (x, z, y) => O[1];
const run = (b, secs, iris, dt = 1 / 30) => { const ev = []; for (let t = 0; t < secs; t += dt) ev.push(...b.step(dt, iris, flat)); return ev; };
const local = (p) => [p[0] - O[0], p[2] - O[2]];

test('packs spawn on the field beyond the walls; phones get fewer monsters', () => {
  const b = new MobBrain({ origin: O });
  assert.equal(b.mobs.length, PACKS.reduce((n, p) => n + p.count, 0));
  assert.ok(new MobBrain({ origin: O, phone: true }).mobs.length < b.mobs.length);
  for (const m of b.mobs) assert.ok(onField(...local(m.pos)), m.id);
  assert.ok(b.mobs.some((m) => m.T.elite), 'one elite');
});

test('idle monsters wander but stay in their leash and outside the walls', () => {
  const b = new MobBrain({ origin: O, seed: 3 });
  run(b, 60, null);
  for (const m of b.mobs) { assert.ok(Math.hypot(m.pos[0] - m.pack.home[0], m.pos[2] - m.pack.home[2]) <= LEASH + 1e-6); assert.ok(onField(...local(m.pos))); }
});

test('Iris close by draws a pack in, it strikes in range; she can lead it no further than the leash or the gate', () => {
  const b = new MobBrain({ origin: O, seed: 5 });
  const sk = b.mobs.find((m) => m.type === 'skitter');
  const home = sk.pack.home;
  const iris = { pos: [home[0] + 4, O[1], home[2]], alive: true, outside: true };
  const ev = run(b, 6, iris);
  assert.ok(ev.some((e) => e.kind === 'attack' && e.mob.pack === sk.pack), 'attacks');
  assert.ok(ev.some((e) => e.kind === 'impact' && e.hit), 'lands a hit in range');
  iris.pos = [O[0], O[1], O[2] + 34];          // she runs back to the gate
  run(b, 40, iris);
  for (const m of b.mobs) { assert.ok(onField(...local(m.pos))); assert.ok(Math.hypot(m.pos[0] - m.pack.home[0], m.pos[2] - m.pack.home[2]) <= LEASH + 1e-6); }
});

test('the Frost Lance hits along its line (later further away), the Storm Snare in its ring and roots', () => {
  const b = new MobBrain({ origin: O, seed: 9 });
  const m = b.mobs.find((x) => x.type === 'hulker');
  const from = [m.pos[0], m.pos[1], m.pos[2] - 6];
  assert.ok(alongLine(from, [0, 1], m.pos).along > 5.9);
  b.cast({ id: 'lance', from, dir: [0, 1], point: m.pos });
  let ev = b.step(0.1, null, flat);
  assert.ok(!ev.some((e) => e.kind === 'hit' && e.mob === m), 'not yet: the front is still on its way');
  ev = run(b, 0.5, null);
  assert.equal(m.hp, MOB_TYPES.hulker.hp - CAST_DAMAGE.lance);
  b.cast({ id: 'snare', from, dir: [0, 1], point: [m.pos[0] + 1, m.pos[1], m.pos[2]] });
  run(b, 0.5, null);
  assert.equal(m.hp, MOB_TYPES.hulker.hp - CAST_DAMAGE.lance - CAST_DAMAGE.snare);
  assert.ok(m.root > 0, 'rooted');
});

test('a kill: death, then the fall is reported once, then the pack respawns after its timer', () => {
  const b = new MobBrain({ origin: O, seed: 2 });
  const m = b.mobs.find((x) => x.type === 'crownrift');
  const ev = [];
  b.damage(m, 9999, ev);
  assert.equal(m.state, 'dead'); assert.ok(ev.some((e) => e.kind === 'death'));
  const after = run(b, 4, null);
  assert.equal(after.filter((e) => e.kind === 'killed' && e.mob === m).length, 1);
  assert.equal(m.state, 'gone');
  const back = run(b, m.pack.respawn + 1, { pos: [0, 0, 0], alive: true, outside: false });
  assert.ok(back.some((e) => e.kind === 'respawn' && e.mob === m)); assert.equal(m.hp, MOB_TYPES.crownrift.hp);
});

test('the elite does not stagger; the others flinch', () => {
  const b = new MobBrain({ origin: O });
  const e = b.mobs.find((x) => x.type === 'crownrift'), s = b.mobs.find((x) => x.type === 'skitter');
  b.damage(e, 10, []); b.damage(s, 10, []);
  assert.notEqual(e.state, 'stagger'); assert.equal(s.state, 'stagger');
});

test('the strike hits the arc in front of her, not behind; the third hit knocks a light monster back', async () => {
  const { ACTIONS } = await import('../../src/play/mobs.js');
  const b = new MobBrain({ origin: O, seed: 4 });
  const m = b.mobs.find((x) => x.type === 'skitter');
  for (const o of b.mobs) if (o !== m) o.state = 'gone';            // alone, so only it can be hit
  const from = [m.pos[0], m.pos[1], m.pos[2] - 1.2];
  const ev = [];
  assert.equal(b.strike(from, Math.PI, 14, false, ev), 0, 'facing away: a miss');
  const z0 = m.pos[2];
  assert.ok(b.strike(from, 0, 26, true, ev) >= 1);
  assert.ok(m.pos[2] > z0, 'knocked back');
  assert.equal(ACTIONS.strike.combo.length, 3); assert.ok(ACTIONS.dash.iframes > ACTIONS.dash.seconds);
});

test('balance: the first pack takes a new player about 20-30 s; the elite is a long fight', () => {
  const first = PACKS[0], hp = MOB_TYPES[first.type].hp * first.count;
  const casual = 12;                                   // damage per second of a new player who misses half the time
  assert.ok(hp / casual >= 15 && hp / casual <= 35, `first pack ${hp / casual} s`);
  const ownDps = MOB_TYPES.skitter.damage / MOB_TYPES.skitter.cooldown * first.count;
  assert.ok(100 / ownDps > hp / casual * 0.5, 'she outlasts the first pack even standing still for a while');
  assert.ok(MOB_TYPES.crownrift.hp / 35 > 20, 'the elite takes a skilled player more than 20 s');
});

test('a monster does not wake for Iris on a ledge far above or below it', () => {
  const b = new MobBrain({ origin: O, seed: 6 });
  const m = b.mobs.find((x) => x.type === 'hulker');
  const iris = { pos: [m.pos[0] + 3, m.pos[1] + 15, m.pos[2]], alive: true, outside: true };
  b.step(0.1, iris, flat);
  assert.notEqual(m.state, 'chase');
  iris.pos[1] = m.pos[1]; b.step(0.1, iris, flat);
  assert.equal(m.state, 'chase');
});
