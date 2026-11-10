// The thirteen townsfolk in the hill town (N-001, docs/townsfolk.md). `townsfolk-plan.js` decides where each one is
// and what it does; this module loads the models, plays the clips and keeps the cost down. Presentation only.
//
// Loading is lazy: nothing is fetched until the town's first view is on screen, then one person at a time (nearest
// to Iris first), the light `_m` file first; on desktop the full file replaces it once everyone is in.
// Clips: the shared side-car set (game/public/assets/anim/townsfolk.glb, same bone names on every body) replaces a
// model's own clip of the same name; the face keeps its own layer.
// Cost: one mixer per person, updated every frame only near Iris (animStride), frozen far away or off screen;
// people far off screen are hidden. Reduced motion: everyone stands still in the idle pose.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MODEL_FILES } from 'virtual:model-list';
import { fetchGltf, getModelVariant } from '../render/assets.js';
import { warmModel } from '../render/warmup.js';
import { upgradeAssetMaterials } from '../render/materials.js';
import { TOWN_ORIGIN } from '../scenes/town-layout.js';
import { FADE, findLookBones, applyLookTo } from './gait.js';
import { townsfolkClips, mergeClips, faceLayerClip } from './anim-library.js';
import { TOWNSFOLK, PROGRAMS, PersonPlan, pickClip, animStride, LOOK_RADIUS } from './townsfolk-plan.js';

const _sphere = new THREE.Sphere(), _frustum = new THREE.Frustum(), _m = new THREE.Matrix4(), _target = [0, 0, 0], _local = [0, 0, 0];
const ONE_SHOT = new Set(['wave', 'salute', 'nod', 'gesture_offer', 'understand']);
/** Body type of the shared mocap set (anim-library.js townsfolkClips): posture and stride per kind of person. */
const BODY = { elder: 'elder', child_a: 'child', child_b: 'child', guard: 'guard' };

class Person {
  constructor(def, scene) {
    this.def = def;
    this.plan = new PersonPlan(def, PROGRAMS[def.key]);
    this.root = new THREE.Group();
    this.root.name = def.asset + '#townsfolk';
    this.root.visible = false;
    scene.add(this.root);
    this.model = null; this.mixer = null; this.names = []; this.clips = new Map(); this.actions = new Map();
    this.current = null; this.walkAct = null; this.walkName = null; this.moveW = 0;
    this.bones = { head: null, neck: null, eyes: [] };
    this.look = { yaw: 0, pitch: 0, w: 0 };
    this.state = 'absent'; this.file = null; this.acc = 0; this.frame = 0; this.groundY = null; this.groundAtXZ = [1e9, 1e9];
  }

  /** Puts a parsed file on this person (the light one first, the full one later): same state, new meshes. */
  async setModel(gltf, file) {
    const model = cloneSkinned(gltf.scene);
    // the shared mocap clips, retargeted to this body while it is still in its rest pose ([] when the file is missing)
    const extraClips = await townsfolkClips(model, { key: file, body: BODY[this.def.key] || 'adult' });
    // one baked cloth-and-skin material per person: named so that no look slot (amber for 'lamp…', glass) claims it
    model.traverse((o) => { if (o.isMesh && o.material) o.material.name = 'townsfolk_cloth'; });
    upgradeAssetMaterials(this.def.asset, model);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
    return warmModel(model).then(() => {
      if (this.model) { this.root.remove(this.model); this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); }
      this.root.add(model);
      this.model = model;
      this.bones = findLookBones(model);
      const own = gltf.animations || [];
      const clips = mergeClips(own, extraClips || []);
      this.mixer = new THREE.AnimationMixer(model);
      this.clips = new Map(clips.map((c) => [c.name, c]));
      this.names = [...this.clips.keys()];
      this.actions.clear(); this.current = null; this.walkAct = null; this.walkName = null;
      const face = extraClips && extraClips.length ? faceLayerClip(own) : null; // body clips from the side-car: the face keeps its own layer
      if (face) this.mixer.clipAction(face).play();
      // move at the speed the clips walk at, so the feet never slide; sit at the height the sit clip sits at
      const speedOf = (want) => { const c = this.clips.get(pickClip(this.names, want)); return c && c.userData && c.userData.speed > 0 ? c.userData.speed : 0; };
      this.clipSpeed = { walk: speedOf(this.def.key === 'elder' ? 'elder_walk' : 'walk') || this.def.walk, run: speedOf('run') || this.def.run || 2.6 };
      this.plan.walkSpeed = this.clipSpeed.walk; if (this.def.run) this.plan.runSpeed = this.clipSpeed.run;
      const sit = this.clips.get('sit');
      this.sitDrop = sit && sit.userData && sit.userData.pelvis_y ? sit.userData.pelvis_y - 0.10 * (sit.userData.scale || 1) : null;
      this.state = 'loaded';
    });
  }

  action(name) {
    let a = this.actions.get(name);
    if (!a) { a = this.mixer.clipAction(this.clips.get(name)); this.actions.set(name, a); }
    return a;
  }

  /** Cross-fades the standing activity. */
  play(want) {
    const name = pickClip(this.names, want) || pickClip(this.names, 'idle');
    if (!name || this.current === name) return;
    const a = this.action(name), once = ONE_SHOT.has(name);
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    a.setEffectiveWeight(1); a.fadeIn(FADE).play();
    const prev = this.current && this.actions.get(this.current);
    if (prev) prev.fadeOut(FADE);
    this.current = name;
  }

  /** The walk (or run) layer: its weight follows the actual speed and its phase the distance covered, so feet do not slide. */
  gait(dt, speed, gait) {
    const name = pickClip(this.names, gait === 'run' ? 'run' : this.def.key === 'elder' ? 'elder_walk' : 'walk');
    if (!name) return;
    if (this.walkName !== name) {
      if (this.walkAct) this.walkAct.stop();
      this.walkAct = this.action(name); this.walkName = name;
      this.walkAct.reset().play(); this.walkAct.setEffectiveWeight(0); this.walkAct.timeScale = 0;
    }
    const moving = speed > 0.05;
    this.moveW += ((moving ? 1 : 0) - this.moveW) * Math.min(1, dt * 7);
    this.walkAct.setEffectiveWeight(this.moveW);
    const cur = this.current && this.actions.get(this.current);
    if (cur) cur.setEffectiveWeight(1 - this.moveW);
    // the clip was authored at clipSpeed metres per second: advance it by the distance really covered
    const clipSpeed = (name === 'run' || name === 'child_run') ? this.clipSpeed.run : this.clipSpeed.walk;
    const d = this.walkAct.getClip().duration;
    this.walkAct.time = (this.walkAct.time + (speed * dt) / clipSpeed) % d;
  }
}

/**
 * @param {{scene: THREE.Scene, library: {fileFor: Function}, groundAt?: (x:number, z:number, fromY?:number) => (number|null)}} o
 */
export function createTownsfolk({ scene, library, groundAt = null }) {
  const people = TOWNSFOLK.map((def) => new Person(def, scene));
  const byKey = new Map(people.map((p) => [p.key = p.def.key, p]));
  const plans = new Map(people.map((p) => [p.def.key, p.plan]));
  const ctx = { iris: null, reduced: false, others: plans };
  const phone = () => getModelVariant() === '_m';
  let started = false, loading = false, upgraded = false, frame = 0, active = true;
  const fileOf = (def, lite) => (library && library.fileFor ? library.fileFor(def.asset, { lite }) : def.asset);
  const has = (def) => !!MODEL_FILES[def.asset];

  async function loadOne(p, lite) {
    const file = fileOf(p.def, lite);
    if (p.file === file) return;
    try {
      const { gltf } = await fetchGltf(file);
      await p.setModel(gltf, file);
      p.file = file;
    } catch (e) {
      if (p.state !== 'loaded') p.state = 'failed';
      console.warn('[townsfolk] model failed', file, e);
    }
  }

  /** One at a time, nearest to Iris first; then (desktop only) the full files in the same order. */
  async function pump(playerLocal) {
    if (loading) return;
    const d = (p) => Math.hypot(p.plan.x - playerLocal[0], p.plan.z - playerLocal[2]);
    let next = people.filter((p) => p.state === 'absent' && has(p.def)).sort((a, b) => d(a) - d(b))[0];
    let lite = true;
    if (!next && !upgraded && !phone()) {
      next = people.filter((p) => p.state === 'loaded' && fileOf(p.def, false) !== p.file).sort((a, b) => d(a) - d(b))[0];
      lite = false;
      if (!next) upgraded = true;
    }
    if (!next) return;
    loading = true;
    if (next.state === 'absent') next.state = 'loading';
    await loadOne(next, lite);
    await new Promise((r) => setTimeout(r, lite ? 60 : 400)); // leave frames between two uploads
    loading = false;
  }

  /**
   * Per frame. @param {number} dt
   * @param {{playerPos:number[], reducedMotion?:boolean, camera?:THREE.Camera, shown?:boolean}} o  playerPos in world metres
   */
  function update(dt, { playerPos, reducedMotion = false, camera = null, shown = true }) {
    if (!active) return;
    frame++;
    _local[0] = playerPos[0] - TOWN_ORIGIN[0]; _local[1] = playerPos[1] - TOWN_ORIGIN[1]; _local[2] = playerPos[2] - TOWN_ORIGIN[2];
    ctx.iris = _local; ctx.reduced = reducedMotion;
    if (shown) started = true;
    if (started && frame % 6 === 0) pump(_local);
    if (camera) { _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _frustum.setFromProjectionMatrix(_m); }
    const isPhone = phone();
    for (let i = 0; i < people.length; i++) {
      const p = people[i], plan = p.plan;
      plan.step(dt, ctx);
      if (p.state !== 'loaded') continue;
      const dist = plan.near;
      // the ground under the feet: the route's own height, corrected by the town's colliders when the person has moved
      let y = plan.y;
      if (groundAt && (Math.abs(plan.x - p.groundAtXZ[0]) + Math.abs(plan.z - p.groundAtXZ[1]) > 0.12 || p.groundY === null)) {
        const g = groundAt(plan.x + TOWN_ORIGIN[0], plan.z + TOWN_ORIGIN[2], plan.y + TOWN_ORIGIN[1] + 1.2);
        p.groundY = g !== null && Math.abs(g - TOWN_ORIGIN[1] - plan.y) < 1.3 ? g - TOWN_ORIGIN[1] : null;
        p.groundAtXZ[0] = plan.x; p.groundAtXZ[1] = plan.z;
      }
      if (p.groundY !== null && !plan.sit) y = p.groundY;
      if (plan.sit && p.sitDrop !== null && p.sitDrop !== undefined) y += plan.sit - p.sitDrop; // the seat top meets the sitting pelvis
      const canSit = !!plan.sit && !!pickClip(p.names, 'sit') && pickClip(p.names, 'sit') !== 'idle';
      let x = plan.x, z = plan.z;
      if (plan.sit && !canSit) { x += Math.sin(plan.yaw) * 0.6; z += Math.cos(plan.yaw) * 0.6; } // no sit clip: stand in front of the bench
      p.root.position.set(x + TOWN_ORIGIN[0], y + TOWN_ORIGIN[1], z + TOWN_ORIGIN[2]);
      p.root.rotation.y = plan.yaw;
      _sphere.center.set(p.root.position.x, p.root.position.y + 0.9, p.root.position.z); _sphere.radius = 1.4;
      const onScreen = !camera || _frustum.intersectsSphere(_sphere);
      p.root.visible = onScreen && dist < (isPhone ? 110 : 170);
      const stride = animStride(dist, { phone: isPhone, visible: p.root.visible });
      p.acc += dt;
      if (!stride || (frame + i) % stride !== 0) { if (!stride) p.acc = 0; continue; }
      const step = Math.min(p.acc, 0.25); p.acc = 0;
      p.play(plan.sit && !canSit ? 'idle' : plan.clip);
      p.gait(step, plan.speed, plan.gait);
      const cur = p.current && p.actions.get(p.current);
      if (cur) cur.paused = reducedMotion; // steady under reduced motion: the pose holds, cross-fades still finish
      p.mixer.update(step);
      if (dist < LOOK_RADIUS && plan.speed < 2 && !reducedMotion) { _target[0] = playerPos[0]; _target[1] = playerPos[1] + 1.5; _target[2] = playerPos[2]; applyLookTo(p.bones, p.look, p.root.position, plan.yaw, _target, step, false); }
      else if (p.look.w > 0.01) applyLookTo(p.bones, p.look, p.root.position, plan.yaw, null, step, reducedMotion);
    }
  }

  function setActive(on) { active = !!on; for (const p of people) if (!active) p.root.visible = false; }

  return {
    people, byKey, update, setActive,
    /** For QA and the dev HUD: per person key -> state, file, position, clip. */
    status() { return people.map((p) => ({ key: p.def.key, state: p.state, file: p.file, clip: p.current, walk: p.walkName, at: [p.plan.x, p.plan.y, p.plan.z], visible: p.root.visible })); },
    get loaded() { return people.filter((p) => p.state === 'loaded').length; },
  };
}
