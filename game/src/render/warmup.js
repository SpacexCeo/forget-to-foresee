// GPU warm-up for streamed models (docs/smoothness.md): a model that pops in must not freeze the frame.
// Two things used to happen inside the first frame that drew a new model: every texture was uploaded and every
// shader program was compiled and linked, all synchronously (seconds on a slow GPU). GpuWarmup moves both ahead
// of the swap: textures upload a few per frame within a byte budget, programs compile through
// renderer.compileAsync (KHR_parallel_shader_compile: the driver compiles off the main thread), and only then
// does the caller attach the model. The greybox stands in a moment longer; the frame never stalls.
import { takeFrameBatch } from './streaming.js';
import { WebGLRenderTarget } from 'three';

/** Unique textures referenced by the materials under `root`. */
export function collectTextures(root) {
  const seen = new Set();
  root.traverse((o) => {
    if (!o.material) return;
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!mat) continue;
      for (const v of Object.values(mat)) if (v && v.isTexture && v.image) seen.add(v);
    }
  });
  return [...seen];
}

/** Approximate GPU bytes of a texture (compressed mip chain, or RGBA8 with mips). */
export function textureBytes(tex) {
  if (tex.isCompressedTexture && Array.isArray(tex.mipmaps) && tex.mipmaps.length) {
    let n = 0;
    for (const m of tex.mipmaps) n += (m.data && m.data.byteLength) || 0;
    if (n) return n;
  }
  const img = tex.image || {};
  return Math.round((img.width || 1) * (img.height || 1) * 4 * 1.34);
}

let active = null, forceCompile = 0;
/**
 * While a cutscene plays, a model that streams in is compiled before it attaches even without the parallel-compile
 * extension (Safari, software GL): a synchronous compile at attach time, during the title, beats one on the frame of
 * a cut. Counted like holdStreaming.
 */
export function forceWarmCompile(on) { forceCompile = Math.max(0, forceCompile + (on ? 1 : -1)); return forceCompile > 0; }
/** The world's warm-up queue, shared with the play layer (agents, Guests): set once by boot-world.js. */
export function setActiveWarmup(w) { active = w; }
/** Warms a model that is about to join the scene; resolves at once when no queue is installed (tests, review page). */
export function warmModel(root) { return active ? active.warm(root) : Promise.resolve(); }
/**
 * Warms everything in the scene now (owner, 12.11: skipping through a cutscene must be instant): every texture on the
 * GPU and every program compiled, including objects the camera has not looked at yet, so a cut to a new view draws
 * without a stall. Off the main thread where the driver allows it, else at once (one slower frame at the film's start
 * instead of one per cut). Resolves at once when no queue is installed.
 */
export function warmScene() { return active ? active.warmAll() : Promise.resolve(); }

/**
 * Warms a part of the scene that is hidden now but will be shown later WITH ITS OWN LIGHTS (the Shell hall): its
 * textures go to the GPU at once and its programs are compiled while `root` is momentarily visible, so the scene's
 * light count matches what the first visit will draw (three keys programs by the number of lights). `root` is hidden
 * again before this returns; nothing is drawn. Resolves when the programs are ready (or after the timeout).
 * `wholeScene`: compile every visible object of the scene with those lights on (what is still drawn around the hall,
 * e.g. the archipelago behind its walls, needs the same light count, or it recompiles on the first visit too).
 */
export function prewarmHidden(root, { wholeScene = false } = {}) {
  if (!active || !root) return Promise.resolve(false);
  const r = active.renderer;
  for (const tex of collectTextures(root)) { try { r.initTexture(tex); } catch { /* the first draw uploads it */ } }
  const was = root.visible;
  root.visible = true;
  let done;
  try {
    const parallel = r.compileAsync && r.extensions && r.extensions.has('KHR_parallel_shader_compile');
    // without parallel compile the programs are built here, once, instead of in the first frame inside
    const what = wholeScene ? active.scene : root;
    if (parallel) done = active.compile(what);
    else { const prev = r.getRenderTarget(); try { r.setRenderTarget(active.target() || null); r.compile(what, active.camera, active.scene); } finally { r.setRenderTarget(prev); } }
  } catch (e) { console.warn('[warmup] prewarm failed', e); } finally { root.visible = was; }
  return Promise.resolve(done).then(() => true);
}

export class GpuWarmup {
  /**
   * @param {{renderer:import('three').WebGLRenderer, camera:import('three').Camera, scene:import('three').Scene,
   *          target?:() => (import('three').WebGLRenderTarget|null), frameBytes?:number, compileTimeout?:number}} o
   *   target: the render target the scene is drawn into (the post stack's, or null for the canvas). Programs are
   *   keyed by the target's colour space and tone mapping, so compiling for the wrong one would warm nothing.
   */
  constructor({ renderer, camera, scene, target = () => null, frameBytes = 24 * 1024 * 1024, compileTimeout = 5000 }) {
    this.renderer = renderer; this.camera = camera; this.scene = scene; this.target = target;
    this.frameBytes = frameBytes; this.compileTimeout = compileTimeout;
    this.jobs = [];
    this.stats = { warmed: 0, textures: 0, bytes: 0, compiling: 0 };
  }

  get pending() { return this.jobs.length + this.stats.compiling; }

  /** Queues `root` (not yet in the scene); resolves when its textures are on the GPU and its programs are ready. */
  warm(root) {
    return new Promise((resolve) => {
      const textures = collectTextures(root).map((tex) => ({ tex, bytes: textureBytes(tex) }));
      this.jobs.push({ root, textures, resolve });
    });
  }

  /** Uploads every texture under the scene and compiles every visible object's program (see warmScene). */
  warmAll() {
    for (const tex of collectTextures(this.scene)) { try { this.renderer.initTexture(tex); } catch { /* lost context etc. */ } }
    return this.compile(this.scene, { force: true });
  }

  /**
   * Programs for `root` as it will be drawn inside the scene; never rejects, never waits longer than the timeout.
   * `force`: without the parallel-compile extension, compile synchronously now rather than leave it to the first draw.
   */
  compile(root, { force = false } = {}) {
    const r = this.renderer;
    // Without KHR_parallel_shader_compile a compile blocks wherever it runs: leave it to the first draw as before
    // (or, forced, do it now: a planned pause beats a stall later).
    if (!r.compileAsync || !(r.extensions && r.extensions.has('KHR_parallel_shader_compile'))) {
      if (force && r.compile) { const prev = r.getRenderTarget(); try { r.setRenderTarget(this.target() || null); r.compile(root, this.camera, this.scene); } catch (e) { console.warn('[warmup] compile failed', e); } finally { r.setRenderTarget(prev); } }
      return Promise.resolve();
    }
    const prev = r.getRenderTarget();
    let done;
    try {
      r.setRenderTarget(this.target() || null);
      done = r.compileAsync(root, this.camera, this.scene);
    } catch (e) {
      console.warn('[warmup] compile failed', e);
      done = Promise.resolve();
    } finally { r.setRenderTarget(prev); }
    let timer;
    const timeout = new Promise((res) => { timer = setTimeout(res, this.compileTimeout); });
    return Promise.race([Promise.resolve(done).catch(() => {}), timeout]).then(() => clearTimeout(timer));
  }

  /** Call once per frame: uploads this frame's share of textures, then hands finished jobs to the compiler. */
  update() {
    let budget = this.frameBytes;
    while (this.jobs.length && budget > 0) {
      const job = this.jobs[0];
      const n = takeFrameBatch(job.textures.map((t) => t.bytes), budget, { atLeastOne: budget === this.frameBytes });
      for (const t of job.textures.splice(0, n)) {
        try { this.renderer.initTexture(t.tex); } catch (e) { console.warn('[warmup] texture upload failed', e); }
        budget -= t.bytes; this.stats.textures++; this.stats.bytes += t.bytes;
      }
      if (job.textures.length) break; // out of budget: the rest next frame
      this.jobs.shift();
      this.stats.compiling++;
      this.compile(job.root, { force: forceCompile > 0 }).then(() => { this.stats.compiling--; this.stats.warmed++; job.resolve(); });
    }
  }
}

/**
 * One offscreen frame of the scene from a viewpoint inside a hidden part (the Shell hall), with `root` shown for that
 * frame only: geometry buffers are uploaded, programs compiled for the exact draw, and the transmission target the
 * Guests' skin needs is allocated now instead of on the first visit. The game camera is moved for the frame and put
 * back; the frame goes into a 1×1 target and is never shown. Synchronous; call it once, outside a visit.
 */
export function renderHiddenOnce(root, eye, target) {
  if (!active || !root) return false;
  const r = active.renderer, cam = active.camera, scene = active.scene;
  const pos = cam.position.clone(), quat = cam.quaternion.clone(), was = root.visible, prev = r.getRenderTarget();
  const rt = new WebGLRenderTarget(1, 1);
  try {
    root.visible = true;
    cam.position.set(eye[0], eye[1], eye[2]); cam.lookAt(target[0], target[1], target[2]); cam.updateMatrixWorld(true);
    r.setRenderTarget(rt);
    r.render(scene, cam);
    return true;
  } catch (e) { console.warn('[warmup] hidden render failed', e); return false; } finally {
    root.visible = was;
    cam.position.copy(pos); cam.quaternion.copy(quat); cam.updateMatrixWorld(true);
    r.setRenderTarget(prev);
    rt.dispose();
  }
}
