// Swept capsule collision, camera sweep, ray cast and the fixed 30 Hz step (src/physics/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CollisionWorld, moveCapsule, sweepSphere, rayCast, fixedSteps, closestSegmentTriangle, boxTriangles, transformTriangles, MASK_PLAYER, MASK_CAMERA,
} from '../../src/physics/collision.js';
import { CharacterController, PHYSICS_DT, steerTo } from '../../src/physics/character.js';

const R = 0.35, H = 1.75;

/** A flat floor at y = 0 plus an optional single-sided thin wall (one quad, zero thickness) at x = wallX. */
function makeWorld({ wallX = null, mask } = {}) {
  const w = new CollisionWorld();
  w.addTriangles('floor', [-50, 0, -50, -50, 0, 50, 50, 0, 50, -50, 0, -50, 50, 0, 50, 50, 0, -50]);
  if (wallX != null) w.addTriangles('wall', [wallX, 0, -20, wallX, 3, -20, wallX, 3, 20, wallX, 0, -20, wallX, 3, 20, wallX, 0, 20], mask);
  return w;
}

test('segment-triangle distance: parallel, crossing and edge cases', () => {
  const a = [0, 0, 0], b = [1, 0, 0], c = [0, 0, 1];
  assert.ok(Math.abs(closestSegmentTriangle([0.2, 1, 0.2], [0.2, 2, 0.2], a, b, c).d2 - 1) < 1e-9);
  assert.equal(closestSegmentTriangle([0.2, -1, 0.2], [0.2, 1, 0.2], a, b, c).d2, 0);
  const edge = closestSegmentTriangle([2, 0, -1], [2, 0, 1], a, b, c);
  assert.ok(Math.abs(edge.d2 - 1) < 1e-9, 'closest to vertex b at distance 1');
});

test('capsule falls onto the floor, rests at y = 0 and is grounded', () => {
  const w = makeWorld();
  const ch = new CharacterController(w, { spawn: [0, 3, 0] });
  for (let i = 0; i < 90; i++) ch.step([0, 0]);
  assert.ok(ch.grounded, 'grounded');
  assert.ok(Math.abs(ch.pos[1]) < 0.01, 'feet on the floor, y = ' + ch.pos[1]);
});

test('no tunneling through a zero-thickness wall at 15 m/s with the fixed 30 Hz step', () => {
  const w = makeWorld({ wallX: 2 });
  const ch = new CharacterController(w, { spawn: [0, 0, 0], walkSpeed: 15 });
  for (let i = 0; i < 120; i++) ch.step([1, 0]);
  assert.ok(ch.pos[0] <= 2 - R + 1e-3, 'stays on the near side, x = ' + ch.pos[0]);
  assert.ok(ch.pos[0] > 2 - R - 0.05, 'pressed against the wall, x = ' + ch.pos[0]);
});

test('no tunneling even when one move covers 20 m (frame hitch)', () => {
  const w = makeWorld({ wallX: 2 });
  const r = moveCapsule(w, [0, 0.001, 0], [20, 0, 0], { radius: R, height: H });
  assert.ok(r.pos[0] <= 2 - R + 1e-3, 'x = ' + r.pos[0]);
  assert.ok(r.hitWall);
  assert.ok(r.substeps >= Math.ceil(20 / (R * 0.5)), 'substeps never longer than half the radius');
});

test('the same walk at 10 FPS and at 144 FPS ends at the same place (frame-rate independent)', () => {
  const run = (fps) => {
    const w = makeWorld({ wallX: 6 });
    const ch = new CharacterController(w, { spawn: [0, 0, 0], walkSpeed: 4 });
    let acc = 0;
    for (let t = 0; t < 3; t += 1 / fps) {
      const f = fixedSteps(acc, 1 / fps);
      acc = f.accumulator;
      for (let i = 0; i < f.steps; i++) ch.step([1, 0.5]);
    }
    return ch.pos;
  };
  const slow = run(10), fast = run(144);
  assert.ok(slow[0] <= 6 - R + 1e-3 && fast[0] <= 6 - R + 1e-3, 'neither crosses the wall');
  assert.ok(Math.abs(slow[0] - fast[0]) < 0.05, 'x: ' + slow[0] + ' vs ' + fast[0]);
});

test('collide-and-slide keeps the tangential part of the motion along a wall', () => {
  const w = makeWorld({ wallX: 1 });
  const ch = new CharacterController(w, { spawn: [0, 0, 0], walkSpeed: 3 });
  for (let i = 0; i < 30; i++) ch.step([Math.SQRT1_2, Math.SQRT1_2]);
  assert.ok(ch.pos[2] > 1.5, 'slid along z, z = ' + ch.pos[2]);
  assert.ok(ch.pos[0] <= 1 - R + 1e-3);
});

test('a box obstacle blocks the capsule, and a camera-only collider does not', () => {
  const w = makeWorld();
  w.addBox('crate', [1, 0, -1], [2, 1, 1]);
  const ch = new CharacterController(w, { spawn: [0, 0, 0], walkSpeed: 5 });
  for (let i = 0; i < 60; i++) ch.step([1, 0]);
  assert.ok(ch.pos[0] <= 1 - R + 1e-3, 'blocked by the crate, x = ' + ch.pos[0]);

  const w2 = makeWorld({ wallX: 2, mask: MASK_CAMERA });
  const ch2 = new CharacterController(w2, { spawn: [0, 0, 0], walkSpeed: 5 });
  for (let i = 0; i < 30; i++) ch2.step([1, 0]);
  assert.ok(ch2.pos[0] > 3, 'camera-only wall ignored by the player');
});

test('walks up a gentle ramp onto a platform', () => {
  const w = makeWorld();
  // 0.5 m rise over 3 m (about 9.5 degrees), then a 0.5 m high platform.
  w.addTriangles('ramp', [1, 0, -2, 4, 0.5, 2, 4, 0.5, -2, 1, 0, -2, 1, 0, 2, 4, 0.5, 2]);
  w.addBox('platform', [4, 0, -2], [8, 0.5, 2]);
  const ch = new CharacterController(w, { spawn: [0, 0, 0], walkSpeed: 3 });
  for (let i = 0; i < 70; i++) ch.step([1, 0]);
  assert.ok(ch.pos[0] > 5 && Math.abs(ch.pos[1] - 0.5) < 0.02, 'on the platform: ' + ch.pos.map((v) => v.toFixed(3)));
});

test('removeOwner drops colliders (greybox swapped for the asset _col)', () => {
  const w = makeWorld({ wallX: 2 });
  assert.equal(w.removeOwner('wall'), 2);
  const r = moveCapsule(w, [0, 0.001, 0], [5, 0, 0]);
  assert.ok(r.pos[0] > 4.9);
  assert.equal(w.hasOwner('wall'), false);
});

test('camera sphere sweep stops before a wall and returns 1 when the way is clear', () => {
  const w = makeWorld({ wallX: 5, mask: MASK_CAMERA });
  const f = sweepSphere(w, [0, 1.5, 0], [10, 1.5, 0], 0.3);
  assert.ok(Math.abs(f * 10 - 4.7) < 0.01, 'stops 0.3 m before the wall: ' + f * 10);
  assert.equal(sweepSphere(w, [0, 1.5, 0], [0, 1.5, 10], 0.3), 1);
  assert.equal(sweepSphere(w, [4.9, 1.5, 0], [0, 1.5, 0], 0.3), 0, 'starting inside the radius');
});

test('camera sweep catches a thin wall diagonal to the ray', () => {
  const w = new CollisionWorld();
  w.addTriangles('diag', [3, 0, -3, 3, 5, -3, -3, 5, 3, 3, 0, -3, -3, 5, 3, -3, 0, 3], MASK_CAMERA);
  const f = sweepSphere(w, [-2, 1, -2], [4, 1, 4], 0.25);
  assert.ok(f > 0 && f < 0.5, 'stops before the plane x + z = 0: ' + f);
});

test('ray cast hits the floor for click-to-move and ignores masked-out triangles', () => {
  const w = makeWorld({ wallX: 3, mask: MASK_CAMERA });
  const hit = rayCast(w, [5, 10, 0], [0, -1, 0], 50, MASK_PLAYER);
  assert.ok(hit && Math.abs(hit.point[1]) < 1e-9 && hit.normal[1] > 0.99);
  assert.equal(rayCast(w, [0, 1, 0], [0, 1, 0], 5, MASK_PLAYER), null);
});

test('fixed step accumulator: 3 steps per frame at 10 FPS, clamped after a long stall', () => {
  let acc = 0, total = 0;
  for (let i = 0; i < 10; i++) { const f = fixedSteps(acc, 0.1); acc = f.accumulator; total += f.steps; }
  assert.equal(total, 30);
  const stall = fixedSteps(0, 5);
  assert.equal(stall.steps, 8);
  assert.ok(stall.alpha >= 0 && stall.alpha <= 1);
});

test('transformTriangles applies a three.js-style column-major matrix', () => {
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 2, -3, 1];
  assert.deepEqual(transformTriangles([1, 1, 1], m), [11, 3, -2]);
  assert.equal(boxTriangles([0, 0, 0], [1, 1, 1]).length, 12 * 9);
});

test('steerTo slows down near the target and reports arrival', () => {
  assert.equal(steerTo([0, 0, 0], [0.1, 0, 0]), null);
  const far = steerTo([0, 0, 0], [10, 0, 0]);
  assert.deepEqual(far, [1, 0]);
  const near = steerTo([0, 0, 0], [0.3, 0, 0]);
  assert.ok(near[0] > 0 && near[0] < 1);
  assert.ok(PHYSICS_DT > 0.033 && PHYSICS_DT < 0.034);
});
