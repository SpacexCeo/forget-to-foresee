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
import { interruptLocomotion, canMove, STRIKE_ROOT } from './physics/interrupt.js';
import { createIslandScene } from './scenes/island.js';
import { LookDev } from './render/lookdev.js';
import { detectTier, tierForPreference } from './render/quality.js';
import { cycleLook, KEYS as CYCLE_KEYS, startPhase, weatherTimeline, WEATHER_FADE } from './render/daycycle.js';
import { lookFor, mixStats } from './render/sky.js';
import { CameraRig } from './render/camera-rig.js';
import { fixedSteps, rayCast, moveCapsule, MASK_PLAYER } from './physics/collision.js';
import { PHYSICS_DT, steerTo, clickStuck } from './physics/character.js';
import { damp } from './physics/motion.js';
import { Input } from './ui/input.js';
import { PAD } from './ui/gamepad.js';
import { navigateGamepadMenu } from './ui/gamepad-menu.js';
import { mountSceneControls } from './ui/scene-controls.js';
import { setBindings, loadBindings, bindings } from './ui/keybinds.js';
import { createMouseAim, aimPoint } from './ui/mouse-aim.js';
import { menuKeyAction, registerWindow, claimWindow } from './ui/window-toggle.js';
import { loadSettings, renderOverrides, lookFactors, frameDue } from './ui/settings-store.js';
import { loadVolumes, saveVolumes } from './audio/mix.js';
import './ui/styles.css';
import { DevHud } from './ui/dev-hud.js';
import { configureTextureSupport, setModelVariant, setModelOverrides, getModelVariant, hasModelFile, prefetchGltf } from './render/assets.js';
import { irisStandInVisible, liteFirstPolicy, JUDGE_PINS } from './render/streaming.js';
import { GpuWarmup, setActiveWarmup } from './render/warmup.js';
import { createPlayerHud } from './scenes/player-hud.js';
import { createPanelCollapse } from './scenes/panel-collapse.js';
import { createStamina, STAMINA } from './game/stamina.js';
import { installTouchCopy } from './ui/touch-copy.js';
import { createTouchControls } from './scenes/touch-sticks.js';
import { logKeysFromStats } from './ui/loading.js';
import { CAMPS, SPAWN, KILL_Y } from './scenes/layout.js';
import { ASSETS, heroById } from './render/asset-catalog.js';
import { townPlan } from './ui/loading.js';
import { createTownScene, CORE_GLOW } from './scenes/town.js';
import { createTownFlow } from './scenes/town-flow.js';
import { createTownQuest, questPlan, QUEST_KEY } from './scenes/town-quest.js';
import { createTownLedger } from './game/town-economy.js';
import { features as featureFlags } from './features.js';
import { mountSprint } from './sprint/index.js';
import { createDay1Mint, loadDay1 } from './play/day1-mint.js';
import { nextSkin } from './play/skins.js';
import { TALK_RADIUS } from './scenes/town-quest.js';
import { PROGRAMS, TOWNSFOLK } from './play/townsfolk-plan.js';
import { createTownCasting, CAST_KEYS } from './scenes/town-casting.js';
import { townToWorld, TOWN_SHOPS, shopDoorAt, TOWN_SPOTS, TOWN_ORIGIN as TOWN_ORIGIN_W, TOWN_SPAWN, TOWN_ALTAR, TOWN_ALTAR_SPAWN, TOWN_ALTAR_ASSET, TOWN_KILL_Y, TOWN_CAMERA, TOWN_ATMOSPHERE, TOWN_ROUTE } from './scenes/town-layout.js';
import { createFogCards } from './render/fog-cards.js';
import { createTownShops } from './scenes/town-shops.js';
import { createTownProps } from './scenes/town-props.js';
import { createSpotProps } from './scenes/town-spot-props.js';
import { createBarks } from './scenes/barks.js';
import { createPhotoMode } from './render/photo-mode.js';
import { createTownMonsters } from './scenes/town-monsters.js';
import { createChestBag } from './game/chests.js';
import { createCompanion } from './scenes/companion.js';
import { COMPANIONS_ENABLED, companionsToShow } from './scenes/companion-rules.js';
import { createDoorGlow } from './scenes/door-glow.js';
import { cue, cueAt, MOB_SOUNDS } from './audio/town-audio.js';
import { expectOnboarding, blocksWindows } from './ui/onboarding-queue.js';

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
// The heroine she starts as: `?hero=<id>`, else the Day 1 skin the player chose last time (K switches it).
const startHero = params.get('hero') ? heroById(params.get('hero')) : heroById(loadDay1(ctx.storage).skin === 'elise' ? 'elise' : 'iris');
const heroModel = hasModelFile(startHero.model) ? startHero.model : 'agent_iris';
const irisLoad = { hasModel: hasModelFile(heroModel), fetched: false, loaded: false, failed: false, t0: performance.now() };
// The same file play/iris-avatar.js irisModelFile() picks: the phone variant when the build ships it.
const irisFile = getModelVariant() && hasModelFile(heroModel + getModelVariant()) ? heroModel + getModelVariant() : heroModel;
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
installTouchCopy(ctx.i18n, () => !!input.touchControls); // on touch, no keyboard keys in any text (ui/touch-copy.js)
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
// In-game settings (ui/settings-popup.js, owner 12.11): Esc and the gear open a popup over the running town; the old
// controls dialog with its "Main menu" button stays only on the judge link (its behaviour is frozen).
setBindings(loadBindings(ctx.storage));
let gameSettings = params.get('demo') === 'judge' ? loadSettings(null) : loadSettings(ctx.storage), lookK = lookFactors(gameSettings), settingsPopup = null, lastRenderAt = 0;
const applyGameSettings = (st) => {
  gameSettings = st; lookK = lookFactors(st);
  if (typeof lookdev !== 'undefined' && lookdev) { lookdev.setOverrides(renderOverrides(st)); lookdev.setPixelScale(st.resScale); }
};
const openSettings = (tab) => {
  if (settingsPopup) { settingsPopup.open(tab); return; }
  import('./ui/settings-popup.js').then((m) => {
    settingsPopup ||= m.createSettingsPopup({ t: (k, a) => ctx.i18n.t(k, a), i18n: ctx.i18n, prefs: ctx.prefs, storage: ctx.storage, hooks: {
      onSettings: applyGameSettings,
      audio: () => (play && play.hooks && play.hooks.audio) || (townAudio && townAudio.audio) || null,
      volumes: () => loadVolumes(ctx.storage), saveVolume: (bus, v) => saveVolumes(ctx.storage, { ...loadVolumes(ctx.storage), [bus]: v }),
      touch: () => ({ available: !!(input.touchControls && touchSticks), mode: touchSticks ? touchSticks.mode : 'tap', setMode: (md) => touchSticks && touchSticks.setMode(md) }),
      day1: () => loadDay1(ctx.storage),
      clearData: () => { try { for (const k of Object.keys(localStorage)) if (k.startsWith('ftf')) localStorage.removeItem(k); } catch { /* blocked storage */ } location.reload(); },
      returnToTown: { visible: () => !!(town && play && !inTown), run: () => returnToTown() },
      endTournament: { visible: () => !!(play && !inTown), run: () => startOver() }, // the reload starts in town with a new season
      startOver: { visible: () => !!(play && inTown), run: () => startOver() },
      leaveToMenu: openMainMenu,
      onOpen: clearWorldInput, onClose: clearWorldInput,
    } });
    settingsPopup.open(tab);
  }).catch((e) => { console.warn('[settings]', e); controls.open(); });
};
const openMenu = () => (judge ? controls.open() : openSettings());
if (params.get('demo') !== 'judge' && (gameSettings.resScale < 1 || !gameSettings.shadows || !gameSettings.bloom || !gameSettings.weather)) applyGameSettings(gameSettings);
const controls = mountSceneControls(document.getElementById('scene-controls'), { onContext: handleInspect, onTransition: clearWorldInput, onMainMenu: openMainMenu, onOpenSettings: params.get('demo') === 'judge' ? null : () => openSettings(),
  extra: [
    { label: 'Return to town (your season is kept: register at the altar to go back)', visible: () => !!(town && play && !inTown), onClick: () => returnToTown() },
    { label: 'Touch: use tap to move instead of the joysticks', visible: () => !!(input.touchControls && touchSticks && touchSticks.mode === 'sticks'), onClick: () => touchSticks.setMode('tap') },
    { label: 'Touch: use the joysticks (left stick moves, skill buttons on the right)', visible: () => !!(input.touchControls && touchSticks && touchSticks.mode === 'tap'), onClick: () => touchSticks.setMode('sticks') },
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
// The ONE silk number (net/silk-balance.js, sprint 6.2): the HUD chip, the tracker, the portal and the windows read it.
// It reads ftf-town through the relayer, keeps the last good number when offline and records waiting silk on Sync.
import('./net/silk-balance.js').then((m) => { const model = m.createSilkModel({ ledger: townLedger, storage: ctx.storage, flush: () => (expeditionSync ? expeditionSync.flush() : null) }); m.installSilkModel(model); model.refresh(true); }).catch((e) => console.warn('[silk]', e));
// The player market (market/index.js; docs/market.md): loaded on the first 'ftf:market-open' {tab?}; the HUD's key and button send it.
{ let market = null; const openMarket = (e) => { if (market) return; window.removeEventListener('ftf:market-open', openMarket); import('./market/index.js').then((m) => { market = m.mount({ t: (k, a) => ctx.i18n.t(k, a), storage: ctx.storage, ledger: townLedger }); claimWindow('market'); market.open((e && e.detail && e.detail.tab) || 'buy'); }).catch((err) => console.warn('[market]', err)); }; window.addEventListener('ftf:market-open', openMarket); }
// The game menu (play/game-menu.js): Profile, Achievements, NFTs, Inventory + wheel, Agents, Log / Stats.
// One game menu at a time (owner 13.11: I, then I or C again, stacked a second layer): a hotkey or a tray button for the
// open tab closes the menu, for another tab switches to it (ui/window-toggle.js menuKeyAction); other windows close first.
let gameMenu = null, gameMenuLoading = null;
registerWindow('menu', { isOpen: () => !!gameMenu, close: () => gameMenu && gameMenu.close() });
const openProfileFor = (quest = null, tab = 'profile', toggle = false) => {
  const act = menuKeyAction({ open: !!gameMenu, tab: gameMenu && (gameMenu.tab === 'wheel' ? 'inventory' : gameMenu.tab) }, tab === 'wheel' ? 'inventory' : tab, toggle);
  if (act === 'close') { gameMenu.close(); return Promise.resolve(null); }
  if (act === 'switch' || act === 'stay') { if (gameMenu.tab !== tab) gameMenu.show(tab); return Promise.resolve(gameMenu); }
  if (gameMenuLoading) return gameMenuLoading; // a second key press while the menu's code loads
  claimWindow('menu');
  return (gameMenuLoading = openGameMenuNow(quest, tab).then((h) => { gameMenuLoading = null; return h; }));
};
const openGameMenuNow = (quest, tab) => import('./play/game-menu.js').then((m) => { const d1 = loadDay1(ctx.storage); const h = m.openGameMenu({ onClose: () => { if (gameMenu === h) gameMenu = null; }, t: (k, a) => ctx.i18n.t(k, a), ledger: townLedger, storage: ctx.storage, tab, chests: chestBag, heroineToken: (d1.guest || {}).token_id || null, owner: (d1.guest || {}).account_id || null, createGuest: () => day1Mint.mint(loadDay1(ctx.storage).nickname || undefined).then((r) => (r.phase === 'minted' && r.record.guest ? { account: r.record.guest.account_id } : { error: r.reason || 'failed' })), nickname: d1.nickname || null, eliseMinted: !!d1.minted, townLedger: featureFlags.on('townLedger'), account: featureFlags.on('accountLogin') ? { open: () => openAccount(), login: d1.login ? `${d1.login.kind.toUpperCase()} ${String(d1.login.address).slice(0, 10)}…` : null } : null, exportKey: d1.playerKey ? () => { const r = loadDay1(ctx.storage); return `account: ${(r.guest || {}).account_id || '(not created yet)'}\nsecret key: ${r.playerKey.secretKey}`; } : null }); gameMenu = h; return h; }).catch((e) => { console.warn('[menu]', e); return null; });
window.addEventListener('ftf:menu-open', (e) => { const d = (e && e.detail) || {}; openProfileFor(null, typeof d.tab === 'string' ? d.tab : 'profile', !!d.id); }); // {id}: a hotkey or a tray button (it toggles) // the HUD's Bag (I) via sprint/window-router.js
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
let demoPlayer = null, demoTried = false, demoShown = false, playerCard = null; // the demo player and the other-player card (Social track)
/** Tap or click another player (or the demo player) in town: their card. A tap is a short press that barely moved. */
function mountPlayerPicking() {
  const el = renderer.domElement; let down = null;
  // capture phase on window: the game's own input handlers on the canvas stop the event before a bubbling listener
  // the tap is timed by the events' own timestamps: a slow frame must not turn a tap into a long press
  window.addEventListener('pointerdown', (e) => { if (e.target === el) down = { x: e.clientX, y: e.clientY, t: e.timeStamp }; }, true);
  window.addEventListener('pointerup', (e) => {
    if (!down || e.timeStamp - down.t > 450 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { down = null; return; }
    down = null;
    const r = el.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    let rec = null;
    try { rec = (mp && mp.pick && mp.pick(ray)) || (demoPlayer && demoPlayer.pick(ray)); } catch (err) { console.warn('[player pick]', err); }
    if (!rec) return;
    import('./play/player-card.js').then((m) => {
      const d1 = loadDay1(ctx.storage);
      if (!playerCard) playerCard = m.createPlayerCard({ t: (k, a) => ctx.i18n.t(k, a), storage: ctx.storage, me: (d1.guest || {}).account_id || null, base: import.meta.env.BASE_URL, openMarket: () => window.dispatchEvent(new CustomEvent('ftf:market-open', { detail: { tab: 'buy' } })) });
      playerCard.open(rec);
    }).catch((err) => console.warn('[player card]', err));
  }, true);
}
let mp = null, mpTried = false, mpShown = false; // the shared town (play/multiplayer.js), loaded once Iris is in
// The play layer (room, engine, world HUD, hub, map) is its own chunk: not needed for the first frame.
const loadPlayLayer = () => Promise.all([import('./play/game.js'), import('./play/audio-settings.js'), import('./play/all-ages.js')]);

// ---- the town on the ground (docs/town.md): play starts here; the season starts at the Tournament altar ----
const townMode = townPlan({ skip: params.get('skip'), town: params.get('town'), play: params.get('play'), cinematic: params.get('cinematic'), view: params.get('view'), film: params.get('film') });
let salvageView = null; // story TZ Q2 (?story=1)
let fogCards = null, doorGlow = null, townShops = null, townProps = null, spotProps = null, townAudio = null, townBarks = null, photo = null, townMonsters = null;
let splashGround = false; // the rain splashes got the town's ground sampler
let marketTicker = null, marketScene = null; // the townsfolk market on NEAR testnet (docs/town-economy.md; ?town=1 until ftf-town is live)
const chestBag = createChestBag({ storage: ctx.storage });
// Dragon companions (docs/companion-nft-plan.md): only the dragons the heroine token's account holds on chain fly with
// her (net/companions.js); ?companion=<kind> shows one locally for QA, never labelled as owned.
const companions = [];
let companionKinds = '';
function setCompanions(all, { owned = false } = {}) {
  const kinds = owned ? all.slice(0, 1) : companionsToShow(all); // general companions are off (COMPANIONS_ENABLED); an owned Hatchkeeper pet flies
  const key = kinds.join(','); if (key === companionKinds) return; companionKinds = key;
  for (const c of companions.splice(0)) c.dispose();
  const perchAfter = Number(params.get('perch')) || undefined; // QA: ?perch=<seconds> lands the dragon sooner
  kinds.forEach((kind, slot) => companions.push(createCompanion({ scene, kind, slot, mobile: mobileDevice, perchAfter })));
}
function refreshCompanions() {
  if (!COMPANIONS_ENABLED) { // owner 13.11: only the Hatchkeeper's pet, owned by the heroine she plays, flies with her; no other claims
    const tokenId = (loadDay1(ctx.storage).guest || {}).token_id;
    if (!tokenId) { setCompanions([]); return; }
    Promise.all([import('./net/companions.js'), import('./net/pet.js')]).then(([cm, pm]) => cm.readCompanions({ tokenId }).then((r) => {
      const pet = r && r.state === 'loaded' ? pm.petsOf(r.dragons)[0] : null;
      setCompanions(pet ? [pet.kind] : [], { owned: true });
      window.__ftfPet = pet ? { kind: pet.kind, heroine: tokenId } : null; window.dispatchEvent(new CustomEvent('ftf:pet', { detail: window.__ftfPet })); // the companion slots unlock (ui/companion-slot.js)
    })).catch(() => {});
    return;
  }
  const qa = params.get('companion');
  if (qa && ['nacre', 'rill', 'cinder'].includes(qa)) { setCompanions([qa]); return; }
  const tokenId = (loadDay1(ctx.storage).guest || {}).token_id;
  if (!tokenId) return;
  import('./net/companions.js').then((m) => m.readCompanions({ tokenId })).then((r) => { if (r && r.state === 'loaded') setCompanions(r.dragons.map((d) => d.kind)); }).catch(() => {});
  claimDragon('welcome'); // every heroine gets one dragon (net/companion-claim.js); asked once, then remembered
}
// A dragon claim (relayer/api/companion/claim): one in flight per reason; a failed one is asked again after 30 s, up to
// 5 times a page (the boss log may still be on its way up); a minted dragon is shown only once the chain read
// confirms it (read again now and after finality).
const dragonClaims = {};
function claimDragon(reason, before = () => Promise.resolve()) {
  const c = (dragonClaims[reason] ||= { busy: false, tries: 0 });
  if (c.busy || c.tries >= 5) return;
  c.busy = true; c.tries++;
  const retry = () => setTimeout(() => { c.busy = false; claimDragon(reason, before); }, 30_000);
  import('./net/companion-claim.js').then(async (m) => {
    if (m.claimed(ctx.storage, reason)) return;
    await before();
    const r = await m.claimCompanion({ reason, storage: ctx.storage });
    if (r.ok) { refreshCompanions(); setTimeout(refreshCompanions, 4000); } else if (r.reason !== 'need_guest') retry(); else c.busy = false;
  }).catch(retry);
} // chests from the monsters outside the walls (game/chests.js)
const lastStepPos = [0, 0, 0];
/** The town's sound (audio/town-audio.js): made when the town starts and again after Return to town. */
function mountTownAudio() {
  if (townAudio) return;
  Promise.all([import('./audio/audio.js'), import('./audio/town-audio.js')]).then(([a, t]) => { if (!townAudio && inTown) townAudio = t.createTownAudio({ createAudio: a.createAudio }); }).catch((e) => console.warn('[town] audio', e));
}
let playerHud = null, touchSticks = null, panelCollapse = null;
const stamina = createStamina();
const _camFwd = new THREE.Vector3();
/** The town errand's next townsperson (innkeeper, then baker, then shrinekeeper) gets a gold "!" too (owner 13.11). */
const ERRAND_NPC = Object.freeze({ read: 'innkeeper', trade: 'baker', deliver: 'shrinekeeper' }); // scenes/town-quest.js QUEST_NPC
function errandMarkers() { const k = townFlow && townFlow.questActive ? ERRAND_NPC[townFlow.questStep] : null; return k ? [{ giver: k, sym: '!' }] : []; }
let hatchkeeper = null, hatchLoading = false;
/** The Hatchkeeper's pet (net/pet.js): its state for the panel, and the claim to the heroine the player picks. */
function hatchPet() {
  return {
    state: () => import('./net/pet.js').then(async (pm) => {
      const heroines = await pm.heroineOptions({ storage: ctx.storage });
      const pet = await pm.findPet({ storage: ctx.storage, heroines });
      const proof = pet ? { proven: true, seasonId: null } : await pm.tournamentProof({ storage: ctx.storage });
      return { state: pm.hatchState({ proven: proof.proven, pet }), heroines, seasonId: proof.seasonId, pet };
    }),
    claim: (heroineToken, seasonId) => import('./net/companion-claim.js').then((m) => m.claimCompanion({ reason: 'tournament', storage: ctx.storage, seasonId, heroineToken }))
      .then((r) => { if (r && r.ok) { refreshCompanions(); setTimeout(refreshCompanions, 4000); } return r; }),
  };
} // the Hatchkeeper by the lower-lane stalls (scenes/hatchkeeper.js, live, owner 13.11)
let townQuests = null, townPortal = null, townBoard = null, expeditionSync = null, questMarkers = null; // the Expedition (?story=1): scenes/town-quests.js, town-portal.js
let glassShoal = null, shoalLoading = false;
let shoalArt = null, shoalArtLoading = false; // the Shoal's look for the fight (render/shoal-arena-look.js), loaded when the arena first opens
let town = null, townFlow = null, townCasting = null, townMobs = null, inTown = false, townGrounded = false, irisAvatar = null, killXp = null, endgamePass = null, stallMounted = false, worksMounted = false, tournMounted = false;
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
  // everyone Iris can talk to now, nearest first (the talk picker when several stand close: scenes/talk-picker.js)
  const folkAround = (pos) => {
    const tf = town.townsfolk; if (!tf) return [];
    const out = [];
    for (const p of tf.people) { if (p.state !== 'loaded' || !p.root.visible) continue; const q = folkPos(p); if (Math.abs(q[1] - pos[1]) > 2.5) continue; const d = Math.hypot(q[0] - pos[0], q[2] - pos[2]); if (d < TALK_RADIUS) out.push({ key: p.def.key, d }); }
    return out.sort((a, b) => a.d - b.d);
  };
  const badge = (key, on) => { if (town.townsfolk) { town.townsfolk.setBadge(key, on); town.townsfolk.sendToTrade(key, on); } };
  for (const h of townLedger.hires()) badge(h.npc, true);
  // Town spots (owner, 11.11: the town is the menu): the three shop doors, the notice board after the stairs, and a
  // mirror by the gate for the optional look picker.
  const spotAt = (local, radius) => { const w = townToWorld(local); return (pos) => Math.hypot(pos[0] - w[0], pos[2] - w[2]) <= radius && Math.abs(pos[1] - w[1]) <= 2.5; };
  const spots = [
    ...TOWN_SHOPS.filter((s) => ['exchange', 'scribe', 'inn'].includes(s.id)).map((s) => ({ id: s.id, near: (pos) => { const d = shopDoorAt(pos); return !!d && d.id === s.id; } })),
    { id: 'board', near: spotAt(TOWN_SPOTS.board, 2.2) },
    // the mirror (look picker) is off for now (owner 12.11); its code and spot stay for later
    { id: 'wheel', near: (pos) => !!townProps && townProps.nearWheel(pos) }, // the wheel prop by the Inn (scenes/town-props.js)
  ];
  // The Expedition (?story=1 only, docs/plans/story): the citizens' quests, the objective line and the Gate-Loom by the
  // spawn; loaded lazily so the default (judge) page carries none of it. Its spots join this list (same array).
  if (params.get('story') !== '0' && !townQuests) {
    Promise.all([import('./scenes/town-quests.js'), import('./scenes/town-portal.js'), import('./game/inventory.js'), import('./scenes/town-board.js'), import('./net/tee-agent.js'), import('./net/town-gate.js'), import('./net/agent-ledger.js'), import('./scenes/quest-markers.js')]).then(([qm, pm, im, bm, tee, gm, al, mm]) => {
      if (townQuests || !inTown) return;
      townQuests = qm.createTownQuests({ hudToast: (s) => toast(s), storage: ctx.storage, townLedger, i18n: ctx.i18n, folkAt, inventory: im.createInventory({ storage: ctx.storage }), chests: chestBag,
        depart: (o) => (townFlow ? townFlow.depart(o) : Promise.resolve(false)), search: location.search,
        // the Gate-Loom on chain (rev 4): ftf-town gate_price / balance_of / gate_paid_of through the relayer, which credits the
        // guest's verified log and calls pay_gate_for on the guest's signed request (relayer/api/town/gate.js)
        // the journal's auto-walk drives the town's own route steering (W A S D clears it); markers are town-local
        walkDriver: { setRoute: (pts) => townFlow && townFlow.walkTo(pts), cancel: () => townFlow && townFlow.cancelRoute(), active: () => !!(townFlow && townFlow.routeActive), ended: () => townFlow && townFlow.routeEnd, pos: () => player.pos },
        toWorld: townToWorld, camera, scene, portalAt: [pm.PORTAL_TOWN[0], pm.PORTAL_TOWN[2]], level: () => townLedger.level,
        gate: { read: () => { const g = al.guestFrom(ctx.storage); return g ? gm.readGate({ account: g.accountId }) : Promise.resolve({ ok: false, reason: 'need_guest' }); }, pay: () => gm.payGate({ storage: ctx.storage, flush: () => (expeditionSync ? expeditionSync.flush() : null) }), sync: () => gm.syncGate({ storage: ctx.storage, flush: () => (expeditionSync ? expeditionSync.flush() : null) }) } });
      const w = townToWorld(pm.PORTAL_TOWN);
      townPortal = pm.createTownPortal({ scene, position: w, facing: Math.PI / 2, i18n: ctx.i18n, read: () => townQuests.portalFacts(), onPay: () => townQuests.payGate(), onSync: () => townQuests.syncGate(), reducedMotion: lookdev.reducedMotion, light: !(mobileDevice || lookdev.tier === 'low') });
      // the Shell monument (K2): the latest board snapshot and her own row from the local log
      const relayer = (() => { try { return tee.relayerUrl(); } catch { return null; } })();
      townBoard = bm.createTownBoard({ scene, position: townToWorld(bm.BOARD_TOWN), facing: Math.PI / 2, i18n: ctx.i18n, log: () => townQuests.ledger.log,
        load: () => bm.loadSnapshot({ base: import.meta.env.BASE_URL, relayer }) });
      spots.push(...townQuests.spots, townPortal.spot, townBoard.spot);
      questMarkers = mm.createQuestMarkers({ scene, markers: () => [...townQuests.markers(), ...errandMarkers()], folkAt, reducedMotion: lookdev.reducedMotion }); // gold ! and ? over the givers
      // the log goes up to the relayer for the endgame pass (Q4): signed by the Day 1 guest key; quiet without a guest or relayer
      import('./net/expedition-sync.js').then((m) => { if (townQuests && !expeditionSync) expeditionSync = m.createExpeditionSync({ ledger: townQuests.ledger, storage: ctx.storage }); }).catch((e) => console.warn('[story] sync', e));
      // the first boss down (a crownrift kill in the log): the log goes up first, then the second dragon is claimed
      import('./net/companion-claim.js').then((cm) => {
        const ledger = townQuests && townQuests.ledger; if (!ledger) return;
        const check = () => { if (COMPANIONS_ENABLED && cm.bossInLog(ledger.log) && !cm.claimed(ctx.storage, 'boss')) claimDragon('boss', () => (expeditionSync ? expeditionSync.flush() : Promise.resolve())); };
        ledger.subscribe(check); check();
      }).catch(() => {});
    }).catch((e) => console.warn('[story]', e));
  }
  townProps = createTownProps({ scene, town, ledger: townLedger, i18n: ctx.i18n, mobile: mobileDevice });
  // the mirror and the notice board: the two spots the town files do not model get an object (owner 12.11)
  if (!hatchLoading) { hatchLoading = true; import('./scenes/hatchkeeper.js').then((m) => { hatchkeeper = m.createHatchkeeper({ pet: hatchPet(), scene, t: (k, a) => ctx.i18n.t(k, a), groundAt: (x, z) => town.groundAt(x, z), mobile: mobileDevice, reduced: () => lookdev.reducedMotion }); spots.push(hatchkeeper.spot); }).catch((e) => console.warn('[hatchkeeper]', e)); }
  if (!spotProps) spotProps = createSpotProps({ scene, town, near: (id) => { const s = spots.find((x) => x.id === id); return !!(s && inTown && s.near(player.pos)); } });
  refreshCompanions();
  // The Glass Shoal (flag glassShoal, docs/plans/boss/glass-shoal-boss.md): the level-5 main quest, the dragon ride and
  // the boss arena; scenes/glass-shoal.js loads only with the flag, the arena only when the ride starts.
  const mountShoal = () => {
    if (glassShoal || shoalLoading || !featureFlags.on('glassShoal') || !town) return;
    shoalLoading = true;
    import('./scenes/glass-shoal.js').then((m) => {
      glassShoal = m.createGlassShoal({ THREE, scene, camera, rig, player, toWorld: townToWorld, groundAt: (x, z) => town.groundAt(x, z), folkAt, ledger: townLedger, chests: chestBag, storage: ctx.storage,
        locale: () => (ctx.i18n && ctx.i18n.locale) || 'en', toast: (s) => toast(s), reduced: () => lookdev.reducedMotion, mobile: mobileDevice, touch: () => !!input.touchControls,
        hero: () => (irisAvatar && irisAvatar.hero ? irisAvatar.hero.id : startHero.id), clip: (n) => { if (irisAvatar && irisAvatar.combat) irisAvatar.combat(n); }, axes: () => input.moveAxes() });
      const shoalJump = params.get('shoal'), gs = glassShoal;
      if (shoalJump === 'arena' || shoalJump === 'ride') { // only after the loading screen: the town must settle (and warm) around her first
        const go = () => (window.__ftfBootMarks && window.__ftfBootMarks.done ? gs.debugStep(shoalJump) : setTimeout(go, 150)); go();
      } else if (shoalJump) gs.debugStep(shoalJump); // dev preview: ?ff=glassShoal&shoal=reach_stone (a quest step), &shoal=ride (onto the dragon), &shoal=arena (straight into the fight)
      if (window.__ftf) window.__ftf.glassShoal = glassShoal;
    }).catch((e) => { shoalLoading = false; console.warn('[shoal]', e); });
  };
  mountShoal(); featureFlags.subscribe(mountShoal);
  if (!townMonsters) {
    // chests: the hillside packs' kills drop them (play/mobs.js 'ftf:mob-killed'); the moss critters roam only when the
    // packs are off (?mobs=0)
    townMonsters = createTownMonsters({ scene, town, player, bag: chestBag, mobile: mobileDevice, critters: () => params.get('mobs') === '0', onPickup: () => toast(ctx.i18n.t('chest.found')) });
    window.addEventListener('ftf:mob-killed', (e) => { if (townMonsters && inTown && e.detail) townMonsters.drop(e.detail.pos, e.detail.elite); });
    // ?story=1 (story TZ Q2): salvage drops, the spare part's source: a part, a toast and a brass spark on a kill
    if (params.get('story') !== '0' && !salvageView) import('./scenes/salvage-view.js').then((m) => { salvageView = m.createSalvageView({ scene, storage: ctx.storage, toast, t: (k) => ctx.i18n.t(k), reduced: () => lookdev.reducedMotion }); }).catch((e) => console.warn('[salvage]', e));
    // the profile button carries the number of sealed chests (a small gold badge), so a found chest is not forgotten
    const badgeChests = () => { const b = document.querySelector('.ftf-town-profile'); if (!b) return; const n = chestBag.sealed().length; if (n) b.dataset.chests = String(n); else delete b.dataset.chests; }; // generated content: read with the label
    chestBag.subscribe(badgeChests); badgeChests();
    // ?chestpreview=1|nft|item|silk: a labelled preview of the open-case moment with a fixture outcome (for filming);
    // it says "Preview — not on chain", links nothing and puts nothing in the bag
    const pv = params.get('chestpreview');
    if (pv) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ftf-town-prompt'; b.textContent = ctx.i18n.t('chest.previewButton');
      b.style.cssText = 'position:fixed;left:16px;bottom:16px;transform:none;z-index:20';
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', () => Promise.all([import('./play/chest-open.js'), import('./play/game-menu.js')]).then(([m, gm]) => {
        const FIX = { item: { kind: 'item', id: 'shard_violet_spire', amount: 1, rarity: 'rare' }, silk: { kind: 'silk', id: null, amount: 25, rarity: 'rare' } };
        const outcome = FIX[pv] || { kind: 'nft', id: 'shard_amber_crown', amount: 1, rarity: 'legendary' };
        const client = { available: true, open: () => new Promise((res) => setTimeout(() => res({ ok: true, opening: { index: 0, outcome, preview: true, verification: { verified: false } } }), 900)) };
        m.openChestReveal({ t: (k, a) => ctx.i18n.t(k, a), chest: { id: 'preview', tier: outcome.kind === 'nft' ? 'legendary' : 'rare', source: 'preview' }, client, guest: 'preview', items: gm.loadManifest() });
      }).catch((e) => console.warn('[chest] preview', e)));
      document.body.append(b);
    }
  }
  if (!photo) photo = createPhotoMode({ canvas: renderer.domElement, i18n: ctx.i18n, rig, coarse: mobileDevice, onChange: (on) => { if (on) { stopSteering(); clearWorldInput(); } } }); // feature 9: P
  if (!townBarks) { // feature 7: a short line from the townsfolk Iris walks past (scenes/barks.js)
    const people = [];
    townBarks = createBarks({ camera, i18n: ctx.i18n, extra: () => (featureFlags.on('newPlayerIntro') ? NPE_BARKS : []), hour: () => lookdev.look && lookdev.look.name, rain: () => lookdev.weather.state.rain || 0,
      hired: () => townLedger.hires().map((h) => h.npc),
      people: () => { people.length = 0; const tf = town.townsfolk; if (tf) for (const p of tf.people) if (p.state === 'loaded' && p.root.visible) people.push({ key: p.def.key, pos: folkPos(p) }); return people; } });
  }
  if (!marketTicker && params.get('town') !== '0') { // ftf-town is live (12.11); ?town=0 hides it // the townsfolk market: a ticker of real testnet trades, chips and stall visits
    Promise.all([import('./net/market.js'), import('./ui/market-ticker.js'), import('./play/market-scene.js')]).then(([net, ui, sc]) => {
      if (marketTicker) return;
      const t = (k, a) => ctx.i18n.t(k, a);
      marketScene = sc.createMarketScene({ camera, t, folk: () => town.townsfolk, folkPos, hired: () => townLedger.hires().map((h) => h.npc),
        isDay: () => !['night', 'twilight'].includes(lookdev.look && lookdev.look.name) });
      marketTicker = ui.createMarketTicker({ t, line: (r) => net.tradeLine(t, r), poll: () => net.fetchMarket(), onTrade: (r) => marketScene.onTrade(r),
        onLedger: () => (featureFlags.on('townLedger') ? () => window.dispatchEvent(new CustomEvent('ftf:menu-open', { detail: { tab: 'town' } })) : null) });
    }).catch((e) => console.warn('[town] market', e));
  }
  mountTownAudio();
  import('./audio/haptics.js').then((m) => m.createHaptics({ storage: ctx.storage, reduced: () => lookdev.reducedMotion })).catch(() => {}); // feature 6: the same cues as a short pulse
  const onExchange = () => import('./ui/exchange-terminal.js').then((m) => m.openExchangeTerminal({ i18n: ctx.i18n, storage: ctx.storage, ledger: townLedger, onTownWorks: () => window.dispatchEvent(new CustomEvent('ftf:town-works-open')) })).catch((e) => console.warn('[town] exchange', e));
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
    ledger: townLedger, folkNear, folkAt, folkAround, onHireChange: badge, onProfile: () => openProfileFor(quest), onDoor: (id) => { if (!townShops) return false; townShops.enter(id); return true; }, onWheel: () => openProfileFor(null, 'wheel'),
    quest, npcAt: (key) => (PROGRAMS[key] ? townToWorld(PROGRAMS[key].home) : null), signSvg: () => (signFn ? signFn(ctx.i18n) : null),
    town, player, rig, ctx, coarse: mobileDevice, reducedMotion: () => lookdev.reducedMotion, leave: leaveTown,
    islandProgress, islandLog: () => (inTown ? [] : logKeysFromStats(streamer.stats(), (a) => a.priority >= 100)),
    islandReady, // the cover stays until the archipelago's first view is loaded and warmed
    onRegister: () => { if (irisAvatar) irisAvatar.react('register', clock.elapsedTime); }, // she reaches for the ring
    // the Tournament warning (owner 12.11); never on the judge link, whose flow stays as it was
    confirmRegister: judge ? null : () => import('./ui/tourney-warn.js').then((m) => m.confirmTournament({ t: (k, a) => ctx.i18n.t(k, a), storage: ctx.storage })),
  });
  mountCasting();
  // The player HUD (ui/player-hud.js): portrait frame, level, health, the silk wallet and the toast stack, town only.
  if (!window.__ftfJudgePath && /[?&]judge=1(&|$)/.test(location.search)) window.__ftfJudgePath = import('./ui/judge-path.js').then((m) => import('./sprint/first-seen.js').then((f) => m.mountJudgePath({ t: (k, a) => ctx.i18n.t(k, a), touch: f.isTouch(document) }))).catch(() => null); // ?judge=1: the 90-second guided route (docs: README Judge path)
  if (!window.__ftfSprint) window.__ftfSprint = mountSprint({ THREE, scene, camera, renderer, player, ledger: townLedger, town, chests: chestBag, t: (k, a) => ctx.i18n.t(k, a), toast: (s) => toast(s), reduced: () => lookdev.reducedMotion, storage: ctx.storage, keys: input, flags: featureFlags, i18n: ctx.i18n, active: () => inTown, mobs: () => townMobs, base: import.meta.env.BASE_URL, floatNumber: numbersHook, stamina, openSettings: (tab) => openSettings(tab), skin: () => (irisAvatar ? irisAvatar.hero.id : startHero.id) }); // sprint seam (src/sprint, docs/sprint/CTX.md)
  if (!playerHud) playerHud = createPlayerHud({ t: (k, a) => ctx.i18n.t(k, a), ledger: townLedger, chests: chestBag, base: import.meta.env.BASE_URL,
    nickname: () => loadDay1(ctx.storage).nickname || null, skin: () => (irisAvatar ? irisAvatar.hero.id : startHero.id),
    onSkin: () => toggleSkin(), canSwap: () => { const o = skinsOwned(); return !!(o.elise || o.sheriffchenko); },
    onProfile: () => openProfileFor(quest), reducedMotion: () => lookdev.reducedMotion });
  // The endgame whitelist pass (story TZ §11; ui/endgame-pass.js), behind ?story=1. The story dispatches window
  // 'ftf:story-onward' after the twist; the relayer decides eligibility. ?passDemo=1 shows the labelled simulation (no hash, no call).
  // 'ftf:pass-open' reopens the modal (HUD / help entry points).
  if (params.get('story') !== '0' && !endgamePass) mountEndgamePass();
  // The monster-resource stalls (ui/stall-panel.js): a stall keeper's card dispatches 'ftf:stall-open' {npc}
  if (!stallMounted) { stallMounted = true; let panel = null; window.addEventListener('ftf:stall-open', (e) => {
    const npc = e && e.detail && e.detail.npc; if (!npc) return;
    Promise.all([import('./net/stall-client.js'), import('./ui/stall-panel.js'), import('./net/town-act.js')]).then(([c, u, w]) => {
      if (!panel) panel = u.createStallPanel({ t: (k, a) => ctx.i18n.t(k, a), client: c.createStallClient({ storage: ctx.storage }), town: w.createTownAct({ storage: ctx.storage, flush: () => (expeditionSync ? expeditionSync.flush() : null) }) });
      panel.open(npc);
    }).catch((err) => console.warn('[stall]', err));
  }); }
  // The town works on chain (ui/town-works-panel.js): the Exchange counter dispatches 'ftf:town-works-open'
  if (!worksMounted) { worksMounted = true; let panel = null; window.addEventListener('ftf:town-works-open', () => {
    import('./ui/town-works-panel.js').then((u) => { if (!panel) panel = u.createTownWorksPanel({ t: (k, a) => ctx.i18n.t(k, a), storage: ctx.storage, flush: () => (expeditionSync ? expeditionSync.flush() : null) }); panel.open(); }).catch((err) => console.warn('[works]', err));
  }); }
  // The on-chain tournament entry: tapping the altar label dispatches 'ftf:tournament-open'
  // (flag agentTournament: the Season Cup card first, with the Agent badge, Add an agent and the exhibition; play/season-cup.js)
  if (!tournMounted) { tournMounted = true; let panel = null, cupCard = null; const openEntry = () => import('./ui/town-works-panel.js').then((u) => { if (!panel) panel = u.createTournamentEntry({ t: (k, a) => ctx.i18n.t(k, a), storage: ctx.storage, flush: () => (expeditionSync ? expeditionSync.flush() : null) }); panel.open(); }).catch((err) => console.warn('[tournament]', err));
    window.addEventListener('ftf:tournament-open', () => {
      if (!featureFlags.on('agentTournament')) { openEntry(); return; }
      import('./play/season-cup.js').then((u) => { if (!cupCard) cupCard = u.createSeasonCup({ t: (k, a) => ctx.i18n.t(k, a), onEnterChain: openEntry }); cupCard.open(); }).catch((err) => { console.warn('[cup]', err); openEntry(); });
    }); }
  // XP for monsters felled beyond the walls (play/kill-xp.js): "+N XP" over the kill, the level-up burst, chime and toast
  if (!killXp) import('./play/kill-xp.js').then((m) => { if (!killXp) killXp = m.createKillXp({ THREE, scene, camera, player, ledger: townLedger, t: (k, a) => ctx.i18n.t(k, a), toast, reduced: () => lookdev.reducedMotion, active: () => inTown, floatNumber: numbersHook }); }).catch((e) => console.warn('[town] kill xp', e));
  // Twin-stick touch controls (scenes/touch-sticks.js): left stick, camera drag on the right, the skill arc
  if (!touchSticks) touchSticks = createTouchControls({ input, t: (k, a) => ctx.i18n.t(k, a), base: import.meta.env.BASE_URL, storage: ctx.storage, player,
    camForward: () => { const v = camera.getWorldDirection(_camFwd); return [v.x, v.z]; },
    casting: () => townCasting, mobs: () => townMobs, flow: () => townFlow, wish: wishVector, attack: (down) => attackPress(down) });
  // Walk-in shops (scenes/town-shops.js): the door fades into the streamed interior; the counter opens the door's panel.
  // the doors that lead inside glow warm gold (scenes/door-glow.js: exactly the shops' doors, the list the walk-in uses)
  if (!doorGlow) doorGlow = createDoorGlow({ scene, reducedMotion: () => lookdev.reducedMotion, daylight: () => lookdev.weather.state.sun * (1 - Math.min(1, (lookdev.look && lookdev.look.moonFill) || 0)) });
  townShops = createTownShops({ scene, streamer, player, rig, lookdev, i18n: ctx.i18n, mobile: mobileDevice, reducedMotion: () => lookdev.reducedMotion,
    onCounter: (id) => townFlow.openSpot(id), street: { world: () => town.world, killY: TOWN_KILL_Y } });
  fogCards = createFogCards(scene, TOWN_ROUTE); // ground fog along the street and stairs (night, early morning)
  // Iris wears her model and walks with her gait before the season exists; the same avatar goes on to the play
  // layer. Importing it also brings the play chunk in while the player crosses the town, so registering does not stall.
  // A failed attach (a dropped download) is tried again a few times; the loading screen covers the wait.
  const attachIris = (attempt = 0) => import('./play/iris-avatar.js').then((m) => { irisAvatar = irisAvatar || new m.IrisAvatar(startHero); return irisAvatar.attach(avatar); }).then(() => {
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
  townCasting = createTownCasting({ scene, camera, town, player, i18n: ctx.i18n, coarse: mobileDevice, storage: ctx.storage,
    // her cast clip (art/anim/iris_actions.py): a wind-up, then the release frame on which the cast leaves her hand; the
    // effect, the sound and the hits wait for that frame. Without the clip (?anim=v1) her hand goes up and it leaves at once.
    onCastStart: (id) => { interruptMove(0); cue(id === 'snare' ? 'cast_charge_storm' : 'cast_charge_frost'); /* the build through the wind-up */ const c = irisAvatar && irisAvatar.cast('cast_' + id); if (!c && irisAvatar) irisAvatar.react('greet', clock.elapsedTime); return c ? quickRelease(c) : 0; },
    onCast: (id, shot) => { for (const c of companions) c.flourish(lookdev.reducedMotion); if (townMonsters) townMonsters.cast(id, shot); cue(id === 'snare' ? 'cast_release_storm' : 'cast_release_frost'); }, // on the release frame
    handPos: () => { const m = irisAvatar && irisAvatar.irisModel, h = m && m.model.getObjectByName('hand_R'); if (!h) return null; const v = h.getWorldPosition(new THREE.Vector3()); return [v.x, v.y, v.z]; },
    onFire: (c) => { if (townMobs) townMobs.cast(c); },
    // UI-003 strike and dash slots for the hillside fight (play/mobs.js ACTIONS: F / 3, Space / 4)
    extra: [
      { id: 'strike', key: 'F', icon: 'strike', label: 'town.cast.strike', available: () => !!townMobs, press: () => strikeNow(), down: () => attackPress(true), up: () => attackPress(false), cooldown: () => (townMobs ? townMobs.actions.strikeCd / 0.32 : 0) },
      { id: 'dash', key: 'Space', icon: 'dash', label: 'town.cast.dash', available: () => !!townMobs, press: () => townMobs && townMobs.dash(wishVector()), cooldown: () => (townMobs ? townMobs.actions.dashCd / 1.0 : 0) },
    ] });
  mountMobs();
}
/**
 * Combat sound (owner, 12.11): Iris's swings and the heavy finisher, impacts where they land, each monster type's
 * attack and hurt sound from where it stands, the death dissolve, Iris getting hit. Through audio/town-audio.js.
 */
let heavyUntil = 0;
/** Touch: the HUD's attack button calls attackPress(true) on pointerdown and attackPress(false) on pointerup/cancel. */
let touchAttackHeld = false;
function attackPress(down) {
  if (!townMobs) return false;
  touchAttackHeld = !!down;
  const r = down ? townMobs.attackDown(strikeAimInput()) : townMobs.attackUp(strikeAimInput());
  interruptMove(STRIKE_ROOT); // a strike or a charge stops her run like a cast does
  return r;
}
function combatSound(k, mob, ev) {
  const at = mob && mob.pos ? mob.pos : null, S = MOB_SOUNDS[mob && mob.type] || MOB_SOUNDS.skitter;
  if (k === 'strike') cue('strike_swing');
  else if (k === 'strike3') { cue('strike_swing'); heavyUntil = performance.now() + 350; }
  else if (k === 'dash') cue('dash_whoosh');
  else if (k === 'super') { cue('strike_heavy'); heavyUntil = performance.now() + 350; }   // quiet: the sound layer adds its own on ftf:iris-action
  else if (k === 'hit') { cueAt(performance.now() < heavyUntil || (ev && ev.crit) ? 'strike_heavy' : 'strike_impact', at); cueAt(S.hurt, at, 0.8); }
  else if (k === 'attack') cueAt(S.attack, at);
  else if (k === 'kill') cueAt('mob_death', at);
  else if (k === 'hurt') cue('iris_hurt');
  else if (k === 'down') cue('iris_down');
}
/** The monsters on the hillside (play/mobs.js): packs beyond the walls that Iris's two casts fight. */
function mountMobs() {
  if (townMobs || !town || params.get('mobs') === '0') return;
  const T = town;
  Promise.all([import('./play/mobs.js'), import('./render/mob-fx.js'), import('three/addons/utils/SkeletonUtils.js')]).then(([m, fx, su]) => {
    if (townMobs || town !== T) return;
    const ground = (x, z, nearY) => { const hit = rayCast(T.world, [x, nearY + 6, z], [0, -1, 0], 20, MASK_PLAYER); return hit ? hit.point[1] : nearY; };
    // the hillside's own surface under a point (homes and spawns): the first walkable surface from high above (the
    // homes sit in clearings, so no tree crown answers first); art/mobs/probe_homes.mjs lists them
    const floor = (x, z) => { let y = TOWN_ORIGIN_W[1] + 120; for (let i = 0; i < 6; i++) { const h = rayCast(T.world, [x, y, z], [0, -1, 0], 400, MASK_PLAYER); if (!h) return null; if (h.normal[1] > 0.7) return h.point[1]; y = h.point[1] - 0.05; } return null; };
    const gate = [TOWN_ORIGIN_W[0], 0, TOWN_ORIGIN_W[2] + 42]; gate[1] = ground(gate[0], gate[2], TOWN_ORIGIN_W[1]) + 0.1;
    townMobs = m.createMobs({ THREE, scene, origin: TOWN_ORIGIN_W.slice(), player, load: (n) => prefetchGltf(hasModelFile(n) ? n : n.replace(/_m$/, '')), clone: su.clone,
      MobFx: fx.MobFx, glow: fx.MOB_GLOW, ground, floor, variant: getModelVariant() && hasModelFile('mob_skitter' + getModelVariant()) ? getModelVariant() : '',
      phone: mobileDevice || lookdev.tier === 'low', reduced: () => lookdev.reducedMotion, respawn: gate,
      immune: () => !!(glassShoal && glassShoal.owns && glassShoal.owns()), // no town-mob damage while she rides the dragon or fights at the Shoal
      camera, irisModel: () => (irisAvatar && irisAvatar.irisModel ? irisAvatar.irisModel.model : null), irisMove: (n) => { if (irisAvatar) irisAvatar.holdWhile = () => !!townMobs && townMobs.charging != null; if (!(irisAvatar && irisAvatar.combat(n))) return false; if (n === 'strike3' || n === 'strike_super') for (const d of companions) d.flourish(lookdev.reducedMotion); const c = irisAvatar.irisModel && irisAvatar.irisModel.combat; return c && c.name === n && c.impact != null ? c.impact : true; }, irisEnd: () => irisAvatar && irisAvatar.endAction(),
      moveIris: (d) => { const r = moveCapsule(T.world, player.pos, [d[0], -Math.hypot(d[0], d[1]) - 0.02, d[1]], { radius: player.radius, height: player.height, mask: MASK_PLAYER }); player.pos = r.pos; player.grounded = r.grounded; player.settled = null; },
      onFeedback: (k, mob, ev) => combatSound(k, mob, ev), floatNumber: numbersHook });
    // stamina (game/stamina.js): a dash costs a chunk and is refused when she is winded; strikes cost a little but are
    // never refused (the first fight stays fair)
    const rawDash = townMobs.dash.bind(townMobs), rawUp = townMobs.attackUp ? townMobs.attackUp.bind(townMobs) : null, rawStrike = townMobs.strike.bind(townMobs);
    townMobs.dash = (d) => { if (stamina.winded || stamina.value < STAMINA.dash) { stamina.spend(STAMINA.dash); return false; } const ok = rawDash(d); if (ok) stamina.spend(STAMINA.dash); return ok; };
    townMobs.strike = (a) => { const ok = rawStrike(a); if (ok) stamina.spend(Math.min(STAMINA.strike, stamina.value)); return ok; };
    if (rawUp) townMobs.attackUp = (a) => { const r = rawUp(a); if (r) stamina.spend(Math.min(STAMINA.strike, stamina.value)); return r; };
  }).catch((e) => console.warn('[mobs]', e));
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
  if (townQuests) townQuests.setActive(true);
  if (townPortal) townPortal.setActive(true);
  if (townBoard) townBoard.setActive(true);
  if (questMarkers) questMarkers.setActive(true);
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
  if (townMobs) { townMobs.dispose(); townMobs = null; }
  if (townBarks) townBarks.update(player.pos, false); // no bubble left over the archipelago
  if (marketTicker) marketTicker.show(false);
  if (marketScene) marketScene.update(player.pos, false);
  if (photo) { photo.toggle(false); photo.setAvailable(false); }
  if (townAudio) { townAudio.dispose(); townAudio = null; } // the archipelago's play layer has its own audio
  if (townQuests) townQuests.setActive(false); // ?story=1: the objective line and the Gate-Loom wait in the town
  if (townPortal) townPortal.setActive(false);
  if (townBoard) townBoard.setActive(false);
  if (questMarkers) questMarkers.setActive(false);
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
      onSettings: () => openMenu(),
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
// Sign in / create account (flag accountLogin, docs/account-login.md): panel, flow and wallets load on the first tap.
const openAccount = (nickname = null) => import('./play/account-panel.js').then((m) => m.openAccountPanel({
  t: (k, a) => ctx.i18n.t(k, a), nickname,
  makeLogin: () => Promise.all([import('./net/account-login.js'), import('./net/near-tx.js'), import('./net/day1-deployment.js'), import('./net/near-deployment.js')])
    .then(([a, n, d, nd]) => a.createAccountLogin({ relayer: d.DAY1_DEPLOYMENT.relayer, guests: d.DAY1_DEPLOYMENT.guests, mint: day1Mint, client: n.createTxClient({ rpcUrls: nd.NEAR_DEPLOYMENT.rpcUrls }), storage: ctx.storage })),
}).done).catch((e) => { console.warn('[account]', e); return { status: 'guest' }; });
const day1On = () => {
  const q = params.get('day1');
  if (q === '0') return false;
  if (q === '1') return true;
  return !judge && !loadDay1(ctx.storage).claimed;
};
if (day1On()) expectOnboarding('name');   // the Day-1 name comes first: the intro and the card wait for it (ui/onboarding-queue.js)
// The skin is the heroine herself: Elise wears her own model, clips and cel shading (play/iris-avatar.js setHero).
// The wheel's skin NFT is read from the chain for the guest account (play/skins.js), never assumed. A function
// declaration with its state on itself: the HUD asks canSwap() while this module is still being evaluated.
function skinsOwned() { const d = loadDay1(ctx.storage); return { elise: !!(d.minted || d.claimed || d.skin === 'elise'), sheriffchenko: skinsOwned.sheriff === true }; }
Promise.all([import('./play/skins.js'), import('./net/wheel-skin.js'), import('./net/agent-ledger.js')]).then(([sk, ws, al]) => sk.ownsWheelSkin({ storage: ctx.storage, skinOf: ws.skinOf, guestFrom: al.guestFrom })).then((yes) => {
  skinsOwned.sheriff = yes;
  if (yes && !params.get('hero') && loadDay1(ctx.storage).skin === 'sheriffchenko' && irisAvatar) irisAvatar.setHero(avatar, heroById('sheriffchenko')).catch(() => {}); // the skin worn last time, once the chain confirms it
}).catch(() => {});
function toggleSkin() {
  const next = nextSkin(irisAvatar ? irisAvatar.hero.id : startHero.id, skinsOwned());
  day1Mint.setRecord({ skin: next });
  if (irisAvatar) irisAvatar.setHero(avatar, heroById(next)).catch((e) => console.warn('[skin]', e));
  toast(ctx.i18n.t('day1.skin.' + next));
}
/** Above the altar: when the next Tournament round starts ("Open now" in this build: rounds are always open). */
let altarTimer = null;
/** The new-player intro's crowd lines (play/locales/en-npe.js, sprint 7.3), in the barks rotation when the intro is on. */
const NPE_BARKS = Object.freeze(Array.from({ length: 10 }, (_, i) => `npe.bark.${i + 1}`));
const _altarP = new THREE.Vector3();
function updateAltarTimer() {
  if (!town || !inTown) { if (altarTimer) altarTimer.hidden = true; return; }
  if (!altarTimer) {
    altarTimer = document.createElement('button'); altarTimer.type = 'button'; altarTimer.className = 'ftf-altar-timer'; altarTimer.setAttribute('aria-label', ctx.i18n.t('tourn.title'));
    altarTimer.addEventListener('click', (e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('ftf:tournament-open')); }); // the on-chain entry (ui/town-works-panel.js)
    altarTimer.style.cssText = 'position:fixed;left:0;top:0;z-index:6;pointer-events:auto;cursor:pointer;transform:translate(-50%,-100%);padding:6px 12px;border-radius:14px;background:rgba(20,14,40,.78);border:1px solid rgba(255,210,122,.7);color:#fff7e6;font:600 13px/1.25 system-ui,sans-serif;text-align:center;white-space:nowrap';
    document.body.append(altarTimer);
  }
  const a = TOWN_ALTAR.position;
  _altarP.set(a[0], a[1] + 4.2, a[2]).project(camera);
  // outside the walls the label would show through the gate wall: hidden there (the street and stairs see the altar)
  const altarOccluded = !!(townMobs && townMobs.iris && townMobs.iris.outside);
  const visible = !altarOccluded && _altarP.z < 1 && Math.abs(_altarP.x) < 1.1 && Math.abs(_altarP.y) < 1.1 && !document.querySelector('.d1-panel, .d1-card'); // Day 1's panels own the screen
  altarTimer.hidden = !visible;
  if (!visible) return;
  // declutter: with the player HUD on, an altar icon (CSS) and the short state; the full line is the tooltip
  const full = ctx.i18n.t('day1.altar.timer') + ' · ' + ctx.i18n.t('day1.altar.open');
  const text = playerHud ? ctx.i18n.t('day1.altar.short') : full;   // says what is open (design review 13.11: a bare "Open now" told nothing)
  if (altarTimer.textContent !== text) { altarTimer.textContent = text; altarTimer.title = full; }
  // kept below the top-right chips (Controls, Profile) and inside the screen: on a phone the altar projects right under them
  const minTop = innerWidth < 700 || innerHeight < 500 ? (document.body.classList.contains('ph-on') ? 236 : 150) : 118, half = Math.min(altarTimer.offsetWidth / 2 || 110, innerWidth / 2 - 8);
  altarTimer.style.left = Math.max(half + 8, Math.min(innerWidth - half - 8, (_altarP.x + 1) / 2 * innerWidth)).toFixed(0) + 'px';
  altarTimer.style.top = Math.max(minTop, (1 - _altarP.y) / 2 * innerHeight).toFixed(0) + 'px';
}

/**
 * The intro fly-through (feature 5): on the first visit the camera sweeps down from high above the town, circling a
 * third of the way round, and settles behind Iris. Any key or tap, or Skip, ends it; ?skip=intro, the jury path and
 * reduced motion never show it. Remembered in this browser. Resolves when it is over.
 */
const INTRO_KEY = 'ftf.intro.v1';
/** A Day-1 panel (welcome, name, cards, claim) is on screen: the street's talk prompts and barks wait. */
const day1Open = () => !!document.querySelector('.d1-panel, .d1-card');
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
  if (!day1On()) return;
  // never over the loading screen: when the intro flight is skipped this runs before the cover lifts (phone pass, 12.11)
  for (let i = 0; i < 1200 && !(window.__ftfBootMarks && window.__ftfBootMarks.done); i++) await new Promise((r) => setTimeout(r, 150));
  const t = (k, a) => ctx.i18n.t(k, a);
  const [m, q] = await Promise.all([import('./play/day1.js'), import('./ui/onboarding-queue.js')]);   // one onboarding queue: name -> intro -> guide
  await q.runOnboarding('name', () => m.runArrival({ t, mint: day1Mint, flyIn, reduced: () => lookdev.reducedMotion, inventoryEl: () => document.querySelector('.ftf-town-profile'), nickname: loadDay1(ctx.storage).nickname || '', signIn: featureFlags.on('accountLogin') ? (nick) => openAccount(nick) : null }));
  refreshCompanions(); // a fresh heroine may already hold a dragon
  const orbit = (base) => (p) => { rig.dist = TOWN_CAMERA.dist + 9 * Math.sin(Math.PI * p); rig.rotate(base); };
  // No Day-1 tips on phones at all (owner 13.11, asked many times): the tracker and the quest log carry the same lines there.
  if (!input.touchControls) await q.runOnboarding('guide', () => m.runHints({ t, steps: [
    ...(input.touchControls ? [] : [{ key: 'day1.hint.skin' }]), // not on phones (owner 12.11: the tip took the screen there)
    { key: 'day1.hint.quest', when: () => !!(townFlow && townFlow.questActive) },
    { key: 'day1.hint.trailers', when: () => !input.touchControls, buttons: [ // not on phones (owner 12.11)
     { key: 'day1.hint.watch', fn: async () => {
      await m.playTrailer({ t, keys: ['day1.trailer.hero.1', 'day1.trailer.hero.2', 'day1.trailer.hero.3'], camera: orbit(0.004) });
      await m.playTrailer({ t, keys: ['day1.trailer.town.1', 'day1.trailer.town.2', 'day1.trailer.town.3'], camera: orbit(-0.004) });
      rig.dist = TOWN_CAMERA.dist;
    } }] },
    { key: 'day1.hint.tournament' },
  ] }));
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

// the drawing follows the canvas's box (#app: the dynamic viewport), on every way a phone can change it
const fitView = () => { const [w, h] = lookdev.viewSize(); lookdev.setSize(w, h); };
window.addEventListener('resize', fitView);
window.addEventListener('orientationchange', () => setTimeout(fitView, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitView);
if (typeof ResizeObserver === 'function' && renderer.domElement.parentElement) new ResizeObserver(fitView).observe(renderer.domElement.parentElement);
fitView();

let toastTimer = 0;
// Floating numbers (flag damageNumbers; ui/float-numbers.js): damage and crits from the mobs, XP from kills, silk gained
// and spent from the town ledger. Off: the old per-module numbers stay exactly as they were.
let floatNumbers = null, floatLoading = false, lastSilk = null;
function numbersHook(ev) {
  if (!featureFlags.on('damageNumbers')) return false;
  if (floatNumbers) { floatNumbers.push(ev); return true; }
  if (!floatLoading) { floatLoading = true; import('./ui/float-numbers.js').then((m) => { floatNumbers = m.createFloatNumbers({ camera, THREE, reduced: () => lookdev.reducedMotion, xpUnit: () => 'XP' }); }).catch(() => { floatLoading = false; }); }
  return false; // the first number of a session shows the old way while the layer loads
}
townLedger.subscribe(() => {
  const s = townLedger.silk; const prev = lastSilk; lastSilk = s;
  if (prev == null || s === prev || !inTown || !featureFlags.on('damageNumbers')) return;
  const p = player.pos; numbersHook({ kind: s > prev ? 'silk_gain' : 'silk_spend', amount: Math.abs(s - prev) / 100, pos: [p[0], p[1] + 2.0, p[2]] });
});

function mountEndgamePass() {
  endgamePass = 'loading';
  Promise.all([import('./net/pass-deployment.js'), import('./net/pass-client.js'), import('./ui/endgame-pass.js'), import('./audio/town-audio.js')]).then(([d, c, u, a]) => {
    const demo = params.get('passDemo') === '1';
    const client = c.createPassClient({ storage: ctx.storage });
    endgamePass = u.createEndgamePass({ t: (k, x) => ctx.i18n.t(k, x), client, deployment: d.PASS_DEPLOYMENT, storage: ctx.storage, demo,
      reducedMotion: () => lookdev.reducedMotion, sound: () => a.cueAt('vision_whoosh', null, 0.5) });
    if (!endgamePass) return;   // network: null — dormant, nothing exists
    window.__ftf.pass = endgamePass;
    window.addEventListener('ftf:pass-open', () => endgamePass.open());
    const onPeak = async () => {
      if (endgamePass.isOpen || (!demo && endgamePass.shown)) return;    // once per account (the demo replays); reopened from the HUD
      if (demo) { endgamePass.cut(); return; }
      const e = await client.eligibility();                            // the relayer replays the log; the client never decides
      if (e && e.eligible) endgamePass.cut();
    };
    // the story module fires 'ftf:story-onward' once after the twist (the Loom does not open toward home)
    window.addEventListener('ftf:story-onward', onPeak);
    if (demo) setTimeout(() => window.dispatchEvent(new CustomEvent('ftf:story-onward', { detail: { demo: true } })), 4000);
  }).catch((e) => { endgamePass = null; console.warn('[pass]', e); });
}

function toast(text) { if (playerHud && inTown) { playerHud.toast(text); return; } toastEl.textContent = text; toastEl.hidden = false; toastTimer = 3; }

// moveRun: phones have no Shift, so a tap far away (or a double tap) runs there
const PHYSICS_CARRY = 1.0; // seconds of a long frame that physics catches up on (fixedSteps carry)
const stuck = { stuckTime: 0, lastDist: Infinity }; // click-to-move give-up state (character.js clickStuck)
let moveTarget = null, moveRun = false, lastTap = { t: 0, x: 0, y: 0 };
let rootUntil = 0; // a strike roots her until then (ms); the casts root her through town-casting's `casting`
/** A cast or a strike interrupts locomotion: walk orders cancelled, she plants, rooted for `seconds` (physics/interrupt.js). */
function interruptMove(seconds = 0) {
  const s = interruptLocomotion({ moveTarget, moveRun, rootUntil }, { now: performance.now(), seconds, cancel: stopSteering, character: player });
  moveTarget = s.moveTarget; moveRun = s.moveRun; rootUntil = s.rootUntil;
  if (input.stopRun) input.stopRun(); // the touch run toggle and burst switch off: after the action she moves only on new input
}
/**
 * A cast answers at once (owner 12.11: "skills must fire without lag"): the clip is started CAST_WINDUP s before its
 * release frame (its slow wind-up is skipped, blended in over the fade), so the effect and the hits come no later
 * than CAST_WINDUP after the click instead of the clip's ~0.4 s. Returns the seconds to the release.
 */
const CAST_WINDUP = 0.1;
function quickRelease(c) {
  const k = irisAvatar && irisAvatar.irisModel && irisAvatar.irisModel.combat;
  const skip = Math.max(0, (c.release || 0) - CAST_WINDUP);
  if (k && skip > 0) { k.action.time = skip; k.t = skip; }
  return Math.min(c.release || 0, CAST_WINDUP);
}
/** The strike (F / 3 / its slot): it stops her run like a cast does. */
// The strike's aim (play/mobs.js strikeAim): on a desktop the mouse cursor's point on the ground under her, even when
// she stands still; the movement keys / stick otherwise. The soft-locked creature still wins inside mobs.js.
const mouseAt = { x: 0, y: 0, ok: false };
if (!coarse) addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { mouseAt.x = e.clientX; mouseAt.y = e.clientY; mouseAt.ok = true; } }, { passive: true });
const _aimRay = new THREE.Raycaster(), _aimNdc = new THREE.Vector2(), _aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _aimHit = new THREE.Vector3();
function cursorGround() {
  if (mouseAim.locked) return aimPoint(player.pos, rig.yaw); // mouse aim: the crosshair looks along the camera
  if (coarse || !mouseAt.ok) return null;
  const r = renderer.domElement.getBoundingClientRect();
  _aimNdc.set(((mouseAt.x - r.left) / r.width) * 2 - 1, -((mouseAt.y - r.top) / r.height) * 2 + 1);
  _aimRay.setFromCamera(_aimNdc, camera); _aimPlane.constant = -player.pos[1];
  return _aimRay.ray.intersectPlane(_aimPlane, _aimHit) ? [_aimHit.x, _aimHit.y, _aimHit.z] : null;
}
const strikeAimInput = () => ({ cursor: cursorGround(), move: wishVector() });
/**
 * Mouse aim (ui/mouse-aim.js; owner 13.11): a mouse button is the key of its action (the strike, the prompt's E, Lance),
 * sent as that key so the whole input map answers as it does for the keyboard (the HUD's mana gate, the Shoal's own keys,
 * rebinding). An armed cast leaves on the left button at the crosshair.
 */
function mouseKey(action, down) {
  if (down && action === 'strike' && inTown && townCasting && townCasting.releaseArmed()) return;
  const code = bindings()[action];
  if (code) renderer.domElement.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
}
const mouseAim = createMouseAim({ target: renderer.domElement, input,
  mode: () => (judge ? 'classic' : gameSettings.mouseMode), touch: () => mobileDevice || !!input.touchControls, // the jury path keeps click-to-walk (README)
  // the town, the hillside and the Shoal; the archipelago's play layer keeps the classic mouse (its clicks are walk orders)
  active: () => entered && (inTown || !!(glassShoal && glassShoal.owns())) && !(townFlow && townFlow.busy) && !(photo && photo.on),
  prompt: () => !!document.querySelector('.ftf-town-prompt:not([hidden]), .gs-prompt:not([hidden])'),
  onAction: mouseKey,
  // the browser took Esc to free the pointer: the page gets the Esc it never saw (the cast is put away, a panel closes, else the menu)
  onEscape: () => { for (const type of ['keydown', 'keyup']) document.body.dispatchEvent(new KeyboardEvent(type, { code: 'Escape', key: 'Escape', bubbles: true })); } });
function strikeNow() { if (townMobs && townMobs.strike(strikeAimInput())) interruptMove(STRIKE_ROOT); }
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
  if (rot || input.dragX) rig.rotate(rot * lookDt * 1.8 - input.dragX * lookK.x); // sensitivity and invert Y: the settings popup
  if (tilt || input.dragY) rig.tilt(tilt * lookDt * 1.35 + input.dragY * lookK.y);
  if (input.wheel) rig.zoom(Math.pow(1.12, input.wheel));
  if (input.down('Equal', 'NumpadAdd') || pad.down(PAD.zoomIn)) rig.zoom(Math.pow(0.5, lookDt));
  if (input.down('Minus', 'NumpadSubtract') || pad.down(PAD.zoomOut)) rig.zoom(Math.pow(2, lookDt));
}
function handleInput(dt) {
  input.poll();
  const { pad } = input;
  if (input.hit('F3')) hud.toggle();
  if (glassShoal && glassShoal.owns()) { // the dragon ride or the boss fight: its own keys, the camera still turns
    if ((input.hit('Escape') || pad.hit(PAD.menu)) && !document.querySelector('dialog[open]')) { openMenu(); return false; }
    glassShoal.input(input); cameraInput(dt, pad); return false;
  }
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
  if (pad.hit(PAD.menu)) { openMenu(); return false; }
  if (input.hit('Escape') || pad.hit(PAD.cancel)) {
    if (townOn && townCasting && townCasting.handleKey('Escape')) return false; // put the armed cast away
    if (townOn && townFlow && townFlow.closePanel()) return false; // close the open talk panel
    if (inspecting) leaveInspect();
    else if (playOn && play.handleKey('Escape')) clearWorldInput();
    else if (moveTarget || (playOn && play.routeActive) || (townOn && townFlow.routeActive)) stopSteering();
    else if (!blocksWindows()) openMenu();   // no menu on top of a first-time overlay (its own Esc / Skip handles it)
    return false;
  }
  if (townShops && townShops.busy) return false; // the shop door's fade holds Iris
  if (!playOn && townFlow) { if (input.hit('KeyE') || pad.hit(PAD.interact)) { if (glassShoal && townOn && glassShoal.interact()) { /* the Shoal's prompt took it */ } else if (!(townShops && townShops.inside && townShops.interact())) townFlow.interact(); } } // E at the Tournament altar, a shop door or counter
  if (townOn && townFlow && input.hit('KeyO')) townFlow.expandPill(); // O: the newest minimised panel
  if (townOn && townCasting) { // beyond the walls: Q/1 and V/2 arm the casts (scenes/town-casting.js)
    for (const k in CAST_KEYS) if (input.hit(k)) townCasting.handleKey(k);
    if (townMobs && townCasting.field) { // the strike and the dash (play/mobs.js ACTIONS): F / 3 and Space / 4
      // F / 3: a tap strikes (the combo), held ≥ 0.4 s and let go it is the super strike (play/mobs.js attackDown/Up);
      // the stick / keys give the aim, else she strikes where she looks, and a creature within 3 m draws the blow
      if (input.hit('KeyF') || input.hit('Digit3')) { townMobs.attackDown(strikeAimInput()); interruptMove(STRIKE_ROOT); }
      else if (townMobs.charging != null && !input.down('KeyF', 'Digit3') && !touchAttackHeld) { townMobs.attackUp(strikeAimInput()); interruptMove(STRIKE_ROOT); }
      if (input.hit('Space') || input.hit('Digit4')) townMobs.dash(wishVector());
    }
    townCasting.setPointer(input.hover ? input.hover.x : null, input.hover ? input.hover.y : null);
    townCasting.setAimPoint(mouseAim.locked ? aimPoint(player.pos, rig.yaw) : null);
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
  if (input.hit('KeyR') || pad.hit(PAD.reset)) { if (!(townShops && townShops.resetCamera())) rig.reset(); } // indoors: the room's camera
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
  if (!canMove({ rootUntil }, performance.now(), !!(townCasting && townCasting.casting))) return [0, 0]; // rooted: a cast's wind-up and release, a strike
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
const companionHero = { position: new THREE.Vector3(), heading: 0, speed: 0 }; // reused per frame
const townFrame = { playerPos: player.pos, reducedMotion: false, lamps: 1, camera, light: { sun: null, daylight: 1, pixelsPerMetre: 900 } }, flowFrame = { device: 'keyboard' }; // reused: no per-frame objects

let movingState = false, animSpeed = 0, lean = 0, firstFrameDone = false, progressTimer = 0;
// The town's day cycle (render/daycycle.js, owner 11.11): early morning → evening → night with mist and moon → early
// morning, continuous every frame (the sky statistics of the five hours are read once, outside the frame loop, then
// blended). Off on the jury path and when the URL fixes the hour or the weather; held under reduced motion.
// A session starts where the player's clock falls on the loop (?cycle=<s> pins it for QA) and gets its own weather
// timeline (?wseed=<n> pins that).
const dayCycle = !judge && !params.has('tod') && !params.has('weather') && params.get('cycle') !== 'off'
  ? (() => { const t = params.has('cycle') ? Number(params.get('cycle')) || 0 : startPhase(); return { t, t0: t, weather: null, ready: false, timeline: weatherTimeline(params.has('wseed') ? Number(params.get('wseed')) | 0 : (Math.random() * 2 ** 31) | 0) }; })() : null;
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
  const c = cycleLook(dayCycle.t, (h) => lookFor('town', h), dayCycle.timeline, dayCycle.t0);
  const S = lookdev.cycleStats;
  lookdev.applyLookLive(c.look, mixStats(S[c.a], S[c.b], c.k), clock.elapsedTime);
  if (c.weather !== dayCycle.weather) { lookdev.setWeather(c.weather, { seconds: dayCycle.weather == null ? 0.01 : WEATHER_FADE }); dayCycle.weather = c.weather; }
}

function frame() {
  // FPS cap (settings popup): skip this display frame; the next one's delta carries the time
  if (gameSettings.fpsCap) { const nowMs = performance.now(); if (!frameDue(gameSettings.fpsCap, nowMs - lastRenderAt)) { requestAnimationFrame(frame); return; } lastRenderAt = nowMs; }
  const rawDt = clock.getDelta();
  const dt = Math.min(Math.max(rawDt, 0), 0.25); // render, camera and animation delta (never negative: a clock that steps back, e.g. a test clock, would poison the damping)
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
  player.run = input.down('ShiftLeft', 'ShiftRight') || (moveTarget ? moveRun : coarse && !!(play && play.routeActive)) || !!(inTown && townFlow && townFlow.routeActive); // A1 auto-walk runs
  // outside the walls, a winded Iris walks until 20 % stamina is back (game/stamina.js)
  const fieldOn = !!(inTown && townMobs && townMobs.iris && townMobs.iris.outside);
  if (fieldOn && !stamina.canRun()) player.run = false;
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
  if (glassShoal && inTown) glassShoal.update(dt, clock.elapsedTime);
  const shoalArena = !!(glassShoal && glassShoal.mode === 'arena' && glassShoal.arena); // the fight: the Shoal look draws instead of lookdev
  if (shoalArena && !shoalArt && !shoalArtLoading) {
    shoalArtLoading = true;
    import('./render/shoal-arena-look.js').then((m) => {
      shoalArt = m.createArenaLook({ renderer, scene, camera, lookdev, arena: glassShoal.arena, tier: lookdev.tier, profile: mobileDevice ? 'phone' : 'desktop', reduced: () => lookdev.reducedMotion, search: location.search });
      if (window.__ftf) window.__ftf.shoalArt = shoalArt;
    }).catch((e) => { shoalArtLoading = false; console.warn('[shoal look]', e); });
  }
  if (shoalArt) shoalArt.sync(shoalArena);
  const shoalSpeed = glassShoal && glassShoal.owns() ? glassShoal.applyAvatar(avatar, focus) : null; // on the dragon or on the Shoal
  if (inTown && townFlow.focusK > 0) { // registering: the camera leaves Iris for the altar while its core flares
    const a = town.altar.focus, k = townFlow.focusK * townFlow.focusK * (3 - 2 * townFlow.focusK) * 0.7;
    focus.set(focus.x + (a[0] - focus.x) * k, focus.y + (a[1] - focus.y) * k, focus.z + (a[2] - focus.z) * k);
  }
  // Shell hover is visual only; reduced motion holds the Shells at their rest pose.
  world3d.update(lookdev.reducedMotion ? 0 : clock.elapsedTime);
  // the shared town (docs/multiplayer.md): others' avatars and the chat; never on the judge link, ?mp=0 turns it off
  const mpOn = !!(town && town.active && entered);
  // the demo player (play/demo-player.js) and the player card (play/player-card.js): loaded lazily once Iris is in town
  if (mpOn && !demoTried && !judge && params.get('demo') !== '0') {
    demoTried = true;
    import('./play/demo-player.js').then((m) => { demoPlayer = m.createDemoPlayer({ scene, t: (k, a) => ctx.i18n.t(k, a), origin: TOWN_ORIGIN_W, groundAt: (x, z, y) => (town && town.groundAt ? town.groundAt(x, z, y) : null), phone: mobileDevice }); if (window.__ftf) window.__ftf.demoPlayer = demoPlayer; }).catch((e) => console.warn('[demo player]', e));
    mountPlayerPicking();
  }
  if (demoPlayer) {
    if (mpOn) {
      const others = [player.pos]; const tf = town && town.townsfolk;
      if (tf) for (const p of tf.people) if (p.state === 'loaded' && p.root.visible) others.push([p.plan.x + TOWN_ORIGIN_W[0], p.plan.y + TOWN_ORIGIN_W[1], p.plan.z + TOWN_ORIGIN_W[2]]);
      if (mp && mp.presence) for (const r of mp.presence.positions()) if (r.p) others.push([r.p[0] + TOWN_ORIGIN_W[0], r.p[1] + TOWN_ORIGIN_W[1], r.p[2] + TOWN_ORIGIN_W[2]]);
      demoPlayer.update(dt, player.pos, lookdev.reducedMotion, others);
    } else if (demoShown) demoPlayer.hide();
    demoShown = mpOn;
  }
  if (mp && mpOn !== mpShown) { mpShown = mpOn; mp.setVisible(mpOn); }
  if (mp && mpOn) mp.update(dt, { pos: player.pos, heading: player.heading, speed: Math.hypot(player.vel[0], player.vel[1]), grounded: player.grounded !== false, reducedMotion: lookdev.reducedMotion });
  else if (!mpTried && mpOn && !judge && params.get('mp') !== '0') {
    mpTried = true;
    import('./play/multiplayer.js').then((m) => { const d1 = loadDay1(ctx.storage); mp = m.createMultiplayer({ scene, camera, THREE, t: (k, a) => ctx.i18n.t(k, a), storage: ctx.storage, name: d1.nickname || '', account: (d1.guest && d1.minted && d1.guest.account_id) || null, lv: townLedger && townLedger.level ? Math.min(99, townLedger.level.level) : null, skin: irisAvatar && irisAvatar.hero ? irisAvatar.hero.id : 'iris', phone: mobileDevice, bots: Math.max(0, Math.min(14, Number(params.get('bots')) || 0)) }); mpShown = true; if (window.__ftf) window.__ftf.mp = mp; })
      .catch((e) => console.warn('[mp]', e));
  }
  if (town && town.active) {
    if (!splashGround && town.groundAt) { splashGround = true; lookdev.setGroundSampler((x, z) => town.groundAt(x, z)); } // each splash lands on its own surface, not at her height
    lookdev.setGround(player.pos[0], player.pos[1], player.pos[2]); // the splash tile follows her
    townFrame.playerPos = player.pos; townFrame.reducedMotion = lookdev.reducedMotion; townFrame.lamps = lookdev.light.lamps; // lamps follow the hour and the weather (docs/atmosphere.md)
    townFrame.light.sun = lookdev.sun.color; townFrame.light.daylight = lookdev.weather.state.sun; townFrame.light.pixelsPerMetre = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
    town.update(clock.elapsedTime, dt, townFrame);
    if (town.townsfolk) { // walkers never overlap her: a townsperson closer than 0.6 m eases her out (owner 13.11); other heroines count as bodies
      if (!town.townsfolk.bodiesSet) { town.townsfolk.bodiesSet = true; town.townsfolk.setBodies(() => { const out = mp && mp.bodies ? mp.bodies() : []; if (hatchkeeper) { const h = hatchkeeper.root.position; out.push([h.x - TOWN_ORIGIN_W[0], h.y - TOWN_ORIGIN_W[1], h.z - TOWN_ORIGIN_W[2]]); } return out; }); }
      const push = town.townsfolk.irisPush; if (push[0] || push[1]) { player.pos[0] += push[0]; player.pos[2] += push[1]; }
    }
    if (fogCards) fogCards.update(clock.elapsedTime, camera, (lookdev.look.mistCards || 0) + lookdev.weather.state.rain * 0.3, scene.fog.color, { reducedMotion: lookdev.reducedMotion, enabled: lookdev.tier !== 'low' });
    if (townCasting) townCasting.update(dt, clock.elapsedTime, lookdev.reducedMotion, entered && !townFlow.busy && !(townShops && townShops.inside)); // no casts indoors
    if (townMobs) townMobs.update(dt, entered && !(townShops && townShops.inside));
    lookdev.setHeroLight(town.altar.core || town.altar.focus, town.altar.glow / CORE_GLOW.awake); // the altar's amber is the strongest local light
    if (dayCycle && !lookdev.reducedMotion && !(townShops && townShops.inside)) tickDayCycle(dt);
    if (townShops) townShops.update(); // indoors: the baked light, the counter and door zones
    if (doorGlow) doorGlow.update(dt, player.pos, !(townShops && townShops.inside));
    if (salvageView) salvageView.update(dt);
    if (townProps) townProps.update(dt, lookdev.reducedMotion);
    if (spotProps) spotProps.update(dt, lookdev.reducedMotion);
    if (townMonsters && !(townShops && townShops.inside)) townMonsters.update(dt, lookdev.reducedMotion);
    // Phones and the low tier (jury low-tier pass, 12.11): beyond the walls the inner blocks hide behind them; the gate,
    // the temple on the hill and the terrain stay, so the view back at the castle keeps its silhouette
    if (mobileDevice || lookdev.tier === 'low') {
      const lx = player.pos[0] - TOWN_ORIGIN_W[0], lz = player.pos[2] - TOWN_ORIGIN_W[2];
      const out = lz > 36 || Math.abs(lx) > 55;
      for (const inst of streamer.instances) if (inst.real && (inst.name === 'town_block_mid' || inst.name === 'town_block_square')) inst.real.visible = !out;
    }
    if (photo) photo.setAvailable(entered && !townFlow.busy && !introOn && !(townShops && townShops.busy));
    if (townQuests) townQuests.update(player.pos);
    if (hatchkeeper) hatchkeeper.update(dt, inTown ? player.pos : null);
    if (questMarkers) questMarkers.update(clock.elapsedTime);
    if (townPortal) { if (!townPortal.grounded) { const g = town.groundAt(townPortal.root.position.x, townPortal.root.position.z); if (g != null) { townPortal.root.position.y = g; townPortal.grounded = true; } } townPortal.update(dt, clock.elapsedTime); }
    if (townBoard) { if (!townBoard.grounded) { const g = town.groundAt(townBoard.root.position.x, townBoard.root.position.z); if (g != null) { townBoard.root.position.y = g; townBoard.grounded = true; } } townBoard.update(player.pos, clock.elapsedTime); }
    if (townBarks) townBarks.update(player.pos, !(photo && photo.on) && !day1Open() && entered && !townFlow.busy && !townFlow.talking && !(townShops && townShops.inside) && !introOn);
    if (marketScene) {
      const free = !(photo && photo.on) && !day1Open() && entered && !(townShops && townShops.inside) && !introOn;
      marketScene.update(player.pos, free && !townFlow.talking);
      marketTicker.show(free);
    }
    if (townAudio) { // footsteps from the distance actually walked; the listener follows the camera
      const d = Math.hypot(player.pos[0] - lastStepPos[0], player.pos[2] - lastStepPos[2]);
      if (d < 3) { // the floor under her: wood in the shops, grass beyond the walls, stone in the streets
        const lx = player.pos[0] - TOWN_ORIGIN_W[0], lz = player.pos[2] - TOWN_ORIGIN_W[2];
        townAudio.step(d, !!player.run, townShops && townShops.inside ? 'wood' : (lz > 36 || Math.abs(lx) > 55) ? 'grass' : 'stone');
      }
      { // the music bed by zone: the shops, beyond the walls, the streets (src/audio/music.js)
        const lx = player.pos[0] - TOWN_ORIGIN_W[0], lz = player.pos[2] - TOWN_ORIGIN_W[2];
        townAudio.setMusicZone(townShops && townShops.inside ? 'interior' : (lz > 36 || Math.abs(lx) > 55) ? 'outside' : 'town');
      }
      { // Floating Cities lifts while monsters chase her; the crownrift elite engaged brings Legionnaire
        let aggro = false, elite = false;
        const mobs = townMobs && townMobs.brain ? townMobs.brain.mobs : null;
        if (mobs) for (const m of mobs) { if (m.state === 'idle' || m.state === 'dead' || m.state === 'gone') continue; aggro = true; if (m.T && m.T.elite) elite = true; }
        townAudio.setCombat({ aggro, elite });
      }
      lastStepPos[0] = player.pos[0]; lastStepPos[1] = player.pos[1]; lastStepPos[2] = player.pos[2];
      townAudio.setListener(camera, avatar.position);
    }
  }
  rig.update(dt, focus, lookdev.reducedMotion ? null : player.vel); // no camera look-ahead under reduced motion
  if (townMobs && townMobs.shake > 0) { const k = townMobs.shake * 0.08; camera.position.x += (Math.random() - 0.5) * k; camera.position.y += (Math.random() - 0.5) * k; } // heavy hits (off with reduced motion)
  if (glassShoal && glassShoal.owns() && glassShoal.shakeCamera) glassShoal.shakeCamera(camera, dt); // the Shoal's ultimate (scaled down under reduced motion)
  streamer.update(dt, focus);
  warmup.update();
  updateIrisStandIn();
  if (companions.length) { companionHero.position.copy(avatar.position); companionHero.heading = avatar.rotation.y; companionHero.speed = player.speed; for (const c of companions) c.update(dt, companionHero, lookdev.reducedMotion); }
  if (shoalArt && shoalArt.active) shoalArt.update(dt, focus); else lookdev.update(dt, focus, rig.actualDist);
  // Animation drives from the actual ground speed (after collisions: pushing into a wall is standing
  // still), smoothed per frame rather than toggled per physics step: at high frame rates many frames run
  // no 30 Hz step, and toggling walk/idle on those frames restarted the walk clip every other frame.
  animSpeed = damp(animSpeed, shoalSpeed != null ? shoalSpeed : player.speed, 14, dt);
  const speed = animSpeed;
  movingState = movingState ? speed > 0.08 : speed > 0.25;
  void moving;
  if (play && !inTown) play.update(dt, { focus, moving: movingState, speed, running: player.run && movingState });
  else if (irisAvatar) irisAvatar.update(dt, movingState, avatar, clock.elapsedTime, speed, player.run && movingState, lookdev.reducedMotion, null); // the town: her gait before the season
  // the sticks: the town, and the archipelago in normal play; ?demo=judge keeps tap-to-move and its buttons (README path)
  if (play && !inTown) { if (!panelCollapse) panelCollapse = createPanelCollapse({ t: (k, a) => ctx.i18n.t(k, a) }); panelCollapse.update(); } // the inside-Shell panel folds
  if (touchSticks) touchSticks.update({ active: (!!(inTown && townFlow && townFlow.phase === 'town') || (!!play && !inTown && !judge)) && !document.querySelector('dialog[open], .gm, .pl-panel:not([hidden])') });
  stamina.update(dt, { running: !!(inTown && townMobs && townMobs.iris && townMobs.iris.outside && player.run && movingState) });
  document.body.classList.toggle('st-winded', stamina.winded);
  if (killXp) killXp.update(dt);
  if (floatNumbers) floatNumbers.update();
  if (playerHud) playerHud.update({ visible: !!(inTown && townFlow && townFlow.phase === 'town'), hp: townMobs ? townMobs.hp : 100, maxHp: 100, stamina });
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
  if (drawn) { if (shoalArt && shoalArt.active) shoalArt.render(); else lookdev.render(); }
  if (drawn && photo && photo.pending) photo.capture(); // the frame just drawn, before the buffer is cleared
  if (!firstFrameDone && (drawn || sceneReady)) { firstFrameDone = true; if (boot.onFirstFrame) boot.onFirstFrame(); }
  if (boot.onProgress && (progressTimer -= dt) <= 0) { progressTimer = 0.25; boot.onProgress(streamer.stats()); }
  hud.frame(dt);
  hud.update(dt, { info: renderer.info, physics, streaming: streamer.stats(), events: streamer.events, camera: rig, lookdev: lookdev.stats() });
  mouseAim.update();
  input.endFrame();
  requestAnimationFrame(frame);
}

// Expose a small debug handle for manual checks in the browser console and for measurements.
window.__ftf = {
  get features() { return featureFlags; },
  scene, world, streamer, warmup, player, rig, renderer, camera, lookdev, setQuality: (t) => lookdev.setQuality(t), setReducedMotion: (on) => lookdev.setReducedMotion(on), perf, detectedTier, dayCycle, // dayCycle: the loop clock, its start and the session's weather timeline (QA)
  get vfx() { return play ? play.hooks.vfx : null; }, get audio() { return play ? play.hooks.audio : null; },
  // QA (art/anim/ingame.mjs): Iris's avatar and a cue for one of her one-shot clips (e.g. 'understand', 'greet').
  get iris() { return irisAvatar; }, get storyProps() { return { portal: townPortal, board: townBoard }; },   // QA: the Gate-Loom and the Shell monument
  irisReact: (clip) => { if (irisAvatar) irisAvatar.react(clip, clock.elapsedTime); },
  // The town on the ground (docs/town.md), null on the paths that skip it. register() is the code path of pressing E at
  // the altar (it resolves false when the prompt is not offered); walkRoute() steers Iris along the jury route (QA).
  town: town ? {
    scene: town, flow: townFlow, plan: townMode,
    get ready() { return town.ready && townGrounded; }, get active() { return inTown; }, get registered() { return townFlow.registered; },
    get promptVisible() { return townFlow.promptVisible; }, get phase() { return townFlow.phase; }, get walkMs() { return townFlow.walkMs; },
    register: () => townFlow.register(), walkRoute: () => townFlow.walkRoute(), status: () => town.status(),
    get casting() { return townCasting; }, // the field beyond the walls (QA: aimAt, release)
    get mobs() { return townMobs; }, get rigYaw() { return rig.yaw; }, // QA: the camera orbit (touch multi-touch test) // the monsters on the hillside (QA: brain, iris)
    get shops() { return townShops; }, // walk-in shops (QA: enter('exchange'), leave())
    get props() { return townProps; }, // trading board and wheel (QA: boardAt, wheelAt)
    get barks() { return townBarks; }, // townsfolk lines (QA: current)
    get photo() { return photo; }, // photo mode (QA: toggle, setFilter, requestCapture)
    get monsters() { return townMonsters; }, chests: chestBag, // monsters outside the walls and the chest bag (QA)
    companions, // dragon companions in flight (QA)
  } : null,
};
requestAnimationFrame(frame);
return { enterWorld, world3d, player, rig, lookdev, renderer, streamer, get play() { return play; }, town, townMode, 
  /** The first town view is complete: ground under Iris, every street piece real and warmed, her own model in (main.js gates the loading screen on it). */
  get townReady() { return !town || !inTown || (town.shown && townGrounded && (!irisLoad.hasModel || irisLoad.loaded || (irisLoad.failed && import.meta.env.DEV))); } };
}
