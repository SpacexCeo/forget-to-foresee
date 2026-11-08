// Inside a Shell: the closed interior (shell_interior.glb, greybox until it streams in), the Guests
// behind the glass wall (guest.glb) staged in a chamber of dense mist, and the logogram they draw on
// the glass. The interior lives in the same THREE.Scene as the island, high above it at SHELL_ORIGIN
// (a closed volume: walls and vault hide the sky; the height fog is negligible up there), with its
// own collision world, so the look-dev stack, the camera rig and the character controller are reused
// unchanged.
//
// The Guests (owner design input 08.11, docs/decisions.md): pale, soft, translucent creatures with a
// smooth domed head and two small dark eyes, a milky body with the inner core showing through, and
// long ink-black tendrils that bleed at the tips; sumi-ink greys on warm off-white. Nothing from any
// film. They are enormous, mostly hidden in the mist, backlit and low in contrast, and they emerge
// only at meaningful moments (play/guests-stage.js: a sign being drawn, a reveal, the trial-13 crisis,
// the vote, an answer; otherwise a seeded drift). The drawing Guest paints the logogram with its ink:
// a thread of ink runs from the drawing tendril to the pen point on the glass while the sign forms.
// They never face the visitor squarely except before the vote, move as one mind (a light pulse travels
// core to core) and answer with posture and light: a "yes" spreads the tendrils and lifts the core, a
// "no" draws them in and lets the drawn stroke dissolve. Presentation only: no rule is read here.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MODEL_FILES } from 'virtual:model-list';
import { CollisionWorld } from '../physics/collision.js';
import { PropInstance, fetchGltf } from '../render/assets.js';
import { upgradeAssetMaterials } from '../render/materials.js';
import { drawLogogram } from '../play/logogram.js';
import { GuestsStage, QUALITY, SLOTS, DRAWING_SLOT, resolveClip, inkPenPoint } from '../play/guests-stage.js';

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

/** Sumi-ink palette: warm off-white mist near the glass, grey deeper in, a soft pale light at the far end. */
const MIST_NEAR = new THREE.Color(0xb9b7ae), MIST_MID = new THREE.Color(0x8e9092), MIST_FAR = new THREE.Color(0x63676c);
const CHAMBER_TOP = new THREE.Color(0x4a4f55), CHAMBER_BOTTOM = new THREE.Color(0x7b7e7f);
const BACKLIGHT = new THREE.Color(0xf2ead8);
const INK = new THREE.Color(0x14171a);
/** The veil: deep in the mist a Guest loses contrast toward this grey (skin) and its ink thins. */
const VEIL = new THREE.Color(0x8f9294);
/** Where each slot's eyes sit relative to the window's centre line: the giants' domes fill the window, the drawing one rides higher so its tendrils clear the sill. */
const EYE_LINE = [0.6, 2.8, 0.6];

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

/**
 * The ink thread: streaks running along the length (u), dense at the tendril end, bleeding and breaking
 * up toward the glass like ink in water; soft across (v). An ink-bleed flipbook can replace it
 * (`guests.setInkTexture`).
 */
function inkTexture(w = 256, h = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  let s = 11;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const streaks = Array.from({ length: 9 }, () => ({ y: 0.2 + rnd() * 0.6, w: 0.03 + rnd() * 0.08, k: 0.4 + rnd() * 0.6, ph: rnd() * 6 }));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h;
    let a = 0;
    for (const st of streaks) {
      const cy = st.y + Math.sin(u * 7 + st.ph) * 0.06 * u;
      const d = Math.abs(v - cy) / (st.w * (0.6 + 1.6 * u));
      a += Math.exp(-d * d) * st.k * (1 - u * 0.55);
    }
    const across = 1 - Math.pow(Math.abs(v * 2 - 1), 3);
    const alpha = Math.min(1, a) * across * (1 - Math.pow(u, 6));
    const i = (y * w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(alpha * 255);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function createShellScene({ scene, streamer }) {
  const world = new CollisionWorld({ cellSize: 2 });
  const root = new THREE.Group();
  root.name = 'shell_scene';
  root.position.set(...SHELL_ORIGIN);
  scene.add(root);
  const interior = streamer.add(new PropInstance({ name: 'shell_interior', scene, world, position: SHELL_ORIGIN.slice(), rotationY: 0 }));

  // Interior light: amber floor glow in the hall; behind the glass a low cool fill, a pale backlight
  // deep in the mist (the Guests read as soft silhouettes against it) and the warm flare of the drawing core.
  const lights = new THREE.Group();
  const amberA = new THREE.PointLight(0xffb45a, 18, 16, 2); amberA.position.set(-3, 1.2, 2);
  const amberB = new THREE.PointLight(0xffb45a, 18, 16, 2); amberB.position.set(3, 1.2, -3);
  const fill = new THREE.PointLight(0xb9c3cc, 6, 26, 2);
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

  // The ink thread from the drawing tendril to the pen point on the glass (a ribbon facing the visitor).
  const inkMat = new THREE.MeshBasicMaterial({ map: inkTexture(), color: INK, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, opacity: 0 });
  const ink = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), inkMat);
  ink.name = 'guest_ink_thread';
  ink.renderOrder = 2;
  ink.visible = false;
  root.add(ink);

  // ---- the mist chamber: an inside-out grey box, layered noise planes and the backlight glow ----
  const stage = new GuestsStage({ seed: 'season', quality: 'high' });
  const mistGroup = new THREE.Group(); mistGroup.name = 'guest_mist';
  root.add(mistGroup);
  let mistTex = null, glowTex = null;
  const layers = [];   // {mesh, k, n, f, phase, speed, baseOpacity, baseX, baseY}
  let glow = null, chamberBox = null;
  /** The chamber: a box from the glass to past the far wall, darker toward the vault, so the nacre walls vanish. */
  function buildChamber(L) {
    if (chamberBox) { mistGroup.remove(chamberBox); chamberBox.geometry.dispose(); chamberBox.material.dispose(); }
    const { zFar, xHalf, top } = L.chamber;
    const z0 = L.glass[2] - 0.12, z1 = zFar - 1.2, y0 = -4, y1 = top;
    const geo = new THREE.BoxGeometry(xHalf * 2 - 0.4, y1 - y0, z0 - z1);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { c.copy(CHAMBER_BOTTOM).lerp(CHAMBER_TOP, pos.getY(i) / (y1 - y0) + 0.5); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
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
    glow.position.set(0, L.glass[1] + 2.2, zFar + 0.4);
    glow.scale.set(xHalf * 1.5, top * 0.8, 1);
  }

  // ---- the Guests: skinned clones with their clips, per-Guest materials for the depth veil ----
  const guests = [];           // by slot: {slot, root, model, mixer, actions, mats:{skin, core, ink}, bones:{tendrils, head}, current, tip, coreNode}
  let guestTemplate = null, guestClips = [], guestLoading = false, guestBounds = { height: 0, center: 0, chest: 0 };
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
      const originY = guestTemplate.getWorldPosition(new THREE.Vector3()).y;
      const coreNode = guestTemplate.getObjectByName('socket_core'), headNode = guestTemplate.getObjectByName('socket_head');
      const chest = coreNode ? coreNode.getWorldPosition(new THREE.Vector3()).y - originY : (box.max.y + box.min.y) / 2;
      const eyes = headNode ? headNode.getWorldPosition(new THREE.Vector3()).y - originY - 0.3 : box.max.y - 1.3;
      guestBounds = { height: box.max.y - box.min.y, center: (box.max.y + box.min.y) / 2, bottom: box.min.y, chest, eyes };
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
      const mats = { skin: [], core: [], ink: [] };
      const seen = new Map();
      m.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; // the skinned bounds lag the pose
        const own = (mat) => { if (!seen.has(mat)) seen.set(mat, mat.clone()); return seen.get(mat); };
        o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
        for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
          const nm = (mat.name || o.name || '').toLowerCase();
          const bucket = /core/.test(nm) ? mats.core : /ink|eye|membrane/.test(nm) ? mats.ink : mats.skin;
          if (!bucket.includes(mat)) bucket.push(mat);
          if (!mat.userData.base) mat.userData.base = { emissive: mat.emissiveIntensity ?? 1, opacity: mat.opacity ?? 1, env: mat.envMapIntensity ?? 1, color: mat.color ? mat.color.clone() : null, transmission: mat.transmission ?? 0, transparent: !!mat.transparent };
        }
      });
      const bones = { tendrils: [], head: m.getObjectByName('guest_head') || null };
      m.traverse((o) => { if (/^(guest_)?tendril_?\d+_1$/.test(o.name) || /^sail_[lr]\d_1$/.test(o.name)) bones.tendrils.push(o); });
      const mixer = guestClips.length ? new THREE.AnimationMixer(m) : null;
      const actions = {};
      if (mixer) for (const c of guestClips) {
        const a = mixer.clipAction(c);
        if (c.name === 'react' || c.name === 'approach' || c.name === 'recede') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
        a.enabled = true; a.setEffectiveWeight(c.name === 'idle' ? 1 : 0); a.play();
        actions[c.name] = a;
      }
      const g = { slot, root: new THREE.Group(), model: m, mixer, actions, mats, bones, current: 'idle', tip: m.getObjectByName('socket_draw_tip') || null, coreNode: m.getObjectByName('socket_core') || null };
      // A one-shot clip hands back to idle on its own.
      if (mixer) mixer.addEventListener('finished', (e) => { if (e.action !== actions.idle && e.action === actions[g.current]) { e.action.fadeOut(0.6); if (actions.idle) actions.idle.reset().fadeIn(0.6).play(); g.current = 'idle'; } });
      g.root.name = 'guest_' + slot;
      g.root.add(m);
      root.add(g.root);
      guests[slot] = g;
    }
    applyGuestQuality();
  }
  /** Low tier and phones: no transmission on the milky skin (plain alpha instead), the volumetric tricks are off. */
  function applyGuestQuality() {
    const vol = QUALITY[stage.quality].volumetric;
    for (const g of guests) {
      if (!g) continue;
      for (const mat of g.mats.skin) {
        if (!('transmission' in mat)) continue;
        const base = mat.userData.base;
        if (vol) { mat.transmission = base.transmission; mat.transparent = base.transparent; mat.opacity = base.opacity; }
        else { mat.transmission = 0; mat.transparent = true; mat.opacity = 0.92; }
        mat.needsUpdate = true;
      }
    }
    back.visible = vol;
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

  /** World-space point of a Guest's core (for sound and the camera). */
  const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
  function chestWorld(g, out = new THREE.Vector3()) {
    if (g.coreNode) return g.coreNode.getWorldPosition(out);
    return out.copy(g.root.position).add(root.position).setY(root.position.y + g.root.position.y + (guestBounds.chest || 0) * g.root.scale.x);
  }

  /** Lays the ink ribbon from the drawing tendril's tip to the pen point on the glass. */
  function layInk(L, progress, strength) {
    const g = guests[DRAWING_SLOT];
    const pen = sign ? inkPenPoint(sign, progress, 0.3 * 6.4 * glyph.scale.x) : null;
    const on = !!(g && g.tip && pen && strength > 0.02);
    ink.visible = on;
    if (!on) { inkMat.opacity = 0; return; }
    g.tip.getWorldPosition(_p).sub(root.position);                       // shell space
    _v.set(L.glass[0] + pen.x, L.glass[1] + pen.y, L.glass[2] + 0.04);  // the pen on the glass
    const dir = _v.clone().sub(_p);
    const len = dir.length();
    if (len < 0.05) { ink.visible = false; return; }
    ink.position.copy(_p).addScaledVector(dir, 0.5);
    // The ribbon runs along dir and faces the visitor (+Z): its plane spans dir and dir × Z.
    const along = dir.clone().normalize();
    let side = new THREE.Vector3().crossVectors(along, new THREE.Vector3(0, 0, 1));
    if (side.lengthSq() < 1e-4) side = new THREE.Vector3(1, 0, 0); else side.normalize();
    const normal = new THREE.Vector3().crossVectors(along, side).normalize();
    _m.makeBasis(along, side, normal);
    ink.quaternion.setFromRotationMatrix(_m);
    ink.scale.set(len, 0.55 + 0.35 * glyph.scale.x, 1);
    inkMat.opacity = 0.85 * strength;
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
    /** QA and stills: hold the stage clock (the ink progress and the poses stand still). */
    freeze(on = true) { stage.freeze(on); },
    setQuality(q) { if (q !== stage.quality) { stage.setQuality(q); lastLayers = -1; ensureGuests(); applyGuestQuality(); } },
    setReducedMotion(on) { stage.setReducedMotion(on); },
    /** Camera framing hint 0..1 (presentation.js eases the rig toward the key-art shot by this much). */
    cameraHint() { return stage.camera; },
    /** Sound swell 0..1 and where it comes from (world space), or null when nothing emerges. */
    swell() {
      const slot = stage.guests.indexOf(stage.nearest);
      const g = slot >= 0 ? guests[slot] : null;
      return { level: stage.swell, position: g ? chestWorld(g, _v).toArray() : null };
    },
    /** The ink thread's material (a bleed flipbook or shader can replace the map: `setInkTexture`). */
    get inkMaterial() { return inkMat; },
    setInkTexture(t) { if (inkMat.map && inkMat.map !== t) inkMat.map.dispose(); inkMat.map = t || null; inkMat.needsUpdate = true; },
    /** Clip names the loaded model offers (idle, draw, react, approach, recede when present). */
    get clips() { return guestClips.map((c) => c.name); },
    /** Numbers for QA and the console (window.__ftf.play.shell.guests.state()). */
    state() {
      const g1 = guests[DRAWING_SLOT];
      return {
        ...stage.state, loaded: this.loaded, models: guests.filter(Boolean).length, layers: layers.length, real: interior.isReal, clips: this.clips,
        bounds: guestBounds, ink: ink.visible ? +inkMat.opacity.toFixed(2) : 0,
        tip: g1 && g1.tip ? g1.tip.getWorldPosition(new THREE.Vector3()).sub(root.position).toArray().map((v) => +v.toFixed(2)) : null,
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
    deactivate() { active = false; root.visible = false; ink.visible = false; stage.exit(); },
    get ready() { return interior.isReal; },
    /** World-space spawn point and yaw for the current interior (real art or greybox). */
    spawn() { const L = layout(); return { pos: [SHELL_ORIGIN[0] + L.spawn[0], SHELL_ORIGIN[1] + L.spawn[1], SHELL_ORIGIN[2] + L.spawn[2]], heading: Math.PI }; },
    /** Local (shell-space) glass standing spot for the interaction layer. */
    spots() { const L = layout(); return { glass: L.stand.slice(), radius: 4 }; },
    toLocal(p) { return [p[0] - SHELL_ORIGIN[0], p[1] - SHELL_ORIGIN[1], p[2] - SHELL_ORIGIN[2]]; },
    /** The Guest starts drawing a sign ({forms, dots}); null clears the glass. */
    setSign(next) {
      const same = (!next && !sign) || (sign && next && sign.forms.join() === next.forms.join() && sign.dots === next.dots);
      if (same) return;
      sign = next ? { forms: next.forms.slice(), dots: next.dots } : null; drawStart = stage.now;
      // Inside: the drawing Guest approaches first, the ink follows once it is at the glass.
      if (sign && active && stage.cue('sign')) drawStart = stage.now + 4.5;
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
      if (glow) glow.material.opacity = 0.1 + 0.3 * st.mist.backlight;
      back.intensity = 6 + 22 * st.mist.backlight;
      fill.intensity = 3 + 5 * st.mist.thin;

      // Guests: place by depth, rise and scale; veil by depth; clips and the tendril layer.
      const g1 = st.guests[DRAWING_SLOT];
      core.intensity = 1 + 14 * Math.max(0, g1.light - 0.25) * g1.fade;
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
        // The eyes sit on the slot's eye line plus the rise, whatever the scale: the giants' domes fill the window,
        // the drawing Guest rides higher so its tendrils and the ink stay above the sill.
        const y = L.glass[1] + EYE_LINE[i] + s.rise - guestBounds.eyes * scale + (0.08 + 0.05 * Math.sin(t * 0.5 + i * 2.1)) * m;
        g.root.position.set(bx + s.x, y, z);
        g.root.scale.setScalar(scale);
        // Facing: the dome toward the standing spot, offset by the stage's face (0 = squarely at the visitor).
        const yawTo = Math.atan2(L.stand[0] - g.root.position.x, L.stand[1] - z);
        g.root.rotation.y = yawTo + s.face + 0.04 * Math.sin(t * 0.21 + i) * m;
        // Depth veil: deep in the mist the milky skin loses contrast toward the mist grey and its sheen, and the
        // ink thins; light lifts the inner core.
        const vis = THREE.MathUtils.smoothstep(s.depth, 0, 1) * s.fade;
        for (const mat of g.mats.skin) {
          const base = mat.userData.base;
          if (mat.color && base.color) mat.color.copy(VEIL).lerp(base.color, 0.25 + 0.75 * vis);
          if ('emissiveIntensity' in mat) mat.emissiveIntensity = base.emissive * (0.05 + 0.6 * vis) * (0.3 + 0.7 * s.light);
          if ('envMapIntensity' in mat) mat.envMapIntensity = base.env * THREE.MathUtils.lerp(0.08, 0.6, vis);
        }
        for (const mat of g.mats.ink) {
          const base = mat.userData.base;
          mat.opacity = base.opacity * (0.3 + 0.7 * vis);
          if (mat.color && base.color) mat.color.copy(VEIL).lerp(base.color, 0.35 + 0.65 * vis);
        }
        // A light pulse travels core to core; the answer and the moments lift or dim it.
        const ph = (i * 2 * Math.PI) / 3;
        const pulse = Math.max(0, Math.sin(t * 1.8 - ph));
        for (const mat of g.mats.core) if ('emissiveIntensity' in mat) mat.emissiveIntensity = mat.userData.base.emissive * (0.6 + 2.4 * pulse * pulse) * (0.3 + 1.6 * s.light) * (0.25 + 0.75 * vis);
        // Clips: idle, approach and recede while travelling, the draw loop while a sign forms, a one-shot
        // reaction; a model without a clip falls back along CLIP_FALLBACK. Huge bodies move slowly.
        if (g.mixer) {
          const want = resolveClip(s.clip, g.actions) || 'idle';
          if (want !== g.current && g.actions[want]) {
            const from = g.actions[g.current];
            const once = want === 'react' || want === 'approach' || want === 'recede';
            if (from && from !== g.actions[want]) from.fadeOut(once ? 0.5 : 0.8);
            g.actions[want].reset().setEffectiveWeight(1).fadeIn(once ? 0.4 : 0.8).play();
            g.current = want;
          }
          const rate = (0.9 / Math.sqrt(Math.max(0.6, scale))) * (reducedMotion ? 0.6 : 1) * (1 + 0.1 * Math.max(0, st.mist.churn - 1));
          g.mixer.timeScale = rate;
          g.mixer.update(dt);
        }
        // Tendrils spread with a "yes" and draw in with a "no" or a storm (after the mixer wrote the pose).
        const open = Math.max(-0.9, Math.min(0.9, s.open));
        const spread = 1 + 0.22 * open;
        for (const b of g.bones.tendrils) b.scale.set(spread, 1 + 0.12 * open, spread);
        // The dome tilts a little toward the visitor when the Guest is near.
        if (g.bones.head) { _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.12 * vis * (0.5 + 0.5 * s.light)); g.bones.head.quaternion.multiply(_q); }
      }
      // The ink runs from the drawing tendril onto the glass while the strokes form.
      const inkStrength = sign && g1.depth > 0.55 ? Math.min(1, (g1.depth - 0.55) / 0.25) * g1.fade * fade : 0;
      layInk(L, progress, inkStrength);
    },
  };
  return api;
}
