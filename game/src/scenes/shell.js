// Inside a Shell: the closed interior (shell_interior.glb, greybox until it streams in), three Guests
// behind the glass wall (guest.glb) and the logogram they draw on the glass. The interior lives in
// the same THREE.Scene as the island, high above it at SHELL_ORIGIN (a closed volume: walls and
// vault hide the sky; the height fog is negligible up there), with its own collision world, so the
// look-dev stack, the camera rig and the character controller are reused unchanged.
//
// The Guests are meant to feel truly alien (owner brief: nacre-crystal bodies, sail and fin
// membranes, round logograms; no Arrival heptapods). They never face the visitor squarely, move as
// one mind (sails breathe in a phase-locked chord, a light pulse travels core to core), and
// answer questions with posture and light, not gestures: a "yes" opens the sails and flares the
// cores, a "no" folds them and lets the drawn stroke dissolve. Presentation only.
import * as THREE from 'three';
import { MODEL_FILES } from 'virtual:model-list';
import { CollisionWorld } from '../physics/collision.js';
import { PropInstance, fetchGltf } from '../render/assets.js';
import { upgradeAssetMaterials } from '../render/materials.js';
import { drawLogogram } from '../play/logogram.js';

export const SHELL_ORIGIN = Object.freeze([0, 300, 0]);

// Sockets of the real interior (art/shells interior handoff); the greybox has its own smaller room.
const REAL = {
  spawn: [0, 1.2, 11.3], glass: [0, 3.95, -10.748], glassSize: [12.1, 7.1], stand: [0, -8.6],
  guests: [[-4.4, -0.3, -15.75, 0.247, 0.969], [0.4, -0.3, -17.95, 0, 1], [4.6, -0.3, -15.35, -0.296, 0.955]],
};
const GREY = { spawn: [0, 0, 4.5], glass: [0, 5, -5.84], glassSize: [12, 7], stand: [0, -4.5], guests: REAL.guests.map(([x, y, , dx, dz]) => [x * 0.8, 0, -7.4, dx, dz]) };

export function createShellScene({ scene, streamer }) {
  const world = new CollisionWorld({ cellSize: 2 });
  const root = new THREE.Group();
  root.name = 'shell_scene';
  root.position.set(...SHELL_ORIGIN);
  scene.add(root);
  const interior = streamer.add(new PropInstance({ name: 'shell_interior', scene, world, position: SHELL_ORIGIN.slice(), rotationY: 0 }));

  // Interior light: amber floor glow and a cold nacre light in the Guests' chamber.
  const lights = new THREE.Group();
  const amberA = new THREE.PointLight(0xffb45a, 18, 16, 2); amberA.position.set(-3, 1.2, 2);
  const amberB = new THREE.PointLight(0xffb45a, 18, 16, 2); amberB.position.set(3, 1.2, -3);
  const chamber = new THREE.PointLight(0xbfd8ff, 60, 30, 2); chamber.position.set(0, 7, -15);
  const core = new THREE.PointLight(0xffe2a8, 0, 12, 2); core.position.set(0, 4, -12);
  lights.add(amberA, amberB, chamber, core);
  root.add(lights);

  // The logogram on the glass: a canvas the Guest "draws" into.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const glyphMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
  const glyph = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), glyphMat);
  glyph.name = 'logogram_on_glass';
  glyph.renderOrder = 3;
  root.add(glyph);

  const guests = [];
  let guestTemplate = null, guestLoading = false;
  const placeGuests = (L) => {
    guests.forEach((g, i) => {
      const [x, y, z, dx, dz] = L.guests[i];
      g.root.position.set(x, y, z);
      g.baseYaw = Math.atan2(dx, dz) + (i - 1) * 0.35; // never squarely at the visitor
      g.root.rotation.y = g.baseYaw;
    });
  };
  async function loadGuests() {
    if (guestTemplate || guestLoading || !MODEL_FILES.guest) return;
    guestLoading = true;
    try {
      const { gltf } = await fetchGltf('guest');
      upgradeAssetMaterials('guest', gltf.scene);
      guestTemplate = gltf.scene;
      for (let i = 0; i < 3; i++) {
        const m = guestTemplate.clone(true);
        m.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
        const nodes = {};
        m.traverse((o) => { if (/^guest_/.test(o.name)) nodes[o.name] = { o, rot: o.rotation.clone(), pos: o.position.clone() }; });
        const g = { root: new THREE.Group(), model: m, nodes, baseYaw: 0 };
        g.root.add(m);
        g.root.scale.setScalar(i === 1 ? 1.08 : 0.94);
        root.add(g.root);
        guests.push(g);
      }
      placeGuests(layout());
    } catch (e) { console.warn('[play] guest model failed', e); }
    guestLoading = false;
  }

  const layout = () => (interior.isReal ? REAL : GREY);
  let lastReal = null;
  function applyLayout() {
    const L = layout();
    if (lastReal === interior.isReal) return;
    lastReal = interior.isReal;
    glyph.position.set(L.glass[0], L.glass[1], L.glass[2] + 0.06);
    const s = Math.min(L.glassSize[0], L.glassSize[1]) * 0.92;
    glyph.scale.set(s / 6.4, s / 6.4, 1);
    placeGuests(L);
  }
  applyLayout();

  let active = false, shellNo = 1;
  let sign = null, drawStart = 0, answer = null, answerAt = -10;
  root.visible = false;

  const api = {
    origin: SHELL_ORIGIN,
    world, interior, root,
    get active() { return active; },
    get shell() { return shellNo; },
    /** Shows the interior for Shell n (one interior serves all four in this slice). */
    activate(n) { active = true; shellNo = n; root.visible = true; loadGuests(); },
    deactivate() { active = false; root.visible = false; },
    get ready() { return interior.isReal; },
    /** World-space spawn point and yaw for the current interior (real art or greybox). */
    spawn() { const L = layout(); return { pos: [SHELL_ORIGIN[0] + L.spawn[0], SHELL_ORIGIN[1] + L.spawn[1], SHELL_ORIGIN[2] + L.spawn[2]], heading: Math.PI }; },
    /** Local (shell-space) glass standing spot for the interaction layer. */
    spots() { const L = layout(); return { glass: L.stand.slice(), radius: 4 }; },
    toLocal(p) { return [p[0] - SHELL_ORIGIN[0], p[1] - SHELL_ORIGIN[1], p[2] - SHELL_ORIGIN[2]]; },
    /** The Guest starts drawing a sign ({forms, dots}); null clears the glass. */
    setSign(next, t) {
      const same = sign && next && sign.forms.join() === next.forms.join() && sign.dots === next.dots;
      if (same) return;
      sign = next; drawStart = t;
    },
    /** A yes/no answer from the Guests: posture and light. */
    answer(yes, t) { answer = yes; answerAt = t; },
    update(t, dt, reducedMotion) {
      if (!active) return;
      applyLayout();
      const m = reducedMotion ? 0 : 1;
      // Drawing progress: 7 s per sign, the dots first, the ring last, then a slow turn.
      const progress = sign ? (reducedMotion ? 1 : Math.min(1, (t - drawStart) / 7)) : 0;
      const since = t - answerAt;
      const fade = answer === false && since < 3 ? Math.max(0.15, 1 - since / 1.5) : 1;
      if (sign) drawLogogram(ctx, sign, { size: 1024, progress, turn: true, time: t, ink: '#f6ecd0', glow: 'rgba(240, 200, 120, 0.9)' });
      else ctx.clearRect(0, 0, 1024, 1024);
      glyphMat.opacity = fade;
      tex.needsUpdate = true;
      const flare = answer === true && since < 4 ? Math.sin(Math.min(1, since / 4) * Math.PI) : 0;
      const fold = answer === false && since < 4 ? Math.sin(Math.min(1, since / 4) * Math.PI) : 0;
      core.intensity = 4 + 30 * flare;
      chamber.intensity = 60 * (1 - 0.5 * fold);
      guests.forEach((g, i) => {
        const ph = (i * 2 * Math.PI) / 3; // a chord: three voices a third apart
        const breathe = Math.sin(t * 0.9 + ph) * m;
        const open = 0.25 * flare - 0.45 * fold;
        const n = g.nodes;
        const rot = (name, ax, v) => { const x = n[name]; if (x) x.o.rotation[ax] = x.rot[ax] + v; };
        rot('guest_sail_l', 'z', 0.18 * breathe + open);
        rot('guest_sail_r', 'z', -0.18 * breathe - open);
        rot('guest_sail_dorsal', 'x', 0.12 * Math.sin(t * 0.7 + ph + 1) * m - open * 0.5);
        rot('guest_fin_l', 'y', 0.25 * Math.sin(t * 2.3 + ph) * m);
        rot('guest_fin_r', 'y', -0.25 * Math.sin(t * 2.3 + ph + 0.4) * m);
        // The middle Guest draws: its arm traces the ring while the sign is forming.
        if (i === 1 && sign && progress < 1) {
          const a = progress * Math.PI * 2 * 1.4;
          rot('guest_arm_draw', 'x', -0.35 + Math.sin(a) * 0.25 * m);
          rot('guest_arm_draw', 'z', Math.cos(a) * 0.3 * m);
        } else rot('guest_arm_draw', 'x', 0.05 * breathe);
        // Hover and a slow, non-facing drift.
        g.root.position.y = layout().guests[i][1] + (0.08 + 0.05 * Math.sin(t * 0.5 + ph)) * m + 0.2 * flare;
        g.root.rotation.y = g.baseYaw + 0.12 * Math.sin(t * 0.21 + ph) * m;
        // A light pulse travels core to core.
        const c = n.guest_core && n.guest_core.o;
        if (c && c.material && 'emissiveIntensity' in c.material) {
          if (!c.userData.ownMat) { c.material = c.material.clone(); c.userData.ownMat = true; }
          const pulse = Math.max(0, Math.sin(t * 1.8 - ph));
          c.material.emissiveIntensity = 0.6 + 2.2 * pulse * pulse + 4 * flare - 0.4 * fold;
        }
      });
      void dt;
    },
  };
  return api;
}
