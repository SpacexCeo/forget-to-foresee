// The Gate-Loom (story P1/P5, docs/plans/story/FTF-Story-Quests-Leaderboard-TZ.md §6.7): a portal standing where Iris
// arrived in the hill town, the goal of the Expedition. Procedural (no new art file): a woven gate (owner 12.11: "more
// mystical"): a dark weathered stone arch on a stepped base with a bone-white inner band of glowing glyphs, loom
// threads strung across the opening, a slow swirling veil inside (one small shader: layered noise, deep indigo to
// teal, faint stars), drifting motes, a pool of light on the cobbles and one soft light; four states: dormant (fee
// not met: indigo veil, teal glyphs), ready (fee met: the veil opens gold, the glyphs burn gold), spent (after the
// twist: the veil is gone, the stone is cold), off (story flag off: nothing is created). E in reach shows its
// line through the town's prompt; in `ready` a confirmation says what happens before the fee is paid. Behind ?story=1.
import * as THREE from 'three';
import { createSay } from '../quests/say.js';
import { EXPEDITION } from '../game/expedition-config.js';

/** Town-local metres beside the spawn, to Iris's right in the first frame (the spawn is (0, 0, 25), she faces -z). */
export const PORTAL_TOWN = Object.freeze([4.4, 0, 24.8]);      // clear of the standing mirror at (2.8, 0, 21.5) and of the stall posts further right
export const PORTAL_REACH = 3;

/** The portal's state from the story phase and the balance (pure). */
export function portalState({ on = false, phase = 'off', balanceC = 0, onChainC = null, feeC = EXPEDITION.PORTAL_FEE_C } = {}) {
  if (!on || phase === 'off') return 'off';
  if (phase === 'twist' || phase === 'onward') return 'spent';
  return (onChainC ?? balanceC) >= feeC ? 'ready' : 'dormant'; // ready when the silk ON CHAIN covers the fee (sprint §4.12)
}

/**
 * The prompt line for a state (sprint §4.12): {key, args}. The fee always comes in as feeC (from config or gate_price),
 * never a literal. onChainC: silk on chain; totalC: everything that counts once synced (on chain + verified pending).
 */
export function portalPrompt(state, { balanceC = 0, onChainC = null, totalC = null, feeC = EXPEDITION.PORTAL_FEE_C, blocker = null, payError = null, paying = false, syncing = false } = {}) {
  const whole = (c) => { const v = Math.floor(c / 100); return v.toLocaleString('en-US'); };
  const chainC = onChainC ?? balanceC, allC = Math.max(totalC ?? balanceC, chainC);
  const fee = Math.round(feeC / 100).toLocaleString('en-US'), gate = whole(chainC), total = whole(allC);
  if (state === 'spent') return { key: 'story.portal.quiet', args: {} };
  if (paying) return { key: 'story.portal.paying', args: {} };
  if (syncing) return { key: 'story.portal.syncing', args: {} };
  if (blocker === 'need_guest') return { key: 'story.portal.needGuest', args: {} };
  if (blocker && blocker !== 'loading') return { key: 'story.portal.offline', args: {} };
  if (payError) return { key: 'story.portal.failed', args: { fee } };
  if (state === 'ready') return { key: 'story.portal.pay', args: { fee } };
  if (allC >= feeC) return { key: 'story.portal.syncable', args: { total, gate, fee } };
  return { key: 'story.portal.wants', args: { fee, gate } };
}

const LOOK = Object.freeze({
  dormant: { deep: 0x140a3a, bright: 0x2fb8b0, glyph: 0x39d6c4, light: 0x6a72ff, intensity: 1.3, veil: 0.78, pool: 0.22 },
  ready: { deep: 0x3a1a08, bright: 0xffd27a, glyph: 0xffc861, light: 0xffc861, intensity: 3.2, veil: 0.95, pool: 0.5 },
  spent: { deep: 0x05070a, bright: 0x1c2630, glyph: 0x0c0f12, light: 0x334048, intensity: 0, veil: 0.1, pool: 0 },
});

/** The gate's outline: a tall pointed arch from one foot over the top to the other (x across, y up), metres. */
function archPoints(n = 40, w = 1.25, h = 3.05) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = Math.PI * (1 - u), k = Math.sin(a);
    pts.push(new THREE.Vector3(Math.cos(a) * w * (0.86 + 0.14 * k), 0.12 + k * h * (0.74 + 0.26 * k), 0));
  }
  return pts;
}

/** A band of glyphs for the inner arch: strokes scattered along a strip (no canvas: a small data texture). */
function glyphTexture(w = 256, h = 16) {
  const d = new Uint8Array(w * h * 4); let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let g = 0; g < 26; g++) {
    const x0 = Math.floor((g + 0.2) * w / 26), strokes = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < strokes; k++) {
      let x = x0 + Math.floor(rnd() * 5), y = 2 + Math.floor(rnd() * 5); const dx = rnd() < 0.5 ? 0 : (rnd() < 0.5 ? 1 : -1), len = 4 + Math.floor(rnd() * 7);
      for (let i = 0; i < len && y < h - 2; i++, y++) { if (i % 3 === 2) x += dx; const j = (y * w + Math.max(0, Math.min(w - 1, x))) * 4; d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = 255; }
    }
  }
  const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat); t.wrapS = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

const VEIL_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const VEIL_FRAG = /* glsl */`
  uniform float uTime, uOpacity, uFlare; uniform vec3 uDeep, uBright; varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x);
    // a slow whirl: the angle is dragged round more near the middle, two layers of noise drift through it
    float sw = a + 2.2 / (0.35 + r) + uTime * 0.22;
    vec2 q = vec2(cos(sw), sin(sw)) * r * 2.4;
    float n = noise(q + uTime * 0.07) * 0.6 + noise(q * 2.3 - uTime * 0.11) * 0.4;
    float weave = 0.5 + 0.5 * sin(vUv.y * 90.0 + n * 6.0);                 // the cloth of the loom, faint
    vec3 c = mix(uDeep, uBright, smoothstep(0.25, 0.95, n) * (0.55 + 0.45 * (1.0 - r)));
    c += uBright * 0.12 * weave * (1.0 - r);
    float star = step(0.9965, hash(floor(vUv * 150.0))) * (0.5 + 0.5 * sin(uTime * 2.0 + hash(floor(vUv * 150.0) + 3.0) * 40.0));
    c += vec3(0.85, 0.9, 1.0) * star * 0.8;
    c = mix(c, vec3(1.0), uFlare);
    gl_FragColor = vec4(c, uOpacity * (0.82 + 0.18 * n));
  }`;

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene @param {number[]} o.position world position (on the ground) @param {number} [o.facing] heading (rad)
 * @param {object} o.i18n @param {() => {phase: string, balanceC: number, feeC: number, demo: boolean}} o.read live story facts
 * @param {() => void} o.onPay pays the fee (the story's PAY_GATE) after the confirmation
 * @param {boolean} [o.reducedMotion] @param {boolean} [o.light] one point light (off on the phone / low tier)
 * @param {Document} [o.doc]
 */
export function createTownPortal({ scene, position, facing = 0, i18n, read, onPay, onSync = null, reducedMotion = false, light = true, doc = globalThis.document }) {
  const t = createSay(i18n); // the sprint's English copy (play/locales/en-quests.js), the locale otherwise
  const root = new THREE.Group(); root.name = 'story_portal';
  root.position.set(position[0], position[1], position[2]); root.rotation.y = facing;
  const disposables = [];
  const own = (x) => { disposables.push(x); return x; };
  // the arch: dark weathered stone, faceted; inside it a thinner bone-white band that carries the glyphs
  const curve = new THREE.CatmullRomCurve3(archPoints());
  const stoneMat = own(new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.92, metalness: 0.0, flatShading: true }));
  const ring = new THREE.Mesh(own(new THREE.TubeGeometry(curve, 44, 0.2, 6, false)), stoneMat); ring.name = 'story_portal_ring';
  const glyphs = own(glyphTexture());
  const bandMat = own(new THREE.MeshStandardMaterial({ color: 0xd8d0be, roughness: 0.6, emissive: new THREE.Color(LOOK.dormant.glyph), emissiveMap: glyphs, emissiveIntensity: 1.4 }));
  const inner = new THREE.CatmullRomCurve3(archPoints(40, 1.08, 2.86));
  const band = new THREE.Mesh(own(new THREE.TubeGeometry(inner, 60, 0.07, 6, false)), bandMat); band.position.z = 0.02; band.name = 'story_portal_band';
  glyphs.repeat.set(3, 1);
  // a stepped base and two capstones at the feet
  const base = new THREE.Mesh(own(new THREE.BoxGeometry(3.4, 0.14, 1.3)), stoneMat); base.position.y = 0.07;
  const step = new THREE.Mesh(own(new THREE.BoxGeometry(2.9, 0.12, 0.9)), stoneMat); step.position.y = 0.2;
  const footGeo = own(new THREE.CylinderGeometry(0.3, 0.36, 0.5, 6));
  const feet = [-1, 1].map((sx) => { const m = new THREE.Mesh(footGeo, stoneMat); m.position.set(sx * 1.08, 0.5, 0); return m; });
  // loom threads: thin warp lines from the arch down to the step, a few of them slack
  const tp = [];
  for (let i = 0; i < 17; i++) {
    const x = -0.92 + i * 0.115, top = 0.12 + Math.sqrt(Math.max(0, 1 - (x / 1.08) ** 2)) * 2.86 * (0.74 + 0.26 * Math.sqrt(Math.max(0, 1 - (x / 1.08) ** 2))) - 0.08;
    const sag = i % 4 === 1 ? 0.05 : 0;
    tp.push(x, top, -0.03, x + sag, top * 0.5, -0.03, x + sag, top * 0.5, -0.03, x, 0.27, -0.03);
  }
  const threadGeo = own(new THREE.BufferGeometry()); threadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tp), 3));
  const threadMat = own(new THREE.LineBasicMaterial({ color: 0xcfe9e2, transparent: true, opacity: 0.42, depthWrite: false }));
  const threads = new THREE.LineSegments(threadGeo, threadMat);
  // the veil: an oval inside the arch, one small shader
  const discMat = own(new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uOpacity: { value: LOOK.dormant.veil }, uFlare: { value: 0 }, uDeep: { value: new THREE.Color(LOOK.dormant.deep) }, uBright: { value: new THREE.Color(LOOK.dormant.bright) } },
    vertexShader: VEIL_VERT, fragmentShader: VEIL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
  const veilShape = new THREE.Shape(archPoints(36, 1.04, 2.8).map((v) => new THREE.Vector2(v.x, v.y)));
  const veilGeo = own(new THREE.ShapeGeometry(veilShape, 1));
  { const pos = veilGeo.attributes.position, uv = veilGeo.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 2.2 + 0.5, (pos.getY(i) - 0.1) / 2.9); }
  const disc = new THREE.Mesh(veilGeo, discMat); disc.name = 'story_portal_disc'; disc.renderOrder = 2;
  // a pool of light on the cobbles (a flat additive gradient: the phone tier has no point light)
  const poolMat = own(new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(LOOK.dormant.light) }, uOpacity: { value: LOOK.dormant.pool } },
    vertexShader: VEIL_VERT, fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main() { float r = length(vUv * 2.0 - 1.0); gl_FragColor = vec4(uColor, uOpacity * pow(max(1.0 - r, 0.0), 1.6)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  const pool = new THREE.Mesh(own(new THREE.PlaneGeometry(5.2, 4.2)), poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.16, 0.9); pool.renderOrder = 1;
  root.add(base, step, ...feet, ring, band, threads, disc, pool);
  let glow = null;
  if (light) { glow = new THREE.PointLight(LOOK.dormant.light, LOOK.dormant.intensity, 7, 2); glow.position.set(0, 1.5, 0.7); root.add(glow); }
  let motes = null;
  if (!reducedMotion) {
    const n = 40, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { seed[i] = (i * 0.618) % 1; pos[i * 3] = (seed[i] * 2 - 1) * 1.15; pos[i * 3 + 1] = 0.4 + ((i * 0.381) % 1) * 2.6; pos[i * 3 + 2] = 0.15 + ((i * 0.733) % 1) * 0.9; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    motes = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfeee6, size: 0.06, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    motes.userData.seed = seed; root.add(motes);
  }
  scene.add(root);

  let state = 'dormant', panel = null, forced = null;
  const facts = () => read() || { phase: 'off', balanceC: 0, feeC: EXPEDITION.PORTAL_FEE_C, demo: false };
  function setLook(s) {
    if (s === state) return; state = s;
    const L = LOOK[s] || LOOK.dormant;
    discMat.uniforms.uDeep.value.setHex(L.deep); discMat.uniforms.uBright.value.setHex(L.bright); discMat.uniforms.uOpacity.value = L.veil; discMat.uniforms.uFlare.value = 0;
    bandMat.emissive.setHex(L.glyph); bandMat.emissiveIntensity = s === 'ready' ? 2.2 : s === 'spent' ? 0 : 1.4;
    threadMat.opacity = s === 'spent' ? 0.14 : 0.42; poolMat.uniforms.uColor.value.setHex(L.light); poolMat.uniforms.uOpacity.value = L.pool;
    if (glow) { glow.color.setHex(L.light); glow.intensity = L.intensity; }
  }

  function closePanel() { if (panel) { panel.remove(); panel = null; } }
  function confirm() {
    closePanel();
    const f = facts();
    panel = doc.createElement('div'); panel.className = 'ftf-portal-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;max-width:min(420px,calc(100vw - 32px));padding:18px 20px;border-radius:14px;'
      + 'background:rgba(12,16,18,.94);border:1px solid rgba(255,200,97,.55);color:#f3ead8;font:15px/1.45 system-ui,sans-serif;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.5)';
    const h = doc.createElement('h3'); h.textContent = t('story.portal.confirm.title'); h.style.cssText = 'margin:0 0 8px;font:600 17px/1.2 system-ui;color:#ffc861';
    const p = doc.createElement('p'); p.textContent = t('story.portal.confirm.body', { fee: Math.round(f.feeC / 100).toLocaleString('en-US') }); p.style.margin = '0 0 14px';
    const row = doc.createElement('div'); row.style.cssText = 'display:flex;gap:10px;justify-content:center';
    const mk = (key, fn, primary) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = t(key); b.style.cssText = 'min-height:44px;min-width:120px;padding:8px 16px;border-radius:10px;font:600 15px system-ui;cursor:pointer;' + (primary ? 'background:#ffc861;color:#1a1408;border:0' : 'background:transparent;color:#f3ead8;border:1px solid rgba(243,234,216,.4)'); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b; };
    const pay = mk('story.portal.confirm.pay', () => { closePanel(); onPay(); }, true);
    row.append(pay, mk('story.portal.confirm.no', closePanel, false));
    panel.append(h, p, row);
    doc.body.append(panel);
    if (pay.focus) pay.focus();
  }

  const spot = {
    id: 'portal',
    near: (pos) => { const at = root.position; return state !== 'off' && Math.hypot(pos[0] - at.x, pos[2] - at.z) <= PORTAL_REACH && Math.abs(pos[1] - at.y) < 3; }, // grounded later by the caller
    prompt: () => { const f = facts(); const p = portalPrompt(state, f); return t(p.key, p.args); },
    onInteract: () => {
      const f = facts();
      if (f.blocker || f.paying || f.syncing) return true;
      if (state === 'ready') confirm(); // pays on chain after the confirmation (rule R9)
      else if (portalPrompt(state, f).key === 'story.portal.syncable' && onSync) onSync(); // E moves the verified silk on chain
      return true;
    },
  };

  return {
    root, spot,
    get state() { return state; },
    get panelOpen() { return !!panel; },
    /** Per frame: the look follows the story and the balance; the disc breathes, the motes drift. */
    update(dt, time) {
      const f = facts();
      setLook(forced || portalState({ on: true, ...f }));
      if (state === 'spent') return;
      if (!reducedMotion) {
        const L = LOOK[state] || LOOK.dormant, breath = 0.9 + 0.1 * Math.sin(time * 1.3);
        discMat.uniforms.uTime.value = time * (state === 'ready' ? 1.6 : 1); discMat.uniforms.uOpacity.value = L.veil * breath;
        discMat.uniforms.uFlare.value = Math.max(0, discMat.uniforms.uFlare.value - dt * 0.8);
        poolMat.uniforms.uOpacity.value = L.pool * breath; bandMat.emissiveIntensity = (state === 'ready' ? 2.2 : 1.4) * (0.8 + 0.2 * Math.sin(time * 0.9));
        if (motes) {                                    // motes rise slowly through the gate and start again at its foot
          const pa = motes.geometry.attributes.position;
          for (let i = 0; i < pa.count; i++) { let y = pa.getY(i) + dt * (0.12 + 0.2 * motes.userData.seed[i]) * (state === 'ready' ? 2 : 1); if (y > 3.1) y = 0.35; pa.setY(i, y); }
          pa.needsUpdate = true;
        }
      }
    },
    /** The twist's flare (P5): the disc burns white for a moment. */
    flare(k = 1) { discMat.uniforms.uOpacity.value = 1; discMat.uniforms.uFlare.value = Math.min(1, 0.6 + 0.4 * k); if (glow) glow.intensity = 6 * k; },
    closePanel,
    /** QA (art/tools/props_sheet.mjs): hold a look whatever the story says; null lets the story decide again. */
    debugLook(s) { forced = LOOK[s] ? s : null; },
    /** Hidden while Iris is away from the town. */
    setActive(on) { root.visible = !!on; if (!on) closePanel(); },
    dispose() { closePanel(); scene.remove(root); for (const d of disposables) d.dispose(); if (motes) { motes.geometry.dispose(); motes.material.dispose(); } },
  };
}
