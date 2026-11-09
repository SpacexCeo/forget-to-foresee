// The shot runner: takes a shot script (plain data, see docs/submission/trailer.md and the scripts in
// tools/capture/shots/), drives the game through the frame-stepped clock, moves the camera along the
// scripted path, fires the scripted actions at their times through the game's own input and UI, hides
// or shows the UI, drives the overlays and records every sound the game would have played (the cue
// log the capture tool mixes to picture). It only reaches the game through window.__ftf (main.js) and
// the public play API; it never evaluates a rule.
import * as THREE from 'three';
import { compileCamera } from './camera.js';
import { createLayers } from './layers.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { TIME_PRESETS } from '../render/sky.js';
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
  hubIdle: (g) => !!(g.play && g.play.hub && !g.play.hub.busy && !g.play.hub.advancing && !g.play.hub.transit),
  trial: (g, v) => !!(g.play && g.play.session.obs && g.play.session.obs.season.tick >= v),
  interiorReal: (g) => !!(g.play && g.play.shell.ready),
  loaded: (g) => { const s = g.streamer.stats(); return s.loading === 0 && s.idle === 0; },
  signsOpen: (g) => !!(g.play && g.play.worldHud && g.play.worldHud.hud && g.play.worldHud.hud.signs.isOpen()),
  goal: (g, v) => !!(g.play && g.play.session.goal && g.play.session.goal.id === v),
  spot: (g, v) => !!(g.play && g.play.session.spot && g.play.session.spot.kind === v),
  anchored: (g) => !!(g.play && g.play.session.obs && g.play.session.obs.iris.anchors.length),
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
      const seg = self.pose ? self.currentSegment() : null;
      if (seg && seg.pose) { ldUpdate(dt, self.camState.look, self.camState.pos.distanceTo(self.camState.look)); return; }
      ldUpdate(dt, focus, camDist);
    };
    // Nothing adaptive during a capture: the frame-time governor, the resolution step and quality changes would alter the
    // drawing-buffer size between frames (the owner saw it as black corner rectangles and brightness flicker).
    lookdev.governor = null;
    if (lookdev.pixelScale !== 1) lookdev.setPixelScale(1);
    lookdev.setPixelScale = () => {};
    const setQuality = lookdev.setQuality.bind(lookdev);
    lookdev.setQuality = (tier) => (self.allowQualityChange ? setQuality(tier) : lookdev.tier);
    const setSize = lookdev.setSize.bind(lookdev);
    lookdev.setSize = (w, h) => { if (w === window.innerWidth && h === window.innerHeight) setSize(w, h); };
    // The occlusion fader dithers Shells between the camera and the player; a scripted camera fades nothing (its subject is often a Shell).
    if (lookdev.fader && lookdev.fader.update) {
      const faderUpdate = lookdev.fader.update.bind(lookdev.fader);
      lookdev.fader.update = function (dt, focus) { const seg = self.pose ? self.currentSegment() : null; faderUpdate(dt, seg && seg.pose ? g.rig.camera.position : focus); };
    }
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

  /**
   * Puts the game's follow camera straight onto its target. The rig eases its focus and its collision pull-in
   * over seconds, so after a jump (a teleport, a flight, a relocation) it would otherwise sit inside Iris's
   * head or in the rock for a while; a cut must land on a settled frame.
   */
  snapCamera() {
    const rig = this.game && this.game.rig;
    if (!rig) return;
    rig.smoothFocus.set(0, 0, 0); // the rig treats a zero focus as "not started" and snaps to the target
    rig.actualDist = rig.dist;
  }

  /** The camera pose of the current shot time, applied after the rig has placed the game camera. */
  applyCamera() {
    if (!this.pose || !this.shot) return;
    const cam = this.game.rig.camera;
    const seg = this.currentSegment();
    if (!seg || !seg.pose) return; // the game's own camera for this segment
    const u = seg.to > seg.from ? Math.min(1, Math.max(0, (this.t - seg.from) / (seg.to - seg.from))) : 1;
    const pose = seg.pose(u);
    this.camState.pos.set(...pose.pos); this.camState.look.set(...pose.look); this.camState.fov = pose.fov;
    cam.position.copy(this.camState.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.camState.look);
    if (pose.roll) cam.rotateZ(pose.roll);
    if (Math.abs(cam.fov - pose.fov) > 1e-3) { cam.fov = pose.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld(true);
    if (this.dof && this.dof.world) this.dof.pass.uniforms.focus.value = cam.position.distanceTo(new THREE.Vector3(...this.dof.world));
  }

  /**
   * A live 'track' camera: compileCamera's pose around the target's estimated position (`at`), moved to where the
   * target really is this frame (Iris or a clan agent's head) and turned with its heading when `local` is set, so a
   * close-up keeps the face in frame while the agent walks or turns.
   */
  trackPose(spec) {
    const base = compileCamera(spec);
    const at = spec.at || [0, 0, 0];
    return (u) => {
      const p = base(u);
      const live = this.targetOf(spec.target);
      if (!live) return p;
      const rel = (v) => [v[0] - at[0], v[1] - at[1], v[2] - at[2]];
      let dp = rel(p.pos), dl = rel(p.look);
      if (spec.local) { const c = Math.cos(live.yaw), sn = Math.sin(live.yaw); const rot = (v) => [v[0] * c + v[2] * sn, v[1], -v[0] * sn + v[2] * c]; dp = rot(dp); dl = rot(dl); }
      return { ...p, pos: [live.pos[0] + dp[0], live.pos[1] + dp[1], live.pos[2] + dp[2]], look: [live.pos[0] + dl[0], live.pos[1] + dl[1], live.pos[2] + dl[2]] };
    };
  }

  /** A world point through this frame's camera, in 1920×1080 stage pixels: [x, y, in front of the camera]. */
  project(w) {
    const cam = this.game.rig.camera;
    cam.updateMatrixWorld();
    const v = new THREE.Vector3(w[0], w[1], w[2]).project(cam);
    return [(v.x + 1) / 2 * 1920, (1 - v.y) / 2 * 1080, v.z < 1 && Math.abs(v.x) < 1.6 && Math.abs(v.y) < 1.6];
  }

  /** Head position and heading (radians about +Y, 0 = facing +Z) of Iris or a clan agent. */
  targetOf(id) {
    const g = this.game, play = this.play;
    if (!g) return null;
    if (!id || id === 'iris') { const p = g.player.pos; return { pos: [p[0], p[1] + 1.4, p[2]], yaw: g.player.heading || 0 }; }
    const a = play && play.agents && play.agents.agents && play.agents.agents.get(id);
    if (!a || !a.root) return null;
    const r = a.root;
    return { pos: [r.position.x, r.position.y + 1.4, r.position.z], yaw: r.rotation.y };
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
    this.cues = []; this.marks = []; this.camLog = []; this.layerLog = [];
    const cam = shot.camera;
    const list = Array.isArray(cam) ? cam : cam ? [{ from: 0, to: shot.duration, ...cam }] : [];
    // Segments may mix the game's own camera (`type: 'rig'`, pose null) with scripted moves; the latest one that has started wins.
    // `from` / `to` of a segment are times; a push camera's `from` is its start position (an array), which must not be
    // read as the segment start (it was, so every push camera sat at its end pose from the first frame).
    const time = (v, d) => (typeof v === 'number' ? v : d);
    this.segments = list.map((c) => ({ from: time(c.from, 0), to: time(c.to, shot.duration), pose: c.type === 'track' ? this.trackPose(c) : compileCamera(c), spec: c }));
    this.pose = this.segments.some((s) => s.pose) ? true : null;
    this.actions = (shot.actions || []).map((a, i) => ({ ...a, id: i, done: false }));
    if (!this.overlay) this.overlay = createOverlay(document);
    this.overlay.set(shot.overlays || []);
    // With ?nolayers=1 (GPU plates for the CPU layers pass) the layers are not even mounted: the plate stays clean.
    if ((shot.layers || this.layers) && new URLSearchParams(location.search).get('nolayers') !== '1') { if (!this.layers) this.layers = createLayers(document); this.layers.set(shot.layers || []); }
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
    if (what === 'nameplates' && this.play) for (const a of this.play.agents.agents.values()) if (a.mind && a.mind.sprite) a.mind.sprite.visible = false;
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
      case 'keydown': window.dispatchEvent(new KeyboardEvent('keydown', { code: a.code, key: a.key || keyFor(a.code), bubbles: true })); break;
      case 'keyup': window.dispatchEvent(new KeyboardEvent('keyup', { code: a.code, key: a.key || keyFor(a.code), bubbles: true })); break;
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
        this.snapCamera();
        break;
      }
      case 'snap': this.snapCamera(); break;
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
      case 'forget': {
        // The Memories panel may be closed by the time the action fires (the M key in the setup can land while another
        // surface holds the panel arbiter, as on the 1080p GPU renders): open it directly, then pick the memory by kind
        // (`kind: 'call'`, the judge playthrough's shard 7) or by index, and click its "Forget it for a vision" button.
        const pick = () => {
          const mems = (play.session.obs && play.session.obs.memories) || [];
          const m = a.kind ? mems.find((x) => x.kind === a.kind) : mems[a.index ?? 0];
          return m ? document.querySelector(`[data-forget="${m.id}"]`) : null;
        };
        let b = pick();
        if (!b && play.ui.open) { play.ui.open('memory'); b = pick(); }
        if (!b) throw new Error(`no memory button (${a.kind ? 'kind ' + a.kind : 'index ' + (a.index ?? 0)}; memories: ${((play.session.obs && play.session.obs.memories) || []).map((x) => x.kind).join(',') || 'none'})`);
        this.marks.push({ t: this.t, label: 'forget ' + b.getAttribute('data-forget') });
        b.click(); break;
      }
      // Capture-only look (the jury video's dusk grade): a time-of-day preset and a mood tint, never the game's defaults.
      case 'look': {
        const ld = g.lookdev;
        if (a.preset) ld.setPreset(a.preset);
        if (a.atm) { const base = TIME_PRESETS[ld.preset]; ld.applyAtmosphere({ ...base, ...a.atm, fog: { ...base.fog, ...(a.atm.fog || {}) } }); }
        if (a.tint) ld.sky.tint(a.tint, a.amount ?? 0.3);
        break;
      }
      // Capture-only depth of field: a bokeh pass after the scene render, focused every frame on a world point.
      case 'dof': {
        const post = g.lookdev && g.lookdev.post;
        if (!post || !post.composer) break; // low tier / no post stack: no DOF (CPU drafts)
        if (this.dof) post.composer.removePass(this.dof.pass);
        const pass = new BokehPass(post.scene || g.scene, g.rig.camera, { focus: 3, aperture: a.aperture ?? 0.004, maxblur: a.maxblur ?? 0.012 });
        post.composer.insertPass(pass, 1);
        this.dof = { pass, world: a.world };
        break;
      }
      case 'quality': this.allowQualityChange = true; try { g.lookdev.setQuality(a.tier); } finally { this.allowQualityChange = false; } break;
      case 'motion': g.setReducedMotion(!!a.reduce); break;
      case 'guests': {
        // The Guests behind the glass (docs/guests-stage.md): seed, a moment (sign | reveal | crisis | vote | yes | no), warp, freeze.
        const gs = play && play.shell && play.shell.guests;
        if (!gs) throw new Error('no Guests stage (not inside a Shell?)');
        if (a.seed != null) gs.setSeed(a.seed);
        if (a.cue) gs.cue(a.cue, a.action ? { action: a.action } : {});
        if (a.warp) gs.warp(a.warp);
        if (a.freeze != null) gs.freeze(!!a.freeze);
        break;
      }
      default: throw new Error('unknown action ' + a.do);
    }
  }

  /**
   * Reads the finished frame out of the WebGL drawing buffer, in the same task as the render (the buffer is not
   * preserved across tasks: after the browser composites it, its content is undefined). Returns the PNG as a data
   * URL plus statistics for the capture's checks: mean luma, the fraction of black samples and the largest run of
   * fully black rows or columns at an edge (a partially drawn frame shows as a black corner rectangle).
   */
  grabCanvas({ noPng = false } = {}) {
    const renderer = this.game.renderer, gl = renderer.getContext(), canvas = renderer.domElement;
    const w = canvas.width, h = canvas.height;
    gl.finish();
    if (!this.pixels || this.pixels.length !== w * h * 4) this.pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    const px = this.pixels, cols = 48, rows = 27;
    const grid = new Float32Array(cols * rows);
    let sum = 0, black = 0;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = Math.floor((i + 0.5) * w / cols), y = Math.floor((j + 0.5) * h / rows);
      const o = (y * w + x) * 4;
      const l = 0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2];
      grid[j * cols + i] = l; sum += l; if (l < 8) black++;
    }
    const rowBlack = (j) => { for (let i = 0; i < cols; i++) if (grid[j * cols + i] >= 8) return false; return true; };
    const colBlack = (i) => { for (let j = 0; j < rows; j++) if (grid[j * cols + i] >= 8) return false; return true; };
    let top = 0, bottom = 0, left = 0, right = 0;
    while (top < rows && rowBlack(top)) top++;
    while (bottom < rows - top && rowBlack(rows - 1 - bottom)) bottom++;
    while (left < cols && colBlack(left)) left++;
    while (right < cols - left && colBlack(cols - 1 - right)) right++;
    const edgeBlack = Math.max(top / rows, bottom / rows, left / cols, right / cols);
    // Where the black region is (grid cells, for the probe): the bounding box of black cells.
    let bx0 = cols, by0 = rows, bx1 = -1, by1 = -1;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (grid[j * cols + i] < 8) { bx0 = Math.min(bx0, i); by0 = Math.min(by0, j); bx1 = Math.max(bx1, i); by1 = Math.max(by1, j); }
    const stats = { mean: sum / (cols * rows), black: black / (cols * rows), edgeBlack, edges: { top, bottom, left, right }, blackBox: bx1 < 0 ? null : [bx0, by0, bx1, by1], width: w, height: h, lost: gl.isContextLost() };
    const png = noPng ? null : canvas.toDataURL('image/png');
    return { png, stats };
  }

  /** Renders the current frame again (same virtual time, same state) and reads it: the retry for a flagged grab. */
  regrab() {
    const t = this.t - 1 / this.clock.fps; // step() has already moved the shot clock to the next frame
    const keep = this.t; this.t = t;
    try { this.applyCamera(); this.game.lookdev.render(); return { t, ...this.grabCanvas() }; } finally { this.t = keep; }
  }

  /**
   * GPU diagnosis for a frame already rendered: the sizes of canvas, drawing buffer and every post target, then the
   * same frame re-rendered with each post pass switched off in turn (and with no post stack), with the frame statistics
   * of each variant. A pass whose removal clears a black region is the culprit. Restores every pass afterwards.
   */
  probe({ png = false } = {}) {
    const g = this.game, r = g.renderer, gl = r.getContext(), post = g.lookdev.post;
    const sz = (t) => (t ? [t.width, t.height, t.samples || 0, t.texture && t.texture.type] : null);
    const sizes = {
      canvas: [r.domElement.width, r.domElement.height], css: [r.domElement.clientWidth, r.domElement.clientHeight],
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], pixelRatio: r.getPixelRatio(), dpr: window.devicePixelRatio,
      inner: [window.innerWidth, window.innerHeight], target: sz(post.target),
    };
    if (post.composer) {
      sizes.read = sz(post.composer.readBuffer); sizes.write = sz(post.composer.writeBuffer);
      sizes.passes = post.composer.passes.map((p) => ({ name: p.constructor.name, enabled: p.enabled, rts: Object.entries(p).filter(([, v]) => v && v.isWebGLRenderTarget).map(([k, v]) => [k, ...sz(v)]) }));
      const bloom = post.passes.bloom; if (bloom && bloom.renderTargetsHorizontal) sizes.bloomMips = bloom.renderTargetsHorizontal.map((t) => [t.width, t.height]);
    }
    const variants = [];
    const run = (name, fn) => {
      const undo = fn();
      try { g.lookdev.render(); const { png: p, stats } = this.grabCanvas({ noPng: !png }); variants.push({ name, stats, png: p }); }
      catch (e) { variants.push({ name, error: String(e && e.message) }); }
      finally { if (undo) undo(); }
    };
    run('rerender', () => null);
    const names = new Map(Object.entries(post.passes).filter(([, p]) => p).map(([k, p]) => [p, k]));
    if (post.composer) for (const p of post.composer.passes) {
      const k = names.get(p) || p.constructor.name.replace(/^_/, '').replace(/Pass$/, '').toLowerCase();
      if (k === 'render' || k === 'output' || !p.enabled) continue;
      run('no-' + k, () => { p.enabled = false; return () => { p.enabled = true; }; });
    }
    if (post.composer) run('no-post', () => { const c = post.composer; post.composer = null; return () => { post.composer = c; }; });
    g.lookdev.render();
    return { sizes, variants, info: { calls: r.info.render.calls, triangles: r.info.render.triangles, programs: r.info.programs ? r.info.programs.length : null } };
  }

  /**
   * One frame: scripted actions, then the game's own frame through the virtual clock, the frame grab (same task),
   * then the overlay. Returns the shot time of the frame just rendered, with the grab when asked for.
   */
  async step({ grab = false } = {}) {
    this.attach();
    this.wrapAudio();
    this.runActions();
    const before = this.game ? this.game.player.pos.slice() : null;
    this.clock.step();
    if (before) {
      const after = this.game.player.pos;
      if (Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]) > 5) { this.snapCamera(); this.game.rig.update(0, new THREE.Vector3(after[0], after[1] + 1.1, after[2])); this.game.lookdev.render(); }
    }
    const grabbed = grab && this.renderOn && this.game ? this.grabCanvas() : null;
    await this.clock.settle(3);
    this.wrapAudio();
    if (this.overlay) this.overlay.update(this.t);
    const noLayers = new URLSearchParams(location.search).get('nolayers') === '1';
    if (this.layers && this.game && !noLayers) this.layers.update(this.t, (w) => this.project(w), (id) => this.targetOf(id));
    // The camera of every captured frame (view-projection, column-major) and the tracked heads: the CPU layers pass
    // (tools/capture/layers-pass.mjs) redraws the layers from this record over clean GPU plates.
    if (this.shot && this.shot.layers && this.renderOn && this.t >= 0 && this.game) {
      const cam = this.game.rig.camera; cam.updateMatrixWorld();
      const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements.map((v) => +v.toPrecision(9));
      const ids = [...new Set(this.shot.layers.flatMap((l) => [l.target, l.aTarget, l.bTarget]).filter(Boolean))];
      const targets = Object.fromEntries(ids.map((id) => [id, (this.targetOf(id) || {}).pos]).filter(([, p]) => p));
      this.layerLog.push({ t: +this.t.toFixed(5), vp, targets });
    }
    for (const h of this.hidden) this.hide(h); // models that streamed in since bring their labels/nameplates back
    if (this.renderOn && this.t >= 0) {
      const cam = this.game.rig.camera;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      this.camLog.push([+this.t.toFixed(4), ...cam.position.toArray().map((v) => +v.toFixed(3)), ...right.toArray().map((v) => +v.toFixed(4))]);
    }
    const t = this.t;
    this.t += 1 / this.clock.fps;
    this.frame++;
    return grabbed ? { t, ...grabbed } : t;
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

  /**
   * Waits (wall time, stepping frames) until the Shell is active and its Guests are built and loaded, so a shot that
   * drives them never starts on a missing stage. Returns {ok, frames, ms, why}.
   */
  async waitGuests(maxMs = 120_000) {
    const start = this.clock.real.performanceNow();
    const wait = (ms) => new Promise((r) => this.clock.real.setTimeout(r, ms));
    let frames = 0, why = 'no play';
    for (;;) {
      const p = this.play, gs = p && p.shell && p.shell.guests;
      why = !p ? 'no play' : p.zone !== 'shell' ? 'not inside a Shell (zone ' + p.zone + ')' : !p.shell.ready ? 'Shell interior not ready' : !gs ? 'no Guests handle' : !gs.loaded ? 'Guest models not loaded' : null;
      if (!why) return { ok: true, frames, ms: this.clock.real.performanceNow() - start };
      if (this.clock.real.performanceNow() - start > maxMs) return { ok: false, frames, ms: this.clock.real.performanceNow() - start, why };
      await this.step(); frames++;
      await wait(100);
    }
  }

  /** Resets the shot clock to -preroll after the setup moved the game; cue logs restart from the live state. */
  rewind(preroll = 0) {
    this.t = -preroll; this.frame = 0; this.cues = []; this.marks = []; this.camLog = []; this.layerLog = [];
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
      camera: (() => { const seg = this.pose && this.currentSegment(); return seg && seg.pose ? { pos: this.camState.pos.toArray(), look: this.camState.look.toArray(), fov: this.camState.fov } : 'rig'; })(),
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
