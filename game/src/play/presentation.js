// World-driven presentation: the parts of audio and VFX that follow the world state every frame rather
// than a single room event (play/hooks.js handles those). Mist and the crack pulse under the Shells, one
// hum per Shell, the tension singleton with its sky tint, the Guest's sign drawn on the glass as ink,
// footsteps for Iris and the clan agents by surface, the ambience zone, UI clicks, and keeping the VFX
// system attached to the look-dev post stack across quality changes and reduced motion. Presentation
// only: nothing here reads or changes a rule (spec §2). Every call into the optional modules is guarded.
import * as THREE from 'three';
import { zoneAt } from '../audio/mix.js';
import { surfaceAt, StepMeter, tensionLevel, humPositions, npcStepGain, vfxTierFor } from './ambience.js';
import { momentForCue, stageQualityFor } from './guests-stage.js';

const PRELOAD = ['step_stone', 'step_wood', 'step_grass', 'step_glass', 'ui_click', 'ui_confirm', 'ui_error', 'ui_notify', 'anchor_plant', 'gift_chime'];
const NPC_MAX_SPEED = 6; // faster than this is a snap, not a walk

/**
 * @param {object} o
 * @param {import('./hooks.js').Hooks} o.hooks  @param {THREE.Scene} o.scene  @param {object} o.world3d island scene
 * @param {object} o.shell Shell interior scene  @param {object} o.lookdev  @param {object} o.agents ClanAgents
 * @param {object} o.player CharacterController  @param {HTMLElement} o.uiRoot  @param {object} o.session PlaySession
 * @param {object} [o.rig] CameraRig for the Guests' framing hint (falls back to the debug handle `window.__ftf.rig`)
 */
export function attachPresentation({ hooks, scene, world3d, shell, lookdev, agents, player, uiRoot, session, rig = null }) {
  let vfx = null, audio = null;
  // The Guests behind the glass (play/guests-stage.js, scenes/shell.js): cues, season seed, quality, sound swell, camera hint.
  const guestsPart = createGuestsPresentation({ hooks, shell, session, lookdev, rig });
  const loops = { mists: [], crack: null, tension: null, glass: null };
  let lastReduced = null, lastTier = null, unsubQuality = null, preloaded = false;
  const irisSteps = new StepMeter();
  const npcSteps = new Map();
  const base = { fog: null, hemi: null };
  const _v = new THREE.Vector3(), _c = new THREE.Color();
  let zone = 'island', sign = null, crackMats = null, crackReal = null;
  const counters = { irisSteps: 0, npcSteps: 0, glassSigns: 0 };

  /** `vfx.hooks.skyTint`: a sky hook when the look-dev offers one, else a restrained warm shift of fog and fill. */
  function skyTint(hex, amount) {
    const k = Math.min(1, Math.max(0, +amount || 0));
    try {
      if (lookdev.sky && typeof lookdev.sky.tint === 'function') { lookdev.sky.tint(hex, k); return; }
      _c.setHex(hex);
      if (scene.fog && scene.fog.color) { if (!base.fog) base.fog = scene.fog.color.clone(); scene.fog.color.copy(base.fog).lerp(_c, k * 0.35); }
      if (lookdev.hemi && lookdev.hemi.color) { if (!base.hemi) base.hemi = lookdev.hemi.color.clone(); lookdev.hemi.color.copy(base.hemi).lerp(_c, k * 0.5); }
    } catch { /* presentation only */ }
  }

  /** After every tier change the post stack is rebuilt: re-insert the VFX pass (null composer on the low tier). */
  function attachComposer() {
    if (!vfx) return;
    lastTier = lookdev.tier;
    try {
      vfx.attachToComposer(null);
      vfx.setQuality(vfxTierFor(lookdev)); // phones: always the low VFX preset (docs/mobile.md)
      vfx.attachToComposer(lookdev.post && lookdev.post.composer ? lookdev.post.composer : null);
    } catch (e) { console.warn('[play] vfx composer attach failed', e); }
  }

  /** Shell IV's crack: the real model's glowing materials breathe with the pulse (none found: the light alone). */
  function pulseCrack(iv, level) {
    const real = iv.instance.real;
    if (real !== crackReal) {
      crackReal = real; crackMats = [];
      if (real) real.traverse((o) => { if (o.isMesh && o.material && 'emissiveIntensity' in o.material && /crack|glow|emit|core/i.test(o.material.name || o.name || '')) crackMats.push(o.material); });
    }
    for (const m of crackMats) m.emissiveIntensity = 0.4 + 1.6 * level;
  }

  function startWorldLoops() {
    const shells = (world3d && world3d.shells) || [];
    for (const s of shells) { try { loops.mists.push(vfx.play('shell_mist', { follow: s.instance.root })); } catch (e) { console.warn('[play] shell_mist', e); } }
    const iv = shells.find((s) => s.index === 3);
    if (iv) {
      try {
        // The crack runs along rib lines on the venter of the last whorl: a point on the Shell's front, mid-height.
        const anchor = new THREE.Object3D(); anchor.name = 'shell_iv_crack';
        anchor.position.set(0, iv.instance.def.height * 0.45, iv.instance.def.radius * 0.45);
        iv.instance.root.add(anchor);
        loops.crack = vfx.play('shell_crack_pulse', { follow: anchor, crackDir: [0.2, 0.95, 0.25], crackLength: 5, onPulse: (lv) => pulseCrack(iv, lv) });
      } catch (e) { console.warn('[play] shell_crack_pulse', e); }
    }
  }

  function showGlassSign() {
    if (loops.glass) { try { loops.glass.stop(); } catch { /* ok */ } loops.glass = null; }
    if (!vfx || !sign || zone !== 'shell' || !shell || !shell.root) return;
    const glyph = shell.root.getObjectByName('logogram_on_glass');
    if (!glyph) return;
    try {
      glyph.updateWorldMatrix(true, false);
      const p = glyph.getWorldPosition(_v); p.z += 0.12;            // a hair in front of the canvas glyph, toward the visitor
      const radius = 3.2 * glyph.scale.x;                              // the glyph plane is 6.4 m wide before scaling
      const seed = sign.forms.reduce((a, f, i) => a + f * (i + 1), 1) + sign.dots * 7;
      loops.glass = vfx.play('logogram', { position: p.toArray(), forms: sign.forms, dots: sign.dots, normal: [0, 0, 1], scale: radius / 1.2, seed });
      counters.glassSigns++;
    } catch (e) { console.warn('[play] logogram on glass', e); }
  }

  function onUiClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    const b = t.closest('button, [role="button"], [role="tab"], a[href]');
    if (b && !b.disabled) hooks.play('ui_click');
  }
  if (uiRoot && uiRoot.addEventListener) uiRoot.addEventListener('click', onUiClick);

  const api = {
    attachVfx(v) {
      vfx = v || null;
      if (!vfx) return;
      vfx.hooks.skyTint = skyTint;
      attachComposer();
      if (lookdev.onQualityChange) unsubQuality = lookdev.onQualityChange(() => attachComposer());
      startWorldLoops();
      showGlassSign();
    },
    attachAudio(a) {
      audio = a || null;
      if (!audio) return;
      try { audio.setShellHums(humPositions()); } catch (e) { console.warn('[play] shell hums', e); }
      guestsPart.attachAudio(audio);
    },
    /** The sign the Guest draws on the glass ({forms, dots} or null); drawn as ink when Iris is inside. */
    setSign(next) {
      const same = (!next && !sign) || (next && sign && next.forms.join() === sign.forms.join() && next.dots === sign.dots);
      if (same) return;
      sign = next ? { forms: next.forms.slice(), dots: next.dots } : null;
      showGlassSign();
    },
    /** 'island' | 'shell' from the play layer's zone changes. */
    onZone(z) {
      zone = z;
      irisSteps.reset();
      showGlassSign();
      guestsPart.onZone(z);
    },
    /** Per frame after the agents moved and before the render. */
    update(dt, { focus, inShell = false, speed = 0, running = false } = {}) {
      if (vfx) {
        try {
          if (lookdev.reducedMotion !== lastReduced) { lastReduced = lookdev.reducedMotion; vfx.setReducedMotion(lastReduced); }
          if (lookdev.tier !== lastTier) attachComposer();
          const o = session.obs;
          const level = o ? tensionLevel(o.season.tension) : 0;
          if (level > 0) {
            if (!loops.tension || loops.tension.done) loops.tension = vfx.play('tension', { level, position: focus });
            else loops.tension.set({ level, position: focus });
          } else if (loops.tension) { loops.tension.stop(); loops.tension = null; }
        } catch (e) { console.warn('[play] vfx frame', e); }
      }
      if (audio) {
        try {
          if (!preloaded && audio.state.unlocked) { preloaded = true; audio.preload(PRELOAD); }
          const z = inShell ? 'shell' : zoneAt(player.pos);
          audio.setZone(z);
          if (irisSteps.advance(dt, speed, running)) { counters.irisSteps++; audio.play('step_' + surfaceAt(player.pos, z), { gain: running ? 0.9 : 0.7 }); }
          if (!inShell && agents && agents.agents) {
            for (const a of agents.agents.values()) {
              let m = npcSteps.get(a); if (!m) npcSteps.set(a, m = new StepMeter());
              const sp = a.speed > NPC_MAX_SPEED ? 0 : a.speed || 0;
              if (!m.advance(dt, sp)) continue;
              const g = npcStepGain(focus ? focus.distanceTo(a.root.position) : 0);
              if (g > 0) { counters.npcSteps++; audio.play('step_' + surfaceAt(a.root.position.toArray()), { pos: a.root.position.toArray(), gain: g }); }
            }
          }
        } catch (e) { console.warn('[play] audio frame', e); }
      }
      guestsPart.update(dt, { inShell, focus });
    },
    /** Numbers for QA and the console (window.__ftf.play.presentation.state()). */
    state() {
      return { zone, sign: !!sign, guests: guestsPart.state(), mists: loops.mists.filter((h) => !h.done).length, crack: !!loops.crack && !loops.crack.done, tension: loops.tension ? loops.tension.done ? 0 : (session.obs ? tensionLevel(session.obs.season.tension) : 0) : 0, glass: !!loops.glass && !loops.glass.done, tier: lastTier, reducedMotion: lastReduced, ...counters, hums: audio ? audio.state.hums : 0 };
    },
    dispose() {
      if (uiRoot && uiRoot.removeEventListener) uiRoot.removeEventListener('click', onUiClick);
      if (unsubQuality) unsubQuality();
      for (const h of [...loops.mists, loops.crack, loops.tension, loops.glass]) { try { h && h.stop(); } catch { /* ok */ } }
      loops.mists = []; loops.crack = loops.tension = loops.glass = null;
      if (vfx) vfx.hooks.skyTint = null;
      skyTint(0, 0);
      guestsPart.dispose();
    },
  };
  return api;
}

/** Camera hint amplitudes at full weight: the key-art shot (Iris small, the glass, the silhouettes). */
const GUEST_CAMERA = Object.freeze({ pitch: -6 * Math.PI / 180, dist: 1.6, yawShare: 0.5, maxDist: 12, yawArc: 2.1 });
/** The low presence behind the glass: the Shell hum an octave down, swelling with the emergence. */
const GUEST_SWELL = Object.freeze({ sound: 'amb_shell_hum', rate: 0.5, gain: 0.9 });

/**
 * The Guest part of the presentation (Task O). Routes the room cues to the stage (`momentForCue`),
 * seeds the stage with the season's Merkle root, follows the look-dev quality and reduced motion,
 * swells a low hum with the emergence, and eases the camera toward the key-art framing while a
 * Guest is at the glass. The hint only adds increments (and removes exactly what it added), so the
 * player's own camera moves are never overridden; under reduced motion the hint is off.
 */
export function createGuestsPresentation({ hooks, shell, session, lookdev, rig = null }) {
  const g = () => (shell && shell.guests) || null;
  let audio = null, swell = null, lastQ = null, seed = null, prevW = 0, yawTotal = 0, inside = false;
  const applied = { pitch: 0, dist: 0, yaw: 0 };
  const seedOf = () => { const s = session && session.obs && session.obs.season; return s ? String(s.merkleRoot || s.seasonId || 'season') : 'season'; };
  const reseed = () => { const next = seedOf(); if (next !== seed && g()) { seed = next; g().setSeed(seed); } };
  reseed();
  const unsubObs = session && session.on ? session.on('obs', reseed) : null;
  const unsubCue = hooks && hooks.onCue ? hooks.onCue((name, opts) => {
    const mo = momentForCue(name, opts);
    if (!mo || !g() || mo.name === 'enter' || mo.name === 'exit') return; // activate/deactivate arm the stage
    try { g().stage.cue(mo.name, { action: mo.action }); } catch (e) { console.warn('[play] guests cue', e); }
  }) : null;
  const rigNow = () => rig || (globalThis.__ftf && globalThis.__ftf.rig) || null;
  const shortArc = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  function applyCamera(w) {
    const r = rigNow();
    if (!r) return;
    if (w > 0.01 && prevW <= 0.01) {
      const arc = shortArc((r.baseYaw || 0) - r.yaw);
      yawTotal = Math.abs(arc) < GUEST_CAMERA.yawArc ? arc * GUEST_CAMERA.yawShare : 0;
    }
    const want = { pitch: GUEST_CAMERA.pitch * w, dist: GUEST_CAMERA.dist * w, yaw: yawTotal * w };
    r.pitchOffset = (r.pitchOffset || 0) + want.pitch - applied.pitch;
    const maxD = Math.max(r.minDist || 0, Math.min(r.maxDist || Infinity, GUEST_CAMERA.maxDist));
    r.dist = Math.min(Math.max(r.dist + want.dist - applied.dist, r.minDist || 0), Math.max(maxD, r.dist));
    r.yaw += want.yaw - applied.yaw;
    Object.assign(applied, want);
    prevW = w;
  }
  function releaseCamera() { if (applied.pitch || applied.dist || applied.yaw) applyCamera(0); prevW = 0; }

  return {
    attachAudio(a) { audio = a || null; },
    onZone(z) {
      inside = z === 'shell';
      if (!inside) { if (swell) { try { swell.stop(1.5); } catch { /* ok */ } swell = null; } releaseCamera(); }
    },
    update(dt, { inShell = false } = {}) {
      const gs = g();
      if (!gs) return;
      try {
        const q = stageQualityFor(lookdev);
        if (q !== lastQ) { lastQ = q; gs.setQuality(q); }
        if (!inShell) return;
        const sw = gs.swell();
        if (audio) {
          if (!swell && sw.level > 0.01) swell = audio.play(GUEST_SWELL.sound, { loop: true, gain: 0, rate: GUEST_SWELL.rate, pos: sw.position || undefined });
          if (swell) { swell.setGain(Math.min(1, sw.level) * GUEST_SWELL.gain, 0.3); if (sw.position) swell.setPosition(sw.position); }
        }
        applyCamera(lookdev && lookdev.reducedMotion ? 0 : gs.cameraHint());
      } catch (e) { console.warn('[play] guests frame', e); }
    },
    state() {
      const gs = g();
      if (!gs) return null;
      const st = gs.stage.state;
      return { moment: st.moment, quality: st.quality, drifts: st.drifts, swell: +st.swell.toFixed(3), camera: +st.camera.toFixed(3), applied: { ...applied }, models: gs.state().models, loaded: gs.loaded, seed: st.seed };
    },
    dispose() {
      if (unsubObs) unsubObs();
      if (unsubCue) unsubCue();
      if (swell) { try { swell.stop(0.5); } catch { /* ok */ } swell = null; }
      releaseCamera();
    },
  };
}
