// A dragon companion in flight beside the heroine (docs/companion-nft-plan.md; art: dragon_<kind>.glb with idle,
// follow, fly, glide, flip clips). It trails her right shoulder with a soft spring, hovers when she stands, glides when
// she runs, and now and then flips when she idles (never under reduced motion). Visual only: whether it may appear is
// the chain read's decision (net/companions.js), made by the caller.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { fetchGltfUrl } from '../render/assets.js';

export const COMPANION = Object.freeze({ height: 1.85, side: 1.15, back: -0.25, stiffness: 3.2, scale: 1 }); // beside her shoulder, a touch ahead: in frame from the follow camera

/**
 * @param {{scene: THREE.Scene, kind: string, slot?: number, mobile?: boolean, base?: string}} o
 */
export function createCompanion({ scene, kind, slot = 0, mobile = false, base = (import.meta.env && import.meta.env.BASE_URL) || '/' }) {
  const root = new THREE.Group(); root.name = 'companion_' + kind; root.visible = false; scene.add(root);
  const st = { mixer: null, acts: {}, playing: null, pos: null, vel: new THREE.Vector3(), t: 0, still: 0, flipAt: 6 + Math.random() * 6, ready: false };
  const side = slot % 2 ? -1 : 1, back = COMPANION.back + Math.floor(slot / 2) * 0.8;
  fetchGltfUrl(base + 'assets/models/dragon_' + kind + (mobile ? '_m' : '') + '.glb').then((g) => {
    const m = cloneSkinned(g.scene); m.scale.setScalar(COMPANION.scale);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    root.add(m);
    st.mixer = new THREE.AnimationMixer(m);
    for (const c of g.animations || []) st.acts[c.name] = st.mixer.clipAction(c);
    if (st.acts.flip) { st.acts.flip.setLoop(THREE.LoopOnce, 1); st.acts.flip.clampWhenFinished = false; }
    play('idle'); st.ready = true;
  }).catch((e) => console.warn('[companion]', kind, e));

  function play(name, fade = 0.3) {
    const a = st.acts[name]; if (!a || st.playing === a) return;
    if (st.playing) st.playing.fadeOut(fade);
    a.reset().fadeIn(fade).play(); st.playing = a;
  }

  const want = new THREE.Vector3(), tmp = new THREE.Vector3();
  return {
    root, kind,
    get ready() { return st.ready; },
    /**
     * Per frame. `hero` = {position: Vector3, heading: number, speed: number}.
     */
    update(dt, hero, reducedMotion = false) {
      if (!st.ready) return;
      st.t += dt;
      const h = hero.heading;
      // over her right shoulder (left for the second dragon), a little behind
      want.set(hero.position.x + Math.cos(h) * COMPANION.side * side + Math.sin(h) * back, hero.position.y + COMPANION.height + (reducedMotion ? 0 : Math.sin(st.t * 1.7 + slot) * 0.12), hero.position.z - Math.sin(h) * COMPANION.side * side + Math.cos(h) * back); // the avatar's heading points back at the camera: +back is behind her
      if (!st.pos) { st.pos = want.clone(); root.position.copy(want); root.visible = true; }
      // a critically damped spring toward the wanted point: lags, never overshoots far
      const k = COMPANION.stiffness;
      tmp.copy(want).sub(st.pos).multiplyScalar(k * k * dt);
      st.vel.add(tmp).multiplyScalar(Math.max(0, 1 - 2 * k * dt));
      st.pos.addScaledVector(st.vel, dt);
      if (st.pos.distanceTo(want) > 12) { st.pos.copy(want); st.vel.set(0, 0, 0); } // a teleport: catch up at once
      root.position.copy(st.pos);
      const sp = Math.hypot(st.vel.x, st.vel.z);
      const face = sp > 0.4 ? Math.atan2(st.vel.x, st.vel.z) : h;
      let dh = face - root.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      root.rotation.y += dh * Math.min(1, dt * 4);
      root.rotation.z = THREE.MathUtils.clamp(-dh * 0.4, -0.35, 0.35);
      if (hero.speed > 3.2) { play('glide'); st.still = 0; }
      else if (hero.speed > 0.4) { play(sp > 1.5 ? 'fly' : 'follow'); st.still = 0; }
      else {
        st.still += dt;
        if (!reducedMotion && st.acts.flip && st.still > st.flipAt) { st.still = 0; st.flipAt = 8 + Math.random() * 10; st.playing = null; play('flip', 0.15); setTimeout(() => { st.playing = null; play('idle'); }, 1300); }
        else if (st.playing !== st.acts.flip) play('idle');
      }
      st.mixer.update(dt);
    },
    dispose() { scene.remove(root); },
  };
}
