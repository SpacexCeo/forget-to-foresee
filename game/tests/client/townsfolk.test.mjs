// Townsfolk (N-001): the cast, the daily programs on the town's NPC points and the pure state machine.
// Run: node --test tests/client/townsfolk.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { TOWN_DATA } from '../../src/scenes/town-data.js';
import { TOWNSFOLK, PROGRAMS, PersonPlan, CLIP_FALLBACK, pickClip, polyAt, chop, playLoop, doorStand, animStride, LOOK_RADIUS, YIELD_RADIUS } from '../../src/play/townsfolk-plan.js';

const MODELS = new URL('../../public/assets/models/', import.meta.url);

test('townsfolk: thirteen people, unique assets, a program each, heights from the sheets', () => {
  assert.equal(TOWNSFOLK.length, 13);
  assert.equal(new Set(TOWNSFOLK.map((p) => p.asset)).size, 13);
  for (const p of TOWNSFOLK) {
    assert.match(p.asset, /^townsfolk_[a-z_]+$/);
    assert.ok(PROGRAMS[p.key] && PROGRAMS[p.key].steps.length > 0, p.key + ' has a program');
    assert.ok(p.height >= 1.2 && p.height <= 1.95 && p.walk > 0.5 && p.walk < 1.7);
  }
  const h = Object.fromEntries(TOWNSFOLK.map((p) => [p.key, p.height]));
  assert.deepEqual([h.guard, h.child_b, h.elder, h.shrinekeeper], [1.92, 1.22, 1.65, 1.6]);
  assert.equal(Object.keys(PROGRAMS).length, 13);
});

test('townsfolk: shipped models come in pairs (full and phone variant)', () => {
  for (const p of TOWNSFOLK) {
    const full = existsSync(new URL(p.asset + '.glb', MODELS)), lite = existsSync(new URL(p.asset + '_m.glb', MODELS));
    assert.equal(full, lite, p.asset + ': the full file and the _m file ship together');
  }
});

test('townsfolk: every step stays on the town (finite points near exported NPC data, sane durations)', () => {
  const [w, d] = TOWN_DATA.size;
  for (const [key, prog] of Object.entries(PROGRAMS)) {
    for (const st of prog.steps) {
      if (st.walk) {
        assert.ok(st.walk.length >= 2, key + ' walk has two points');
        for (const p of st.walk) { assert.ok(p.every(Number.isFinite)); assert.ok(Math.abs(p[0]) < w / 2 && Math.abs(p[2]) < d / 2, key + ' leaves the town'); }
        for (let i = 0; i + 1 < st.walk.length; i++) assert.ok(Math.abs(st.walk[i + 1][1] - st.walk[i][1]) <= 6, key + ' height step');
      } else if (st.meet) {
        assert.ok(PROGRAMS[st.meet].steps.some((o) => o.meet === key), key + ' meets someone who meets back');
      } else assert.ok(st.stay > 0 && st.stay <= 120 && CLIP_FALLBACK[st.clip], key + ' stay');
    }
  }
});

test('townsfolk: posts are the exported points (guard at the gate, elder on the bench, keepers by their doors)', () => {
  const P = TOWN_DATA.npc.points;
  assert.deepEqual(PROGRAMS.guard.home, P.npc_gate_guard.position);
  assert.deepEqual(PROGRAMS.elder.home, P.npc_bench_0.position);
  assert.ok(PROGRAMS.elder.steps[0].sit > 0);
  assert.deepEqual(PROGRAMS.shrinekeeper.home, P.npc_shrine_keeper.position);
  for (const id of ['exchange', 'scribe', 'inn']) {
    const door = TOWN_DATA.shops.find((s) => s.id === id).door, st = doorStand(id);
    const dist = Math.hypot(st.position[0] - door.position[0], st.position[2] - door.position[2]);
    assert.ok(dist > 1 && dist < 2.6, id + ' keeper stands beside the door, not in it');
    // facing out of the shop
    assert.ok(Math.abs(Math.atan2(Math.sin(st.heading - door.heading - Math.PI), Math.cos(st.heading - door.heading - Math.PI))) < 1e-6);
  }
  const area = TOWN_DATA.npc.areas.npc_children_play;
  for (const p of playLoop(area, 'tag')) assert.ok(Math.hypot(p[0] - area.center[0], p[2] - area.center[2]) <= area.radius * 0.8 + 1e-9);
});

test('townsfolk: polyline helpers', () => {
  const o = {};
  const pts = [[0, 0, 0], [4, 0, 0], [4, 2, 4]];
  polyAt(pts, 2, o); assert.deepEqual([o.x, o.y, o.z, o.dx, o.dz], [2, 0, 0, 1, 0]);
  polyAt(pts, 4 + Math.hypot(2, 4) / 2, o); assert.ok(Math.abs(o.y - 1) < 1e-9 && Math.abs(o.z - 2) < 1e-9 && o.dz === 1);
  polyAt(pts, 999, o); assert.deepEqual([o.x, o.y, o.z], [4, 2, 4]);
  assert.equal(chop([[0, 0, 0], [21, 0, 0]], 7).length, 3);
});

test('townsfolk: clip fallbacks pick the shared set first, then the model\'s own clips', () => {
  assert.equal(pickClip(['idle', 'walk', 'talk'], 'wave'), 'talk');
  assert.equal(pickClip(['idle', 'walk', 'talk', 'wave'], 'wave'), 'wave');
  assert.equal(pickClip(['idle', 'walk'], 'run'), 'walk');
  assert.equal(pickClip(['idle', 'walk', 'child_run'], 'run'), 'child_run');
  assert.equal(pickClip(['idle'], 'sit'), 'idle');
  assert.equal(pickClip([], 'idle'), null);
});

function run(seconds, { iris = null, reduced = false, dt = 1 / 30 } = {}) {
  const plans = new Map(TOWNSFOLK.map((d) => [d.key, new PersonPlan(d)]));
  const ctx = { iris, reduced, others: plans }, log = new Map([...plans.keys()].map((k) => [k, { moved: 0, maxStep: 0, clips: new Set(), maxSpeed: 0, maxTurn: 0 }]));
  for (let t = 0; t < seconds; t += dt) {
    for (const [k, p] of plans) {
      const x = p.x, z = p.z, yaw = p.yaw;
      p.step(dt, ctx);
      const l = log.get(k), d = Math.hypot(p.x - x, p.z - z);
      l.moved += d; l.maxStep = Math.max(l.maxStep, d); l.clips.add(p.clip); l.maxSpeed = Math.max(l.maxSpeed, p.speed);
      l.maxTurn = Math.max(l.maxTurn, Math.abs(Math.atan2(Math.sin(p.yaw - yaw), Math.cos(p.yaw - yaw))));
    }
  }
  return { plans, log };
}

test('townsfolk: deterministic; walkers walk at their clip speed without jumps; posts stay put', () => {
  const a = run(240), b = run(240);
  for (const [k, p] of a.plans) { const q = b.plans.get(k); assert.deepEqual([p.x, p.y, p.z, p.yaw, p.index], [q.x, q.y, q.z, q.yaw, q.index], k + ' repeats'); }
  for (const d of TOWNSFOLK) {
    const l = a.log.get(d.key), top = d.run || d.walk;
    assert.ok(l.maxSpeed <= top + 1e-6, d.key + ' never faster than its clip');
    assert.ok(l.maxStep <= top / 30 + 0.02, d.key + ' never jumps (' + l.maxStep + ')'); // the side step adds a little
    assert.ok(l.maxTurn <= 7 / 30 + 1e-6, d.key + ' turns at a bounded rate');
  }
  for (const k of ['guard', 'innkeeper', 'baker', 'shrinekeeper', 'elder', 'musician']) assert.equal(a.log.get(k).moved, 0, k + ' keeps the post');
  for (const k of ['sweeper', 'lamplighter', 'courier', 'child_a', 'child_b', 'shardkeeper', 'scribe']) assert.ok(a.log.get(k).moved > 20, k + ' walks');
  assert.ok(a.log.get('sweeper').clips.has('sweep') && a.log.get('musician').clips.has('play') && a.log.get('elder').clips.has('sit'));
});

test('townsfolk: the two keepers of the square meet and take turns talking', () => {
  const { log } = run(420);
  for (const k of ['shardkeeper', 'scribe']) { assert.ok(log.get(k).clips.has('talk'), k + ' talks'); assert.ok(log.get(k).clips.has('listen'), k + ' listens'); }
});

test('townsfolk: Iris is greeted, saluted and never walked through; reduced motion holds everyone still', () => {
  const gate = TOWN_DATA.npc.points.npc_gate_guard.position;
  const near = run(6, { iris: [gate[0] - 2, gate[1], gate[2] - 2] });
  assert.ok(near.log.get('guard').clips.has('salute'));
  assert.ok(near.plans.get('guard').near < LOOK_RADIUS);
  // Iris stands on the sweeper's lane right ahead of the sweeper: the sweeper stops short of her
  const sw = new PersonPlan(TOWNSFOLK.find((d) => d.key === 'sweeper'));
  const iris = [sw.x + 2.2, sw.y, sw.z];
  for (let i = 0; i < 30 * 12; i++) sw.step(1 / 30, { iris, reduced: false, others: new Map() });
  assert.ok(Math.hypot(sw.x - iris[0], sw.z - iris[2]) >= YIELD_RADIUS * 0.8, 'the sweeper waits');
  const still = run(30, { reduced: true });
  for (const [k, l] of still.log) assert.equal(l.moved, 0, k + ' is steady under reduced motion');
});

test('townsfolk: animation level of detail', () => {
  assert.equal(animStride(5), 1);
  assert.equal(animStride(30), 2);
  assert.equal(animStride(60), 4);
  assert.equal(animStride(200), 0);
  assert.equal(animStride(5, { visible: false }), 0);
  assert.ok(animStride(20, { phone: true }) > animStride(20));
});
