// Iris herself: the player's avatar group gets agent_iris.glb, her gait blended by the actual ground speed, a
// one-shot reaction layer and the head look-at. One loader and one update for both places she walks: the town
// before the season (boot-world.js attaches her there) and the archipelago (play/agents.js ClanAgents delegates
// here and receives the same instance through startPlay, so the model is never loaded twice).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MODEL_FILES } from 'virtual:model-list';
import { prefetchGltf, getModelVariant } from '../render/assets.js';
import { warmModel } from '../render/warmup.js';
import { upgradeAssetMaterials } from '../render/materials.js';
import { tuneHairCards } from '../render/hair-cards.js';
import { fabricSheen } from '../render/fabric.js';
import { ONE_SHOT_CLIPS, REACTION_SECONDS, resolveClip } from './behaviour.js';
import { FADE, GaitLayer, FootPlant, findLookBones, applyLookTo, accelLean } from './gait.js';
import { heroFromSearch } from '../render/asset-catalog.js';
import { DashTrail } from '../render/dash-trail.js';
import { sidecarEnabled, sidecarClips, mergeClips, faceLayerClip, hasFace } from './anim-library.js';

/**
 * The file Iris loads: `agent_iris_m` (1024 textures, lighter mesh) on phones and the low tier when the build
 * ships it, else the full `agent_iris`. boot-world.js prefetches the same name, so she is downloaded once.
 */
export function irisModelFile(files = MODEL_FILES, variant = getModelVariant(), hero = heroFromSearch()) {
  const base = files[hero.model] ? hero.model : 'agent_iris';
  return variant && files[base + variant] ? base + variant : base;
}

/** Cel shading for a heroine whose .glb carries flat colours and an inverted-hull outline (Elise). */
export function toonify(model) {
  const steps = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  steps.minFilter = steps.magFilter = THREE.NearestFilter; steps.needsUpdate = true;
  model.traverse((o) => {
    if (!o.isMesh) return;
    const outline = /outline/.test(o.material.name);
    o.material = outline
      ? new THREE.MeshBasicMaterial({ name: o.material.name, color: 0x06060a })
      : new THREE.MeshToonMaterial({ name: o.material.name, map: o.material.map, gradientMap: steps, side: o.material.side });
    o.userData.outline = outline;
  });
}

const emit = (type, detail) => { if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') window.dispatchEvent(new CustomEvent(type, { detail })); };
const smoothstep01 = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

export class IrisAvatar {
  /** @param {object} hero the heroine she wears (asset-catalog.js HEROES); `setHero` swaps it later */
  constructor(hero = heroFromSearch()) {
    this.hero = hero;
    this.irisModel = null;
    this.irisReaction = null;
    this.attaching = null;
    /** @type {(() => boolean)|null} while a held action (strike_charge) may stay: false ends it (play/mobs.js `charging`) */
    this.holdWhile = null;
  }

  get attached() { return !!this.irisModel; }

  /** Adds her model to the avatar group when the build has it; safe to call again (one attach per avatar). */
  attach(avatarGroup) {
    if (!MODEL_FILES[irisModelFile(MODEL_FILES, getModelVariant(), this.hero)] || this.irisModel) return Promise.resolve();
    return (this.attaching ||= this.load(avatarGroup));
  }

  async load(avatarGroup) {
    try {
      const hero = this.hero;
      const { gltf } = await prefetchGltf(irisModelFile(MODEL_FILES, getModelVariant(), hero)); // started by boot-world.js before the camps (QA-030)
      const model = cloneSkinned(gltf.scene);
      const toon = hero.toon && MODEL_FILES[hero.model];
      if (toon) toonify(model); else upgradeAssetMaterials('agent_iris', model);
      // 11.11 (target sheet): shaded hair. The strand atlas is lit like any other material; the locks stay
      // alpha-tested with alpha-to-coverage. (09.11 it was drawn as one unlit brown: a cap with stepped edges.)
      if (!toon) { tuneHairCards(model); fabricSheen(model); } // owner 09.11: a soft sheen on the knit
      model.traverse((o) => { if (/_col(?:[._]?\d+)?$/.test(o.name)) o.visible = false; if (o.isMesh) o.castShadow = !o.userData.outline; });
      await warmModel(model);
      if (hero !== this.hero) return;          // the player switched heroine while this one was loading
      for (const ch of [...avatarGroup.children]) ch.visible = false;
      avatarGroup.add(model);
      // Motion-capture clips from the side-car file replace the model's own clips of the same name (anim-library.js).
      const extra = sidecarEnabled() ? await sidecarClips(toon ? hero.model : 'agent_iris') : [];
      const clips = mergeClips(gltf.animations, extra);
      const mixer = clips.length ? new THREE.AnimationMixer(model) : null;
      const idle = mixer ? resolveClip(clips, 'idle').clip : null;
      const idleAction = idle ? mixer.clipAction(idle) : null;
      if (idleAction) idleAction.play();
      // A second idle (weight on the other leg) takes every third loop; both loops start from the same pose.
      const idle2 = extra.find((c) => c.name === 'idle2' && idle && Math.abs(c.duration - idle.duration) < 0.05);
      const idle2Action = idle2 && idleAction ? mixer.clipAction(idle2) : null;
      if (idle2Action) { idle2Action.play(); idle2Action.weight = 0; }
      const face = mixer && extra.length ? faceLayerClip(gltf.animations) : null;   // blinks and gaze under the body clips
      const faceAction = face ? mixer.clipAction(face).play() : null;
      this.irisModel = { model, mixer, clips, idleAction, idle2Action, idleLoops: 0, idleK: 0, idleT: 0, faceAction, gait: mixer ? Object.assign(new GaitLayer(mixer, clips), { onFoot: (foot, running) => emit('ftf:foot', { foot, running }) }) : null, plant: extra.length ? new FootPlant(model) : null, bones: findLookBones(model), look: { yaw: 0, pitch: 0, w: 0 }, lean: { speed: 0, pitch: 0 } };
    } catch (e) { avatarGroup.userData.irisFailed = true; this.attaching = null; console.warn('[play] Iris model failed', e); } // attach() may try again
  }

  /**
   * Swaps the heroine she wears (the Day 1 skin: Iris <-> Elise), each with her own model, clips and shading. The
   * current model stays on screen until the next one is loaded and warmed.
   */
  async setHero(avatarGroup, hero) {
    if (!hero || hero.id === this.hero.id || !MODEL_FILES[irisModelFile(MODEL_FILES, getModelVariant(), hero)]) return;
    const old = this.irisModel, oldHero = this.hero;
    this.hero = hero; this.irisReaction = null;
    const next = new IrisAvatar(hero);
    await next.load(avatarGroup);              // hides what the group shows once the new model is ready
    if (this.hero !== hero) { if (next.irisModel) avatarGroup.remove(next.irisModel.model); return; }   // switched again meanwhile
    if (!next.irisModel) { this.hero = oldHero; if (old) old.model.visible = true; return; }          // download failed: keep her
    if (old) { avatarGroup.remove(old.model); if (old.mixer) old.mixer.stopAllAction(); if (old.trail) old.trail.dispose(); }
    this.irisModel = next.irisModel;
  }

  /**
   * A combat move outside the walls (play/mobs.js): `strike1`..`strike3`, `dash`, and the super strike: `strike_charge`
   * (held on its last frame until `combat('strike_super')` or `endAction()`). It plays once over everything else,
   * `opts.skid`: when she is running, the 0.2 s heel-dig stop (`skid`) is blended over its start (use it for a
   * move that roots her, as a cast does),
   * even while she moves, and hands back to the gait and idle as it ends. Returns false when the clip is missing.
   */
  combat(name, opts = {}) {
    const m = this.irisModel;
    const c = m && m.clips.find((x) => x.name === name);
    if (!c) return false;
    const u0 = c.userData || {};
    // A held wind-up (strike_charge) does not cut a strike that is still swinging, and a quick tap never shows it:
    // it waits until the press is 0.12 s old and the move in flight has passed its impact (update() starts it).
    if (u0.hold && !opts.now) { m.pendingHold = { name, t: 0 }; return true; }
    m.pendingHold = null;
    const prev = m.combat ? m.combat.name : null;
    if (m.combat) m.combat.action.fadeOut(0.06);
    const a = m.mixer.clipAction(c); a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.setEffectiveWeight(1); a.play();
    // sound and effect sync: the clip's moments (art/anim/iris_actions.py extras), sent as window events while it plays
    const u = c.userData || {};
    m.combat = { action: a, t: 0, dur: c.duration, name, impact: u.release_s ?? u.impact_s ?? null, step: u.step_s ?? null, foot: u.step_foot || 'L', hold: !!u.hold };
    // a step taken after the hit cuts the settle short (0.14 s back to the gait); a held pose eases in
    if (name !== 'dash' && !u.hold) m.combat.cancelAfter = (m.combat.impact ?? 0) + 0.14;
    if (name === 'dash') m.combat.cancelAfter = 0.3;
    if (u.hold) m.combat.fadeIn = 0.14;
    if (u.from && prev === u.from) m.combat.fadeIn = 0.03; else if (u.from) m.combat.fadeIn = 0.07;     // the release of a held pose starts in that pose: no blend through the idle
    emit('ftf:iris-action', { clip: name, phase: 'start', impact: m.combat.impact });
    // out of a run (a cast roots her at once): the heel-dig stop is blended over the first 0.2 s of the action clip
    const sk = (opts.skid ?? (name !== 'dash' && !u.from)) && (m.speedNow || 0) > 2.2 && m.clips.find((x) => x.name === 'skid');
    if (m.skid) { m.skid.action.stop(); m.skid = null; }
    if (sk) {
      const sa = m.mixer.clipAction(sk); sa.reset(); sa.setLoop(THREE.LoopOnce, 1); sa.clampWhenFinished = true; sa.setEffectiveWeight(0); sa.play();
      m.skid = { action: sa, dur: sk.duration };
      emit('ftf:foot', { foot: 'L', running: true, action: 'skid' });
    }
    if (name === 'dash') m.dashTrail = true;                  // the trail starts on the next update (it needs the scene)
    return true;
  }

  /** Lets go of a held action clip (`strike_charge` put away without the super strike): it fades out to the idle. */
  endAction() {
    const m = this.irisModel; if (!m) return;
    m.pendingHold = null;
    const k = m.combat; if (k && k.hold && !k.ending) { k.ending = true; k.fadeOut = 0.2; k.dur = k.t + 0.2; }
  }

  /**
   * A skill cast (scenes/town-casting.js): `cast_lance`, `cast_snare`. A slow wind-up, the release frame, an overshoot
   * and a settle, played over everything else; she stands still for it (the caller holds her walk until shortly after
   * the release), and a step after that cuts the settle short. Returns the clip's timing in seconds, or null when the
   * clip is missing (`?anim=v1`, `?anim=classic`): `release` is when the cast leaves her hand.
   */
  cast(name) {
    const m = this.irisModel;
    const c = m && m.clips.find((x) => x.name === name);
    if (!c || !this.combat(name, { skid: true })) return null;
    const release = (c.userData && c.userData.release_s) || 0;
    Object.assign(m.combat, { fadeIn: 0.08, fadeOut: 0.22, cancelAfter: release + 0.24 });
    return { release, duration: c.duration };
  }

  /** A short one-shot on Iris (e.g. `understand`: the wink when she has understood a Guest's sign). */
  react(clip, now = 0) { this.irisReaction = { clip, until: now + (REACTION_SECONDS[clip] || 3) }; }

  /**
   * Iris's gait: idle / walk / run blended by the actual ground speed (procedural bob when no clips).
   * @param {number[]|null} lookTarget world point she looks at (the clan she talks to), null fades the look out
   */
  update(dt, moving, avatarGroup, t, speed = 0, running = false, reduced = false, lookTarget = null) {
    const m = this.irisModel;
    if (!m) return;
    m.speedNow = speed;
    let actionW = 0;                                   // weight of a full-body action clip (a cast, a strike, the dash)
    void running; // the blend follows the speed itself: the run clip appears above the walk speed
    if (moving) this.irisReaction = null;            // walking away cancels the reaction
    if (m.mixer) {
      const move = m.gait ? m.gait.update(dt, speed) : 0;
      // a reaction (one-shot) takes the idle's weight while she stands, then hands it back
      const want = this.irisReaction && this.irisReaction.until > t ? this.irisReaction.clip : null;
      const r = want ? resolveClip(m.clips, want) : null;
      const rc = r && r.clip && r.name !== 'idle' ? r.clip : null;
      if (rc && (!m.react || m.react.getClip() !== rc)) {
        if (m.react) m.react.fadeOut(FADE);
        m.react = m.mixer.clipAction(rc);
        const once = ONE_SHOT_CLIPS.includes(r.name);
        m.react.reset(); m.react.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); m.react.clampWhenFinished = once;
        m.react.play();
      }
      if (!rc && this.irisReaction && this.irisReaction.until <= t) this.irisReaction = null;
      m.reactW = (m.reactW || 0) + ((rc ? 1 : 0) - (m.reactW || 0)) * Math.min(1, dt / FADE);
      if (m.react) {
        m.react.setEffectiveWeight(m.reactW * (1 - move));
        if (!rc && m.reactW < 0.01) { m.react.stop(); m.react = null; }
      }
      if (m.idleAction) {
        const w = (1 - move) * (1 - m.reactW);
        if (m.idle2Action) {
          if (m.idleAction.time < m.idleT) m.idleLoops++;                 // the loop came round
          m.idleT = m.idleAction.time;
          if (move > 0.5) m.idleLoops = 0;                                // after a walk she starts with the first idle
          m.idleK += ((m.idleLoops % 3 === 2 ? 1 : 0) - m.idleK) * Math.min(1, dt / 0.5);
          m.idle2Action.time = m.idleAction.time;                         // in step, so the hand-over is seamless
          m.idle2Action.weight = w * m.idleK;
        }
        m.idleAction.weight = w * (1 - (m.idle2Action ? m.idleK : 0));
      }
      // a reaction with its own face (the wink) takes the face over from the always-on layer
      if (m.faceAction) m.faceAction.weight = m.react && hasFace(m.react.getClip()) ? 1 - m.reactW * (1 - move) : 1;
      // A held pose lives only while its owner says the button is still down (`holdWhile`, set by the caller): a
      // press whose strike was refused must never leave her coiled.
      const held = (m.pendingHold || (m.combat && m.combat.hold && !m.combat.ending)) && this.holdWhile && !this.holdWhile();
      if (held) this.endAction();
      if (m.pendingHold) {
        const ph = m.pendingHold, k = m.combat; ph.t += dt;
        const free = !k || k.hold || k.t >= Math.min(k.dur - 0.12, (k.impact ?? 0) + 0.16);
        if (ph.t >= 0.12 && free) this.combat(ph.name, { now: true, skid: false });
      }
      if (m.combat && m.combat.hold && !m.combat.ending && (m.combat.heldFor = (m.combat.heldFor || 0) + dt) > 8) this.endAction(); // a last guard
      if (m.combat) {                                    // a combat move over the gait, idle and reaction
        const k = m.combat, t0 = k.t; k.t += dt;
        if (k.impact != null && t0 < k.impact && k.t >= k.impact) emit('ftf:iris-action', { clip: k.name, phase: 'impact', impact: 0 });
        if (k.step != null && t0 < k.step && k.t >= k.step) emit('ftf:foot', { foot: k.foot, running: true, action: k.name });
        if (k.cancelAfter != null && k.t > k.cancelAfter && speed > 0.4) { k.dur = Math.min(k.dur, k.t + 0.16); k.fadeOut = 0.16; k.cancelAfter = null; } // she walks out of the settle
        if (k.hold && !k.ending) k.t = Math.min(k.t, k.dur - (k.fadeOut || 0.1) - 0.01);   // a held pose (strike_charge) waits on its last frame
        const w = smoothstep01(k.t / (k.fadeIn || 0.05)) * smoothstep01((k.dur - k.t) / (k.fadeOut || 0.1));
        actionW = w;
        const sk = m.skid ? smoothstep01(k.t / m.skid.dur) : 1;       // 0 = all skid, 1 = all action clip
        k.action.setEffectiveWeight(w * (0.25 + 0.75 * sk));
        if (m.skid) { m.skid.action.setEffectiveWeight(w * 0.75 * (1 - sk)); if (k.t >= m.skid.dur) { m.skid.action.stop(); m.skid = null; } }
        const keep = 1 - w;
        if (m.gait) { if (m.gait.walk) m.gait.walk.weight *= keep; if (m.gait.run) m.gait.run.weight *= keep; }
        if (m.idleAction) m.idleAction.weight *= keep;
        if (m.idle2Action) m.idle2Action.weight *= keep;
        if (m.react) m.react.setEffectiveWeight(m.react.getEffectiveWeight() * keep);
        if (k.t >= k.dur) { k.action.stop(); m.combat = null; }
      }
      m.mixer.update(dt);
    } else {
      m.model.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.05 : Math.sin(t * 1.6) * 0.01;
      m.model.rotation.z = moving ? Math.sin(t * 9) * 0.03 : 0;
    }
    // Anticipation / follow-through: lean into a start, settle after a stop (pitch of the model inside the avatar group).
    if (m.lean) m.model.rotation.x = accelLean(m.lean, speed, dt, reduced);
    // Look-at: the clan Iris is talking to (world.dialogue), else the look fades out.
    if (m.bones && avatarGroup) applyLookTo(m.bones, m.look, avatarGroup.position, avatarGroup.rotation.y, lookTarget, dt, reduced);
    // Planted feet while she stands: a pivot on the spot and the end of a stop become short steps (gait.js).
    if (m.plant && avatarGroup) m.plant.update(dt, avatarGroup, m.gait ? m.gait.move : 0, reduced, actionW);
    // The dash leaves afterimages and a ribbon (render/dash-trail.js); built on her first dash, never under reduced motion.
    if (m.dashTrail && avatarGroup && avatarGroup.parent) {
      m.dashTrail = false;
      if (!reduced) { m.trail ||= new DashTrail(avatarGroup.parent, m.model, { phone: getModelVariant() === '_m' }); m.trail.start(); }
    }
    if (m.trail && m.trail.active && avatarGroup) m.trail.update(dt, avatarGroup, reduced);
  }
}
