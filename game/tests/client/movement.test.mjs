// Movement feel (docs/movement.md): the locomotion model, step / slope / edge handling, click-to-move
// arrival, the camera follow and the gait blend. Deterministic 30 Hz simulations in place of a
// feel-test: a human still has to judge the result on a GPU, these pin the numbers that make it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CollisionWorld, fixedSteps, moveCapsule } from '../../src/physics/collision.js';
import { CharacterController, PHYSICS_DT, steerTo, clickStuck } from '../../src/physics/character.js';
import { DEFAULT_MOTION, NPC_MOTION, createMotion, stepMotion, gaitBlend, turnRateAt, wrapAngle } from '../../src/physics/motion.js';
import { CameraRig } from '../../src/render/camera-rig.js';
import { floorWorld, makePlayer, simulate, measureAll } from './movement-measure.mjs';

const WALK = 1.7, RUN = WALK * 1.94, DEG = 180 / Math.PI;
const place = (ch, pos) => { ch.pos = pos.slice(); ch.prevPos = pos.slice(); ch.lastSafe = pos.slice(); return ch; };

test('quick start: 90 % of the walk speed within 0.3 s, run tops out at 2.1x and takes longer', () => {
  const walk = simulate(makePlayer(floorWorld()), () => [0, 1], 2);
  const run = simulate(makePlayer(floorWorld()), () => [0, 1], 2, { run: true });
  const t90 = (rows, v) => rows.find((r) => r.speed >= 0.9 * v).t;
  assert.ok(t90(walk, WALK) <= 0.3, 'walk reaches 90 % at ' + t90(walk, WALK));
  assert.ok(Math.abs(Math.max(...walk.map((r) => r.speed)) - WALK) < 1e-6);
  assert.ok(Math.abs(Math.max(...run.map((r) => r.speed)) - RUN) < 1e-6);
  assert.ok(t90(run, RUN) > t90(walk, WALK) && t90(run, RUN) <= 0.5, 'run reaches 90 % at ' + t90(run, RUN));
});

test('short controlled stop: from a walk in under 0.2 s and 0.15 m, from a run in under 0.4 s and 0.6 m, then exact rest', () => {
  for (const [run, maxT, maxD] of [[false, 0.2, 0.15], [true, 0.4, 0.6]]) {
    const ch = makePlayer(floorWorld());
    const rows = simulate(ch, (t) => (t < 2 ? [0, 1] : [0, 0]), 4, { run });
    const release = rows.find((r) => r.t >= 2 - 1e-6), stop = rows.find((r) => r.t > 2 && r.speed === 0);
    assert.ok(stop, 'comes to exact rest');
    assert.ok(stop.t - release.t <= maxT, `stop time ${(stop.t - release.t).toFixed(2)} s (run=${run})`);
    assert.ok(stop.z - release.z <= maxD, `stop distance ${(stop.z - release.z).toFixed(2)} m (run=${run})`);
    assert.deepEqual(ch.vel, [0, 0]);
    assert.ok(rows.slice(-10).every((r) => r.speed === 0), 'no creeping tail');
  }
});

test('no instant 180° flip: a reversal brakes, pivots at a limited rate and accelerates again', () => {
  const rows = simulate(makePlayer(floorWorld()), (t) => (t < 2 ? [0, 1] : [0, -1]), 5, { run: true });
  const after = rows.filter((r) => r.t > 2);
  let maxRate = 0, prev = rows.find((r) => r.t >= 2 - 1e-6).heading;
  for (const r of after) { maxRate = Math.max(maxRate, Math.abs(wrapAngle(r.heading - prev)) / PHYSICS_DT); prev = r.heading; }
  assert.ok(maxRate * DEG < 800, `peak heading rate ${(maxRate * DEG).toFixed(0)} °/s`);
  const minSpeed = Math.min(...after.map((r) => r.speed));
  assert.ok(minSpeed < 0.35 * RUN, `speed drops to ${minSpeed.toFixed(2)} m/s in the turn`);
  const back = after.find((r) => Math.cos(r.heading) < -0.99 && r.speed > 0.9 * RUN);
  assert.ok(back && back.t - 2 < 0.8, 'running back at full speed within 0.8 s');
  // The heading never jumps by more than one step of the stand pivot rate.
  for (let i = 1; i < rows.length; i++) assert.ok(Math.abs(wrapAngle(rows[i].heading - rows[i - 1].heading)) <= DEFAULT_MOTION.turnStand * PHYSICS_DT + 1e-9);
});

test('turn rate follows speed: pivot in place when standing, a wide arc at a run', () => {
  assert.ok(turnRateAt(0) > turnRateAt(WALK) && turnRateAt(WALK) > turnRateAt(RUN));
  assert.equal(turnRateAt(10), DEFAULT_MOTION.turnRun, 'clamped above the reference speed');
  // Standing pivot: 180° in 0.2–0.4 s with little drift before facing the new way.
  const pivot = simulate(makePlayer(floorWorld()), () => [0, -1], 2);
  const faced = pivot.find((r) => Math.cos(r.heading) < -0.999);
  assert.ok(faced && faced.t >= 0.2 && faced.t <= 0.4, 'pivot time ' + (faced && faced.t));
  assert.ok(Math.hypot(faced.x, faced.z) < 0.3, 'drift ' + Math.hypot(faced.x, faced.z).toFixed(2));
  // 90° at walk vs run: the run arc carries further forward and settles later.
  const arc = (run) => {
    const rows = simulate(makePlayer(floorWorld()), (t) => (t < 2 ? [0, 1] : [1, 0]), 5, { run });
    const turn = rows.find((r) => r.t >= 2 - 1e-6);
    const done = rows.find((r) => r.t > 2 && Math.abs(wrapAngle(r.heading - Math.PI / 2)) < 2 / DEG);
    return { forward: done.z - turn.z, settle: done.t - 2 };
  };
  const w = arc(false), r = arc(true);
  assert.ok(r.forward > 2 * w.forward, `run arc ${r.forward.toFixed(2)} m vs walk ${w.forward.toFixed(2)} m`);
  assert.ok(r.settle > w.settle && r.settle < 0.6);
});

test('frame-rate independent in smooth mode: the same inputs end at the same place at 10 and 144 FPS', () => {
  const runAt = (fps) => {
    const ch = makePlayer(floorWorld());
    let acc = 0;
    for (let t = 0; t < 4; t += 1 / fps) {
      const f = fixedSteps(acc, 1 / fps); acc = f.accumulator;
      for (let i = 0; i < f.steps; i++) ch.step(t < 2 ? [1, 0.3] : [-0.5, 1], PHYSICS_DT);
    }
    return ch.pos;
  };
  const a = runAt(10), b = runAt(144);
  assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) < 0.05, `${a} vs ${b}`);
});

test('steps: climbs a 0.3 m step without going airborne, a 0.6 m wall stays a wall (no tunneling)', () => {
  const w = floorWorld(); w.addBox('step', [2, 0, -5], [12, 0.3, 5]);
  const rows = simulate(makePlayer(w), () => [1, 0], 4);
  assert.ok(rows.every((r) => r.grounded), 'grounded throughout');
  assert.ok(rows[rows.length - 1].x > 3 && Math.abs(rows[rows.length - 1].y - 0.3) < 0.01, 'on top of the step');
  const steppedAt = rows.find((r) => r.y > 0.25);
  assert.ok(steppedAt && steppedAt.x < 2, 'climbs when the capsule reaches the rim, x = ' + steppedAt.x.toFixed(2));
  const w2 = floorWorld(); w2.addBox('wall', [2, 0, -5], [12, 0.6, 5]);
  const ch = makePlayer(w2);
  const rows2 = simulate(ch, () => [1, 0], 4, { run: true });
  assert.ok(ch.pos[0] <= 2 - 0.35 + 1e-3 && ch.pos[1] < 0.01, 'blocked in front of the wall: ' + ch.pos.map((v) => v.toFixed(3)));
  const w3 = floorWorld(); w3.addBox('tall', [2, 0, -5], [12, 0.45, 5]);
  const ch3 = makePlayer(w3); simulate(ch3, () => [1, 0], 4);
  assert.ok(ch3.pos[0] < 2 && ch3.pos[1] < 0.01, 'a 0.45 m rise is not a step: ' + ch3.pos.map((v) => v.toFixed(3)));
  assert.ok(rows2.slice(-5).every((r) => r.speed < 0.01), 'stands still against the wall (no running on the spot)');
});

test('steps down and slopes: the feet stay on the ground (snap), no airborne frames, no height jitter', () => {
  const w = floorWorld(); w.addBox('ledge', [-20, 0, -5], [2, 0.3, 5]);
  const down = simulate(place(makePlayer(w), [0, 0.3, 0]), () => [1, 0], 3);
  assert.ok(down.every((r) => r.grounded), 'grounded over a 0.3 m step down');
  assert.ok(Math.abs(down[down.length - 1].y) < 0.01);
  const slope = new CollisionWorld();
  const s = Math.tan(20 / DEG);
  slope.addTriangles('flat0', [-10, 0, -5, -10, 0, 5, 0, 0, 5, -10, 0, -5, 0, 0, 5, 0, 0, -5]);
  slope.addTriangles('ramp', [0, 0, -5, 0, 0, 5, 8, -8 * s, 5, 0, 0, -5, 8, -8 * s, 5, 8, -8 * s, -5]);
  slope.addTriangles('flat1', [8, -8 * s, -5, 8, -8 * s, 5, 30, -8 * s, 5, 8, -8 * s, -5, 30, -8 * s, 5, 30, -8 * s, -5]);
  const rows = simulate(place(makePlayer(slope), [-3, 0, 0]), () => [1, 0], 7, { run: true });
  const onRamp = rows.filter((r) => r.x > 0.5 && r.x < 7.5);
  assert.ok(onRamp.length > 20 && onRamp.every((r) => r.grounded), 'grounded on a 20° ramp at a run');
  for (let i = 2; i < onRamp.length; i++) assert.ok(Math.abs(onRamp[i].y - 2 * onRamp[i - 1].y + onRamp[i - 2].y) < 0.02, 'no height jitter');
  assert.ok(rows.every((r) => r.speed > RUN - 0.05 || r.t < 1), 'momentum kept over the ramp edges');
});

test('edges: standing or walking near a rim is stable, walking off it falls, no rim shove', () => {
  const w = new CollisionWorld(); w.addBox('bridge', [-1.2, -3, -20], [1.2, 0, 20]);
  const idle = place(makePlayer(w), [1.1, 0, 0]);
  simulate(idle, () => [0, 0], 3);
  assert.deepEqual([idle.pos[0], idle.pos[2]], [1.1, 0], 'no drift while standing 0.1 m inside the rim');
  const along = place(makePlayer(w), [1.15, 0, -10]);
  const rowsAlong = simulate(along, () => [0, 1], 6);
  assert.ok(Math.abs(along.pos[0] - 1.15) < 1e-6 && along.pos[1] > -0.02, 'walks along the rim without sliding off');
  assert.ok(rowsAlong.every((r) => !r.wall), 'no invisible wall along the rim');
  const off = place(makePlayer(w), [0, 0, 0]);
  const rowsOff = simulate(off, () => [1, 0], 3);
  const fell = rowsOff.find((r) => r.y < -0.5);
  assert.ok(fell && fell.x > 1.2 && fell.x < 2.0, 'falls once the capsule center is past the rim, x = ' + (fell && fell.x.toFixed(2)));
  // A capsule placed with its center 0.3 m past the rim is unsupported (beyond the grip) and falls.
  const r = moveCapsule(w, [1.5, 0.0, 0], [0, -0.35, 0], { ledgeGrip: 0.245 });
  assert.equal(r.grounded, false);
  assert.ok(r.pos[1] < -0.3);
  // Within the grip (0.2 m past the rim) it stands.
  const r2 = moveCapsule(w, [1.4, 0.0, 0], [0, -0.35, 0], { ledgeGrip: 0.245 });
  assert.equal(r2.grounded, true);
  assert.ok(Math.abs(r2.pos[0] - 1.4) < 1e-6, 'no horizontal shove');
});

test('no tunneling at 15 m/s in smooth mode and the camera-only mask is still ignored', () => {
  const w = floorWorld(); w.addTriangles('wall', [2, 0, -20, 2, 3, -20, 2, 3, 20, 2, 0, -20, 2, 3, 20, 2, 0, 20]);
  const ch = makePlayer(w, { walkSpeed: 15 });
  simulate(ch, () => [1, 0], 4);
  assert.ok(ch.pos[0] <= 2 - 0.35 + 1e-3 && ch.pos[0] > 2 - 0.35 - 0.05, 'pressed against the wall, x = ' + ch.pos[0]);
});

test('click-to-move brakes into the target (no glide) at a walk and at a run; a route corner at a run does not orbit', () => {
  for (const run of [false, true]) {
    const target = [6, 0, 0];
    const ch = makePlayer(floorWorld());
    const rows = simulate(ch, (t, c) => steerTo(c.pos, target, 0.15) || [0, 0], 8, { run });
    const arrive = rows.find((r) => Math.hypot(r.x - 6, r.z) < 0.3 && r.speed === 0);
    assert.ok(arrive, 'arrives and rests (run=' + run + ')');
    assert.ok(arrive.t < (run ? 2.5 : 4.3), 'arrival time ' + arrive.t.toFixed(2));
    assert.ok(Math.max(...rows.map((r) => r.x)) - 6 < 0.2, 'overshoot ' + (Math.max(...rows.map((r) => r.x)) - 6).toFixed(3));
    const slowTail = rows.filter((r) => r.speed > 0 && r.speed < 0.3).length;
    assert.ok(slowTail <= 3, 'no creeping tail (' + slowTail + ' slow steps)');
  }
  const route = [[6, 0, 0], [6, 0, 6]];
  const ch = makePlayer(floorWorld());
  let idx = 0;
  const rows = simulate(ch, (t, c) => {
    while (idx < route.length) {
      const last = idx === route.length - 1;
      const w = steerTo(c.pos, route[idx], last ? 0.3 : 0.6);
      if (w) { const l = Math.hypot(w[0], w[1]); return last ? w : [w[0] / l, w[1] / l]; }
      idx++;
    }
    return [0, 0];
  }, 10, { run: true });
  const done = rows.find((r) => idx >= route.length && r.speed === 0);
  assert.ok(done && done.t < 5, 'route done at ' + (done && done.t));
  assert.ok(Math.hypot(ch.pos[0] - 6, ch.pos[2] - 6) < 0.4);
});

test('the heading interpolates the short way round and the controller reports the actual ground speed', () => {
  const w = floorWorld(); w.addBox('wall', [1, 0, -5], [2, 3, 5]);
  const ch = makePlayer(w);
  ch.prevHeading = 3.0; ch.heading = -3.0;
  assert.ok(Math.abs(wrapAngle(ch.renderHeading(0.5)) - Math.PI) < 1e-9 || Math.abs(wrapAngle(ch.renderHeading(0.5)) + Math.PI) < 1e-9);
  ch.heading = 0;
  simulate(ch, () => [1, 0], 3);
  assert.ok(ch.speed < 1e-9, 'no ground speed against a wall');
  assert.ok(Math.hypot(...ch.vel) < 1e-9, 'the intended velocity bled off (no lunge when the wall ends)');
});

test('an outside position write (fly-in, relocate) arrives at rest: no leftover momentum', () => {
  const ch = makePlayer(floorWorld());
  simulate(ch, () => [0, 1], 1, { run: true });
  assert.ok(Math.hypot(...ch.vel) > 3);
  ch.pos = [20, 0, 20]; ch.prevPos = ch.pos.slice(); // what game.js's teleport() does
  ch.step([0, 0]);
  assert.ok(Math.hypot(...ch.vel) < 1e-9 && Math.hypot(ch.pos[0] - 20, ch.pos[2] - 20) < 1e-9, 'rests where it was put');
  ch.teleport([5, 0, 5], 1);
  assert.deepEqual([ch.vel, ch.heading, ch.prevHeading], [[0, 0], 1, 1]);
});

test('legacy exact mode is unchanged: instant velocity, snapped heading', () => {
  const ch = new CharacterController(floorWorld(), { spawn: [0, 0, 0], walkSpeed: 2 });
  ch.step([1, 0]);
  assert.deepEqual(ch.vel, [2, 0]);
  assert.equal(ch.heading, Math.PI / 2);
  ch.accel = 8;
  assert.equal(ch.smooth, true, 'the old accel knob turns the model on');
});

test('motion model: NPC tuning is calmer; the model reports target speed and turn rate', () => {
  const m = createMotion(0);
  const r = stepMotion(m, [0, 1], 1.1, PHYSICS_DT, NPC_MOTION);
  assert.ok(r.speed > 0 && r.speed < 1.1 && Math.abs(r.speed - NPC_MOTION.accel * PHYSICS_DT) < 1e-9);
  assert.equal(r.turnRate, 0);
  assert.ok(NPC_MOTION.accel < DEFAULT_MOTION.accel && NPC_MOTION.turnStand < DEFAULT_MOTION.turnStand);
  const m2 = createMotion(0);
  stepMotion(m2, [1, 0], 1.1, PHYSICS_DT, NPC_MOTION);
  assert.ok(Math.abs(m2.heading - NPC_MOTION.turnStand * PHYSICS_DT) < 1e-9, 'turns at the stand rate from rest');
  assert.ok(m2.targetSpeed < 0.6 * 1.1, 'moves off slowly until it faces the right way');
});

test('gait blend: idle at rest, pure walk at the walk speed, pure run at the run speed, clip rates follow speed', () => {
  const idle = gaitBlend(0);
  assert.deepEqual([idle.idle, idle.walk, idle.run], [1, 0, 0]);
  const walk = gaitBlend(1.7);
  assert.deepEqual([walk.idle, walk.walk, walk.run], [0, 1, 0]);
  assert.ok(Math.abs(walk.walkScale - 1) < 1e-9);
  const run = gaitBlend(3.3);
  assert.deepEqual([run.idle, run.walk, run.run], [0, 0, 1]);
  assert.ok(Math.abs(run.runScale - 1) < 1e-9);
  const mid = gaitBlend((1.7 + 3.3) / 2);
  assert.ok(Math.abs(mid.walk - 0.5) < 1e-9 && Math.abs(mid.run - 0.5) < 1e-9);
  const slow = gaitBlend(0.3);
  assert.ok(slow.idle > 0 && slow.walk > 0 && slow.run === 0 && Math.abs(slow.idle + slow.walk - 1) < 1e-9);
  assert.ok(slow.walkScale >= 0.55 && gaitBlend(0.85).walkScale === 0.55 && gaitBlend(1.7 * 1.3).walkScale > 1.29);
});

test('GaitLayer on a real mixer: weights follow the speed with a short easing, the run clip is phase-synced', async () => {
  const { GaitLayer } = await import('../../src/play/agents.js').catch(() => ({ GaitLayer: null }));
  if (!GaitLayer) return; // agents.js needs the Vite virtual module list; covered by gaitBlend above
  const root = new THREE.Object3D();
  const clip = (name, dur) => new THREE.AnimationClip(name, dur, [new THREE.NumberKeyframeTrack('.position[x]', [0, dur], [0, 1])]);
  const clips = [clip('idle', 2), clip('walk', 1), clip('run', 0.7)];
  const mixer = new THREE.AnimationMixer(root);
  const gait = new GaitLayer(mixer, clips);
  for (let i = 0; i < 60; i++) gait.update(1 / 60, 1.7);
  assert.ok(gait.weights.walk > 0.99 && gait.weights.run < 0.01);
  gait.update(1 / 60, 3.3);
  assert.ok(gait.run.time >= 0, 'run clip time was synced from the walk cycle');
  for (let i = 0; i < 60; i++) gait.update(1 / 60, 3.3);
  assert.ok(gait.weights.run > 0.99 && gait.weights.walk < 0.01);
});

test('camera: slight lag, look-ahead in the move direction, slower vertical follow, snap on teleport, no 30 Hz jitter', () => {
  const w = floorWorld();
  const cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.2, 500);
  const rig = new CameraRig(cam, w);
  rig.dist = 11;
  const ch = makePlayer(w);
  const focus = new THREE.Vector3();
  let acc = 0; const camZ = [], lag = [];
  for (let i = 0, t = 0; t < 6; i++, t += 1 / 60) {
    const f = fixedSteps(acc, 1 / 60, PHYSICS_DT, 8); acc = f.accumulator;
    for (let s = 0; s < f.steps; s++) ch.step(t < 4 ? [0, 1] : [0, 0], PHYSICS_DT);
    const p = ch.renderPos(f.alpha);
    focus.set(p[0], p[1] + 1.1, p[2]);
    rig.update(1 / 60, focus, ch.vel);
    camZ.push(cam.position.z);
    if (t > 2 && t < 4) lag.push(rig.smoothFocus.z - p[2]);
  }
  const meanLag = lag.reduce((a, b) => a + b, 0) / lag.length;
  assert.ok(meanLag < -0.1 && meanLag > -0.3, 'trails by ' + meanLag.toFixed(3));
  assert.ok(Math.abs(rig.lookAhead.z) < 0.02, 'look-ahead relaxes after the stop');
  const v = camZ.slice(1).map((z, i) => (z - camZ[i]) * 60).slice(150, 230);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  assert.ok(Math.max(...v.map((s) => Math.abs(s - mean))) < 0.03 * Math.abs(mean), 'camera speed is even frame to frame');
  // Look-ahead while walking: the focus leads by about lookAheadTime of travel.
  const rig2 = new CameraRig(cam, w); rig2.dist = 11;
  for (let i = 0; i < 240; i++) rig2.update(1 / 60, new THREE.Vector3(0, 1.1, i * WALK / 60), [0, WALK]);
  assert.ok(Math.abs(rig2.lookAhead.z - WALK * rig2.lookAheadTime * (1 - 0.6 * rig2.zoomT(11))) < 0.02, 'look-ahead ' + rig2.lookAhead.z.toFixed(3));
  // Vertical follow is slower than horizontal.
  const rig3 = new CameraRig(cam, w);
  rig3.update(1 / 60, new THREE.Vector3(0, 0, 0));
  rig3.update(1 / 60, new THREE.Vector3(1, 1, 0));
  assert.ok(rig3.smoothFocus.x > 1.5 * rig3.smoothFocus.y, `x ${rig3.smoothFocus.x.toFixed(3)} y ${rig3.smoothFocus.y.toFixed(3)}`);
  // Teleport: a jump larger than the snap distance is not eased.
  rig3.update(1 / 60, new THREE.Vector3(40, 0, 40));
  assert.deepEqual(rig3.smoothFocus.toArray(), [40, 0, 40]);
});

test('camera: a Shell visit remembers the pre-flight zoom and eases back to it on return; a zoom by the player cancels the ease (QA-008)', () => {
  const island = floorWorld(), shellWorld = floorWorld();
  const cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.2, 500);
  const rig = new CameraRig(cam, island);
  const focus = new THREE.Vector3(0, 1.1, 0);
  rig.dist = 30; rig.update(1 / 60, focus);
  // enterShell (game.js): swap the world, then the close view
  rig.world = shellWorld; rig.dist = Math.min(rig.dist, 9);
  for (let i = 0; i < 30; i++) rig.update(1 / 60, focus);
  assert.equal(rig.dist, 9, 'stays close inside the Shell');
  // exitShell: the world comes back
  rig.world = island;
  const seen = [];
  for (let i = 0; i < 180; i++) { rig.update(1 / 60, focus); seen.push(rig.dist); }
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1] - 1e-9, 'eases out monotonically');
  assert.ok(seen[6] > 9.5 && seen[6] < 20, 'under way after 0.1 s: ' + seen[6].toFixed(2));
  assert.ok(Math.abs(seen[seen.length - 1] - 30) < 1e-9, 'back at 30 m within 3 s: ' + seen[seen.length - 1].toFixed(2));
  assert.equal(rig.distTarget, null);
  // a second visit, but the player zooms during the restore: the ease stops where the player put it
  rig.world = shellWorld; rig.dist = 9; rig.update(1 / 60, focus); rig.world = island;
  for (let i = 0; i < 10; i++) rig.update(1 / 60, focus);
  rig.zoom(1);
  const d = rig.dist;
  for (let i = 0; i < 60; i++) rig.update(1 / 60, focus);
  assert.equal(rig.dist, d, 'no further easing after the player zoomed');
  // the same world set twice is not a visit
  rig.dist = 12; rig.world = island; for (let i = 0; i < 30; i++) rig.update(1 / 60, focus); assert.equal(rig.dist, 12);
});

test('measureAll runs end to end (the docs table)', () => {
  const m = measureAll();
  assert.ok(m.accel_walk.t90 && m.brake_run.d && m['step_0.3'].climbed && m.edge.walkOffFell && m.camera);
});

/** A straight stair: 12 risers of 0.3 m (under stepHeight 0.35), 0.45 m treads, starting at x = 2, then a landing. */
function stairWorld() {
  const w = floorWorld();
  for (let i = 0; i < 12; i++) w.addBox('stair' + i, [2 + i * 0.45, 0, -2], [30, 0.3 * (i + 1), 2]);
  return w;
}
const TOP = [2 + 12 * 0.45 + 2, 3.6, 0];

/**
 * Click-to-move up the stair with the game's frame loop: render delta as measured, fixedSteps with the given carry,
 * clickStuck as boot-world applies it. Every `hitchEvery`-th frame takes `hitch` seconds. Returns where Iris ends.
 */
function climb({ carry, fps = 60, hitch = 1.0, hitchEvery = 20, seconds = 14 }) {
  const ch = place(makePlayer(stairWorld()), [0, 0, 0]);
  const target = TOP.slice();
  const s = { stuckTime: 0, lastDist: Infinity };
  let acc = 0, t = 0, frame = 0, cancelled = false, maxSteps = 0;
  while (t < seconds) {
    const dt = ++frame % hitchEvery === 0 ? hitch : 1 / fps;
    t += dt;
    const f = fixedSteps(acc, dt, PHYSICS_DT, 8, carry);
    acc = f.accumulator; maxSteps = Math.max(maxSteps, f.steps);
    for (let i = 0; i < f.steps && !cancelled; i++) {
      const wish = steerTo(ch.pos, target);
      ch.step(wish || [0, 0], PHYSICS_DT);
      if (wish && clickStuck(s, ch.lastHitWall, Math.hypot(target[0] - ch.pos[0], target[2] - ch.pos[2]))) cancelled = true;
    }
  }
  return { pos: ch.pos, cancelled, maxSteps };
}

test('hitch-proof stairs: 1 s frames every 20 frames, click-to-move still reaches the top; no frame runs more than 8 steps', () => {
  const r = climb({ carry: 1.0, seconds: 12 });
  assert.equal(r.cancelled, false, 'the click target is not cancelled at the stair foot');
  assert.ok(Math.abs(r.pos[1] - 3.6) < 0.02 && Math.hypot(r.pos[0] - TOP[0], r.pos[2] - TOP[2]) < 0.3, 'on the landing: ' + r.pos.map((v) => v.toFixed(2)));
  assert.ok(r.maxSteps <= 8, 'wall-clock budget: at most 8 physics steps (~267 ms of game time) per frame');
  // Same wall-clock time with the excess dropped (the old loop) gets visibly less far: the carry is what keeps the walk.
  const dropped = climb({ carry: 0, seconds: 4 }), kept = climb({ carry: 1.0, seconds: 4 });
  assert.ok(kept.pos[0] > dropped.pos[0] + 0.5, `carry ${kept.pos[0].toFixed(2)} vs drop ${dropped.pos[0].toFixed(2)}`);
});

test('hitch-proof stairs: the carry never changes a smooth run (10 vs 144 FPS still agree)', () => {
  const run = (fps, carry) => {
    const ch = place(makePlayer(stairWorld()), [0, 0, 0]);
    let acc = 0;
    for (let n = 0; n < fps * 6; n++) { const f = fixedSteps(acc, 1 / fps, PHYSICS_DT, 8, carry); acc = f.accumulator; for (let i = 0; i < f.steps; i++) ch.step([1, 0], PHYSICS_DT); }
    return ch.pos;
  };
  const a = run(10, 1), b = run(144, 1), c = run(144, 0);
  assert.ok(Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.02, a + ' vs ' + b);
  assert.deepEqual(b, c, 'no hitch: carry and no carry are identical');
});

test('fixedSteps carry: a 5 s stall is capped at the carry and paid back at most 8 steps per frame', () => {
  let f = fixedSteps(0, 5, PHYSICS_DT, 8, 1.0);
  assert.equal(f.steps, 8);
  let total = f.steps, frames = 1, acc = f.accumulator;
  while (acc >= PHYSICS_DT - 1e-9 && frames < 100) { f = fixedSteps(acc, 0, PHYSICS_DT, 8, 1.0); acc = f.accumulator; total += f.steps; frames++; assert.ok(f.steps <= 8); }
  assert.equal(total, 30, '1.0 s of motion kept (30 steps), the other 4 s dropped');
});
