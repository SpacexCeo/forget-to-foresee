// Side-car animation clips (docs/art/animation-pipeline.md). A character's motion-capture clips live in
// /assets/anim/<name>.glb next to its model (art/anim builds them): a skeleton with the same bone names and the clips,
// no meshes. three.js binds clips by bone name, so they play on the model as is; a side-car clip replaces the model's
// own clip of the same name. The face (blinks, brows, lips) stays on a separate always-on layer cut from the model's
// own idle clip, because the motion-capture clips carry the body only.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** Model name → side-car file (without extension) shipped in public/assets/anim/. */
export const SIDECAR = Object.freeze({ agent_iris: 'iris' });

/** Review switch until the owner approves the new clips: `?anim=mocap` turns them on, `?anim=legacy` off. */
export function sidecarEnabled(search = typeof location !== 'undefined' ? location.search : '') {
  const v = new URLSearchParams(search).get('anim');
  return v === 'mocap';
}

let loader = null;
const cache = new Map();

/** The side-car clips of a model ([] when it has none or the file fails: the model's own clips stay). */
export function sidecarClips(asset, base = (import.meta.env && import.meta.env.BASE_URL) || '/') {
  const name = SIDECAR[asset];
  if (!name) return Promise.resolve([]);
  if (!cache.has(name)) {
    loader ||= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    cache.set(name, loader.loadAsync(`${base}assets/anim/${name}.glb`).then((g) => g.animations, (e) => { console.warn('[anim] side-car clips failed', name, e); return []; }));
  }
  return cache.get(name);
}

/** The model's clips with every same-named side-car clip in their place (and the new names added). */
export function mergeClips(own, extra) {
  const names = new Set(extra.map((c) => c.name));
  return [...own.filter((c) => !names.has(c.name)), ...extra];
}

const FACE_TRACK = /(morphTargetInfluences|(^|[./])(jaw|lid_[a-z]+_[LR]|brow_[LR]|eye_[LR])\.)/;

/** An always-on face layer: the face tracks (morphs, lids, brows, jaw, eyes) of the model's own idle clip. */
export function faceLayerClip(own) {
  const idle = own.find((c) => c.name === 'idle');
  if (!idle) return null;
  const tracks = idle.tracks.filter((t) => FACE_TRACK.test(t.name));
  return tracks.length ? new THREE.AnimationClip('face_layer', idle.duration, tracks) : null;
}

/** Whether a clip animates the face itself (the model's own clips do; side-car body clips do not). */
export const hasFace = (clip) => clip.tracks.some((t) => FACE_TRACK.test(t.name));
