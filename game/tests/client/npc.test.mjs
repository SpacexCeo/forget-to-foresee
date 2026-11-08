// A living island (docs/npcs.md): the seeded idle-life scheduler, head look-at angles, local avoidance,
// the NPC director (errands, meetings, the vote gathering, observation-diff inference) and a route walk
// along the island's graph with the shared motion model. Deterministic: no Math.random anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRng, IdleLife, lookAtAngles, NpcDirector, CLAN_ORDER, TEMPERAMENT } from '../../src/play/behaviour.js';
import { avoidWish, stepMotion, createMotion, NPC_MOTION } from '../../src/physics/motion.js';
import { steerTo } from '../../src/physics/character.js';
import { planRoute, walkGraph } from '../../src/net/world-map.js';
import { CAMPS, PLAZA_RADIUS, BRIDGE_WIDTH } from '../../src/scenes/layout.js';

const DEG = Math.PI / 180;
const NPCS = CLAN_ORDER.filter((c) => c !== 'iris');

test('seeded rng: the same seed repeats, different seeds differ, values in [0, 1)', () => {
  const a = seededRng('x'), b = seededRng('x'), c = seededRng('y');
  const sa = Array.from({ length: 5 }, a), sb = Array.from({ length: 5 }, b), sc = Array.from({ length: 5 }, c);
  assert.deepEqual(sa, sb); assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((v) => v >= 0 && v < 1));
});

test('idle life: deterministic per seed, never in sync between clans, gaps follow the tempo, gestures can be held back', () => {
  const run = (seed, clan, canGesture = () => true) => { const l = new IdleLife({ seed, clan, tempo: TEMPERAMENT[clan].tempo }); const out = []; for (let t = 0; t < 120; t += 0.1) { const a = l.update(+t.toFixed(1), canGesture(t)); if (a.kind !== 'none' && a.startedAt === +t.toFixed(1)) out.push([+t.toFixed(1), a.kind]); } return out; };
  assert.deepEqual(run('s1', 'ash'), run('s1', 'ash'), 'same seed, same life');
  const starts = NPCS.map((c) => run('season', c).map(([t]) => t));
  for (let i = 0; i < starts.length; i++) for (let j = i + 1; j < starts.length; j++) {
    const same = starts[i].filter((t) => starts[j].includes(t)).length;
    assert.ok(same <= 1, `${NPCS[i]} and ${NPCS[j]} start ${same} actions at the same moment`);
  }
  for (const s of starts) { assert.ok(s.length >= 8 && s.length <= 30, 'about one action every 4-12 s: ' + s.length); for (let k = 1; k < s.length; k++) assert.ok(s[k] - s[k - 1] >= 2, 'actions do not pile up'); }
  const kinds = new Set(run('season', 'frost').map(([, k]) => k));
  assert.ok(kinds.has('glance') && kinds.has('shift') && kinds.has('gesture'), [...kinds].join());
  assert.ok(run('season', 'frost', () => false).every(([, k]) => k !== 'gesture'), 'no gestures when held back');
});

test('look-at angles: ahead = small angles, side = clamped yaw, behind fades out, pitch follows height', () => {
  const ahead = lookAtAngles([0, 0, 0], 0, [0.5, 1.55, 5]);
  assert.ok(Math.abs(ahead.yaw - Math.atan2(0.5, 5)) < 1e-9 && ahead.weight === 1 && Math.abs(ahead.pitch) < 1e-9);
  const left = lookAtAngles([0, 0, 0], 0, [5, 1.55, 0.5]);
  assert.ok(left.yaw > 0 && left.yaw <= 70 * DEG + 1e-9 && left.weight < 1 && left.weight > 0, 'a target 84° to the left is clamped and partly faded: ' + JSON.stringify(left));
  const behind = lookAtAngles([0, 0, 0], 0, [0, 1.55, -5]);
  assert.equal(behind.weight, 0);
  const sky = lookAtAngles([0, 0, 0], 0, [0, 20, 10]);
  assert.ok(sky.pitch > 0 && sky.pitch <= 30 * DEG + 1e-9);
  const turned = lookAtAngles([0, 0, 0], Math.PI / 2, [5, 1.55, 0]);
  assert.ok(Math.abs(turned.yaw) < 1e-9, 'facing +x, a target on +x is straight ahead');
});

test('local avoidance: a neighbour ahead gives a bounded sidestep, one behind does nothing, one on top slows', () => {
  const wish = [0, 1];
  const none = avoidWish([0, 0], 0, wish, [[0, -2]]);
  assert.deepEqual(none, wish);
  const side = avoidWish([0, 0], 0, wish, [[0.1, 1.2]]);
  assert.ok(side[0] !== 0 && Math.hypot(...side) <= 1 + 1e-9 && side[1] > 0.3, 'sidestep: ' + side);
  const mirror = avoidWish([0, 0], 0, wish, [[-0.1, 1.2]]);
  assert.ok(Math.sign(mirror[0]) === -Math.sign(side[0]), 'passes on the other side');
  const dead = avoidWish([0, 0], 0, wish, [[0, 1.2]]);
  assert.ok(dead[0] !== 0, 'a neighbour dead ahead still gets a deterministic side');
  const slow = avoidWish([0, 0], 0, wish, [[0.2, 0.3]]);
  assert.ok(Math.hypot(...slow) < 0.6, 'slows down when someone is on top of us: ' + Math.hypot(...slow));
  assert.deepEqual(avoidWish([0, 0], 0, [0, 0], [[0, 1]]), [0, 0]);
});

test('director: a fragment contribution is an errand to the Scroll, a gesture there, a walk home, then idle life', () => {
  const d = new NpcDirector({ seed: 'test' });
  d.onEvent({ type: 'fx', data: { fx: { type: 'fragment', i: 3 } } }, 1);
  assert.equal(d.directive('moss', 1).move, 'scroll');
  assert.equal(d.directive('ash', 1).move, null, 'only the contributing clan moves');
  d.arrived('moss', 10);
  const act = d.directive('moss', 10.1);
  assert.equal(act.act, 'gesture_offer'); assert.equal(act.face, 'scroll');
  assert.deepEqual(act.say, { speakerId: 'moss', key: 'line.fragment', args: {} });
  assert.equal(d.directive('moss', 11).say, null, 'the beat is spoken once');
  assert.equal(d.directive('moss', 14).move, 'home');
  d.arrived('moss', 30);
  const idle = d.directive('moss', 31);
  assert.equal(idle.move, null); assert.ok(idle.idle, 'idle life resumes');
  // A duplicate of the same errand is dropped; the queue holds at most two.
  for (let i = 0; i < 5; i++) d.errand('moss', 'scroll');
  assert.ok(d.state('moss').queue.length <= 2);
});

test('director: a silk transfer is a meeting (visitor walks, both talk in turns, visitor walks home), the host speaks second', () => {
  const d = new NpcDirector({ seed: 'test' });
  d.onEvent({ type: 'fx', data: { fx: { type: 'walk', from: 1, to: 4, kind: 'silk' } } }, 0);
  assert.equal(d.directive('salt', 0).move, 'camp:amber');
  assert.equal(d.directive('amber', 0).move, 'edge');
  d.arrived('amber', 2);
  assert.equal(d.directive('amber', 2.1).act, 'idle', 'the host waits for the visitor');
  d.arrived('salt', 20);
  const v = d.directive('salt', 20.1), h = d.directive('amber', 20.1);
  assert.equal(v.act, 'talk'); assert.equal(h.act, 'idle');
  assert.equal(v.face, 'partner'); assert.equal(h.face, 'partner'); assert.equal(v.partner, 'amber');
  assert.deepEqual(v.say, { speakerId: 'salt', key: 'line.walk.silk', args: { to: { $agentId: 'amber' } } });
  const v2 = d.directive('salt', 23), h2 = d.directive('amber', 23);
  assert.equal(v2.act, 'idle'); assert.equal(h2.act, 'talk', 'turns alternate every beat');
  assert.equal(d.directive('salt', 28).move, 'home');
  assert.equal(d.directive('amber', 28).move, null, 'the host is already home');
  // A visitor waits while the host still means to come (its goal is queued), gives up at the cap or when the host drops it.
  const d2 = new NpcDirector({ seed: 'test' });
  d2.meet('frost', 'moss');
  assert.equal(d2.directive('frost', 0).move, 'camp:moss');
  d2.arrived('frost', 5);
  assert.equal(d2.directive('frost', 6).act, 'idle');
  assert.equal(d2.directive('frost', 40).act, 'idle', 'still waiting: a camp-to-camp walk takes about 30 s');
  assert.equal(d2.directive('frost', 70).move, 'home', 'gives up at the cap');
  const d3 = new NpcDirector({ seed: 'test' });
  d3.meet('frost', 'moss'); d3.directive('frost', 0); d3.arrived('frost', 5); d3.directive('frost', 6);
  d3.clear('moss');
  assert.equal(d3.directive('frost', 7).move, 'home', 'the host dropped the meeting: walk home at once');
  // Iris is never a meeting partner; an isolated clan is cleared.
  assert.equal(d2.meet('frost', 'iris'), false);
  d2.errand('ash', 'scroll'); d2.clear('ash');
  assert.equal(d2.directive('ash', 1).move, null);
});

test('director: the vote gathers every clan on the plaza ring facing the Scroll; a reveal turns heads to its Shell', () => {
  const d = new NpcDirector({ seed: 'test' });
  d.errand('ash', 'scroll');
  d.onEvent({ type: 'season.phase_changed', data: { from: 'play', to: 'vote' } }, 0);
  for (const c of NPCS) assert.equal(d.directive(c, 0).move, 'gather', c + ' gathers');
  d.arrived('ash', 10);
  const g = d.directive('ash', 11);
  assert.equal(g.move, null); assert.equal(g.face, 'scroll');
  assert.equal(d.directive('ash', 500).face, 'scroll', 'stays gathered');
  d.onEvent({ type: 'fx', data: { fx: { type: 'event', place: 2, action: 1, power: 1 } } }, 20);
  assert.equal(d.directive('moss', 21).look, 'sky:3');
  assert.equal(d.directive('moss', 25).look, null);
});

test('director: observation diffs infer the same goals (contribution, silk transfer, mend, auction, bidder, dark)', () => {
  const clans = (over = {}) => ({ relationships: { clans: NPCS.map((c) => ({ clan: c, fragment: 'held', linkBroken: false, isolated: false, silk: 10, ...(over[c] || {}) })), edges: [{ a: 'salt', b: 'ash', broken: true }] }, season: { phase: 'play' }, auctions: [] });
  const d = new NpcDirector({ seed: 'test' });
  d.observe(clans(), 0);
  d.observe(clans({ moss: { fragment: 'scroll' }, salt: { silk: 7 }, frost: { silk: 13 } }), 1);
  assert.equal(d.directive('moss', 1).move, 'scroll');
  assert.equal(d.directive('salt', 1).move, 'camp:frost', 'silk left Salt and arrived at Frost: they meet');
  assert.equal(d.directive('frost', 1).move, 'edge');
  const o3 = clans({ moss: { fragment: 'scroll' }, salt: { silk: 7 }, frost: { silk: 13 } });
  o3.relationships.edges = [{ a: 'salt', b: 'ash', broken: false }];
  o3.auctions = [{ id: 'a1', from: 'amber', open: true, topBid: null }];
  d.observe(o3, 2);
  assert.equal(d.directive('amber', 2).move, 'shard_pedestal');
  assert.ok(d.state('ash').queue.some((g) => g.kind === 'meet') || d.state('ash').goal, 'a mended link between Salt and Ash queues a meeting');
  const o4 = { ...o3, auctions: [{ id: 'a1', from: 'amber', open: true, topBid: { clan: 'frost', amount: 3 } }] };
  d.observe(o4, 3);
  assert.ok(d.state('frost').queue.some((g) => g.place === 'shard_pedestal') || (d.state('frost').goal && d.state('frost').goal.place === 'shard_pedestal'), 'the top bidder walks to the pedestal');
  d.observe(o4, 4);
  assert.equal(d.events.filter((e) => e.clan === 'frost' && e.place === 'shard_pedestal').length, 1, 'the same bid is not queued twice');
  const o5 = JSON.parse(JSON.stringify(o4)); o5.relationships.clans.find((c) => c.clan === 'moss').fragment = 'dark';
  d.observe(o5, 5);
  assert.equal(d.directive('moss', 5).move, null, 'a clan that went dark goes home and stays');
  d.observe({ ...o5, season: { phase: 'vote' } }, 6);
  assert.equal(d.directive('ash', 6).move, 'gather');
});

test('route walk: an agent follows the walk graph from its camp to the Scroll and back with the motion model, inside the bridge corridor', () => {
  const camp = CAMPS.find((c) => c.id === 'moh');
  const m = createMotion(0);
  const pos = [camp.position[0], camp.position[2]];
  const follow = (route, maxT) => {
    let idx = 0, t = 0, maxSpeed = 0;
    while (t < maxT && idx < route.length) {
      const last = idx === route.length - 1, wp = route[idx];
      const w = steerTo([pos[0], 0, pos[1]], [wp[0], 0, wp[1]], last ? 0.35 : 0.7, { speedRef: 1.55, decel: 2.5 });
      if (!w) { idx++; continue; }
      const l = Math.hypot(w[0], w[1]);
      stepMotion(m, last ? w : [w[0] / l, w[1] / l], 1.55, 1 / 30, NPC_MOTION, true);
      pos[0] += m.vel[0] / 30; pos[1] += m.vel[1] / 30; t += 1 / 30;
      maxSpeed = Math.max(maxSpeed, Math.hypot(...m.vel));
      // Corridor check: on the bridge between the plateau and the plaza the agent stays within the bridge width.
      const r = Math.hypot(pos[0], pos[1]);
      if (r > PLAZA_RADIUS + 0.5 && r < 30 - 6.5 - 0.5) {
        const along = [Math.cos(camp.angle * DEG), Math.sin(camp.angle * DEG)];
        const lateral = Math.abs(pos[0] * -along[1] + pos[1] * along[0]);
        assert.ok(lateral < BRIDGE_WIDTH / 2 - 0.2, `stays on the bridge, lateral ${lateral.toFixed(2)} m at r ${r.toFixed(1)}`);
      }
    }
    return { t, idx, maxSpeed };
  };
  const out = planRoute([pos[0], 0, pos[1]], 'scroll');
  assert.ok(out && out.length >= 3);
  const go = follow(out, 60);
  assert.equal(go.idx, out.length, 'reached the Scroll');
  assert.ok(go.t > 12 && go.t < 25, 'about 21 m at 1.55 m/s with braking: ' + go.t.toFixed(1) + ' s');
  assert.ok(go.maxSpeed <= 1.55 + 1e-9);
  assert.ok(Math.hypot(pos[0], pos[1] - 4.2) < 0.5, 'on the plaza ring: ' + pos);
  const back = planRoute([pos[0], 0, pos[1]], 'camp:moss');
  const ret = follow(back, 60);
  assert.equal(ret.idx, back.length);
  assert.ok(Math.hypot(pos[0] - camp.position[0], pos[1] - camp.position[2]) < 0.5, 'home again');
  // The vote spot: every clan has a ring node at its own angle.
  for (const c of CAMPS) assert.ok(walkGraph().nodes.get('ring:' + c.angle), 'ring node for ' + c.id);
});
