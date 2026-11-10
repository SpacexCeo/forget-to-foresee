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
import { warmModel } from '../render/warmup.js';
import { upgradeAssetMaterials } from '../render/materials.js';
import { CAMPS, PLATEAU_RADIUS } from '../scenes/layout.js';
import { CLAN_ASSET, CLAN_ORDER, ONE_SHOT_CLIPS, TEMPERAMENT, clanCue, resolveClip } from './behaviour.js';
import { NAMEPLATE, platePlacement, plateBox, boxesIntersect } from './nameplate.js';
import { PLAZA_RADIUS } from '../scenes/layout.js';
import { NPC_MOTION, createMotion, stepMotion, damp, avoidWish } from '../physics/motion.js';
import { FADE, GaitLayer, findLookBones, applyLookTo, accelLean } from './gait.js';
import { IrisAvatar } from './iris-avatar.js';

export { GaitLayer };
import { steerTo } from '../physics/character.js';
import { planRoute, walkGraph } from '../net/world-map.js';
import { ANCHOR_ZONES } from '../scenes/layout.js';
import { NpcDirector, seededRng } from './behaviour.js';

const LOAD_RADIUS = 75;      // meters from the camera focus at which an agent model is requested
const NPC_SPEED = 1.1;       // m/s, the agents' amble about their camps
const NPC_WALK = 1.55;       // m/s, a purposeful walk to the Scroll, a camp or the pedestal (docs/npcs.md)
const LOOK_NEAR = 7;         // m: Iris this close gets looked at
const GLYPH = { offer: '◆', broken: '✕', isolated: '!', warm: '♥', cold: '·', given: '✓', dark: '○' };
const _head = new THREE.Vector3(), _cam = new THREE.Vector3();
// HUD boxes a nameplate may never sit under (checked against a cache refreshed every HUD_RECT_MS).
const HUD_SEL = '.wh-trial, .wh-quest, .wh-toast, .wh-signs, .wh-log__tabs, .wh-log__body, .wh-prompt, .wh-dialogue__line, .wh-dialogue__reply, .wh-hotbar, .wh-topbar, .wh-quest--mobile, .wh-trial--mobile, .wh-tiles, .wh-prompt--mobile, .wh-dialogue--mobile, .wh-sheet, .pl-panel, .pl-context, .pl-help, .pl-info, .pl-badge, .hub-dock, .hub-read, .hub-card, .hub-status, .ftf-run-toggle, .ftf-scene-cue';
const HUD_RECT_MS = 250;
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
.pl-plates { position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
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
    this.motion = createMotion(homeYaw); // velocity + facing, stepped by the shared motion model
    this.gait = null;
    this.cue = null;
    this.phase = seededRng('phase:' + clan)() * 10; // seeded: the same island breathes the same way every run
    this.bones = { head: null, neck: null, eyes: [] };
    this.look = { yaw: 0, pitch: 0, w: 0 };   // smoothed head look-at (radians, weight)
    this.route = null; this.routeKey = ''; this.routeIdx = 0;
    this.shift = 0;                           // weight-shift roll (radians), eased
    this.lifeGesture = null;                  // idle-life gesture in progress {clip, until}
    this.directive = null;
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
      await warmModel(model); // textures and shaders reach the GPU before the stand-in is swapped (docs/smoothness.md)
      this.body.remove(this.stand);
      this.body.add(model);
      this.model = model;
      this.bones = findLookBones(model);
      this.clips = gltf.animations || [];
      if (this.clips.length) { this.mixer = new THREE.AnimationMixer(model); this.gait = new GaitLayer(this.mixer, this.clips); }
      this.state = 'loaded';
      this.currentClip = null;
    } catch (e) {
      this.state = 'failed';
      console.warn('[play] agent model failed', this.asset, e);
    }
  }

  /** Head look-at for this agent (see `applyLookTo`). */
  applyLook(dt, target, reduced = false) { applyLookTo(this.bones, this.look, this.root.position, this.root.rotation.y, target, dt, reduced); }

  /** Cross-fades to a contract clip (with the fallback chain). Returns the clip name used or null. */
  play(name) {
    if (!this.mixer) return null;
    const { clip, name: used } = resolveClip(this.clips, name);
    if (!clip) return null;
    if (this.currentClip === clip.name) return used;
    let act = this.actions.get(clip.name);
    if (!act) { act = this.mixer.clipAction(clip); this.actions.set(clip.name, act); }
    const once = ONE_SHOT_CLIPS.includes(used);
    act.reset(); act.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); act.clampWhenFinished = once;
    act.fadeIn(FADE).play();
    const prev = this.currentClip && this.actions.get(this.currentClip);
    if (prev && prev !== act) prev.fadeOut(FADE);
    this.currentClip = clip.name;
    return used;
  }
}

export class ClanAgents {
  /** @param {{scene: THREE.Scene, i18n: object, iris?: IrisAvatar}} o iris: the avatar the town already attached (boot-world.js) */
  constructor({ scene, i18n, iris = null }) {
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
    this.iris = iris || new IrisAvatar();
    this.irisLook = [0, 0, 0];
    this.director = null;   // created with the season's seed on the first observation (deterministic life)
    this.reducedMotion = false;
    this.lastObs = null;
    /** Optional speech hook for conversation beats: ({speakerId, key, args}) → the dialogue strip (worldHud.say). */
    this.onSay = null;
  }

  /** A public room event (optional fast path for the director; the observation diff covers the same ground). */
  event(ev, now = 0) { this.ensureDirector(null); this.director.onEvent(ev, now); }

  ensureDirector(obs) {
    if (this.director) return this.director;
    const seed = (obs && obs.season && (obs.season.seedCommitment || obs.season.seasonId)) || 'ftf';
    this.director = new NpcDirector({ seed: String(seed) });
    return this.director;
  }

  /** Waypoints [[x, z], ...] for a director move: a world-map place, 'home', 'gather' (plaza ring) or 'edge'. */
  routeFor(a, move) {
    const pos = [a.root.position.x, 0, a.root.position.z];
    const camp = CAMPS.find((c) => c.id === CLAN_ASSET[a.clan]);
    if (move === 'edge') { const t = a.home.clone().addScaledVector(new THREE.Vector3(-a.home.x, 0, -a.home.z).normalize(), 2.6); return [[t.x, t.z]]; }
    if (move === 'gather') {
      const ring = walkGraph().nodes.get('ring:' + camp.angle);
      const onPlaza = Math.hypot(pos[0], pos[2]) < PLAZA_RADIUS - 0.5;
      if (onPlaza || !ring) return ring ? [[ring[0], ring[2]]] : [[0, 4.2]];
      const pts = planRoute(pos, 'scroll') || [];
      const i = pts.findIndex(([x, z]) => Math.hypot(x - ring[0], z - ring[2]) < 0.3);
      return i >= 0 ? pts.slice(0, i + 1) : [...pts, [ring[0], ring[2]]];
    }
    const place = move === 'home' ? 'camp:' + a.clan : move;
    return planRoute(pos, place);
  }

  /** Iris herself: the player's avatar group gets agent_iris.glb when it is available (iris-avatar.js). */
  attachIris(avatarGroup) { return this.iris.attach(avatarGroup); }

  /** A short one-shot on Iris (e.g. `understand`: the wink when she has understood a Guest's sign). */
  irisReact(clip, now = 0) { this.iris.react(clip, now); }

  /** Iris's gait and her look at the clan she is talking to (world.dialogue). */
  updateIris(dt, moving, avatarGroup, t, speed = 0, running = false, reduced = this.reducedMotion) {
    const partner = this.talking && t < this.talkUntil ? this.agents.get(this.talking) : null;
    if (partner) { const p = partner.root.position; this.irisLook[0] = p.x; this.irisLook[1] = p.y + 1.55; this.irisLook[2] = p.z; }
    this.iris.update(dt, moving, avatarGroup, t, speed, running, reduced, partner ? this.irisLook : null);
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
    this.reducedMotion = !!ctx.reducedMotion;
    const director = this.ensureDirector(obs);
    if (obs && obs !== this.lastObs) { this.lastObs = obs; director.observe(obs, t); }
    const positions = new Map([...this.agents.values()].map((a) => [a.clan, [a.root.position.x, a.root.position.z]]));
    const irisXZ = ctx.irisPos ? [ctx.irisPos[0], ctx.irisPos[2]] : null;
    for (const a of this.agents.values()) {
      const irisNear = ctx.irisPos && Math.hypot(ctx.irisPos[0] - a.home.x, ctx.irisPos[2] - a.home.z) < PLATEAU_RADIUS + 1;
      const talking = this.talking === a.clan && t < this.talkUntil;
      const cue = obs ? clanCue(a.clan, obs, { reaction: this.reactions[a.clan], now: t, talking, irisNear }) : { clip: 'idle', approach: 0, face: 'plaza', tempo: 1, glyph: null, trust: null, mood: 'neutral', state: 'rest' };
      a.cue = cue;
      const T = TEMPERAMENT[a.clan];
      // An isolated or broken clan keeps to itself: no errands, no meetings.
      if (cue.state === 'isolated' || cue.state === 'broken') director.clear(a.clan);
      const dir = director.directive(a.clan, t);
      a.directive = dir;
      const pos = a.root.position;
      const toPlaza = new THREE.Vector3(-a.home.x, 0, -a.home.z).normalize();
      const others = [...positions.entries()].filter(([c]) => c !== a.clan).map(([, p]) => p);
      if (irisXZ) others.push(irisXZ);
      // Sub-step long frames so a slow device moves the agents the same distance per second.
      const subSteps = Math.max(1, Math.ceil(dt / 0.05)), step = dt / subSteps;
      let wish = [0, 0], maxSpeed = NPC_SPEED * cue.tempo;
      if (dir.move) {
        // Purposeful walk along the island's walk graph (the same graph the room validates Iris's walks on).
        const key = dir.move + '|' + (dir.partner || '');
        if (a.routeKey !== key) { a.route = this.routeFor(a, dir.move); a.routeKey = key; a.routeIdx = 0; }
        if (!a.route || !a.route.length) { director.arrived(a.clan, t); a.route = null; a.routeKey = ''; }
        else {
          while (a.routeIdx < a.route.length) {
            const last = a.routeIdx === a.route.length - 1;
            const wp = a.route[a.routeIdx];
            const w = steerTo([pos.x, 0, pos.z], [wp[0], 0, wp[1]], last ? 0.35 : 0.7, { speedRef: NPC_WALK, decel: 2.5 });
            if (w) { const l = Math.hypot(w[0], w[1]); wish = last || !l ? w : [w[0] / l, w[1] / l]; break; }
            a.routeIdx++;
          }
          // A meeting partner reached on the way counts as arrival too.
          const partnerXZ = dir.partner ? positions.get(dir.partner) : null;
          const metPartner = partnerXZ && dir.move !== 'home' && Math.hypot(partnerXZ[0] - pos.x, partnerXZ[1] - pos.z) < 2.4;
          if (a.routeIdx >= a.route.length || metPartner) { director.arrived(a.clan, t); a.route = null; a.routeKey = ''; wish = [0, 0]; }
          maxSpeed = NPC_WALK;
        }
      } else {
        // At rest: the cue's placement on the plateau (toward the bridge when trusting, back when not), with Ash pacing.
        const target = a.home.clone().addScaledVector(toPlaza, cue.approach + 0.6);
        if (T.fidget === 'pace' && !ctx.reducedMotion && (cue.state === 'rest' || cue.state === 'isolated' || cue.state === 'cold')) {
          const side = new THREE.Vector3(toPlaza.z, 0, -toPlaza.x);
          target.addScaledVector(side, Math.sin(t * 0.35 * cue.tempo + a.phase) * 1.4);
        }
        if (dir.act || dir.face) target.copy(pos); // acting or listening: stand still
        wish = steerTo([pos.x, 0, pos.z], [target.x, 0, target.z], 0.12, { speedRef: NPC_SPEED, decel: 2 }) || [0, 0];
        a.route = null; a.routeKey = '';
      }
      // Local avoidance of the other agents and Iris, then the shared motion model.
      if (wish[0] || wish[1]) wish = avoidWish([pos.x, pos.z], a.motion.heading, wish, others);
      for (let k = 0; k < subSteps; k++) { stepMotion(a.motion, wish, maxSpeed, step, NPC_MOTION, true); pos.x += a.motion.vel[0] * step; pos.z += a.motion.vel[1] * step; }
      a.speed = Math.hypot(a.motion.vel[0], a.motion.vel[1]);
      positions.set(a.clan, [pos.x, pos.z]);
      // Facing: the motion model's facing while walking; the partner, the Scroll, Iris or the cue's facing at rest.
      let yaw;
      const partnerPos = dir.partner ? positions.get(dir.partner) : null;
      if (a.speed > 0.25) yaw = a.motion.heading;
      else if (dir.face === 'partner' && partnerPos) yaw = Math.atan2(partnerPos[0] - pos.x, partnerPos[1] - pos.z);
      else if (dir.face === 'scroll') yaw = Math.atan2(-pos.x, -pos.z);
      else if (cue.face === 'iris' && ctx.irisPos) yaw = Math.atan2(ctx.irisPos[0] - pos.x, ctx.irisPos[2] - pos.z);
      else yaw = Math.atan2(toPlaza.x, toPlaza.z) + (cue.face === 'away' ? Math.PI : 0);
      if (T.fidget === 'glance' && !ctx.reducedMotion && cue.face !== 'iris' && a.speed <= 0.25 && !dir.face) yaw += Math.sin(t * 0.9 + a.phase) > 0.85 ? 0.7 : 0; // Salt keeps glancing sideways
      let dy = yaw - a.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      a.root.rotation.y += dy * (1 - Math.exp(-dt * (a.speed > 0.25 ? 12 : 4)));
      if (a.speed <= 0.25) a.motion.heading = a.root.rotation.y; // so the next walk starts from the real facing
      // Idle life: glances, weight shifts and short gestures, seeded per clan and staggered by the director.
      const life = dir.idle || { kind: 'none' };
      if (life.kind === 'gesture' && life.startedAt === t) director.gestureStarted(t);
      const lifeClip = life.kind === 'gesture' && cue.state === 'rest' && a.speed <= 0.25 ? life.clip : null;
      const shiftTarget = life.kind === 'shift' && !ctx.reducedMotion ? life.side * 0.035 : 0;
      a.shift = damp(a.shift, shiftTarget, 2.5, dt);
      // Speech beat (meeting, contribution): through the dialogue strip when the play layer wires `onSay`.
      if (dir.say && this.onSay) { try { this.onSay(dir.say); } catch (e) { console.warn('[play] npc say failed', e); } }
      // Animation: the director's act, an idle-life gesture, or the cue clip; the gait layer owns the walk.
      const want = dir.act && dir.act !== 'idle' ? dir.act : dir.act === 'idle' ? 'idle' : lifeClip || cue.clip;
      const used = a.play(want);
      if (a.mixer) {
        const move = a.gait ? a.gait.update(dt, a.speed) : 0;
        for (const [name, act] of a.actions) { act.weight = 1 - move; act.timeScale = cue.tempo; void name; }
        a.mixer.update(dt);
      }
      this.procedural(a, cue, t, dt, used, ctx.reducedMotion);
      // Look-at: the conversation partner, Iris when near or talking, the Shell of a reveal, or an idle glance.
      let lookTarget = null;
      if (partnerPos && (dir.face === 'partner' || dir.move)) lookTarget = [partnerPos[0], 1.55, partnerPos[1]];
      else if (ctx.irisPos && (talking || (irisNear && cue.face !== 'away') || Math.hypot(ctx.irisPos[0] - pos.x, ctx.irisPos[2] - pos.z) < LOOK_NEAR)) lookTarget = [ctx.irisPos[0], ctx.irisPos[1] + 1.55, ctx.irisPos[2]];
      else if (dir.look && dir.look.startsWith('sky:')) { const z = ANCHOR_ZONES[Number(dir.look.slice(4)) - 1]; if (z) lookTarget = z.shellPosition.slice(); }
      else if (life.kind === 'glance') { const ry = a.root.rotation.y + life.yaw; lookTarget = [pos.x + Math.sin(ry) * 5, pos.y + 1.55 + Math.sin(life.pitch) * 5, pos.z + Math.cos(ry) * 5]; }
      if (a.model) a.applyLook(dt, lookTarget, ctx.reducedMotion);
      // Nameplate: screen-space DOM over the head (nameplate.js), proximity only, never under a HUD box.
      this.placePlate(a, cue, ctx);
    }
  }

  /**
   * Projects the head point and places the agent's nameplate; needs ctx.camera and ctx.uiRoot (game.js).
   * A plate exists only while Iris stands near the agent (nameplate.js NAMEPLATE.show) and never under a HUD box.
   */
  placePlate(a, cue, ctx) {
    if (!ctx.camera || !ctx.uiRoot) return;
    if (!this.plates) this.plates = plateLayer(ctx.uiRoot);
    if (!a.plate) a.plate = new Nameplate(this.plates);
    const irisDistance = ctx.irisPos ? Math.hypot(ctx.irisPos[0] - a.root.position.x, ctx.irisPos[2] - a.root.position.z) : Infinity;
    if (a.state === 'absent' || irisDistance >= NAMEPLATE.show) { a.plate.place(null); return; }
    const name = this.i18n.t('agent.' + a.clan);
    const label = cue.glyph ? this.i18n.t('mind.' + cue.glyph) : (cue.trust != null ? this.i18n.t('mind.trust', { n: cue.trust }) : '');
    a.plate.draw({ name, trust: cue.trust, glyph: cue.glyph, mood: cue.mood, label });
    const head = _head.set(a.root.position.x, a.root.position.y + NAMEPLATE.headY, a.root.position.z);
    const camPos = ctx.camera.getWorldPosition(_cam);
    const distance = head.distanceTo(camPos);
    const ndc = head.project(ctx.camera);
    const layer = this.plates;
    let at = platePlacement({ ndc, distance, irisDistance, width: layer.clientWidth, height: layer.clientHeight });
    if (at) {
      const box = plateBox(at, a.plate.el.offsetWidth || 100, a.plate.el.offsetHeight || 26);
      if (this.hudRects(ctx).some((r) => boxesIntersect(box, r))) at = null;
    }
    a.plate.place(at);
  }

  /** Visible HUD boxes (viewport px), refreshed every HUD_RECT_MS; plates hide rather than sit under them. */
  hudRects(ctx) {
    const now = performance.now();
    if (this._hudRects && now - this._hudRectsAt < HUD_RECT_MS) return this._hudRects;
    const doc = ctx.uiRoot.ownerDocument;
    const out = [];
    for (const el of doc.querySelectorAll(HUD_SEL)) {
      const cs = getComputedStyle(el);
      if (el.hidden || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) out.push([r.left, r.top, r.right, r.bottom]);
    }
    this._hudRects = out; this._hudRectsAt = now;
    return out;
  }

  /** Procedural layer: always on for the stand-in and for missing clips; subtle on top of clips. */
  procedural(a, cue, t, dt, usedClip, reduced) {
    const b = a.body;
    const full = !usedClip; // no clip available: the procedural layer carries the whole pose
    const amp = reduced ? 0.2 : 1;
    const T = TEMPERAMENT[a.clan];
    if (!a.lean) a.lean = { speed: 0, pitch: 0 };
    let lean = T.lean + accelLean(a.lean, a.speed, dt, reduced, 0.025, 0.08), bob = 0, sway = 0, roll = 0;
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
    b.rotation.z = roll * amp + a.shift; // idle-life weight shift (eased in the update loop)
  }

  /** Positions for VFX/audio cues and the chronicle (head height). */
  positionOf(clan) {
    const a = this.agents.get(clan);
    return a ? a.root.position.clone().add(new THREE.Vector3(0, 1.4, 0)) : null;
  }

  stats() { return [...this.agents.values()].map((a) => ({ clan: a.clan, state: a.state, clips: a.clips.map((c) => c.name), clip: a.currentClip, cue: a.cue && a.cue.state, move: a.directive && a.directive.move, act: a.directive && a.directive.act, look: +a.look.w.toFixed(2), bones: { head: !!a.bones.head, neck: !!a.bones.neck, eyes: a.bones.eyes.length } })); }
}
