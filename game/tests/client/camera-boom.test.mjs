// The camera boom against the collision world (src/render/camera-boom.js): it stops in front of a house's drawn
// shell, which only the camera collides with, and the look-ahead never carries the look-at point into a wall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollisionWorld, boxTriangles, rayCast, MASK_ALL, MASK_PLAYER, MASK_CAMERA } from '../../src/physics/collision.js';
import { boomDistance, clearFraction, isShellMesh, isShellMaterial, BOOM_SKIN } from '../../src/render/camera-boom.js';

const R = 0.35;
const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];

/**
 * A street house as the town files have it: the file's collider is a box around the ground floor (x 2..8), the
 * drawn upper floor leans 0.7 m over the street from 3 m up (its face at x = 1.3), with a roof slope above.
 */
function house({ shell = true } = {}) {
  const w = new CollisionWorld();
  w.addTriangles('floor', quad([-50, 0, -50], [-50, 0, 50], [50, 0, 50], [50, 0, -50]));
  w.addTriangles('house:col', boxTriangles([2, 0, -5], [8, 3, 5]), MASK_ALL);
  if (shell) {
    w.addTriangles('house:camera-shell', [
      ...quad([1.3, 3, -5], [1.3, 8, -5], [1.3, 8, 5], [1.3, 3, 5]),     // the overhanging floor's street face
      ...quad([1.3, 3, -5], [1.3, 3, 5], [2, 3, 5], [2, 3, -5]),         // its underside
      ...quad([0.8, 7.5, -5], [0.8, 7.5, 5], [5, 11, 5], [5, 11, -5]),   // the roof slope with its eave
    ], MASK_CAMERA);
  }
  return w;
}

const DEG = Math.PI / 180;
const boomDir = (pitchDeg) => [Math.cos(pitchDeg * DEG), Math.sin(pitchDeg * DEG), 0]; // toward the house (+x), rising

test('an open boom keeps its full length', () => {
  const b = boomDistance(house(), [-20, 1.5, 0], [-1, 0, 0], 12, R);
  assert.equal(b.fraction, 1);
  assert.ok(Math.abs(b.safe - (12 - BOOM_SKIN)) < 1e-9);
});

test('the boom stops in front of the ground-floor wall', () => {
  const b = boomDistance(house(), [0, 1.5, 0], [1, 0, 0], 10, R);
  assert.ok(b.fraction < 1);
  const x = b.safe;
  assert.ok(x <= 2 - R && x > 2 - R - 0.1, `camera at x=${x}, the wall is at 2`);
});

test('without the drawn shell the boom rises into the overhanging floor; with it the camera stays outside', () => {
  const center = [0.6, 1.5, 0], dir = boomDir(60), dist = 8;
  const before = boomDistance(house({ shell: false }), center, dir, dist, R);
  const camBefore = center.map((v, k) => v + dir[k] * before.safe);
  assert.ok(camBefore[0] > 1.3 && camBefore[1] > 3, 'the old colliders let the camera past the upper floor\'s face: ' + camBefore);
  const after = boomDistance(house(), center, dir, dist, R);
  const cam = center.map((v, k) => v + dir[k] * after.safe);
  assert.ok(after.safe < before.safe);
  assert.ok(cam[0] <= 1.3 - R + 1e-6 || cam[1] <= 3 - R + 1e-6, 'the camera sphere stays clear of the upper floor: ' + cam);
});

test('the roof stops a high boom', () => {
  const center = [-1, 1.5, 0], dir = boomDir(62), dist = 30;
  assert.equal(boomDistance(house({ shell: false }), center, dir, dist, R).fraction, 1, 'nothing above the box collider before');
  const b = boomDistance(house(), center, dir, dist, R);
  const cam = center.map((v, k) => v + dir[k] * b.safe);
  assert.ok(b.fraction < 1 && cam[1] < 11, 'stopped under or in front of the roof: ' + cam);
});

test('the drawn shell is camera-only: the player and ground rays pass it', () => {
  const w = house();
  assert.equal(rayCast(w, [0, 5, 0], [1, 0, 0], 1.9, MASK_PLAYER), null, 'no player collider at the upper floor\'s face');
  assert.ok(rayCast(w, [0, 5, 0], [1, 0, 0], 1.9, MASK_CAMERA));
  const down = rayCast(w, [1.6, 20, 0], [0, -1, 0], 40, MASK_PLAYER);
  assert.ok(down && Math.abs(down.point[1]) < 1e-6, 'a ground probe under the overhang still finds the street');
});

test('inspect mode starts the sweep outside the inspected object', () => {
  const b = boomDistance(house(), [5, 1.5, 0], [-1, 0, 0], 12, R, 4);   // centre inside the house, start past its wall
  assert.equal(b.fraction, 1);
  assert.ok(Math.abs(b.safe - (12 - BOOM_SKIN)) < 1e-9);
});

test('the look-ahead stops at a wall and is free in the open', () => {
  const w = house();
  assert.equal(clearFraction(w, [0, 1.5, 0], [-1, 0, 0], R), 1);
  assert.equal(clearFraction(w, [0, 1.5, 0], [0, 0, 0], R), 1);
  const k = clearFraction(w, [1.2, 1.5, 0], [1, 0, 0], R);               // walking into the wall at x = 2
  assert.ok(k < 0.5 && k >= 0, 'k=' + k);
  assert.ok(1.2 + k * 1 <= 2 - R + 1e-6, 'the look-at point stays a camera radius off the wall');
});

test('which town meshes and materials make the shell', () => {
  for (const n of ['town_block_mid_plaster', 'town_block_gate_roof', 'town_temple_roof']) assert.ok(isShellMesh(n), n);
  for (const n of ['town_block_mid_col', 'town_block_mid_timber', 'town_block_mid_ground', 'town_block_mid_cloth', 'swing_sign_cup_timber', 'town_terrain_cobble', '', undefined]) assert.ok(!isShellMesh(n), String(n));
  for (const n of ['M_Town_Plaster', 'M_Town_Roof', 'M_Town_Stone', 'M_Town_Timber']) assert.ok(isShellMaterial(n), n);
  for (const n of ['M_Town_Glass', 'M_Town_GlassLit', 'M_Town_Ground', 'M_Town_Water', 'M_Town_Lamp', 'M_Altar_Core', '', null]) assert.ok(!isShellMaterial(n), String(n));
});

test('the sweep\'s cheap reject never changes the result (random walls and booms against a brute-force sweep)', async () => {
  const { sweepSphere, closestSegmentTriangle, closestPointTriangle } = await import('../../src/physics/collision.js');
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const w = new CollisionWorld(), tris = [];
  for (let i = 0; i < 400; i++) {
    const c = [rnd() * 40 - 20, rnd() * 12, rnd() * 40 - 20], s = 0.3 + rnd() * 4;
    const t = [0, 1, 2].flatMap(() => [c[0] + (rnd() - 0.5) * s, c[1] + (rnd() - 0.5) * s, c[2] + (rnd() - 0.5) * s]);
    tris.push(t); w.addTriangles('t' + i, t, MASK_CAMERA);
  }
  const brute = (from, to, r) => {
    const dir = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]; let best = 1;
    const at = (f) => [from[0] + dir[0] * f, from[1] + dir[1] * f, from[2] + dir[2] * f];
    for (const t of tris) {
      const a = t.slice(0, 3), b = t.slice(3, 6), c = t.slice(6, 9);
      if (closestSegmentTriangle(from, at(best), a, b, c).d2 >= r * r) continue;
      const p = closestPointTriangle(from, a, b, c);
      if ((p[0] - from[0]) ** 2 + (p[1] - from[1]) ** 2 + (p[2] - from[2]) ** 2 < r * r) return 0;
      let lo = 0, hi = best;
      for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (closestSegmentTriangle(from, at(mid), a, b, c).d2 < r * r) hi = mid; else lo = mid; }
      best = lo;
    }
    return best;
  };
  for (let i = 0; i < 300; i++) {
    const from = [rnd() * 40 - 20, rnd() * 4, rnd() * 40 - 20];
    const len = 2 + rnd() * 30, yaw = rnd() * Math.PI * 2, pitch = rnd() * 1.2;
    const to = [from[0] + Math.sin(yaw) * Math.cos(pitch) * len, from[1] + Math.sin(pitch) * len, from[2] + Math.cos(yaw) * Math.cos(pitch) * len];
    const got = sweepSphere(w, from, to, R, MASK_CAMERA), want = brute(from, to, R);
    // The bisection's last bits depend on the order triangles are visited (cells vs insertion), not on the reject.
    assert.ok(Math.abs(got - want) < 1e-4, `sweep ${i}: ${got} vs ${want}`);
  }
});
