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
import { townsfolkClips, sidecarClips, mergeClips, sidecarEnabled } from './anim-library.js';
import { resolveClip } from './behaviour.js';
import { REMOTE, pickDrawn } from '../net/presence.js';


function modelFileFor(skin) {
  const base = heroById(skin).model;
  const file = MODEL_FILES[base + '_m'] ? base + '_m' : MODEL_FILES[base] ? base : (MODEL_FILES.agent_iris_m ? 'agent_iris_m' : 'agent_iris');
  return MODEL_FILES[file] ? file : null;
}

/** A name tag; `badge` (the localized "AI") is drawn as a small teal pill after the name. */
function nameTag(text, badge = '') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  let g = c.getContext('2d');
  // a long name with a badge gets a wider tag (same pixels per metre) instead of a clipped badge
  g.font = '700 20px system-ui, sans-serif'; const bw0 = badge ? g.measureText(badge).width + 14 : 0;
  g.font = '600 22px system-ui, sans-serif'; if (g.measureText(text).width + 28 + (badge ? bw0 + 8 : 0) > 248) { c.width = 384; g = c.getContext('2d'); }
  const CW = c.width;
  g.textBaseline = 'middle';
  g.font = '700 20px system-ui, sans-serif'; const bw = badge ? g.measureText(badge).width + 14 : 0;
  // the name's size shrinks until name and badge fit the tag (long names such as "Sheriffchenko (demo player)")
  let size = 30; g.font = `600 ${size}px system-ui, sans-serif`; let nw = g.measureText(text).width;
  while (size > 14 && nw + 28 + (badge ? bw + 8 : 0) > CW - 8) { size -= 2; g.font = `600 ${size}px system-ui, sans-serif`; nw = g.measureText(text).width; }
  const w = Math.min(CW - 8, nw + 28 + (badge ? bw + 8 : 0)), x0 = (CW - w) / 2;
  g.fillStyle = 'rgba(16,22,24,.72)'; g.beginPath(); g.roundRect(x0, 10, w, 44, 12); g.fill();
  g.strokeStyle = 'rgba(233,180,76,.7)'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#f3ead6'; g.textAlign = 'left'; g.font = `600 ${size}px system-ui, sans-serif`; g.fillText(text, x0 + 14, 33);
  if (badge) {
    const bx = x0 + 14 + nw + 8;
    g.fillStyle = 'rgba(95,180,170,.9)'; g.beginPath(); g.roundRect(bx, 20, bw, 26, 8); g.fill();
    g.fillStyle = '#0f1a1a'; g.font = '700 20px system-ui, sans-serif'; g.fillText(badge, bx + 7, 34);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(1.6 * (CW / 256), 0.4, 1); s.position.y = 2.15; s.renderOrder = 10;
  return s;
}

/**
 * @param {{scene: THREE.Scene, phone?: boolean, aiLabel?: string}} o  aiLabel: the localized badge for AI walkers
 * @returns {{update(dt: number, list: object[], from: number[], reducedMotion?: boolean): void, clear(): void, count(): number}}
 */
export function createRemotePlayers({ scene, phone = false, aiLabel = 'AI' }) {
  const sources = new Map(); // skin -> Promise<{gltf, toon}> | value
  const avatars = new Map(); // id -> {group, model, mixer, acts, tag, skin, name}
  const max = phone ? REMOTE.maxDrawnPhone : REMOTE.maxDrawnDesktop;

  function source(skin) {
    if (!sources.has(skin)) {
      const file = modelFileFor(skin);
      sources.set(skin, file ? prefetchGltf(file).then(({ gltf }) => { const v = { gltf, toon: heroById(skin).toon, hero: heroById(skin) }; sources.set(skin, v); return v; }).catch(() => { sources.set(skin, null); return null; }) : null);
    }
    const s = sources.get(skin);
    return s && !(s instanceof Promise) ? s : null;
  }

  function build(r) {
    const src = source(r.skin);
    const group = new THREE.Group(); group.name = 'remote_' + r.id;
    const a = { group, model: null, mixer: null, acts: null, tag: nameTag(r.name, r.ai ? aiLabel : ''), skin: r.skin, name: r.name, w: { idle: 1, walk: 0, run: 0 } };
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
    const play = (clips) => {
      if (!clips.length || a.model !== model) return;
      a.mixer = new THREE.AnimationMixer(model);
      a.acts = {};
      for (const n of ['idle', 'walk', 'run']) { const c = resolveClip(clips, n).clip; if (c) { const act = a.mixer.clipAction(c); act.play(); act.setEffectiveWeight(n === 'idle' ? 1 : 0); a.acts[n] = act; } }
    };
    // a skin of the shared rig carries no clips: the heroine's set is retargeted onto it (once per skin, cached)
    if (src.hero && src.hero.retarget) townsfolkClips(model, { file: src.hero.sidecar, key: src.hero.model, names: ['idle', 'walk', 'run'] }).then(play).catch(() => {});
    else {
      // the heroine's side-car clips replace the model's own, as on the player's avatar: the model's own run still
      // carries the loose ponytail (owner: "her hair bun bounces strangely"); its own clips play until they arrive
      const own = src.gltf.animations || [];
      play(own);
      if (src.hero && sidecarEnabled()) sidecarClips(src.hero.model).then((extra) => { if (extra && extra.length && a.model === model) { if (a.mixer) a.mixer.stopAllAction(); play(mergeClips(own, extra)); } }).catch(() => {});
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
      a.rec = r; // the latest record: the player card reads it (name, skin, account, level, demo)
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
    /** The record of the nearest visible player the ray hits (its model or a 2 m tall capsule around it), or null. */
    pick(raycaster) {
      let best = null, bestD = Infinity;
      for (const a of avatars.values()) {
        if (!a.group.visible || !a.rec) continue;
        const hits = raycaster.intersectObject(a.group, true).filter((h) => h.object !== a.tag);
        let d = hits.length ? hits[0].distance : Infinity;
        if (!hits.length) { // thin or still-loading models: a column of 0.5 m around the feet up to 2 m
          const p = a.group.position, o = raycaster.ray.origin, dir = raycaster.ray.direction;
          const tt = Math.max(0, (p.x - o.x) * dir.x + (p.y + 1 - o.y) * dir.y + (p.z - o.z) * dir.z);
          const q = [o.x + dir.x * tt - p.x, o.y + dir.y * tt - (p.y + 1), o.z + dir.z * tt - p.z];
          if (Math.hypot(q[0], q[2]) < 0.5 && Math.abs(q[1]) < 1) d = tt;
        }
        if (d < bestD) { bestD = d; best = a.rec; }
      }
      return best;
    },
  };
}
