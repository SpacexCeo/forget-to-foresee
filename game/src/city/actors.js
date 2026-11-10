// The people of the city: Iris (the player's avatar gets her model and gait here, because the season's play
// layer is not running in the city) and the five clan envoys who live in Evermind. The envoys reuse the clan
// agents' models and clips (idle, talk); each stands at a post, turns to Iris when she comes near and gets a
// nameplate on proximity. Presentation only: friendship and talk live in src/city/state.js.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MODEL_FILES } from 'virtual:model-list';
import { fetchGltf, prefetchGltf } from '../render/assets.js';
import { warmModel } from '../render/warmup.js';
import { upgradeAssetMaterials } from '../render/materials.js';
import { flatHair } from '../render/hair-cards.js';
import { fabricSheen } from '../render/fabric.js';
import { GaitLayer } from '../play/agents.js';
import { resolveClip } from '../play/behaviour.js';
import { NAMEPLATE, platePlacement } from '../play/nameplate.js';
import { CLANS } from '../scenes/layout.js';
import { RESIDENTS } from './layout.js';

const FADE = 0.35;
const CLAN_COLOR = { moss: 'moh', amber: 'yantar', frost: 'iney', salt: 'sol', ash: 'pepel' };
const hideColliders = (model) => model.traverse((o) => { if (/_col(?:[._]?\d+)?$/.test(o.name)) o.visible = false; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
const shortestAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Iris's model on the avatar group, with the same gait blend as in a season. */
export class IrisActor {
  constructor(avatar) { this.avatar = avatar; this.m = null; this.loading = null; }

  load() {
    if (this.loading || !MODEL_FILES.agent_iris) return this.loading;
    this.loading = (async () => {
      try {
        const { gltf } = await prefetchGltf('agent_iris');
        const model = cloneSkinned(gltf.scene);
        upgradeAssetMaterials('agent_iris', model);
        flatHair(model); fabricSheen(model);
        hideColliders(model);
        await warmModel(model);
        if (this.released) return;
        for (const ch of [...this.avatar.children]) ch.visible = false;
        this.avatar.add(model);
        const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
        const idle = mixer ? resolveClip(gltf.animations, 'idle').clip : null;
        const idleAction = idle ? mixer.clipAction(idle) : null;
        if (idleAction) idleAction.play();
        this.m = { model, mixer, idleAction, gait: mixer ? new GaitLayer(mixer, gltf.animations) : null };
      } catch (e) { this.avatar.userData.irisFailed = true; console.warn('[city] Iris model failed', e); }
    })();
    return this.loading;
  }

  update(dt, speed) {
    const m = this.m;
    if (!m || !m.mixer) return;
    const move = m.gait ? m.gait.update(dt, speed) : 0;
    if (m.idleAction) m.idleAction.weight = 1 - move;
    m.mixer.update(dt);
  }

  /** The season's play layer attaches its own Iris: this one steps aside. */
  release() {
    this.released = true;
    if (this.m) { this.avatar.remove(this.m.model); this.m = null; }
  }
}

class Resident {
  constructor(def, root) {
    this.def = def;
    this.group = new THREE.Group();
    this.group.name = 'resident_' + def.id;
    this.group.position.set(...def.position);
    this.group.rotation.y = def.yaw;
    this.yaw = def.yaw;
    const clan = CLANS.find((c) => c.id === CLAN_COLOR[def.clan]);
    // stand-in until the model streams in: a soft pillar in the clan's colour
    this.stand = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.05, 4, 10), new THREE.MeshStandardMaterial({ color: clan ? clan.color : 0x888888, roughness: 0.8, transparent: true, opacity: 0.85 }));
    this.stand.position.y = 0.9; this.stand.castShadow = true;
    this.group.add(this.stand);
    root.add(this.group);
    this.state = 'absent'; this.mixer = null; this.clips = []; this.actions = new Map(); this.current = null;
    this.talkUntil = 0;
  }

  async load() {
    if (this.state !== 'absent') return;
    if (!MODEL_FILES[this.def.asset]) { this.state = 'missing'; return; }
    this.state = 'loading';
    try {
      const { gltf } = await fetchGltf(this.def.asset);
      const model = cloneSkinned(gltf.scene);
      upgradeAssetMaterials(this.def.asset, model);
      hideColliders(model);
      await warmModel(model);
      this.group.remove(this.stand);
      this.group.add(model);
      this.clips = gltf.animations || [];
      if (this.clips.length) this.mixer = new THREE.AnimationMixer(model);
      this.state = 'loaded';
      this.play('idle');
    } catch (e) { this.state = 'failed'; console.warn('[city] resident model failed', this.def.asset, e); }
  }

  play(name) {
    if (!this.mixer) return;
    const { clip } = resolveClip(this.clips, name);
    if (!clip || this.current === clip.name) return;
    let act = this.actions.get(clip.name);
    if (!act) { act = this.mixer.clipAction(clip); this.actions.set(clip.name, act); }
    act.reset().fadeIn(FADE).play();
    const prev = this.current && this.actions.get(this.current);
    if (prev && prev !== act) prev.fadeOut(FADE);
    this.current = clip.name;
  }
}

/**
 * @param {{root: THREE.Object3D, uiRoot: HTMLElement, name: (id: string) => string, role: (id: string) => string}} o
 *   `root` is the city scene's group (residents use city-local coordinates); `name`/`role` give the plate text.
 */
export class Residents {
  constructor({ root, uiRoot, name, role }) {
    this.list = RESIDENTS.map((def) => new Resident(def, root));
    this.uiRoot = uiRoot; this.name = name; this.role = role;
    this.plates = new Map();
    this._v = new THREE.Vector3();
  }

  loadAll() { for (const r of this.list) r.load(); }
  get(id) { return this.list.find((r) => r.def.id === id) || null; }
  /** The envoy talks for a few seconds (the `talk` clip). */
  say(id, now, seconds = 5) { const r = this.get(id); if (r) r.talkUntil = now + seconds; }

  plateFor(r) {
    let p = this.plates.get(r.def.id);
    if (!p) {
      const el = this.uiRoot.ownerDocument.createElement('div');
      el.className = 'city-plate'; el.hidden = true;
      const nm = el.appendChild(this.uiRoot.ownerDocument.createElement('b'));
      const sub = el.appendChild(this.uiRoot.ownerDocument.createElement('span'));
      this.uiRoot.appendChild(el);
      p = { el, nm, sub, shown: false };
      this.plates.set(r.def.id, p);
    }
    return p;
  }

  /** @param {number[]} irisLocal Iris in city-local metres @param {THREE.Vector3} origin the city root's world position */
  update(dt, { now, irisLocal, camera, origin, reducedMotion = false, hidePlates = false }) {
    const w = this.uiRoot.clientWidth || window.innerWidth, h = this.uiRoot.clientHeight || window.innerHeight;
    for (const r of this.list) {
      const dx = irisLocal[0] - r.def.position[0], dz = irisLocal[2] - r.def.position[2], d = Math.hypot(dx, dz);
      // turn to Iris when she is near, back to the post otherwise
      const want = d < 6 ? Math.atan2(dx, dz) : r.def.yaw;
      r.yaw += shortestAngle(want - r.yaw) * Math.min(1, dt * (reducedMotion ? 2 : 5));
      r.group.rotation.y = r.yaw;
      r.play(now < r.talkUntil ? 'talk' : 'idle');
      if (r.mixer) r.mixer.update(dt);
      const plate = this.plateFor(r);
      this._v.set(origin.x + r.def.position[0], origin.y + NAMEPLATE.headY, origin.z + r.def.position[2]);
      const distance = camera.position.distanceTo(this._v);
      const at = platePlacement({ ndc: this._v.project(camera), distance, irisDistance: d, width: w, height: h, hidden: hidePlates });
      if (!at) { if (plate.shown) { plate.el.hidden = true; plate.shown = false; } continue; }
      if (!plate.shown) { plate.el.hidden = false; plate.shown = true; }
      const nm = this.name(r.def.id), sub = this.role(r.def.id);
      if (plate.nm.textContent !== nm) plate.nm.textContent = nm;
      if (plate.sub.textContent !== sub) plate.sub.textContent = sub;
      plate.el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -100%) scale(${at.scale})`;
      plate.el.style.opacity = String(at.opacity);
    }
  }

  hide() { for (const p of this.plates.values()) { p.el.hidden = true; p.shown = false; } }
}
