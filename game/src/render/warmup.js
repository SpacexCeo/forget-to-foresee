// GPU warm-up for streamed models (docs/smoothness.md): a model that pops in must not freeze the frame.
// Two things used to happen inside the first frame that drew a new model: every texture was uploaded and every
// shader program was compiled and linked, all synchronously (seconds on a slow GPU). GpuWarmup moves both ahead
// of the swap: textures upload a few per frame within a byte budget, programs compile through
// renderer.compileAsync (KHR_parallel_shader_compile: the driver compiles off the main thread), and only then
// does the caller attach the model. The greybox stands in a moment longer; the frame never stalls.
import { takeFrameBatch } from './streaming.js';

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

let active = null;
/** The world's warm-up queue, shared with the play layer (agents, Guests): set once by boot-world.js. */
export function setActiveWarmup(w) { active = w; }
/** Warms a model that is about to join the scene; resolves at once when no queue is installed (tests, review page). */
export function warmModel(root) { return active ? active.warm(root) : Promise.resolve(); }

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

  /** Programs for `root` as it will be drawn inside the scene; never rejects, never waits longer than the timeout. */
  compile(root) {
    const r = this.renderer;
    // Without KHR_parallel_shader_compile a compile blocks wherever it runs: leave it to the first draw as before.
    if (!r.compileAsync || !(r.extensions && r.extensions.has('KHR_parallel_shader_compile'))) return Promise.resolve();
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
      this.compile(job.root).then(() => { this.stats.compiling--; this.stats.warmed++; job.resolve(); });
    }
  }
}
