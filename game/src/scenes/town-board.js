// The Shell monument (story K2, docs/leaderboard.md): a nacre spiral shell floating over its anchor (owner 14.11: no
// plinth; it bobs on a damped spring and swings away when walked into, then settles back) (owner 12.11:
// "more mystical"): the whorls shift between pearl, rose and sea-green, the mouth of the shell glows from inside
// and breathes, its lip is engraved. Beside the spawn opposite the Gate-Loom. Procedural
// (no new art file, no extra pass). E in reach ("Read the Shell") opens the board
// panel (ui/board-panel.js): the latest snapshot (game/public/board/latest.json, else the relayer's /api/board/latest)
// and the player's own row recomputed from the local expedition log. Behind ?story=1 (boot-world loads it lazily).
import * as THREE from 'three';
import { scoreAccount } from '../game/board-score.js';
import { renderBoardPanel } from '../ui/board-panel.js';

/** Town-local metres: to Iris's left in the first frame, mirroring the Gate-Loom (4, 0, 22.5) across the spawn path. */
/** The shell's float: height of its lowest whorl over the cobbles, and its spring (stiffness, damping, her push, reach, leash). */
export const SHELL_FLOAT_Y = 0.55;
export const SPRING = Object.freeze({ k: 14, c: 2.6, push: 42, reach: 1.0, max: 0.9 });
export const BOARD_TOWN = Object.freeze([-4, 0, 22.5]);
export const BOARD_REACH = 2.6;

/** A snapshot is shown only if it has the expected shape (pure); anything else falls back to the local preview. */
export function validSnapshot(s) {
  return !!(s && s.v === 1 && Array.isArray(s.rows) && typeof s.root === 'string' && /^[0-9a-f]{64}$/.test(s.root)
    && s.rows.every((r) => r && typeof r.account === 'string' && Number.isFinite(r.score) && Number.isFinite(r.rank) && (r.actor === 'human' || r.actor === 'scripted')));
}

/** Loads the latest snapshot: the published file first, then the relayer; null when neither answers. */
export async function loadSnapshot({ base = '/', relayer = null, fetch = globalThis.fetch, timeoutMs = 6000, report = null } = {}) {
  let answered = false; // some source answered (even 404): not offline
  const urls = [base.replace(/\/?$/, '/') + 'board/latest.json'];
  if (relayer) urls.push(relayer.replace(/\/$/, '') + '/api/board/latest');
  for (const url of urls) {
    try {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
      const r = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      if (timer) clearTimeout(timer);
      if (r) answered = true;
      if (!r || !r.ok) continue;
      const s = await r.json();
      if (validSnapshot(s)) return s;
    } catch { /* offline or none published: try the next source */ }
  }
  if (report) report.offline = !answered;
  return null;
}

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene @param {number[]} o.position world position @param {number} [o.facing]
 * @param {object} o.i18n @param {() => object[]} o.log the local expedition log (town-quests ledger.log)
 * @param {() => Promise<object|null>} [o.load] snapshot loader (loadSnapshot bound to the page's base and relayer)
 * @param {string} [o.account] the player's account id, when known @param {Document} [o.doc]
 */
export function createTownBoard({ scene, position, facing = 0, i18n, log = () => [], load = async () => null, account = null, doc = globalThis.document, win = globalThis }) {
  const t = (k, a) => i18n.t(k, a);
  const root = new THREE.Group(); root.name = 'story_shell_board';
  root.position.set(position[0], position[1], position[2]); root.rotation.y = facing;
  const disposables = [];
  const own = (x) => { disposables.push(x); return x; };
  const nacre = own(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.24, metalness: 0.22, emissive: new THREE.Color(0x1c2a2c), emissiveIntensity: 0.35 }));
  const seamMat = own(new THREE.MeshBasicMaterial({ color: 0x8fe2d6, toneMapped: false }));
  // the shell: a tube wound on a growing spiral (2.6 turns), its radius growing with it; colours shift along the whorls
  const TURNS = 2.6, NU = 96, NV = 14, pos = [], col = [], idx = [], c = new THREE.Color();
  const frame = (u) => { const th = u * TURNS * Math.PI * 2, R = 0.045 * Math.exp(0.42 * th / (Math.PI)) , r = R * 0.62; return { th, R, r }; };
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, { th, R, r } = frame(u), cx = Math.cos(th) * R, cy = Math.sin(th) * R, z0 = (1 - u) * 0.34;          // the apex stands out to one side
    for (let j = 0; j <= NV; j++) {
      const v = (j / NV) * Math.PI * 2, rr = r * (1 + 0.06 * Math.sin(v * 5 + th * 3));                                  // faint ribs
      pos.push(cx + Math.cos(th) * Math.cos(v) * rr, cy + Math.sin(th) * Math.cos(v) * rr, z0 + Math.sin(v) * rr);
      c.setHSL((0.48 + 0.34 * Math.sin(th * 0.9 + v * 0.6)) % 1, 0.42, 0.78 + 0.08 * Math.sin(v * 2 + th)); col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a0 = i * (NV + 1) + j, b0 = a0 + NV + 1; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
  const shellGeo = own(new THREE.BufferGeometry()); shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); shellGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); shellGeo.setIndex(idx); shellGeo.computeVertexNormals();
  const end = frame(1), shell = new THREE.Group();
  const body = new THREE.Mesh(shellGeo, nacre); nacre.side = THREE.DoubleSide;
  // the mouth: an inner glow and an engraved lip around it
  const mouthAt = new THREE.Vector3(Math.cos(end.th) * end.R, Math.sin(end.th) * end.R, 0), mouthDir = new THREE.Vector3(-Math.sin(end.th), Math.cos(end.th), 0);
  const glowMat = own(new THREE.MeshBasicMaterial({ color: 0x9ff0e2, transparent: true, opacity: 0.85, toneMapped: false, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  const mouth = new THREE.Mesh(own(new THREE.CircleGeometry(end.r * 0.92, 24)), glowMat); mouth.position.copy(mouthAt).addScaledVector(mouthDir, -0.03); mouth.lookAt(mouthAt.clone().add(mouthDir));
  const seam = new THREE.Mesh(own(new THREE.TorusGeometry(end.r * 1.02, 0.03, 6, 32)), seamMat); seam.position.copy(mouthAt); seam.lookAt(mouthAt.clone().add(mouthDir));
  shell.add(body, mouth, seam);
  // the widest whorl down, the mouth turned up toward the visitor
  const box = new THREE.Box3().setFromBufferAttribute(shellGeo.attributes.position);
  shell.rotation.z = -end.th + Math.PI * 0.62; shell.position.set(0, 0.64 + (box.max.y - box.min.y) * 0.5, 0); shell.rotation.y = 0.35;
  // a soft pool of light on the cobbles: a radial falloff, never a flat disc
  const halo = own(new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(0x7fdccf) }, uOpacity: { value: 0.2 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; void main() { float r = length(vUv * 2.0 - 1.0); gl_FragColor = vec4(uColor, uOpacity * pow(max(1.0 - r, 0.0), 2.0)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
  const pool = new THREE.Mesh(own(new THREE.PlaneGeometry(4.4, 4.4)), halo); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.03;
  // no plinth (owner 14.11): the shell levitates over its anchor, a faint ring of light on the cobbles and a hairline
  // tether up to it; walking into it pushes it away and a damped spring brings it back, with a little wobble
  const anchorMat = own(new THREE.MeshBasicMaterial({ color: 0x8fe2d6, transparent: true, opacity: 0.45, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const anchorRing = new THREE.Mesh(own(new THREE.RingGeometry(0.42, 0.46, 40)), anchorMat); anchorRing.rotation.x = -Math.PI / 2; anchorRing.position.y = 0.04; anchorRing.name = 'story_shell_anchor';
  const tetherGeo = own(new THREE.BufferGeometry()); tetherGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tetherMat = own(new THREE.LineBasicMaterial({ color: 0x8fe2d6, transparent: true, opacity: 0.35, depthWrite: false }));
  const tether = new THREE.Line(tetherGeo, tetherMat); tether.frustumCulled = false; tether.name = 'story_shell_tether';
  const hover = new THREE.Group(); hover.name = 'story_shell_float'; hover.add(shell);
  const restY = shell.position.y - 0.64 + SHELL_FLOAT_Y; shell.position.y = 0;
  hover.position.y = restY;
  root.add(anchorRing, tether, hover, pool);
  scene.add(root);

  let panel = null, view = null, snapshot = null, loaded = false, tab = 'human', status = null; // status: 'loading' | 'offline' | null
  const local = () => { try { return scoreAccount(log() || []); } catch { return null; } };
  function close() { if (panel) { panel.remove(); panel = null; view = null; } if (keyHandler) { win.removeEventListener('keydown', keyHandler); keyHandler = null; } }
  let keyHandler = null;
  function draw() {
    const prevTab = view ? view.tab : tab;
    if (panel) panel.remove();
    view = renderBoardPanel({ doc, i18n, snapshot, local: local(), account, tab: prevTab, status, onClose: close, copy: (s) => win.navigator && win.navigator.clipboard && win.navigator.clipboard.writeText(s) });
    panel = view.panel; doc.body.append(panel);
    const first = panel.querySelector('button'); if (first && first.focus) first.focus();
  }
  async function open() {
    draw();
    if (!loaded) { loaded = true; status = 'loading'; if (panel) draw(); const rep = {}; try { snapshot = await load(rep); } catch { snapshot = null; rep.offline = true; } status = !snapshot && (rep.offline || (win.navigator && win.navigator.onLine === false)) ? 'offline' : null; if (!snapshot && status === 'offline') loaded = false; /* retry on the next open */ if (panel) draw(); }
    if (!keyHandler) { keyHandler = (e) => { if (e.key === 'Escape') close(); }; win.addEventListener('keydown', keyHandler); }
  }

  // the float: a 2-D damped spring in the root's own frame (x across, z along), pushed by her body when she walks in
  const sp = { x: 0, z: 0, vx: 0, vz: 0 };
  let lastT = 0;
  const cosF = Math.cos(facing), sinF = Math.sin(facing);
  function floatStep(pos, dt, time) {
    let fx = -SPRING.k * sp.x - SPRING.c * sp.vx, fz = -SPRING.k * sp.z - SPRING.c * sp.vz;
    if (pos) {                                               // her body: world offset to the shell, turned into the root's frame
      const wx = root.position.x - pos[0], wz = root.position.z - pos[2];
      const lx = wx * cosF - wz * sinF + sp.x, lz = wx * sinF + wz * cosF + sp.z, d = Math.hypot(lx, lz);
      if (d < SPRING.reach && d > 1e-4 && Math.abs(pos[1] - root.position.y) < 2.5) { const k = SPRING.push * (1 - d / SPRING.reach); fx += (lx / d) * k; fz += (lz / d) * k; }
    }
    sp.vx += fx * dt; sp.vz += fz * dt; sp.x += sp.vx * dt; sp.z += sp.vz * dt;
    const r = Math.hypot(sp.x, sp.z); if (r > SPRING.max) { sp.x *= SPRING.max / r; sp.z *= SPRING.max / r; sp.vx *= 0.5; sp.vz *= 0.5; } // never drifts off its anchor
    hover.position.set(sp.x, restY + 0.07 * Math.sin(time * 1.2), sp.z);
    hover.rotation.set(sp.vz * 0.18, 0.3 * Math.sin(time * 0.25), -sp.vx * 0.18);   // it leans with the swing and sways a little
    const a = tetherGeo.attributes.position; a.setXYZ(0, 0, 0.04, 0); a.setXYZ(1, hover.position.x, hover.position.y - 0.25, hover.position.z); a.needsUpdate = true;
  }
  const spot = {
    id: 'shell_board',
    near: (pos) => { const at = root.position; return Math.hypot(pos[0] - at.x, pos[2] - at.z) <= BOARD_REACH && Math.abs(pos[1] - at.y) < 3; },
    prompt: () => t('lb.prompt'),
    onInteract: () => { if (panel) close(); else open(); return true; },
    busy: () => !!panel,
  };
  return {
    root, spot,
    get open() { return !!panel; }, get snapshot() { return snapshot; },
    openPanel: open, close,
    /** Per frame: a panel closes when she walks off; the seam breathes; the shell floats on its spring. */
    update(pos, time = 0) {
      const dt = Math.min(0.05, Math.max(0, time - lastT)); lastT = time;
      if (dt > 0) floatStep(pos, dt, time);
      const k = 0.5 + 0.5 * Math.sin(time * 1.1);          // a gentle pulse: the mouth, its lip and the band breathe together
      seamMat.color.setHSL(0.47, 0.6, 0.6 + 0.1 * k); glowMat.opacity = 0.6 + 0.3 * k; halo.uniforms.uOpacity.value = 0.16 + 0.1 * k; anchorMat.opacity = 0.35 + 0.2 * k; nacre.emissiveIntensity = 0.3 + 0.12 * k;
      if (panel && pos) { const at = root.position; if (Math.hypot(pos[0] - at.x, pos[2] - at.z) > BOARD_REACH + 2) close(); }
    },
    setActive(on) { root.visible = !!on; if (!on) close(); },
    dispose() { close(); scene.remove(root); for (const d of disposables) d.dispose(); },
  };
}
