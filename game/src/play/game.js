// The play layer in the browser: wires the 3D client to the authoritative room through the local
// transport (the same room code the agent API serves), and keeps every visual in sync with the
// room's observation: clan agents and their minds, the Shell interior with the Guests and their
// logogram, anchor pads, the plaza sign, the HUD (src/ui), the play UI, and VFX/audio hooks.
// Movement stays in main.js; this module supplies a route to the current goal (G) and teleports on
// Shell entry and exit. No rule is evaluated here.
import * as THREE from 'three';
import { mountHud } from '../ui/index.js';
import { createLocalTransport } from './transport-local.js';
import { PlaySession } from './session.js';
import { createPlayUi } from './ui.js';
import { ClanAgents } from './agents.js';
import { reactionsFor } from './behaviour.js';
import { Hooks } from './hooks.js';
import { drawLogogram } from './logogram.js';
import { createShellScene } from '../scenes/shell.js';
import { planRoute, placePosition } from '../net/world-map.js';
import { steerTo } from '../physics/character.js';
import { CAMPS, ANCHOR_ZONES, SHARD } from '../scenes/layout.js';
import { CLAN_ASSET } from './behaviour.js';

// Optional modules written by other agents: present → used, absent → silently skipped.
const VFX_MODULES = import.meta.glob('../vfx/index.js');
const AUDIO_MODULES = import.meta.glob('../audio/audio.js');

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene @param {THREE.Camera} o.camera @param {THREE.WebGLRenderer} o.renderer
 * @param {object} o.world3d island scene (scenes/island.js) @param {object} o.rig camera rig
 * @param {object} o.player CharacterController @param {THREE.Object3D} o.avatar @param {object} o.lookdev
 * @param {HTMLElement} o.uiRoot @param {object} o.ctx play context (play/i18n.js createPlayContext)
 * @param {{seedHex?: string, rules?: string}} [o.options]
 */
export async function startPlay({ scene, camera, renderer, world3d, rig, player, avatar, lookdev, uiRoot, ctx, options = {} }) {
  const transport = createLocalTransport({ rules: options.rules, seedHex: options.seedHex });
  const session = new PlaySession({ transport });
  await session.start();

  const shell = createShellScene({ scene, streamer: world3d.streamer });
  const agents = new ClanAgents({ scene, i18n: ctx.i18n });
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
  const state = { route: null, zone: 'island', entering: null, now: 0, lastMove: 0, lastPos: player.pos.slice(), moved: 0 };

  const ui = createPlayUi({
    root: uiRoot, ctx, session, hud,
    handlers: { onGo: walkTo },
  });

  session.on('event', (ev) => {
    const d = ev.data || {};
    if (ev.type === 'fx' && d.line) hud.say({ speakerId: d.line.speakerId, key: d.line.key, args: d.line.args });
    if (ev.type === 'fx' && d.fx && d.fx.type === 'ask') shell.answer(!!d.fx.yes, state.now);
    if (ev.type === 'world.dialogue') agents.setTalking(d.clan, 9, state.now);
    agents.react(reactionsFor(ev, state.now));
    hooks.event(ev);
  });
  session.on('zone', (res) => { if (res.zone === 'shell') enterShell(res.shell); else exitShell(res.position); });
  session.on('result', (r) => { if (!r.ok && !r.silent) hooks.play('rejected', { kind: 'iris' }, { reason: r.reason }); });

  // VFX (src/vfx, createVfx(scene, camera, renderer, opts)) and audio (src/audio, createAudio()).
  let audio = null;
  loadModule(VFX_MODULES).then((m) => { if (m && m.createVfx) hooks.attachVfx(m.createVfx(scene, camera, renderer, { tier: lookdev.tier, reducedMotion: lookdev.reducedMotion })); }).catch((e) => console.warn('[play] vfx unavailable', e));
  loadModule(AUDIO_MODULES).then((m) => {
    if (!m || !m.createAudio) return;
    audio = m.createAudio();
    hooks.attachAudio(audio);
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
  }
  function exitShell(position) {
    shell.deactivate();
    state.zone = 'island'; state.entering = null;
    player.world = world3d.world; rig.world = world3d.world;
    teleport(position || session.obs.you.position, null);
    session.trail.reset(player.pos);
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
    const vis = (o.prophecies || []).slice().sort((a, b) => (b.vision - a.vision) || (b.publishedAt - a.publishedAt))[0];
    shell.setSign(vis ? { forms: vis.forms, dots: vis.dots } : null, state.now);
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

  /** Per frame, after physics. */
  function update(dt, { focus, moving, speed = 0, running = false }) {
    state.now += dt;
    const pos = player.pos;
    const inShell = state.zone === 'shell';
    const local = inShell ? shell.toLocal(pos) : pos;
    session.setClient({ zone: state.zone, pos: local, shellSpots: inShell ? shell.spots() : null });
    // Background walk replay when the player stops after a real walk (keeps replays short).
    const step = Math.hypot(pos[0] - state.lastPos[0], pos[2] - state.lastPos[2]);
    state.lastPos = pos.slice();
    if (step > 0.01) { state.lastMove = state.now; state.moved += step; }
    if (!inShell && state.moved > 4 && state.now - state.lastMove > 0.8 && !session.syncing && session.bus.pending === 0) { state.moved = 0; session.syncPosition(); }
    agents.update(dt, session.obs, { now: state.now, focus, irisPos: inShell ? null : pos, reducedMotion: lookdev.reducedMotion, cameraDist: rig.actualDist });
    agents.updateIris(dt, moving, avatar, state.now, speed, running);
    shell.update(state.now, dt, lookdev.reducedMotion);
    hooks.update(dt, { camera, focus });
    if (audio) { try { const sp = session.spot; audio.setZone(inShell ? 'shell' : sp && sp.kind === 'camp' ? CLAN_ASSET[sp.clan] : sp ? 'plaza' : 'bridge'); } catch { /* optional */ } }
  }

  /** Keyboard for the play UI; returns true when used. */
  function handleKey(code) { return ui.handleKey(code); }

  return { session, transport, ui, hud, agents, shell, hooks, update, handleKey, routeWish, cancelRoute, walkTo, get zone() { return state.zone; }, get routeActive() { return !!state.route; } };
}

async function loadModule(mods) {
  const loader = Object.values(mods)[0];
  return loader ? loader() : null;
}
