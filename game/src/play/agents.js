// The six clan agents in the 3D world. Each clan's agent_<asset>.glb stands in its camp; its clips
// play through THREE.AnimationMixer by the animation contract (docs/art/animation-contract.md:
// idle, walk, talk, think, gesture_offer, celebrate, defeat). Missing files or clips degrade
// gracefully: a labeled hologram stand-in until the model streams in, a fallback clip chain, and a
// procedural layer (breathing, glances, pacing, slump) that runs whenever a clip is missing.
// Behaviour cues come from behaviour.js (room observation → pose, placement, facing, mind glyph),
// so the clans' minds are legible from the isometric camera. Presentation only.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MODEL_FILES } from 'virtual:model-list';
import { fetchGltf } from '../render/assets.js';
import { upgradeAssetMaterials } from '../render/materials.js';
import { CAMPS, PLATEAU_RADIUS } from '../scenes/layout.js';
import { CLAN_ASSET, CLAN_ORDER, TEMPERAMENT, clanCue, resolveClip } from './behaviour.js';
import { NAMEPLATE, platePlacement } from './nameplate.js';

const LOAD_RADIUS = 75;      // meters from the camera focus at which an agent model is requested
const FADE = 0.35;           // clip cross-fade seconds
const GLYPH = { offer: '◆', broken: '✕', isolated: '!', warm: '♥', cold: '·', given: '✓', dark: '○' };
const _head = new THREE.Vector3(), _cam = new THREE.Vector3();
const MOOD_COLOR = { warm: '#e9c46a', eager: '#ffd27a', hostile: '#ff8a7a', cold: '#9fb4c0', neutral: '#d6dcd8', uneasy: '#f0a868' };

function standIn(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.15, transparent: true, opacity: 0.85 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.0, 4, 10), mat);
  body.position.y = 0.85; body.castShadow = true;
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.55, 8), mat);
  hood.position.y = 1.62;
  g.add(body, hood);
  g.name = 'agent_standin';
  return g;
}

const PLATE_CSS = `
.pl-plates { position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
.pl-plate { position: absolute; left: 0; top: 0; display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px 5px 9px;
  border-radius: 999px; background: rgba(9, 17, 19, .82); border: 1px solid rgba(232, 214, 172, .38); color: #faf7ee;
  font: 400 13px/1 "Libre Caslon Text", "WH Cyrillic", "Palatino Linotype", Palatino, Georgia, serif; white-space: nowrap;
  box-shadow: 0 2px 10px rgba(0, 0, 0, .35), inset 0 1px 0 rgba(255, 255, 255, .05); transform-origin: 50% 100%; will-change: transform, opacity; }
.pl-plate[hidden] { display: none; } /* inline-flex above would otherwise beat the UA's [hidden] rule */
.pl-plate-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; box-shadow: 0 0 6px currentColor; }
.pl-plate-sub { font: 500 11px/1 "Source Sans 3", "Segoe UI", system-ui, sans-serif; color: #cfcbbd; }
.pl-plate-sub::before { content: "·"; margin: 0 6px 0 1px; color: #e4c272; }
.pl-plate-sub:empty { display: none; }
@media (max-width: 700px) { .pl-plate { font-size: 12px; padding: 4px 9px 4px 8px; } .pl-plate-sub { font-size: 10.5px; } }
`;

/** The fixed layer that holds every nameplate, created once per overlay root (first child: under the HUD panels). */
function plateLayer(uiRoot) {
  let layer = uiRoot.querySelector(':scope > .pl-plates');
  if (layer) return layer;
  const doc = uiRoot.ownerDocument;
  if (!doc.getElementById('pl-plate-style')) { const st = doc.createElement('style'); st.id = 'pl-plate-style'; st.textContent = PLATE_CSS; doc.head.append(st); }
  layer = doc.createElement('div');
  layer.className = 'pl-plates';
  layer.setAttribute('aria-hidden', 'true');
  uiRoot.prepend(layer);
  return layer;
}

/** Screen-space nameplate above an agent's head: name, a mood dot and one short line (mind or trust). */
class Nameplate {
  constructor(layer) {
    const doc = layer.ownerDocument;
    this.el = doc.createElement('div'); this.el.className = 'pl-plate'; this.el.hidden = true;
    this.dot = doc.createElement('span'); this.dot.className = 'pl-plate-dot';
    this.name = doc.createElement('span'); this.name.className = 'pl-plate-name';
    this.sub = doc.createElement('span'); this.sub.className = 'pl-plate-sub';
    this.el.append(this.dot, this.name, this.sub);
    layer.append(this.el);
    this.key = ''; this.shown = false;
  }

  draw({ name, trust, glyph, mood, label }) {
    const key = [name, trust, glyph, mood, label].join('|');
    if (key === this.key) return;
    this.key = key;
    const col = MOOD_COLOR[mood] || MOOD_COLOR.neutral;
    this.dot.style.color = col; this.dot.style.background = col;
    this.name.textContent = name;
    this.sub.textContent = label ? (glyph && GLYPH[glyph] ? GLYPH[glyph] + ' ' : '') + label : '';
  }

  /** @param {{x:number,y:number,opacity:number,scale:number}|null} at */
  place(at) {
    if (!at) { if (this.shown) { this.el.hidden = true; this.shown = false; } return; }
    if (!this.shown) { this.el.hidden = false; this.shown = true; }
    this.el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -100%) scale(${at.scale})`;
    this.el.style.opacity = String(at.opacity);
  }

  remove() { this.el.remove(); }
}

class Agent {
  constructor(clan, { scene, color, home, homeYaw }) {
    this.clan = clan;
    this.asset = 'agent_' + CLAN_ASSET[clan];
    this.root = new THREE.Group();
    this.root.name = this.asset + '#agent';
    this.body = new THREE.Group(); // procedural layer (sway, lean, bob) on top of clips
    this.root.add(this.body);
    this.stand = standIn(color);
    this.body.add(this.stand);
    this.home = new THREE.Vector3(...home);
    this.homeYaw = homeYaw;
    this.root.position.copy(this.home);
    this.root.rotation.y = homeYaw;
    this.plate = null; // Nameplate (DOM), created by ClanAgents once it knows the overlay root
    scene.add(this.root);
    this.model = null; this.mixer = null; this.clips = []; this.actions = new Map();
    this.currentClip = null; this.state = 'absent';
    this.speed = 0; this.phase = Math.random() * 10;
    this.cue = null;
  }

  async load() {
    if (this.state !== 'absent') return;
    if (!MODEL_FILES[this.asset]) { this.state = 'missing'; return; }
    this.state = 'loading';
    try {
      const { gltf } = await fetchGltf(this.asset);
      const model = cloneSkinned(gltf.scene);
      upgradeAssetMaterials(this.asset, model);
      model.traverse((o) => {
        if (/_col(?:[._]?\d+)?$/.test(o.name)) o.visible = false;
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });
      this.body.remove(this.stand);
      this.body.add(model);
      this.model = model;
      this.clips = gltf.animations || [];
      if (this.clips.length) this.mixer = new THREE.AnimationMixer(model);
      this.state = 'loaded';
      this.currentClip = null;
    } catch (e) {
      this.state = 'failed';
      console.warn('[play] agent model failed', this.asset, e);
    }
  }

  /** Cross-fades to a contract clip (with the fallback chain). Returns the clip name used or null. */
  play(name) {
    if (!this.mixer) return null;
    const { clip, name: used } = resolveClip(this.clips, name);
    if (!clip) return null;
    if (this.currentClip === clip.name) return used;
    let act = this.actions.get(clip.name);
    if (!act) { act = this.mixer.clipAction(clip); this.actions.set(clip.name, act); }
    const once = used === 'celebrate' || used === 'defeat';
    act.reset(); act.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); act.clampWhenFinished = once;
    act.fadeIn(FADE).play();
    const prev = this.currentClip && this.actions.get(this.currentClip);
    if (prev && prev !== act) prev.fadeOut(FADE);
    this.currentClip = clip.name;
    return used;
  }
}

export class ClanAgents {
  /** @param {{scene: THREE.Scene, i18n: object}} o */
  constructor({ scene, i18n }) {
    this.scene = scene;
    this.i18n = i18n;
    this.agents = new Map();
    this.reactions = {};
    this.loading = false;
    this.talking = null; this.talkUntil = 0;
    for (const clan of CLAN_ORDER) {
      if (clan === 'iris') continue;
      const camp = CAMPS.find((c) => c.id === CLAN_ASSET[clan]);
      this.agents.set(clan, new Agent(clan, { scene, color: camp.color, home: camp.position, homeYaw: camp.rotationY }));
    }
    this.irisModel = null;
  }

  /** Iris herself: the player's avatar group gets agent_iris.glb when it is available. */
  async attachIris(avatarGroup) {
    if (!MODEL_FILES.agent_iris || this.irisModel) return;
    try {
      const { gltf } = await fetchGltf('agent_iris');
      const model = cloneSkinned(gltf.scene);
      upgradeAssetMaterials('agent_iris', model);
      model.traverse((o) => { if (/_col(?:[._]?\d+)?$/.test(o.name)) o.visible = false; if (o.isMesh) o.castShadow = true; });
      for (const ch of [...avatarGroup.children]) ch.visible = false;
      avatarGroup.add(model);
      this.irisModel = { model, mixer: gltf.animations.length ? new THREE.AnimationMixer(model) : null, clips: gltf.animations, current: null };
    } catch (e) { console.warn('[play] Iris model failed', e); }
  }

  /** Iris's clip: walk while moving, idle otherwise (procedural bob when no clips). */
  updateIris(dt, moving, avatarGroup, t, speed = 0, running = false) {
    const m = this.irisModel;
    if (!m) return;
    if (m.mixer) {
      const want = !moving ? 'idle' : running && m.clips.some((c) => c.name === 'run') ? 'run' : 'walk';
      const { clip } = resolveClip(m.clips, want);
      if (clip && m.current !== clip.name) {
        const act = m.mixer.clipAction(clip); act.reset().fadeIn(FADE).play();
        if (m.current) m.mixer.clipAction(m.clips.find((c) => c.name === m.current)).fadeOut(FADE);
        m.current = clip.name;
      }
      // Match the stride to the ground speed (walk clip authored for 1.7 m/s, run for ~3.6 m/s) so feet do not skate.
      if (clip && moving) m.mixer.clipAction(clip).timeScale = Math.min(1.6, Math.max(0.5, speed / (clip.name === 'run' ? 3.6 : 1.7)));
      m.mixer.update(dt);
    } else {
      m.model.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.05 : Math.sin(t * 1.6) * 0.01;
      m.model.rotation.z = moving ? Math.sin(t * 9) * 0.03 : 0;
    }
    void avatarGroup;
  }

  /** Public events → short reactions (celebrate a contribution, slump at a break). */
  react(map) { Object.assign(this.reactions, map); }

  /** The clan Iris is talking to faces her and plays "talk" for a while. */
  setTalking(clan, seconds = 8, now = 0) { this.talking = clan; this.talkUntil = now + seconds; }

  /**
   * @param {number} dt @param {object|null} obs controller observation
   * @param {{now:number, focus:THREE.Vector3, irisPos:number[]|null, reducedMotion:boolean, cameraDist:number, camera?:THREE.Camera, uiRoot?:HTMLElement}} ctx
   *   camera + uiRoot enable the screen-space nameplates (nameplate.js); without them no plate is drawn
   */
  update(dt, obs, ctx) {
    // Stream models nearest the focus first, one at a time.
    if (!this.loading) {
      let best = null, bestD = Infinity;
      for (const a of this.agents.values()) {
        if (a.state !== 'absent') continue;
        const d = a.home.distanceTo(ctx.focus);
        if (d < LOAD_RADIUS && d < bestD) { best = a; bestD = d; }
      }
      if (best) { this.loading = true; best.load().finally(() => { this.loading = false; }); }
    }
    const t = ctx.now;
    for (const a of this.agents.values()) {
      const irisNear = ctx.irisPos && Math.hypot(ctx.irisPos[0] - a.home.x, ctx.irisPos[2] - a.home.z) < PLATEAU_RADIUS + 1;
      const talking = this.talking === a.clan && t < this.talkUntil;
      const cue = obs ? clanCue(a.clan, obs, { reaction: this.reactions[a.clan], now: t, talking, irisNear }) : { clip: 'idle', approach: 0, face: 'plaza', tempo: 1, glyph: null, trust: null, mood: 'neutral', state: 'rest' };
      a.cue = cue;
      const T = TEMPERAMENT[a.clan];
      // Placement: step toward the bridge when trusting or offering, back toward the shelter when not.
      const toPlaza = new THREE.Vector3(-a.home.x, 0, -a.home.z).normalize();
      const target = a.home.clone().addScaledVector(toPlaza, cue.approach + 0.6);
      if (T.fidget === 'pace' && !ctx.reducedMotion && (cue.state === 'rest' || cue.state === 'isolated' || cue.state === 'cold')) {
        const side = new THREE.Vector3(toPlaza.z, 0, -toPlaza.x);
        target.addScaledVector(side, Math.sin(t * 0.35 * cue.tempo + a.phase) * 1.4);
      }
      const before = a.root.position.clone();
      const k = 1 - Math.exp(-dt * 1.2);
      a.root.position.lerp(target, k);
      a.speed = before.distanceTo(a.root.position) / Math.max(dt, 1e-3);
      // Facing.
      let yaw;
      if (cue.face === 'iris' && ctx.irisPos) yaw = Math.atan2(ctx.irisPos[0] - a.root.position.x, ctx.irisPos[2] - a.root.position.z);
      else if (a.speed > 0.25) yaw = Math.atan2(target.x - before.x, target.z - before.z);
      else yaw = Math.atan2(toPlaza.x, toPlaza.z) + (cue.face === 'away' ? Math.PI : 0);
      if (T.fidget === 'glance' && !ctx.reducedMotion && cue.face !== 'iris') yaw += Math.sin(t * 0.9 + a.phase) > 0.85 ? 0.7 : 0; // Salt keeps glancing sideways
      let dy = yaw - a.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      a.root.rotation.y += dy * (1 - Math.exp(-dt * 4));
      // Animation: walking beats the cue clip while the agent is moving.
      const want = a.speed > 0.3 ? 'walk' : cue.clip;
      const used = a.play(want);
      if (a.mixer) a.mixer.update(dt * (want === 'walk' ? 1 : cue.tempo));
      this.procedural(a, cue, t, dt, used, ctx.reducedMotion);
      // Nameplate: screen-space DOM over the head (nameplate.js), hidden inside a Shell and off screen.
      this.placePlate(a, cue, ctx);
    }
  }

  /** Projects the head point and places the agent's nameplate; needs ctx.camera and ctx.uiRoot (game.js). */
  placePlate(a, cue, ctx) {
    if (!ctx.camera || !ctx.uiRoot) return;
    if (!this.plates) this.plates = plateLayer(ctx.uiRoot);
    if (!a.plate) a.plate = new Nameplate(this.plates);
    const name = this.i18n.t('agent.' + a.clan);
    const label = cue.glyph ? this.i18n.t('mind.' + cue.glyph) : (cue.trust != null ? this.i18n.t('mind.trust', { n: cue.trust }) : '');
    a.plate.draw({ name, trust: cue.trust, glyph: cue.glyph, mood: cue.mood, label });
    const head = _head.set(a.root.position.x, a.root.position.y + NAMEPLATE.headY, a.root.position.z);
    const camPos = ctx.camera.getWorldPosition(_cam);
    const distance = head.distanceTo(camPos);
    const ndc = head.project(ctx.camera);
    const layer = this.plates;
    a.plate.place(platePlacement({ ndc, distance, width: layer.clientWidth, height: layer.clientHeight, hidden: !ctx.irisPos || a.state === 'absent' }));
  }

  /** Procedural layer: always on for the stand-in and for missing clips; subtle on top of clips. */
  procedural(a, cue, t, dt, usedClip, reduced) {
    const b = a.body;
    const full = !usedClip; // no clip available: the procedural layer carries the whole pose
    const amp = reduced ? 0.2 : 1;
    const T = TEMPERAMENT[a.clan];
    let lean = T.lean, bob = 0, sway = 0, roll = 0;
    const tt = t * cue.tempo + a.phase;
    if (full) {
      bob = Math.sin(tt * 1.7) * 0.015;
      if (a.speed > 0.3) { bob = Math.abs(Math.sin(tt * 8)) * 0.05; roll = Math.sin(tt * 8) * 0.04; }
      switch (cue.clip) {
        case 'defeat': lean = 0.32; bob -= 0.06; break;                 // slumped, head down
        case 'think': lean = 0.12; sway = Math.sin(tt * 0.6) * 0.08; break;
        case 'gesture_offer': lean = -0.06; sway = Math.sin(tt * 2.2) * 0.12; break;
        case 'celebrate': bob += Math.abs(Math.sin(tt * 6)) * 0.12; lean = -0.12; break;
        case 'talk': sway = Math.sin(tt * 3.1) * 0.06; break;
        default: if (T.fidget === 'count') sway = Math.sin(tt * 1.3) * 0.05; break;
      }
    }
    b.position.y = bob * amp;
    b.rotation.x = THREE.MathUtils.lerp(b.rotation.x, lean, 1 - Math.exp(-dt * 3));
    b.rotation.y = sway * amp;
    b.rotation.z = roll * amp;
  }

  /** Positions for VFX/audio cues and the chronicle (head height). */
  positionOf(clan) {
    const a = this.agents.get(clan);
    return a ? a.root.position.clone().add(new THREE.Vector3(0, 1.4, 0)) : null;
  }

  stats() { return [...this.agents.values()].map((a) => ({ clan: a.clan, state: a.state, clips: a.clips.map((c) => c.name), clip: a.currentClip, cue: a.cue && a.cue.state })); }
}
