// Side-car animation clips (docs/art/animation-pipeline.md). Motion-capture clips live in /assets/anim/<name>.glb
// next to the models (art/anim builds them): a skeleton with the shared bone names and the clips, no meshes.
// - A character's own file (Iris: iris.glb) is baked for its skeleton; three.js binds the clips by bone name, so they
//   play on the model as is; a side-car clip replaces the model's own clip of the same name.
// - The shared townsfolk file (townsfolk.glb) is retargeted here, once per character, onto any model of the shared
//   agent rig whatever its proportions and rest pose: `townsfolkClips(model)`.
// - The five quest givers have that same motion baked offline for their own bodies (npc_<key>.glb, art/anim/clips.json
//   → characters.npc_<key>): `townsfolkClips` hands those out as they are, no retarget.
// The face (blinks, brows, lips) stays on a separate always-on layer cut from the model's own idle clip, because the
// motion-capture clips carry the body only.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** Model name → side-car file (without extension) shipped in public/assets/anim/. */
export const SIDECAR = Object.freeze({ agent_iris: 'iris', agent_elise: 'elise' });

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
export function sidecarClips(asset, base = baseUrl(), search = typeof location !== 'undefined' ? location.search : '') {
  let name = SIDECAR[asset];
  // `?anim=v1`: Iris's clips as they were before the 12.11 animation pass, kept until the owner approves the new ones
  if (name === 'iris' && new URLSearchParams(search).get('anim') === 'v1') name = 'iris_v1';
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
  'idle', 'idle_shift', 'idle_look', 'walk', 'talk', 'talk_b', 'wave' /* one-shot */, 'sit',
  'elder_walk', 'child_run', 'sweep', 'carry', 'play' /* violin bowing */, 'salute' /* one-shot */, 'nod' /* one-shot */, 'counter',
]);

/**
 * Body types: how the shared motion is retimed and styled for a kind of person, on top of the proportions.
 *   time    playback rate baked into the clip (an elder moves slower, a child quicker)
 *   stride  stride length of the walks and runs relative to the legs (the ground speed follows: speed = base × scale × stride × time)
 *   lean    degrees the upper body leans forward (+) or is held back, chest up (-)
 *   bounce  scale of the hips' vertical travel (heavier < 1 < lighter)
 *   armOut  degrees the arms are held further from the body
 */
export const BODY_STYLE = Object.freeze({
  adult: { time: 1, stride: 1, lean: 0, bounce: 1, armOut: 0 },
  elder: { time: 0.84, stride: 0.86, lean: 5, bounce: 0.75, armOut: 0 },
  child: { time: 1.14, stride: 1.04, lean: 0, bounce: 1.25, armOut: 0 },
  guard: { time: 0.94, stride: 1, lean: -2.5, bounce: 0.8, armOut: 3 },
});

/**
 * Characters whose townsfolk clips are baked offline for their own skeleton and proportions (feet planted and knees
 * solved on that very body, its own walking speed in `userData.speed`): assets/anim/<name>.glb. The phone model
 * (`<name>_m`) has the same skeleton and plays the same file.
 */
export const BAKED_CLIPS = Object.freeze(['npc_guard', 'npc_innkeeper', 'npc_elder', 'npc_lamplighter', 'npc_shardkeeper']);

/** The baked clip file of a cache key ('npc_guard', 'npc_guard_m', 'npc_guard:check' → 'npc_guard'), or null. */
export function bakedClipFile(key) {
  const name = String(key || '').replace(/:.*$/, '').replace(/_m$/, '');
  return BAKED_CLIPS.includes(name) ? name : null;
}

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
 *   speed     ground speed in m/s the feet match on THIS character and body type (0 for clips in place): move the
 *             character at exactly this speed (times the action's timeScale) and the feet do not slide; or drive the
 *             clip by distance: action.time += metresCovered / speed, modulo its duration
 *   pelvis_y  mean pelvis height in metres on this character (sit: the seat top is about 0.10 × scale below it)
 *   scale     this character's leg length over the reference's
 *   take      the motion-capture source
 * @param {THREE.Object3D} model the character, still in the pose it was loaded in (call this before a mixer poses it;
 *   a clone made with SkeletonUtils.clone of the loaded scene is fine)
 * @param {object} [o]
 * @param {string[]} [o.names] only these clips (default: all of TOWNSFOLK_CLIPS)
 * @param {string|object} [o.body] 'adult' (default), 'elder', 'child', 'guard' or an object like BODY_STYLE's entries
 * @param {number} [o.armOut] degrees to hold the arms further from the body (bulky costumes), added to the body type's
 * @param {boolean} [o.planted] the careful legs (default for the quest givers, key npc_*): the feet keep the character's own
 *   stance, a foot that is down stays where it is (standing clips) or travels at exactly the clip's speed (walks), and
 *   the knee keeps its bend plane through a straight leg
 * @param {string} [o.key] cache key: characters that share a skeleton (same asset) share the retargeted clips
 * @returns {Promise<THREE.AnimationClip[]>} [] when the file fails to load
 */
export function townsfolkClips(model, { names = null, body = 'adult', armOut = 0, key = null, base = baseUrl(), file = 'townsfolk', planted = /^npc_/.test(key || '') } = {}) {
  const k = key ? `${file}|${key}|${typeof body === 'string' ? body : JSON.stringify(body)}|${armOut}|${names ? names.join(',') : '*'}|${planted ? 'p' : ''}` : null;
  if (k && retargeted.has(k)) return retargeted.get(k);
  const shared = () => loadFile(file, base).then((g) => retargetClips(g, model, { names, body, armOut, planted }), (e) => { console.warn('[anim] shared clips failed', file, e); return []; });
  // a quest giver: the clips baked for this very body (the shared set retargeted here is only the fallback when the file fails)
  const own = file === 'townsfolk' ? bakedClipFile(key) : null;
  const p = own
    ? loadFile(own, base).then((g) => g.animations.filter((c) => !names || names.includes(c.name)), (e) => { console.warn('[anim] baked clips failed', own, e); return shared(); })
    : shared();
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
    rest.set(b.name, { bone: b, parent: null, wq, wp, q: wq.clone(), t: wp.clone(), m });
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
export function retargetClips(gltf, model, { names = null, body = 'adult', armOut = 0, planted = false } = {}) {
  const style = { ...BODY_STYLE.adult, ...(typeof body === 'string' ? BODY_STYLE[body] : body), planted };
  style.armOut += armOut;
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
  // the pelvis track is local to the pelvis' parent, whatever sits above it (a scaled armature on the townsfolk)
  const pelvisParentInv = new THREE.Matrix4().multiplyMatrices(toModel, tgt.get('pelvis').bone.parent.matrixWorld).invert();
  const out = [];
  for (const clip of gltf.animations) {
    if (names && !names.includes(clip.name)) continue;
    out.push(retargetClip(clip, ref, tgt, order, K, legs, scale, style, pelvisParentInv));
  }
  return out;
}

const tgtPelX = (rest) => (rest.get('pelvis') ? rest.get('pelvis').wp.x : 0);
function depth(rest, n) { let d = 0; for (let p = rest.get(n).parent; p; p = rest.get(p).parent) d++; return d; }

const UPPER = /^(chest|neck|shoulder_[LR]|upperarm_[LR]|forearm_[LR]|hand_[LR]|thumb_[LR]|index_[LR]|fingers_[LR]|prop_[LR])$/;

function retargetClip(clip, ref, tgt, order, K, legs, scale, style, pelvisParentInv) {
  const armOut = style.armOut, moving = (clip.userData && clip.userData.speed) > 0, stride = moving ? style.stride : 1;
  const lean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(style.lean));
  const leanHalf = new THREE.Quaternion().slerp(lean, 0.5), leanHead = new THREE.Quaternion().slerp(lean, 0.3);
  const tracks = new Map(); let times = null, posTrack = null;
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.'), bone = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    if (prop === 'quaternion') { tracks.set(bone, t.values); times ||= t.times; } else if (prop === 'position' && bone === 'pelvis') posTrack = t.values;
  }
  const F = times.length;
  const refOrder = [...ref.keys()].sort((a, b) => depth(ref, a) - depth(ref, b));
  // The careful hands: these bodies are bound with flat, spread fingers. A hand at rest is never flat: the fingers
  // curl toward the palm (the long ones most, the thumb least) and are never quite still.
  const curl = new Map();
  if (style.planted) {
    for (const side of ['L', 'R']) {
      const hand = tgt.get(`hand_${side}`); if (!hand) continue;
      const inward = new THREE.Vector3(-Math.sign(hand.wp.x - tgtPelX(tgt)) || 0, 0, 0);
      for (const [name, deg, live] of [[`fingers_${side}`, 30, 4], [`index_${side}`, 20, 3], [`thumb_${side}`, 12, 2]]) {
        const b = tgt.get(name); if (!b) continue;
        const dir = Y.clone().applyQuaternion(b.wq).normalize(), palm = new THREE.Vector3(0, -1, 0).addScaledVector(inward, 0.35); palm.addScaledVector(dir, -palm.dot(dir));
        if (palm.lengthSq() < 1e-6) continue;
        const axis = dir.clone().cross(palm.normalize()).normalize().applyQuaternion(b.wq.clone().invert()); // in the bone's own frame
        curl.set(name, { axis, rad: THREE.MathUtils.degToRad(deg), live: THREE.MathUtils.degToRad(live), phase: side === 'L' ? 0 : 1.7 });
      }
    }
  }
  const keyed = order.filter((n) => (tracks.has(n) && K.has(n)) || curl.has(n));
  const outQ = new Map(keyed.map((n) => [n, new Float32Array(F * 4)]));
  const outP = new Float32Array(F * 3);
  const rw = new Map(refOrder.map((n) => [n, new THREE.Quaternion()])), rp = new Map(refOrder.map((n) => [n, new THREE.Vector3()]));
  const tw = new Map(order.map((n) => [n, new THREE.Quaternion()])), tp = new Map(order.map((n) => [n, new THREE.Vector3()]));
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), v2 = new THREE.Vector3(), s1 = new THREE.Quaternion(), ident = new THREE.Quaternion();
  const refPel = ref.get('pelvis'), tgtPel = tgt.get('pelvis');
  const armRot = { L: new THREE.Quaternion().setFromAxisAngle(Z, THREE.MathUtils.degToRad(armOut)), R: new THREE.Quaternion().setFromAxisAngle(Z, -THREE.MathUtils.degToRad(armOut)) };
  const ankleRest = { ref: (ref.get('foot_L').wp.y + ref.get('foot_R').wp.y) / 2, tgt: (tgt.get('foot_L').wp.y + tgt.get('foot_R').wp.y) / 2 };
  let pelvisY = 0;
  // the reference's pose in model space
  const refPose = (f) => {
    for (const n of refOrder) {
      const r = ref.get(n), vals = tracks.get(n);
      if (vals) q.fromArray(vals, f * 4); else q.copy(r.q);
      if (r.parent) {
        rw.get(n).copy(rw.get(r.parent)).multiply(q);
        v.copy(r.t); if (n === 'pelvis' && posTrack) v.fromArray(posTrack, f * 3);
        rp.get(n).copy(v).applyQuaternion(rw.get(r.parent)).add(rp.get(r.parent));
      } else { rw.get(n).copy(vals ? q : r.wq); rp.get(n).copy(r.wp); }
    }
  };
  // The careful legs: where each ankle goes, worked out for the whole clip first. The character keeps its own stance
  // (the reference's foot travel is added to the character's rest foot, not its absolute position), and a foot that
  // is down does not slide: it stays put in a standing clip and travels at exactly the clip's speed in a walk. When
  // it lifts, the difference to the reference's path fades out over the swing.
  let footPath = null;
  if (style.planted) {
    const speed = ((clip.userData && clip.userData.speed) || 0) * scale * stride, loop = !(clip.userData && clip.userData.loop === false), pin = clip.name !== 'sit';
    footPath = legs.map(() => new Float32Array(F * 3));
    for (let f = 0; f < F; f++) { refPose(f); legs.forEach((L, i) => { const r = rp.get(L.foot), r0 = ref.get(L.foot).wp, t0 = tgt.get(L.foot).wp; footPath[i].set([(r.x - r0.x) * scale + t0.x, (r.y - ankleRest.ref) * scale + ankleRest.tgt, (r.z - r0.z) * scale * stride + t0.z], f * 3); }); }
    if (pin) footPath.forEach((P) => {
      let lo = Infinity; for (let f = 0; f < F; f++) lo = Math.min(lo, P[f * 3 + 1]);
      const down = (f) => P[f * 3 + 1] < lo + (speed > 0 ? 0.02 : 0.035) * scale;
      // the direction the ground runs under a walking character: the way the planted foot travels in the reference
      let dz = 0; for (let f = 1; f < F; f++) if (down(f) && down(f - 1)) dz += P[f * 3 + 2] - P[f * 3 - 1];
      const sgn = dz < 0 ? -1 : 1;
      let start = 0; if (loop) { for (let f = 0; f < F; f++) if (!down(f)) { start = f; break; } }
      const N = loop ? F - 1 : F, raw = Float32Array.from(P); // a loop's last key repeats its first
      let ax = raw[start * 3], az = raw[start * 3 + 2], t0 = times[start], wasDown = false, ox = 0, oz = 0, runLen = 1, runAt = 0, elapsed = 0;
      for (let k = 0; k < N; k++) {
        const f = (start + k) % N, prev = (start + k - 1 + N) % N; if (k > 0) elapsed += f > prev ? times[f] - times[prev] : 0;
        if (down(f)) {
          if (!wasDown) { ax = k === 0 ? raw[f * 3] : P[prev * 3]; az = k === 0 ? raw[f * 3 + 2] : P[prev * 3 + 2]; t0 = elapsed; wasDown = true; if (k > 0) { ax += raw[f * 3] - raw[prev * 3]; az += raw[f * 3 + 2] - raw[prev * 3 + 2]; } }
          P[f * 3] = ax; P[f * 3 + 2] = az + sgn * speed * (elapsed - t0);
        } else {
          if (wasDown || k === 0) { ox = k === 0 ? 0 : P[prev * 3] - raw[prev * 3]; oz = k === 0 ? 0 : P[prev * 3 + 2] - raw[prev * 3 + 2]; wasDown = false; runAt = k; runLen = 1; while (runLen < N && !down((start + k + runLen) % N)) runLen++; }
          const fade = 1 - Math.min(1, (k - runAt + 1) / Math.max(2, runLen * 0.6)); P[f * 3] = raw[f * 3] + ox * fade; P[f * 3 + 2] = raw[f * 3 + 2] + oz * fade;
        }
      }
      if (loop) { P[N * 3] = P[0]; P[N * 3 + 1] = P[1]; P[N * 3 + 2] = P[2]; }
    });
  }
  for (let f = 0; f < F; f++) {
    refPose(f);
    // the model's pose: rotations carried over, pelvis travel scaled
    for (const n of order) {
      const t = tgt.get(n), pw = t.parent ? tw.get(t.parent) : ident;
      if (K.has(n) && ref.has(n)) {
        tw.get(n).copy(rw.get(n)).multiply(K.get(n));
        const arm = armOut && ARM.exec(n);
        if (arm) tw.get(n).premultiply(armRot[arm[2]]);
        if (style.lean) { if (UPPER.test(n)) tw.get(n).premultiply(lean); else if (n === 'spine') tw.get(n).premultiply(leanHalf); else if (n === 'head') tw.get(n).premultiply(leanHead); }
      } else tw.get(n).copy(pw).multiply(t.q);
      if (n === 'pelvis') { const p = tp.get(n).copy(rp.get('pelvis')).sub(refPel.wp).multiplyScalar(scale); p.y *= style.bounce; p.z *= stride; p.add(tgtPel.wp); }
      else if (t.parent) tp.get(n).copy(t.t).applyQuaternion(pw).add(tp.get(t.parent));
      else tp.get(n).copy(t.wp);
    }
    for (const [n, c] of curl) tw.get(n).multiply(s1.setFromAxisAngle(c.axis, c.rad + c.live * Math.sin((f / Math.max(1, F - 1)) * Math.PI * 2 + c.phase)));
    // the legs again, onto the reference's ankles at the model's scale
    for (let li = 0; li < legs.length; li++) {
      const L = legs[li];
      const hip = tp.get(L.thigh), want = v.copy(rp.get(L.foot)).multiplyScalar(scale);
      want.y = (rp.get(L.foot).y - ankleRest.ref) * scale + ankleRest.tgt; want.z *= stride;
      if (footPath) want.fromArray(footPath[li], f * 3);
      const thighW = tw.get(L.thigh), shinW = tw.get(L.shin);
      const d = v2.copy(want).sub(hip); let dist = d.length();
      const reach = (L.l1 + L.l2) * 0.999; dist = Math.min(Math.max(dist, Math.abs(L.l1 - L.l2) + 1e-4), reach);
      const dir = d.clone().normalize();
      const a = (L.l1 * L.l1 - L.l2 * L.l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(L.l1 * L.l1 - a * a, 0));
      const kneeFk = Y.clone().applyQuaternion(thighW).multiplyScalar(L.l1);          // relative to the hip
      const perp = kneeFk.clone().addScaledVector(dir, -kneeFk.dot(dir));
      if (footPath) {
        // A knee bends forward. A nearly straight leg has no bend plane of its own (the knee would swing round from
        // one frame to the next), and a thigh that falls behind the hip-to-ankle line would bend it backward: the
        // plane leans on the way the hips face, fully when the leg is straight, and never points behind them.
        const fwd = Z.clone().applyQuaternion(s1.copy(tgtPel.wq).invert().premultiply(tw.get('pelvis'))); fwd.addScaledVector(dir, -fwd.dot(dir));
        if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1).addScaledVector(dir, -dir.z); fwd.normalize();
        const len = perp.length() / L.l1, w = Math.min(1, Math.max(0, (len - 0.04) / 0.2));
        if (len > 1e-5) perp.normalize(); if (perp.dot(fwd) < 0) perp.addScaledVector(fwd, -perp.dot(fwd)); // sideways at most
        perp.multiplyScalar(0.45 * w * w * (3 - 2 * w)).add(fwd).normalize(); // forward first; the thigh's own lean turns it by 24 degrees at most
      } else {
        if (perp.lengthSq() < 1e-10) perp.set(0, 0, 1).addScaledVector(dir, -dir.z);
        perp.normalize();
      }
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
    v.copy(tp.get('pelvis')).applyMatrix4(pelvisParentInv);
    v.toArray(outP, f * 3); pelvisY += tp.get('pelvis').y / F;
  }
  const tt = style.time === 1 ? times : times.map((x) => x / style.time);
  const made = keyed.map((n) => new THREE.QuaternionKeyframeTrack(`${tgt.get(n).bone.name}.quaternion`, tt, outQ.get(n)));
  made.push(new THREE.VectorKeyframeTrack(`${tgtPel.bone.name}.position`, tt, outP));
  const c = new THREE.AnimationClip(clip.name, clip.duration / style.time, made);
  const ud = clip.userData || {};
  c.userData = { ...ud, speed: (ud.speed || 0) * scale * stride * style.time, pelvis_y: +pelvisY.toFixed(3), scale };
  return c;
}
