// Shared spiders (lib/mobs.js) and the hub's v2 messages: one spider state per town room, aggro and bites, hits
// checked from the server position (range, kind, amount cap, rate), loot rights by damage share, respawn away from
// players, rooms per area, fx relayed from the server position, combat animations, heroes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMobWorld, SPIDER, SHARED_PACKS, HIT_MAX, LOOT_SHARE } from '../lib/mobs.js';
import { createHub, validate, ANIMS } from '../lib/hub.js';

const seeded = (s = 7) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
const T0 = 1_700_000_000_000;

test('mobs: the town-hill packs with the game ids, full health, idle near home', () => {
  const w = createMobWorld({ rand: seeded() });
  const all = w.all();
  assert.equal(all.length, SHARED_PACKS.reduce((n, p) => n + p.count, 0));
  assert.deepEqual(all.map((r) => r[0]).slice(0, 5), ['skitter0_0', 'skitter0_1', 'skitter0_2', 'skitter0_3', 'skitter1_0']);
  for (const [id, x, z, , hp, st] of all) { const home = w.get(id).pack.home; assert.ok(Math.hypot(x - home[0], z - home[1]) < 3, id); assert.equal(hp, SPIDER.hp); assert.equal(st, 0); }
  assert.deepEqual(w.changed().length, all.length, 'everything is new once'); assert.deepEqual(w.changed(), [], 'then only changes');
});

test('mobs: a player close by is chased and bitten; one far away is ignored; the bite goes to the bitten player', () => {
  const w = createMobWorld({ rand: seeded() });
  const m = w.get('skitter0_0'), far = { id: 9, p: [100, 0, 100] };
  for (let i = 0; i < 20; i++) w.step(0.1, [far]);
  assert.equal(m.state, 'idle');
  const ann = { id: 1, p: [m.x + 5, 0, m.z] };
  const bites = [];
  for (let i = 0; i < 60; i++) bites.push(...w.step(0.1, [ann, far]).filter((e) => e.k === 'bite'));
  assert.ok(Math.hypot(m.x - ann.p[0], m.z - ann.p[2]) < SPIDER.attack + SPIDER.radius + 0.1, 'it closed in');
  assert.ok(bites.length >= 2 && bites.every((b) => b.target === 1 && b.dmg === SPIDER.damage), JSON.stringify(bites.slice(0, 2)));
  assert.ok(bites.filter((b) => b.mob === m.id).length <= Math.ceil(6 / SPIDER.cooldown), 'one spider bites no faster than its cooldown');
});

test('mobs: hits are checked from the server position, capped by kind, and loot goes to everyone with 15% of the damage', () => {
  const w = createMobWorld({ rand: seeded() });
  const m = w.get('skitter1_2'), at = [m.x + 1, 0, m.z];
  assert.equal(w.hit(1, [m.x + 20, 0, m.z], m.id, 'strike', 14).reason, 'range', 'a strike from 20 m');
  assert.equal(w.hit(1, at, m.id, 'fireball', 14).reason, 'kind');
  assert.equal(w.hit(1, at, 'skitter9_9', 'strike', 14).reason, 'no_mob');
  assert.equal(w.hit(1, [m.x + 20, 0, m.z], m.id, 'lance', 40).ok, true, 'a cast reaches 20 m');
  assert.equal(m.hp, SPIDER.hp - 40); assert.equal(m.state, 'chase'); assert.equal(m.target, 1, 'a hit provokes it at the hitter');
  w.hit(2, at, m.id, 'strike', 999); assert.equal(m.hp, SPIDER.hp - 40 - HIT_MAX.strike, 'capped at the kind maximum');
  const kill = w.hit(3, at, m.id, 'strike', 1);
  assert.equal(kill.ok, true); assert.equal(kill.death.mob, m.id);
  assert.deepEqual(kill.death.loot, [1, 2], `player 3 dealt ${1} < ${SPIDER.hp * LOOT_SHARE}`);
  assert.equal(w.hit(1, at, m.id, 'strike', 14).reason, 'dead');
});

test('mobs: a dead spider comes back after its respawn, but never while a player stands at its home', () => {
  const w = createMobWorld({ rand: seeded() });
  const m = w.get('skitter4_0'), home = m.pack.home;
  while (m.state !== 'dead') w.hit(1, [m.x, 0, m.z], m.id, 'super', 80);
  const camper = { id: 1, p: [home[0], 0, home[1]] };
  for (let i = 0; i < (m.pack.respawn + 5) * 10; i++) w.step(0.1, [camper]);
  assert.equal(m.state, 'dead', 'not under her nose');
  const ev = []; for (let i = 0; i < 5; i++) ev.push(...w.step(0.1, []));
  assert.ok(ev.some((e) => e.k === 'respawn' && e.mob === m.id)); assert.equal(m.hp, SPIDER.hp); assert.equal(m.state, 'idle');
});

function rig() {
  let t = T0; const now = () => t;
  const hub = createHub({ now, mobWorld: () => createMobWorld({ now, rand: seeded() }) });
  const mk = () => { const c = { out: [], closed: null, send(s) { this.out.push(JSON.parse(s)); }, close(code) { this.closed = code; }, buffered: () => 0 }; const conn = hub.connect(c);
    return { c, say: (o) => conn.onText(JSON.stringify(o)), last: (type) => [...c.out].reverse().find((m) => m.t === type), all: (type) => c.out.filter((m) => m.t === type) }; };
  return { hub, mk, adv: (ms) => { t += ms; hub.tick(); } };
}

test('hub v2: rooms per area, caps and the spiders in the welcome, combat animations and heroes pass', () => {
  const { mk } = rig();
  const a = mk(); a.say({ t: 'hello', name: 'ann', skin: 'sheriffchenko' });
  const w = a.last('welcome');
  assert.deepEqual(w.caps, ['area', 'fx', 'mobs']); assert.equal(w.area, 'town'); assert.ok(w.mobs.length >= 10);
  const b = mk(); b.say({ t: 'hello', name: 'bob', area: 'isles' });
  assert.notEqual(b.last('welcome').room, w.room, 'the isles have their own rooms'); assert.equal(b.last('welcome').mobs, undefined, 'no town spiders there');
  assert.equal(a.last('join'), undefined, 'ann never sees bob join');
  for (const an of ['strike1', 'strike3', 'super', 'dash', 'hurt', 'dead']) assert.ok(ANIMS.includes(an));
  assert.equal(validate({ t: 's', p: [0, 0, 0], h: 0, a: 'moonwalk' }).a, 'idle', 'an unknown animation never kicks (an older server is safe for a newer client)');
  assert.equal(validate({ t: 'hello', skin: 'sheriffchenko' }).skin, 'sheriffchenko');
});

test('hub v2: fx go to the others from the sender\'s server position, 4 a second; hits land on the shared spider for everyone', () => {
  const { hub, mk, adv } = rig();
  const a = mk(), b = mk(); a.say({ t: 'hello', name: 'ann' }); b.say({ t: 'hello', name: 'bob' });
  const sp = a.last('welcome').mobs.find((r) => r[0] === 'skitter0_0');
  a.say({ t: 's', p: [sp[1] + 1, 3, sp[2]], h: 0, a: 'strike1' }); b.say({ t: 's', p: [sp[1] - 1, 3, sp[2]], h: 0, a: 'idle' });
  adv(100);
  assert.equal(b.last('snap').s.find((r) => r[0] === a.last('welcome').id)[5], 'strike1', 'others see her strike');
  for (let i = 0; i < 6; i++) a.say({ t: 'fx', k: 'lance' });
  assert.equal(b.all('fx').length, 4, '4 a second'); assert.equal(a.all('fx').length, 0, 'not echoed');
  assert.deepEqual(b.last('fx').p, [sp[1] + 1, 3, sp[2]], 'drawn where the server has her');
  a.say({ t: 'hit', mob: 'skitter0_0', k: 'strike3', n: 26 }); a.say({ t: 'hit', mob: 'skitter0_0', k: 'strike3', n: 26 });
  b.say({ t: 'hit', mob: 'skitter0_0', k: 'strike', n: 14 });
  assert.deepEqual(b.last('mdeath'), { t: 'mdeath', mob: 'skitter0_0', loot: [a.last('welcome').id] }, 'bob dealt 3 of 55: no loot for him');
  assert.equal(a.last('mdeath').mob, 'skitter0_0', 'both see the same death');
  adv(100); adv(100);
  assert.equal(b.last('mobs').m.find((r) => r[0] === 'skitter0_0')[5], 3, 'dead in the snapshot');
  assert.equal(hub.stats().kills, 1); assert.equal(a.c.closed, null);
  const x = mk(); x.say({ t: 'hello', name: 'x' }); x.say({ t: 'hit', mob: '../etc', k: 'strike', n: 1 }); assert.equal(x.last('sys').reason, 'bad_message');
});

test('hub v2: a spider bites only the player it reached, through a bite message to that player', () => {
  const { hub, mk, adv } = rig();
  const a = mk(), b = mk(); a.say({ t: 'hello', name: 'ann' }); b.say({ t: 'hello', name: 'bob' });
  const sp = a.last('welcome').mobs.find((r) => r[0] === 'skitter1_0');
  a.say({ t: 's', p: [sp[1] + 3, 3, sp[2]], h: 0, a: 'idle' }); b.say({ t: 's', p: [150, 3, 150], h: 0, a: 'idle' });
  for (let i = 0; i < 50; i++) { adv(100); if (i % 10 === 0) a.say({ t: 's', p: [sp[1] + 3, 3, sp[2] + (i % 20 ? 0.01 : 0)], h: 0, a: 'idle' }); }
  assert.ok(a.all('bite').length >= 1); assert.equal(b.all('bite').length, 0);
  assert.ok(hub.stats().bites >= 1);
});
