// Inside a Shell: the closed interior (shell_interior.glb, greybox until it streams in), the Guests
// behind the glass wall (guest.glb) staged in a chamber of dense mist, and the logogram they draw on
// the glass. The interior lives in the same THREE.Scene as the island, high above it at SHELL_ORIGIN
// (a closed volume: walls and vault hide the sky; the height fog is negligible up there), with its
// own collision world, so the look-dev stack, the camera rig and the character controller are reused
// unchanged.
//
// The Guests are meant to feel truly alien (owner brief: nacre-crystal bodies, sail and fin
// membranes, round logograms; no Arrival heptapods). They are enormous, mostly hidden in the mist,
// backlit and low in contrast, and they emerge only at meaningful moments (play/guests-stage.js:
// a sign being drawn, a reveal, the trial-13 crisis, the vote, an answer; otherwise a seeded drift).
// They never face the visitor squarely except before the vote, move as one mind (a light pulse
// travels core to core) and answer questions with posture and light, not gestures: a "yes" opens
// the sails and flares the cores, a "no" folds them and lets the drawn stroke dissolve.
// Presentation only: nothing here reads or changes a rule.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MODEL_FILES } from 'virtual:model-list';
import { CollisionWorld } from '../physics/collision.js';
import { PropInstance, fetchGltf } from '../render/assets.js';
import { upgradeAssetMaterials } from '../render/materials.js';
import { drawLogogram } from '../play/logogram.js';
import { GuestsStage, QUALITY, SLOTS, DRAWING_SLOT } from '../play/guests-stage.js';

export const SHELL_ORIGIN = Object.freeze([0, 300, 0]);

// Sockets of the real interior (art/shells interior handoff); the greybox has its own smaller room.
// `chamber`: the volume behind the glass where the Guests stand, from the glass (zNear: a Guest at
// depth 1 stands here) to the far wall (zFar: depth 0); slot x positions left / centre / right.
const REAL = {
  spawn: [0, 1.2, 11.3], glass: [0, 3.95, -10.748], glassSize: [12.1, 7.1], stand: [0, -8.6],
  guests: [[-4.4, -0.3, -15.75, 0.247, 0.969], [0.4, -0.3, -17.95, 0, 1], [4.6, -0.3, -15.35, -0.296, 0.955]],
  chamber: { zNear: -13.4, zFar: -24.8, xHalf: 9, top: 13.5 },
};
const GREY = {
  spawn: [0, 0, 4.5], glass: [0, 5, -5.84], glassSize: [12, 7], stand: [0, -4.5],
  guests: REAL.guests.map(([x, y, , dx, dz]) => [x * 0.8, 0, -7.4, dx, dz]),
  chamber: { zNear: -6.9, zFar: -9.6, xHalf: 7, top: 11 },
};

/** Mist colour by depth into the chamber: pale and cool near the glass, dark at the far wall. */
const MIST_NEAR = new THREE.Color(0x9fadbc), MIST_MID = new THREE.Color(0x5b6775), MIST_FAR = new THREE.Color(0x232b34);
const BACKLIGHT = new THREE.Color(0xc4d6f0);
/** The dark of the chamber: the walls vanish behind it, the mist and the glow live inside it. */
const CHAMBER_TOP = new THREE.Color(0x0b0e12), CHAMBER_BOTTOM = new THREE.Color(0x1f2730);

/** Value-noise FBM in a canvas, white with the noise in alpha and a soft vignette so the plane edges vanish. */
function mistTexture(size = 512, seed = 7) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const grid = 16, lat = new Float32Array((grid + 1) * (grid + 1));
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const smooth = (x) => x * x * (3 - 2 * x);
  const noise = (x, y) => {
    const xi = Math.floor(x) % grid, yi = Math.floor(y) % grid, fx = smooth(x - Math.floor(x)), fy = smooth(y - Math.floor(y));
    const v = (a, b) => lat[((b % grid) + grid) % grid * (grid + 1) + ((a % grid) + grid) % grid];
    const top = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * fx, bot = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * fx;
    return top + (bot - top) * fy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let a = 0, amp = 0.5, f = 2;
    for (let o = 0; o < 5; o++) { a += amp * noise((x / size) * f + o * 3.1, (y / size) * f + o * 1.7); amp *= 0.5; f *= 2; }
    const nx = (x / size) * 2 - 1, ny = (y / size) * 2 - 1;
    const vignette = Math.pow(Math.max(0, 1 - Math.pow(Math.max(Math.abs(nx), Math.abs(ny) * 1.15), 3)), 1.2);
    const alpha = Math.min(1, Math.max(0, (a - 0.2) * 2.1)) * vignette;
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(alpha * 255);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** A soft radial glow sprite: the pale light deep in the mist that silhouettes the Guests. */
function glowTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(0.7, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createShellScene({ scene, streamer }) {
  const world = new CollisionWorld({ cellSize: 2 });
  const root = new THREE.Group();
  root.name = 'shell_scene';
  root.position.set(...SHELL_ORIGIN);
  scene.add(root);
  const interior = streamer.add(new PropInstance({ name: 'shell_interior', scene, world, position: SHELL_ORIGIN.slice(), rotationY: 0 }));

  // Interior light: amber floor glow in the hall; behind the glass a low cold fill, a strong backlight
  // deep in the mist (the Guests read as silhouettes against it) and the warm flare of the drawing core.
  const lights = new THREE.Group();
  const amberA = new THREE.PointLight(0xffb45a, 18, 16, 2); amberA.position.set(-3, 1.2, 2);
  const amberB = new THREE.PointLight(0xffb45a, 18, 16, 2); amberB.position.set(3, 1.2, -3);
  const fill = new THREE.PointLight(0x8fa7c4, 6, 26, 2);
  const back = new THREE.PointLight(BACKLIGHT.getHex(), 34, 46, 1.6);
  const core = new THREE.PointLight(0xffe2a8, 0, 14, 2);
  lights.add(amberA, amberB, fill, back, core);
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

  // ---- the mist chamber: layered planes (unlit, depth-tinted) and the backlight glow ----
  const stage = new GuestsStage({ seed: 'season', quality: 'high' });
  const mistGroup = new THREE.Group(); mistGroup.name = 'guest_mist';
  root.add(mistGroup);
  let mistTex = null, glowTex = null;
  const layers = [];   // {mesh, k, n, phase, speed, baseOpacity}
  let glow = null, chamberBox = null;
  /** The dark chamber: an inside-out box from the glass to past the far wall, darker toward the vault. */
  function buildChamber(L) {
    if (chamberBox) { mistGroup.remove(chamberBox); chamberBox.geometry.dispose(); chamberBox.material.dispose(); }
    const { zNear, zFar, xHalf, top } = L.chamber;
    const z0 = L.glass[2] - 0.12, z1 = zFar - 1.2, y0 = -4, y1 = top;
    const geo = new THREE.BoxGeometry(xHalf * 2 - 0.4, y1 - y0, z0 - z1);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { c.copy(CHAMBER_BOTTOM).lerp(CHAMBER_TOP, (pos.getY(i) / (y1 - y0) + 0.5)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    chamberBox = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
    chamberBox.name = 'guest_chamber';
    chamberBox.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
    mistGroup.add(chamberBox);
  }
  function buildMist(L, n) {
    for (const l of layers) { mistGroup.remove(l.mesh); l.mesh.geometry.dispose(); l.mesh.material.dispose(); }
    layers.length = 0;
    if (!mistTex) mistTex = mistTexture(512, 7);
    if (!glowTex) glowTex = glowTexture(256);
    buildChamber(L);
    const { zNear, zFar, xHalf, top } = L.chamber;
    const w = xHalf * 2 + 12, h = top + 8;
    for (let k = 0; k < n; k++) {
      const f = n > 1 ? k / (n - 1) : 1;                       // 0 near the glass … 1 at the far wall
      const z = THREE.MathUtils.lerp(zNear + 1.2, zFar - 0.6, f);
      const color = f < 0.5 ? MIST_NEAR.clone().lerp(MIST_MID, f * 2) : MIST_MID.clone().lerp(MIST_FAR, (f - 0.5) * 2);
      const mat = new THREE.MeshBasicMaterial({ map: mistTex, color, transparent: true, depthWrite: false, fog: false, opacity: 0.34 + 0.16 * f, toneMapped: true });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set(0, top / 2 - 1, z);
      mesh.scale.x = k % 2 ? -1 : 1;                           // mirror every other layer: no repeating shapes
      mesh.name = 'guest_mist_' + k;
      mistGroup.add(mesh);
      layers.push({ mesh, k, n, f, phase: k * 1.7, speed: 0.012 + 0.01 * ((k * 7) % 3), baseOpacity: mat.opacity, baseX: 0, baseY: mesh.position.y });
    }
    if (!glow) {
      glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: BACKLIGHT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.4 }));
      glow.name = 'guest_backlight';
      mistGroup.add(glow);
    }
    glow.position.set(0, L.glass[1] + 2.5, zFar + 0.4);
    glow.scale.set(xHalf * 3.2, top * 1.6, 1);
  }

  // ---- the Guests: skinned clones with their clips, per-Guest materials for the depth veil ----
  const guests = [];           // by slot: {root, model, mixer, actions, mats:{nacre:[], membrane:[], core:[]}, bones:{sails:[], crests:[]}, current, hCenter, tip}
  let guestTemplate = null, guestClips = [], guestLoading = false, guestBounds = { height: 0, center: 0 };
  let wantGuests = 0;
  async function loadGuests() {
    if (guestTemplate || guestLoading || !MODEL_FILES.guest) return;
    guestLoading = true;
    try {
      const { gltf } = await fetchGltf('guest');
      upgradeAssetMaterials('guest', gltf.scene);
      guestTemplate = gltf.scene;
      guestClips = gltf.animations || [];
      guestTemplate.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(guestTemplate);
      const coreNode = guestTemplate.getObjectByName('socket_core');
      const chest = coreNode ? coreNode.getWorldPosition(new THREE.Vector3()).y - guestTemplate.getWorldPosition(new THREE.Vector3()).y : (box.max.y + box.min.y) / 2;
      guestBounds = { height: box.max.y - box.min.y, center: (box.max.y + box.min.y) / 2, bottom: box.min.y, chest };
      ensureGuests();
    } catch (e) { console.warn('[play] guest model failed', e); }
    guestLoading = false;
  }
  /** Clones up to the number of Guests the stage wants (the drawing Guest first). */
  function ensureGuests() {
    if (!guestTemplate) return;
    for (const slot of stage.slots) {
      if (guests[slot]) continue;
      const m = cloneSkinned(guestTemplate);
      const mats = { nacre: [], membrane: [], core: [] };
      const seen = new Map();
      m.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; // the skinned bounds lag the pose
        const own = (mat) => { if (!seen.has(mat)) seen.set(mat, mat.clone()); return seen.get(mat); };
        o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
        for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
          const nm = (mat.name || o.name || '').toLowerCase();
          if (/core/.test(nm)) mats.core.push(mat); else if (/membrane/.test(nm)) mats.membrane.push(mat); else mats.nacre.push(mat);
          mat.userData.base = { emissive: mat.emissiveIntensity ?? 1, opacity: mat.opacity ?? 1, env: mat.envMapIntensity ?? 1 };
        }
      });
      const bones = { sails: [], crests: [] };
      m.traverse((o) => { if (/^sail_[lr]\d_1$/.test(o.name)) bones.sails.push(o); else if (/^crest\d_1$/.test(o.name)) bones.crests.push(o); });
      const mixer = guestClips.length ? new THREE.AnimationMixer(m) : null;
      const actions = {};
      if (mixer) for (const c of guestClips) {
        const a = mixer.clipAction(c);
        if (c.name === 'react') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
        a.enabled = true; a.setEffectiveWeight(c.name === 'idle' ? 1 : 0); a.play();
        actions[c.name] = a;
      }
      const g = { slot, root: new THREE.Group(), model: m, mixer, actions, mats, bones, current: 'idle', tip: m.getObjectByName('socket_draw_tip') || null, coreNode: m.getObjectByName('socket_core') || null };
      // The one-shot reaction hands back to idle on its own.
      if (mixer) mixer.addEventListener('finished', (e) => { if (e.action === actions.react) { actions.react.fadeOut(0.6); if (actions.idle) actions.idle.reset().fadeIn(0.6).play(); g.current = 'idle'; } });
      g.root.name = 'guest_' + slot;
      g.root.add(m);
      root.add(g.root);
      guests[slot] = g;
    }
  }

  const layout = () => (interior.isReal ? REAL : GREY);
  let lastReal = null, lastLayers = -1;
  function applyLayout() {
    const L = layout();
    const n = QUALITY[stage.quality].mistLayers;
    if (lastReal === interior.isReal && lastLayers === n) return;
    lastReal = interior.isReal; lastLayers = n;
    glyph.position.set(L.glass[0], L.glass[1], L.glass[2] + 0.06);
    const s = Math.min(L.glassSize[0], L.glassSize[1]) * 0.92;
    glyph.scale.set(s / 6.4, s / 6.4, 1);
    buildMist(L, n);
    fill.position.set(0, L.glass[1] + 3.5, L.chamber.zNear + 0.6);
    back.position.set(0, L.glass[1] + 6.5, L.chamber.zFar + 2.2);
    core.position.set(0, L.glass[1], L.chamber.zNear - 1.5);
  }
  applyLayout();

  let active = false, shellNo = 1;
  let sign = null, drawStart = 0, answer = null, answerAt = -10;
  root.visible = false;

  /** World-space point of a Guest's chest (for sound and the camera). */
  const _v = new THREE.Vector3();
  function chestWorld(g, out = new THREE.Vector3()) {
    if (g.coreNode) return g.coreNode.getWorldPosition(out);
    return out.copy(g.root.position).add(root.position).setY(root.position.y + g.root.position.y + guestBounds.center * g.root.scale.x);
  }

  const guestsApi = {
    /** The pure stage (play/guests-stage.js): cues, seed, quality, reduced motion, state. */
    stage,
    get loaded() { return !!guestTemplate && guests.filter(Boolean).length >= stage.count; },
    /** A moment for the trailer and QA: cue('sign' | 'reveal' | 'crisis' | 'vote' | 'yes' | 'no' | 'drift', { action, force }). */
    cue(name, opts = {}) { return stage.cue(name, { force: true, ...opts }); },
    setSeed(seed) { stage.setSeed(seed); },
    /** QA and stills: run the stage ahead by `seconds` without waiting for frames. */
    warp(seconds) { return stage.warp(seconds); },
    setQuality(q) { if (q !== stage.quality) { stage.setQuality(q); lastLayers = -1; ensureGuests(); } },
    setReducedMotion(on) { stage.setReducedMotion(on); },
    /** Camera framing hint 0..1 (presentation.js eases the rig toward the key-art shot by this much). */
    cameraHint() { return stage.camera; },
    /** Sound swell 0..1 and where it comes from (world space), or null when nothing emerges. */
    swell() {
      const slot = stage.guests.indexOf(stage.nearest);
      const g = slot >= 0 ? guests[slot] : null;
      return { level: stage.swell, position: g ? chestWorld(g, _v).toArray() : null };
    },
    /** Numbers for QA and the console (window.__ftf.play.shell.guests.state()). */
    state() {
      const g1 = guests[DRAWING_SLOT];
      return {
        ...stage.state, loaded: this.loaded, models: guests.filter(Boolean).length, layers: layers.length, real: interior.isReal,
        bounds: guestBounds, tip: g1 && g1.tip ? g1.tip.getWorldPosition(new THREE.Vector3()).sub(root.position).toArray().map((v) => +v.toFixed(2)) : null,
        placed: guests.map((g) => (g ? { slot: g.slot, pos: g.root.position.toArray().map((v) => +v.toFixed(2)), scale: +g.root.scale.x.toFixed(2), clip: g.current } : null)),
      };
    },
  };

  const api = {
    origin: SHELL_ORIGIN,
    world, interior, root, guests: guestsApi,
    get active() { return active; },
    get shell() { return shellNo; },
    /** Shows the interior for Shell n (one interior serves all four in this slice). */
    activate(n) {
      active = true; shellNo = n; root.visible = true;
      loadGuests(); ensureGuests();
      stage.enter(n);
      // A sign waiting in this Shell: the drawing Guest comes to the glass and draws it for the visitor.
      if (sign) drawStart = stage.cue('sign') ? stage.now + 4.5 : stage.now;
    },
    deactivate() { active = false; root.visible = false; stage.exit(); },
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
      sign = next; drawStart = stage.now;
      // Inside: the drawing Guest approaches first, the ink follows once it is at the glass.
      if (sign && active && stage.cue('sign')) drawStart = stage.now + 4.5;
      void t;
    },
    /** A yes/no answer from the Guests: posture and light. */
    answer(yes) { answer = yes; answerAt = stage.now; stage.cue(yes ? 'yes' : 'no'); },
    update(playT, dt, reducedMotion) {
      if (!active) return;
      applyLayout();
      if (reducedMotion !== stage.reducedMotion) stage.setReducedMotion(reducedMotion);
      const L = layout();
      const st = stage.update(playT, dt);
      const t = stage.now; // the stage clock (the play clock, plus a QA warp)
      const m = reducedMotion ? 0 : 1;
      // Drawing progress: 7 s per sign, the dots first, the ring last, then a slow turn.
      const progress = sign ? (reducedMotion ? 1 : Math.min(1, Math.max(0, (t - drawStart) / 7))) : 0;
      const since = t - answerAt;
      const fade = answer === false && since < 3 ? Math.max(0.15, 1 - since / 1.5) : 1;
      if (sign) drawLogogram(ctx, sign, { size: 1024, progress, turn: true, time: t, ink: '#f6ecd0', glow: 'rgba(240, 200, 120, 0.9)' });
      else ctx.clearRect(0, 0, 1024, 1024);
      glyphMat.opacity = fade;
      tex.needsUpdate = true;

      // Mist: slow sway (churn speeds it), density and the thinning of the near layers; the backlight glow.
      const vol = QUALITY[stage.quality].volumetric;
      for (const l of layers) {
        const mat = l.mesh.material;
        const near = 1 - l.f;
        mat.opacity = Math.min(1, l.baseOpacity * st.mist.density * (1 - st.mist.thin * 0.7 * near * near));
        if (vol && m) {
          const ph = t * l.speed * (0.6 + st.mist.churn) + l.phase;
          l.mesh.position.x = l.baseX + Math.sin(ph) * 2.2 * (l.k % 2 ? -1 : 1);
          l.mesh.position.y = l.baseY + Math.cos(ph * 0.7 + 1.3) * 0.7;
        }
      }
      if (glow) glow.material.opacity = 0.22 + 0.55 * st.mist.backlight;
      back.intensity = 12 + 40 * st.mist.backlight;
      fill.intensity = 4 + 6 * st.mist.thin;

      // Guests: place by depth, rise and scale; veil by depth; clips and the sail layer.
      const g1 = stage.guests[DRAWING_SLOT];
      core.intensity = 2 + 46 * Math.max(0, g1.light - 0.25) * g1.fade;
      if (guests[DRAWING_SLOT]) core.position.copy(guests[DRAWING_SLOT].root.position).setY(L.glass[1] + 0.5).setZ(guests[DRAWING_SLOT].root.position.z + 1.2);
      for (let i = 0; i < SLOTS; i++) {
        const g = guests[i];
        if (!g) continue;
        const s = st.guests[i];
        g.root.visible = s.fade > 0.02;
        if (!g.root.visible) continue;
        const [bx] = L.guests[i];
        const z = THREE.MathUtils.lerp(L.chamber.zFar, L.chamber.zNear, s.depth);
        const scale = s.scale;
        // The chest sits a little under the window's centre plus the rise, whatever the scale: the sails and the
        // crown fill the window, the tendrils hang below the sill.
        const y = L.glass[1] - 1.2 + s.rise - guestBounds.chest * scale + (0.08 + 0.05 * Math.sin(t * 0.5 + i * 2.1)) * m;
        g.root.position.set(bx + s.x, y, z);
        g.root.scale.setScalar(scale);
        // Facing: toward the standing spot, offset by the stage's face (0 = squarely at the visitor).
        const yawTo = Math.atan2(L.stand[0] - g.root.position.x, L.stand[1] - z);
        g.root.rotation.y = yawTo + s.face + 0.04 * Math.sin(t * 0.21 + i) * m;
        // Depth veil: the body darkens and loses its sheen deep in the mist; light lifts the emissive.
        const vis = THREE.MathUtils.smoothstep(s.depth, 0, 1) * s.fade;
        const dark = THREE.MathUtils.lerp(0.03, 0.55, vis);
        for (const mat of g.mats.nacre) {
          if (mat.color) mat.color.setScalar(dark);
          if ('emissiveIntensity' in mat) mat.emissiveIntensity = mat.userData.base.emissive * (0.05 + 0.6 * vis) * (0.3 + 0.7 * s.light);
          if ('envMapIntensity' in mat) mat.envMapIntensity = mat.userData.base.env * THREE.MathUtils.lerp(0.04, 0.5, vis);
        }
        for (const mat of g.mats.membrane) {
          mat.opacity = mat.userData.base.opacity * (0.35 + 0.65 * vis);
          if ('emissiveIntensity' in mat) mat.emissiveIntensity = mat.userData.base.emissive * (0.08 + 0.7 * vis) * (0.2 + 0.8 * s.light);
        }
        // A light pulse travels core to core; the answer and the moments lift or dim it.
        const ph = (i * 2 * Math.PI) / 3;
        const pulse = Math.max(0, Math.sin(t * 1.8 - ph));
        for (const mat of g.mats.core) if ('emissiveIntensity' in mat) mat.emissiveIntensity = (0.25 + 1.6 * pulse * pulse) * (0.3 + 1.4 * s.light) * (0.2 + 0.8 * vis);
        // Clips: idle, the draw loop while a sign forms, a one-shot reaction; huge bodies move slowly.
        if (g.mixer) {
          const want = s.clip;
          if (want !== g.current && g.actions[want]) {
            const from = g.actions[g.current];
            if (want === 'react') { g.actions.react.reset().setEffectiveWeight(1).fadeIn(0.4).play(); if (from && from !== g.actions.react) from.fadeOut(0.5); }
            else { if (from) from.fadeOut(0.8); g.actions[want].reset().setEffectiveWeight(1).fadeIn(0.8).play(); }
            g.current = want;
          }
          const rate = (0.9 / Math.sqrt(Math.max(0.6, scale))) * (reducedMotion ? 0.6 : 1) * (1 + 0.1 * Math.max(0, st.mist.churn - 1));
          g.mixer.timeScale = rate;
          g.mixer.update(dt);
        }
        // Sails spread with a "yes" and fold with a "no" or a storm (after the mixer wrote the pose).
        const open = Math.max(-0.9, Math.min(0.9, s.open));
        const sailScale = 1 + 0.28 * open, crestScale = 1 + 0.18 * open;
        for (const b of g.bones.sails) b.scale.setScalar(sailScale);
        for (const b of g.bones.crests) b.scale.setScalar(crestScale);
      }
    },
  };
  return api;
}
