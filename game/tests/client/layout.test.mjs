// World layout against the brief and the owner's archipelago concept (src/scenes/layout.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPS, ANCHOR_ZONES, CAMP_RING_RADIUS, PLAZA_RADIUS, PLATEAU_RADIUS, CAMP_PLOT_SIZE, BRIDGE_WIDTH, WALK_SPEED, SPAWN, BALCONY_CENTER,
  groundDistance, bridges, platforms, parapetOpenings, shellHover, SHELL_HOVER,
} from '../../src/scenes/layout.js';
import { CollisionWorld, boxTriangles, MASK_ALL } from '../../src/physics/collision.js';
import { CharacterController } from '../../src/physics/character.js';

const center = [0, 0, 0];

test('six camp plateaus evenly on one ring, Iris among them, plots fit the plateaus', () => {
  assert.equal(CAMPS.length, 6);
  assert.deepEqual(CAMPS.map((c) => c.id).sort(), ['iney', 'iris', 'moh', 'pepel', 'sol', 'yantar']);
  for (const c of CAMPS) assert.ok(Math.abs(groundDistance(c.position, center) - CAMP_RING_RADIUS) < 1e-9);
  const angles = CAMPS.map((c) => c.angle).sort((a, b) => a - b);
  for (let i = 0; i < 6; i++) assert.equal((angles[(i + 1) % 6] - angles[i] + 360) % 360, 60);
  assert.ok((CAMP_PLOT_SIZE / 2) * Math.SQRT2 < PLATEAU_RADIUS + 0.1, '8 x 8 plot inside the plateau');
});

test('walk times match the spec (30-45 s between points)', () => {
  const viaPlaza = (2 * CAMP_RING_RADIUS) / WALK_SPEED;
  assert.ok(viaPlaza >= 30 && viaPlaza <= 45, 'camp -> neighbor camp via the plaza: ' + viaPlaza.toFixed(1) + ' s');
  const balcony = groundDistance(BALCONY_CENTER, center) / WALK_SPEED;
  assert.ok(balcony >= 20 && balcony <= 45, 'balcony -> plaza center: ' + balcony.toFixed(1) + ' s');
});

test('four anchor zones on the plaza diagonals, each with its Shell levitating beyond the camps', () => {
  assert.equal(ANCHOR_ZONES.length, 4);
  const heights = new Set();
  for (const z of ANCHOR_ZONES) {
    assert.ok(groundDistance(z.position, center) < PLAZA_RADIUS - 1, 'zone on the plaza');
    assert.ok(Math.abs(Math.abs(z.position[0]) - Math.abs(z.position[2])) < 1e-9, 'on a diagonal');
    assert.ok(groundDistance(z.shellPosition, center) > CAMP_RING_RADIUS + PLATEAU_RADIUS + 8, 'Shell outside the archipelago');
    assert.ok(z.shellPosition[1] > 10, 'no ground contact');
    heights.add(z.shellPosition[1]);
  }
  assert.equal(heights.size, 4, 'different heights');
  assert.deepEqual(ANCHOR_ZONES.map((z) => z.shellAsset), ['shell_1', 'shell_2', 'shell_3', 'shell_4']);
});

test('assets face the plaza: local +Z rotated by rotationY points to the center', () => {
  for (const [p, ry] of [...CAMPS.map((c) => [c.position, c.rotationY]), ...ANCHOR_ZONES.map((z) => [z.shellPosition, z.shellRotationY])]) {
    const fwd = [Math.sin(ry), Math.cos(ry)];
    const toC = [-p[0], -p[2]]; const l = Math.hypot(...toC);
    assert.ok(fwd[0] * toC[0] / l + fwd[1] * toC[1] / l > 0.999);
  }
});

test('every camp has a bridge to the plaza; bridges do not cross other plateaus; parapets open for them', () => {
  const brs = bridges();
  for (const c of CAMPS) assert.ok(brs.some((b) => b.id === 'bridge_' + c.id));
  assert.ok(brs.some((b) => b.id === 'bridge_balcony'));
  for (const b of brs) {
    for (const p of platforms()) {
      const touches = [b.from, b.to].some((e) => groundDistance(e, p.center) <= p.radius);
      if (touches) continue;
      // Distance from the platform center to the bridge centerline segment.
      const [ax, , az] = b.from, [cx, , cz] = b.to, dx = cx - ax, dz = cz - az;
      const t = Math.max(0, Math.min(1, ((p.center[0] - ax) * dx + (p.center[2] - az) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(ax + dx * t - p.center[0], az + dz * t - p.center[2]);
      assert.ok(d > p.radius + BRIDGE_WIDTH / 2, b.id + ' passes ' + p.id + ' at ' + d.toFixed(2));
    }
  }
  assert.equal(parapetOpenings('plaza').length, 7, '6 camps + balcony');
  for (const c of CAMPS) assert.ok(parapetOpenings('plateau_' + c.id).length >= 1);
  assert.equal(parapetOpenings('balcony').length, 1);
  assert.ok(groundDistance(SPAWN, BALCONY_CENTER) < 5, 'player starts on the balcony');
});

test('falling off the edge respawns at the last safe point', () => {
  const w = new CollisionWorld();
  w.addTriangles('ledge', boxTriangles([-3, -0.5, -3], [3, 0, 3]), MASK_ALL);
  const ch = new CharacterController(w, { spawn: [0, 0, 0], walkSpeed: 3, killY: -6 });
  for (let i = 0; i < 20; i++) ch.step([1, 0]);
  const safe = ch.lastSafe.slice();
  assert.ok(safe[0] > 1, 'safe point follows the player');
  for (let i = 0; i < 200 && ch.respawns === 0; i++) ch.step([1, 0]);
  assert.equal(ch.respawns, 1);
  assert.ok(ch.pos[0] <= 3 && Math.abs(ch.pos[1]) < 0.01, 'back on the ledge: ' + ch.pos.map((v) => v.toFixed(2)));
});

test('Shell hover stays inside the collision margin (visual only)', () => {
  let maxDy = 0, maxYaw = 0;
  for (let t = 0; t < 300; t += 0.05) for (let i = 0; i < 4; i++) { const h = shellHover(t, i); maxDy = Math.max(maxDy, Math.abs(h.dy)); maxYaw = Math.max(maxYaw, Math.abs(h.yaw)); }
  assert.ok(maxDy <= SHELL_HOVER.bob + 1e-12 && maxDy > SHELL_HOVER.bob * 0.9);
  assert.ok(maxDy <= 0.25 && maxYaw * 6 <= 0.25, 'each part inside the greybox collider margin');
  assert.ok(maxDy + maxYaw * 6 < 0.35, 'surface offset at a 6 m radius stays under the camera radius');
});
