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

export class IrisAvatar {
  /** @param {object} hero the heroine she wears (asset-catalog.js HEROES); `setHero` swaps it later */
  constructor(hero = heroFromSearch()) {
    this.hero = hero;
    this.irisModel = null;
    this.irisReaction = null;
    this.attaching = null;
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
      this.irisModel = { model, mixer, clips, idleAction, idle2Action, idleLoops: 0, idleK: 0, idleT: 0, faceAction, gait: mixer ? new GaitLayer(mixer, clips) : null, plant: extra.length ? new FootPlant(model) : null, bones: findLookBones(model), look: { yaw: 0, pitch: 0, w: 0 }, lean: { speed: 0, pitch: 0 } };
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
    if (old) { avatarGroup.remove(old.model); if (old.mixer) old.mixer.stopAllAction(); }
    this.irisModel = next.irisModel;
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
    if (m.plant && avatarGroup) m.plant.update(dt, avatarGroup, m.gait ? m.gait.move : 0, reduced);
  }
}
