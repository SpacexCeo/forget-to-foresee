// Side-car animation clips (docs/art/animation-pipeline.md). Motion-capture clips live in /assets/anim/<name>.glb
// next to the models (art/anim builds them): a skeleton with the shared bone names and the clips, no meshes.
// - A character's own file (Iris: iris.glb) is baked for its skeleton; three.js binds the clips by bone name, so they
//   play on the model as is; a side-car clip replaces the model's own clip of the same name.
// - The shared townsfolk file (townsfolk.glb) is retargeted here, once per character, onto any model of the shared
//   agent rig whatever its proportions and rest pose: `townsfolkClips(model)`.
// The face (blinks, brows, lips) stays on a separate always-on layer cut from the model's own idle clip, because the
// motion-capture clips carry the body only.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** Model name → side-car file (without extension) shipped in public/assets/anim/. */
export const SIDECAR = Object.freeze({ agent_iris: 'iris' });

/** The motion-capture clips are the default (decision 11.11.2026); `?anim=classic` keeps the model's own clips. */
export function sidecarEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const v = new URLSearchParams(search).get('anim');
  return v !== 'classic' && v !== 'legacy';
}

let loader = null;
const cache = new Map();
const baseUrl = () => (import.meta.env && import.meta.env.BASE_URL) || '/';

function loadFile(name, base) {
  const key = base + name;
  if (!cache.has(key)) {
    loader ||= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    cache.set(key, loader.loadAsync(`${base}assets/anim/${name}.glb`).then((g) => {
      const extras = (g.parser.json.animations || []).map((a) => a.extras || {});
      g.animations.forEach((c, i) => { c.userData = { ...extras[i] }; });
      return g;
    }));
  }
  return cache.get(key);
}

/** The side-car clips of a model ([] when it has none or the file fails: the model's own clips stay). */
export function sidecarClips(asset, base = baseUrl()) {
  const name = SIDECAR[asset];
  if (!name) return Promise.resolve([]);
  return loadFile(name, base).then((g) => g.animations, (e) => { console.warn('[anim] side-car clips failed', name, e); return []; });
}

/** The model's clips with every same-named side-car clip in their place (and the new names added). */
export function mergeClips(own, extra) {
  const names = new Set(extra.map((c) => c.name));
  return [...own.filter((c) => !names.has(c.name)), ...extra];
}

const FACE_TRACK = /(morphTargetInfluences|(^|[./])(jaw|lid_[a-z]+_[LR]|brow_[LR]|eye_[LR])\.)/;

/** An always-on face layer: the face tracks (morphs, lids, brows, jaw, eyes) of the model's own idle clip. */
export function faceLayerClip(own) {
  const idle = own.find((c) => c.name === 'idle');
  if (!idle) return null;
  const tracks = idle.tracks.filter((t) => FACE_TRACK.test(t.name));
  return tracks.length ? new THREE.AnimationClip('face_layer', idle.duration, tracks) : null;
}

/** Whether a clip animates the face itself (the model's own clips do; side-car body clips do not). */
export const hasFace = (clip) => clip.tracks.some((t) => FACE_TRACK.test(t.name));

// ---------------------------------------------------------------------------------------------------------------
// Shared clips for the townsfolk: one file, retargeted at load onto each character.

/** Names in townsfolk.glb (art/anim/clips.json → characters.townsfolk). Loops unless marked one-shot. */
export const TOWNSFOLK_CLIPS = Object.freeze([
  'idle', 'idle_shift', 'idle_look', 'walk', 'talk_a', 'talk_b', 'wave' /* one-shot */, 'sit',
  'walk_elder', 'run_child', 'sweep', 'carry', 'play', 'salute' /* one-shot */, 'nod' /* one-shot */, 'counter',
]);

const LIMB = /^(upperarm|forearm|thigh|shin)_[LR]$/;          // aligned to the reference's rest direction
const HAND = /^(hand|thumb|index|fingers|prop)_([LR])$/;       // carried by the forearm's alignment
const ARM = /^(upperarm|forearm|hand|thumb|index|fingers|prop)_([LR])$/;
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const retargeted = new Map();

/**
 * The shared townsfolk clips, retargeted onto `model` (any character of the shared agent rig: same bone names, any
 * proportions and rest pose). Resolves to AnimationClips that bind to the model's bones by name; play them with a
 * THREE.AnimationMixer on the model. Each clip's `userData` has:
 *   loop      true for loops (idle, walk, talk, sit, ...), false for one-shots (wave, salute, nod: they start and
 *             end in the idle pose; play with LoopOnce and cross-fade back to an idle)
 *   speed     ground speed in m/s the feet match on THIS character (0 for clips in place); move the character at
 *             exactly this speed (times the action's timeScale) and the feet do not slide
 *   pelvis_y  mean pelvis height in metres on this character (sit: the seat top is about 0.10 × scale below it)
 *   scale     this character's leg length over the reference's
 *   take      the motion-capture source
 * @param {THREE.Object3D} model the character, still in the pose it was loaded in (call this before a mixer poses it;
 *   a clone made with SkeletonUtils.clone of the loaded scene is fine)
 * @param {object} [o]
 * @param {string[]} [o.names] only these clips (default: all of TOWNSFOLK_CLIPS)
 * @param {number} [o.armOut] degrees to hold the arms further from the body (bulky costumes), default 0
 * @param {string} [o.key] cache key: characters that share a skeleton (same asset) share the retargeted clips
 * @returns {Promise<THREE.AnimationClip[]>} [] when the file fails to load
 */
export function townsfolkClips(model, { names = null, armOut = 0, key = null, base = baseUrl(), file = 'townsfolk' } = {}) {
  const k = key ? `${file}|${key}|${armOut}|${names ? names.join(',') : '*'}` : null;
  if (k && retargeted.has(k)) return retargeted.get(k);
  const p = loadFile(file, base).then((g) => retargetClips(g, model, { names, armOut }), (e) => { console.warn('[anim] shared clips failed', file, e); return []; });
  if (k) retargeted.set(k, p);
  return p;
}

/** Rest pose of a skeleton as plain data: name → { parent, q (local), t (local), wq (model space), wp }. */
function restOf(bones, bindWorld) {
  const rest = new Map();
  for (const b of bones) {
    const m = bindWorld(b);
    const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(wp, wq, s);
    rest.set(b.name, { bone: b, parent: null, wq, wp, q: wq.clone(), t: wp.clone() });
  }
  for (const b of bones) {
    const r = rest.get(b.name), p = b.parent && rest.get(b.parent.name);
    if (!p) continue;
    r.parent = b.parent.name;
    const inv = p.wq.clone().invert();
    r.q = inv.clone().multiply(r.wq);
    r.t = r.wp.clone().sub(p.wp).applyQuaternion(inv);
  }
  return rest;
}

const legLength = (rest) => ['L', 'R'].reduce((s, x) => s + rest.get(`thigh_${x}`).wp.distanceTo(rest.get(`shin_${x}`).wp) + rest.get(`shin_${x}`).wp.distanceTo(rest.get(`foot_${x}`).wp), 0) / 2;

/**
 * Retargets the clips of a loaded side-car file (`gltf`) onto `model`. For every bone the reference's world-space
 * rotation since its rest pose is applied to the model's bone; arms, legs, hands and feet are first aligned to the
 * reference's rest directions (so each limb points exactly where the clip points it whatever the two rest poses
 * are), the spine, neck and head keep the model's own posture (a stooped elder stays stooped). The pelvis travel is
 * scaled by the leg-length ratio, then both legs are solved again onto the scaled ankle positions, so the feet stay
 * planted on a child as on a tall adult.
 */
export function retargetClips(gltf, model, { names = null, armOut = 0 } = {}) {
  gltf.scene.updateMatrixWorld(true);
  const refBones = []; gltf.scene.traverse((o) => { if (o !== gltf.scene) refBones.push(o); });
  const ref = restOf(refBones, (b) => b.matrixWorld);
  let skinned = null; model.traverse((o) => { if (!skinned && o.isSkinnedMesh && o.skeleton.bones.some((b) => b.name === 'pelvis')) skinned = o; });
  if (!skinned || !ref.has('pelvis')) return [];
  const sk = skinned.skeleton;
  // the model's rest pose: its bones as they are now, in the model's own space (the pose the file was loaded in)
  model.updateWorldMatrix(true, true);
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const tgt = restOf(sk.bones, (b) => new THREE.Matrix4().multiplyMatrices(toModel, b.matrixWorld));
  for (const n of ['thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R', 'pelvis']) if (!tgt.has(n)) return [];
  const order = sk.bones.map((b) => b.name).filter((n) => tgt.has(n));
  order.sort((a, b) => depth(tgt, a) - depth(tgt, b));
  const scale = legLength(tgt) / legLength(ref);
  // K: reference world rotation → model world rotation, per bone (rest-to-rest, limbs aligned by direction)
  const K = new Map(), aligns = new Map();
  for (const n of order) {
    const r = ref.get(n), t = tgt.get(n);
    if (!r) continue;
    const align = new THREE.Quaternion();
    const hand = HAND.exec(n);
    if (LIMB.test(n)) align.setFromUnitVectors(Y.clone().applyQuaternion(t.wq), Y.clone().applyQuaternion(r.wq));
    else if (hand && aligns.has(`forearm_${hand[2]}`)) align.copy(aligns.get(`forearm_${hand[2]}`));
    aligns.set(n, align);
    K.set(n, r.wq.clone().invert().multiply(align).multiply(t.wq));
  }
  const legs = ['L', 'R'].map((s) => ({ thigh: `thigh_${s}`, shin: `shin_${s}`, foot: `foot_${s}`, l1: tgt.get(`thigh_${s}`).wp.distanceTo(tgt.get(`shin_${s}`).wp), l2: tgt.get(`shin_${s}`).wp.distanceTo(tgt.get(`foot_${s}`).wp) }));
  const out = [];
  for (const clip of gltf.animations) {
    if (names && !names.includes(clip.name)) continue;
    out.push(retargetClip(clip, ref, tgt, order, K, legs, scale, armOut));
  }
  return out;
}

function depth(rest, n) { let d = 0; for (let p = rest.get(n).parent; p; p = rest.get(p).parent) d++; return d; }

function retargetClip(clip, ref, tgt, order, K, legs, scale, armOut) {
  const tracks = new Map(); let times = null, posTrack = null;
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.'), bone = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    if (prop === 'quaternion') { tracks.set(bone, t.values); times ||= t.times; } else if (prop === 'position' && bone === 'pelvis') posTrack = t.values;
  }
  const F = times.length;
  const refOrder = [...ref.keys()].sort((a, b) => depth(ref, a) - depth(ref, b));
  const keyed = order.filter((n) => tracks.has(n) && K.has(n));
  const outQ = new Map(keyed.map((n) => [n, new Float32Array(F * 4)]));
  const outP = new Float32Array(F * 3);
  const rw = new Map(refOrder.map((n) => [n, new THREE.Quaternion()])), rp = new Map(refOrder.map((n) => [n, new THREE.Vector3()]));
  const tw = new Map(order.map((n) => [n, new THREE.Quaternion()])), tp = new Map(order.map((n) => [n, new THREE.Vector3()]));
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), v2 = new THREE.Vector3(), s1 = new THREE.Quaternion(), ident = new THREE.Quaternion();
  const refPel = ref.get('pelvis'), tgtPel = tgt.get('pelvis');
  const armRot = { L: new THREE.Quaternion().setFromAxisAngle(Z, THREE.MathUtils.degToRad(armOut)), R: new THREE.Quaternion().setFromAxisAngle(Z, -THREE.MathUtils.degToRad(armOut)) };
  const ankleRest = { ref: (ref.get('foot_L').wp.y + ref.get('foot_R').wp.y) / 2, tgt: (tgt.get('foot_L').wp.y + tgt.get('foot_R').wp.y) / 2 };
  let pelvisY = 0;
  for (let f = 0; f < F; f++) {
    // the reference's pose in model space
    for (const n of refOrder) {
      const r = ref.get(n), vals = tracks.get(n);
      if (vals) q.fromArray(vals, f * 4); else q.copy(r.q);
      if (r.parent) {
        rw.get(n).copy(rw.get(r.parent)).multiply(q);
        v.copy(r.t); if (n === 'pelvis' && posTrack) v.fromArray(posTrack, f * 3);
        rp.get(n).copy(v).applyQuaternion(rw.get(r.parent)).add(rp.get(r.parent));
      } else { rw.get(n).copy(vals ? q : r.wq); rp.get(n).copy(r.wp); }
    }
    // the model's pose: rotations carried over, pelvis travel scaled
    for (const n of order) {
      const t = tgt.get(n), pw = t.parent ? tw.get(t.parent) : ident;
      if (K.has(n) && ref.has(n)) {
        tw.get(n).copy(rw.get(n)).multiply(K.get(n));
        const arm = armOut && ARM.exec(n);
        if (arm) tw.get(n).premultiply(armRot[arm[2]]);
      } else tw.get(n).copy(pw).multiply(t.q);
      if (n === 'pelvis') tp.get(n).copy(rp.get('pelvis')).sub(refPel.wp).multiplyScalar(scale).add(tgtPel.wp);
      else if (t.parent) tp.get(n).copy(t.t).applyQuaternion(pw).add(tp.get(t.parent));
      else tp.get(n).copy(t.wp);
    }
    // the legs again, onto the reference's ankles at the model's scale
    for (const L of legs) {
      const hip = tp.get(L.thigh), want = v.copy(rp.get(L.foot)).multiplyScalar(scale);
      want.y = (rp.get(L.foot).y - ankleRest.ref) * scale + ankleRest.tgt;
      const thighW = tw.get(L.thigh), shinW = tw.get(L.shin);
      const d = v2.copy(want).sub(hip); let dist = d.length();
      const reach = (L.l1 + L.l2) * 0.999; dist = Math.min(Math.max(dist, Math.abs(L.l1 - L.l2) + 1e-4), reach);
      const dir = d.clone().normalize();
      const a = (L.l1 * L.l1 - L.l2 * L.l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(L.l1 * L.l1 - a * a, 0));
      const kneeFk = Y.clone().applyQuaternion(thighW).multiplyScalar(L.l1);          // relative to the hip
      const perp = kneeFk.clone().addScaledVector(dir, -kneeFk.dot(dir));
      if (perp.lengthSq() < 1e-10) perp.set(0, 0, 1).addScaledVector(dir, -dir.z);
      perp.normalize();
      const knee = dir.clone().multiplyScalar(a).addScaledVector(perp, h);            // relative to the hip
      s1.setFromUnitVectors(Y.clone().applyQuaternion(thighW).normalize(), knee.clone().normalize());
      thighW.premultiply(s1); shinW.premultiply(s1);
      const lower = dir.clone().multiplyScalar(dist).sub(knee).normalize();
      s1.setFromUnitVectors(Y.clone().applyQuaternion(shinW).normalize(), lower);
      shinW.premultiply(s1);
    }
    for (const n of keyed) {
      const t = tgt.get(n);
      q.copy(t.parent ? tw.get(t.parent) : ident).invert().multiply(tw.get(n)).normalize();
      const o = outQ.get(n);
      if (f > 0 && o[f * 4 - 4] * q.x + o[f * 4 - 3] * q.y + o[f * 4 - 2] * q.z + o[f * 4 - 1] * q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      q.toArray(o, f * 4);
    }
    // pelvis local translation (its parent, the root bone, stays at rest)
    const par = tgtPel.parent ? tgt.get(tgtPel.parent) : null;
    v.copy(tp.get('pelvis')); if (par) v.sub(par.wp).applyQuaternion(q.copy(par.wq).invert());
    v.toArray(outP, f * 3); pelvisY += tp.get('pelvis').y / F;
  }
  const made = keyed.map((n) => new THREE.QuaternionKeyframeTrack(`${tgt.get(n).bone.name}.quaternion`, times, outQ.get(n)));
  made.push(new THREE.VectorKeyframeTrack(`${tgtPel.bone.name}.position`, times, outP));
  const c = new THREE.AnimationClip(clip.name, clip.duration, made);
  const ud = clip.userData || {};
  c.userData = { ...ud, speed: (ud.speed || 0) * scale, pelvis_y: +pelvisY.toFixed(3), scale };
  return c;
}
