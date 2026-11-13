// A dragon companion in flight beside the heroine (docs/companion-nft-plan.md; art: dragon_<kind>.glb with idle,
// follow, fly, glide, perch loops and flip, cheer, land one-shots; art/dragons/build_dragons.py). It trails her
// shoulder on a soft spring, banks into turns, hovers when she stands, glides when she runs, answers her strikes and
// casts with a small flourish, now and then flips, and after a long rest lands beside her and sits until she moves.
// It never flies through her: a keep-out cylinder around her pushes it aside. Visual only: whether it may appear is
// Levitation: the body bobs, a soft light lies on the ground under it (smaller the higher it flies, gone when it
// sits), and a few slow sparks drift down from its belly (none under reduced motion, fewer on phones). Models that
// carry "spirit wings" (material M_Spirit_Wing) get them drawn as tinted light, folded away when the dragon sits.
// the chain read's decision (net/companions.js), made by the caller.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { fetchGltfUrl } from '../render/assets.js';

import { COMPANION, keepClear, glowAt } from './companion-rules.js';
export { COMPANION, keepClear };

let softDot = null, wingFade = null;
function canvasTex(draw, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** A soft round dot: the ground light and the sparks. */
function dotTexture() {
  return (softDot ||= canvasTex((g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(0.7, 'rgba(255,255,255,.12)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); }, 64, 64));
}
/** The spirit wings' light: bright along the leading edge and the ribs, fading to the trailing edge and the tip (u along the span, v across the chord). */
function wingTexture() {
  return (wingFade ||= canvasTex((g, w, h) => {
    const d = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / (w - 1), v = y / (h - 1), rib = 0.55 + 0.45 * Math.pow(Math.abs(Math.cos(u * Math.PI * 4)), 6);
      const a = Math.min(1, (Math.pow(1 - v, 1.4) * 0.8 * rib + Math.pow(1 - v, 8) * 0.6) * (1 - 0.55 * u * u));
      const i = (y * w + x) * 4, b = Math.round(255 * a); d.data[i] = d.data[i + 1] = d.data[i + 2] = b; d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
  }, 64, 32));
}
const ONE_SHOT = ['flip', 'cheer', 'land'];

/**
 * @param {{scene: THREE.Scene, kind: string, slot?: number, mobile?: boolean, perchAfter?: number, base?: string}} o
 */
export function createCompanion({ scene, kind, slot = 0, mobile = false, perchAfter = COMPANION.perchAfter, base = (import.meta.env && import.meta.env.BASE_URL) || '/' }) {
  const root = new THREE.Group(); root.name = 'companion_' + kind; root.visible = false; scene.add(root);
  const st = { mixer: null, acts: {}, playing: null, shot: null, pos: null, vel: new THREE.Vector3(), t: 0, still: 0, flipAt: 5 + Math.random() * 4, ready: false, mode: 'fly', cheerAt: 0, bank: 0, lastYaw: 0 };
  const side = slot % 2 ? -1 : 1, back = COMPANION.back + Math.floor(slot / 2) * 0.8;
  fetchGltfUrl(base + 'assets/models/dragon_' + kind + (mobile ? '_m' : '') + '.glb').then((g) => {
    const m = cloneSkinned(g.scene); m.scale.setScalar(COMPANION.scale);
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      if (o.material && o.material.name === 'M_Spirit_Wing') { // light, not skin: no shadow, no depth write
        const tex = wingTexture(); tex.flipY = false;
        o.material = new THREE.MeshBasicMaterial({ color: tint, map: tex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
        o.renderOrder = 3; fx.wings = o.material;
      } else o.castShadow = true;
    });
    root.add(m);
    st.mixer = new THREE.AnimationMixer(m);
    for (const c of g.animations || []) st.acts[c.name] = st.mixer.clipAction(c);
    for (const n of ONE_SHOT) if (st.acts[n]) { st.acts[n].setLoop(THREE.LoopOnce, 1); st.acts[n].clampWhenFinished = true; }
    st.mixer.addEventListener('finished', (e) => { if (e.action === st.shot) { const done = st.shot; st.shot = null; st.playing = done; play(done === st.acts.land ? 'perch' : st.mode === 'perch' ? 'perch' : 'idle', 0.25); } });
    play('idle'); st.ready = true;
  }).catch((e) => console.warn('[companion]', kind, e));

  // ---- levitation: the light on the ground and the sparks from the belly
  const tint = new THREE.Color(COMPANION.tint[kind] || 0xffffff);
  const fx = { wings: null, glow: null, motes: null, n: mobile ? COMPANION.motes.phone : COMPANION.motes.desktop, age: null, next: 0, wingsK: 1 };
  fx.glow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: tint, map: dotTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  fx.glow.rotation.x = -Math.PI / 2; fx.glow.visible = false; fx.glow.renderOrder = 2; fx.glow.name = 'companion_glow'; scene.add(fx.glow);
  {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fx.n * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(fx.n * 3), 3));
    fx.motes = new THREE.Points(g, new THREE.PointsMaterial({ size: COMPANION.motes.size, map: dotTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false }));
    fx.motes.frustumCulled = false; fx.motes.visible = false; fx.motes.name = 'companion_motes'; scene.add(fx.motes);
    fx.age = new Float32Array(fx.n).fill(-1);
  }
  function levitate(dt, groundY, reducedMotion) {
    const sitting = st.mode === 'perch', g = glowAt(st.pos.y - groundY, sitting), mat = fx.glow.material;
    mat.opacity += (g.opacity - mat.opacity) * Math.min(1, dt * 4);
    fx.glow.visible = mat.opacity > 0.01; fx.glow.position.set(st.pos.x, groundY + 0.04, st.pos.z); fx.glow.scale.setScalar(g.radius * (reducedMotion ? 1 : 1 + 0.06 * Math.sin(st.t * 2.1 + slot)));
    if (fx.wings) { fx.wingsK += ((sitting ? 0 : 1) - fx.wingsK) * Math.min(1, dt * 3); fx.wings.opacity = 0.85 * fx.wingsK; }
    // the sparks: born under the belly one at a time, they fall slowly and fade; world space, so they trail behind
    const M = COMPANION.motes, P = fx.motes.geometry.attributes.position, C = fx.motes.geometry.attributes.color; let alive = 0;
    fx.next -= dt;
    for (let i = 0; i < fx.n; i++) {
      if (fx.age[i] < 0 && fx.next <= 0 && !reducedMotion && !sitting) { fx.age[i] = 0; fx.next = M.life / fx.n; P.setXYZ(i, st.pos.x + (Math.random() - 0.5) * 2 * M.spread, st.pos.y - 0.08, st.pos.z + (Math.random() - 0.5) * 2 * M.spread); }
      if (fx.age[i] < 0) { C.setXYZ(i, 0, 0, 0); continue; }
      fx.age[i] += dt; const k = fx.age[i] / M.life;
      if (k >= 1) { fx.age[i] = -1; C.setXYZ(i, 0, 0, 0); continue; }
      alive++; P.setY(i, P.getY(i) - M.fall * dt); P.setX(i, P.getX(i) + Math.sin(st.t * 1.3 + i * 2.1) * 0.03 * dt);
      const a = Math.sin(Math.PI * Math.min(1, k * 1.15)) * 0.9; C.setXYZ(i, tint.r * a, tint.g * a, tint.b * a);
    }
    fx.motes.visible = alive > 0; P.needsUpdate = true; C.needsUpdate = true;
  }

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
      if (!moving && st.mode === 'fly' && st.still > perchAfter && st.acts.perch && !st.shot) st.mode = 'descend';
      const sitting = st.mode !== 'fly';
      // over her shoulder (the other one for the second dragon), a little behind; sitting: on the ground at her side
      const sd = sitting ? COMPANION.perchSide : COMPANION.side, bk = sitting ? -0.35 : back;
      const y = sitting ? COMPANION.perchHeight * COMPANION.scale : COMPANION.height + Math.sin(st.t * 1.7 + slot) * (reducedMotion ? COMPANION.bobCalm : COMPANION.bob);
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
      levitate(dt, hero.position.y, reducedMotion);
    },
    /** What the levitation shows now (for the tests and the film). */
    get levitation() { return { glow: fx.glow.material.opacity, radius: fx.glow.scale.x, motes: fx.age ? Array.from(fx.age).filter((a) => a >= 0).length : 0, wings: !!fx.wings }; },
    dispose() { scene.remove(root); scene.remove(fx.glow); scene.remove(fx.motes); fx.glow.geometry.dispose(); fx.glow.material.dispose(); fx.motes.geometry.dispose(); fx.motes.material.dispose(); },
  };
}
