// Performs a chapter film (play/chapters.js buildFilm) in the running 3D client: takes the camera for the
// film's length, holds Iris where she stands, visits the Shell interior for interior shots, poses the clan
// agents named by a shot, speaks the narrator line (Task Q's narration, when present) and shows it as a
// subtitle, plays the shot's sound cue from the game's own audio, and hands the camera back when the film
// ends or is skipped (hold a key or a finger for SKIP_HOLD_MS; a tap on the final card ends it).
// Presentation only: it never sends a command and never reads a rule. The frame-stepped capture clock of
// the trailer (src/cinematic/clock.js) drives it like any other animation, so the trailer can cut from it.
import * as THREE from 'three';
import { compileShotCamera } from './shot-camera.js';
import { TITLE_SECONDS, CARD_SECONDS, SKIP_HOLD_MS } from '../../play/chapters.js';
import { REACTION_SECONDS } from '../../play/behaviour.js';

/** Where each shot starts and ends on the film clock (seconds); the title overlaps the first shot. */
export function timeline(film) {
  const shots = [];
  let t = 0;
  film.shots.forEach((s, i) => {
    const len = s.seconds + (i === 0 ? TITLE_SECONDS : 0);
    shots.push({ index: i, start: t, end: t + len });
    t += len;
  });
  return { shots, titleEnd: TITLE_SECONDS, cardStart: t, end: t + CARD_SECONDS };
}

/** The shot index at film time t (the last shot keeps running under the final card). */
export function shotAt(tl, t) {
  if (t < 0) return 0;
  for (const s of tl.shots) if (t < s.end) return s.index;
  return tl.shots.length - 1;
}

/**
 * @param {object} o
 * @param {THREE.Camera} o.camera  @param {object} o.player CharacterController  @param {THREE.Object3D} o.avatar
 * @param {object} o.shell Shell interior scene (scenes/shell.js)  @param {object} o.agents ClanAgents
 * @param {object} o.overlay createFilmOverlay()  @param {() => number} o.now the play layer's clock (seconds)
 * @param {{audio?: object}} [o.hooks] play hooks (for `audio.play`)
 * @param {object|null} [o.narration] Task Q's narration ({speak, cancel}) or null
 * @param {(line:{key,args}) => string} o.renderLine  renders a narrator line in the UI language
 * @param {{title: string, matters: string, hold: string, skip: string, cont: string}} o.texts rendered UI texts (per film)
 * @param {object} [o.guests] optional Guests stage (Task O): `cue(moment, {force})`
 * @param {Window} [o.win]  @param {() => number} [o.wall] wall-clock milliseconds for the skip hold
 */
export function createFilmPlayer({ camera, player, avatar, shell, agents, overlay, now, hooks = {}, narration = null, renderLine, texts = () => ({}), guests = null, win = globalThis.window, wall = () => (globalThis.performance ? globalThis.performance.now() : Date.now()) }) {
  let film = null, tl = null, t = 0, shotIndex = -1, pose = null, paused = false, resolveEnd = null;
  let pin = null, shellWasActive = false, shellActivated = 0, hold = null;
  const _look = new THREE.Vector3();

  const audio = () => hooks.audio || null;

  function liveIris() { return { position: [avatar.position.x, avatar.position.y, avatar.position.z], heading: player.heading || 0 }; }
  function liveInterior(n) {
    if (shell.active !== true && !shellActivated) { shell.activate(n); shellActivated = n; }
    const sp = shell.spawn();
    const glyph = shell.root.getObjectByName('logogram_on_glass');
    let glass = null;
    if (glyph) { glyph.updateWorldMatrix(true, false); glass = glyph.getWorldPosition(new THREE.Vector3()).toArray(); }
    else glass = [shell.origin[0], shell.origin[1] + 4, shell.origin[2] - 8];
    return { spawn: sp.pos, glass };
  }

  function startShot(i) {
    shotIndex = i;
    const s = film.shots[i];
    pose = compileShotCamera(s.cam, { iris: liveIris, interior: liveInterior }, { frozen: !!film.reducedMotion });
    if (s.cam.kind === 'interior' && s.cam.sign) { try { shell.setSign({ forms: s.cam.sign.forms, dots: s.cam.sign.dots }, now()); } catch { /* presentation */ } }
    if (s.cam.kind === 'interior' && guests && guests.cue) { try { guests.cue(film.id === 'crisis' ? 'crisis' : film.id === 'vote' ? 'vote' : 'sign', { force: true }); } catch { /* optional */ } }
    if (s.actors && s.actors.length && agents && agents.react) {
      const map = {};
      for (const a of s.actors) map[a.clan] = { clip: a.clip, until: now() + Math.max(s.seconds, REACTION_SECONDS[a.clip] || 4) };
      try { agents.react(map); } catch { /* optional */ }
    }
    const text = renderLine(s.line);
    overlay.setSubtitle(text);
    const a = audio();
    if (s.cue && a) { try { a.play(s.cue, { gain: 0.8 }); } catch { /* audio is optional */ } }
    speak(text);
  }

  /** The clan agents' mind glyphs are HUD, not world: hidden while a film plays. */
  function setNameplates(on) {
    if (!agents || !agents.agents) return;
    try { for (const a of agents.agents.values()) if (a.mind && a.mind.sprite) a.mind.sprite.visible = on; } catch { /* optional */ }
  }

  function speak(text) {
    if (!narration || !text) return;
    try { if (typeof narration.enabled !== 'function' || narration.enabled()) narration.speak(text, { channel: 'film', interrupt: true }); } catch { /* optional */ }
  }

  function applyCamera() {
    if (!pose || !tl) return;
    const seg = tl.shots[shotIndex];
    const u = seg.end > seg.start ? Math.min(1, Math.max(0, (t - seg.start) / (seg.end - seg.start))) : 1;
    const p = pose(u);
    camera.position.set(p.pos[0], p.pos[1], p.pos[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(_look.set(p.look[0], p.look[1], p.look[2]));
    if (p.roll) camera.rotateZ(p.roll);
    if (Math.abs(camera.fov - p.fov) > 1e-3) { camera.fov = p.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(true);
  }

  /** Iris stays exactly where the film found her: any input during the film is undone each frame. */
  function pinIris() {
    if (!pin) return;
    player.pos = pin.pos.slice(); player.prevPos = pin.pos.slice(); player.vel = [0, 0]; player.vy = 0; player.heading = pin.heading;
    if ('speed' in player) player.speed = 0;
    avatar.position.set(pin.pos[0], pin.pos[1], pin.pos[2]);
    avatar.rotation.y = pin.heading;
  }

  function finish(skipped) {
    if (!film) return;
    const done = resolveEnd;
    if (hold) clearTimeout(hold.timer);
    film = null; tl = null; pose = null; shotIndex = -1; hold = null;
    setNameplates(true);
    pinIris(); pin = null;
    if (shellActivated && !shellWasActive) { try { shell.deactivate(); } catch { /* ok */ } }
    shellActivated = 0;
    overlay.hide();
    if (skipped && narration) { try { narration.cancel(); } catch { /* ok */ } }
    detachInput();
    resolveEnd = null;
    if (done) done({ skipped });
  }

  /* ---- hold-to-skip input: capture phase on the window, so the game's own listeners never see it ---- */
  const isModifier = (code) => /^(Shift|Control|Alt|Meta|CapsLock|F\d+$)/.test(code || '');
  function onKeyDown(e) {
    if (!film || e.repeat || isModifier(e.code)) { if (film && !isModifier(e.code)) e.preventDefault(); return; }
    e.preventDefault(); e.stopImmediatePropagation();
    beginHold('key:' + e.code);
  }
  function onKeyUp(e) { if (!film) return; e.preventDefault(); e.stopImmediatePropagation(); endHold('key:' + e.code); }
  function onPointerDown(e) { if (!film) return; e.preventDefault(); e.stopImmediatePropagation(); beginHold('pointer'); }
  function onPointerUp(e) { if (!film) return; e.preventDefault(); e.stopImmediatePropagation(); endHold('pointer'); }
  function beginHold(id) {
    if (hold) return;
    if (t >= tl.cardStart) { finish(false); return; } // a tap on the final card ends the film
    hold = { id, since: wall() }; // wall time: a slow renderer must not make the hold longer
    const mine = hold;
    hold.timer = setTimeout(() => { if (hold === mine && film) finish(true); }, SKIP_HOLD_MS + 20); // frames may be rare: the hold still completes
    overlay.showSkip(t);
  }
  function endHold(id) {
    if (!hold || hold.id !== id) return;
    const held = wall() - hold.since;
    clearTimeout(hold.timer);
    hold = null;
    if (held < SKIP_HOLD_MS) overlay.showHint(t);
  }
  function attachInput() {
    if (!win || !win.addEventListener) return;
    win.addEventListener('keydown', onKeyDown, true); win.addEventListener('keyup', onKeyUp, true);
    win.addEventListener('pointerdown', onPointerDown, true); win.addEventListener('pointerup', onPointerUp, true);
    win.addEventListener('pointercancel', onPointerUp, true);
  }
  function detachInput() {
    if (!win || !win.removeEventListener) return;
    win.removeEventListener('keydown', onKeyDown, true); win.removeEventListener('keyup', onKeyUp, true);
    win.removeEventListener('pointerdown', onPointerDown, true); win.removeEventListener('pointerup', onPointerUp, true);
    win.removeEventListener('pointercancel', onPointerUp, true);
  }

  return {
    get playing() { return !!film; },
    get film() { return film; },
    get time() { return t; },
    get paused() { return paused; },
    get shotIndex() { return shotIndex; },
    timeline: () => tl,
    /**
     * Plays a film; resolves {skipped} when it ends. `paused` starts it frozen at t = 0 for still frames
     * (`seek`/`pause` are the capture API).
     */
    play(f, { paused: startPaused = false } = {}) {
      if (film) finish(true);
      film = f; tl = timeline(f); t = 0; paused = !!startPaused; shotIndex = -1;
      pin = { pos: player.pos.slice(), heading: player.heading || 0 };
      shellWasActive = !!shell.active;
      const tx = texts(f);
      overlay.setSkipText(tx.skip || ''); overlay.setHintText(tx.hold || '');
      overlay.show({ eyebrowText: tx.chapter || '', titleText: tx.title || '', cardEyebrow: tx.matters || '', cardText: renderLine(f.card), shots: f.shots.length });
      attachInput();
      setNameplates(false);
      startShot(0);
      applyCamera();
      overlay.update(frameState());
      return new Promise((r) => { resolveEnd = r; });
    },
    /** Per frame, after the camera rig placed the game camera and before the render. */
    update(dt) {
      if (!film) return;
      if (!paused) t += dt;
      const i = shotAt(tl, t);
      if (i !== shotIndex) startShot(i);
      pinIris();
      setNameplates(false); // agents that streamed in since bring their glyphs back
      applyCamera();
      if (hold && wall() - hold.since >= SKIP_HOLD_MS) { finish(true); return; }
      if (t >= tl.end + 0.35) { finish(false); return; }
      overlay.update(frameState());
    },
    /** Every key is swallowed while a film plays (the hold logic lives on the window listeners). */
    handleKey() { return !!film; },
    skip() { finish(true); },
    pause(on = true) { paused = !!on; },
    /** Capture API: jumps to a film time and applies that frame (shots start as needed). */
    seek(seconds) {
      if (!film) return;
      t = Math.max(0, Math.min(tl.end, seconds));
      const i = shotAt(tl, t);
      if (i !== shotIndex) startShot(i);
      pinIris(); applyCamera(); overlay.update(frameState());
    },
    destroy() { finish(true); },
  };

  function frameState() {
    const seg = tl.shots[Math.max(0, shotIndex)];
    return { t, titleEnd: tl.titleEnd, shotIndex, shotStart: seg.start, shotEnd: seg.end, cardStart: tl.cardStart, end: tl.end, hold: hold ? (wall() - hold.since) / SKIP_HOLD_MS : 0 };
  }
}
