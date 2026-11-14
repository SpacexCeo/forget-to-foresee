// The ring of townsfolk who stand over the heroine as she wakes (sprint plan 9.4): the people who then speak in the
// wake-up dialogue (npe/dialogue-script.js) and two bystanders, around a point, facing in, on the shared idle. Loaded when
// the wake-up starts; they stay through the whole first talk (prologue/index.js keepRing) and leave with the intro. The
// one who speaks a line plays the talk clip, and the town camera leans toward them (ring.at, render/dialogue-camera.js
// 'speaker'), so every speaker is on screen while they talk (QA 14.11 P1-3). The shot works without them.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/**
 * Who stands where, in ring order. The speakers of the dialogue hold the middle of the ring (the far side, facing the
 * camera behind her); the bystanders stand by the gap. `speaker` is the dialogue's speaker id (null for a bystander).
 */
export const RING = Object.freeze({
  radius: 1.55, gapAt: Math.PI, gap: 1.1,
  people: Object.freeze([
    Object.freeze({ model: 'townsfolk_sweeper', speaker: null }),
    Object.freeze({ model: 'townsfolk_child_a', speaker: 'child' }),
    Object.freeze({ model: 'townsfolk_baker', speaker: 'weaver' }),
    Object.freeze({ model: 'npc_elder', speaker: 'elder' }),
    Object.freeze({ model: 'npc_guard', speaker: 'guard' }),
    Object.freeze({ model: 'npc_lamplighter', speaker: 'lamplighter' }),
    Object.freeze({ model: 'townsfolk_courier', speaker: 'townsfolk' }),
    Object.freeze({ model: 'townsfolk_musician', speaker: null }),
  ]),
});

/** Where each person stands: evenly on the circle but for a gap (the side the camera rises through). Pure. */
export function ringPlaces(n, { radius = RING.radius, gapAt = RING.gapAt, gap = RING.gap } = {}) {
  const out = [], span = Math.PI * 2 - gap;
  for (let i = 0; i < n; i++) { const a = gapAt + gap / 2 + span * (i + 0.5) / n; out.push({ x: Math.sin(a) * radius, z: Math.cos(a) * radius, heading: a + Math.PI }); }
  return out;
}

/**
 * A speaker's feet in the world: the ring's centre and heading, the person's place on it. Null for a speaker who is
 * not in the ring (Iris, an unknown id). Pure.
 */
export function speakerSpot(speaker, center, heading = 0) {
  const i = RING.people.findIndex((p) => p.speaker === speaker);
  if (i < 0 || !center) return null;
  const p = ringPlaces(RING.people.length)[i], c = Math.cos(heading), s = Math.sin(heading);
  return [center[0] + p.x * c + p.z * s, center[1], center[2] - p.x * s + p.z * c];
}

/** @returns {{update(dt:number):void, talk(speaker:string|null):void, at(speaker:string):number[]|null, dispose():void, count():number}} */
export function createTownsfolkRing({ scene, center, heading = 0, mobile = false }) {
  const group = new THREE.Group(); group.name = 'wakeup_ring'; group.position.set(center[0], center[1], center[2]); group.rotation.y = heading; scene.add(group);
  const crowd = []; let gone = false, talking = null;
  const places = ringPlaces(RING.people.length);
  Promise.all([import('../../render/assets.js'), import('../../play/anim-library.js')]).then(([A, L]) => {
    RING.people.forEach(({ model: name, speaker }, i) => {
      A.prefetchGltf(name + (mobile ? '_m' : '')).then((r) => {
        const g = r && r.gltf ? r.gltf : r; if (gone || !g || !g.scene) return;
        const m = cloneSkinned(g.scene); m.position.set(places[i].x, 0, places[i].z); m.rotation.y = places[i].heading;
        m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        group.add(m);
        return L.townsfolkClips(m, { key: name, names: ['idle', 'talk'], body: /child/.test(name) ? 'child' : 'adult' }).then((shared) => {
          const clips = L.mergeClips(g.animations || [], shared || []), idle = clips.find((c) => c.name === 'idle'); if (!idle || gone) return;
          const mx = new THREE.AnimationMixer(m), a = mx.clipAction(idle); a.time = i * 0.7; a.play();
          const tc = speaker ? clips.find((c) => c.name === 'talk') : null, t = tc ? mx.clipAction(tc) : null;
          if (t) { t.play(); t.setEffectiveWeight(0); }
          crowd.push({ speaker, mx, idle: a, talk: t, w: 0 });
        });
      }).catch(() => { /* one person fewer */ });
    });
  }).catch(() => { /* the shot plays without the ring */ });
  return {
    update(dt) {
      for (const p of crowd) {
        if (p.talk) { const to = p.speaker === talking ? 1 : 0; p.w += (to - p.w) * Math.min(1, dt * 5); p.talk.setEffectiveWeight(p.w); p.idle.setEffectiveWeight(1 - p.w); }
        p.mx.update(dt);
      }
    },
    /** The one who speaks now plays the talk clip; the rest listen (null: nobody in the ring speaks). */
    talk(speaker) { talking = speaker || null; },
    /** A speaker's feet in the world, or null when they are not standing in the ring. */
    at(speaker) { return gone ? null : speakerSpot(speaker, center, heading); },
    count: () => group.children.length,
    dispose() { gone = true; scene.remove(group); },
  };
}
