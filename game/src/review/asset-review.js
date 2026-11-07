// Dev-only asset review page (review.html?model=<name>). Loads one .glb by exact name, shows it
// with a 1.75 m figure, a 2 m ruler and a grid, lets the reviewer toggle runtime / _inspect / _col /
// sockets, previews the code-drawn pad decals, and reports measurements against the brief budgets.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MODEL_FILES } from 'virtual:model-list';
import { ASSETS, TRIANGLE_BUDGET, assetByName, isValidModelName } from '../render/asset-catalog.js';
import { fetchGltf, splitAssetScene, analyzeAssetScene } from '../render/assets.js';
import { buildGreybox, makeLabel } from '../render/greybox.js';
import { PadDecals } from '../render/decals.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const requested = params.get('model') || 'anchor';
const name = isValidModelName(requested) ? requested : null;

/* ---------- model picker ---------- */
const picker = $('model');
for (const a of ASSETS) {
  const o = document.createElement('option');
  o.value = a.name; o.textContent = a.name + (MODEL_FILES[a.name] ? '' : '  (no file)');
  picker.appendChild(o);
}
if (name && !assetByName(name)) { const o = document.createElement('option'); o.value = name; o.textContent = name + '  (not in catalog)'; picker.appendChild(o); }
picker.value = name || 'anchor';
picker.addEventListener('change', () => { location.search = '?model=' + encodeURIComponent(picker.value); });

/* ---------- renderer and stage ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2f3532);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 500);
camera.position.set(2.4, 1.8, 3.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xe8efec, 0x404844, 0.8));
const sun = new THREE.DirectionalLight(0xfff3e2, 2.2);
sun.position.set(4, 8, 5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.35 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(20, 20, 0x8a948f, 0x58605c); grid.position.y = 0.001; scene.add(grid);
const fine = new THREE.GridHelper(4, 40, 0x6d7672, 0x464d4a); fine.position.y = 0.002; scene.add(fine);
scene.add(new THREE.AxesHelper(0.5));

function figure() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9aa6a0, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 1.08, 4, 12), mat); body.position.y = 0.73;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), mat); head.position.y = 1.64;
  body.castShadow = head.castShadow = true;
  const lbl = makeLabel('1.75 m figure', 0.025); lbl.position.y = 1.85;
  g.add(body, head, lbl);
  return g;
}
function ruler() {
  const g = new THREE.Group();
  const a = new THREE.MeshBasicMaterial({ color: 0xf2f2ee }), b = new THREE.MeshBasicMaterial({ color: 0x1b1d1c });
  for (let i = 0; i < 20; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.03), i % 2 ? b : a); m.position.y = 0.05 + i * 0.1; g.add(m); }
  for (const h of [0.5, 1, 1.5, 2]) { const l = makeLabel(h + ' m', 0.022); l.position.set(0.16, h, 0); g.add(l); }
  return g;
}
const fig = figure(), rul = ruler();
scene.add(fig, rul);

/* ---------- toggles ---------- */
const state = { runtime: true, inspect: false, col: false, sockets: true, decals: true, greybox: false, wireframe: false };
for (const key of Object.keys(state)) {
  const el = $('t-' + key);
  el.checked = state[key];
  el.addEventListener('change', () => { state[key] = el.checked; apply(); });
}
let parts = null, real = null, grey = null, socketHelpers = [], decals = null, modelRoot = new THREE.Group();
scene.add(modelRoot);
const colMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a, wireframe: true, transparent: true, opacity: 0.8, depthTest: false });

function apply() {
  if (parts) {
    for (const m of parts.runtime) m.visible = state.runtime;
    for (const m of parts.inspect) m.visible = state.inspect;
    for (const m of parts.collision) { m.visible = state.col; m.material = colMat; m.renderOrder = 5; }
    for (const m of [...parts.runtime, ...parts.inspect]) for (const mat of [].concat(m.material)) mat.wireframe = state.wireframe;
  }
  for (const h of socketHelpers) h.visible = state.sockets;
  if (decals) decals.set({ shell_number: state.decals ? 'II' : null, tick: state.decals ? '7' : null });
  if (grey) grey.visible = state.greybox || !real;
}

function addSocketHelpers(sockets) {
  for (const h of socketHelpers) h.parent?.remove(h);
  socketHelpers = [];
  for (const [sname, s] of sockets) {
    const ax = new THREE.AxesHelper(0.08); s.add(ax); socketHelpers.push(ax);
    const pad = s.userData.pad_size_m;
    if (Array.isArray(pad)) {
      const [w, h] = pad;
      const pts = [new THREE.Vector3(-w / 2, -h / 2, 0.001), new THREE.Vector3(w / 2, -h / 2, 0.001), new THREE.Vector3(w / 2, h / 2, 0.001), new THREE.Vector3(-w / 2, h / 2, 0.001)];
      const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd36a, depthTest: false }));
      s.add(loop); socketHelpers.push(loop);
    }
    const lbl = makeLabel(sname, 0.018); lbl.position.set(0, 0.05, 0.02); s.add(lbl); socketHelpers.push(lbl);
  }
}

/* ---------- stats ---------- */
function fmt(n) { return Number(n).toLocaleString('en-US'); }
function report(info) {
  const def = assetByName(name);
  const kind = def ? def.kind : null;
  const budget = kind ? TRIANGLE_BUDGET[kind] : null;
  const warn = [];
  const s = info.stats;
  const line = (label, v) => `<tr><th>${esc(label)}</th><td>${v}</td></tr>`;
  const over = (n, max) => (max && n > max ? ` <b class="bad">over ${fmt(max)}</b>` : max ? ` <span class="ok">/ ${fmt(max)}</span>` : '');
  if (s) {
    if (s.minY != null && Math.abs(s.minY) > 0.01) warn.push(`min Y is ${s.minY.toFixed(3)} m (pivot should be on the ground)`);
    const size = s.runtime.bounds ? s.runtime.bounds.size : null;
    if (def && size && Math.abs(size[1] - def.height) / def.height > 0.25) warn.push(`height ${size[1].toFixed(2)} m vs brief ~${def.height} m`);
    if (s.runtime.materials > 3) warn.push(`runtime uses ${s.runtime.materials} materials (brief: at most 3)`);
    if (s.inspect.materials > 3) warn.push(`_inspect uses ${s.inspect.materials} materials (brief: at most 3)`);
    if (!s.collision.meshes) warn.push('no *_col collision meshes');
    if (kind === 'hero' && !s.inspect.meshes) warn.push('hero without a <name>_inspect mesh');
    for (const t of s.textures) if (t.width > 4096 || t.height > 4096) warn.push(`texture ${t.name || t.slot} ${t.width}x${t.height} exceeds 4096`);
    if (budget && s.runtime.triangles > budget.runtime) warn.push('runtime triangles over budget');
    if (budget && budget.inspect && s.inspect.triangles > budget.inspect) warn.push('_inspect triangles over budget');
  }
  const b = s && s.runtime.bounds;
  $('stats').innerHTML = `
    <h2>${esc(name)}${def ? ' <small>' + esc(def.label) + ' \u00b7 ' + kind + '</small>' : ' <small>not in the catalog</small>'}</h2>
    <table>
      ${line('file', info.bytes ? (info.bytes / 1048576).toFixed(2) + ' MB \u00b7 loaded in ' + Math.round(info.ms) + ' ms' : esc(info.error || 'no file'))}
      ${s ? line('runtime', fmt(s.runtime.triangles) + ' tris \u00b7 ' + s.runtime.meshes + ' mesh(es)' + over(s.runtime.triangles, budget && budget.runtime)) : ''}
      ${s ? line('_inspect', fmt(s.inspect.triangles) + ' tris \u00b7 ' + s.inspect.meshes + ' mesh(es)' + over(s.inspect.triangles, budget && budget.inspect)) : ''}
      ${s ? line('_col', fmt(s.collision.triangles) + ' tris \u00b7 ' + s.collision.meshes + ' mesh(es)') : ''}
      ${s ? line('materials', s.materials.length + ' total (runtime ' + s.runtime.materials + ', _inspect ' + s.inspect.materials + '): ' + esc(s.materials.join(', '))) : ''}
      ${s ? line('textures', s.textures.length ? s.textures.map((t) => esc((t.name || t.slot) + ' ' + t.width + '\u00d7' + t.height)).join('<br>') : 'none') : ''}
      ${b ? line('bounds', b.size.map((v) => v.toFixed(3)).join(' \u00d7 ') + ' m') : ''}
      ${b ? line('min Y', s.minY.toFixed(4) + ' m') : ''}
      ${b ? line('center XZ', ((b.min[0] + b.max[0]) / 2).toFixed(3) + ', ' + ((b.min[2] + b.max[2]) / 2).toFixed(3)) : ''}
      ${s ? line('sockets', s.sockets.length ? s.sockets.map((k) => esc(k.name + ' [' + k.role + '] ' + k.position.join(', ') + (k.extras.pad_size_m ? ' pad ' + k.extras.pad_size_m.join('\u00d7') : ''))).join('<br>') : 'none') : ''}
    </table>
    ${warn.length ? '<ul class="warn">' + warn.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>' : s ? '<p class="ok">No checks failed.</p>' : ''}`;
}

/* ---------- load ---------- */
function frame(box) {
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.length() / 2, 0.3);
  fig.position.set(box.min.x - 0.6, 0, center.z);
  rul.position.set(box.max.x + 0.4, 0, center.z);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(1.1, 0.6, 1.6).multiplyScalar(r * 2.4));
  camera.near = Math.max(0.005, r / 200); camera.far = r * 200; camera.updateProjectionMatrix();
  const d = Math.max(r * 3, 3);
  Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 0.1, far: d * 6 });
  sun.position.copy(center).add(new THREE.Vector3(0.5, 1, 0.6).multiplyScalar(d * 2)); sun.target.position.copy(center);
  sun.shadow.camera.updateProjectionMatrix();
}

async function load() {
  if (!name) { $('stats').innerHTML = '<p class="bad">Invalid model name. Use ?model= with lowercase letters, digits and underscores only.</p>'; return; }
  if (assetByName(name)) {
    const g = buildGreybox(name);
    grey = g.object; modelRoot.add(grey);
    decals = new PadDecals({ onSockets: (fn) => fn(g.sockets) }, {});
  }
  $('status').textContent = 'loading ' + name + '.glb \u2026';
  const t0 = performance.now();
  try {
    const { gltf, bytes } = await fetchGltf(name, { onProgress: (got, total) => { $('status').textContent = `loading ${name}.glb \u2026 ${total ? Math.round((got / total) * 100) + '%' : (got / 1048576).toFixed(1) + ' MB'}`; } });
    const ms = performance.now() - t0;
    real = gltf.scene;
    real.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    modelRoot.add(real);
    const stats = analyzeAssetScene(real);
    parts = splitAssetScene(real);
    addSocketHelpers(parts.sockets);
    if (parts.sockets.size) decals = new PadDecals({ onSockets: (fn) => fn(parts.sockets) }, {});
    const box = new THREE.Box3();
    for (const m of parts.runtime.length ? parts.runtime : parts.inspect) box.expandByObject(m);
    frame(box.isEmpty() ? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5)) : box);
    report({ bytes, ms, stats });
    $('status').textContent = name + '.glb loaded';
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    $('status').textContent = 'showing greybox: ' + msg;
    if (grey) { addSocketHelpers(new Map([...grey.children].filter((o) => /^socket_/.test(o.name)).map((o) => [o.name, o]))); frame(new THREE.Box3().setFromObject(grey)); }
    report({ error: msg });
  }
  apply();
}

window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
  $('draw').textContent = `${renderer.info.render.calls} draw calls \u00b7 ${fmt(renderer.info.render.triangles)} triangles on screen`;
});
load();
// Debug handle for manual checks in the browser console.
window.__review = { scene, camera, controls, renderer };
