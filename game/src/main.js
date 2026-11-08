// Forget to Foresee: 3D client entry. Lobby and onboarding (src/ui) → the island with the play layer
// (src/play): the authoritative room runs in the browser through the same code as the agent API,
// the UI only sends commands and renders observations. Isometric camera, kinematic player at a
// fixed 30 Hz, streamed assets with greybox fallbacks, look-dev stack with quality tiers, F3 dev HUD.
// Dev URL parameters (harmless in production): ?tier=ultra|high|low, ?motion=reduce,
// ?view=overview|camp|close (camera presets), ?play=direct (skip the lobby), ?seed=<32 hex> (fixed
// test season), ?lang=en|ru, ?hud=old (greybox overlay instead of the world HUD), ?hints=reset (Novice hints
// fire again), ?demo=judge (the judges' 3-minute path: fixed season, Novice, fresh hints).
import * as THREE from 'three';
import { createIslandScene } from './scenes/island.js';
import { LookDev } from './render/lookdev.js';
import { detectTier } from './render/quality.js';
import { CameraRig } from './render/camera-rig.js';
import { fixedSteps, rayCast, MASK_PLAYER } from './physics/collision.js';
import { PHYSICS_DT, steerTo } from './physics/character.js';
import { Input } from './ui/input.js';
import { PAD } from './ui/gamepad.js';
import { navigateGamepadMenu } from './ui/gamepad-menu.js';
import { mountSceneControls } from './ui/scene-controls.js';
import './ui/styles.css';
import { DevHud } from './ui/dev-hud.js';
import { configureTextureSupport, setModelVariant } from './render/assets.js';
import { CAMPS } from './scenes/layout.js';
import { mountShell } from './ui/index.js';
import { createPlayContext } from './play/i18n.js';
import { startPlay } from './play/game.js';
import { mountAudioSettings } from './play/audio-settings.js';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app');
// ---- render setup (owned by the look-dev agent) ----
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
// Phones and the low tier load the 2048-texture model variants (<name>_m.glb): the full 4096 set needs
// ~650 MB of GPU memory, more than mobile browsers give a tab. ?tex=full / ?tex=m override (dev, QA).
const mobileDevice = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
const detectedTier = detectTier({ gpu: gpuName(), mobile: /Mobi|Android/i.test(navigator.userAgent), deviceMemory: navigator.deviceMemory, cores: navigator.hardwareConcurrency });
const systemReduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();

if (params.get('tex') === 'm' || (params.get('tex') !== 'full' && (mobileDevice || (params.get('tier') || detectedTier) === 'low'))) setModelVariant('_m');
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.2, 500);
const world3d = createIslandScene(renderer, camera);
const { scene, world, streamer, interactables, player, avatar, marker, shells } = world3d;
player.accel = 8; // smooth start/stop instead of instant velocity changes
const lookdev = new LookDev({
  renderer, scene, camera,
  cloudLevel: world3d.cloudLevel, grassPatches: world3d.grassPatches, lanterns: world3d.lanterns,
  tier: params.get('tier') || detectedTier, autoTier: !params.has('tier'), preset: params.get('tod') || undefined,
  reducedMotion: params.get('motion') === 'reduce' || systemReduced,
});
// ---- end of render setup ----
// Shells between the camera and Iris dither down instead of hiding her (visual only).
for (const s of shells) {
  lookdev.trackOccluder({ sphere: () => new THREE.Sphere(s.instance.center, s.instance.radius), roots: () => [s.instance.real || s.instance.greybox], pad: 0.5 });
}
const rig = new CameraRig(camera, world);
const input = new Input(renderer.domElement);
const hud = new DevHud(document.getElementById('hud'));
const promptEl = document.getElementById('prompt');
const controls = mountSceneControls(document.getElementById('scene-controls'), { onContext: handleInspect, onTransition: clearWorldInput });
const toastEl = document.getElementById('toast');
const uiRoot = document.getElementById('ui');

// Lobby → onboarding → first contact, then the play layer. ?play=direct goes straight in (dev, QA).
const ctx = createPlayContext({ locale: params.get('lang') || undefined });
// ?demo=judge: a fixed v3 season whose first sign is visible on trial 1 and whose trial-3 Gift lands on
// Shell II with a verified proof (docs/design/clarity-layers.md §6a item 8). Presentation only.
const JUDGE_SEED = 'cc161d308faa67539af44205b56b6d4f';
const judge = params.get('demo') === 'judge';
if (judge) ctx.prefs.set({ hudMode: 'novice' });
const seedParam = judge ? JUDGE_SEED : params.get('seed') || '';
let play = null, shellUi = null;
async function enterWorld() {
  if (shellUi) { shellUi.destroy(); shellUi = null; }
  document.body.classList.add('in-world');
  try {
    play = await startPlay({ scene, camera, renderer, world3d, rig, player, avatar, lookdev, uiRoot, ctx, options: {
      seedHex: /^[0-9a-f]{32}$/.test(seedParam) ? seedParam : undefined,
      resetHints: judge || params.get('hints') === 'reset',
      worldHud: params.get('hud') !== 'old', // ?hud=old: the greybox overlay (fallback)
      onSettings: () => controls.open(),
    } });
    window.__ftf.play = play;
    // Volume sliders in the scene settings dialog (the audio module loads lazily: the getter resolves it later).
    mountAudioSettings(controls.dialog, { audio: () => (play && play.hooks.audio) || null, i18n: ctx.i18n, storage: ctx.storage });
  } catch (e) { console.error('[play] failed to start', e); toast('The local season failed to start: ' + e.message); }
}
// #play (artifact links pass only a hash) and touch devices go straight into the world.
const coarse = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
if (params.get('play') === 'direct' || location.hash === '#play' || coarse) enterWorld();
else shellUi = mountShell(uiRoot, { ctx, onFirstContact: () => enterWorld() });

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

function stopSteering() {
  moveTarget = null;
  marker.visible = false;
  if (play) play.cancelRoute();
}

function clearWorldInput() {
  input.clear();
  stopSteering();
}
window.addEventListener('blur', stopSteering);
document.addEventListener('visibilitychange', stopSteering);

/** I: close inspection orbit of a hero object (E belongs to the play layer's context actions). */
function handleInspect() {
  if (inspecting) { leaveInspect(); return; }
  const it = play && play.zone === 'shell' ? null : nearestInteractable();
  if (!it || !it.inspect || !it.instance) return;
  clearWorldInput();
  inspecting = it;
  rig.enterInspect(it.instance.center, it.instance.radius);
}
const PLAY_KEYS = ['KeyE', 'KeyM', 'KeyV', 'KeyT', 'KeyH', 'KeyL', 'KeyG', 'Escape', ...Array.from({ length: 9 }, (_, i) => 'Digit' + (i + 1))];

function leaveInspect() { clearWorldInput(); inspecting = null; rig.exitInspect(); }

function handleInput(dt) {
  input.poll();
  const { pad } = input;
  if (input.hit('F3')) hud.toggle();
  const modal = document.querySelector('dialog[open]');
  if (modal) { navigateGamepadMenu(modal, pad); return false; }
  if (!play) { navigateGamepadMenu(uiRoot, pad); return false; }
  if (pad.hit(PAD.menu)) { controls.open(); return false; }
  if (input.hit('Escape') || pad.hit(PAD.cancel)) {
    if (inspecting) leaveInspect();
    else if (play.handleKey('Escape')) clearWorldInput();
    else if (moveTarget || play.routeActive) stopSteering();
    else controls.open();
    return false;
  }
  if (input.hit('KeyI') || pad.hit(PAD.inspect)) handleInspect();
  if (!inspecting) {
    for (const k of PLAY_KEYS) if (k !== 'Escape' && input.hit(k)) play.handleKey(k);
    if (play.ui.panel) {
      navigateGamepadMenu(uiRoot.querySelector('.pl-panel'), pad);
      stopSteering();
      return false;
    }
    if (pad.hit(PAD.interact)) { play.handleKey('KeyE'); if (play.ui.panel) return false; }
  }
  if (input.hit('KeyR') || pad.hit(PAD.reset)) rig.reset();
  const [lookX, lookY] = pad.look;
  const rot = Number(input.down('ArrowLeft')) - Number(input.down('ArrowRight')) - lookX;
  const tilt = Number(input.down('ArrowUp')) - Number(input.down('ArrowDown')) + lookY;
  const lookDt = Math.min(dt, 0.05);
  if (rot || input.dragX) rig.rotate(rot * lookDt * 1.8 - input.dragX * 0.005);
  if (tilt || input.dragY) rig.tilt(tilt * lookDt * 1.35 + input.dragY * 0.005);
  if (input.wheel) rig.zoom(Math.pow(1.12, input.wheel));
  if (input.down('Equal', 'NumpadAdd') || pad.down(PAD.zoomIn)) rig.zoom(Math.pow(0.5, lookDt));
  if (input.down('Minus', 'NumpadSubtract') || pad.down(PAD.zoomOut)) rig.zoom(Math.pow(2, lookDt));

  if (!inspecting) {
    for (const c of input.clicks) {
      ndc.set((c.x / window.innerWidth) * 2 - 1, -(c.y / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const o = raycaster.ray.origin, d = raycaster.ray.direction;
      const hit = rayCast(world, [o.x, o.y, o.z], [d.x, d.y, d.z], 300, MASK_PLAYER);
      if (hit && hit.normal[1] > 0.7) {
        moveTarget = hit.point; stuckTime = 0; lastDist = Infinity; play.cancelRoute();
        marker.position.set(hit.point[0], hit.point[1] + 0.06, hit.point[2]);
        marker.visible = true;
      }
    }
  }
}

function wishVector() {
  if (inspecting || controls.dialog.open) return [0, 0];
  const [ax, ay] = input.moveAxes();
  if (ax || ay) {
    stopSteering();
    const { fwd, right } = rig.groundAxes();
    return [fwd.x * ay + right.x * ax, fwd.y * ay + right.y * ax];
  }
  const rw = play && play.routeWish();
  if (rw) return rw;
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

let movingState = false;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.25);
  frameTimes.push(dt * 1000); if (frameTimes.length > 240) frameTimes.shift();
  const live = handleInput(dt) !== false;

  const f = fixedSteps(accumulator, dt, PHYSICS_DT, 8);
  accumulator = f.accumulator;
  physics.steps = f.steps; physics.substeps = 0;
  let moving = false;
  player.run = input.down('ShiftLeft', 'ShiftRight');
  for (let i = 0; live && i < f.steps; i++) {
    const wish = wishVector();
    if (wish[0] || wish[1]) moving = true;
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
  // Animation state from the smoothed velocity, not from this frame's physics steps: at high frame rates many frames run
  // no 30 Hz step, and toggling walk/idle on those frames restarted the walk clip every other frame (visible jitter).
  const speed = Math.hypot(player.vel[0], player.vel[1]);
  movingState = movingState ? speed > 0.08 : speed > 0.25;
  void moving;
  if (play) play.update(dt, { focus, moving: movingState, speed, running: player.run && movingState });

  controls.update(input.device, null, inspecting);
  const near = inspecting || !play || play.zone === 'shell' ? null : nearestInteractable();
  promptEl.innerHTML = inspecting
    ? `Inspecting <b>${inspecting.label}</b> · drag or arrows to orbit · wheel to zoom · <kbd>I</kbd>/<kbd>Esc</kbd> to leave`
    : near && near.inspect ? `<kbd>I</kbd> inspect <b>${near.label}</b> up close` : '';
  promptEl.hidden = !promptEl.innerHTML || !!inspecting;
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) toastEl.hidden = true;

  if (play || !shellUi) lookdev.render(); // the lobby covers the canvas: no GPU work behind it
  hud.frame(dt);
  hud.update(dt, { info: renderer.info, physics, streaming: streamer.stats(), events: streamer.events, camera: rig, lookdev: lookdev.stats() });
  input.endFrame();
  requestAnimationFrame(frame);
}

// Expose a small debug handle for manual checks in the browser console and for measurements.
window.__ftf = {
  scene, world, streamer, player, rig, renderer, lookdev, setQuality: (t) => lookdev.setQuality(t), setReducedMotion: (on) => lookdev.setReducedMotion(on), perf, detectedTier,
  get vfx() { return play ? play.hooks.vfx : null; }, get audio() { return play ? play.hooks.audio : null; },
};
requestAnimationFrame(frame);
