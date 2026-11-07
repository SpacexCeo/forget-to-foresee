// GPU particle system: one instanced draw call per (atlas, blend) batch, stateless particles
// (closed-form motion in the vertex shader), ring-buffer slot allocation (core.js SlotRing),
// flipbook atlases with frame blending, curl-noise drift and soft particles.
//
// Two render modes:
//   direct  the batches live in the game scene (depth-tested, no depth fade). Used on the low tier
//           and whenever no composer is attached.
//   soft    the batches live in an off-screen scene rendered by VfxPass (post.js) into their own
//           target, sampling the scene depth for occlusion and a soft fade where a sprite meets
//           geometry (the "off-screen particles" technique, GPU Gems 3 ch. 23).
import * as THREE from 'three';
import { SlotRing, rng, pick, sampleShape } from './core.js';
import { ATLASES, SPRITES } from './presets.js';
import { PARTICLE_VS, PARTICLE_FS } from './shaders.js';

const BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';

/** Soft round blob used until a flipbook atlas has loaded (and if it fails to load). */
function fallbackTexture() {
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (x + 0.5) / n * 2 - 1, dy = (y + 0.5) / n * 2 - 1;
    const a = Math.max(0, Math.exp(-(dx * dx + dy * dy) * 3.5) - 0.03);
    const o = (y * n + x) * 4;
    data[o] = data[o + 1] = data[o + 2] = 210; data[o + 3] = Math.round(a * 255);
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

const ATTRS = [['aPos', 3], ['aVel', 3], ['aT', 4], ['aSz', 4], ['aC0', 4], ['aC1', 4], ['aPh', 4], ['aFd', 4], ['aEx', 2]];

class ParticleBatch {
  constructor(key, atlasName, blend, capacity, shared) {
    this.key = key;
    this.atlasName = atlasName;
    this.blend = blend;
    this.capacity = capacity;
    this.ring = new SlotRing(capacity);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.attrs = {};
    for (const [name, size] of ATTRS) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      this.attrs[name] = a;
    }
    // Birth far in the future: every slot starts dead.
    this.attrs.aT.array.fill(0);
    for (let i = 0; i < capacity; i++) this.attrs.aT.array[i * 4] = 1e9;
    g.instanceCount = 0;
    // Bounding sphere is irrelevant (particles move in the shader); never frustum-cull the batch.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geometry = g;
    this.uniforms = {
      uTime: shared.uTime, uCurlScale: shared.uCurlScale, uLit: shared.uLit,
      uGrid: { value: 1 }, uAtlas: { value: shared.fallback },
      uDepth: shared.uDepth, uResolution: shared.uResolution, uNear: shared.uNear, uFar: shared.uFar,
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      premultipliedAlpha: true,
    });
    this.setSoft(false);
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = blend === 'alpha' ? 10 : 11; // smoke under light
    this.mesh.name = 'vfx:' + key;
    this.mesh.visible = false;
  }

  setSoft(soft) {
    const d = {};
    if (this.atlasName) d.USE_ATLAS = '';
    if (this.blend === 'alpha') d.BLEND_ALPHA = '';
    if (soft) d.SOFT = '';
    this.material.defines = d;
    this.material.depthTest = !soft;     // soft mode does its own occlusion against the depth texture
    this.material.toneMapped = !soft;
    this.material.needsUpdate = true;
    this.soft = soft;
  }

  setAtlas(tex, grid) { this.uniforms.uAtlas.value = tex; this.uniforms.uGrid.value = grid; }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

const _c0 = new THREE.Color(), _c1 = new THREE.Color();

export class ParticleSystem {
  /** @param {{tier?: string, capacity?: number}} o */
  constructor({ capacity = 4096 } = {}) {
    this.capacity = capacity;
    this.time = 0;
    this.batches = new Map();
    this.group = new THREE.Group();
    this.group.name = 'vfx:particles';
    this.fallback = fallbackTexture();
    this.shared = {
      uTime: { value: 0 }, uCurlScale: { value: 1 }, uLit: { value: new THREE.Color(1, 1, 1) }, fallback: this.fallback,
      uDepth: { value: null }, uResolution: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.1 }, uFar: { value: 1000 },
    };
    this.atlasTextures = {};
    this.soft = false;
    this.seed = 1;
    this.r = rng(12345);
    this.emitted = 0;
  }

  /** Starts loading every flipbook atlas (webp). Particles use a soft blob until each arrives. */
  loadAtlases(loader = new THREE.TextureLoader()) {
    const jobs = [];
    for (const [name, a] of Object.entries(ATLASES)) {
      jobs.push(new Promise((resolve) => {
        loader.load(BASE + a.file, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = 1;
          this.atlasTextures[name] = { tex, grid: a.grid };
          for (const b of this.batches.values()) if (b.atlasName === name) b.setAtlas(tex, a.grid);
          resolve(true);
        }, undefined, () => resolve(false));
      }));
    }
    return Promise.all(jobs);
  }

  batch(atlasName, blend) {
    const key = (atlasName || 'sprite') + '|' + blend;
    let b = this.batches.get(key);
    if (!b) {
      b = new ParticleBatch(key, atlasName, blend, this.capacity, this.shared);
      const at = atlasName && this.atlasTextures[atlasName];
      if (at) b.setAtlas(at.tex, at.grid);
      b.setSoft(this.soft);
      this.batches.set(key, b);
      this.group.add(b.mesh);
    }
    return b;
  }

  /** Creates every batch the presets use, so no shader compiles in the middle of a game event. */
  prewarm(emitters) {
    for (const e of Object.values(emitters)) this.batch(e.atlas || null, e.blend);
  }

  setSoft(soft) {
    this.soft = soft;
    for (const b of this.batches.values()) b.setSoft(soft);
  }

  setDepth(depthTexture, width, height, camera) {
    this.shared.uDepth.value = depthTexture;
    this.shared.uResolution.value.set(width, height);
    this.shared.uNear.value = camera.near;
    this.shared.uFar.value = camera.far;
  }

  /**
   * Emits `n` particles of emitter `e` at world origin [x,y,z].
   * o: {scale (spatial), dir (overrides e.dir), shape (overrides e.shape), birthSpread (s): births
   *     spread over the last `birthSpread` seconds (sub-frame emission for streams), from: previous
   *     origin to interpolate a moving source}.
   */
  emit(e, n, origin, o = {}) {
    if (n <= 0) return 0;
    const b = this.batch(e.atlas || null, e.blend);
    const r = this.r;
    const now = this.time;
    const scale = o.scale || 1;
    const lives = new Float64Array(n), births = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      births[i] = now - (o.birthSpread ? r() * o.birthSpread : 0);
      lives[i] = pick(e.life, r);
    }
    const deaths = births.map((t, i) => t + lives[i]);
    const ranges = b.ring.allocate(n, now, deaths);
    const A = b.attrs;
    const dir = o.dir || e.dir || [0, 1, 0];
    const shape = o.shape || e.shape;
    const spread = e.spread || 0;
    const sprite = e.atlas ? 0 : (SPRITES[e.sprite] || 0);
    _c0.setHex(e.color[0]); _c1.setHex(e.color[1]);
    const curl = e.curl || null;
    const flip = e.flip === 'life' || e.flip === undefined ? 0 : e.flip;
    let i = 0;
    for (const { start, count } of ranges) {
      for (let s = start; s < start + count; s++, i++) {
        const local = sampleShape(shape, r);
        const f = o.from && o.birthSpread ? (now - births[i]) / o.birthSpread : 0;
        const ox = o.from ? origin[0] + (o.from[0] - origin[0]) * f : origin[0];
        const oy = o.from ? origin[1] + (o.from[1] - origin[1]) * f : origin[1];
        const oz = o.from ? origin[2] + (o.from[2] - origin[2]) * f : origin[2];
        const px = ox + local[0] * scale, py = oy + local[1] * scale, pz = oz + local[2] * scale;
        // Direction: dir perturbed inside a cone of half-angle spread * PI.
        const sp = pick(e.speed, r);
        const th = r() * Math.PI * 2, ph = Math.acos(1 - r() * (1 - Math.cos(spread * Math.PI)));
        const v = coneDir(dir, th, ph);
        let vx = v[0] * sp, vy = v[1] * sp, vz = v[2] * sp;
        if (e.radial) {
          const rr = pick(e.radial, r);
          const h = Math.hypot(local[0], local[2]);
          const ang = h > 1e-5 ? Math.atan2(local[2], local[0]) : r() * Math.PI * 2;
          vx += Math.cos(ang) * rr; vz += Math.sin(ang) * rr;
        }
        const sr = 1 + ((r() * 2 - 1) * (e.sizeRand || 0));
        const p3 = s * 3, p4 = s * 4, p2 = s * 2;
        A.aPos.array[p3] = px; A.aPos.array[p3 + 1] = py; A.aPos.array[p3 + 2] = pz;
        A.aVel.array[p3] = vx * scale; A.aVel.array[p3 + 1] = vy * scale; A.aVel.array[p3 + 2] = vz * scale;
        A.aT.array[p4] = births[i]; A.aT.array[p4 + 1] = lives[i]; A.aT.array[p4 + 2] = r(); A.aT.array[p4 + 3] = sprite;
        A.aSz.array[p4] = e.size[0] * sr * scale; A.aSz.array[p4 + 1] = e.size[1] * sr * scale;
        A.aSz.array[p4 + 2] = pick(e.spin || 0, r); A.aSz.array[p4 + 3] = e.stretch || 0;
        A.aC0.array[p4] = _c0.r; A.aC0.array[p4 + 1] = _c0.g; A.aC0.array[p4 + 2] = _c0.b; A.aC0.array[p4 + 3] = e.intensity[0];
        A.aC1.array[p4] = _c1.r; A.aC1.array[p4 + 1] = _c1.g; A.aC1.array[p4 + 2] = _c1.b; A.aC1.array[p4 + 3] = e.intensity[1];
        A.aPh.array[p4] = (e.gravity || 0) * scale; A.aPh.array[p4 + 1] = e.drag || 0;
        A.aPh.array[p4 + 2] = curl ? curl.strength * scale : 0; A.aPh.array[p4 + 3] = curl ? curl.scale / scale : 0;
        A.aFd.array[p4] = e.fadeIn || 0; A.aFd.array[p4 + 1] = e.fadeOut || 0; A.aFd.array[p4 + 2] = e.alpha; A.aFd.array[p4 + 3] = flip;
        A.aEx.array[p2] = (e.soft || 0.2) * scale; A.aEx.array[p2 + 1] = curl ? curl.speed || 0 : 0;
      }
      for (const [name, size] of ATTRS) A[name].addUpdateRange(start * size, count * size);
    }
    for (const [name] of ATTRS) A[name].needsUpdate = true;
    b.geometry.instanceCount = b.ring.used;
    b.mesh.visible = true;
    this.emitted += n;
    return n;
  }

  update(dt) {
    this.time += dt;
    this.shared.uTime.value = this.time;
    for (const b of this.batches.values()) {
      if (b.mesh.visible && b.ring.lastDeath() < this.time) b.mesh.visible = false;
    }
  }

  stats() {
    let live = 0, stolen = 0, visible = 0;
    for (const b of this.batches.values()) { live += b.ring.live(this.time); stolen += b.ring.stolen; if (b.mesh.visible) visible++; }
    return { live, stolen, batches: this.batches.size, drawCalls: visible, emitted: this.emitted };
  }

  get anyVisible() { for (const b of this.batches.values()) if (b.mesh.visible) return true; return false; }

  dispose() {
    for (const b of this.batches.values()) b.dispose();
    this.batches.clear();
    for (const a of Object.values(this.atlasTextures)) a.tex.dispose();
    this.fallback.dispose();
    this.group.removeFromParent();
  }
}

/** Unit vector at polar angle ph and azimuth th around axis d. */
function coneDir(d, th, ph) {
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  const ax = d[0] / len, ay = d[1] / len, az = d[2] / len;
  // Orthonormal basis around the axis.
  let ux, uy, uz;
  if (Math.abs(ay) < 0.9) { ux = az; uy = 0; uz = -ax; } else { ux = 0; uy = -az; uz = ay; }
  const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
  const wx = ay * uz - az * uy, wy = az * ux - ax * uz, wz = ax * uy - ay * ux;
  const s = Math.sin(ph), c = Math.cos(ph), ct = Math.cos(th), st = Math.sin(th);
  return [ax * c + (ux * ct + wx * st) * s, ay * c + (uy * ct + wy * st) * s, az * c + (uz * ct + wz * st) * s];
}
