// The owner's Tripo pack clips play 1.3x faster (owner 14.11): one constant per clip file (play/anim-library.js
// CLIP_TIME_SCALE), applied at load; the timing extras and the ground speed follow, so strikes stay on their impact and
// feet do not slide.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CLIP_TIME_SCALE, timeScaleFor, speedUpClips } from '../../src/play/anim-library.js';

test('anim speed: the heroines play 2x, the town pack 1.3x, the old ones as they were, ?animspeed overrides for QA', () => {
  for (const n of ['iris', 'elise', 'iris_agent']) assert.equal(timeScaleFor(n, ''), 2, n);
  for (const n of ['townsfolk_pack', 'townsfolk_wayfarer']) assert.equal(timeScaleFor(n, ''), 1.3, n);
  for (const n of ['townsfolk', 'npc_guard', 'iris_v1']) assert.equal(timeScaleFor(n, ''), 1, n);
  assert.equal(timeScaleFor('iris', '?animspeed=1'), 1); assert.equal(timeScaleFor('townsfolk', '?animspeed=2'), 1, 'an old file never changes');
  assert.ok(Object.isFrozen(CLIP_TIME_SCALE));
});

test('anim speed: keys, duration and the timing extras shrink together, the ground speed grows', () => {
  const track = new THREE.QuaternionKeyframeTrack('hand_R.quaternion', [0, 0.65, 1.3], [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const strike = new THREE.AnimationClip('strike1', 1.3, [track]); strike.userData = { impact_s: 0.13, step_s: 0.13, release_s: 0.1, full_s: 1, loop: false };
  const walk = new THREE.AnimationClip('walk', 1.3, [new THREE.VectorKeyframeTrack('pelvis.position', [0, 1.3], [0, 0, 0, 0, 0, 0])]); walk.userData = { speed: 1.2, loop: true };
  speedUpClips([strike, walk], 1.3);
  assert.ok(Math.abs(strike.duration - 1) < 1e-6 && Math.abs(strike.tracks[0].times[2] - 1) < 1e-6);
  assert.ok(Math.abs(strike.userData.impact_s - 0.1) < 1e-6 && Math.abs(strike.userData.release_s - 0.1 / 1.3) < 1e-6 && Math.abs(strike.userData.full_s - 1 / 1.3) < 1e-6);
  assert.equal(strike.userData.impact_s / strike.duration, 0.1, 'the impact stays at the same point of the swing');
  assert.ok(Math.abs(walk.userData.speed - 1.56) < 1e-6, 'feet match: the cycle covers the same ground in less time');
  assert.equal(walk.userData.loop, true);
});

test('anim speed: the heroines\' walk and run keep their own rate (the gait matches cadence to the ground); a move clip can be scaled apart', async () => {
  const { LOCOMOTION_TIME_SCALE } = await import('../../src/play/anim-library.js');
  for (const n of ['iris', 'elise', 'iris_agent']) assert.equal(LOCOMOTION_TIME_SCALE[n], 1, n);
  const run = new THREE.AnimationClip('run', 0.7, [new THREE.VectorKeyframeTrack('pelvis.position', [0, 0.7], [0, 0, 0, 0, 0, 0])]); run.userData = { speed: 4.5, contact: { L: [0.5, 0.5], R: [0, 0] } };
  const hit = new THREE.AnimationClip('strike1', 0.6, [new THREE.VectorKeyframeTrack('pelvis.position', [0, 0.6], [0, 0, 0, 0, 0, 0])]); hit.userData = { impact_s: 0.15 };
  speedUpClips([run, hit], 2, 1);
  assert.equal(run.duration, 0.7); assert.equal(run.userData.speed, 4.5, 'the run as authored');
  assert.equal(hit.duration, 0.3); assert.equal(hit.userData.impact_s, 0.075, 'the strike twice as fast');
});

test('retargeting spread over frames gives the same clips as at once (GPU bench 14.11: a whole set in one frame hitched)', async () => {
  const THREE = await import('three');
  const { retargetClips } = await import('../../src/play/anim-library.js');
  const rig = () => {
    const root = new THREE.Group(), pelvis = new THREE.Bone(); pelvis.name = 'pelvis'; pelvis.position.y = 1; root.add(pelvis);
    const bones = [pelvis];
    for (const s of ['L', 'R']) {
      const thigh = new THREE.Bone(), shin = new THREE.Bone(), foot = new THREE.Bone();
      thigh.name = `thigh_${s}`; shin.name = `shin_${s}`; foot.name = `foot_${s}`;
      thigh.position.set(s === 'L' ? 0.1 : -0.1, -0.05, 0); shin.position.y = -0.45; foot.position.y = -0.45;
      pelvis.add(thigh); thigh.add(shin); shin.add(foot); bones.push(thigh, shin, foot);
    }
    return { root, bones };
  };
  const ref = rig(), tgt = rig();
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial()); tgt.root.add(mesh); mesh.bind(new THREE.Skeleton(tgt.bones));
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.6).toArray();
  const clips = ['a', 'b', 'c', 'd'].map((n, i) => new THREE.AnimationClip(n, 1, [new THREE.QuaternionKeyframeTrack('thigh_L.quaternion', [0, 1], [0, 0, 0, 1, ...q]), new THREE.QuaternionKeyframeTrack('shin_R.quaternion', [0, 1], [...q, 0, 0, 0, 1]), new THREE.VectorKeyframeTrack('pelvis.position', [0, 1], [0, 1, 0, 0, 1 + i * 0.01, 0.2])]));
  const gltf = { scene: ref.root, animations: clips };
  const now = retargetClips(gltf, tgt.root, {});
  assert.equal(now.length, 4, 'the rig retargets');
  const later = retargetClips(gltf, tgt.root, { sliced: true });
  assert.ok(later && typeof later.then === 'function', 'sliced: a promise');
  const got = await later;
  assert.equal(got.length, now.length);
  for (let i = 0; i < now.length; i++) {
    assert.equal(got[i].name, now[i].name);
    assert.equal(got[i].tracks.length, now[i].tracks.length);
    for (let k = 0; k < now[i].tracks.length; k++) assert.deepEqual(Array.from(got[i].tracks[k].values), Array.from(now[i].tracks[k].values));
  }
});
