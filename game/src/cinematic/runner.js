// The shot runner: takes a shot script (plain data, see docs/submission/trailer.md and the scripts in
// tools/capture/shots/), drives the game through the frame-stepped clock, moves the camera along the
// scripted path, fires the scripted actions at their times through the game's own input and UI, hides
// or shows the UI, drives the overlays and records every sound the game would have played (the cue
// log the capture tool mixes to picture). It only reaches the game through window.__ftf (main.js) and
// the public play API; it never evaluates a rule.
import * as THREE from 'three';
import { compileCamera } from './camera.js';
import { createOverlay } from './overlay.js';

const KEYUP_DELAY_FRAMES = 2;

/** Predicates the scripts may wait for or condition an action on (`when`). */
const PREDICATES = {
  inShell: (g) => g.play && g.play.zone === 'shell',
  onIsland: (g) => g.play && g.play.zone === 'island',
  playReady: (g) => !!g.play,
  panelOpen: (g) => !!(g.play && g.play.ui.panel),
  panelClosed: (g) => !!g.play && !g.play.ui.panel,
  cardOpen: (g) => !!(g.play && g.play.hub && g.play.hub.card),
  hubIdle: (g) => !!(g.play && g.play.hub && !g.play.hub.busy && !g.play.hub.advancing),
  trial: (g, v) => !!(g.play && g.play.session.obs && g.play.session.obs.season.tick >= v),
  interiorReal: (g) => !!(g.play && g.play.shell.ready),
  loaded: (g) => { const s = g.streamer.stats(); return s.loading === 0 && s.idle === 0; },
  signsOpen: (g) => !!(g.play && g.play.worldHud && g.play.worldHud.hud && g.play.worldHud.hud.signs.isOpen()),
  lobby: (g) => !!document.querySelector('.ftf-lobby'),
  onboarding: (g) => !!document.querySelector('.ftf-onboarding, .ftf-tutorial, .ftf-page'),
};

export class ShotRunner {
  /** @param {{clock: object, name: string}} o clock from installVirtualClock */
  constructor({ clock, name }) {
    this.clock = clock;
    this.name = name;
    this.shot = null;
    this.t = 0;                 // shot seconds (0 at the first captured frame; negative during pre-roll)
    this.frame = 0;
    this.pose = null;           // compiled camera: (u) => pose, or null for the game's own camera
    this.segments = [];
    this.actions = [];
    this.cues = [];             // {t, name, gain, rate, pan, dist, kind}
    this.marks = [];            // {t, label} from `mark` actions, for the editor
    this.overlay = null;
    this.wrapped = false;
    this.keyups = [];
    this.audioWrapped = null;
    this.hidden = new Set();
    this.errors = [];
    this.camState = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 38 };
    this.renderOn = true;       // false while setup actions replay game state (no frame is captured then)
    this.camLog = [];           // per captured frame: camera position and right vector, for the offline mix
    window.addEventListener('error', (e) => this.errors.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => this.errors.push('rejection: ' + String(e.reason && e.reason.message || e.reason)));
  }

  get game() { return window.__ftf || null; }
  get play() { return this.game && this.game.play; }

  /** Hooks the camera rig, the look-dev focus and the audio runtime once the game exists. */
  attach() {
    const g = this.game;
    if (!g || this.wrapped) return !!this.wrapped;
    this.wrapped = true;
    const rig = g.rig, lookdev = g.lookdev, self = this;
    const rigUpdate = rig.update.bind(rig);
    rig.update = function (dt, focus, ...rest) {
      rigUpdate(dt, focus, ...rest);
      self.applyCamera();
    };
    // Rendering can be switched off while a shot's setup replays game state (nothing on screen is captured then).
    const ldRender = lookdev.render.bind(lookdev);
    lookdev.render = function () { if (self.renderOn) ldRender(); };
    const ldUpdate = lookdev.update.bind(lookdev);
    lookdev.update = function (dt, focus, camDist) {
      if (self.pose) { ldUpdate(dt, self.camState.look, self.camState.pos.distanceTo(self.camState.look)); return; }
      ldUpdate(dt, focus, camDist);
    };
    // Streaming: everything that is placed loads and nothing is released, so no greybox pops into a shot.
    g.streamer.prefetchRadius = 1e6; g.streamer.releaseAfter = Infinity; g.streamer.maxConcurrent = 4;
    // A lost WebGL context would leave the HUD over a blank canvas; the capture must know.
    g.renderer.domElement.addEventListener('webglcontextlost', () => { this.contextLost = true; this.errors.push('webgl context lost at t=' + this.t.toFixed(2)); });
    return true;
  }

  /** Logs every sound the game asks for, with its position relative to the camera, for the offline mix. */
  wrapAudio() {
    const p = this.play;
    const audio = p && p.hooks && p.hooks.audio;
    if (!audio || this.audioWrapped === audio) return;
    this.audioWrapped = audio;
    const self = this;
    const orig = { play: audio.play, setZone: audio.setZone, setTension: audio.setTension, speakStrokes: audio.speakStrokes, setShellHums: audio.setShellHums };
    audio.play = (name, o = {}) => { self.logCue(name, o); return orig.play.call(audio, name, o); };
    let lastZone = null, lastTension = null;
    audio.setZone = (z) => { if (z !== lastZone) { lastZone = z; self.cues.push({ t: self.t, kind: 'zone', zone: z }); } return orig.setZone.call(audio, z); };
    audio.setTension = (x) => { if (x !== lastTension) { lastTension = x; self.cues.push({ t: self.t, kind: 'tension', tension: x }); } return orig.setTension.call(audio, x); };
    audio.speakStrokes = (strokes, o = {}) => { self.cues.push({ t: self.t, kind: 'strokes', strokes: strokes.map((s) => (typeof s === 'string' ? s : s.stroke)), ...self.spatial(o.pos) }); return orig.speakStrokes.call(audio, strokes, o); };
    audio.setShellHums = (positions) => { self.cues.push({ t: self.t, kind: 'hums', positions: (positions || []).map((x) => (x.toArray ? x.toArray() : x)) }); return orig.setShellHums.call(audio, positions); };
    // Replay the initial zone/tension state so the mix starts right.
    const o = p.session.obs;
    if (o) this.cues.push({ t: this.t, kind: 'tension', tension: o.season.tension });
    this.cues.push({ t: this.t, kind: 'zone', zone: p.zone === 'shell' ? 'shell' : zoneGuess(this.game.player.pos) });
  }

  /** Pan (-1..1) and distance of a world position from the current camera, for the offline mixer. */
  spatial(pos) {
    if (!pos) return {};
    const cam = this.game.rig.camera;
    const p = pos.isVector3 ? pos : new THREE.Vector3(...pos);
    const rel = p.clone().sub(cam.position);
    const dist = rel.length();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    const pan = dist > 1e-3 ? THREE.MathUtils.clamp(rel.dot(right) / dist, -1, 1) : 0;
    return { pan, dist };
  }

  logCue(name, o) {
    const cue = { t: this.t, kind: 'sound', name, gain: o.gain ?? 1, rate: o.rate ?? 1, delay: o.delay ?? 0, loop: !!o.loop, ...this.spatial(o.pos) };
    this.cues.push(cue);
  }

  /** The camera pose of the current shot time, applied after the rig has placed the game camera. */
  applyCamera() {
    if (!this.pose || !this.shot) return;
    const cam = this.game.rig.camera;
    const seg = this.currentSegment();
    if (!seg) return;
    const u = seg.to > seg.from ? Math.min(1, Math.max(0, (this.t - seg.from) / (seg.to - seg.from))) : 1;
    const pose = seg.pose(u);
    this.camState.pos.set(...pose.pos); this.camState.look.set(...pose.look); this.camState.fov = pose.fov;
    cam.position.copy(this.camState.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.camState.look);
    if (pose.roll) cam.rotateZ(pose.roll);
    if (Math.abs(cam.fov - pose.fov) > 1e-3) { cam.fov = pose.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld(true);
  }

  currentSegment() {
    let seg = null;
    for (const s of this.segments) if (this.t >= s.from) seg = s;
    return seg || this.segments[0] || null;
  }

  /** Loads a shot: compiles camera segments, resets logs, mounts overlays. */
  async load(shot) {
    this.shot = shot;
    this.t = -(shot.preroll ?? 0);
    this.frame = 0;
    this.cues = []; this.marks = []; this.camLog = [];
    const cam = shot.camera;
    const list = Array.isArray(cam) ? cam : cam ? [{ from: 0, to: shot.duration, ...cam }] : [];
    this.segments = list.map((c) => ({ from: c.from ?? 0, to: c.to ?? shot.duration, pose: compileCamera(c), spec: c })).filter((s) => s.pose);
    this.pose = this.segments.length ? true : null;
    this.actions = (shot.actions || []).map((a, i) => ({ ...a, id: i, done: false }));
    if (!this.overlay) this.overlay = createOverlay(document);
    this.overlay.set(shot.overlays || []);
    this.setUi(shot.ui || 'game');
    for (const h of shot.hide || []) this.hide(h);
    this.attach();
    return this.state();
  }

  setUi(mode) {
    const b = document.body.classList;
    b.remove('cine-clean', 'cine-nohub', 'cine-nodev');
    if (mode === 'clean') b.add('cine-clean');
    else if (mode === 'hud') b.add('cine-nohub', 'cine-nodev');
    else b.add('cine-nodev');
  }

  /** Scene-level things a beauty shot hides: nameplates, greybox labels, the move marker, the mist sprites. */
  hide(what) {
    const g = this.game;
    if (!g) return;
    this.hidden.add(what);
    const scene = g.scene;
    if (what === 'labels') scene.traverse((o) => { if (o.isSprite && o.name === 'label') o.visible = false; });
    if (what === 'nameplates' && this.play) for (const a of this.play.agents.agents.values()) a.mind.sprite.visible = false;
    if (what === 'marker') scene.traverse((o) => { if (o.name === 'move_marker') o.visible = false; });
    if (what === 'iris' && this.play) g.scene.traverse((o) => { if (o.name === 'player_iris') o.visible = false; });
  }

  /** Runs the actions whose time has come (or whose `when` predicate just became true). */
  runActions() {
    for (const a of this.actions) {
      if (a.done) continue;
      if (a.at != null && this.t < a.at) continue;
      if (a.when && !this.test(a.when, a.value)) continue;
      a.done = true;
      try { this.perform(a); } catch (e) { this.errors.push('action ' + a.do + ': ' + e.message); console.warn('[cinematic] action failed', a, e); }
    }
    while (this.keyups.length && this.keyups[0].frame <= this.frame) {
      const k = this.keyups.shift();
      window.dispatchEvent(new KeyboardEvent('keyup', { code: k.code, key: k.key, bubbles: true }));
    }
  }

  test(name, value) { const p = PREDICATES[name]; return p ? !!p(this.game, value) : false; }

  perform(a) {
    const g = this.game, play = this.play;
    switch (a.do) {
      case 'key': {
        const key = a.key || keyFor(a.code);
        window.dispatchEvent(new KeyboardEvent('keydown', { code: a.code, key, bubbles: true }));
        this.keyups.push({ frame: this.frame + KEYUP_DELAY_FRAMES, code: a.code, key });
        break;
      }
      case 'click': {
        const el = document.querySelector(a.selector);
        if (!el) throw new Error('no element ' + a.selector);
        el.focus && el.focus();
        el.click();
        break;
      }
      case 'fly': play.fly(a.shell); break;
      case 'open': play.ui.open(a.panel, a.data || null); break;
      case 'close': play.ui.close ? play.ui.close() : play.handleKey('Escape'); break;
      case 'walk': play.walkTo(a.place); break;
      case 'teleport': {
        const p = g.player; p.pos = a.pos.slice(); p.prevPos = a.pos.slice(); p.lastSafe = a.pos.slice(); p.vy = 0;
        if (a.heading != null) p.heading = a.heading;
        if (play) play.session.trail && play.session.trail.reset(p.pos);
        break;
      }
      case 'rig': { const r = g.rig; if (a.dist != null) r.dist = a.dist; if (a.yaw != null) r.yaw = a.yaw; if (a.pitch != null) r.pitchOverride = a.pitch; if (a.pitch === null) r.pitchOverride = null; break; }
      case 'ui': this.setUi(a.mode); break;
      case 'hide': this.hide(a.what); break;
      case 'cue': this.cues.push({ t: this.t, kind: 'sound', name: a.name, gain: a.gain ?? 1, rate: a.rate ?? 1, delay: 0, loop: false, script: true }); break;
      case 'music': this.cues.push({ t: this.t, kind: 'music', tension: a.tension, gain: a.gain }); break;
      case 'mark': this.marks.push({ t: this.t, label: a.label }); break;
      case 'card': { const b = document.querySelector('.hub-card [data-choice="' + a.choice + '"]'); if (!b) throw new Error('no card choice ' + a.choice); b.click(); break; }
      case 'slot': {
        const li = document.querySelectorAll('.hub-slots li')[a.k];
        if (!li) throw new Error('no slot ' + a.k);
        const btns = li.querySelectorAll('button');
        for (let i = 0; i < (a.times ?? 1); i++) btns[a.dir < 0 ? 0 : btns.length - 1].click();
        break;
      }
      case 'forget': { const b = document.querySelectorAll('[data-forget]')[a.index ?? 0]; if (!b) throw new Error('no memory button'); b.click(); break; }
      case 'quality': g.setQuality(a.tier); break;
      case 'motion': g.setReducedMotion(!!a.reduce); break;
      default: throw new Error('unknown action ' + a.do);
    }
  }

  /**
   * One frame: scripted actions, then the game's own frame through the virtual clock, then the overlay.
   * Returns the shot time of the frame just rendered.
   */
  async step() {
    this.attach();
    this.wrapAudio();
    this.runActions();
    this.clock.step();
    await this.clock.settle(3);
    this.wrapAudio();
    if (this.overlay) this.overlay.update(this.t);
    for (const h of this.hidden) this.hide(h); // models that streamed in since bring their labels/nameplates back
    if (this.renderOn && this.t >= 0) {
      const cam = this.game.rig.camera;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      this.camLog.push([+this.t.toFixed(4), ...cam.position.toArray().map((v) => +v.toFixed(3)), ...right.toArray().map((v) => +v.toFixed(4))]);
    }
    const t = this.t;
    this.t += 1 / this.clock.fps;
    this.frame++;
    return t;
  }

  /** Steps virtual time until a predicate holds (or `maxFrames` pass); used before capture starts. */
  async until(name, value, maxFrames = 600) {
    for (let i = 0; i < maxFrames; i++) {
      if (this.test(name, value)) return true;
      await this.step();
    }
    return this.test(name, value);
  }

  /**
   * Pre-loads every placed model, the clan agents and the Guests before capture. Loads complete in wall
   * time, so this waits in wall time and spends virtual frames only to let the streamer plan the next
   * downloads (a plan runs every 0.25 virtual seconds; the timer is forced so one frame is enough).
   */
  async waitLoaded(maxMs = 240_000) {
    const start = this.clock.real.performanceNow();
    const g = this.game;
    const wait = (ms) => new Promise((r) => this.clock.real.setTimeout(r, ms));
    let frames = 0;
    for (;;) {
      if (this.play) for (const a of this.play.agents.agents.values()) if (a.state === 'absent') a.load();
      g.streamer.timer = 0;
      await this.step(); frames++;
      // Poll in wall time until the loads in flight settle (or two seconds pass), then plan again.
      for (let i = 0; i < 20; i++) {
        const s = g.streamer.stats();
        const agentsBusy = this.play ? this.play.agents.stats().some((a) => a.state === 'loading') : false;
        if (s.loading === 0 && s.idle === 0 && !agentsBusy) return { ok: true, frames, ms: this.clock.real.performanceNow() - start };
        if (s.loading === 0 && !agentsBusy) break; // idle ones need a new plan
        await wait(100);
      }
      if (this.clock.real.performanceNow() - start > maxMs) return { ok: false, frames, ms: this.clock.real.performanceNow() - start, streaming: g.streamer.stats() };
    }
  }

  /** Resets the shot clock to -preroll after the setup moved the game; cue logs restart from the live state. */
  rewind(preroll = 0) {
    this.t = -preroll; this.frame = 0; this.cues = []; this.marks = []; this.camLog = [];
    for (const a of this.actions) a.done = false;
    const p = this.play, o = p && p.session.obs;
    if (o) this.cues.push({ t: this.t, kind: 'tension', tension: o.season.tension });
    if (p) this.cues.push({ t: this.t, kind: 'zone', zone: p.zone === 'shell' ? 'shell' : zoneGuess(this.game.player.pos) });
  }

  /** Turns rendering on or off (setup replays run with it off: a frame then costs milliseconds, not seconds). */
  setRender(on) { this.renderOn = !!on; }

  /**
   * Runs a shot's `setup` list before capture with rendering off: actions, `{do:'until', pred, value, max}` and
   * `{do:'frames', n}` steps. Returns the number of virtual frames spent.
   */
  async setup(list = []) {
    const wasOn = this.renderOn;
    this.renderOn = false;
    let frames = 0;
    for (const s of list) {
      if (s.do === 'until') { const before = this.frame; await this.until(s.pred, s.value, s.max ?? 900); frames += this.frame - before; if (!this.test(s.pred, s.value)) this.errors.push('setup: ' + s.pred + ' never became true'); }
      else if (s.do === 'frames') { for (let i = 0; i < s.n; i++) await this.step(); frames += s.n; }
      else { this.perform(s); await this.step(); frames++; }
    }
    this.renderOn = wasOn;
    return frames;
  }

  state() {
    const o = this.play && this.play.session.obs;
    return {
      name: this.name, shot: this.shot && this.shot.name, t: this.t, frame: this.frame, play: !!this.play,
      zone: this.play ? this.play.zone : null, trial: o ? o.season.tick : null, silk: o ? o.iris.silk : null,
      streaming: this.game ? this.game.streamer.stats() : null, cues: this.cues.length, errors: this.errors.slice(),
      camera: this.pose ? { pos: this.camState.pos.toArray(), look: this.camState.look.toArray(), fov: this.camState.fov } : 'rig',
      drawCalls: this.game ? this.game.renderer.info.render.calls : 0, contextLost: !!this.contextLost,
    };
  }
}

const KEY_NAMES = { KeyE: 'e', KeyF: 'f', KeyM: 'm', KeyV: 'v', KeyT: 't', KeyH: 'h', KeyL: 'l', KeyG: 'g', KeyI: 'i', KeyR: 'r', Escape: 'Escape', ShiftLeft: 'Shift', KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', F3: 'F3' };
function keyFor(code) { if (KEY_NAMES[code]) return KEY_NAMES[code]; const m = /^Digit(\d)$/.exec(code); return m ? m[1] : code; }

/** Rough zone for the first mix cue before presentation.js sets one (plaza/camps/balcony/bridge). */
function zoneGuess(pos) {
  const x = pos[0], z = pos[2], r = Math.hypot(x, z);
  if (r <= 9) return 'plaza';
  if (r > 40) return 'balcony';
  return 'bridge';
}
