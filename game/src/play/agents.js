// The six clan agents in the 3D world. Each clan's agent_<asset>.glb stands in its camp; its clips
// play through THREE.AnimationMixer by the animation contract (docs/art/animation-contract.md:
// idle, walk, run, talk, think, gesture_offer, celebrate, defeat). Missing files or clips degrade
// gracefully: a labeled hologram stand-in until the model streams in, a fallback clip chain, and a
// procedural layer (breathing, glances, pacing, slump) that runs whenever a clip is missing.
// Locomotion (Iris and the agents alike) is a gait layer blended by the actual ground speed with the
// clip rate synced to it (docs/movement.md): no foot sliding, short eased start/stop transitions.
// The agents walk their camp with the same motion model as the player (physics/motion.js).
// Behaviour cues come from behaviour.js (room observation → pose, placement, facing, mind glyph),
// so the clans' minds are legible from the isometric camera. Presentation only.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MODEL_FILES } from 'virtual:model-list';
import { fetchGltf } from '../render/assets.js';
import { upgradeAssetMaterials } from '../render/materials.js';
import { CAMPS, PLATEAU_RADIUS } from '../scenes/layout.js';
import { CLAN_ASSET, CLAN_ORDER, TEMPERAMENT, clanCue, resolveClip } from './behaviour.js';
import { NPC_MOTION, createMotion, stepMotion, gaitBlend, damp } from '../physics/motion.js';
import { steerTo } from '../physics/character.js';

const LOAD_RADIUS = 75;      // meters from the camera focus at which an agent model is requested
const FADE = 0.35;           // clip cross-fade seconds
const NPC_SPEED = 1.1;       // m/s, the agents' amble about their camps
const GAIT_RATE = 10;        // 1/s, easing of the gait weights (about 0.1 s start/stop transitions)
const WALK_REF = 1.7, RUN_REF = 3.57; // m/s the walk / run clips were authored at

/**
 * Locomotion layer on a mixer: the walk and run actions always play, their weights follow the
 * actual ground speed (idle → walk by 0.6 m/s, walk → run from 1.7 to 3.57 m/s) and their playback
 * rate follows it too, so the stride matches the ground. `move` (0..1) is how much of the pose the
 * gait owns; the caller scales its idle / cue actions by 1 - move. Without a run clip the walk clip
 * carries the run at a higher rate; without a walk clip the layer is inert (procedural fallback).
 */
export class GaitLayer {
  constructor(mixer, clips) {
    this.mixer = mixer;
    const w = resolveClip(clips, 'walk'), r = resolveClip(clips, 'run');
    this.walk = w.clip && w.name === 'walk' ? mixer.clipAction(w.clip) : null;
    this.run = r.clip && r.name === 'run' ? mixer.clipAction(r.clip) : null;
    for (const a of [this.walk, this.run]) if (a) { a.play(); a.weight = 0; a.enabled = true; }
    this.weights = { walk: 0, run: 0 };
    this.move = 0;
  }

  /** @param {number} speed actual ground speed in m/s @returns {number} move weight 0..1 */
  update(dt, speed) {
    const g = gaitBlend(speed, { walkRef: WALK_REF, runRef: RUN_REF });
    let walkW = g.walk, runW = g.run;
    if (!this.run) { walkW += runW; runW = 0; }
    if (!this.walk) walkW = 0;
    this.weights.walk = damp(this.weights.walk, walkW, GAIT_RATE, dt);
    this.weights.run = damp(this.weights.run, runW, GAIT_RATE, dt);
    this.move = Math.min(1, this.weights.walk + this.weights.run);
    if (this.walk) {
      this.walk.weight = this.weights.walk;
      this.walk.timeScale = this.run ? g.walkScale : Math.min(2.2, Math.max(0.55, Math.max(speed, 0.6) / WALK_REF));
    }
    if (this.run) {
      // Keep the two gait cycles in phase so the feet stay planted through the walk → run blend.
      if (this.weights.run < 0.01 && runW > 0 && this.walk) this.run.time = (this.walk.time / this.walk.getClip().duration) * this.run.getClip().duration;
      this.run.weight = this.weights.run;
      this.run.timeScale = g.runScale;
    }
    return this.move;
  }
}
const GLYPH = { offer: '◆', broken: '✕', isolated: '!', warm: '♥', cold: '·', given: '✓', dark: '○' };
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

/** Canvas sprite above an agent: name, trust arc and a mind glyph (shape + colour + text). */
class MindSprite {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256; this.canvas.height = 128;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    this.sprite.renderOrder = 10;
    this.sprite.scale.set(1.6, 0.8, 1);
    this.key = '';
  }

  draw({ name, trust, glyph, mood, label }) {
    const key = [name, trust, glyph, mood, label].join('|');
    if (key === this.key) return;
    this.key = key;
    const c = this.canvas.getContext('2d');
    c.clearRect(0, 0, 256, 128);
    const col = MOOD_COLOR[mood] || MOOD_COLOR.neutral;
    // Trust arc (0..100) around the glyph disc.
    c.lineWidth = 7; c.lineCap = 'round';
    c.strokeStyle = 'rgba(20,24,22,0.55)'; c.beginPath(); c.arc(64, 64, 40, 0, Math.PI * 2); c.stroke();
    if (trust != null) { c.strokeStyle = col; c.beginPath(); c.arc(64, 64, 40, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.max(0, Math.min(100, trust))) / 100); c.stroke(); }
    c.fillStyle = 'rgba(20,24,22,0.72)'; c.beginPath(); c.arc(64, 64, 33, 0, Math.PI * 2); c.fill();
    c.fillStyle = col; c.font = '700 38px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(glyph ? GLYPH[glyph] || '•' : '•', 64, 66);
    c.textAlign = 'left'; c.font = '600 30px Georgia, serif';
    c.lineWidth = 6; c.strokeStyle = 'rgba(20,24,22,0.8)'; c.strokeText(name, 112, 50); c.fillStyle = '#f4f1e6'; c.fillText(name, 112, 50);
    if (label) { c.font = '22px system-ui, sans-serif'; c.strokeText(label, 112, 86); c.fillStyle = col; c.fillText(label, 112, 86); }
    this.tex.needsUpdate = true;
  }
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
    this.mind = new MindSprite();
    this.mind.sprite.position.y = 2.35;
    this.root.add(this.mind.sprite);
    scene.add(this.root);
    this.model = null; this.mixer = null; this.clips = []; this.actions = new Map();
    this.currentClip = null; this.state = 'absent';
    this.speed = 0; this.phase = Math.random() * 10;
    this.motion = createMotion(homeYaw); // velocity + facing, stepped by the shared motion model
    this.gait = null;
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
      if (this.clips.length) { this.mixer = new THREE.AnimationMixer(model); this.gait = new GaitLayer(this.mixer, this.clips); }
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
      const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
      const idle = mixer ? resolveClip(gltf.animations, 'idle').clip : null;
      const idleAction = idle ? mixer.clipAction(idle) : null;
      if (idleAction) idleAction.play();
      this.irisModel = { model, mixer, clips: gltf.animations, idleAction, gait: mixer ? new GaitLayer(mixer, gltf.animations) : null };
    } catch (e) { console.warn('[play] Iris model failed', e); }
  }

  /** Iris's gait: idle / walk / run blended by the actual ground speed (procedural bob when no clips). */
  updateIris(dt, moving, avatarGroup, t, speed = 0, running = false) {
    const m = this.irisModel;
    if (!m) return;
    void running; // the blend follows the speed itself: the run clip appears above the walk speed
    if (m.mixer) {
      const move = m.gait ? m.gait.update(dt, speed) : 0;
      if (m.idleAction) m.idleAction.weight = 1 - move;
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
   * @param {{now:number, focus:THREE.Vector3, irisPos:number[], reducedMotion:boolean, cameraDist:number}} ctx
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
      // Walk there with the shared motion model (accelerate, brake into the spot, turn at a limited rate)
      // instead of an exponential glide; the agents never collide, their camp is flat.
      const pos = a.root.position;
      const wish = steerTo([pos.x, 0, pos.z], [target.x, 0, target.z], 0.12, { speedRef: NPC_SPEED, decel: 2 }) || [0, 0];
      const step = Math.min(dt, 0.1);
      stepMotion(a.motion, wish, NPC_SPEED * cue.tempo, step, NPC_MOTION, true);
      pos.x += a.motion.vel[0] * step; pos.z += a.motion.vel[1] * step;
      a.speed = Math.hypot(a.motion.vel[0], a.motion.vel[1]);
      // Facing: the motion model's facing while walking, the cue's facing (Iris, the plaza, away) at rest.
      let yaw;
      if (a.speed > 0.25) yaw = a.motion.heading;
      else if (cue.face === 'iris' && ctx.irisPos) yaw = Math.atan2(ctx.irisPos[0] - pos.x, ctx.irisPos[2] - pos.z);
      else yaw = Math.atan2(toPlaza.x, toPlaza.z) + (cue.face === 'away' ? Math.PI : 0);
      if (T.fidget === 'glance' && !ctx.reducedMotion && cue.face !== 'iris' && a.speed <= 0.25) yaw += Math.sin(t * 0.9 + a.phase) > 0.85 ? 0.7 : 0; // Salt keeps glancing sideways
      let dy = yaw - a.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      a.root.rotation.y += dy * (1 - Math.exp(-dt * (a.speed > 0.25 ? 12 : 4)));
      if (a.speed <= 0.25) a.motion.heading = a.root.rotation.y; // so the next walk starts from the real facing
      // Animation: the gait layer takes over the pose by speed; the cue clip owns the rest.
      const used = a.play(cue.clip);
      if (a.mixer) {
        const move = a.gait ? a.gait.update(dt, a.speed) : 0;
        for (const [name, act] of a.actions) { act.weight = 1 - move; act.timeScale = cue.tempo; void name; }
        a.mixer.update(dt);
      }
      this.procedural(a, cue, t, dt, used, ctx.reducedMotion);
      // Mind glyph.
      const name = this.i18n.t('agent.' + a.clan);
      const label = cue.glyph ? this.i18n.t('mind.' + cue.glyph) : (cue.trust != null ? this.i18n.t('mind.trust', { n: cue.trust }) : '');
      a.mind.draw({ name, trust: cue.trust, glyph: cue.glyph, mood: cue.mood, label });
      const s = THREE.MathUtils.clamp((ctx.cameraDist || 20) / 22, 0.8, 3.2);
      a.mind.sprite.scale.set(1.6 * s, 0.8 * s, 1);
      a.mind.sprite.position.y = 2.2 + 0.3 * s;
    }
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
