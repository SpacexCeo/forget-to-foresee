// Deterministic movement measurements for docs/movement.md: `node tests/client/movement-measure.mjs`.
// Drives the character controller and the camera rig with the same fixed 30 Hz loop main.js uses and
// prints the numbers a human would otherwise have to feel out on a GPU: acceleration and braking
// times, stopping distance, turn radius, reversal behaviour, steps, slopes, edges and camera lag.
import * as THREE from 'three';
import { CollisionWorld, fixedSteps, boxTriangles, MASK_CAMERA } from '../../src/physics/collision.js';
import { CharacterController, PHYSICS_DT, steerTo } from '../../src/physics/character.js';
import { CameraRig } from '../../src/render/camera-rig.js';

const WALK = 1.7;
const DEG = 180 / Math.PI;
const fmt = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d) : String(v));

export function floorWorld(size = 200) {
  const w = new CollisionWorld();
  w.addTriangles('floor', [-size, 0, -size, -size, 0, size, size, 0, size, -size, 0, -size, size, 0, size, size, 0, -size]);
  return w;
}

export function makePlayer(world, opts = {}) {
  const ch = new CharacterController(world, { spawn: [0, 0, 0], walkSpeed: WALK, ...opts });
  if (opts.legacyAccel) ch.accel = opts.legacyAccel; else ch.smooth = true;
  return ch;
}

/** Runs `seconds` of fixed steps; `wish(t, ch)` returns [x, z]. Records one row per physics step. */
export function simulate(ch, wish, seconds, { run = false, onStep } = {}) {
  const rows = [];
  ch.run = run;
  for (let i = 0, t = 0; t < seconds - 1e-9; i++, t += PHYSICS_DT) {
    const w = wish(t, ch) || [0, 0];
    const r = ch.step(w, PHYSICS_DT);
    const speed = Math.hypot(ch.vel[0], ch.vel[1]);
    rows.push({ t: t + PHYSICS_DT, x: ch.pos[0], y: ch.pos[1], z: ch.pos[2], speed, heading: ch.heading, grounded: ch.grounded, wall: r.hitWall });
    if (onStep) onStep(rows[rows.length - 1], ch);
  }
  return rows;
}

const timeTo = (rows, pred) => { const r = rows.find(pred); return r ? r.t : null; };

export function measureAll(opts = {}) {
  const out = {};
  const mk = (w) => makePlayer(w || floorWorld(), opts);
  // 1. Acceleration (walk and run): time and distance to 90 % of the target speed.
  for (const [name, run, target] of [['walk', false, WALK], ['run', true, WALK * 2.1]]) {
    const ch = mk();
    const rows = simulate(ch, () => [0, 1], 3, { run });
    const t90 = timeTo(rows, (r) => r.speed >= 0.9 * target);
    const d90 = t90 ? rows.find((r) => r.t === t90).z : null;
    out[`accel_${name}`] = { t90, d90, top: Math.max(...rows.map((r) => r.speed)) };
  }
  // 2. Braking from walk and run: stopping time and distance after the input is released.
  for (const [name, run] of [['walk', false], ['run', true]]) {
    const ch = mk();
    const rows = simulate(ch, (t) => (t < 2 ? [0, 1] : [0, 0]), 4, { run });
    const release = rows.find((r) => r.t >= 2 - 1e-6);
    const stop = rows.find((r) => r.t > 2 && r.speed < 0.02);
    out[`brake_${name}`] = { t: stop ? stop.t - release.t : null, d: stop ? stop.z - release.z : null };
  }
  // 3. Reversal (180° flip at full speed): minimum speed during the turn, time until moving back at 90 %,
  //    overshoot past the reversal point and the peak heading rate.
  for (const [name, run, target] of [['walk', false, WALK], ['run', true, WALK * 2.1]]) {
    const ch = mk();
    const rows = simulate(ch, (t) => (t < 2 ? [0, 1] : [0, -1]), 5, { run });
    const after = rows.filter((r) => r.t > 2);
    const flip = rows.find((r) => r.t >= 2 - 1e-6);
    const back = after.find((r) => ch.vel && r.speed >= 0.9 * target && r.t > 2.05 && Math.cos(r.heading) < -0.9);
    let minSpeed = Infinity, maxRate = 0, prev = flip.heading;
    for (const r of after) { minSpeed = Math.min(minSpeed, r.speed); const d = Math.atan2(Math.sin(r.heading - prev), Math.cos(r.heading - prev)); maxRate = Math.max(maxRate, Math.abs(d) / PHYSICS_DT); prev = r.heading; }
    out[`reverse_${name}`] = { minSpeed, recover: back ? back.t - 2 : null, overshoot: Math.max(...after.map((r) => r.z)) - flip.z, maxHeadingRate: maxRate * DEG };
  }
  // 4. A 90° turn at speed: turning radius from the path (lateral offset at the moment the heading is 45° through).
  for (const [name, run] of [['walk', false], ['run', true]]) {
    const ch = mk();
    const rows = simulate(ch, (t) => (t < 2 ? [0, 1] : [1, 0]), 5, { run });
    const turn = rows.find((r) => r.t >= 2 - 1e-6);
    const after = rows.filter((r) => r.t > 2);
    const done = after.find((r) => Math.abs(Math.atan2(Math.sin(r.heading - Math.PI / 2), Math.cos(r.heading - Math.PI / 2))) < 2 * Math.PI / 180);
    // Radius of the arc: forward travel past the corner until the heading has fully turned.
    const forward = done ? done.z - turn.z : null;
    const minSpeed = Math.min(...after.map((r) => r.speed));
    out[`turn90_${name}`] = { settle: done ? done.t - 2 : null, arcForward: forward, minSpeed };
  }
  // 5. Standing pivot: time to turn 180° from rest.
  {
    const ch = mk();
    ch.heading = 0;
    const rows = simulate(ch, () => [0, -1], 2);
    const done = rows.find((r) => Math.cos(r.heading) < -0.999);
    out.pivot_stand = { t180: done ? done.t : null, driftBeforeFacing: done ? Math.hypot(done.x, done.z) : null };
  }
  // 6. Steps: walk into a 0.15 m, 0.30 m and 0.45 m step; does the capsule climb, and how long does it take?
  for (const h of [0.15, 0.3, 0.45]) {
    const w = floorWorld();
    w.addBox('step', [2, 0, -5], [12, h, 5]);
    const ch = mk(w);
    const rows = simulate(ch, () => [1, 0], 4);
    const up = rows.find((r) => r.y > h - 0.02 && r.x > 2);
    const air = rows.filter((r) => !r.grounded).length;
    out[`step_${h}`] = { climbed: !!up, at: up ? up.t : null, finalX: ch.pos[0], airborneSteps: air };
  }
  // 7. Slopes: walk down a 20° ramp, then along a 12° ramp up; count airborne steps and vertical jitter.
  for (const deg of [12, 20, 30]) {
    const w = new CollisionWorld();
    const s = Math.tan(deg / DEG);
    // flat start, ramp down 8 m, flat end
    w.addTriangles('flat0', [-10, 0, -5, -10, 0, 5, 0, 0, 5, -10, 0, -5, 0, 0, 5, 0, 0, -5]);
    w.addTriangles('ramp', [0, 0, -5, 0, 0, 5, 8, -8 * s, 5, 0, 0, -5, 8, -8 * s, 5, 8, -8 * s, -5]);
    w.addTriangles('flat1', [8, -8 * s, -5, 8, -8 * s, 5, 30, -8 * s, 5, 8, -8 * s, -5, 30, -8 * s, 5, 30, -8 * s, -5]);
    const ch = mk(w); ch.pos = [-3, 0, 0]; ch.prevPos = ch.pos.slice(); ch.lastSafe = ch.pos.slice();
    const rows = simulate(ch, () => [1, 0], 7);
    const onRamp = rows.filter((r) => r.x > 0.3 && r.x < 7.7);
    const air = onRamp.filter((r) => !r.grounded).length;
    // vertical jitter: second difference of y while on the ramp
    let jit = 0; for (let i = 2; i < onRamp.length; i++) jit = Math.max(jit, Math.abs(onRamp[i].y - 2 * onRamp[i - 1].y + onRamp[i - 2].y));
    const speeds = onRamp.map((r) => r.speed);
    out[`slope_down_${deg}`] = { airborneSteps: air, rampSteps: onRamp.length, yJitter: jit, minSpeed: Math.min(...speeds), maxSpeed: Math.max(...speeds) };
  }
  // 8. Edge: stand on a 2.4 m wide bridge (no rails) with the capsule center 0.1 m inside the edge, idle;
  //    then walk along the edge; then walk straight off it.
  {
    const w = new CollisionWorld();
    w.addBox('bridge', [-1.2, -3, -20], [1.2, 0, 20]);
    const idle = mk(w); idle.pos = [1.1, 0, 0]; idle.prevPos = idle.pos.slice(); idle.lastSafe = idle.pos.slice();
    const rowsIdle = simulate(idle, () => [0, 0], 3);
    const along = mk(w); along.pos = [1.05, 0, -10]; along.prevPos = along.pos.slice(); along.lastSafe = along.pos.slice();
    const rowsAlong = simulate(along, () => [0, 1], 6);
    const off = mk(w); off.pos = [0, 0, 0]; off.prevPos = off.pos.slice(); off.lastSafe = off.pos.slice();
    const rowsOff = simulate(off, () => [1, 0], 3);
    const fell = rowsOff.find((r) => r.y < -0.5);
    out.edge = {
      idleDriftX: idle.pos[0] - 1.1, idleFell: idle.pos[1] < -0.5, idleRespawns: idle.respawns,
      alongDriftX: along.pos[0] - 1.05, alongFell: along.pos[1] < -0.5, alongZ: along.pos[2] + 10, alongWallSteps: rowsAlong.filter((r) => r.wall).length,
      walkOffFallsAtX: fell ? fell.x : null, walkOffFell: !!fell,
    };
    void rowsIdle;
  }
  // 9. Click-to-move: arrival at a target 6 m away (overshoot, settle time) and a route with a 90° corner.
  {
    const ch = mk();
    const target = [6, 0, 0];
    const rows = simulate(ch, (t, c) => steerTo(c.pos, target, 0.15) || [0, 0], 8);
    const arrive = rows.find((r) => Math.hypot(r.x - 6, r.z) < 0.2 && r.speed < 0.05);
    out.click_6m = { arrive: arrive ? arrive.t : null, overshoot: Math.max(...rows.map((r) => r.x)) - 6, final: Math.hypot(ch.pos[0] - 6, ch.pos[2]) };
    const route = [[6, 0, 0], [6, 0, 6]];
    const ch2 = mk();
    let idx = 0;
    const rows2 = simulate(ch2, (t, c) => {
      while (idx < route.length) {
        const last = idx === route.length - 1;
        const w = steerTo(c.pos, route[idx], last ? 0.3 : 0.6);
        if (w) { const l = Math.hypot(w[0], w[1]); return last || !l ? w : [w[0] / l, w[1] / l]; }
        idx++;
      }
      return [0, 0];
    }, 12, { run: true });
    const end = rows2.find((r) => idx >= route.length && r.speed < 0.05);
    out.route_corner_run = { done: idx >= route.length, t: end ? end.t : null, maxX: Math.max(...rows2.map((r) => r.x)), final: Math.hypot(ch2.pos[0] - 6, ch2.pos[2] - 6) };
  }
  // 10. Camera: follow lag at steady walk, look-ahead, and per-frame focus smoothness at 60 fps over 30 Hz physics.
  {
    const w = floorWorld();
    const cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.2, 500);
    const rig = new CameraRig(cam, w);
    rig.dist = 11;
    const ch = mk(w);
    let acc = 0; const camXs = [], focusLag = [];
    const focus = new THREE.Vector3();
    for (let i = 0, t = 0; t < 6; i++, t += 1 / 60) {
      const f = fixedSteps(acc, 1 / 60, PHYSICS_DT, 8); acc = f.accumulator;
      for (let s = 0; s < f.steps; s++) ch.step(t < 4 ? [0, 1] : [0, 0], PHYSICS_DT);
      const p = ch.renderPos(f.alpha);
      focus.set(p[0], p[1] + 1.1, p[2]);
      rig.update(1 / 60, focus, rig.update.length >= 3 ? ch.vel : undefined);
      camXs.push(cam.position.z);
      if (t > 2 && t < 4) focusLag.push(rig.smoothFocus.z - p[2]);
    }
    const v = camXs.slice(1).map((z, i) => (z - camXs[i]) * 60);
    const steady = v.slice(150, 230);
    const mean = steady.reduce((a, b) => a + b, 0) / steady.length;
    const jitter = Math.max(...steady.map((s) => Math.abs(s - mean)));
    out.camera = { lagAtWalk: focusLag.reduce((a, b) => a + b, 0) / focusLag.length, lookAhead: rig.lookAhead ? rig.lookAhead.length() : 0, frameJitterPct: (jitter / Math.abs(mean)) * 100, settleAfterStop: (() => { const idx = v.findIndex((s, i) => i > 240 && Math.abs(s) < 0.01); return idx >= 0 ? idx / 60 - 4 : null; })() };
  }
  return out;
}

export function report(out) {
  const lines = [];
  const row = (k, v) => lines.push(`| ${k} | ${v} |`);
  lines.push('| measure | value |', '|---|---|');
  row('walk: time / distance to 90 % speed; top speed', `${fmt(out.accel_walk.t90)} s / ${fmt(out.accel_walk.d90)} m; ${fmt(out.accel_walk.top)} m/s`);
  row('run: time / distance to 90 % speed; top speed', `${fmt(out.accel_run.t90)} s / ${fmt(out.accel_run.d90)} m; ${fmt(out.accel_run.top)} m/s`);
  row('stop from walk: time / distance', `${fmt(out.brake_walk.t)} s / ${fmt(out.brake_walk.d)} m`);
  row('stop from run: time / distance', `${fmt(out.brake_run.t)} s / ${fmt(out.brake_run.d)} m`);
  row('180° flip at walk: min speed / recover / overshoot / peak heading rate', `${fmt(out.reverse_walk.minSpeed)} m/s / ${fmt(out.reverse_walk.recover)} s / ${fmt(out.reverse_walk.overshoot)} m / ${fmt(out.reverse_walk.maxHeadingRate, 0)} °/s`);
  row('180° flip at run: min speed / recover / overshoot / peak heading rate', `${fmt(out.reverse_run.minSpeed)} m/s / ${fmt(out.reverse_run.recover)} s / ${fmt(out.reverse_run.overshoot)} m / ${fmt(out.reverse_run.maxHeadingRate, 0)} °/s`);
  row('90° turn at walk: settle / forward travel in the arc / min speed', `${fmt(out.turn90_walk.settle)} s / ${fmt(out.turn90_walk.arcForward)} m / ${fmt(out.turn90_walk.minSpeed)} m/s`);
  row('90° turn at run: settle / forward travel in the arc / min speed', `${fmt(out.turn90_run.settle)} s / ${fmt(out.turn90_run.arcForward)} m / ${fmt(out.turn90_run.minSpeed)} m/s`);
  row('pivot 180° from rest: time / drift before facing', `${fmt(out.pivot_stand.t180)} s / ${fmt(out.pivot_stand.driftBeforeFacing)} m`);
  for (const h of [0.15, 0.3, 0.45]) { const s = out[`step_${h}`]; row(`step ${h} m`, s.climbed ? `climbed at ${fmt(s.at)} s, airborne steps ${s.airborneSteps}` : `blocked (x = ${fmt(s.finalX)})`); }
  for (const d of [12, 20, 30]) { const s = out[`slope_down_${d}`]; row(`down a ${d}° ramp: airborne steps / y jitter / speed range`, `${s.airborneSteps} of ${s.rampSteps} / ${fmt(s.yJitter, 4)} m / ${fmt(s.minSpeed)}–${fmt(s.maxSpeed)} m/s`); }
  const e = out.edge;
  row('bridge edge, idle 0.1 m inside: drift / fell', `${fmt(e.idleDriftX, 3)} m / ${e.idleFell}`);
  row('bridge edge, walking along it: drift / fell / wall-contact steps', `${fmt(e.alongDriftX, 3)} m / ${e.alongFell} / ${e.alongWallSteps}`);
  row('walk straight off the edge', e.walkOffFell ? `falls at x = ${fmt(e.walkOffFallsAtX)} (edge at 1.2)` : 'never falls');
  row('click 6 m away: arrival / overshoot / final error', `${fmt(out.click_6m.arrive)} s / ${fmt(out.click_6m.overshoot, 3)} m / ${fmt(out.click_6m.final, 3)} m`);
  row('route with a 90° corner at run: done / time / final error', `${out.route_corner_run.done} / ${fmt(out.route_corner_run.t)} s / ${fmt(out.route_corner_run.final, 3)} m`);
  row('camera: focus lag at walk / look-ahead / frame jitter / settle after stop', `${fmt(out.camera.lagAtWalk, 3)} m / ${fmt(out.camera.lookAhead)} m / ${fmt(out.camera.frameJitterPct, 1)} % / ${fmt(out.camera.settleAfterStop)} s`);
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const legacy = process.argv.includes('--legacy');
  console.log(report(measureAll(legacy ? { legacyAccel: 8 } : {})));
}
