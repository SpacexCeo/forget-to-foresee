// The other players in the shared town (docs/multiplayer.md): each one wears her heroine (Iris or Elise, the light
// `_m` model when the build has it), walks with the idle / walk / run clips blended by the interpolated speed, and
// carries a nickname tag. Only the nearest are drawn (8 on phones, 15 on desktop) and nobody beyond 70 m.
// Models load one skin at a time and are shared: each player is a skinned clone of the loaded heroine.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MODEL_FILES } from 'virtual:model-list';
import { prefetchGltf } from '../render/assets.js';
import { heroById } from '../render/asset-catalog.js';
import { toonify } from './iris-avatar.js';
import { resolveClip } from './behaviour.js';
import { REMOTE, pickDrawn } from '../net/presence.js';


function modelFileFor(skin) {
  const base = heroById(skin).model;
  const file = MODEL_FILES[base + '_m'] ? base + '_m' : MODEL_FILES[base] ? base : (MODEL_FILES.agent_iris_m ? 'agent_iris_m' : 'agent_iris');
  return MODEL_FILES[file] ? file : null;
}

function nameTag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(248, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(16,22,24,.72)'; g.beginPath(); g.roundRect((256 - w) / 2, 10, w, 44, 12); g.fill();
  g.strokeStyle = 'rgba(233,180,76,.7)'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#f3ead6'; g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1); s.position.y = 2.15; s.renderOrder = 10;
  return s;
}

/**
 * @param {{scene: THREE.Scene, phone?: boolean}} o
 * @returns {{update(dt: number, list: object[], from: number[], reducedMotion?: boolean): void, clear(): void, count(): number}}
 */
export function createRemotePlayers({ scene, phone = false }) {
  const sources = new Map(); // skin -> Promise<{gltf, toon}> | value
  const avatars = new Map(); // id -> {group, model, mixer, acts, tag, skin, name}
  const max = phone ? REMOTE.maxDrawnPhone : REMOTE.maxDrawnDesktop;

  function source(skin) {
    if (!sources.has(skin)) {
      const file = modelFileFor(skin);
      sources.set(skin, file ? prefetchGltf(file).then(({ gltf }) => { const v = { gltf, toon: heroById(skin).toon }; sources.set(skin, v); return v; }).catch(() => { sources.set(skin, null); return null; }) : null);
    }
    const s = sources.get(skin);
    return s && !(s instanceof Promise) ? s : null;
  }

  function build(r) {
    const src = source(r.skin);
    const group = new THREE.Group(); group.name = 'remote_' + r.id;
    const a = { group, model: null, mixer: null, acts: null, tag: nameTag(r.name), skin: r.skin, name: r.name, w: { idle: 1, walk: 0, run: 0 } };
    group.add(a.tag);
    scene.add(group);
    if (src) attach(a, src);
    return a;
  }

  function attach(a, src) {
    const model = cloneSkinned(src.gltf.scene);
    if (src.toon) toonify(model);
    model.traverse((o) => { if (/_col(?:[._]?\d+)?$/.test(o.name)) o.visible = false; if (o.isMesh) { o.castShadow = false; o.frustumCulled = true; } });
    a.group.add(model); a.model = model;
    const clips = src.gltf.animations || [];
    if (clips.length) {
      a.mixer = new THREE.AnimationMixer(model);
      a.acts = {};
      for (const n of ['idle', 'walk', 'run']) { const c = resolveClip(clips, n).clip; if (c) { const act = a.mixer.clipAction(c); act.play(); act.setEffectiveWeight(n === 'idle' ? 1 : 0); a.acts[n] = act; } }
    }
  }

  function update(dt, list, from, reducedMotion = false) {
    const seen = new Set(list.map((r) => r.id));
    for (const [id, a] of avatars) if (!seen.has(id)) { scene.remove(a.group); a.tag.material.map.dispose(); a.tag.material.dispose(); avatars.delete(id); }
    const drawn = new Set(pickDrawn(list.filter((r) => r.p), from, max));
    for (const r of list) {
      if (!r.p) continue;
      let a = avatars.get(r.id);
      if (!a) { a = build(r); avatars.set(r.id, a); }
      if (!a.model) { const src = source(a.skin); if (src) attach(a, src); }
      const on = drawn.has(r.id);
      a.group.visible = on;
      if (!on) continue;
      a.group.position.set(r.p[0], r.p[1], r.p[2]);
      a.group.rotation.y = r.h;
      const d = Math.hypot(r.p[0] - from[0], r.p[2] - from[2]);
      a.tag.visible = d < REMOTE.tagFarM;
      if (a.mixer && a.acts) {
        const target = r.speed > 2.6 ? 'run' : r.speed > 0.25 ? 'walk' : 'idle';
        const k = Math.min(1, dt * 6);
        for (const n of Object.keys(a.acts)) { a.w[n] += ((n === target || (!a.acts[target] && n === 'idle') ? 1 : 0) - a.w[n]) * k; a.acts[n].setEffectiveWeight(a.w[n]); }
        a.mixer.update(reducedMotion ? 0 : dt);
      }
    }
  }

  return {
    update,
    clear() { for (const a of avatars.values()) scene.remove(a.group); avatars.clear(); },
    count: () => [...avatars.values()].filter((a) => a.group.visible).length,
  };
}
