// The Hollow Tide's spawn: the clip choice (game/shoal-add-anim.js) against the fight rules' adds, and the shipped
// model files (clips and their lengths, the skin, budgets). The model is made by art/shoal/tideling/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ADD_CLIPS, ADD_ANIM, freshAddAnim, addAnimStep, addDeathStep, addFade } from '../../src/game/shoal-add-anim.js';
import * as R from '../../src/game/shoal-rules.js';

const MODEL = new URL('../../public/assets/models/shoal_tideling.glb', import.meta.url);

test('add anim: it rises out of the mirror, then scuttles at her, bites when the rules bite, waits between bites', () => {
  let adds = [{ id: 1, hp: R.BOSS.add.hp, x: 12, z: 0, cd: 1 }]; let a = freshAddAnim(); const seen = []; let bites = 0, damage = 0;
  const note = (c) => { if (seen[seen.length - 1] !== c) seen.push(c); };
  for (let i = 0; i < 60 * 8; i++) {
    const r = R.addsStep(adds, 1 / 60, [0, 0]); adds = r.adds; damage += r.damage;
    a = addAnimStep(a, adds[0], 1 / 60); note(a.clip);
    if (r.damage > 0) { bites++; assert.equal(a.clip, 'bite'); assert.equal(a.time, 0); }
    assert.ok(ADD_CLIPS.includes(a.clip)); assert.ok(a.time >= 0 && a.time <= ADD_ANIM.len[a.clip] + 1e-9);
  }
  assert.equal(seen[0], 'spawn'); assert.equal(seen[1], 'walk');
  assert.ok(bites >= 2 && damage > 0); assert.ok(seen.includes('bite') && seen.includes('idle'));
});

test('add anim: the walk clip covers the ground the rules move an add over', () => {
  assert.equal(ADD_ANIM.walkSpeed, R.BOSS.add.speed);
});

test('add anim: a killed add plays the death once and reports when it has sunk; weights stay normalised', () => {
  let a = addDeathStep({ clip: 'walk', time: 0.2 }, 0); assert.deepEqual([a.clip, a.time, a.done], ['death', 0, false]);
  for (let i = 0; i < 120; i++) a = addDeathStep(a, 1 / 60);
  assert.deepEqual([a.time, a.done], [ADD_ANIM.len.death, true]);
  const w = {}; addFade(w, 'spawn', 1); assert.equal(w.spawn, 1);
  for (let i = 0; i < 20; i++) { addFade(w, 'walk', 1 / 60); assert.ok(Math.abs(Object.values(w).reduce((x, y) => x + y, 0) - 1) < 1e-9); }
  assert.ok(w.walk > 0.9);
});

test('add model: both files carry the five clips with the lengths the game times them by, inside the budget', { skip: !existsSync(MODEL) && 'model not built yet' }, () => {
  for (const [file, maxBytes, maxTris] of [['shoal_tideling.glb', 2e6, 4000], ['shoal_tideling_m.glb', 0.8e6, 3000]]) {
    const b = readFileSync(new URL('../../public/assets/models/' + file, import.meta.url));
    const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
    assert.ok(b.length <= maxBytes, file + ' is ' + b.length + ' bytes');
    assert.deepEqual(json.animations.map((x) => x.name).sort(), [...ADD_CLIPS].sort());
    assert.equal(json.skins.length, 1); assert.ok(json.skins[0].joints.length <= 16);
    const tris = json.meshes.flatMap((m) => m.primitives).reduce((n, p) => n + json.accessors[p.indices].count / 3, 0);
    assert.ok(tris <= maxTris, file + ' has ' + tris + ' triangles');
    for (const an of json.animations) {
      const end = Math.max(...an.samplers.map((sm) => json.accessors[sm.input].max[0]));
      assert.ok(Math.abs(end - ADD_ANIM.len[an.name]) < 0.05, file + ' ' + an.name + ' is ' + end + ' s');
    }
    assert.ok(json.materials.some((m) => m.emissiveTexture), file + ' has the glowing core');
  }
});
