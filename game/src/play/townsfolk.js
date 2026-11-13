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
const MAX_STEP = 0.45; // the largest ground step a walker takes (play/town-paths.js MAX_STEP; no import: chunk order)
import { TOWNSFOLK, PROGRAMS, PersonPlan, tradeProgram, homeProgram, pickClip, animStride, LOOK_RADIUS } from './townsfolk-plan.js';

const SIT_PELVIS_ABOVE = 0.10; // hip joint above the seat top when seated (m, scaled with the body)
const SIT_PELVIS_Z = -0.07;    // hip joint along the 0.46 m deep seat (bench local, the sitter faces +Z; back rail at -0.26)
const _pelvis = new THREE.Vector3();

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
      // where the sit clip really puts the pelvis on this body is measured once in the pose (sitFix), then the root
      // is moved so the pelvis lands on the seat (owner 11.11: the elder sat on the back rail, legs through the seat)
      this.pelvis = model.getObjectByName('pelvis') || null; this.sitFix = null; this.sitScale = (sit && sit.userData && sit.userData.scale) || 1;
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
    // Draw distance (jury low-tier pass, 12.11): 60 m on phones; with Iris beyond the walls the townsfolk sit behind
    // them, so phones draw none and desktops only the nearest
    const outside = _local[2] > 33.5 || Math.abs(_local[0]) > 53;
    const reach = outside ? (isPhone ? 0 : 60) : (isPhone ? 60 : 170);
    for (let i = 0; i < people.length; i++) {
      const p = people[i], plan = p.plan;
      plan.step(dt, ctx);
      if (p.state !== 'loaded') continue;
      const dist = plan.near;
      // the ground under the feet (owner 13.11: walk only on the paths): cast from just above the feet, never from the
      // sky (a sky cast lands on wall tops); a step that leaves the ground or jumps more than MAX_STEP is refused: the
      // side step is dropped and the walker stays on the path line; with no ground at all the last good height holds
      let y = plan.y;
      if (groundAt && !plan.sit && (Math.abs(plan.x - p.groundAtXZ[0]) + Math.abs(plan.z - p.groundAtXZ[1]) > 0.12 || p.groundY === null)) {
        const ref = p.groundY === null ? plan.y : p.groundY, tol = p.groundY === null ? 1.3 : MAX_STEP;
        const cast = (gx, gz) => { const g = groundAt(gx + TOWN_ORIGIN[0], gz + TOWN_ORIGIN[2], ref + TOWN_ORIGIN[1] + 1.2); return g === null ? null : g - TOWN_ORIGIN[1]; };
        let gy = cast(plan.x, plan.z);
        if ((gy === null || Math.abs(gy - ref) > tol) && plan.px !== undefined && (plan.px !== plan.x || plan.pz !== plan.z)) { plan.side = 0; plan.x = plan.px; plan.z = plan.pz; gy = cast(plan.x, plan.z); }
        if (gy !== null && Math.abs(gy - ref) <= tol) p.groundY = gy;
        p.groundAtXZ[0] = plan.x; p.groundAtXZ[1] = plan.z;
      }
      if (p.groundY !== null && !plan.sit) y = p.groundY;
      const canSit = !!plan.sit && !!pickClip(p.names, 'sit') && pickClip(p.names, 'sit') !== 'idle';
      let x = plan.x, z = plan.z;
      const fix = plan.sit && canSit ? p.sitFix : null;
      if (fix) { // the measured pelvis: SIT_PELVIS_ABOVE above the seat top, SIT_PELVIS_Z along the seat (bench local, +Z = facing)
        y += plan.sit + SIT_PELVIS_ABOVE * p.sitScale - fix.y;
        x += Math.sin(plan.yaw) * (SIT_PELVIS_Z - fix.z); z += Math.cos(plan.yaw) * (SIT_PELVIS_Z - fix.z);
      } else if (plan.sit && p.sitDrop !== null && p.sitDrop !== undefined) y += plan.sit - p.sitDrop; // the seat top meets the sitting pelvis
      if (plan.sit && !canSit) { x += Math.sin(plan.yaw) * 0.6; z += Math.cos(plan.yaw) * 0.6; } // no sit clip: stand in front of the bench
      p.root.position.set(x + TOWN_ORIGIN[0], y + TOWN_ORIGIN[1], z + TOWN_ORIGIN[2]);
      p.root.rotation.y = plan.yaw;
      _sphere.center.set(p.root.position.x, p.root.position.y + 0.9, p.root.position.z); _sphere.radius = 1.4;
      const onScreen = !camera || _frustum.intersectsSphere(_sphere);
      p.root.visible = onScreen && dist < reach;
      const stride = animStride(dist, { phone: isPhone, visible: p.root.visible });
      p.acc += dt;
      if (!stride || (frame + i) % stride !== 0) { if (!stride) p.acc = 0; continue; }
      const step = Math.min(p.acc, 0.25); p.acc = 0;
      p.play(plan.sit && !canSit ? 'idle' : plan.clip);
      p.gait(step, plan.speed, plan.gait);
      const cur = p.current && p.actions.get(p.current);
      if (cur) cur.paused = reducedMotion; // steady under reduced motion: the pose holds, cross-fades still finish
      p.mixer.update(step);
      if (plan.sit && canSit && !p.sitFix && p.pelvis && p.current === pickClip(p.names, 'sit')) {
        const act = p.actions.get(p.current);
        if (act && act.getEffectiveWeight() > 0.999) {
          p.root.updateMatrixWorld(true);
          p.root.worldToLocal(p.pelvis.getWorldPosition(_pelvis));
          p.sitFix = { y: _pelvis.y, z: _pelvis.z };
        }
      }
      if (dist < LOOK_RADIUS && plan.speed < 2 && !reducedMotion) { _target[0] = playerPos[0]; _target[1] = playerPos[1] + 1.5; _target[2] = playerPos[2]; applyLookTo(p.bones, p.look, p.root.position, plan.yaw, _target, step, false); }
      else if (p.look.w > 0.01) applyLookTo(p.bones, p.look, p.root.position, plan.yaw, null, step, reducedMotion);
    }
  }

  // A hired townsperson (game/town-economy.js) wears a small gold badge over the head while working for Iris.
  let badgeTex = null;
  function setBadge(key, on) {
    const p = byKey.get(key);
    if (!p) return;
    if (on && !p.badge) {
      if (!badgeTex && typeof document !== 'undefined') {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d'); g.fillStyle = 'rgba(233,180,76,0.95)'; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1d1708'; g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✦', 32, 34);
        badgeTex = new THREE.CanvasTexture(c); badgeTex.colorSpace = THREE.SRGBColorSpace;
      }
      p.badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTex, depthTest: false, transparent: true }));
      p.badge.scale.set(0.32, 0.32, 1); p.badge.position.set(0, p.def.height + 0.32, 0); p.badge.renderOrder = 10;
      p.root.add(p.badge);
    }
    if (p.badge) p.badge.visible = !!on;
  }

  /** A hired agent walks to the Shard Exchange and trades there; `false` walks it home to its own loop. */
  function sendToTrade(key, on) {
    const p = byKey.get(key);
    if (!p) return;
    const plan = p.plan;
    if (on && !plan.trading) { plan.original = plan.original || plan.program; plan.trading = true; plan.program = tradeProgram(plan, [...byKey.values()].filter((x) => x.plan.trading).length - 1); plan.index = -1; plan.next(); }
    else if (!on && plan.trading) { plan.trading = false; plan.program = homeProgram(plan, plan.original); plan.index = -1; plan.next(); }
  }

  function setActive(on) { active = !!on; for (const p of people) if (!active) p.root.visible = false; }

  return {
    people, byKey, update, setActive, setBadge, sendToTrade,
    /** For QA and the dev HUD: per person key -> state, file, position, clip. */
    status() { return people.map((p) => ({ key: p.def.key, state: p.state, file: p.file, clip: p.current, walk: p.walkName, at: [p.plan.x, p.plan.y, p.plan.z], visible: p.root.visible })); },
    get loaded() { return people.filter((p) => p.state === 'loaded').length; },
  };
}
