// The Hollow Tide's spawn on the arena: one skinned clone of `shoal_tideling` per add of the rules, each with its
// own mixer; the clip comes from the pure game/shoal-add-anim.js. An add faces the heroine it walks at. A killed add
// plays its death and sinks before it is removed. Until the model has loaded (or when the file is not shipped) an
// add is the old icosahedron, so the fight never waits for art.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { hasModelFile, fetchGltf, getModelVariant } from '../render/assets.js';
import { ADD_CLIPS, freshAddAnim, addAnimStep, addDeathStep, addFade } from '../game/shoal-add-anim.js';

export const ADD_MODEL = 'shoal_tideling';

/** @param {THREE.Object3D} root the arena's root */
export function createAddsView(root) {
  let proto = null, clips = null;
  const standGeo = new THREE.IcosahedronGeometry(0.7, 0);
  const standMat = new THREE.MeshStandardMaterial({ color: 0x6a8aa8, emissive: 0x1a3a6a, emissiveIntensity: 0.6, roughness: 0.4 });
  if (hasModelFile(ADD_MODEL)) {
    const file = hasModelFile(ADD_MODEL + getModelVariant()) ? ADD_MODEL + getModelVariant() : ADD_MODEL; // phones and the low tier: `_m`
    fetchGltf(file).then(({ gltf }) => {
      gltf.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
      proto = gltf.scene; clips = gltf.animations;
    }).catch(() => { /* the stand-in stays */ });
  }
  const live = new Map(), ghosts = [];

  function make() {
    if (!proto) return { node: new THREE.Mesh(standGeo, standMat), model: false };
    const node = cloneSkinned(proto), mixer = new THREE.AnimationMixer(node), actions = {};
    for (const c of clips) { const a = mixer.clipAction(c); a.setEffectiveWeight(0); a.play(); a.paused = true; actions[c.name] = a; }
    return { node, mixer, actions, model: true, w: {} };
  }
  function pose(v, dt) {
    addFade(v.w, v.anim.clip, dt);
    for (const n of ADD_CLIPS) {
      const a = v.actions[n]; if (!a) continue;
      a.setEffectiveWeight(v.w[n] || 0);
      if (n === v.anim.clip) a.time = Math.min(v.anim.time, a.getClip().duration - 1e-3);
    }
    v.mixer.update(0);
  }

  return {
    /**
     * @param {{id: number, x: number, z: number, cd: number}[]} adds the rules' adds @param {number} dt
     * @param {[number, number]} me where the heroine stands [x, z] @param {boolean} reduced reduced motion @param {number} tt scene time
     */
    sync(adds, dt, me, reduced = false, tt = 0) {
      const seen = new Set();
      for (const a of adds) {
        seen.add(a.id);
        let v = live.get(a.id);
        if (!v || (!v.model && proto)) {                       // new, or the model arrived while a stand-in was up
          const anim = v ? v.anim : freshAddAnim();
          if (v) v.node.removeFromParent();
          v = make(); v.anim = anim; root.add(v.node); live.set(a.id, v);
        }
        v.anim = addAnimStep(v.anim, a, dt);
        if (reduced) v.anim = { ...v.anim, clip: 'idle', time: 0 };   // reduced motion: it simply stands there
        if (v.model) {
          v.node.position.set(a.x, 0, a.z);
          v.node.rotation.y = Math.atan2(me[0] - a.x, me[1] - a.z);    // the model faces +Z: toward her
          pose(v, reduced ? 1 : dt);
        } else {
          v.node.position.set(a.x, 0.8 + (reduced ? 0 : Math.abs(Math.sin(tt * 6 + a.id)) * 0.3), a.z);
          if (!reduced) v.node.rotation.y += dt * 3;
        }
      }
      for (const [id, v] of live) {
        if (seen.has(id)) continue;
        live.delete(id);
        if (v.model && !reduced) { v.anim = addDeathStep(v.anim, 0); ghosts.push(v); } else v.node.removeFromParent();
      }
      for (let i = ghosts.length - 1; i >= 0; i--) {
        const v = ghosts[i]; v.anim = addDeathStep(v.anim, dt); pose(v, dt);
        if (v.anim.done) { v.node.removeFromParent(); ghosts.splice(i, 1); }
      }
    },
    /** Every add leaves at once (a win, a respawn). */
    clear() {
      for (const v of live.values()) v.node.removeFromParent();
      for (const v of ghosts) v.node.removeFromParent();
      live.clear(); ghosts.length = 0;
    },
    /** How many adds are shown, the dying ones included (tests). */
    count: () => live.size + ghosts.length,
  };
}
