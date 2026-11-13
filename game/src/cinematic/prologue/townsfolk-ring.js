// The ring of townsfolk who stand over the heroine as she wakes (sprint plan 9.4): a few of the town's own people
// around a point, facing in, on the shared idle. Loaded when the wake-up starts, removed when it ends; the shot
// works without them (slow network, missing model).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const RING = Object.freeze({ radius: 1.55, people: ['townsfolk_baker', 'npc_elder', 'townsfolk_child_a', 'townsfolk_courier', 'npc_innkeeper', 'townsfolk_sweeper', 'townsfolk_musician'], gapAt: Math.PI, gap: 1.1 });

/** Where each person stands: evenly on the circle but for a gap (the side the camera rises through). Pure. */
export function ringPlaces(n, { radius = RING.radius, gapAt = RING.gapAt, gap = RING.gap } = {}) {
  const out = [], span = Math.PI * 2 - gap;
  for (let i = 0; i < n; i++) { const a = gapAt + gap / 2 + span * (i + 0.5) / n; out.push({ x: Math.sin(a) * radius, z: Math.cos(a) * radius, heading: a + Math.PI }); }
  return out;
}

/** @returns {{update(dt:number):void, dispose():void, count():number}} */
export function createTownsfolkRing({ scene, center, heading = 0, mobile = false }) {
  const group = new THREE.Group(); group.name = 'wakeup_ring'; group.position.set(center[0], center[1], center[2]); group.rotation.y = heading; scene.add(group);
  const mixers = []; let gone = false;
  const places = ringPlaces(RING.people.length);
  Promise.all([import('../../render/assets.js'), import('../../play/anim-library.js')]).then(([A, L]) => {
    RING.people.forEach((name, i) => {
      A.prefetchGltf(name + (mobile ? '_m' : '')).then((r) => {
        const g = r && r.gltf ? r.gltf : r; if (gone || !g || !g.scene) return;
        const m = cloneSkinned(g.scene); m.position.set(places[i].x, 0, places[i].z); m.rotation.y = places[i].heading;
        m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        group.add(m);
        return L.townsfolkClips(m, { key: name, names: ['idle'], body: /child/.test(name) ? 'child' : 'adult' }).then((shared) => {
          const clip = L.mergeClips(g.animations || [], shared || []).find((c) => c.name === 'idle'); if (!clip || gone) return;
          const mx = new THREE.AnimationMixer(m); const a = mx.clipAction(clip); a.time = i * 0.7; a.play(); mixers.push(mx);
        });
      }).catch(() => { /* one person fewer */ });
    });
  }).catch(() => { /* the shot plays without the ring */ });
  return {
    update(dt) { for (const mx of mixers) mx.update(dt); },
    count: () => group.children.length,
    dispose() { gone = true; scene.remove(group); },
  };
}
