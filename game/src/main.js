// Forget to Foresee: 3D client entry (vertical slice skeleton). Island scene, isometric camera,
// kinematic player at a fixed 30 Hz, streamed assets with greybox fallbacks, look-dev stack with
// quality tiers, dev HUD on F3. No game rules run here yet; the engine (src/game/engine.js) gets
// wired in by the game UI step.
// Dev URL parameters (harmless in production): ?tier=ultra|high|low, ?motion=reduce,
// ?view=overview|camp|close (camera presets for screenshots and measurements).
import * as THREE from 'three';
import { createIslandScene } from './scenes/island.js';
import { LookDev } from './render/lookdev.js';
import { detectTier } from './render/quality.js';
import { CameraRig } from './render/camera-rig.js';
import { fixedSteps, rayCast, MASK_PLAYER } from './physics/collision.js';
import { PHYSICS_DT, steerTo } from './physics/character.js';
import { Input } from './ui/input.js';
import { DevHud } from './ui/dev-hud.js';
import { configureTextureSupport } from './render/assets.js';
import { CAMPS } from './scenes/layout.js';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app');
// MSAA comes from the post stack's render target on ultra/high; the low tier renders directly with
// the context's own antialiasing.
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
app.appendChild(renderer.domElement);
configureTextureSupport(renderer);

function gpuName() {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch { return ''; }
}
const detectedTier = detectTier({ gpu: gpuName(), mobile: /Mobi|Android/i.test(navigator.userAgent), deviceMemory: navigator.deviceMemory, cores: navigator.hardwareConcurrency });
const systemReduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.2, 500);
const world3d = createIslandScene(renderer, camera);
document.getElementById('objective').textContent = world3d.objective;
const { scene, world, streamer, interactables, player, avatar, marker, shells } = world3d;
const lookdev = new LookDev({
  renderer, scene, camera,
  cloudLevel: world3d.cloudLevel, grassPatches: world3d.grassPatches, lanterns: world3d.lanterns,
  tier: params.get('tier') || detectedTier,
  reducedMotion: params.get('motion') === 'reduce' || systemReduced,
});
// Shells between the camera and Iris dither down instead of hiding her (visual only).
for (const s of shells) {
  lookdev.trackOccluder({ sphere: () => new THREE.Sphere(s.instance.center, s.instance.radius), roots: () => [s.instance.real || s.instance.greybox], pad: 0.5 });
}
const rig = new CameraRig(camera, world);
const input = new Input(renderer.domElement);
const hud = new DevHud(document.getElementById('hud'));
const promptEl = document.getElementById('prompt');
const toastEl = document.getElementById('toast');

window.addEventListener('resize', () => lookdev.setSize(window.innerWidth, window.innerHeight));

let toastTimer = 0;
function toast(text) { toastEl.textContent = text; toastEl.hidden = false; toastTimer = 3; }

let moveTarget = null, stuckTime = 0, lastDist = Infinity;
let inspecting = null;
let accumulator = 0;
const raycaster = new THREE.Raycaster();
const focus = new THREE.Vector3();
const ndc = new THREE.Vector2();
const clock = new THREE.Clock();
const physics = { steps: 0, substeps: 0, colliders: 0, grounded: false };

// Camera presets for screenshots / measurements (dev only).
const view = params.get('view');
if (view === 'overview') { rig.dist = 90; rig.yaw = 0.15; }
else if (view === 'close') { rig.dist = 4.5; }
else if (view === 'camp') {
  const iris = CAMPS.find((c) => c.id === 'iris');
  player.pos[0] = iris.position[0]; player.pos[2] = iris.position[2] + 3.5; player.heading = Math.PI;
  rig.dist = 11; rig.yaw = 0.35;
}

function nearestInteractable() {
  let best = null, bestD = Infinity;
  for (const it of interactables) {
    const d = Math.hypot(it.position.x - player.pos[0], it.position.z - player.pos[2]);
    if (d < it.radius && d < bestD) { best = it; bestD = d; }
  }
  return best;
}

function handleContext() {
  if (inspecting) { leaveInspect(); return; }
  const it = nearestInteractable();
  if (!it) return;
  if (it.inspect && it.instance) {
    inspecting = it;
    moveTarget = null; marker.visible = false;
    rig.enterInspect(it.instance.center, it.instance.radius);
  } else {
    toast(it.label + ': conversations arrive with the game UI step.');
  }
}

function leaveInspect() { inspecting = null; rig.exitInspect(); }

function handleInput(dt) {
  if (input.hit('F3')) hud.toggle();
  if (input.hit('KeyE')) handleContext();
  if (input.hit('Escape') && inspecting) leaveInspect();
  const rot = (input.down('ArrowLeft') ? 1 : 0) - (input.down('ArrowRight') ? 1 : 0);
  if (rot) rig.rotate(rot * dt * 1.6);
  if (input.dragX) rig.rotate(-input.dragX * 0.005);
  if (inspecting) {
    const tilt = (input.down('ArrowUp') ? 1 : 0) - (input.down('ArrowDown') ? 1 : 0);
    if (tilt) rig.tilt(tilt * dt * 1.2);
    if (input.dragY) rig.tilt(input.dragY * 0.005);
  } else {
    if (input.down('ArrowUp')) rig.zoom(Math.pow(0.5, dt));
    if (input.down('ArrowDown')) rig.zoom(Math.pow(2, dt));
  }
  if (input.wheel) rig.zoom(Math.pow(1.12, input.wheel));
  if (input.down('Equal', 'NumpadAdd')) rig.zoom(Math.pow(0.5, dt));
  if (input.down('Minus', 'NumpadSubtract')) rig.zoom(Math.pow(2, dt));

  if (!inspecting) {
    for (const c of input.clicks) {
      ndc.set((c.x / window.innerWidth) * 2 - 1, -(c.y / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const o = raycaster.ray.origin, d = raycaster.ray.direction;
      const hit = rayCast(world, [o.x, o.y, o.z], [d.x, d.y, d.z], 300, MASK_PLAYER);
      if (hit && hit.normal[1] > 0.7) {
        moveTarget = hit.point; stuckTime = 0; lastDist = Infinity;
        marker.position.set(hit.point[0], hit.point[1] + 0.06, hit.point[2]);
        marker.visible = true;
      }
    }
  }
}

function wishVector() {
  if (inspecting) return [0, 0];
  const [ax, ay] = input.moveAxes();
  if (ax || ay) {
    moveTarget = null; marker.visible = false;
    const { fwd, right } = rig.groundAxes();
    return [fwd.x * ay + right.x * ax, fwd.y * ay + right.y * ax];
  }
  if (!moveTarget) return [0, 0];
  const w = steerTo(player.pos, moveTarget);
  if (!w) { moveTarget = null; marker.visible = false; return [0, 0]; }
  return w;
}

// Rolling frame-time window for honest measurements (window.__ftf.perf()).
const frameTimes = [];
function perf() {
  const n = frameTimes.length;
  if (!n) return null;
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const avg = frameTimes.reduce((a, b) => a + b, 0) / n;
  return {
    tier: lookdev.tier, fps: 1000 / avg, avgMs: avg, p95Ms: sorted[Math.floor(n * 0.95)], frames: n,
    drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    pixelRatio: renderer.getPixelRatio(), size: [renderer.domElement.width, renderer.domElement.height], gpu: gpuName(),
  };
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.25);
  frameTimes.push(dt * 1000); if (frameTimes.length > 240) frameTimes.shift();
  handleInput(dt);

  const f = fixedSteps(accumulator, dt, PHYSICS_DT, 8);
  accumulator = f.accumulator;
  physics.steps = f.steps; physics.substeps = 0;
  for (let i = 0; i < f.steps; i++) {
    const wish = wishVector();
    player.step(wish, PHYSICS_DT);
    physics.substeps += player.lastSubsteps;
    if (moveTarget) {
      // Give up on a click target we cannot reach (no pathfinding yet).
      const d = Math.hypot(moveTarget[0] - player.pos[0], moveTarget[2] - player.pos[2]);
      stuckTime = d > lastDist - 0.01 ? stuckTime + PHYSICS_DT : 0;
      lastDist = Math.min(lastDist, d);
      if (stuckTime > 0.6) { moveTarget = null; marker.visible = false; }
    }
  }
  physics.grounded = player.grounded;
  physics.colliders = world.liveCount;

  const p = player.renderPos(f.alpha);
  avatar.position.set(p[0], p[1], p[2]);
  avatar.visible = !inspecting; // keep the close-up clear of Iris
  let dh = player.heading - avatar.rotation.y;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  avatar.rotation.y += dh * (1 - Math.exp(-dt * 14));
  focus.set(p[0], p[1] + 1.1, p[2]);
  // Shell hover is visual only; reduced motion holds the Shells at their rest pose.
  world3d.update(lookdev.reducedMotion ? 0 : clock.elapsedTime);
  rig.update(dt, focus);
  streamer.update(dt, focus);
  lookdev.update(dt, focus, rig.actualDist);

  const near = inspecting ? null : nearestInteractable();
  promptEl.innerHTML = inspecting
    ? `Inspecting <b>${inspecting.label}</b> · drag or arrows to orbit · wheel to zoom · <kbd>E</kbd>/<kbd>Esc</kbd> to leave`
    : near ? `<kbd>E</kbd> ${near.verb} <b>${near.label}</b>` : '';
  promptEl.hidden = !promptEl.innerHTML;
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) toastEl.hidden = true;

  lookdev.render();
  hud.frame(dt);
  hud.update(dt, { info: renderer.info, physics, streaming: streamer.stats(), events: streamer.events, camera: rig, lookdev: lookdev.stats() });
  input.endFrame();
  requestAnimationFrame(frame);
}

// Expose a small debug handle for manual checks in the browser console and for measurements.
window.__ftf = { scene, world, streamer, player, rig, renderer, lookdev, setQuality: (t) => lookdev.setQuality(t), setReducedMotion: (on) => lookdev.setReducedMotion(on), perf, detectedTier };
requestAnimationFrame(frame);
