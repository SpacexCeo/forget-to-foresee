// Doors that lead inside glow (scenes/door-glow.js, owner 12.11): every interior entrance the walk-in code enters
// gets a highlight, no other door does, the glow sits on the door leaf facing the street and brightens in the enter
// radius; one shared shader, no post pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TOWN_SHOPS, shopDoorAt } from '../../src/scenes/town-layout.js';
import { TOWN_DATA } from '../../src/scenes/town-data.js';
import { doorGlowSpots, createDoorGlow, DOOR_GLOW } from '../../src/scenes/door-glow.js';

test('every interior entrance gets a highlight, and nothing else does', () => {
  const spots = doorGlowSpots();
  assert.ok(TOWN_SHOPS.length >= 3);
  assert.deepEqual(spots.map((s) => s.id).sort(), TOWN_SHOPS.map((s) => s.id).sort(), 'one glow per walk-in door');
  // every interior in the town data is reached through one of those doors
  for (const it of TOWN_DATA.interiors) assert.ok(TOWN_SHOPS.some((s) => s.piece === it.name), `${it.name} has a glowing door`);
  // each glow stands at a door the walk-in code really enters: Iris at the glow's door point is "at the door"
  for (const s of spots) assert.equal(shopDoorAt(s.door).id, s.id);
  // a shop list without interiors (no piece) lights nothing; an empty list lights nothing
  assert.equal(doorGlowSpots(TOWN_SHOPS.map((s) => ({ ...s, piece: null }))).length, 0);
  assert.equal(doorGlowSpots([]).length, 0);
});

test('the glow stands at the door leaf, in from the door point the way she walks in (the wall is ~1.0-1.2 m in)', () => {
  for (const s of doorGlowSpots()) {
    const along = (s.position[0] - s.door[0]) * Math.sin(s.heading) + (s.position[2] - s.door[2]) * Math.cos(s.heading);
    assert.ok(Math.abs(along - DOOR_GLOW.inset) < 1e-9 && DOOR_GLOW.inset > 0.8 && DOOR_GLOW.inset < 1.03, 'just proud of the wall above the door');
  }
});

test('brighter inside the enter radius, eases back; daylight lifts it; two instanced meshes, one additive shader each, no post', () => {
  const scene = new THREE.Scene();
  let day = 0;
  const g = createDoorGlow({ scene, daylight: () => day });
  assert.equal(g.group.children.length, 2);
  for (const c of g.group.children) { assert.ok(c.isInstancedMesh); assert.equal(c.count, TOWN_SHOPS.length); assert.equal(c.material.blending, THREE.AdditiveBlending); assert.equal(c.material.depthWrite, false); }
  const far = [0, 1203, 40];
  for (let i = 0; i < 60; i++) g.update(1 / 30, far);
  const base = g.levels; assert.ok(base.every((v) => Math.abs(v - DOOR_GLOW.base) < 1e-6), 'from afar every door glows at the base level');
  const s0 = g.spots[0];
  for (let i = 0; i < 60; i++) g.update(1 / 30, s0.door);
  assert.ok(g.levels[0] > DOOR_GLOW.near - 0.02, 'at its door, near full'); assert.ok(Math.abs(g.levels[1] - DOOR_GLOW.base) < 1e-6, 'the others stay');
  for (let i = 0; i < 60; i++) g.update(1 / 30, far);
  assert.ok(g.levels[0] < DOOR_GLOW.base + 0.02, 'eases back');
  day = 1; g.update(1 / 30, far); assert.ok(g.levels[1] > DOOR_GLOW.base + DOOR_GLOW.dayBoost - 1e-6, 'lifted by daylight');
  g.update(1 / 30, far, false); assert.equal(g.group.visible, false, 'hidden indoors');
  g.dispose(); assert.equal(scene.children.length, 0);
});
