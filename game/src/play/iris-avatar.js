// Iris herself: the player's avatar group gets agent_iris.glb, her gait blended by the actual ground speed, a
// one-shot reaction layer and the head look-at. One loader and one update for both places she walks: the town
// before the season (boot-world.js attaches her there) and the archipelago (play/agents.js ClanAgents delegates
// here and receives the same instance through startPlay, so the model is never loaded twice).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MODEL_FILES } from 'virtual:model-list';
import { prefetchGltf } from '../render/assets.js';
import { warmModel } from '../render/warmup.js';
import { upgradeAssetMaterials } from '../render/materials.js';
import { flatHair } from '../render/hair-cards.js';
import { fabricSheen } from '../render/fabric.js';
import { ONE_SHOT_CLIPS, REACTION_SECONDS, resolveClip } from './behaviour.js';
import { FADE, GaitLayer, findLookBones, applyLookTo, accelLean } from './gait.js';

export class IrisAvatar {
  constructor() {
    this.irisModel = null;
    this.irisReaction = null;
    this.attaching = null;
  }

  get attached() { return !!this.irisModel; }

  /** Adds her model to the avatar group when the build has it; safe to call again (one attach per avatar). */
  attach(avatarGroup) {
    if (!MODEL_FILES.agent_iris || this.irisModel) return Promise.resolve();
    return (this.attaching ||= this.load(avatarGroup));
  }

  async load(avatarGroup) {
    try {
      const { gltf } = await prefetchGltf('agent_iris'); // started by boot-world.js before the camps (QA-030)
      const model = cloneSkinned(gltf.scene);
      upgradeAssetMaterials('agent_iris', model);
      flatHair(model);   // owner 09.11: flat brown hair, no shading
      fabricSheen(model); // owner 09.11: a soft sheen on the knit
      model.traverse((o) => { if (/_col(?:[._]?\d+)?$/.test(o.name)) o.visible = false; if (o.isMesh) o.castShadow = true; });
      await warmModel(model);
      for (const ch of [...avatarGroup.children]) ch.visible = false;
      avatarGroup.add(model);
      const mixer = gltf.animations.length ? new THREE.AnimationMixer(model) : null;
      const idle = mixer ? resolveClip(gltf.animations, 'idle').clip : null;
      const idleAction = idle ? mixer.clipAction(idle) : null;
      if (idleAction) idleAction.play();
      this.irisModel = { model, mixer, clips: gltf.animations, idleAction, gait: mixer ? new GaitLayer(mixer, gltf.animations) : null, bones: findLookBones(model), look: { yaw: 0, pitch: 0, w: 0 }, lean: { speed: 0, pitch: 0 } };
    } catch (e) { avatarGroup.userData.irisFailed = true; console.warn('[play] Iris model failed', e); }
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
      if (m.idleAction) m.idleAction.weight = (1 - move) * (1 - m.reactW);
      m.mixer.update(dt);
    } else {
      m.model.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.05 : Math.sin(t * 1.6) * 0.01;
      m.model.rotation.z = moving ? Math.sin(t * 9) * 0.03 : 0;
    }
    // Anticipation / follow-through: lean into a start, settle after a stop (pitch of the model inside the avatar group).
    if (m.lean) m.model.rotation.x = accelLean(m.lean, speed, dt, reduced);
    // Look-at: the clan Iris is talking to (world.dialogue), else the look fades out.
    if (m.bones && avatarGroup) applyLookTo(m.bones, m.look, avatarGroup.position, avatarGroup.rotation.y, lookTarget, dt, reduced);
  }
}
