// Forget to Foresee: 3D client entry (vertical slice skeleton). Island scene, isometric camera,
// kinematic player at a fixed 30 Hz, streamed assets with greybox fallbacks, dev HUD on F3.
// No game rules run here yet; the engine (src/game/engine.js) gets wired in by the game UI step.
import * as THREE from 'three';
import { createIslandScene } from './scenes/island.js';
import { installHeightFog } from './render/fog.js';
import { CameraRig } from './render/camera-rig.js';
import { fixedSteps, rayCast, MASK_PLAYER } from './physics/collision.js';
import { PHYSICS_DT, steerTo } from './physics/character.js';
import { Input } from './ui/input.js';
import { DevHud } from './ui/dev-hud.js';
import { configureTextureSupport } from './render/assets.js';

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);
configureTextureSupport(renderer);

// Tuned so the walkable tops (y = 0) stay readable from the top zoom while the pillars sink into
// dense fog toward the cloud sea (y = -28).
installHeightFog({ baseY: -28, falloff: 0.075, density: 0.012 });
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.2, 500);
const world3d = createIslandScene(renderer, camera);
document.getElementById('objective').textContent = world3d.objective;
const { scene, world, streamer, interactables, player, avatar, marker } = world3d;
const rig = new CameraRig(camera, world);
const input = new Input(renderer.domElement);
const hud = new DevHud(document.getElementById('hud'));
const promptEl = document.getElementById('prompt');
const toastEl = document.getElementById('toast');

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

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

function frame() {
  const dt = Math.min(clock.getDelta(), 0.25);
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
  focus.set(p[0], p[1], p[2]);
  world3d.update(clock.elapsedTime);
  rig.update(dt, focus);
  streamer.update(dt, focus);

  const near = inspecting ? null : nearestInteractable();
  promptEl.innerHTML = inspecting
    ? `Inspecting <b>${inspecting.label}</b> \u00b7 drag or arrows to orbit \u00b7 wheel to zoom \u00b7 <kbd>E</kbd>/<kbd>Esc</kbd> to leave`
    : near ? `<kbd>E</kbd> ${near.verb} <b>${near.label}</b>` : '';
  promptEl.hidden = !promptEl.innerHTML;
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) toastEl.hidden = true;

  renderer.render(scene, camera);
  hud.frame(dt);
  hud.update(dt, { info: renderer.info, physics, streaming: streamer.stats(), events: streamer.events, camera: rig });
  input.endFrame();
  requestAnimationFrame(frame);
}

// Expose a small debug handle for manual checks in the browser console.
window.__ftf = { scene, world, streamer, player, rig, renderer };
requestAnimationFrame(frame);
