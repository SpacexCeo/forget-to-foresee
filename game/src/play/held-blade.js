// The Loomblade in Iris's hand. Once she has taken it (the Glass Shoal quest), the sword sits in her right fist:
// parented to her `prop_R` bone with the seat worked out in Blender-free code (art/agents/grip_rig.mjs), and her
// fingers close on the hilt with the pose from play/grip-pose.js. The pose is written after the animation mixer every
// frame, so every clip keeps playing and the hand stays shut. Only a heroine whose model carries the finger joints
// (`index_mid_R`, ...) holds it; another heroine, or an older model file, is left alone.
import { GRIP } from './grip-pose.js';
import { LAYER_OVERLAY } from '../render/layers.js';

/**
 * The Loomblade's glow (owner P0, 14.11): the braid of loom thread in the fuller burns brighter where a slow pulse
 * climbs it from the guard to the tip, and a soft warm halo stands along the blade. Numbers in metres along the
 * sword's own +Y (the grip centre is 0, the tip 0.944).
 */
export const BLADE_GLOW = Object.freeze({ from: 0.17, to: 0.95, period: 2.4, width: 0.09, emissive: 1.6, pulse: 2.2, halo: 0.55, haloWidth: 0.12, color: 0xffc977 });

/** How much the travelling pulse lifts the glow at height `y` on the blade at time `t` (0..1; the shaders do the same). */
export function glowBand(y, t, g = BLADE_GLOW) {
  const at = g.from + (g.to - g.from) * ((t / g.period) % 1);
  return Math.exp(-(((y - at) / g.width) ** 2));
}

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
  let shown = false, time = 0;
  const uTime = { value: 0 };
  const G = BLADE_GLOW;

  /** The inlay burns brighter where the pulse is: the glTF's emissive map times a band that climbs the blade. */
  function glowMaterial(m) {
    const out = m.clone();
    out.emissiveIntensity = (m.emissiveIntensity || 1) * G.emissive;
    out.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'varying float vBladeY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vBladeY = position.y;');
      sh.fragmentShader = 'uniform float uTime;\nvarying float vBladeY;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float gAt = ${G.from.toFixed(3)} + ${(G.to - G.from).toFixed(3)} * fract(uTime / ${G.period.toFixed(2)});
  float gBand = exp(-pow((vBladeY - gAt) / ${G.width.toFixed(3)}, 2.0));
  totalEmissiveRadiance *= 1.0 + ${G.pulse.toFixed(2)} * gBand + 0.18 * sin(uTime * 2.3);`);
    };
    out.customProgramCacheKey = () => 'loomblade-glow';
    return out;
  }

  /** A soft halo along the blade: two crossed additive strips, brightest along the middle and where the pulse is. */
  function halo() {
    const len = G.to - G.from;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime, uColor: { value: new THREE.Color(G.color) }, uStrength: { value: G.halo } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime, uStrength; uniform vec3 uColor; varying vec2 vUv;
        void main() {
          float across = pow(max(0.0, 1.0 - abs(vUv.x * 2.0 - 1.0)), 2.2);
          float y = ${G.from.toFixed(3)} + vUv.y * ${len.toFixed(3)};
          float gAt = ${G.from.toFixed(3)} + ${len.toFixed(3)} * fract(uTime / ${G.period.toFixed(2)});
          float band = exp(-pow((y - gAt) / ${(G.width * 1.4).toFixed(3)}, 2.0));
          float ends = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
          float a = across * ends * (0.35 + 0.65 * band) * uStrength;
          gl_FragColor = vec4(uColor * a, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    });
    const geo = new THREE.PlaneGeometry(G.haloWidth, len);
    geo.translate(0, G.from + len / 2, 0);
    const g = new THREE.Group(); g.name = 'loomblade_halo';
    for (const ry of [0, Math.PI / 2]) { const m = new THREE.Mesh(geo, mat); m.rotation.y = ry; m.layers.set(LAYER_OVERLAY); m.frustumCulled = false; m.renderOrder = 6; g.add(m); }
    return g;
  }

  function load() {
    const file = heldBladeFile(mobile, hasModelFile);
    if (!file || loading || sword) return;
    loading = true;
    fetchGltf(file).then(({ gltf }) => {
      sword = gltf.scene.clone(true); sword.name = 'held_loomblade';   // the loader may share one scene per file
      sword.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.frustumCulled = false; if (n.material && n.material.emissiveMap) n.material = glowMaterial(n.material); } });
      sword.add(halo());
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
    /** Per frame, after the avatar's mixer has run. Reduced motion holds the glow still. */
    update(dt = 0, reduced = false) {
      if (!reduced) time += dt;
      uTime.value = time;
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
