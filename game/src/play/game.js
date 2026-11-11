// The play layer in the browser: wires the 3D client to the authoritative room through the local
// transport (the same room code the agent API serves), and keeps every visual in sync with the
// room's observation: clan agents and their minds, the Shell interior with the Guests and their
// logogram, anchor pads, the plaza sign, the HUD (src/ui), the play UI, and VFX/audio (event cues in
// hooks.js, world-driven presentation in presentation.js).
// Movement stays in main.js; this module supplies a route to the current goal (G) and teleports on
// Shell entry and exit. No rule is evaluated here.
import * as THREE from 'three';
import { mountHud } from '../ui/index.js';
import { createLocalTransport } from './transport-local.js';
import { PlaySession } from './session.js';
import { createPlayUi } from './ui.js';
import { attachWorldHud } from './world-hud.js';
import { createHints } from './hints.js';
import { ClanAgents } from './agents.js';
import { newlyUnderstood, reactionsFor } from './behaviour.js';
import { Hooks } from './hooks.js';
import { attachPresentation } from './presentation.js';
import { vfxTierFor } from './ambience.js';
import { drawLogogram } from './logogram.js';
import { createShellScene } from '../scenes/shell.js';
import { planRoute, placePosition } from '../net/world-map.js';
import { steerTo } from '../physics/character.js';
import { CAMPS, ANCHOR_ZONES, SHARD } from '../scenes/layout.js';
import { CLAN_ASSET } from './behaviour.js';
import { ShellHub, signForShell, waitingShells } from './hub.js';
import { shellBeaconLevels, pointerTarget, pointerPose } from './beacon-plan.js';
import { ShellBeacons, GoalPointer } from '../render/beacons.js';
import { warmModel } from '../render/warmup.js';
import { attachFun, CHAPTER_KEY } from './fun-ui.js';
import { FIRST_LOOP_KEY } from './objectives.js';
import { createHubUi } from './hub-ui.js';
import { createMapPanel } from './map-ui.js';
import { panelArbiterFor } from './panels.js';
import { CLAN_ORDER } from './behaviour.js';
import { setGreyboxLabels } from '../render/greybox.js';
import { attachChapters } from '../cinematic/chapters/index.js';

// Optional modules written by other agents: present → used, absent → silently skipped.
const VFX_MODULES = import.meta.glob('../vfx/index.js');
const AUDIO_MODULES = import.meta.glob('../audio/audio.js');
/** How long a flight's cover waits for the real Shell hall before falling back to the greybox room (ms). */
const SHELL_WAIT_MS = 8000;

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene @param {THREE.Camera} o.camera @param {THREE.WebGLRenderer} o.renderer
 * @param {object} o.world3d island scene (scenes/island.js) @param {object} o.rig camera rig
 * @param {object} o.player CharacterController @param {THREE.Object3D} o.avatar @param {object} o.lookdev
 * @param {HTMLElement} o.uiRoot @param {object} o.ctx play context (play/i18n.js createPlayContext)
 * @param {{seedHex?: string, rules?: string, worldHud?: boolean, hub?: boolean, onSettings?: Function, resetHints?: boolean, devLabels?: boolean, iris?: object}} [o.options]
 *   `hub: false` keeps the walking play (no Shell hub, ticks only by End trial)
 *   `worldHud: false` keeps the greybox overlay (goal card, chronicle, action bar) instead of the world HUD
 *   `devLabels: true` (?dev=1) shows the greybox "not final art" labels; the F3 dev HUD shows them too
 *   `iris`: the IrisAvatar (play/iris-avatar.js) that already wears her model (the session began in the town)
 */
export async function startPlay({ scene, camera, renderer, world3d, rig, player, avatar, lookdev, uiRoot, ctx, options = {} }) {
  const transport = createLocalTransport({ rules: options.rules, seedHex: options.seedHex });
  // A player who has already watched the first loop verified once on this device skips the first-loop goals
  // (objectives.js honours the flag); ?demo=judge and ?hints=reset (resetHints) always start fresh.
  const storage = ctx.storage && typeof ctx.storage.getJSON === 'function' ? ctx.storage : null;
  let loopDone = !options.resetHints && !!(storage && (storage.getJSON(FIRST_LOOP_KEY, null) || {}).done);
  const session = new PlaySession({ transport, skipOnboarding: loopDone });
  await session.start();
  session.on('obs', (o) => {
    if (loopDone || !storage || !(o.proofs || []).some((p) => p.verified)) return;
    loopDone = true;
    storage.setJSON(FIRST_LOOP_KEY, { done: true, at: new Date().toISOString() });
  });

  const shell = createShellScene({ scene, streamer: world3d.streamer });
  const agents = new ClanAgents({ scene, i18n: ctx.i18n, iris: options.iris || null }); // iris: the avatar the town already attached
  agents.attachIris(avatar);

  // HUD from the UI shell: status and subtitles over the room's observation (no raw engine state).
  const store = {
    getState() {
      const o = session.obs;
      if (!o) return null;
      return { tick: o.season.tick, phase: o.season.phase, silk: [o.iris.silk], ap: o.iris.attention, wild: o.iris.firstWordForgotten, H: o.season.tension, outcome: o.season.outcome, version: o.version, feed: [] };
    },
    subscribe: (fn) => session.on('obs', fn),
  };
  const hud = mountHud(uiRoot, store, { ctx });

  const hooks = new Hooks({ resolve: resolvePlace });
  // quiet: in the hub the spot menu stays hidden after a flight or a relocation until the player walks
  const state = { route: null, zone: 'island', entering: null, now: 0, lastMove: 0, lastPos: player.pos.slice(), moved: 0, quiet: !!(options.hub !== false) };
  // World-driven presentation (play/presentation.js): Shell mist, hums and crack pulse, tension, the glass
  // sign as ink, footsteps, ambience zones, UI clicks, composer/tier/reduced-motion follow. The hub's flights
  // arrive through the same zone events, so they are covered too.
  const presentation = attachPresentation({ hooks, scene, world3d, shell, lookdev, agents, player, uiRoot, session, rig });

  const useWorldHud = options.worldHud !== false;
  // The Shell hub (owner decision 08.11): fly into Shells, read and stake there, leaving ends the trial.
  const hubMode = options.hub !== false;
  const hub = hubMode ? new ShellHub({ session }) : null;
  if (hub) { session.flags.hub = true; session.recompute(); }
  const ui = createPlayUi({
    root: uiRoot, ctx, session, hud,
    handlers: {
      onGo: walkTo, onEndTick: hub ? () => hubUi && hubUi.handleKey('KeyT') : null,
      contextHidden: () => !!(hub && (state.quiet || hub.card || hub.advancing || hub.busy)),
      onSigns: () => { if (worldHud && worldHud.hud) worldHud.hud.signs.open(); }, // QA-005: visions open the HUD Signs panel
    },
    // with the world HUD a single action is the HUD prompt; the context menu lists two or more
    contextMin: useWorldHud ? 2 : 1,
  });
  // Novice hints A to Z (play/hints.js): Novice gets toasts, Iris lines and the Hints tab; Pro only Lore.
  const hints = useWorldHud ? createHints({ storage: ctx.storage, mode: () => (ctx.prefs ? ctx.prefs.get().hudMode : 'novice'), i18n: ctx.i18n, hub: hubMode }) : null;
  if (hints && options.resetHints) hints.reset();
  // the phone HUD (docs/ui-mobile-hud.md) draws the Shell selector and the quests sheet from the hub and flies / passes through it
  const worldHud = useWorldHud ? attachWorldHud({ uiRoot, ctx, session, ui, hints, hub, autoOpenShard: !!options.judge, handlers: { onGo: walkTo, onSettings: options.onSettings, onMap: () => map.toggle(), onFly: (n) => fly(n), onPass: () => hubUi && hubUi.handleKey('KeyT') } }) : null;
  // living agents (Task N): meeting and contribution beats reach the dialogue strip when they actually happen
  agents.onSay = (l) => { if (worldHud) worldHud.say(l); };
  let movedReported = 0;
  const hubUi = hub ? createHubUi({ root: uiRoot, ctx, hub, onFly: fly, onRejected: (reason) => hud.showRejection(reason) }) : null;
  // The island map (play/map-ui.js, key N): place names live here, not on labels in the world (owner 08.11).
  const map = createMapPanel({
    root: uiRoot, ctx, session, hub: hubMode,
    getState: () => ({ playerPos: player.pos, heading: player.heading, zone: state.zone, agents: CLAN_ORDER.filter((c) => c !== 'iris').map((clan) => { const p = agents.positionOf(clan); return { clan, position: p ? [p.x, 0, p.z] : null }; }) }),
    onRoute: (route, place) => {
      if (route.kind === 'fly') { fly(route.shell); return; }
      walkTo(route.place);
      if (state.route) ui.flash(ctx.i18n.t('map.walking', { place: ctx.i18n.t(place.labelKey, place.labelArgs) }), 2500);
      if (worldHud) worldHud.activity('command');
    },
    // one panel at a time (play/panels.js): claiming closes whatever else is open; another claim closes the map
    onOpen: () => panelArbiterFor(uiRoot).claim('map', () => map.close()),
    reducedMotion: () => lookdev.reducedMotion,
  });
  // Greybox labels are a dev aid: ?dev=1 or the F3 dev HUD shows them, play never does.
  const devHudEl = uiRoot.ownerDocument.getElementById('hud');
  const devParam = (() => { try { return new URLSearchParams(uiRoot.ownerDocument.location.search).get('dev') === '1'; } catch { return false; } })();
  const syncLabels = () => setGreyboxLabels(!!options.devLabels || devParam || !!(devHudEl && !devHudEl.hidden));
  syncLabels();
  if (devHudEl && typeof MutationObserver !== 'undefined') new MutationObserver(syncLabels).observe(devHudEl, { attributes: true, attributeFilter: ['hidden'] });
  if (hub) {
    hub.onOpenMemories = () => ui.open('memory');
    hub.on('change', () => ui.update());
    hub.on('relocate', async ({ position }) => { await hubUi.cover(''); state.quiet = true; teleport(position, null); session.trail.reset(player.pos); setTimeout(() => hubUi.uncover(), 120); });
    hub.on('auto', (reason) => { if (worldHud) worldHud.say({ speakerId: 'iris', key: reason.key, args: reason.args }); });
  }

  /** Flight from the island into Shell n: cover, enter (the zone event teleports), uncover. */
  async function fly(n) {
    // claim the hub before the fade: keys pressed during the flight must not end a trial or start a second flight (QA-002)
    if (!hub || state.zone === 'shell' || !hub.beginTransit('fly')) return;
    let r;
    try {
      await hubUi.cover(ctx.i18n.t('hub.flying', { shell: ['I', 'II', 'III', 'IV'][n - 1] }));
      // The cover stays until the real hall is shown (it is pinned in the streamer, so this is normally
      // instant); after the timeout the greybox room is the fallback and onRealLayout fixes the spawn.
      shell.preload();
      await shell.whenReady(SHELL_WAIT_MS);
      r = await hub.flyTo(n);
    } finally { hub.endTransit(); }
    setTimeout(() => hubUi.uncover(), 160);
    if (!r.ok) hud.showRejection(r.reason);
    else if (worldHud) { worldHud.activity('command'); worldHud.activity('signsOpen'); }
  }

  session.on('event', (ev) => {
    const d = ev.data || {};
    if (ev.type === 'fx' && d.line) { hud.say({ speakerId: d.line.speakerId, key: d.line.key, args: d.line.args }); if (worldHud) worldHud.say(d.line); }
    if (ev.type === 'fx' && d.fx && d.fx.type === 'ask') shell.answer(!!d.fx.yes, state.now);
    if (ev.type === 'world.dialogue') agents.setTalking(d.clan, 9, state.now);
    agents.react(reactionsFor(ev, state.now));
    agents.event(ev, state.now); // the director hears public events before the next observation (reveal look-up)
    hooks.event(ev);
  });
  session.on('zone', (res) => {
    if (res.zone === 'shell') enterShell(res.shell);
    else {
      if (hub) state.quiet = true;
      exitShell(res.position);
      // leaving a Shell ends the trial in the hub (hub.leave advances itself; E at the entrance lands here)
      if (hub && !hub.busy && !hub.advancing) hub.advance();
    }
  });
  session.on('result', (r) => {
    if (!r.silent) hooks.play(r.ok ? 'command_ok' : 'rejected', r.ok ? null : { kind: 'iris' }, r.ok ? {} : { reason: r.reason });
    if (worldHud) worldHud.activity('command');
  });

  // VFX (src/vfx, createVfx(scene, camera, renderer, opts)) and audio (src/audio, createAudio()).
  let audio = null;
  loadModule(VFX_MODULES).then((m) => {
    if (!m || !m.createVfx) return;
    const vfx = m.createVfx(scene, camera, renderer, { tier: vfxTierFor(lookdev), reducedMotion: lookdev.reducedMotion });
    hooks.attachVfx(vfx);
    presentation.attachVfx(vfx); // composer, tier, mists, crack pulse, tension, glass sign
  }).catch((e) => console.warn('[play] vfx unavailable', e));
  loadModule(AUDIO_MODULES).then((m) => {
    if (!m || !m.createAudio) return;
    audio = m.createAudio();
    hooks.attachAudio(audio);
    presentation.attachAudio(audio); // one hum per Shell, footsteps and zones from the frame loop
    // WebAudio starts only from a user gesture.
    const unlock = () => { audio.unlock().catch(() => {}); window.removeEventListener('keydown', unlock); window.removeEventListener('pointerdown', unlock); };
    window.addEventListener('keydown', unlock); window.addEventListener('pointerdown', unlock);
  }).catch((e) => console.warn('[play] audio unavailable', e));
  let lastStrokes = '';

  function resolvePlace(at) {
    switch (at.kind) {
      case 'camp': return agents.positionOf(at.clan) || new THREE.Vector3(...CAMPS.find((c) => c.id === CLAN_ASSET[at.clan]).position).setY(1.4);
      case 'scroll': return new THREE.Vector3(0, 0.8, 0);
      case 'anchor': { const z = ANCHOR_ZONES[(at.shell || 1) - 1]; return new THREE.Vector3(z.position[0], 1.2, z.position[2]); }
      case 'iris': return avatar.position.clone().setY(avatar.position.y + 1.2);
      case 'pedestal': return new THREE.Vector3(SHARD.position[0], 1.3, SHARD.position[2]);
      case 'glass': return new THREE.Vector3(shell.origin[0], shell.origin[1] + 4, shell.origin[2] - 10);
      case 'sky': default: return new THREE.Vector3(0, 9, 0);
    }
  }

  /** G / "Walk there": follow the room's walk graph from here to a named place. */
  function walkTo(place) {
    if (place && place.startsWith('shell:')) { fly(Number(place.slice(6))); return; }
    if (state.zone === 'shell') {
      const g = shell.spots().glass;
      state.route = [[shell.origin[0] + g[0], 0, shell.origin[2] + g[1]]];
      return;
    }
    const pts = planRoute(player.pos, place);
    const dest = placePosition(place);
    if (!pts) return;
    state.route = pts.map(([x, z]) => [x, 0, z]);
    if (dest && dest.position && place.startsWith('anchor_zone')) state.route.push(dest.position.slice());
  }

  /** Steering for main.js while a route is active; null when idle. */
  function routeWish() {
    if (!state.route) return null;
    const target = state.route[0];
    const last = state.route.length === 1;
    const w = steerTo(player.pos, target, last ? 0.3 : 0.6);
    if (!w) { state.route.shift(); if (!state.route.length) state.route = null; return state.route ? routeWish() : null; }
    const l = Math.hypot(w[0], w[1]);
    return last || l === 0 ? w : [w[0] / l, w[1] / l];
  }
  function cancelRoute() { state.route = null; }

  function teleport(pos, heading) {
    player.pos = pos.slice(); player.prevPos = pos.slice(); player.lastSafe = pos.slice(); player.vy = 0; player.grounded = false;
    if (heading != null) player.heading = heading;
    state.route = null;
  }

  function enterShell(n) {
    shell.activate(n);
    state.zone = 'shell';
    state.entering = { start: state.now };
    ui.flash(ctx.i18n.t('shell.entering', { shell: ['I', 'II', 'III', 'IV'][n - 1] }), 2500);
    player.world = shell.world; rig.world = shell.world;
    const sp = shell.spawn();
    teleport(sp.pos, sp.heading);
    rig.yaw = rig.baseYaw; rig.dist = Math.min(rig.dist, 9);
    presentation.onZone('shell');
  }
  // A late swap from the greybox to the real hall (slow link, the wait above timed out): Iris moves to the
  // real arrival point unless the player has already walked on.
  shell.onRealLayout = () => {
    if (state.zone !== 'shell' || !shell.atGreySpawn(shell.toLocal(player.pos))) return;
    const sp = shell.spawn();
    teleport(sp.pos, sp.heading);
    rig.yaw = rig.baseYaw;
  };
  function exitShell(position) {
    shell.deactivate();
    state.zone = 'island'; state.entering = null;
    player.world = world3d.world; rig.world = world3d.world;
    teleport(position || session.obs.you.position, null);
    session.trail.reset(player.pos);
    presentation.onZone('island');
  }

  let lastSignKey = '', lastPadKey = '';
  function syncVisuals() {
    const o = session.obs;
    if (!o) return;
    // Plaza sign: the newest published sign, else the last revealed one.
    const pub = (o.prophecies || []).filter((p) => !p.vision).sort((a, b) => b.publishedAt - a.publishedAt)[0];
    const sign = pub ? { forms: pub.forms, dots: pub.dots } : (o.chronicle.length ? o.chronicle[o.chronicle.length - 1] : null);
    const key = sign ? sign.forms.join() + sign.dots : '';
    if (key !== lastSignKey) { lastSignKey = key; world3d.setPlazaSign(sign ? (c) => drawLogogram(c, sign, { size: 256 }) : null); }
    // Anchor pads: Iris's next anchor tick per Shell.
    const map = {};
    for (const a of o.iris.anchors) if (map[a.shell] == null || a.tick < map[a.shell]) map[a.shell] = a.tick;
    const pk = JSON.stringify(map);
    if (pk !== lastPadKey) { lastPadKey = pk; world3d.setAnchorTicks(map); }
    // The Guest draws the newest sign Iris can see (a vision first: it is hers alone).
    const vis = hub && o.you.zone === 'shell' ? signForShell(o, o.you.shell) : (o.prophecies || []).slice().sort((a, b) => (b.vision - a.vision) || (b.publishedAt - a.publishedAt))[0];
    shell.setSign(vis ? { forms: vis.forms, dots: vis.dots } : null, state.now);
    presentation.setSign(vis ? { forms: vis.forms, dots: vis.dots } : null);
    if (audio) {
      try {
        audio.setTension(o.season.tension);
        // The Guest "speaks" the strokes of the sign it draws while Iris stands inside.
        const sk = vis && state.zone === 'shell' ? vis.forms.join() + vis.dots : '';
        if (sk && sk !== lastStrokes) audio.speakStrokes([0, 1, 2, 3].map((k) => ['arc', 'spike', 'loop', 'drop'][vis.forms[(vis.dots + k) % 4]]));
        lastStrokes = sk;
      } catch { /* audio is optional */ }
    }
  }
  session.on('obs', syncVisuals);
  syncVisuals();
  // Chapter films (cinematic/chapters, docs/chapters.md): short in-engine cutscenes between the season's
  // chapters, built from this season's facts; they take the camera after the rig, hold Iris, pause the hub.
  const chapters = attachChapters({ session, hub, ui, worldHud, map, ctx, lookdev, camera, player, avatar, shell, agents, uiRoot, hooks, now: () => state.now, afterFilm: () => { lastSignKey = ''; syncVisuals(); } });
  // Iris winks (`understand` clip) when a Guest's sign settles a word in her dictionary.
  let prevObs = session.obs;
  session.on('obs', () => {
    if (newlyUnderstood(prevObs, session.obs) > 0) agents.irisReact('understand', state.now);
    prevObs = session.obs;
  });

  // Gold light over the Shells with a sign waiting, strongest on the one the goal names (docs/visual-guidance.md).
  const beacons = new ShellBeacons({ shells: world3d.shells || [] });
  for (const it of beacons.items) warmModel(it.group);
  // ...and chevrons on the ground at Iris's feet toward that place: from the balcony no Shell is on screen.
  const pointer = new GoalPointer({ scene });
  warmModel(pointer.group);
  const pointerPlaces = { shells: ANCHOR_ZONES.map((z) => z.shellPosition), anchors: ANCHOR_ZONES.map((z) => z.anchorPosition) };
  let beaconTimer = 0;
  function syncBeacons(dt) {
    if ((beaconTimer -= dt) > 0) return;
    beaconTimer = 0.25;
    const o = session.obs;
    beacons.setLevels(shellBeaconLevels({ waiting: o ? waitingShells(o) : [], goalTarget: session.goal && session.goal.target, zone: state.zone, filmPlaying: !!chapters.playing }));
  }

  // The fun layer (docs/fun-layer.md): the dictionary as a collection, the new-word moment, the streak, the burning
  // memory, the "who lied to me?" file and the first-chapter card. Presentation only.
  let fun = null;
  try {
    fun = attachFun({ root: uiRoot, ctx, session, hooks, hub, reducedMotion: () => !!lookdev.reducedMotion,
      firstRun: !!options.resetHints || !(storage && (storage.getJSON(CHAPTER_KEY, null) || {}).shown) });
  } catch (e) { console.warn('[play] fun layer off', e); }

  /** Per frame, after physics. */
  function update(dt, { focus, moving, speed = 0, running = false }) {
    state.now += dt;
    syncBeacons(dt);
    beacons.update(dt, lookdev.reducedMotion);
    const aim = pointerTarget(session.goal && session.goal.target, pointerPlaces);
    pointer.update(dt, avatar.position.toArray(), pointerPose(player.pos, aim && aim.position, { zone: state.zone, filmPlaying: !!chapters.playing }), lookdev.reducedMotion);
    const pos = player.pos;
    const inShell = state.zone === 'shell';
    const local = inShell ? shell.toLocal(pos) : pos;
    session.setClient({ zone: state.zone, pos: local, shellSpots: inShell ? shell.spots() : null });
    // Background walk replay when the player stops after a real walk (keeps replays short).
    const step = Math.hypot(pos[0] - state.lastPos[0], pos[2] - state.lastPos[2]);
    state.lastPos = pos.slice();
    if (step > 0.01) { state.lastMove = state.now; state.moved += step; }
    if (state.quiet && moving && !state.route) { state.quiet = false; ui.update(); }
    if (!inShell && state.moved > 4 && state.now - state.lastMove > 0.8 && !session.syncing && session.bus.pending === 0) { state.moved = 0; session.syncPosition(); }
    agents.update(dt, session.obs, { now: state.now, focus, irisPos: inShell ? null : pos, reducedMotion: lookdev.reducedMotion, cameraDist: rig.actualDist, camera, uiRoot });
    agents.updateIris(dt, moving, avatar, state.now, speed, running);
    shell.update(state.now, dt, lookdev.reducedMotion);
    hooks.update(dt, { camera, focus });
    presentation.update(dt, { focus, inShell, speed, running });
    if (worldHud) {
      if (moving && state.now - movedReported > 1) { movedReported = state.now; worldHud.activity('moved'); }
      worldHud.update(dt);
    }
    // the map has no close hook: release its claim once it is closed (Esc, N, its own Close, or another claim)
    if (!map.isOpen() && panelArbiterFor(uiRoot).isOpen('map')) panelArbiterFor(uiRoot).release('map');
    map.update(dt);
    chapters.update(dt); // after the rig and the HUD: a playing film owns the camera until the render
  }

  /** Keyboard for the play UI; returns true when used. */
  function handleKey(code) {
    if (chapters.playing) return chapters.handleKey(code); // a film swallows every key (hold to skip)
    if (fun && fun.handleKey(code)) return true;
    if (code === 'KeyN') return map.handleKey(code);
    if (map.isOpen()) {
      if (code === 'Escape') return map.handleKey(code);
      map.close(); // any other panel key closes the map first, then acts as usual
    }
    if (hubUi && !ui.panel && hubUi.handleKey(code)) { hooks.play('ui_click'); return true; }
    if (worldHud && code === 'KeyV') return worldHud.handleKey(code);
    if (code === 'Escape') return ui.handleKey(code) || (worldHud ? worldHud.handleKey(code) : false) || chapters.handleKey(code);
    return ui.handleKey(code);
  }

  return { session, transport, ui, hud, worldHud, hub, hubUi, map, chapters, fly, agents, shell, hooks, presentation, beacons, pointer, fun, update, handleKey, routeWish, cancelRoute, walkTo, get zone() { return state.zone; }, get routeActive() { return !!state.route; } };
}

async function loadModule(mods) {
  const loader = Object.values(mods)[0];
  return loader ? loader() : null;
}
