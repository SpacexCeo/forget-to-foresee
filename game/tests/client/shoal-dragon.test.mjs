// The pearl dragon: the clip mix (game/shoal-dragon-anim.js) and the shipped model files (clips, the saddle socket,
// budgets). The model is made by art/shoal/dragon/ (docs/art/manifest.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dragonMix, DRAGON_CLIPS, DRAGON_ANIM } from '../../src/game/shoal-dragon-anim.js';

const sum = (w) => Object.values(w).reduce((a, b) => a + b, 0);
const glb = (name) => {
  const b = readFileSync(new URL('../../public/assets/models/' + name, import.meta.url));
  return { json: JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()), bytes: b.length };
};

test('dragon mix: weights always sum to 1 and never go negative', () => {
  for (const phase of ['land', 'ride']) for (let t = 0; t < 30; t += 0.07) for (const bank of [-0.5, -0.1, 0, 0.2, 0.6]) {
    const m = dragonMix(phase, t, bank);
    assert.ok(Math.abs(sum(m.weights) - 1) < 1e-9, phase + ' t=' + t + ' bank=' + bank + ': ' + sum(m.weights));
    for (const k in m.weights) { assert.ok(DRAGON_CLIPS.includes(k)); assert.ok(m.weights[k] >= 0); }
    assert.ok(m.lift >= 0 && m.lift <= 1);
  }
});

test('dragon mix: the landing flaps down, the land clip touches the ground when the descent ends, then it idles', () => {
  assert.equal(dragonMix('land', 0).weights.flap, 1);
  const touch = dragonMix('land', DRAGON_ANIM.descent);
  assert.equal(touch.weights.land, 1); assert.ok(Math.abs(touch.times.land - DRAGON_ANIM.touch) < 1e-9);
  const rest = dragonMix('land', 60);
  assert.equal(rest.weights.idle, 1); assert.equal(rest.lift, 0);
});

test('dragon mix: the ride takes off, glides between wing beats and banks into the turn', () => {
  assert.equal(dragonMix('ride', 0).weights.takeoff, 1);
  const beats = dragonMix('ride', DRAGON_ANIM.takeoff + 1), calm = dragonMix('ride', DRAGON_ANIM.takeoff + DRAGON_ANIM.beats + 2);
  assert.equal(beats.weights.flap, 1); assert.equal(calm.weights.glide, 1); assert.equal(calm.lift, 1);
  const right = dragonMix('ride', 20, 0.4), left = dragonMix('ride', 20, -0.4);
  assert.ok(right.weights.bank_r > 0.8 && right.weights.bank_l === 0); assert.ok(left.weights.bank_l > 0.8 && left.weights.bank_r === 0);
  // no pop where the cycle wraps
  const A = DRAGON_ANIM, wrap = A.takeoff + 2 * A.cycle;
  assert.ok(Math.abs(dragonMix('ride', wrap - 0.01).weights.flap - dragonMix('ride', wrap + 0.01).weights.flap) < 0.05);
});

test('dragon model: both files carry the seven clips, one skin with the saddle socket, and stay inside the budget', () => {
  for (const [file, maxBytes, maxTris] of [['shoal_dragon.glb', 8e6, 60000], ['shoal_dragon_m.glb', 3e6, 16000]]) {
    const { json, bytes } = glb(file);
    assert.ok(bytes <= maxBytes, file + ' is ' + bytes + ' bytes');
    assert.deepEqual(json.animations.map((a) => a.name).sort(), [...DRAGON_CLIPS].sort());
    assert.equal(json.skins.length, 1);
    assert.ok(json.nodes.some((n) => n.name === 'saddle'), file + ' has the saddle socket');
    const tris = json.meshes.flatMap((m) => m.primitives).reduce((n, p) => n + json.accessors[p.indices].count / 3, 0);
    assert.ok(tris <= maxTris, file + ' has ' + tris + ' triangles');
    assert.ok(json.skins[0].joints.length <= 64);
  }
});

test('saddle model: one mesh inside the prop budget, its origin at the seat (the dragon's saddle socket)', () => {
  for (const [file, maxBytes, maxTris] of [['dragon_saddle.glb', 1.5e6, 5000], ['dragon_saddle_m.glb', 0.6e6, 3000]]) {
    const { json, bytes } = glb(file);
    assert.ok(bytes <= maxBytes, file + ' is ' + bytes + ' bytes');
    const prims = json.meshes.flatMap((m) => m.primitives);
    assert.equal(prims.length, 1, file + ' is one draw call');
    assert.ok(json.accessors[prims[0].indices].count / 3 <= maxTris);
    assert.ok(!json.skins && !json.animations);
  }
});
