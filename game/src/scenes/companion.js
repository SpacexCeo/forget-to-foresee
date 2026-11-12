// A dragon companion in flight beside the heroine (docs/companion-nft-plan.md; art: dragon_<kind>.glb with idle,
// follow, fly, glide, perch loops and flip, cheer, land one-shots; art/dragons/build_dragons.py). It trails her
// shoulder on a soft spring, banks into turns, hovers when she stands, glides when she runs, answers her strikes and
// casts with a small flourish, now and then flips, and after a long rest lands beside her and sits until she moves.
// It never flies through her: a keep-out cylinder around her pushes it aside. Visual only: whether it may appear is
// the chain read's decision (net/companions.js), made by the caller.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { fetchGltfUrl } from '../render/assets.js';

import { COMPANION, keepClear } from './companion-rules.js';
export { COMPANION, keepClear };
const ONE_SHOT = ['flip', 'cheer', 'land'];

/**
 * @param {{scene: THREE.Scene, kind: string, slot?: number, mobile?: boolean, base?: string}} o
 */
export function createCompanion({ scene, kind, slot = 0, mobile = false, base = (import.meta.env && import.meta.env.BASE_URL) || '/' }) {
  const root = new THREE.Group(); root.name = 'companion_' + kind; root.visible = false; scene.add(root);
  const st = { mixer: null, acts: {}, playing: null, shot: null, pos: null, vel: new THREE.Vector3(), t: 0, still: 0, flipAt: 5 + Math.random() * 4, ready: false, mode: 'fly', cheerAt: 0, bank: 0, lastYaw: 0 };
  const side = slot % 2 ? -1 : 1, back = COMPANION.back + Math.floor(slot / 2) * 0.8;
  fetchGltfUrl(base + 'assets/models/dragon_' + kind + (mobile ? '_m' : '') + '.glb').then((g) => {
    const m = cloneSkinned(g.scene); m.scale.setScalar(COMPANION.scale);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    root.add(m);
    st.mixer = new THREE.AnimationMixer(m);
    for (const c of g.animations || []) st.acts[c.name] = st.mixer.clipAction(c);
    for (const n of ONE_SHOT) if (st.acts[n]) { st.acts[n].setLoop(THREE.LoopOnce, 1); st.acts[n].clampWhenFinished = true; }
    st.mixer.addEventListener('finished', (e) => { if (e.action === st.shot) { const done = st.shot; st.shot = null; st.playing = done; play(done === st.acts.land ? 'perch' : st.mode === 'perch' ? 'perch' : 'idle', 0.25); } });
    play('idle'); st.ready = true;
  }).catch((e) => console.warn('[companion]', kind, e));

  function play(name, fade = 0.3) {
    const a = st.acts[name]; if (!a || st.playing === a || st.shot) return;
    if (st.playing) st.playing.fadeOut(fade);
    a.reset().fadeIn(fade).play(); st.playing = a;
  }
  function shot(name, fade = 0.15) {
    const a = st.acts[name]; if (!a || st.shot) return false;
    if (st.playing) st.playing.fadeOut(fade);
    a.reset().fadeIn(fade).play(); st.playing = a; st.shot = a; return true;
  }

  const want = new THREE.Vector3(), tmp = new THREE.Vector3();
  return {
    root, kind,
    get ready() { return st.ready; },
    get mode() { return st.mode; },
    /** A small flourish in answer to her strike or cast (not while sitting, not under reduced motion). */
    flourish(reducedMotion = false) {
      if (!st.ready || reducedMotion || st.mode !== 'fly' || st.t < st.cheerAt) return false;
      st.cheerAt = st.t + COMPANION.cheerEvery; st.still = 0;
      return shot('cheer');
    },
    /**
     * Per frame. `hero` = {position: Vector3, heading: number, speed: number}.
     */
    update(dt, hero, reducedMotion = false) {
      if (!st.ready) return;
      st.t += dt;
      const h = hero.heading, moving = hero.speed > 0.4;
      if (moving) { st.still = 0; if (st.mode !== 'fly') { st.mode = 'fly'; st.shot = null; play('fly', 0.2); } } else st.still += dt;
      if (!moving && st.mode === 'fly' && st.still > COMPANION.perchAfter && st.acts.perch && !st.shot) st.mode = 'descend';
      const sitting = st.mode !== 'fly';
      // over her shoulder (the other one for the second dragon), a little behind; sitting: on the ground at her side
      const sd = sitting ? COMPANION.perchSide : COMPANION.side, bk = sitting ? -0.35 : back;
      const y = sitting ? COMPANION.perchHeight * COMPANION.scale : COMPANION.height + (reducedMotion ? 0 : Math.sin(st.t * 1.7 + slot) * 0.12);
      want.set(hero.position.x + Math.cos(h) * sd * side + Math.sin(h) * bk, hero.position.y + y, hero.position.z - Math.sin(h) * sd * side + Math.cos(h) * bk); // the avatar's heading points back at the camera: +back is behind her
      if (!st.pos) { st.pos = want.clone(); root.position.copy(want); root.visible = true; }
      // a critically damped spring toward the wanted point: lags, never overshoots far
      const k = sitting ? 2.2 : COMPANION.stiffness;
      tmp.copy(want).sub(st.pos).multiplyScalar(k * k * dt);
      st.vel.add(tmp).multiplyScalar(Math.max(0, 1 - 2 * k * dt));
      st.pos.addScaledVector(st.vel, dt);
      if (st.pos.distanceTo(want) > 12) { st.pos.copy(want); st.vel.set(0, 0, 0); } // a teleport: catch up at once
      keepClear(st.pos, hero.position);
      root.position.copy(st.pos);
      const sp = Math.hypot(st.vel.x, st.vel.z);
      const face = sp > 0.4 ? Math.atan2(st.vel.x, st.vel.z) : h;
      let dh = face - root.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      root.rotation.y += dh * Math.min(1, dt * 4);
      // bank into the turn: from how fast the nose swings, eased
      const rate = dt > 0 ? Math.atan2(Math.sin(root.rotation.y - st.lastYaw), Math.cos(root.rotation.y - st.lastYaw)) / dt : 0; st.lastYaw = root.rotation.y;
      const bankTo = st.mode === 'perch' ? 0 : THREE.MathUtils.clamp(-rate * 0.22, -0.5, 0.5);
      st.bank += (bankTo - st.bank) * Math.min(1, dt * 5); root.rotation.z = st.bank;
      if (st.mode === 'descend') {
        play('idle');
        if (st.pos.distanceTo(want) < 0.25) { st.mode = 'perch'; if (!shot('land', 0.2)) play('perch'); }
      } else if (st.mode === 'perch') { if (!st.shot) play('perch'); }
      else if (hero.speed > 3.2) play('glide');
      else if (moving) play(sp > 1.5 ? 'fly' : 'follow');
      else if (!reducedMotion && st.acts.flip && st.still > st.flipAt && !st.shot) { st.flipAt = st.still + 6 + Math.random() * 5; shot('flip'); }
      else play('idle');
      st.mixer.update(dt);
    },
    dispose() { scene.remove(root); },
  };
}
