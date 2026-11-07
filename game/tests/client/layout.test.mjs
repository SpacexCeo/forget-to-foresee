// Island layout against the art brief (src/scenes/layout.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPS, ANCHOR_ZONES, CAMP_RING_RADIUS, ANCHOR_RING_RADIUS, ISLAND_RADIUS, CAMP_PLOT_SIZE, PLAZA_RADIUS, SPAWN, groundDistance, pathSegments } from '../../src/scenes/layout.js';

const center = [0, 0, 0];

test('six camps on a ring of ~13 m, evenly spaced, Iris first', () => {
  assert.equal(CAMPS.length, 6);
  assert.equal(CAMPS[0].id, 'iris');
  for (const c of CAMPS) assert.ok(Math.abs(groundDistance(c.position, center) - 13) < 1e-9);
  for (let i = 0; i < 6; i++) {
    const d = groundDistance(CAMPS[i].position, CAMPS[(i + 1) % 6].position);
    assert.ok(Math.abs(d - CAMP_RING_RADIUS) < 1e-9, 'chord of 60 degrees equals the radius');
  }
});

test('four anchor zones on the diagonals at ~25 m, inside the island', () => {
  assert.equal(ANCHOR_ZONES.length, 4);
  for (const z of ANCHOR_ZONES) {
    assert.ok(Math.abs(groundDistance(z.position, center) - ANCHOR_RING_RADIUS) < 1e-9);
    assert.ok(Math.abs(Math.abs(z.position[0]) - Math.abs(z.position[2])) < 1e-9, 'on a diagonal');
    assert.ok(ANCHOR_RING_RADIUS + 3.5 < ISLAND_RADIUS);
  }
  assert.deepEqual(ANCHOR_ZONES.map((z) => z.shellAsset), ['shell_1', 'shell_2', 'shell_3', 'shell_4']);
});

test('camp plots do not overlap the plaza or each other; spawn is on open ground', () => {
  const half = (CAMP_PLOT_SIZE / 2) * Math.SQRT2;
  for (const c of CAMPS) assert.ok(groundDistance(c.position, center) - half > PLAZA_RADIUS - 1.5);
  assert.ok(CAMP_RING_RADIUS >= CAMP_PLOT_SIZE, 'neighbors 13 m apart, plots 8 m wide');
  for (const c of CAMPS) assert.ok(groundDistance(SPAWN, c.position) > 3);
});

test('assets face the plaza: local +Z rotated by rotationY points to the center', () => {
  for (const item of [...CAMPS.map((c) => [c.position, c.rotationY]), ...ANCHOR_ZONES.map((z) => [z.anchorPosition, z.anchorRotationY])]) {
    const [p, ry] = item;
    const fwd = [Math.sin(ry), Math.cos(ry)];
    const toC = [-p[0], -p[2]]; const l = Math.hypot(...toC);
    assert.ok(fwd[0] * toC[0] / l + fwd[1] * toC[1] / l > 0.999);
  }
});

test('paths: one spoke per camp and per anchor zone', () => {
  assert.equal(pathSegments().length, 10);
});
