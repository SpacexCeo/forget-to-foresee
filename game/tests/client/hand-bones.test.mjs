// The heroines' hands across rigs (3D A, 14.11): the game's own rig (hand_R), the new Tripo Iris (R_Hand) and Elise
// (Mixamo; GLTFLoader drops the colon of mixamorig:RightHand). The cast start, the wind-up fx and the held blade all
// find the hand through play/hand-bones.js; a rig with no fitted grip holds no sword; the shipped hero clip files carry
// every clip the fight asks for, and the clips the new models lack (face, idle2, skid) are optional.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { findHandBone, rigOf, HAND_BONES } from '../../src/play/hand-bones.js';

const sanitize = (n) => String(n).replace(/\s/g, '_').replace(/[[\]./:]/g, ''); // three.js PropertyBinding.sanitizeNodeName
function glbNames(rel) {
  const b = readFileSync(new URL('../../public/' + rel, import.meta.url));
  const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  return { nodes: (j.nodes || []).map((n) => sanitize(n.name || '')), clips: (j.animations || []).map((a) => a.name) };
}
function fakeRoot(names) {
  const bones = names.map((name) => ({ name, isBone: true }));
  return { getObjectByName: (n) => bones.find((b) => b.name === n) || null, traverse: (f) => bones.forEach(f) };
}

test('hands: every rig the heroines wear finds its right and left hand', () => {
  assert.equal(findHandBone(fakeRoot(['spine', 'hand_R', 'hand_L']), 'R').name, 'hand_R');
  assert.equal(findHandBone(fakeRoot(['R_Hand', 'R_Index1', 'L_Hand']), 'R').name, 'R_Hand');
  assert.equal(findHandBone(fakeRoot(['mixamorigRightHandIndex1', 'mixamorigRightHand']), 'R').name, 'mixamorigRightHand');
  assert.equal(findHandBone(fakeRoot(['mixamorigLeftHand']), 'L').name, 'mixamorigLeftHand');
  assert.equal(findHandBone(fakeRoot(['Armature|R_Hand']), 'R').name, 'Armature|R_Hand', 'loose match with a prefix');
  assert.equal(findHandBone(fakeRoot(['RightHandIndex1']), 'R'), null, 'a finger is not the hand');
  assert.equal(findHandBone(null), null);
  assert.ok(HAND_BONES.R.includes('mixamorig:RightHand') && HAND_BONES.R.includes('mixamorigRightHand'));
});

test('hands: the shipped heroine models resolve a right hand (the cast start and the hit fx no longer get null)', () => {
  for (const [file, rig] of [['assets/models/agent_iris.glb', 'tripo'], ['assets/models/agent_elise.glb', 'mixamo']]) {
    if (!existsSync(new URL('../../public/' + file, import.meta.url))) continue;
    const root = fakeRoot(glbNames(file).nodes);
    assert.ok(findHandBone(root, 'R'), file + ': right hand');
    assert.ok(findHandBone(root, 'L'), file + ': left hand');
    assert.equal(rigOf(root), glbNames(file).nodes.includes('hand_R') ? 'agent' : rig, file);
  }
});

test('the blade: each rig holds the sword with its own fitted grip; a rig without one holds none', async () => {
  const { pickGrip, KNOWN_GRIPS } = await import('../../src/play/held-blade.js');
  const { GRIP } = await import('../../src/play/grip-pose.js');
  const has = (names) => (n) => names.includes(n);
  assert.equal(pickGrip(has(['prop_R', ...Object.keys(GRIP.pose)])), GRIP);
  // the fitted grips of the new rigs (art/agents/grip_fit_rig.mjs): a model with the seat and every posed finger bone
  // holds the sword; one bone short and it fights with empty hands
  for (const seat of ['R_Hand', 'mixamorigRightHand']) {
    const g = KNOWN_GRIPS.find((x) => x.seat === seat);
    assert.ok(g && Object.keys(g.pose).length >= 15, seat + ': a fitted grip with every finger');
    assert.equal(g.sword_in_seat.length, 16);
    assert.equal(pickGrip(has([seat, ...Object.keys(g.pose)])), g);
    assert.equal(pickGrip(has([seat, ...Object.keys(g.pose).slice(1)])), null);
  }
});

test('clips: the heroines\' clip files carry every clip the fight and the town ask for', () => {
  const need = ['idle', 'walk', 'run', 'dash', 'strike1', 'strike2', 'strike3', 'strike_charge', 'strike_super', 'cast_lance', 'cast_snare', 'register', 'greet'];
  for (const file of ['assets/anim/iris.glb', 'assets/anim/elise.glb']) {
    if (!existsSync(new URL('../../public/' + file, import.meta.url))) continue;
    const have = new Set(glbNames(file).clips);
    for (const c of need) assert.ok(have.has(c), `${file}: ${c}`);
  }
});

test('clips: ?anim=v1 is gone (its clips were cut for the old rig) and the optional clips stay optional', () => {
  const lib = readFileSync(new URL('../../src/play/anim-library.js', import.meta.url), 'utf8');
  assert.ok(!/name = 'iris_v1'/.test(lib), 'no iris_v1 switch');
  const av = readFileSync(new URL('../../src/play/iris-avatar.js', import.meta.url), 'utf8');
  assert.match(av, /const idle2 = extra\.find\(/, 'idle2 is looked up, not required');
  assert.match(av, /m\.clips\.find\(\(x\) => x\.name === 'skid'\)/, 'skid is looked up, not required');
  assert.match(av, /faceLayerClip\(gltf\.animations\) : null/, 'the face layer may be absent');
  const fx = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.ok(!/getObjectByName\('hand_R'\)/.test(fx), 'boot-world finds hands through play/hand-bones.js');
});
