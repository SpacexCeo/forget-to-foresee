// The lab prologue and the wake-up shot (sprint plan section 9). The prologue plays in its own canvas over the game
// (its own small renderer and scene: nothing of the town is touched, and the town keeps loading behind it); the
// wake-up is a screen-space shot over the live town. Cues go to ctx.bus as `prologue.cue` / `wakeup.cue`; the
// dialogue layer shows the subtitles and plays the voice. Skippable: skip() snaps to the end within 1.2 s.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { buildLab } from '../../scenes/lab/index.js';
import { buildVortexDisk, buildTunnel } from './vortex.js';
import { createLabAudio } from './lab-audio.js';
import { createIrisPoses } from './iris-poses.js';
import { createTimeline } from './timeline.js';
import { cameraAt, irisAt, PROLOGUE_S, WAKE_CUES } from './shots.js';

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const DEVICE = new THREE.Vector3(3.2, 1.5, 0.4);
const el = (tag, css, text = '') => { const e = document.createElement(tag); e.style.cssText = css; if (text) e.textContent = text; return e; };

/** Iris for the lab: her own model and clips, loaded through the game's loaders; null when anything fails. */
async function loadIris(phone) {
  try {
    const [{ fetchGltf }, { sidecarClips, mergeClips }, { MODEL_FILES }] = await Promise.all([import('../../render/assets.js'), import('../../play/anim-library.js'), import('virtual:model-list')]);
    const name = phone && MODEL_FILES.agent_iris_m ? 'agent_iris_m' : 'agent_iris';
    const { gltf } = await fetchGltf(name);
    const model = cloneSkinned(gltf.scene);
    try { const [m, h] = await Promise.all([import('../../render/materials.js'), import('../../render/hair-cards.js')]); m.upgradeAssetMaterials('agent_iris', model); h.tuneHairCards(model); } catch { /* plain materials */ }
    model.traverse((o) => { if (/_col(?:[._]?\d+)?$/.test(o.name)) o.visible = false; if (o.isMesh) o.frustumCulled = false; });
    const clips = mergeClips(gltf.animations || [], await sidecarClips('agent_iris'));
    const mixer = new THREE.AnimationMixer(model), acts = {};
    for (const n of ['idle', 'walk', 'run']) { const c = clips.find((x) => x.name === n); if (c) { acts[n] = mixer.clipAction(c); acts[n].play(); acts[n].setEffectiveWeight(n === 'idle' ? 1 : 0); } }
    return { model, mixer, acts, poses: createIrisPoses(model), w: { idle: 1, walk: 0, run: 0 } };
  } catch (e) { if (globalThis.console) globalThis.console.warn('[prologue] Iris not loaded', e); return null; }
}

/** @param {object} ctx the sprint ctx (bus, reduced, ...); every field optional */
export function createPrologue(ctx = {}) {
  const emit = (name, payload) => { try { if (ctx.bus && ctx.bus.emit) ctx.bus.emit(name, payload); } catch { /* the film goes on */ } };
  const phone = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  let live = null; // the running film: {timeline}
  const irisP = loadIris(phone); // starts with the module: ready by the time she enters (3 s in)

  async function playLabPrologue({ reduced = false } = {}) {
    if (live) return 'done';
    const host = el('div', 'position:fixed;inset:0;z-index:calc(var(--z-dialogue, 50) + 4);background:#000;overflow:hidden'); host.className = 'ftf-prologue';
    const canvas = el('canvas', 'position:absolute;inset:0;width:100%;height:100%;display:block'); host.append(canvas);
    const white = el('div', 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none');
    const black = el('div', 'position:absolute;inset:0;background:#000;opacity:1;pointer-events:none');
    const vign = el('div', 'position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,.85) 100%)');
    const title = el('div', 'position:absolute;inset:0;display:grid;place-content:center;text-align:center;gap:14px;color:#e9c46a;opacity:0;pointer-events:none;font:700 clamp(28px,5vw,56px)/1.1 Georgia,serif;letter-spacing:.08em');
    title.append(el('div', '', 'FORGET TO FORESEE'), el('div', 'font:400 clamp(16px,2.4vw,28px)/1.3 Georgia,serif;letter-spacing:.2em;color:#d9dbe6', '2048'));
    host.append(vign, white, black, title); document.body.append(host);
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !phone, powerPreference: 'high-performance' }); } catch { host.remove(); throw new Error('no renderer for the prologue'); }
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, phone ? 1 : 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05070c);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
    const resize = () => { const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    resize(); addEventListener('resize', resize);
    const lab = buildLab(); scene.add(lab.root);
    const disk = buildVortexDisk(); disk.mesh.position.set(DEVICE.x - 0.08, DEVICE.y, DEVICE.z); disk.mesh.rotation.y = -Math.PI / 2; scene.add(disk.mesh);
    const tunnel = buildTunnel({ phone }); tunnel.root.position.set(0, -300, 0); scene.add(tunnel.root);
    const audio = createLabAudio({ reduced, musicUrl: ((import.meta.env && import.meta.env.BASE_URL) || '/') + 'assets/audio/mus_lab.ogg' });
    let iris = null; irisP.then((i) => { if (i && live) { iris = i; scene.add(i.model); i.model.visible = false; } });
    const timeline = createTimeline({ reduced, onCue: (c) => { audio.cue(c.id); emit('prologue.cue', c.card ? { id: c.id, durMs: c.durMs } : { ...c }); if (typeof ctx.onCue === 'function') ctx.onCue(c); } });
    live = { timeline };
    const look = new THREE.Vector3(), tmp = new THREE.Vector3(); let lastNow = performance.now(), beat = false, raf = 0;
    const papersHome = lab.props.papers.map((p) => p.position.clone());

    const frame = (resolve) => {
      const now = performance.now(), dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
      const st = timeline.tick(), t = st.t, cam = cameraAt(t, { reduced });
      // ---- overlays: fade in, the title card, the whiteout, the cut to black
      black.style.opacity = String(t < 35.6 ? 1 - ss(0.0, 1.0, t) : ss(36.0, 37.0, t));
      title.style.opacity = String(Math.min(ss(0.0, 0.6, t), 1 - ss(2.2, 2.8, t)));
      white.style.opacity = String(st.skipping ? Math.sin(Math.PI * st.k) : ss(34.6, 35.4, t) * (1 - ss(35.5, 36.5, t)));
      vign.style.opacity = String(reduced ? 0 : ss(26.5, 30, t) * 0.8);
      if (!beat && t >= 36.8) { beat = true; audio.cue('heartbeat'); }
      // ---- the room
      lab.root.visible = !cam.tunnel; tunnel.root.visible = cam.tunnel;
      lab.props.door.position.x = -3 - 1.1 * (ss(3.0, 3.6, t) - ss(5.2, 6.0, t));
      const pressed = ss(14.0, 14.15, t); lab.props.key.position.y = 0.835 - 0.02 * pressed; lab.props.keyMat.emissive.setRGB(0.48 + 0.5 * pressed, 0.04 + 0.9 * ss(14.3, 14.8, t), 0.07 + 0.9 * ss(14.3, 14.8, t)); lab.props.keyMat.emissiveIntensity = 0.6 + 1.6 * pressed;
      lab.props.drawScreen(t, t >= 14.2, t >= 12.6 && t < 13.3);
      const power = Math.max(ss(15.8, 19.5, t) * 0.6, 0.6 * ss(15.8, 19.5, t) + 0.4 * ss(22.0, 25.8, t));
      lab.device.update(dt, t, power); audio.power(power);
      const flick = reduced ? 1 - 0.3 * ss(16.5, 19, t) : (t > 17.0 && t < 17.12) || (t > 17.6 && t < 17.72) ? 0.15 : 1;
      lab.lights.ceil.intensity = 14 * flick * (1 - 0.6 * ss(26.5, 29, t)); lab.lights.stripMat.color.setScalar(flick);
      // papers tremble as the device wakes, then fly into the vortex with the coat
      const pull = ss(26.5, 30.5, t);
      lab.props.papers.forEach((p, i) => {
        const home = papersHome[i], trem = ss(16.5, 19, t) * (1 - pull) * 0.006;
        const k = Math.min(1, Math.max(0, (pull * 1.6 - i * 0.04))); tmp.copy(home).lerp(DEVICE, k * k);
        p.position.set(tmp.x + Math.sin(t * 37 + i) * trem, tmp.y + Math.sin(k * Math.PI) * 0.9, tmp.z + Math.cos(t * 31 + i * 2) * trem);
        p.rotation.x = -Math.PI / 2 + k * p.userData.spin * 3; p.rotation.y = k * p.userData.spin * 2; p.visible = k < 0.98;
      });
      const ck = ss(27.5, 30.8, t); lab.props.coat.position.copy(lab.props.coat.userData.home).lerp(DEVICE, ck * ck); lab.props.coat.rotation.set(ck * 4, ck * 6, 0); lab.props.coat.visible = ck < 0.97;
      disk.update(t, ss(26.5, 27.3, t) * (cam.tunnel ? 0 : 1), 1.2 + 2.0 * ss(26.5, 31, t));
      // ---- Iris: her path and clips, the layers on top, the pull, the tumble in the tunnel
      const ir = irisAt(t);
      if (iris) {
        iris.model.visible = !!ir && t < 35.4;
        if (ir) {
          for (const n of ['idle', 'walk', 'run']) { const to = ir.moving && ir.clip === n ? 1 : !ir.moving && n === 'idle' ? 1 : 0; iris.w[n] += (to - iris.w[n]) * Math.min(1, dt * 6); if (iris.acts[n]) iris.acts[n].setEffectiveWeight(iris.w[n]); }
          iris.mixer.update(dt);
          const k9 = ss(26.5, 31, t), face = t >= 12.0 && t < 15.9 ? Math.atan2(2.2 - ir.x, -3.4 - ir.z) : t >= 23.2 && t < 26.5 ? Math.atan2(DEVICE.x - ir.x, DEVICE.z - ir.z) : ir.heading;
          let dh = face - iris.model.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); iris.model.rotation.y += dh * Math.min(1, dt * 7);
          if (cam.tunnel) { const kt = (t - 31) / 4.5; iris.model.position.set(Math.sin(t * 0.7) * 0.5, -300 - 0.9 + Math.cos(t * 0.9) * 0.4, -7 - kt * 5); iris.model.rotation.set(t * 1.1, t * 0.7, t * 0.4); iris.model.scale.setScalar(0.55); }
          else { iris.model.position.set(ir.x, 0.25 * k9 * k9 + (reduced ? 0 : Math.sin(t * 9) * 0.01 * k9), ir.z); iris.model.rotation.x = 0; iris.model.rotation.z = 0; if (k9 > 0) iris.model.rotation.y = face + (reduced ? 0 : 2.79 * k9); iris.model.scale.setScalar(1 - 0.75 * ss(30.2, 31, t)); }
          iris.poses.apply({ lean: ss(12.0, 12.6, t) * (1 - ss(15.4, 15.9, t)), reach: ss(12.3, 12.9, t) * (1 - ss(14.3, 15.0, t)), raise: ss(22.6, 23.4, t) * (1 - ss(24.6, 25.2, t)), startle: cam.tunnel ? 0.6 : ss(24.6, 24.85, t) * (0.45 + 0.55 * ss(26.5, 27.5, t)) });
        }
      }
      // ---- the camera
      if (cam.tunnel) { camera.position.set(0, -300, 0); look.set(0, -300, -10); } else { camera.position.fromArray(cam.pos); look.fromArray(cam.look); }
      if (cam.shake) camera.position.add(tmp.set(Math.sin(t * 88) * cam.shake, Math.sin(t * 71 + 1) * cam.shake * 0.6, 0));
      camera.fov = cam.fov; camera.updateProjectionMatrix(); camera.up.set(0, 1, 0); camera.lookAt(look);
      if (cam.roll) camera.rotateZ(THREE.MathUtils.degToRad(cam.tunnel ? cam.roll * (t - 31) : Math.sin(t * 3) * cam.roll * cam.k));
      if (cam.tunnel) tunnel.update(t - 31, (t - 31) / 4.5);
      renderer.render(scene, camera);
      if (st.done) { finish(resolve); return; }
      raf = requestAnimationFrame(() => frame(resolve));
    };
    const finish = (resolve) => {
      cancelAnimationFrame(raf); removeEventListener('resize', resize);
      const skipped = timeline.skipped; live = null;
      if (iris) { scene.remove(iris.model); iris.model.position.set(0, 0, 0); iris.model.rotation.set(0, 0, 0); iris.model.scale.setScalar(1); }
      audio.dispose(); lab.dispose(); disk.dispose(); tunnel.dispose(); renderer.dispose(); try { renderer.forceContextLoss(); } catch { /* gone */ }
      host.remove(); resolve(skipped ? 'skipped' : 'done');
    };
    return new Promise((resolve) => { raf = requestAnimationFrame(() => frame(resolve)); });
  }

  /** The wake-up over the live town: eyelids open on a blurred view that sharpens. Screen space only (4.5 s). */
  /**
   * The town camera for the wake-up, without touching the game's camera rig: for the length of the shot the scene's
   * onBeforeRender puts the live camera low on the cobbles looking up, then blends it back to wherever the rig had
   * it this frame. Everything is restored at the end. Needs ctx.scene, ctx.camera and ctx.player; null otherwise.
   */
  function wakeCamera() {
    const { scene, camera, player } = ctx;
    const pp = player && (player.pos || player.position);
    if (!scene || !camera || !pp) return null;
    const c = Array.isArray(pp) ? [pp[0], pp[1], pp[2]] : [pp.x, pp.y, pp.z];
    const h = typeof player.heading === 'number' ? player.heading : 0;
    const prev = scene.onBeforeRender, fov0 = camera.fov;
    const eye = new THREE.Vector3(), look = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
    // her own body would fill a camera lying where she stands: hidden while the view is hers
    const hidden = [];
    scene.traverse((o) => { if (o.isSkinnedMesh && o.visible && !hidden.includes(o)) { const w = o.skeleton && o.skeleton.bones[0] ? o.skeleton.bones[0].getWorldPosition(new THREE.Vector3()) : null; if (w && Math.hypot(w.x - c[0], w.z - c[2]) < 0.4) hidden.push(o); } });
    let k = 0;
    scene.onBeforeRender = function (...a) {
      if (prev) prev.apply(this, a);
      const w = 1 - ss(0.62, 0.97, k); // 1 = her eyes, 0 = the game's own framing
      if (w <= 0) return;
      const turn = h + 0.5 - ss(0.25, 0.7, k) * 1.0, rise = ss(0.5, 0.95, k);
      eye.set(c[0], c[1] + 0.22 + rise * 1.2, c[2]);
      // lying on her back: almost straight up at first, then across the faces as she lifts her head
      const pitch = 1.25 - ss(0.3, 0.75, k) * 0.85;
      look.set(eye.x + Math.sin(turn) * Math.cos(pitch), eye.y + Math.sin(pitch), eye.z + Math.cos(turn) * Math.cos(pitch));
      m.lookAt(eye, look, up); q.setFromRotationMatrix(m);
      camera.position.lerp(eye, w); camera.quaternion.slerp(q, w);
      camera.fov = fov0 + (62 - fov0) * w; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      for (const o of hidden) o.visible = w < 0.5;
    };
    return {
      center: c, heading: h,
      at(x) { k = x; },
      end() { scene.onBeforeRender = prev; camera.fov = fov0; camera.updateProjectionMatrix(); for (const o of hidden) o.visible = true; },
    };
  }

  /** The people stay around her through the first talk (controls are locked till then) and leave when the intro ends. */
  function keepRing(ring) {
    let raf = 0, last = performance.now(), offs = [];
    const stop = () => { cancelAnimationFrame(raf); clearTimeout(timer); for (const off of offs) { try { if (typeof off === 'function') off(); } catch { /* */ } } ring.dispose(); };
    const timer = setTimeout(stop, 120000);
    const loop = (now) => { ring.update(Math.min(0.1, (now - last) / 1000)); last = now; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    if (ctx.bus && ctx.bus.on) offs = ['npe.completed', 'npe.skipped'].map((n) => ctx.bus.on(n, stop));
  }

  async function playWakeUp({ reduced = false } = {}) {
    let cam = null, ring = null;
    try { cam = reduced ? null : wakeCamera(); } catch { cam = null; }
    if (cam) { try { ring = (await import('./townsfolk-ring.js')).createTownsfolkRing({ scene: ctx.scene, center: cam.center, heading: cam.heading, mobile: phone }); } catch { ring = null; } }
    const dur = reduced ? 2.5 : cam ? 7 : 4.5, host = el('div', 'position:fixed;inset:0;z-index:calc(var(--z-dialogue, 50) + 4);pointer-events:none;overflow:hidden'); host.className = 'ftf-wakeup';
    const blur = el('div', 'position:absolute;inset:0;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);background:rgba(255,255,255,.18)');
    const top = el('div', 'position:absolute;left:-5%;right:-5%;top:0;height:52%;background:#000;border-radius:0 0 50% 50%/0 0 26% 26%'), bot = el('div', 'position:absolute;left:-5%;right:-5%;bottom:0;height:52%;background:#000;border-radius:50% 50% 0 0/26% 26% 0 0');
    host.append(blur, top, bot); document.body.append(host);
    const t0 = performance.now(), fired = new Set(); let last = t0;
    return new Promise((resolve) => {
      const step = () => {
        const now = performance.now(), t = (now - t0) / 1000, k = t / dur; const dt = Math.min(0.1, (now - last) / 1000); last = now;
        for (const c of WAKE_CUES) if (!fired.has(c.id) && k * 9 >= c.t) { fired.add(c.id); emit('wakeup.cue', { ...c }); }
        if (cam) cam.at(Math.min(1, k)); if (ring) ring.update(dt);
        // eyes: a first heavy blink, then they open
        const open = reduced ? ss(0, 0.6, k) : Math.max(ss(0.02, 0.2, k) * (1 - ss(0.22, 0.3, k)) * 0.45, ss(0.3, 0.62, k));
        top.style.height = bot.style.height = (52 * (1 - open)) + '%';
        const b = 14 * (1 - ss(0.25, 0.9, k)); blur.style.backdropFilter = blur.style.webkitBackdropFilter = `blur(${b.toFixed(1)}px)`; blur.style.background = `rgba(255,255,255,${(0.18 * (1 - ss(0.3, 0.9, k))).toFixed(3)})`;
        if (k >= 1) { host.remove(); if (cam) cam.end(); if (ring) keepRing(ring); emit('wakeup.completed', { ms: Math.round(t * 1000) }); resolve('done'); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  return {
    playLabPrologue, playWakeUp,
    skip() { if (live) live.timeline.skip(); },
    dispose() { if (live) live.timeline.skip(); },
    duration: PROLOGUE_S,
  };
}

// ---- the plan's function names (9.5), for callers that hold a ctx
let shared = null;
export function playLabPrologue({ ctx = {}, signal, onCue, reduced } = {}) { shared ||= createPrologue({ ...ctx, onCue }); if (signal) signal.addEventListener('abort', () => shared.skip(), { once: true }); return shared.playLabPrologue({ reduced: reduced ?? (typeof ctx.reduced === 'function' ? ctx.reduced() : false) }).then((how) => ({ skipped: how === 'skipped', ms: Math.round(PROLOGUE_S * 1000) })); }
export function playWakeUp({ ctx = {}, reduced } = {}) { shared ||= createPrologue(ctx); return shared.playWakeUp({ reduced: reduced ?? (typeof ctx.reduced === 'function' ? ctx.reduced() : false) }).then(() => ({ ms: 4500 })); }
/** The dialogue's camera cues. The town camera has no cinematic hook in this build: the request is put on the bus. */
export function focusOn(key, ms = 1200, ctx = {}) { try { if (ctx.bus && ctx.bus.emit) ctx.bus.emit('prologue.focus', { key, ms }); } catch { /* no bus */ } return false; }
export function releaseCamera() { return false; }
