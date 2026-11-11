// Outside the town walls (docs/town.md, "Outside the walls"): the gate passage carve, the field bounds and the
// kill height of the hillside. Pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GATE_PASSAGE, GATE_FLOOR, OUTSIDE_KILL_Y, beyondWalls, onField, carveBox, filterTriangles } from '../../src/scenes/town-outside.js';
import { TOWN_DATA } from '../../src/scenes/town-data.js';
import { TOWN_KILL_Y, TOWN_ORIGIN, TOWN_SPAWN, TOWN_ALTAR } from '../../src/scenes/town-layout.js';
import { CAST_KEYS } from '../../src/scenes/town-casting.js';
import { CASTS } from '../../src/scenes/town-casting-fx.js';

const area = (f) => {
  let s = 0;
  for (let i = 0; i < f.length; i += 9) {
    const ax = f[i + 3] - f[i], ay = f[i + 4] - f[i + 1], az = f[i + 5] - f[i + 2];
    const bx = f[i + 6] - f[i], by = f[i + 7] - f[i + 1], bz = f[i + 8] - f[i + 2];
    s += 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  }
  return s;
};
// A vertical quad at z across x0..x1, y0..y1, as two triangles.
const wall = (x0, x1, y0, y1, z) => [x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z];
const inBox = (x, y, z, min, max) => x > min[0] + 1e-6 && x < max[0] - 1e-6 && y > min[1] + 1e-6 && y < max[1] - 1e-6 && z > min[2] + 1e-6 && z < max[2] - 1e-6;

test('carving the passage keeps the wall on both sides and the lintel, and removes the doorway', () => {
  const { min, max } = GATE_PASSAGE;
  const plane = wall(-52, 52, -1, 12.5, 34); // the wall-line plane the gate file carries across the passage
  const cut = carveBox(plane, min, max);
  const hole = (max[0] - min[0]) * (max[1] - Math.max(min[1], -1)); // the plane starts 1 m under the street
  assert.ok(Math.abs(area(cut) - (area(plane) - hole)) < 1e-6, 'exactly the doorway is removed');
  for (let i = 0; i < cut.length; i += 9) {
    const cx = (cut[i] + cut[i + 3] + cut[i + 6]) / 3, cy = (cut[i + 1] + cut[i + 4] + cut[i + 7]) / 3, cz = (cut[i + 2] + cut[i + 5] + cut[i + 8]) / 3;
    assert.ok(!inBox(cx, cy, cz, min, max), 'no piece left inside the passage');
  }
  // the slab between the gate leaves loses its doorway part down to its foot; only the lintel remains
  const slab = wall(-2.4, 2.4, -1.2, 6.5, 35);
  assert.ok(Math.abs(area(carveBox(slab, min, max)) - 4.8 * (6.5 - max[1])) < 1e-6);
  // the gatehouse side faces (x = ±2.4, along z) are on the boundary and stay whole
  const side = [-2.4, 0, 32.8, -2.4, 10.6, 32.8, -2.4, 10.6, 38.2];
  assert.deepEqual(carveBox(side, min, max), side);
  // the street floor is walkable and stays whole even inside the box
  const floor = [-5, 0, 30, 0, 0, 38, 5, 0, 30];
  assert.deepEqual(carveBox(floor, min, max), floor);
});

test('the field is beyond the walls; the street, the spawn and the altar are not', () => {
  const local = (p) => [p[0] - TOWN_ORIGIN[0], p[2] - TOWN_ORIGIN[2]];
  for (const p of [TOWN_SPAWN.position, TOWN_ALTAR.position, TOWN_ALTAR.stand]) {
    const [x, z] = local(p);
    assert.equal(onField(x, z), false); assert.equal(beyondWalls(x, z), false);
  }
  assert.ok(onField(0, 45) && beyondWalls(0, 45), 'the road below the gate');
  assert.ok(beyondWalls(0, 36) && !onField(0, 36), 'the gatehouse passage itself is beyond the wall line but no casting field');
  const tris = [0, 0, 40, 1, 0, 40, 0, 0, 41, 0, 0, 0, 1, 0, 0, 0, 0, 1].map((v, i) => v + TOWN_ORIGIN[i % 3]);
  assert.equal(filterTriangles(tris, TOWN_ORIGIN, beyondWalls).length, 9, 'only the triangle outside becomes ground');
});

test('the passage has a floor at street level that spans the gap to the road', () => {
  assert.equal(GATE_FLOOR.max[1], 0);
  assert.ok(GATE_FLOOR.min[2] < 34 && GATE_FLOOR.max[2] > 35.6, 'from the street plane (ends z 34) to the road (starts z 35.6)');
  assert.ok(GATE_FLOOR.min[0] <= GATE_PASSAGE.min[0] && GATE_FLOOR.max[0] >= GATE_PASSAGE.max[0]);
});

test('the hillside below the gate does not respawn Iris, the void below it does', () => {
  assert.ok(OUTSIDE_KILL_Y < TOWN_DATA.killY);
  assert.equal(TOWN_KILL_Y, TOWN_ORIGIN[1] + OUTSIDE_KILL_Y);
  assert.ok(TOWN_KILL_Y > TOWN_ORIGIN[1] - 200, 'still far above the archipelago');
});

test('cast keys and tuning', () => {
  assert.deepEqual(new Set(Object.values(CAST_KEYS)), new Set(Object.keys(CASTS)));
  assert.ok(!('KeyE' in CAST_KEYS) && !('KeyR' in CAST_KEYS), 'E stays the altar, R the camera reset');
  for (const c of Object.values(CASTS)) assert.ok(c.range > 0 && c.cooldown > 0 && c.minRange < c.range);
});

test('Return to town mounts the casting field again (leaveTown disposes it), and the slots are full-art skill buttons', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  const back = src.slice(src.indexOf('function returnToTown('), src.indexOf('function startOver('));
  assert.match(back, /mountCasting\(\)/, 'returnToTown remounts the two casts');
  assert.match(src.slice(src.indexOf('async function leaveTown('), src.indexOf('function startSeason(')), /townCasting\.dispose\(\)/);
  const cast = readFileSync(new URL('../../src/scenes/town-casting.js', import.meta.url), 'utf8');
  assert.match(cast, /lance: '<svg/); assert.match(cast, /snare: '<svg/);
  assert.deepEqual(Object.values(CAST_KEYS).sort(), ['lance', 'lance', 'snare', 'snare']);
});
