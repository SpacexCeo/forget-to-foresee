// Forget to Foresee: the world (renderer, island, camera, frame loop). Entry: main.js. Lobby and onboarding (src/ui) → the island with the play layer
// (src/play): the authoritative room runs in the browser through the same code as the agent API,
// the UI only sends commands and renders observations. Isometric camera, kinematic player at a
// fixed 30 Hz, streamed assets with greybox fallbacks, look-dev stack with quality tiers, F3 dev HUD.
// Dev URL parameters (harmless in production): ?tier=ultra|high|low, ?motion=reduce,
// ?view=overview|camp|close (camera presets), ?play=direct (skip the lobby), ?seed=<32 hex> (fixed
// test season), ?lang=en|ru, ?hud=old (greybox overlay instead of the world HUD), ?hints=reset (Novice hints
// fire again), ?demo=judge (the judges' 3-minute path: fixed season, Novice, fresh hints).
// The session starts in the town on the ground (scenes/town.js, docs/town.md) unless the URL skips it
// (ui/loading.js townPlan: ?skip=town, or a deep link such as ?play=direct without ?town=1); the season starts
// when Iris registers at the Tournament altar. ?town=altar spawns at the altar, ?town=flat uses a flat dev ground.
import * as THREE from 'three';
import { createIslandScene } from './scenes/island.js';
import { LookDev } from './render/lookdev.js';
import { detectTier, tierForPreference } from './render/quality.js';
import { cycleLook, KEYS as CYCLE_KEYS } from './render/daycycle.js';
import { lookFor, mixStats } from './render/sky.js';
import { CameraRig } from './render/camera-rig.js';
import { fixedSteps, rayCast, MASK_PLAYER } from './physics/collision.js';
import { PHYSICS_DT, steerTo, clickStuck } from './physics/character.js';
import { damp } from './physics/motion.js';
import { Input } from './ui/input.js';
import { PAD } from './ui/gamepad.js';
import { navigateGamepadMenu } from './ui/gamepad-menu.js';
import { mountSceneControls } from './ui/scene-controls.js';
import './ui/styles.css';
import { DevHud } from './ui/dev-hud.js';
import { configureTextureSupport, setModelVariant, setModelOverrides, getModelVariant, hasModelFile, prefetchGltf } from './render/assets.js';
import { irisStandInVisible, liteFirstPolicy, JUDGE_PINS } from './render/streaming.js';
import { GpuWarmup, setActiveWarmup } from './render/warmup.js';
import { logKeysFromStats } from './ui/loading.js';
import { CAMPS, SPAWN, KILL_Y } from './scenes/layout.js';
import { ASSETS } from './render/asset-catalog.js';
import { townPlan } from './ui/loading.js';
import { createTownScene, CORE_GLOW } from './scenes/town.js';
import { createTownFlow } from './scenes/town-flow.js';
import { createTownQuest, questPlan, QUEST_KEY } from './scenes/town-quest.js';
import { createTownLedger } from './game/town-economy.js';
import { createDay1Mint, loadDay1 } from './play/day1-mint.js';
import { TALK_RADIUS } from './scenes/town-quest.js';
import { PROGRAMS, TOWNSFOLK } from './play/townsfolk-plan.js';
import { createTownCasting, CAST_KEYS } from './scenes/town-casting.js';
import { townToWorld, TOWN_SHOPS, shopDoorAt, TOWN_SPOTS, TOWN_ORIGIN as TOWN_ORIGIN_W, TOWN_SPAWN, TOWN_ALTAR, TOWN_ALTAR_SPAWN, TOWN_ALTAR_ASSET, TOWN_KILL_Y, TOWN_CAMERA, TOWN_ATMOSPHERE, TOWN_ROUTE } from './scenes/town-layout.js';
import { createFogCards } from './render/fog-cards.js';
import { createTownShops } from './scenes/town-shops.js';
import { createTownProps } from './scenes/town-props.js';
import { createBarks } from './scenes/barks.js';
import { createPhotoMode } from './render/photo-mode.js';
import { createTownMonsters } from './scenes/town-monsters.js';
import { createChestBag } from './game/chests.js';
import { cue } from './audio/town-audio.js';

/**
 * Builds the renderer, the island, the camera and the frame loop (the heavy chunk: three.js, scenes, render,
 * physics). main.js imports this module lazily so the loading screen and the lobby paint first (docs/first-seconds.md).
 * The play layer (src/play) is imported only when the player enters the world.
 * @param {{params: URLSearchParams, ctx: object, uiRoot: HTMLElement, onProgress?: (stats) => void, onFirstFrame?: () => void, lobbyOpen?: () => boolean, closeLobby?: () => void}} boot
 */
export async function createWorld(boot) {
const { params, ctx, uiRoot } = boot;
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

if (import.meta.env.DEV && params.get('shells') === 'r2') setModelOverrides({ shell_1: 'shell_1_r2', shell_2: 'shell_2_r2', shell_3: 'shell_3_r2', shell_4: 'shell_4_r2' }); // review round 2
if (params.get('tex') === 'm' || (params.get('tex') !== 'full' && (mobileDevice || (params.get('tier') || detectedTier) === 'low'))) setModelVariant('_m');
// QA-030: the heroine streams before the camps and props, and her greybox capsule stays hidden while her model is
// on its way (shown only without a file, after a failure, or after IRIS_STANDIN_AFTER seconds).
const irisLoad = { hasModel: hasModelFile('agent_iris'), fetched: false, loaded: false, failed: false, t0: performance.now() };
// The same file play/iris-avatar.js irisModelFile() picks: the phone variant when the build ships it.
const irisFile = getModelVariant() && hasModelFile('agent_iris' + getModelVariant()) ? 'agent_iris' + getModelVariant() : 'agent_iris';
// A failed download is retried (a slow or lossy link); players never see the greybox capsule in her place.
const fetchIris = (attempt = 0) => prefetchGltf(irisFile).then(() => { irisLoad.fetched = true; irisLoad.failed = false; }, () => { irisLoad.failed = true; if (attempt < 4) setTimeout(() => fetchIris(attempt + 1), 2000 * (attempt + 1)); });
if (irisLoad.hasModel) fetchIris();
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.2, 500);
const world3d = createIslandScene(renderer, camera);
const { scene, world, streamer, interactables, player, avatar, marker, shells } = world3d;
// Light first (docs/smoothness.md): desktop shows the 2048-texture files first (about half the bytes), then swaps
// in the full set, one model at a time, once everything in view is there. ?lite=off: full files at once (the old
// order); ?lite=only: never upgrade. Save-Data and 2G/3G-class links keep the light set.
const conn = navigator.connection || {};
const litePolicy = liteFirstPolicy({ variant: getModelVariant(), param: params.get('lite'), saveData: !!conn.saveData, effectiveType: conn.effectiveType || '' });
world3d.library.liteFirst = litePolicy.liteFirst;
streamer.upgrade = litePolicy.upgrade;
const irisStandIn = [...avatar.children];
function updateIrisStandIn() {
  if (irisLoad.loaded) return;
  irisLoad.loaded = avatar.children.length > irisStandIn.length; // attachIris (play/agents.js) added her model
  if (avatar.userData.irisFailed) irisLoad.failed = true;
  const show = irisStandInVisible({ ...irisLoad, waited: (performance.now() - irisLoad.t0) / 1000, players: !import.meta.env.DEV && params.get('greybox') !== '1' });
  for (const c of irisStandIn) c.visible = show;
}
updateIrisStandIn();
player.smooth = true; // the locomotion model: speed-dependent acceleration, braking, turn rate (docs/movement.md)
// The settings' Quality (ui/prefs.js: auto | high | low) drives the 3D tier; only 'auto' lets the frame-time governor step it down.
const qualityPref = (ctx.prefs && ctx.prefs.get().quality) || 'auto';
const lookdev = new LookDev({
  renderer, scene, camera,
  cloudLevel: world3d.cloudLevel, grassPatches: world3d.grassPatches, lanterns: world3d.lanterns,
  tier: params.get('tier') || (qualityPref === 'auto' ? detectedTier : tierForPreference(qualityPref, detectedTier)),
  autoTier: !params.has('tier') && qualityPref === 'auto', detectedTier, preset: params.get('tod') || undefined,
  reducedMotion: params.get('motion') === 'reduce' || systemReduced,
});
// Streamed models warm up on the GPU before they replace their greybox (render/warmup.js, docs/smoothness.md):
// textures a few per frame, shader programs compiled in parallel. ?warm=off restores the old one-frame swap (QA).
lookdev.blobs.track(avatar, { radius: 0.46, visible: () => player.grounded !== false }); // a soft contact shadow under Iris (render/blobs.js)
const warmup = new GpuWarmup({ renderer, camera, scene, target: () => lookdev.post.target, frameBytes: (mobileDevice ? 8 : 24) * 1024 * 1024 });
if (params.get('warm') !== 'off') { streamer.warm = (template) => warmup.warm(template); setActiveWarmup(warmup); }
// The island's own programs (sky, clouds, grass, greyboxes) compile in parallel too, while the loading screen or
// the lobby is up, so the first frame is not one long shader build. Rendering starts when they are ready.
let sceneReady = params.get('warm') === 'off';
if (!sceneReady) warmup.compile(scene).then(() => { sceneReady = true; });
// ---- end of render setup ----
// Shells between the camera and Iris dither down instead of hiding her (visual only).
for (const s of shells) {
  lookdev.trackOccluder({ sphere: () => new THREE.Sphere(s.instance.center, s.instance.radius), roots: () => [s.instance.real || s.instance.greybox], pad: 0.5 });
}
const rig = new CameraRig(camera, world);
const input = new Input(renderer.domElement);
const hud = new DevHud(document.getElementById('hud'));
const promptEl = document.getElementById('prompt');
// The lobby (title, language, settings, the Foresight Exchange) opens only from the pause menu now: the game starts in
// the town (ui/loading.js bootPlan). Entering from it returns to the world.
let menuLobby = null;
const openMainMenu = () => {
  if (menuLobby) return;
  Promise.all([import('./ui/index.js'), import('./ui/flow.js')]).then(([ui, fl]) => {
    const flow = fl.createOnboardingFlow(ctx.storage);
    const host = document.createElement('div'); host.className = 'ftf-root-menu'; uiRoot.append(host);
    menuLobby = ui.mountLobby(host, { ctx, flow, onEnter: () => { if (menuLobby) { menuLobby.destroy(); menuLobby = null; host.remove(); } } });
  }).catch((e) => console.warn('[menu] lobby', e));
};
const controls = mountSceneControls(document.getElementById('scene-controls'), { onContext: handleInspect, onTransition: clearWorldInput, onMainMenu: openMainMenu,
  extra: [
    { label: 'Return to town (your season is kept: register at the altar to go back)', visible: () => !!(town && play && !inTown), onClick: () => returnToTown() },
    { label: 'Start over (a new season)', visible: () => !!play, onClick: () => { if (window.confirm('Start a new season? The current one is lost.')) startOver(); } },
  ] });
{ const st = document.createElement('style'); st.textContent = '.ftf-play-away #ui > *:not(.ftf-root-menu) { display: none !important; }'; document.head.append(st); }
const toastEl = document.getElementById('toast');

// The play layer starts on entering the world (from the lobby's first contact, or at once with ?play=direct).
// ?demo=judge: a fixed v3 season whose first sign is visible on trial 1 and whose trial-3 Gift lands on
// Shell II with a verified proof (docs/design/clarity-layers.md §6a item 8). Presentation only.
const JUDGE_SEED = 'cc161d308faa67539af44205b56b6d4f';
// The town ledger (game/town-economy.js): town silk, hired townsfolk, XP and the profile; this browser only, never the season.
const townLedger = createTownLedger({ storage: ctx.storage });
ctx.townLedger = townLedger; // the Echo terminal's board shows the learning townsfolk agents
// The game menu (play/game-menu.js): Profile, Achievements, NFTs, Inventory + wheel, Agents, Log / Stats.
const openProfileFor = (quest = null, tab = 'profile') => import('./play/game-menu.js').then((m) => { const d1 = loadDay1(ctx.storage); return m.openGameMenu({ t: (k, a) => ctx.i18n.t(k, a), ledger: townLedger, storage: ctx.storage, tab, chests: chestBag, owner: (d1.guest || {}).account_id || null, nickname: d1.nickname || null, eliseMinted: !!d1.minted, exportKey: d1.playerKey ? () => { const r = loadDay1(ctx.storage); return `account: ${(r.guest || {}).account_id || '(not created yet)'}\nsecret key: ${r.playerKey.secretKey}`; } : null }); }).catch((e) => console.warn('[menu]', e));
const judge = params.get('demo') === 'judge';
if (judge) ctx.prefs.set({ hudMode: 'novice' });
if (ctx.prefs && !params.has('tier')) { // a Quality change in the settings applies at once; a fixed choice switches the governor off
  let lastPref = qualityPref;
  ctx.prefs.subscribe(() => {
    const pref = ctx.prefs.get().quality || 'auto';
    if (pref === lastPref) return;
    lastPref = pref;
    if (pref !== 'auto') lookdev.governor = null;
    lookdev.setQuality(pref === 'auto' ? detectedTier : tierForPreference(pref, detectedTier));
  });
}
const seedParam = judge ? JUDGE_SEED : params.get('seed') || '';
let play = null, entering = null, season = null, entered = false;
// The play layer (room, engine, world HUD, hub, map) is its own chunk: not needed for the first frame.
const loadPlayLayer = () => Promise.all([import('./play/game.js'), import('./play/audio-settings.js'), import('./play/all-ages.js')]);

// ---- the town on the ground (docs/town.md): play starts here; the season starts at the Tournament altar ----
const townMode = townPlan({ skip: params.get('skip'), town: params.get('town'), play: params.get('play'), cinematic: params.get('cinematic'), view: params.get('view'), film: params.get('film') });
let fogCards = null, townShops = null, townProps = null, townAudio = null, townBarks = null, photo = null, townMonsters = null;
const chestBag = createChestBag({ storage: ctx.storage }); // chests from the monsters outside the walls (game/chests.js)
const lastStepPos = [0, 0, 0];
/** The town's sound (audio/town-audio.js): made when the town starts and again after Return to town. */
function mountTownAudio() {
  if (townAudio) return;
  Promise.all([import('./audio/audio.js'), import('./audio/town-audio.js')]).then(([a, t]) => { if (!townAudio && inTown) townAudio = t.createTownAudio({ createAudio: a.createAudio }); }).catch((e) => console.warn('[town] audio', e));
}
let town = null, townFlow = null, townCasting = null, inTown = false, townGrounded = false, irisAvatar = null;
let restoreCamera = () => {};
const islandStart = { heading: player.heading };
if (townMode.town) {
  town = createTownScene({ scene, streamer, flat: townMode.flat, pointLights: !!lookdev.cfg.pointLights, detail: lookdev.profile === 'phone' || lookdev.tier === 'low' ? 0 : 1 });
  lookdev.onQualityChange(() => town.setPointLights(!!lookdev.cfg.pointLights));
  inTown = true;
  const sp = townMode.spawn === 'altar' ? TOWN_ALTAR_SPAWN : TOWN_SPAWN;
  player.world = town.world; rig.world = town.world;
  player.teleport(sp.position, sp.heading);
  player.killY = TOWN_KILL_Y; // absolute: the island's kill height would never catch a fall here
  const islandMinPitch = rig.minPitch, islandFar = camera.far;
  restoreCamera = () => { rig.minPitch = islandMinPitch; camera.far = islandFar; camera.updateProjectionMatrix(); };
  camera.far = TOWN_CAMERA.far; camera.updateProjectionMatrix();
  rig.minPitch = TOWN_CAMERA.minPitch; rig.dist = TOWN_CAMERA.dist; rig.pitchOffset = TOWN_CAMERA.tilt; rig.yaw = rig.baseYaw; rig.rotate(sp.heading + Math.PI - rig.baseYaw); // behind Iris, looking up the street
  lookdev.setAtmosphereFloor(TOWN_ATMOSPHERE);
  // The town quest (scenes/town-quest.js, hackathon spec P1-B): three talks on the way to the altar, once per device,
  // never on the judge link (?quest=1 forces it, ?quest=0 skips). The purse is a teaching prop: no engine, no chain.
  const quest = questPlan({ demo: params.get('demo'), quest: params.get('quest'), stored: ctx.storage ? ctx.storage.getItem(QUEST_KEY) : null })
    ? createTownQuest({ storage: ctx.storage }) : null;
  let signFn = null;
  if (quest) import('./ui/onboarding.js').then((m) => { signFn = m.tutorialSignSvg; }).catch(() => {});
  if (quest) { let prev = quest.step; quest.subscribe(() => { if (quest.step !== prev && prev !== 'start') townLedger.addXp('questStep'); prev = quest.step; }); }
  // the nearest townsperson Iris can talk to (live positions: walkers move), for the hire talk
  const folkPos = (p) => [p.plan.x + TOWN_ORIGIN_W[0], p.plan.y + TOWN_ORIGIN_W[1], p.plan.z + TOWN_ORIGIN_W[2]];
  const folkNear = (pos) => {
    const tf = town.townsfolk; if (!tf) return null;
    let best = null, bd = TALK_RADIUS;
    for (const p of tf.people) { if (p.state !== 'loaded' || !p.root.visible) continue; const q = folkPos(p); if (Math.abs(q[1] - pos[1]) > 2.5) continue; const d = Math.hypot(q[0] - pos[0], q[2] - pos[2]); if (d < bd) { bd = d; best = p.def.key; } }
    return best;
  };
  const folkAt = (key) => { const p = town.townsfolk && town.townsfolk.byKey.get(key); return p ? folkPos(p) : null; };
  const badge = (key, on) => { if (town.townsfolk) { town.townsfolk.setBadge(key, on); town.townsfolk.sendToTrade(key, on); } };
  for (const h of townLedger.hires()) badge(h.npc, true);
  // Town spots (owner, 11.11: the town is the menu): the three shop doors, the notice board after the stairs, and a
  // mirror by the gate for the optional look picker.
  const spotAt = (local, radius) => { const w = townToWorld(local); return (pos) => Math.hypot(pos[0] - w[0], pos[2] - w[2]) <= radius && Math.abs(pos[1] - w[1]) <= 2.5; };
  const spots = [
    ...TOWN_SHOPS.filter((s) => ['exchange', 'scribe', 'inn'].includes(s.id)).map((s) => ({ id: s.id, near: (pos) => { const d = shopDoorAt(pos); return !!d && d.id === s.id; } })),
    { id: 'board', near: spotAt(TOWN_SPOTS.board, 2.2) },
    { id: 'mirror', near: spotAt(TOWN_SPOTS.mirror, 1.6) },
    { id: 'wheel', near: (pos) => !!townProps && townProps.nearWheel(pos) }, // the wheel prop by the Inn (scenes/town-props.js)
  ];
  townProps = createTownProps({ scene, town, ledger: townLedger, i18n: ctx.i18n, mobile: mobileDevice });
  if (!townMonsters) townMonsters = createTownMonsters({ scene, town, player, bag: chestBag, mobile: mobileDevice, onPickup: () => toast(ctx.i18n.t('chest.found')) }); // loaded on the first walk out of the gate
  if (!photo) photo = createPhotoMode({ canvas: renderer.domElement, i18n: ctx.i18n, rig, onChange: (on) => { if (on) { stopSteering(); clearWorldInput(); } } }); // feature 9: P
  if (!townBarks) { // feature 7: a short line from the townsfolk Iris walks past (scenes/barks.js)
    const people = [];
    townBarks = createBarks({ camera, i18n: ctx.i18n, hour: () => lookdev.look && lookdev.look.name, rain: () => lookdev.weather.state.rain || 0,
      hired: () => townLedger.hires().map((h) => h.npc),
      people: () => { people.length = 0; const tf = town.townsfolk; if (tf) for (const p of tf.people) if (p.state === 'loaded' && p.root.visible) people.push({ key: p.def.key, pos: folkPos(p) }); return people; } });
  }
  mountTownAudio();
  import('./audio/haptics.js').then((m) => m.createHaptics({ storage: ctx.storage, reduced: () => lookdev.reducedMotion })).catch(() => {}); // feature 6: the same cues as a short pulse
  const onExchange = () => import('./ui/exchange-terminal.js').then((m) => m.openExchangeTerminal({ i18n: ctx.i18n, storage: ctx.storage, ledger: townLedger })).catch((e) => console.warn('[town] exchange', e));
  const onMirror = () => import('./ui/hologram/constructor.js').then((m) => {
    const wrap = document.createElement('div');
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', ctx.i18n.t('spot.mirror'));
    wrap.style.cssText = 'position:fixed;inset:0;z-index:70;display:grid;place-items:center;background:rgba(6,10,12,.6);overflow:auto';
    const box = document.createElement('div'); box.style.cssText = 'max-width:min(980px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;background:rgba(14,20,22,.96);border-radius:14px;padding:12px';
    const done = document.createElement('button'); done.type = 'button'; done.textContent = ctx.i18n.t('mirror.done');
    done.style.cssText = 'min-height:40px;padding:4px 16px;margin-top:10px;border-radius:8px;border:1px solid rgba(233,180,76,.6);background:rgba(233,180,76,.92);color:#1d1708;font:500 15px system-ui,sans-serif;cursor:pointer';
    const host = document.createElement('div'); box.append(host, done); wrap.append(box);
    wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.append(wrap);
    const child = m.mountConstructor(host, { ctx });
    const close = () => { try { child.save(); child.destroy(); } catch { /* gone */ } wrap.remove(); };
    done.addEventListener('click', close);
    wrap.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
    done.focus();
  }).catch((e) => console.warn('[town] mirror', e));
  townFlow = createTownFlow({
    spots, onExchange, onMirror, folkList: TOWNSFOLK.map((p) => p.key),
    ledger: townLedger, folkNear, folkAt, onHireChange: badge, onProfile: () => openProfileFor(quest), onDoor: (id) => { if (!townShops) return false; townShops.enter(id); return true; }, onWheel: () => openProfileFor(null, 'wheel'),
    quest, npcAt: (key) => (PROGRAMS[key] ? townToWorld(PROGRAMS[key].home) : null), signSvg: () => (signFn ? signFn(ctx.i18n) : null),
    town, player, rig, ctx, coarse: mobileDevice, reducedMotion: () => lookdev.reducedMotion, leave: leaveTown,
    islandProgress, islandLog: () => (inTown ? [] : logKeysFromStats(streamer.stats(), (a) => a.priority >= 100)),
    islandReady, // the cover stays until the archipelago's first view is loaded and warmed
    onRegister: () => { if (irisAvatar) irisAvatar.react('register', clock.elapsedTime); }, // she reaches for the ring
  });
  mountCasting();
  // Walk-in shops (scenes/town-shops.js): the door fades into the streamed interior; the counter opens the door's panel.
  townShops = createTownShops({ scene, streamer, player, rig, lookdev, i18n: ctx.i18n, reducedMotion: () => lookdev.reducedMotion,
    onCounter: (id) => townFlow.openSpot(id), street: { world: () => town.world, killY: TOWN_KILL_Y } });
  fogCards = createFogCards(scene, TOWN_ROUTE); // ground fog along the street and stairs (night, early morning)
  // Iris wears her model and walks with her gait before the season exists; the same avatar goes on to the play
  // layer. Importing it also brings the play chunk in while the player crosses the town, so registering does not stall.
  // A failed attach (a dropped download) is tried again a few times; the loading screen covers the wait.
  const attachIris = (attempt = 0) => import('./play/iris-avatar.js').then((m) => { irisAvatar = irisAvatar || new m.IrisAvatar(); return irisAvatar.attach(avatar); }).then(() => {
    if (avatar.userData.irisFailed && attempt < 4) { setTimeout(() => { avatar.userData.irisFailed = false; irisLoad.failed = false; attachIris(attempt + 1); }, 3000 * (attempt + 1)); }
  }).catch((e) => console.warn('[town] Iris model unavailable', e));
  attachIris();
  loadPlayLayer().catch(() => {});
  // Once the town is shown, the archipelago's files go into the HTTP cache at low priority, so the registration
  // cover has little left to download (skipped on Save-Data and 2G/3G-class links).
  if (!conn.saveData && !/(^|-)(2g|3g)$/.test(conn.effectiveType || '')) {
    const warmIsland = () => { if (!town.shown) { setTimeout(warmIsland, 1500); return; } world3d.library.prefetchHttp([...ISLAND_FIRST_VIEW, 'shell_interior']); };
    setTimeout(warmIsland, 3000);
  }
}

/**
 * The archipelago's first view is in: every asset on screen from the island spawn is real (downloaded, warmed on
 * the GPU, attached) or will never come. Read from the streamer two ticks after the teleport, so the priorities
 * are those of the island view. No per-frame cost: the flow polls it only under the cover.
 */
let leftTownAt = 0;
function islandReady() {
  if (inTown || performance.now() - leftTownAt < 700) return false;
  for (const a of streamer.stats().list) if (a.priority >= 100 && a.state !== 'loaded' && a.state !== 'absent' && a.state !== 'failed') return false;
  return true;
}

/** 0..1: bytes of the island's first view that are in (downloaded counts 0.8, warmed and attached the rest). */
function islandProgress() {
  if (inTown) return 0;
  let all = 0, got = 0;
  for (const a of streamer.stats().list) {
    if (a.priority < 100 || a.state === 'absent' || a.state === 'failed') continue;
    const b = a.bytes || 1e5; all += b;
    got += a.state === 'loaded' ? b : 0.8 * b * (a.state === 'warming' ? 1 : a.progress || 0);
  }
  return all > 0 ? got / all : 0;
}

const ISLAND_FIRST_VIEW = ASSETS.filter((a) => a.kind !== 'interior').map((a) => a.name);
/** Under the transition's cover: Iris leaves the town for the archipelago and the season starts as it always did. */
/**
 * Return to town (owner, 11.11): from the archipelago back to the town with the season kept in memory; registering at
 * the altar again resumes the same season (startSeason is memoized). The play layer's UI hides and its keys sleep.
 */
/** Outside the walls (docs/town.md): skillshots on the hillside beyond the lower gate; the first two skill-bar slots. */
function mountCasting() {
  if (townCasting || !town) return;
  townCasting = createTownCasting({ scene, camera, town, player, i18n: ctx.i18n, coarse: mobileDevice,
    onCast: (id, shot) => { if (townMonsters) townMonsters.cast(id, shot); cue(id === 'snare' ? 'storm_crack' : 'vision_whoosh'); if (irisAvatar) irisAvatar.react('greet', clock.elapsedTime); } }); // her hand goes up with the cast
}
function returnToTown() {
  if (!town || !townFlow || inTown || !play) return;
  clearWorldInput(); stopSteering();
  if (play.ui && play.ui.panel) play.ui.close();
  inTown = true; townGrounded = true;
  document.body.classList.add('ftf-play-away');
  town.setActive(true);
  player.world = town.world; rig.world = town.world;
  player.killY = TOWN_KILL_Y;
  player.teleport(TOWN_ALTAR_SPAWN.position.slice(), TOWN_ALTAR_SPAWN.heading);
  rig.minPitch = TOWN_CAMERA.minPitch; rig.dist = TOWN_CAMERA.dist; rig.pitchOffset = TOWN_CAMERA.tilt; rig.reset();
  lookdev.setAtmosphereFloor(TOWN_ATMOSPHERE);
  mountCasting(); // leaveTown disposed it: without this the two skills were gone after Return to town
  mountTownAudio();
  townFlow.reenter();
}
/** Start over: a new local season (the judge link rebuilds the same fixed season). */
function startOver() { location.reload(); }

async function leaveTown() {
  inTown = false; leftTownAt = performance.now();
  document.body.classList.remove('ftf-play-away');
  clearWorldInput();
  town.setActive(false);
  if (townCasting) { townCasting.dispose(); townCasting = null; }
  if (townBarks) townBarks.update(player.pos, false); // no bubble left over the archipelago
  if (photo) { photo.toggle(false); photo.setAvailable(false); }
  if (townAudio) { townAudio.dispose(); townAudio = null; } // the archipelago's play layer has its own audio
  player.world = world; rig.world = world;
  player.killY = KILL_Y;
  player.teleport(SPAWN.slice(), islandStart.heading);
  restoreCamera(); rig.reset();
  lookdev.setAtmosphereFloor(null);
  await startSeason();
}

function startSeason() {
  if (season) return season;
  // On the archipelago the four Shells and the Shell hall are wanted even off screen (after the first view,
  // before the full-resolution upgrades), so the first flight lands in the real hall (docs/smoothness.md).
  for (const [name, priority] of Object.entries(JUDGE_PINS)) streamer.pin(name, priority);
  season = (async () => {
  try {
    const [{ startPlay }, { mountAudioSettings }, { attachAllAges }] = await loadPlayLayer();
    play = await startPlay({ scene, camera, renderer, world3d, rig, player, avatar, lookdev, uiRoot, ctx, options: {
      seedHex: /^[0-9a-f]{32}$/.test(seedParam) ? seedParam : undefined,
      resetHints: judge || params.get('hints') === 'reset',
      townLedger, openProfile: () => openProfileFor(null),
      judge, // ?demo=judge: the shard card opens by itself after the trial-6 auction (hackathon spec P1-C)
      worldHud: params.get('hud') !== 'old', // ?hud=old: the greybox overlay (fallback)
      hub: params.get('mode') !== 'walk', // ?mode=walk: walking play without the Shell hub
      onSettings: () => controls.open(),
      iris: irisAvatar, // the town already attached her model (null on the paths that skip the town)
    } });
    window.__ftf.play = play;
    setTimeout(() => { try { play.shell.preload(); } catch { /* the first visit loads them */ } }, 2500); // the Guests' model, ahead of the first flight
    // Volume sliders in the scene settings dialog (the audio module loads lazily: the getter resolves it later).
    mountAudioSettings(controls.dialog, { audio: () => (play && play.hooks.audio) || null, i18n: ctx.i18n, storage: ctx.storage });
    attachAllAges({ play, ctx, uiRoot, settingsDialog: controls.dialog }); // Task Q: recap, Simple mode, in-world Settings, narration (docs/accessibility.md)
  } catch (e) { console.error('[play] failed to start', e); toast('The local season failed to start: ' + e.message); }
  })();
  return season;
}

// ---- Day 1 (docs/day1-free-mint-plan.md): arrival, name, the free Elise mint, hints, story trailers, the skin ----
const day1Mint = createDay1Mint({ storage: ctx.storage });
const day1On = () => {
  const q = params.get('day1');
  if (q === '0') return false;
  if (q === '1') return true;
  return !judge && !loadDay1(ctx.storage).claimed;
};
// Elise's own model is not in yet: she wears Iris's body in her colors (said in the hint and the toast).
const ELISE_TINT = new THREE.Color(0.78, 0.6, 1.0);
function applySkin(skin) {
  avatar.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.color) return;
    if (!o.userData.irisColor) o.userData.irisColor = o.material.color.clone();
    o.material.color.copy(o.userData.irisColor);
    if (skin === 'elise') o.material.color.multiply(ELISE_TINT);
  });
}
function toggleSkin() {
  const next = (loadDay1(ctx.storage).skin || 'iris') === 'iris' ? 'elise' : 'iris';
  day1Mint.setRecord({ skin: next });
  applySkin(next);
  toast(ctx.i18n.t('day1.skin.' + next) + (next === 'elise' ? ' · ' + ctx.i18n.t('day1.skin.note') : ''));
}
/** Above the altar: when the next Tournament round starts ("Open now" in this build: rounds are always open). */
let altarTimer = null;
const _altarP = new THREE.Vector3();
function updateAltarTimer() {
  if (!town || !inTown) { if (altarTimer) altarTimer.hidden = true; return; }
  if (!altarTimer) {
    altarTimer = document.createElement('div'); altarTimer.className = 'ftf-altar-timer'; altarTimer.setAttribute('aria-hidden', 'true');
    altarTimer.style.cssText = 'position:fixed;left:0;top:0;z-index:6;pointer-events:none;transform:translate(-50%,-100%);padding:6px 12px;border-radius:14px;background:rgba(20,14,40,.78);border:1px solid rgba(255,210,122,.7);color:#fff7e6;font:600 13px/1.25 system-ui,sans-serif;text-align:center;white-space:nowrap';
    document.body.append(altarTimer);
  }
  const a = TOWN_ALTAR.position;
  _altarP.set(a[0], a[1] + 4.2, a[2]).project(camera);
  const visible = _altarP.z < 1 && Math.abs(_altarP.x) < 1.1 && Math.abs(_altarP.y) < 1.1;
  altarTimer.hidden = !visible;
  if (!visible) return;
  const text = ctx.i18n.t('day1.altar.timer') + ' · ' + ctx.i18n.t('day1.altar.open');
  if (altarTimer.textContent !== text) altarTimer.textContent = text;
  altarTimer.style.left = ((_altarP.x + 1) / 2 * innerWidth).toFixed(0) + 'px';
  altarTimer.style.top = ((1 - _altarP.y) / 2 * innerHeight).toFixed(0) + 'px';
}

/**
 * The intro fly-through (feature 5): on the first visit the camera sweeps down from high above the town, circling a
 * third of the way round, and settles behind Iris. Any key or tap, or Skip, ends it; ?skip=intro, the jury path and
 * reduced motion never show it. Remembered in this browser. Resolves when it is over.
 */
const INTRO_KEY = 'ftf.intro.v1';
let introOn = false; // the intro flight is on screen (the barks wait)
function introFly(ms = 6500) {
  let seen = false; try { seen = !!(ctx.storage && ctx.storage.getItem(INTRO_KEY)); } catch { /* none */ }
  if (seen || judge || lookdev.reducedMotion || params.get('skip') === 'intro' || params.get('intro') === 'off') return Promise.resolve(false);
  // the town is entered under the loading screen: fly only once the screen is gone (main.js sets __ftfBootMarks.done)
  const revealed = () => new Promise((res) => { const t0 = performance.now(); const tick = () => ((window.__ftfBootMarks && window.__ftfBootMarks.done) || performance.now() - t0 > 180000 ? res() : setTimeout(tick, 150)); tick(); });
  return revealed().then(() => new Promise((resolve) => {
    try { if (ctx.storage) ctx.storage.setItem(INTRO_KEY, '1'); } catch { /* memory only */ }
    let t0 = 0; const turn = (2 * Math.PI) / 3, startYaw = rig.yaw; // t0: the first frame (a slow first frame must not eat the flight)
    const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'ftf-town-prompt'; skip.textContent = ctx.i18n.t('intro.skip');
    skip.style.cssText = 'position:fixed;right:16px;bottom:16px;left:auto;transform:none;z-index:31';
    document.body.append(skip);
    let done = false, last = 0; introOn = true;
    const end = () => {
      if (done) return; done = true; introOn = false;
      rig.pitchOverride = null; rig.dist = TOWN_CAMERA.dist; rig.rotate(startYaw - rig.yaw);
      skip.remove(); window.removeEventListener('keydown', end); window.removeEventListener('pointerdown', end);
      resolve(true);
    };
    skip.addEventListener('click', end);
    window.addEventListener('keydown', end); window.addEventListener('pointerdown', end);
    rig.rotate(-turn);
    const step = () => {
      if (done) return;
      if (!t0) t0 = performance.now();
      const p = Math.min(1, (performance.now() - t0) / ms), e = p * p * (3 - 2 * p);
      rig.dist = 70 + (TOWN_CAMERA.dist - 70) * e;
      rig.pitchOverride = (62 - 50 * e) * Math.PI / 180;
      const target = turn * e; rig.rotate(target - last); last = target;
      if (p < 1) requestAnimationFrame(step); else end();
    };
    requestAnimationFrame(step);
  }));
}

/** The camera settles on the heroine from high above the gate (Day 1 arrival). */
function flyIn(ms) {
  if (!ms) return;
  const from = 26, to = TOWN_CAMERA.dist, t0 = performance.now();
  const step = () => { const p = Math.min(1, (performance.now() - t0) / ms), e = 1 - Math.pow(1 - p, 3); rig.dist = from + (to - from) * e; if (p < 1) requestAnimationFrame(step); };
  rig.dist = from; requestAnimationFrame(step);
}
async function startDay1() {
  if (loadDay1(ctx.storage).skin === 'elise') applySkin('elise');
  if (!day1On()) return;
  const t = (k, a) => ctx.i18n.t(k, a);
  const m = await import('./play/day1.js');
  await m.runArrival({ t, mint: day1Mint, flyIn, reduced: () => lookdev.reducedMotion, inventoryEl: () => document.querySelector('.ftf-town-profile'), nickname: loadDay1(ctx.storage).nickname || '' });
  const orbit = (base) => (p) => { rig.dist = TOWN_CAMERA.dist + 9 * Math.sin(Math.PI * p); rig.rotate(base); };
  await m.runHints({ t, steps: [
    { key: 'day1.hint.skin' },
    { key: 'day1.hint.quest', when: () => !!(townFlow && townFlow.questActive) },
    { key: 'day1.hint.trailers', buttons: [{ key: 'day1.hint.watch', fn: async () => {
      await m.playTrailer({ t, keys: ['day1.trailer.hero.1', 'day1.trailer.hero.2', 'day1.trailer.hero.3'], camera: orbit(0.004) });
      await m.playTrailer({ t, keys: ['day1.trailer.town.1', 'day1.trailer.town.2', 'day1.trailer.town.3'], camera: orbit(-0.004) });
      rig.dist = TOWN_CAMERA.dist;
    } }] },
    { key: 'day1.hint.tournament' },
  ] });
}

/** The player enters the world (the lobby's first contact, or at once on the direct path): the town, else the season. */
async function enterWorld() {
  if (entering) return entering;
  entering = (async () => {
    if (boot.closeLobby) boot.closeLobby();
    document.body.classList.add('in-world');
    entered = true;
    if (inTown) { townFlow.begin(); introFly().then(startDay1); return; } // the first visit flies in, then Day 1
    await startSeason();
  })();
  return entering;
}
const coarse = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();

window.addEventListener('resize', () => lookdev.setSize(window.innerWidth, window.innerHeight));

let toastTimer = 0;
function toast(text) { toastEl.textContent = text; toastEl.hidden = false; toastTimer = 3; }

// moveRun: phones have no Shift, so a tap far away (or a double tap) runs there
const PHYSICS_CARRY = 1.0; // seconds of a long frame that physics catches up on (fixedSteps carry)
const stuck = { stuckTime: 0, lastDist: Infinity }; // click-to-move give-up state (character.js clickStuck)
let moveTarget = null, moveRun = false, lastTap = { t: 0, x: 0, y: 0 };
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
  if (townFlow) townFlow.cancelRoute();
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
const PLAY_KEYS = ['KeyE', 'KeyF', 'KeyM', 'KeyV', 'KeyT', 'KeyH', 'KeyL', 'KeyG', 'KeyN', 'Escape', ...Array.from({ length: 9 }, (_, i) => 'Digit' + (i + 1))]; // N: the island map (play/map-ui.js)

function leaveInspect() { clearWorldInput(); inspecting = null; rig.exitInspect(); }

/** Orbit, tilt and zoom from keys, drag, wheel and the stick (play, the town and photo mode). */
function cameraInput(dt, pad) {
  const [lookX, lookY] = pad.look;
  const rot = Number(input.down('ArrowLeft')) - Number(input.down('ArrowRight')) - lookX;
  const tilt = Number(input.down('ArrowUp')) - Number(input.down('ArrowDown')) + lookY;
  const lookDt = Math.min(dt, 0.05);
  if (rot || input.dragX) rig.rotate(rot * lookDt * 1.8 - input.dragX * 0.005);
  if (tilt || input.dragY) rig.tilt(tilt * lookDt * 1.35 + input.dragY * 0.005);
  if (input.wheel) rig.zoom(Math.pow(1.12, input.wheel));
  if (input.down('Equal', 'NumpadAdd') || pad.down(PAD.zoomIn)) rig.zoom(Math.pow(0.5, lookDt));
  if (input.down('Minus', 'NumpadSubtract') || pad.down(PAD.zoomOut)) rig.zoom(Math.pow(2, lookDt));
}
function handleInput(dt) {
  input.poll();
  const { pad } = input;
  if (input.hit('F3')) hud.toggle();
  const modal = document.querySelector('dialog[open]');
  if (modal) { navigateGamepadMenu(modal, pad); return false; }
  const townOn = inTown && entered; // walking the town: movement and the camera, no play keys (the season has not begun)
  const playOn = play && !inTown; // back in the town after Return to town: the season waits, its keys sleep
  if (!playOn && !townOn) { navigateGamepadMenu(uiRoot, pad); return false; }
  if (townFlow && townFlow.busy) return false; // the registration sequence holds Iris and the camera
  if (photo && townOn && input.hit('KeyP')) photo.toggle();
  if (photo && photo.on) { // photo mode: Iris holds still, the camera orbits freely, a click saves nothing (the bar's button does)
    if (input.hit('Escape') || pad.hit(PAD.cancel)) photo.toggle(false);
    cameraInput(dt, pad);
    return false;
  }
  if (pad.hit(PAD.menu)) { controls.open(); return false; }
  if (input.hit('Escape') || pad.hit(PAD.cancel)) {
    if (townOn && townCasting && townCasting.handleKey('Escape')) return false; // put the armed cast away
    if (townOn && townFlow && townFlow.closePanel()) return false; // close the open talk panel
    if (inspecting) leaveInspect();
    else if (playOn && play.handleKey('Escape')) clearWorldInput();
    else if (moveTarget || (playOn && play.routeActive) || (townOn && townFlow.routeActive)) stopSteering();
    else controls.open();
    return false;
  }
  if (townShops && townShops.busy) return false; // the shop door's fade holds Iris
  if (!playOn && townFlow) { if (input.hit('KeyE') || pad.hit(PAD.interact)) { if (!(townShops && townShops.inside && townShops.interact())) townFlow.interact(); } } // E at the Tournament altar, a shop door or counter
  if (townOn && townFlow && input.hit('KeyO')) townFlow.expandPill(); // O: the newest minimised panel
  if (townOn && townCasting) { // beyond the walls: Q/1 and V/2 arm the casts (scenes/town-casting.js)
    for (const k in CAST_KEYS) if (input.hit(k)) townCasting.handleKey(k);
    townCasting.setPointer(input.hover ? input.hover.x : null, input.hover ? input.hover.y : null);
  }
  if (playOn && (input.hit('KeyI') || pad.hit(PAD.inspect))) handleInspect();
  if (playOn && !inspecting) {
    for (const k of PLAY_KEYS) if (k !== 'Escape' && input.hit(k)) play.handleKey(k);
    if (play.ui.panel) {
      navigateGamepadMenu(uiRoot.querySelector('.pl-panel'), pad);
      stopSteering();
      return false;
    }
    if (pad.hit(PAD.interact)) { play.handleKey('KeyE'); if (play.ui.panel) return false; }
  }
  if (input.hit('KeyK') && (townOn || playOn)) toggleSkin(); // Day 1: Iris <-> Elise
  if (input.hit('KeyR') || pad.hit(PAD.reset)) rig.reset();
  cameraInput(dt, pad);

  if (!inspecting) {
    for (const c of input.clicks) {
      if (inTown && townCasting && townCasting.click(c.x, c.y)) continue; // an armed cast takes the click
      ndc.set((c.x / window.innerWidth) * 2 - 1, -(c.y / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const o = raycaster.ray.origin, d = raycaster.ray.direction;
      const hit = rayCast(inTown ? town.world : world, [o.x, o.y, o.z], [d.x, d.y, d.z], 300, MASK_PLAYER);
      if (hit && hit.normal[1] > 0.7) {
        const now = performance.now();
        const doubleTap = now - lastTap.t < 350 && Math.hypot(c.x - lastTap.x, c.y - lastTap.y) < 40;
        lastTap = { t: now, x: c.x, y: c.y };
        moveRun = doubleTap || (coarse && Math.hypot(hit.point[0] - player.pos[0], hit.point[2] - player.pos[2]) > 8);
        moveTarget = hit.point; stuck.stuckTime = 0; stuck.lastDist = Infinity; if (play) play.cancelRoute(); if (townFlow) townFlow.cancelRoute();
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
  const rw = play && !inTown ? play.routeWish() : inTown ? townFlow.routeWish() : null;
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

/**
 * The town has no ground until its terrain piece has streamed in: Iris waits at the spawn (no physics steps), then
 * is set on the ground under it (the data's spawn is on the ground, give or take a few centimetres).
 */
function groundInTown() {
  if (townGrounded || !town.ready) return;
  if (townMode.spawn === 'altar' && !town.settled(TOWN_ALTAR_ASSET)) return; // the stand is on the altar's own steps
  const y = town.groundAt(player.pos[0], player.pos[2], player.pos[1] + 3);
  if (y != null) player.teleport([player.pos[0], y, player.pos[2]], player.heading);
  townGrounded = true;
}
const townFrame = { playerPos: player.pos, reducedMotion: false, lamps: 1, camera, light: { sun: null, daylight: 1, pixelsPerMetre: 900 } }, flowFrame = { device: 'keyboard' }; // reused: no per-frame objects

let movingState = false, animSpeed = 0, lean = 0, firstFrameDone = false, progressTimer = 0;
// The town's day cycle (render/daycycle.js, owner 11.11): early morning → evening → night with mist and moon → early
// morning, continuous every frame (the sky statistics of the five hours are read once, outside the frame loop, then
// blended). Off on the jury path and when the URL fixes the hour or the weather; held under reduced motion.
const dayCycle = !judge && !params.has('tod') && !params.has('weather') && params.get('cycle') !== 'off'
  ? { t: Number(params.get('cycle')) || 0, weather: null, ready: false } : null;
function prepareDayCycle() {
  if (!dayCycle || dayCycle.ready || lookdev.location !== 'town') return;
  lookdev.prepareCycle('town', CYCLE_KEYS.map((k) => k[0]));
  dayCycle.ready = true;
}
if (dayCycle) setTimeout(prepareDayCycle, 0); // under the loading screen, not in a frame
function tickDayCycle(dt) {
  if (lookdev.location !== 'town') return;
  if (!dayCycle.ready) { setTimeout(prepareDayCycle, 0); return; }
  dayCycle.t += dt;
  const c = cycleLook(dayCycle.t, (h) => lookFor('town', h));
  const S = lookdev.cycleStats;
  lookdev.applyLookLive(c.look, mixStats(S[c.a], S[c.b], c.k), clock.elapsedTime);
  if (c.weather !== dayCycle.weather) { dayCycle.weather = c.weather; lookdev.setWeather(c.weather); }
}

function frame() {
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.25); // render, camera and animation delta
  frameTimes.push(dt * 1000); if (frameTimes.length > 240) frameTimes.shift();
  const live = handleInput(dt) !== false;
  // device-aware goal copy (Task I request 15): touch / gamepad / keyboard words follow the last input device
  if (play && play.session) {
    const dev = input.device === 'gamepad' ? 'gamepad' : coarse ? 'touch' : 'keyboard';
    if (play.session.flags.input !== dev) { play.session.flags.input = dev; play.session.recompute(); }
  }

  // Physics keeps up to 1 s of a long frame and pays it back at <= 8 steps per frame (hackathon spec P1-A): a hitch
  // delays a stair climb or a click-to-move walk instead of deleting it (tests/client/movement.test.mjs).
  const f = fixedSteps(accumulator, Math.min(rawDt, PHYSICS_CARRY), PHYSICS_DT, 8, PHYSICS_CARRY);
  accumulator = f.accumulator;
  physics.steps = f.steps; physics.substeps = 0;
  let moving = false;
  player.run = input.down('ShiftLeft', 'ShiftRight') || (moveTarget ? moveRun : coarse && !!(play && play.routeActive));
  if (inTown) groundInTown();
  const held = inTown && !townGrounded; // no ground yet: she does not fall
  for (let i = 0; live && !held && i < f.steps; i++) {
    const wish = wishVector();
    if (wish[0] || wish[1]) moving = true;
    player.step(wish, PHYSICS_DT);
    physics.substeps += player.lastSubsteps;
    if (moveTarget) {
      // Give up on a click target we cannot reach (no pathfinding yet): pressed against a wall with no
      // progress. Braking and pivoting toward a target behind us also makes no progress, so a wall
      // contact is required (otherwise a reversal would cancel its own order).
      const d = Math.hypot(moveTarget[0] - player.pos[0], moveTarget[2] - player.pos[2]);
      if (clickStuck(stuck, player.lastHitWall, d)) { moveTarget = null; marker.visible = false; }
    }
  }
  physics.grounded = player.grounded;
  physics.colliders = player.world.liveCount;

  const p = player.renderPos(f.alpha);
  avatar.position.set(p[0], p[1], p[2]);
  avatar.visible = !inspecting; // keep the close-up clear of Iris
  // Facing is rate-limited by the controller itself (pivot when standing, a wide arc at a run) and
  // interpolated between physics steps like the position, so there is no second smoothing to lag behind it.
  avatar.rotation.y = player.renderHeading(f.alpha);
  // Lean into turns: roll about the forward axis by turn rate x speed, eased (about 8° in a full-speed arc).
  const leanTarget = THREE.MathUtils.clamp(-player.turnRate * player.speed * 0.009, -0.17, 0.17);
  lean = damp(lean, lookdev.reducedMotion ? 0 : leanTarget, 8, dt);
  avatar.rotation.z = lean;
  focus.set(p[0], p[1] + 1.1, p[2]);
  if (inTown && townFlow.focusK > 0) { // registering: the camera leaves Iris for the altar while its core flares
    const a = town.altar.focus, k = townFlow.focusK * townFlow.focusK * (3 - 2 * townFlow.focusK) * 0.7;
    focus.set(focus.x + (a[0] - focus.x) * k, focus.y + (a[1] - focus.y) * k, focus.z + (a[2] - focus.z) * k);
  }
  // Shell hover is visual only; reduced motion holds the Shells at their rest pose.
  world3d.update(lookdev.reducedMotion ? 0 : clock.elapsedTime);
  if (town && town.active) {
    townFrame.playerPos = player.pos; townFrame.reducedMotion = lookdev.reducedMotion; townFrame.lamps = lookdev.light.lamps; // lamps follow the hour and the weather (docs/atmosphere.md)
    townFrame.light.sun = lookdev.sun.color; townFrame.light.daylight = lookdev.weather.state.sun; townFrame.light.pixelsPerMetre = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
    town.update(clock.elapsedTime, dt, townFrame);
    if (fogCards) fogCards.update(clock.elapsedTime, camera, (lookdev.look.mistCards || 0) + lookdev.weather.state.rain * 0.3, scene.fog.color, { reducedMotion: lookdev.reducedMotion, enabled: lookdev.tier !== 'low' });
    if (townCasting) townCasting.update(dt, clock.elapsedTime, lookdev.reducedMotion, entered && !townFlow.busy && !(townShops && townShops.inside)); // no casts indoors
    lookdev.setHeroLight(town.altar.core || town.altar.focus, town.altar.glow / CORE_GLOW.awake); // the altar's amber is the strongest local light
    if (dayCycle && !lookdev.reducedMotion && !(townShops && townShops.inside)) tickDayCycle(dt);
    if (townShops) townShops.update(); // indoors: the baked light, the counter and door zones
    if (townProps) townProps.update(dt, lookdev.reducedMotion);
    if (townMonsters && !(townShops && townShops.inside)) townMonsters.update(dt, lookdev.reducedMotion);
    if (photo) photo.setAvailable(entered && !townFlow.busy && !introOn && !(townShops && townShops.busy));
    if (townBarks) townBarks.update(player.pos, !(photo && photo.on) && entered && !townFlow.busy && !townFlow.talking && !(townShops && townShops.inside) && !introOn);
    if (townAudio) { // footsteps from the distance actually walked; the listener follows the camera
      const d = Math.hypot(player.pos[0] - lastStepPos[0], player.pos[2] - lastStepPos[2]);
      if (d < 3) townAudio.step(d, !!player.run, !!(townShops && townShops.inside));
      lastStepPos[0] = player.pos[0]; lastStepPos[1] = player.pos[1]; lastStepPos[2] = player.pos[2];
      townAudio.setListener(camera, avatar.position);
    }
  }
  rig.update(dt, focus, lookdev.reducedMotion ? null : player.vel); // no camera look-ahead under reduced motion
  streamer.update(dt, focus);
  warmup.update();
  updateIrisStandIn();
  lookdev.update(dt, focus, rig.actualDist);
  // Animation drives from the actual ground speed (after collisions: pushing into a wall is standing
  // still), smoothed per frame rather than toggled per physics step: at high frame rates many frames run
  // no 30 Hz step, and toggling walk/idle on those frames restarted the walk clip every other frame.
  animSpeed = damp(animSpeed, player.speed, 14, dt);
  const speed = animSpeed;
  movingState = movingState ? speed > 0.08 : speed > 0.25;
  void moving;
  if (play && !inTown) play.update(dt, { focus, moving: movingState, speed, running: player.run && movingState });
  else if (irisAvatar) irisAvatar.update(dt, movingState, avatar, clock.elapsedTime, speed, player.run && movingState, lookdev.reducedMotion, null); // the town: her gait before the season
  if (townFlow && !townFlow.registered) { flowFrame.device = input.device === 'gamepad' ? 'gamepad' : 'keyboard'; townFlow.update(dt, flowFrame); }
  updateAltarTimer();

  controls.update(input.device, null, inspecting);
  const near = inspecting || !play || play.zone === 'shell' ? null : nearestInteractable();
  promptEl.innerHTML = inspecting
    ? `Inspecting <b>${inspecting.label}</b> · drag or arrows to orbit · wheel to zoom · <kbd>I</kbd>/<kbd>Esc</kbd> to leave`
    : near && near.inspect ? `<kbd>I</kbd> inspect <b>${near.label}</b> up close` : '';
  promptEl.hidden = !promptEl.innerHTML || !!inspecting;
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) toastEl.hidden = true;

  const drawn = sceneReady && (play || !(boot.lobbyOpen && boot.lobbyOpen())); // the lobby covers the canvas: no GPU work behind it
  if (drawn) lookdev.render();
  if (drawn && photo && photo.pending) photo.capture(); // the frame just drawn, before the buffer is cleared
  if (!firstFrameDone && (drawn || sceneReady)) { firstFrameDone = true; if (boot.onFirstFrame) boot.onFirstFrame(); }
  if (boot.onProgress && (progressTimer -= dt) <= 0) { progressTimer = 0.25; boot.onProgress(streamer.stats()); }
  hud.frame(dt);
  hud.update(dt, { info: renderer.info, physics, streaming: streamer.stats(), events: streamer.events, camera: rig, lookdev: lookdev.stats() });
  input.endFrame();
  requestAnimationFrame(frame);
}

// Expose a small debug handle for manual checks in the browser console and for measurements.
window.__ftf = {
  scene, world, streamer, warmup, player, rig, renderer, lookdev, setQuality: (t) => lookdev.setQuality(t), setReducedMotion: (on) => lookdev.setReducedMotion(on), perf, detectedTier,
  get vfx() { return play ? play.hooks.vfx : null; }, get audio() { return play ? play.hooks.audio : null; },
  // QA (art/anim/ingame.mjs): Iris's avatar and a cue for one of her one-shot clips (e.g. 'understand', 'greet').
  get iris() { return irisAvatar; }, irisReact: (clip) => { if (irisAvatar) irisAvatar.react(clip, clock.elapsedTime); },
  // The town on the ground (docs/town.md), null on the paths that skip it. register() is the code path of pressing E at
  // the altar (it resolves false when the prompt is not offered); walkRoute() steers Iris along the jury route (QA).
  town: town ? {
    scene: town, flow: townFlow, plan: townMode,
    get ready() { return town.ready && townGrounded; }, get active() { return inTown; }, get registered() { return townFlow.registered; },
    get promptVisible() { return townFlow.promptVisible; }, get phase() { return townFlow.phase; }, get walkMs() { return townFlow.walkMs; },
    register: () => townFlow.register(), walkRoute: () => townFlow.walkRoute(), status: () => town.status(),
    get casting() { return townCasting; }, // the field beyond the walls (QA: aimAt, release)
    get shops() { return townShops; }, // walk-in shops (QA: enter('exchange'), leave())
    get props() { return townProps; }, // trading board and wheel (QA: boardAt, wheelAt)
    get barks() { return townBarks; }, // townsfolk lines (QA: current)
    get photo() { return photo; }, // photo mode (QA: toggle, setFilter, requestCapture)
    get monsters() { return townMonsters; }, chests: chestBag, // monsters outside the walls and the chest bag (QA)
  } : null,
};
requestAnimationFrame(frame);
return { enterWorld, world3d, player, rig, lookdev, renderer, streamer, get play() { return play; }, town, townMode, 
  /** The first town view is complete: ground under Iris, every street piece real and warmed, her own model in (main.js gates the loading screen on it). */
  get townReady() { return !town || !inTown || (town.shown && townGrounded && (!irisLoad.hasModel || irisLoad.loaded || (irisLoad.failed && import.meta.env.DEV))); } };
}
