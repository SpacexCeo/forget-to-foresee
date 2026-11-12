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

test('the super strike: a 90° cone 3 m deep, heavy hit-stop, light creatures thrown back, brutes stand; soft lock finds the nearest', async () => {
  const { ACTIONS } = await import('../../src/play/mobs.js');
  const b = new MobBrain({ origin: O, seed: 4 });
  const m = b.mobs.find((x) => x.type === 'skitter');
  for (const o of b.mobs) if (o !== m) o.state = 'gone';
  const from = [m.pos[0], m.pos[1], m.pos[2] - 2.6], ev = [];
  assert.equal(b.superStrike(from, Math.PI, 50, ev), 0, 'behind her: nothing');
  assert.equal(b.superStrike([from[0] - 3, from[1], from[2]], 0, 50, ev), 0, 'outside the 45° half-cone');
  const z0 = m.pos[2], hp0 = m.hp;
  assert.equal(b.superStrike(from, 0, 30, ev), 1);
  assert.ok(m.hp < hp0 && m.pos[2] > z0 + 1, 'damaged and thrown back');
  assert.ok(m.freeze >= ACTIONS.super.freeze - 1e-9 || m.state === 'dead', 'a longer hit-stop');
  assert.ok(ev.some((e) => e.kind === 'super'));
  assert.equal(b.nearest(from, ACTIONS.lock), Math.hypot(m.pos[0] - from[0], m.pos[2] - from[2]) - m.T.radius < ACTIONS.lock ? m : null);
  assert.equal(b.nearest([from[0] + 50, 0, from[2]], 3), null);
  const h = new MobBrain({ origin: O, seed: 4 }), brute = h.mobs.find((x) => x.type === 'hulker');
  const hz = brute.pos[2]; h.superStrike([brute.pos[0], 0, brute.pos[2] - 2], 0, 30, []); assert.equal(brute.pos[2], hz, 'a brute is not thrown');
  assert.ok(ACTIONS.super.max > ACTIONS.strike.combo[2] && ACTIONS.super.hold < ACTIONS.super.full);
});

test('hold to super: a tap strikes the combo, a hold of 0.4 s or more releases the super strike with damage ramping to full at 1 s', async () => {
  const THREE = await import('three');
  const { createMobs, ACTIONS } = await import('../../src/play/mobs.js');
  const mk = () => {
    const calls = [], fb = [];
    const player = { pos: [0, 0, 0], heading: 0 };
    const M = createMobs({ THREE, scene: new THREE.Scene(), origin: O.slice(), player, load: () => Promise.reject(new Error('no models')), clone: (x) => x,
      MobFx: class {}, glow: {}, ground: flat, doc: null, win: null, irisMove: (n) => { calls.push(n); return true; }, irisEnd: () => calls.push('end'), onFeedback: (k, _m, e) => fb.push([k, e]) });
    const sk = M.brain.mobs.find((x) => x.type === 'skitter');
    for (const o of M.brain.mobs) if (o !== sk) o.state = 'gone';
    sk.state = 'idle'; player.pos = [sk.pos[0], sk.pos[1], sk.pos[2] - 1.5]; player.heading = Math.PI;   // looking away: the soft lock turns her
    M.update(0.01, true);
    return { M, calls, fb, sk, player };
  };
  { const { M, calls, player, sk } = mk();
    assert.equal(M.attackDown(), true); assert.equal(calls.at(-1), 'strike_charge');
    assert.ok(Math.abs(player.heading - Math.atan2(sk.pos[0] - player.pos[0], sk.pos[2] - player.pos[2])) < 1e-9, 'turned to the creature');
    M.update(0.1, true); assert.equal(M.attackUp(), true); assert.equal(calls.at(-1), 'strike1', 'a tap is the combo'); }
  { const { M, calls, fb, sk } = mk();
    const hp0 = sk.hp; M.attackDown(); for (let i = 0; i < 12; i++) M.update(0.1, true);
    assert.ok(M.charging >= 1);
    M.attackUp(); assert.equal(calls.at(-1), 'strike_super');
    M.update(0.05, true); assert.equal(sk.hp, hp0, 'not before the impact frame');
    M.update(0.1, true); assert.ok(hp0 - sk.hp >= Math.min(hp0, ACTIONS.super.max) - 1e-6, 'full charge, full damage');
    assert.ok(fb.some(([k, e]) => k === 'super' && e.charge === 1));
    assert.ok(M.shake > 0.5, 'a strong shake');
    M.update(0.5, true); assert.equal(M.attackDown(), true); assert.equal(calls.at(-1), 'strike1', 'while the super recharges a press is a plain strike'); }
  { const { M, calls } = mk();
    M.attackDown(); M.update(0.2, true); M.cancelAttack(); assert.equal(calls.at(-1), 'end'); assert.equal(M.charging, null);
    M.attackDown(); M.update(0.5, true); M.dash([1, 0]); assert.ok(calls.includes('end') && calls.at(-1) === 'dash', 'a dash puts the charge away'); }
});

test('strike direction: the locked creature, else the cursor on the ground, else the movement, else her facing', async () => {
  const { strikeAim } = await import('../../src/play/mobs.js');
  const from = [0, 0, 0], h = 1.0, lock = { pos: [0, 0, 5] }, cursor = [5, 0, 0], move = [-1, 0];
  assert.deepEqual(strikeAim({ from, heading: h, lock, cursor, move }), { heading: 0, by: 'lock' });
  const c = strikeAim({ from, heading: h, cursor, move }); assert.equal(c.by, 'cursor'); assert.ok(Math.abs(c.heading - Math.PI / 2) < 1e-9);
  assert.equal(strikeAim({ from, heading: h, cursor: [5, 0], move }).by, 'cursor', 'an [x, z] cursor works too');
  assert.equal(strikeAim({ from, heading: h, cursor: [0.1, 0, 0.1], move }).by, 'move', 'a cursor on her own feet gives no direction');
  const m = strikeAim({ from, heading: h, move }); assert.equal(m.by, 'move'); assert.ok(Math.abs(m.heading + Math.PI / 2) < 1e-9);
  assert.deepEqual(strikeAim({ from, heading: h, move: [0.01, 0] }), { heading: h, by: 'facing' });
  assert.deepEqual(strikeAim({ from, heading: h }), { heading: h, by: 'facing' });
});

test('in the view: no creature near → the cursor turns her even standing still; a creature within 3 m wins; a tap on cooldown puts the coil away', async () => {
  const THREE = await import('three');
  const { createMobs } = await import('../../src/play/mobs.js');
  const calls = [], player = { pos: [0, 0, 0], heading: 0 };
  const M = createMobs({ THREE, scene: new THREE.Scene(), origin: O.slice(), player, load: () => Promise.reject(new Error('no models')), clone: (x) => x,
    MobFx: class {}, glow: {}, ground: flat, doc: null, win: null, irisMove: (n) => { calls.push(n); return true; }, irisEnd: () => calls.push('end') });
  const sk = M.brain.mobs.find((x) => x.type === 'skitter');
  for (const o of M.brain.mobs) if (o !== sk) o.state = 'gone';
  player.pos = [sk.pos[0] - 9, sk.pos[1], sk.pos[2]]; M.update(0.01, true);
  assert.equal(M.locked, null);
  M.strike({ cursor: [player.pos[0], 0, player.pos[2] - 4], move: [1, 0] });
  assert.equal(M.aimedBy, 'cursor'); assert.ok(Math.abs(Math.abs(player.heading) - Math.PI) < 1e-9, 'turned to the cursor (−z)');
  player.pos = [sk.pos[0] - 1.5, sk.pos[1], sk.pos[2]]; M.update(0.5, true);
  assert.equal(M.locked, sk);
  M.strike({ cursor: [player.pos[0], 0, player.pos[2] - 4] }); assert.equal(M.aimedBy, 'lock');
  assert.ok(Math.abs(player.heading - Math.atan2(sk.pos[0] - player.pos[0], sk.pos[2] - player.pos[2])) < 1e-6, 'turned to the creature');
  // a tap while the strike recovers: the coil is ended, never left on
  M.attackDown(); M.attackUp(); assert.equal(calls.at(-1), 'end');
});

test('combat feel: every melee blow warns at least 0.4 s ahead; every strike hit shoves a light creature, the third throws it', async () => {
  const { TELEGRAPH_MIN, HIT_SHOVE } = await import('../../src/play/mobs.js');
  for (const [name, T] of Object.entries(MOB_TYPES)) if (!T.ranged) assert.ok(T.windup * T.impact >= TELEGRAPH_MIN, `${name} warns ${(T.windup * T.impact).toFixed(2)} s`);
  const b = new MobBrain({ origin: O, seed: 4 });
  const m = b.mobs.find((x) => x.type === 'skitter');
  for (const o of b.mobs) if (o !== m) o.state = 'gone';
  const from = [m.pos[0], m.pos[1], m.pos[2] - 1.2], z0 = m.pos[2];
  b.strike(from, 0, 5, false, []);
  assert.ok(Math.abs(m.pos[2] - z0 - HIT_SHOVE) < 1e-6, 'a light shove on an ordinary hit');
});

test('strike direction v3: on a PC every strike assists onto a creature within 8 m in ANY direction (ahead preferred), else cursor, movement, camera', async () => {
  const { strikeAim, pickLock, ACTIONS } = await import('../../src/play/mobs.js');
  assert.equal(ACTIONS.lock, 8);
  const from = [0, 0, 0], T = { radius: 0.4 }, fwd = [0, 1];
  const mk = (x, z, state = 'idle') => ({ pos: [x, 0, z], T, state });
  assert.ok(pickLock([mk(3, 0)], from, fwd), 'beside her at 90° (3 m): locked');
  assert.ok(pickLock([mk(Math.sin(150 * Math.PI / 180) * 6, Math.cos(150 * Math.PI / 180) * 6)], from, fwd), 'behind-beside at 150° (6 m): locked');
  assert.ok(pickLock([mk(0, -7.5)], from, fwd), 'straight behind, within 8 m: locked');
  assert.equal(pickLock([mk(0, 9)], from, fwd), null, 'beyond 8 m');
  assert.equal(pickLock([mk(0, 3, 'dead')], from, fwd), null);
  const ahead = mk(0, 4), behind = mk(0, -3.6);
  assert.equal(pickLock([behind, ahead], from, fwd), ahead, 'ahead preferred when barely farther');
  assert.equal(pickLock([mk(0, -1.5), mk(0, 6)], from, fwd).pos[2], -1.5, 'a much nearer one behind still wins');
  const cam = [1, 0];
  assert.equal(strikeAim({ from, heading: 2, lock: ahead, cursor: [5, 0, 0], move: [0, -1], camera: cam }).by, 'lock', 'the lock beats the cursor');
  assert.equal(strikeAim({ from, heading: 2, cursor: [5, 0, 0], move: [0, -1], camera: cam }).by, 'cursor');
  assert.equal(strikeAim({ from, heading: 2, move: [0, -1], camera: cam }).by, 'move');
  assert.equal(strikeAim({ from, heading: 2, camera: cam }).by, 'camera');
});

test('the view: a strike at a creature 3 or 6 m beside or behind her turns the whole root at once, closes in and lands the hit', async () => {
  const THREE = await import('three');
  const { createMobs } = await import('../../src/play/mobs.js');
  for (const [deg, dist] of [[90, 3], [150, 3], [90, 6], [150, 6]]) {
    const player = { pos: [0, 0, 0], heading: 0, prevHeading: 0, vel: [2, 0] };
    const M = createMobs({ THREE, scene: new THREE.Scene(), origin: O.slice(), player, load: () => Promise.reject(new Error('no models')), clone: (x) => x,
      MobFx: class {}, glow: {}, ground: flat, doc: null, win: null, irisMove: () => true, moveIris: (d) => { player.pos[0] += d[0]; player.pos[2] += d[1]; } });
    const sk = M.brain.mobs.find((x) => x.type === 'skitter');
    for (const o of M.brain.mobs) if (o !== sk) o.state = 'gone';
    sk.state = 'idle'; sk.freeze = 99;                                                // it holds still for the check
    const a = deg * Math.PI / 180;
    player.pos = [sk.pos[0] - Math.sin(a) * dist, sk.pos[1], sk.pos[2] - Math.cos(a) * dist];
    M.update(0.01, true);
    const hp0 = sk.hp;
    assert.equal(M.strike({ cursor: [player.pos[0] + 5, 0, player.pos[2] - 5] }), true);
    const want = Math.atan2(sk.pos[0] - player.pos[0], sk.pos[2] - player.pos[2]);
    assert.ok(Math.abs(Math.atan2(Math.sin(player.heading - want), Math.cos(player.heading - want))) < 10 * Math.PI / 180, `${deg}°/${dist} m: facing the creature`);
    assert.equal(player.prevHeading, player.heading, 'no interpolation from the old facing'); assert.deepEqual(player.vel, [0, 0], 'no momentum to turn her back');
    for (let i = 0; i < 20; i++) M.update(1 / 60, true);
    assert.ok(sk.hp < hp0, `${deg}°/${dist} m: the creature took the hit`);
    assert.equal(M.aimedBy, 'lock');
  }
});
