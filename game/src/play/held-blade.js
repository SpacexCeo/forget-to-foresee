// The Loomblade in Iris's hand. Once she has taken it (the Glass Shoal quest), the sword sits in her right fist:
// parented to her `prop_R` bone with the seat worked out in Blender-free code (art/agents/grip_rig.mjs), and her
// fingers close on the hilt with the pose from play/grip-pose.js. The pose is written after the animation mixer every
// frame, so every clip keeps playing and the hand stays shut. Only a heroine whose model carries the finger joints
// (`index_mid_R`, ...) holds it; another heroine, or an older model file, is left alone.
import { GRIP } from './grip-pose.js';

/** Bones a model must have to hold the sword: the socket bone and every finger joint of the grip pose. */
export function canHold(hasBone, grip = GRIP) {
  return hasBone('prop_R') && Object.keys(grip.pose).every((n) => hasBone(n));
}

/** The sword file for this device: the light variant on phones when it ships. */
export function heldBladeFile(mobile, has) {
  if (mobile && has('loomblade_m')) return 'loomblade_m';
  return has('loomblade') ? 'loomblade' : null;
}

/**
 * @param {object} o
 * @param {typeof import('three')} o.THREE
 * @param {() => object|null} o.model her current model root (it changes when the heroine is switched)
 * @param {() => boolean} o.held whether she carries the sword now
 * @param {(name: string) => Promise<{gltf: object}>} o.fetchGltf @param {(name: string) => boolean} o.hasModelFile
 * @param {boolean} [o.mobile]
 */
export function createHeldBlade({ THREE, model, held, fetchGltf, hasModelFile, mobile = false, grip = GRIP }) {
  const seat = new THREE.Matrix4().fromArray(grip.sword_in_prop_R);
  const quats = Object.fromEntries(Object.entries(grip.pose).map(([n, q]) => [n, new THREE.Quaternion(q[0], q[1], q[2], q[3])]));
  let sword = null, loading = false, on = null;   // on: {root, bones: [[bone, gripQuat, restQuat]], holder}
  let shown = false;

  function load() {
    const file = heldBladeFile(mobile, hasModelFile);
    if (!file || loading || sword) return;
    loading = true;
    fetchGltf(file).then(({ gltf }) => {
      sword = gltf.scene.clone(true); sword.name = 'held_loomblade';   // the loader may share one scene per file
      sword.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.frustumCulled = false; } });
    }).catch(() => { /* she fights with empty hands */ }).finally(() => { loading = false; });
  }

  function detach() {
    if (!on) return;
    for (const [bone, , rest] of on.bones) bone.quaternion.copy(rest);
    if (on.holder.parent) on.holder.parent.remove(on.holder);
    on = null; shown = false;
  }

  function attach(root) {
    const bone = (n) => root.getObjectByName(n);
    if (!canHold((n) => !!bone(n), grip)) return false;
    const holder = new THREE.Group(); holder.name = 'held_blade_seat';
    holder.matrixAutoUpdate = false; holder.matrix.copy(seat);
    holder.add(sword);
    bone('prop_R').add(holder);
    on = { root, holder, bones: Object.keys(quats).map((n) => [bone(n), quats[n], bone(n).quaternion.clone()]) };
    return true;
  }

  return {
    get attached() { return !!on; },
    get visible() { return shown; },
    /** Per frame, after the avatar's mixer has run. */
    update() {
      const root = model(), want = !!held();
      if (want && !sword) load();
      if (on && on.root !== root) detach();
      if (!on && want && sword && root) attach(root);
      if (!on) return;
      on.holder.visible = want; shown = want;
      // the mixer has just written the knuckle bones: the closed hand goes on top of whatever clip plays
      if (want) for (const [bone, q] of on.bones) bone.quaternion.copy(q);
      else for (const [bone, , rest] of on.bones) if (!/^(fingers|index|thumb)_R$/.test(bone.name)) bone.quaternion.copy(rest);
    },
    dispose() { detach(); sword = null; },
  };
}
