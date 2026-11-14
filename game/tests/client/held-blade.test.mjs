// The Loomblade in Iris's hand (play/held-blade.js, play/grip-pose.js, art/agents/grip_rig.mjs): the shipped heroine
// carries the finger joints the grip pose names, the pose and the seat are sane, and the module holds the sword only
// on a model that has those joints. File and data checks: no three.js, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GRIP } from '../../src/play/grip-pose.js';
import { canHold, heldBladeFile, glowBand, BLADE_GLOW } from '../../src/play/held-blade.js';

const DIR = new URL('../../public/assets/models/', import.meta.url);
const gltf = (f) => { const b = readFileSync(new URL(f, DIR)); return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()); };

test('grip: both Iris files carry the finger joints, skinned, under the bones that were there', () => {
  for (const f of ['agent_iris.glb', 'agent_iris_m.glb']) {
    const j = gltf(f);
    const idx = (n) => j.nodes.findIndex((x) => x.name === n);
    const parent = (i) => j.nodes.findIndex((x) => (x.children || []).includes(i));
    const body = j.nodes.find((n) => n.name === 'body');
    const joints = new Set(j.skins[body.skin].joints);
    for (const n of GRIP.bones) { assert.ok(idx(n) >= 0, f + ' has ' + n); assert.ok(joints.has(idx(n)), f + ': ' + n + ' is a joint of the body skin'); }
    assert.equal(j.nodes[parent(idx('index_mid_R'))].name, 'index_R');
    assert.equal(j.nodes[parent(idx('index_tip_R'))].name, 'index_mid_R');
    for (const n of ['middle', 'ring', 'pinky']) assert.equal(j.nodes[parent(idx(n + '_mid_R'))].name, 'fingers_R', n);
    assert.equal(j.nodes[parent(idx('thumb_tip_R'))].name, 'thumb_R');
    // the face keeps its 23 targets: the grip is bones, not a morph (a 24th target would break the face tracks)
    for (const p of j.meshes[body.mesh].primitives) assert.equal(p.targets.length, 23, f);
  }
});

test('grip: the pose is unit quaternions for every finger bone, the seat is a rigid matrix', () => {
  assert.deepEqual(Object.keys(GRIP.pose).sort(), [...GRIP.bones, 'fingers_R', 'index_R', 'thumb_R'].sort());
  for (const [n, q] of Object.entries(GRIP.pose)) assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-4, n);
  const m = GRIP.sword_in_prop_R;
  assert.equal(m.length, 16);
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(Math.hypot(m[c * 4], m[c * 4 + 1], m[c * 4 + 2]) - 1) < 1e-3, 'column ' + c + ' is a unit axis');
  assert.deepEqual([m[3], m[7], m[11], m[15]], [0, 0, 0, 1]);
  assert.ok(Math.hypot(m[12], m[13], m[14]) < 0.12, 'the grip sits within the hand of the socket bone');
  assert.ok(GRIP.gap_mm > 0 && GRIP.gap_mm < 5, 'the closed hand is off the hilt by ' + GRIP.gap_mm + ' mm');
});

test('held blade: only a model with the finger joints holds it; phones take the light sword', () => {
  const all = new Set(['prop_R', ...Object.keys(GRIP.pose)]);
  assert.equal(canHold((n) => all.has(n)), true);
  assert.equal(canHold((n) => n !== 'index_tip_R' && all.has(n)), false, 'an older model file');
  assert.equal(canHold((n) => n !== 'prop_R' && all.has(n)), false);
  const both = (n) => n === 'loomblade' || n === 'loomblade_m';
  assert.equal(heldBladeFile(false, both), 'loomblade');
  assert.equal(heldBladeFile(true, both), 'loomblade_m');
  assert.equal(heldBladeFile(true, (n) => n === 'loomblade'), 'loomblade');
  assert.equal(heldBladeFile(false, () => false), null);
});

test('held blade glow: the pulse climbs the blade from the guard to the tip once a period', () => {
  const G = BLADE_GLOW;
  assert.ok(G.from > 0.15 && G.to < 0.96, 'on the blade, not the hilt');
  assert.ok(Math.abs(glowBand(G.from, 0) - 1) < 1e-9, 'starts at the guard');
  const mid = G.from + (G.to - G.from) / 2;
  assert.ok(Math.abs(glowBand(mid, G.period / 2) - 1) < 1e-9, 'halfway up at half the period');
  assert.ok(glowBand(G.to, G.period / 2) < 0.01, 'the rest of the blade is quiet');
  assert.ok(Math.abs(glowBand(mid, G.period * 1.5) - glowBand(mid, G.period / 2)) < 1e-9, 'loops');
});
