// Dev page (vfx.html): a greybox floor, the post stack in miniature (RenderPass with a depth
// texture -> VfxPass -> bloom -> output) and one button per effect. ?fx=<name>&t=<seconds> plays
// an effect and freezes it at t (used by the headless QA screenshots).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createVfx, EFFECT_NAMES } from './index.js';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: q.has('fx') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.AgXToneMapping;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x59636a);
scene.fog = new THREE.Fog(0x59636a, 25, 90);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 300);
camera.position.set(0, 7, 13);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.5, 0); controls.update();

scene.add(new THREE.HemisphereLight(0xc9d6e0, 0x3a3630, 0.9));
const sun = new THREE.DirectionalLight(0xffe2b8, 2.2); sun.position.set(-8, 12, 6); scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6f756f, roughness: 0.95 }));
scene.add(floor);
const grid = new THREE.GridHelper(40, 40, 0x4c544f, 0x58605a); grid.position.y = 0.005; scene.add(grid);
const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.2, 8).translate(0, 0.6, 0), new THREE.MeshStandardMaterial({ color: 0x5a4a3a }));
scene.add(stake);
const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.35).scale(0.7, 1.3, 0.7), new THREE.MeshStandardMaterial({ color: 0xc8c4dc, metalness: 0.2, roughness: 0.15 }));
shard.position.set(0, 1.3, 0);
const shell = new THREE.Mesh(new THREE.TorusKnotGeometry(1.2, 0.45, 80, 12), new THREE.MeshStandardMaterial({ color: 0xbfb8c8, roughness: 0.35 }));
shell.position.set(0, 6.5, 0);

const vfx = createVfx(scene, camera, renderer, { tier: q.get('tier') || 'ultra' });

let composer = null;
function buildComposer() {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType) });
  composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(1); composer.setSize(size.x, size.y);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.4, 0.55, 1.0));
  composer.addPass(new OutputPass());
  vfx.attachToComposer(composer);
}
function setTier(t) {
  vfx.setQuality(t);
  if (t === 'low') { if (composer) { composer.dispose(); composer = null; } vfx.attachToComposer(null); } else buildComposer();
}
setTier(q.get('tier') || 'ultra');

const CAMS = {
  vote_finale: [[0, 34, 52], [0, 6, 0]], shell_mist: [[0, 5, 16], [0, 3.5, 0]], shell_crack_pulse: [[0, 4, 10], [0, 3, 0]],
  tension: [[0, 6, 16], [0, 2, 0]], logogram: [[0, 2, 6], [0, 1.5, 0]], vision: [[0, 3, 8], [0, 1.8, 0]], storm_hit: [[0, 4, 9], [0, 2.5, 0]],
};
let loopHandle = null;
function trigger(name) {
  scene.remove(shard); scene.remove(shell);
  if (loopHandle) { loopHandle.stop(); loopHandle = null; }
  if (name === 'shard_auction') scene.add(shard);
  if (name === 'shell_mist' || name === 'shell_crack_pulse') scene.add(shell);
  const c = CAMS[name];
  if (c && q.has('fx')) { camera.position.fromArray(c[0]); controls.target.fromArray(c[1]); controls.update(); }
  const opts = { position: [0, 0, 0], seed: 7 };
  if (name === 'logogram') Object.assign(opts, { forms: [0, 1, 2, 3], dots: 2 });
  if (name === 'shard_auction') opts.position = [0, 1.3, 0];
  if (name === 'shell_mist') opts.position = [0, 5.0, 0];
  if (name === 'shell_crack_pulse') Object.assign(opts, { position: [0.6, 4.6, 1.5], crackDir: [0.2, 1, 0.1], crackLength: 3.5 });
  if (name === 'tension') opts.level = Number(document.getElementById('tension').value) || 0.8;
  if (name === 'vote_finale') opts.target = [0, 14, 0];
  const h = vfx.play(name, opts);
  if (name === 'shell_mist' || name === 'shell_crack_pulse') loopHandle = h;
}

const box = document.getElementById('buttons');
for (const n of EFFECT_NAMES) { const b = document.createElement('button'); b.textContent = n; b.onclick = () => trigger(n); box.appendChild(b); }
document.getElementById('tier').value = q.get('tier') || 'ultra';
document.getElementById('tier').onchange = (e) => setTier(e.target.value);
document.getElementById('rm').onchange = (e) => vfx.setReducedMotion(e.target.checked);
document.getElementById('tension').oninput = (e) => vfx.play('tension', { level: Number(e.target.value), position: [0, 0, 0] });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) buildComposer();
});

const statsEl = document.getElementById('stats');
function frame(dt) {
  vfx.update(dt);
  shell.rotation.y += dt * 0.1;
  if (composer) composer.render(); else renderer.render(scene, camera);
}

if (q.has('fx')) {
  // Deterministic capture: step the simulation to t at 60 Hz, then render once.
  const name = q.get('fx'), t = Number(q.get('t') || 1);
  const start = () => {
    trigger(name);
    for (let s = 0; s < Math.round(t * 60); s++) vfx.update(1 / 60);
    frame(0);
    statsEl.textContent = name + ' @ ' + t + ' s  ' + JSON.stringify(vfx.stats());
    window.__vfxReady = true;
  };
  setTimeout(start, 1500); // atlases load first
} else {
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    frame(dt);
    const s = vfx.stats();
    statsEl.textContent = `tier ${s.tier}  effects ${s.effects}  live ${s.live}  draw ${s.drawCalls}  lights ${s.lights}  stolen ${s.stolen}`;
  });
}
window.__vfx = vfx;
