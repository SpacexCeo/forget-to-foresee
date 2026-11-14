// The owner's Tripo crystals in the Glass Shoal arena (render/shoal-props.js): four models, each with a phone variant,
// inside the triangle budget, swapped in for the placeholder monoliths and spires when the arena look opens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const glb = (f) => { const b = readFileSync(new URL('../../public/assets/models/' + f, import.meta.url)); return { b, json: JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) }; };
const tris = (j) => j.meshes.flatMap((m) => m.primitives).reduce((s, p) => s + j.accessors[p.indices].count / 3, 0);

test('shoal props: four crystal models and their phone files, light enough for twelve placements', () => {
  let total = 0;
  for (const n of ['shoal_crystal_monolith', 'shoal_crystal_spire_a', 'shoal_crystal_spire_b', 'shoal_crystal_spike']) {
    const full = glb(n + '.glb'), m = glb(n + '_m.glb');
    assert.ok(tris(full.json) <= 8000, n + ' has ' + tris(full.json) + ' triangles');
    assert.ok(tris(m.json) <= tris(full.json), n + '_m is no heavier');
    assert.ok(full.b.length <= 1e6 && m.b.length <= 0.5e6, n + ' sizes ' + full.b.length + ' / ' + m.b.length);
    total += tris(full.json) * 3; // up to three placements each
  }
  assert.ok(total <= 90000, 'all placements together: ' + total + ' triangles');
});

test('shoal props: the arena look dresses the placeholders; monoliths get the monolith, the horizon spires take turns', () => {
  const src = readFileSync(new URL('../../src/render/shoal-props.js', import.meta.url), 'utf8');
  assert.match(src, /monolith: 'shoal_crystal_monolith'/);
  assert.match(src, /spires: Object\.freeze\(\['shoal_crystal_spire_a', 'shoal_crystal_spike', 'shoal_crystal_spire_b'\]\)/);
  assert.match(src, /ph\.visible = false/, 'the placeholder is hidden, not removed');
  const look = readFileSync(new URL('../../src/render/shoal-arena-look.js', import.meta.url), 'utf8');
  assert.match(look, /import \{ dressShoalProps \} from '\.\/shoal-props\.js'/); assert.match(look, /dressShoalProps\(arena\)/);
});

test('no template shapes left where a model exists: the lamp becomes the bridge torch, the pickups a vial and a shard, and they still bob and vanish (owner 14.11)', async () => {
  const THREE = await import('three');
  const { dressInPlace, DRESS_HEIGHT } = await import('../../src/render/shoal-dress.js');
  const src = (await import('node:fs')).readFileSync(new URL('../../src/render/shoal-props.js', import.meta.url), 'utf8');
  assert.match(src, /lamp: 'prop_bridge_torch'/); assert.match(src, /pickups: Object.freeze({ hp: 'prop_memory_vial', stamina: 'shard' })/);
  assert.match(src, /n += await dressInPlace(A, get, SHOAL_PROPS)/);
  const SHOAL_PROPS = { lamp: 'prop_bridge_torch', pickups: { hp: 'prop_memory_vial', stamina: 'shard' } };
  const root = new THREE.Group();
  const lamp = new THREE.Group(); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4), new THREE.MeshBasicMaterial()); post.name = 'lamp_post_placeholder'; const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshBasicMaterial()); bulb.name = 'lamp_bulb_placeholder'; lamp.add(post, bulb); root.add(lamp);
  const orb = (c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.45), new THREE.MeshBasicMaterial({ color: c })); m.position.set(3, 1, 4); root.add(m); return m; };
  const hp = orb(0x6aff9a), st = orb(0xffe066);
  // a model 2 units tall standing from y = -1 (its own origin off the base): the dresser scales and seats it by its bounds
  const model = () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, 0.5), new THREE.MeshStandardMaterial()); g.add(b); return g; };
  const A = { lamp, pickups: [{ id: 'a', kind: 'hp', m: hp }, { id: 'b', kind: 'stamina', m: st }] };
  const n = await dressInPlace(A, async () => model(), SHOAL_PROPS);
  assert.equal(n, 3);
  assert.equal(post.visible, false); assert.equal(bulb.visible, false);
  const torch = lamp.children.find((c) => !/placeholder/.test(c.name || ''));
  const tb = new THREE.Box3().setFromObject(torch); assert.ok(Math.abs(tb.max.y - tb.min.y - DRESS_HEIGHT.lamp) < 1e-6 && Math.abs(tb.min.y) < 1e-6, 'the torch stands on the ground at its height');
  for (const [m, k] of [[hp, 'hp'], [st, 'stamina']]) {
    assert.equal(m.material.visible, false, 'the sphere itself no longer draws');
    assert.equal(m.children.length, 1, 'the model rides inside it');
    root.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(m.children[0]);
    assert.ok(Math.abs(b.max.y - b.min.y - DRESS_HEIGHT[k]) < 1e-6);
    m.visible = false; assert.equal(m.children[0].visible && m.visible, false, 'taken: it vanishes with its placeholder');
  }
  assert.notEqual(hp.material, st.material);
});
