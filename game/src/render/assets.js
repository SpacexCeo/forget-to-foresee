// Asset system for the 3D client.
//  - AssetLibrary: loads /assets/models/<name>.glb by exact catalog name, keeps parsed templates,
//    disposes them on eviction. Only files listed by the build (virtual:model-list) are requested.
//  - PropInstance: one placed object. Shows a labeled greybox until its asset is attached, then a
//    clone of the template (geometry, materials and textures are shared between clones). Swaps the
//    runtime mesh for <name>_inspect by camera distance, moves *_col meshes into the physics world
//    (never rendered), and exposes socket_* empties for code-drawn decals.
//  - AssetStreamer: every few frames decides from frustum + distance what to load, attach, release
//    and evict (policy in streaming.js), with a priority queue, a concurrency limit and an LRU.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MODEL_FILES } from 'virtual:model-list';
import { ASSETS, LOAD_DISTANCE, assetByName, classifyPath, isValidModelName, modelUrl, versionedModelUrl, socketRole } from './asset-catalog.js';
import { instancePriority, assetPriority, planStreaming, planUpgrade, LruCache, createPrefetch } from './streaming.js';
import { buildGreybox } from './greybox.js';
import { transformTriangles, MASK_ALL } from '../physics/collision.js';

const BASE = import.meta.env.BASE_URL || '/';

/**
 * Texture budget variant. On phones and the low tier main.js sets '_m': an asset loads <name>_m.glb
 * when the build has one (same model, KTX2 textures capped at 2048 by art/tools/glb_mobile.py, a
 * quarter of the GPU memory). Assets without a variant load as usual.
 */
let modelVariant = '';
export function setModelVariant(suffix) { modelVariant = suffix || ''; }
// Review overrides (dev): load another file for a model name, e.g. ?shells=r2 maps shell_1 -> shell_1_r2,
// so a new art round can be judged in the game before it replaces the shipped file.
let modelOverrides = {};
export function setModelOverrides(map) { modelOverrides = { ...(map || {}) }; }
export const getModelVariant = () => modelVariant;

/* ---------- analysis shared with the review page ---------- */

/** Names from `root` (exclusive) down to `obj` (inclusive), using the original glTF names. */
function namePath(root, obj) {
  const out = [];
  for (let o = obj; o && o !== root; o = o.parent) out.unshift(o.userData.name || o.name);
  return out;
}

/** Splits a loaded asset scene into runtime meshes, _inspect meshes, _col meshes and socket_* nodes. */
export function splitAssetScene(root) {
  const parts = { runtime: [], inspect: [], collision: [], sockets: new Map() };
  root.traverse((o) => {
    if (o === root) return;
    const cls = classifyPath(namePath(root, o));
    const own = o.userData.name || o.name;
    if (cls === 'socket' && /^socket_/.test(own)) { parts.sockets.set(own, o); return; }
    if (!o.isMesh) return;
    if (cls === 'collision') parts.collision.push(o);
    else if (cls === 'inspect') parts.inspect.push(o);
    else if (cls === 'runtime') parts.runtime.push(o);
  });
  return parts;
}

export function triangleCount(geometry) {
  if (!geometry) return 0;
  return geometry.index ? geometry.index.count / 3 : (geometry.attributes.position ? geometry.attributes.position.count / 3 : 0);
}

/** Measurements for the review page, the HUD and art QA. */
export function analyzeAssetScene(root) {
  root.updateMatrixWorld(true);
  const parts = splitAssetScene(root);
  const variant = (meshes) => {
    const box = new THREE.Box3();
    let triangles = 0;
    const mats = new Set();
    for (const m of meshes) {
      triangles += triangleCount(m.geometry); box.expandByObject(m);
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (mat) mats.add(mat.uuid);
    }
    return { meshes: meshes.length, triangles, materials: mats.size, bounds: meshes.length ? { min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new THREE.Vector3()).toArray() } : null };
  };
  const materials = new Map(), textures = new Map();
  for (const m of [...parts.runtime, ...parts.inspect]) {
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (!mat) continue;
      materials.set(mat.uuid, mat.name || '(unnamed)');
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'transmissionMap', 'clearcoatNormalMap']) {
        const t = mat[key];
        if (t && t.image && !textures.has(t.uuid)) textures.set(t.uuid, { slot: key, name: t.name || '', width: t.image.width, height: t.image.height });
      }
    }
  }
  const runtime = variant(parts.runtime);
  const sockets = [...parts.sockets.entries()].map(([name, o]) => {
    const wp = o.getWorldPosition(new THREE.Vector3());
    return { name, role: socketRole(name, o.userData), position: wp.toArray().map((v) => +v.toFixed(4)), extras: { ...o.userData, name: undefined } };
  });
  return {
    runtime, inspect: variant(parts.inspect), collision: variant(parts.collision),
    materials: [...materials.values()], textures: [...textures.values()], sockets,
    minY: runtime.bounds ? runtime.bounds.min[1] : null,
  };
}

/** World-space triangle soup of a set of meshes (for the physics world). */
export function meshesToTriangles(meshes) {
  const out = [];
  const v = new THREE.Vector3();
  for (const m of meshes) {
    m.updateWorldMatrix(true, false);
    const pos = m.geometry.attributes.position, idx = m.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
      out.push(v.x, v.y, v.z);
    }
  }
  return out;
}

/* ---------- library ---------- */

let sharedLoader = null;
let ktx2Loader = null;

/** Enables KTX2 (Basis Universal) textures; call once with the renderer before loading models. */
export function configureTextureSupport(renderer) {
  if (!ktx2Loader) ktx2Loader = new KTX2Loader().setTranscoderPath(`${BASE}basis/`);
  ktx2Loader.detectSupport(renderer);
  if (sharedLoader) sharedLoader.setKTX2Loader(ktx2Loader);
}

function loader() {
  if (!sharedLoader) {
    sharedLoader = new GLTFLoader();
    sharedLoader.setMeshoptDecoder(MeshoptDecoder);
    if (ktx2Loader) sharedLoader.setKTX2Loader(ktx2Loader);
  }
  return sharedLoader;
}

/** Fetches and parses one model; rejects with a readable error (404, not a GLB, parse failure). */
export async function fetchGltf(name, { onProgress } = {}) {
  const url = versionedModelUrl(name, BASE, MODEL_FILES[name]);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let buffer;
  if (res.body && onProgress) {
    const reader = res.body.getReader(); const chunks = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress(got, total); }
    const all = new Uint8Array(got); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
    buffer = all.buffer;
  } else buffer = await res.arrayBuffer();
  const magic = new DataView(buffer).getUint32(0, true);
  if (buffer.byteLength < 12 || magic !== 0x46546c67) throw new Error(`${url}: not a binary glTF (.glb)`);
  const gltf = await loader().parseAsync(buffer, url.slice(0, url.split('?')[0].lastIndexOf('/') + 1));
  return { gltf, bytes: buffer.byteLength };
}

/** Whether the build ships a model file for this name (any variant falls back to the base file). */
export function hasModelFile(name) { return !!MODEL_FILES[name]; }

/** fetchGltf shared per name: a model started early (Iris, QA-030) is not downloaded twice. Callers clone the scene. */
export const prefetchGltf = createPrefetch((name) => fetchGltf(name));

export class AssetLibrary {
  /**
   * @param {{available?:Record<string,number>, onTemplate?:(name:string, scene:THREE.Object3D)=>void}} o
   *   onTemplate: look-dev hook run once per parsed template (material upgrades), before instances clone it.
   */
  /**
   * The file an asset name resolves to: review override, then the texture variant ('_m' on phones and the low
   * tier, or for the light first pass on desktop), each only when the build ships that file.
   */
  fileFor(name, { lite = false } = {}) {
    const base = modelOverrides[name] && this.available[modelOverrides[name]] ? modelOverrides[name] : name;
    const variant = modelVariant || (lite ? '_m' : '');
    return variant && this.available[base + variant] ? base + variant : base;
  }

  /** Whether a lighter file than the full one exists for this asset (desktop light-first pass). */
  hasLite(name) { const e = this.entries.get(name); return !!e && !e.inspectOf && !modelVariant && this.fileFor(name, { lite: true }) !== this.fileFor(name); }

  /** Build-time size in bytes of the file the next load of this asset fetches (variant, override and light-first aware), or undefined. */
  bytesOf(name) {
    const e = this.entries.get(name);
    const lite = this.liteFirst && this.hasLite(name) && !(e && e.full);
    const v = this.available[this.fileFor(name, { lite })];
    return typeof v === 'number' ? v : undefined;
  }

  constructor({ available = MODEL_FILES, onTemplate = null } = {}) {
    this.entries = new Map();
    this.onTemplate = onTemplate;
    this.available = available;
    /** Desktop light-first pass: load `<name>_m.glb` first, the streamer upgrades to the full file later. */
    this.liteFirst = false;
    for (const def of ASSETS) {
      const bytes = available[def.name];
      this.entries.set(def.name, { name: def.name, def, bytes: bytes || 0, state: bytes ? 'idle' : 'absent', template: null, stats: null, error: null, loadMs: 0, progress: 0 });
      // Optional separate close-up file <name>_inspect.glb, streamed only while the player inspects.
      const ib = available[def.name + '_inspect'];
      if (ib) this.entries.set(def.name + '_inspect', { name: def.name + '_inspect', def, bytes: ib, state: 'idle', template: null, stats: null, error: null, loadMs: 0, progress: 0, inspectOf: def.name });
    }
  }

  get(name) { return this.entries.get(name); }

  /** Name of the separate inspect file for an asset, if the build lists one. */
  inspectName(name) { return this.entries.has(name + '_inspect') ? name + '_inspect' : null; }

  /** Fetches and prepares one template without touching the entry (used by load and by the light-first upgrade). */
  async fetchTemplate(name, file, onProgress) {
    const e = this.entries.get(name);
    const { gltf, bytes } = await fetchGltf(file, { onProgress });
    const scene = gltf.scene;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
    });
    if (this.onTemplate) this.onTemplate((e && e.inspectOf) || name, scene);
    return { scene, bytes, stats: analyzeAssetScene(scene) };
  }

  async load(name) {
    const e = this.entries.get(name);
    if (!e || !isValidModelName(name)) throw new Error('unknown asset ' + name);
    e.state = 'loading'; e.progress = 0;
    const t0 = performance.now();
    try {
      const lite = this.liteFirst && this.hasLite(name);
      const t = await this.fetchTemplate(name, this.fileFor(name, { lite }), (got, total) => { e.progress = total ? got / total : 0; });
      e.template = t.scene;
      e.stats = t.stats;
      e.bytes = t.bytes;
      e.lite = lite; e.full = !lite;
      e.loadMs = performance.now() - t0;
      return e;
    } catch (err) {
      e.state = 'failed'; e.error = String(err && err.message ? err.message : err);
      console.warn('[assets]', e.error);
      throw err;
    }
  }

  /** The full-resolution template of an asset that currently shows its light file (the entry is not changed). */
  loadFull(name) { return this.fetchTemplate(name, this.fileFor(name)); }

  /** Replaces an entry's template (light -> full); the caller has moved every instance over. Frees the old one. */
  adopt(name, t) {
    const e = this.entries.get(name);
    if (!e) return;
    const old = e.template;
    e.template = t.scene; e.stats = t.stats; e.bytes = t.bytes; e.lite = false; e.full = true;
    if (old) disposeTemplate(old);
  }

  /** Frees GPU and CPU memory of a template (all instances must have detached first). */
  dispose(name) {
    const e = this.entries.get(name);
    if (!e || !e.template) return;
    disposeTemplate(e.template);
    e.template = null; e.stats = null; e.state = 'idle'; e.lite = false; e.full = false;
  }
}

/** Frees the geometries, materials and textures of a parsed template. */
export function disposeTemplate(template) {
  const seen = new Set();
  template.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!mat || seen.has(mat)) continue;
      seen.add(mat);
      for (const v of Object.values(mat)) if (v && v.isTexture) v.dispose();
      mat.dispose();
    }
  });
}

/* ---------- placed instances ---------- */

let nextId = 1;

export class PropInstance {
  /**
   * @param {{name:string, scene:THREE.Object3D, world:import('../physics/collision.js').CollisionWorld,
   *          position?:number[], rotationY?:number}} o
   */
  constructor({ name, scene, world, position = [0, 0, 0], rotationY = 0 }) {
    this.id = 'prop' + nextId++;
    this.name = name;
    this.def = assetByName(name) || { name, kind: 'hero', label: name, height: 1, radius: 1 };
    this.world = world;
    this.root = new THREE.Group();
    this.root.name = name + '#' + this.id;
    this.root.position.set(...position);
    this.root.rotation.y = rotationY;
    scene.add(this.root);
    this.root.updateMatrixWorld(true);

    const grey = buildGreybox(name);
    this.greybox = grey.object;
    this.greySockets = grey.sockets;
    this.greyColliders = grey.colliders.map((c) => ({ tris: transformTriangles(c.tris, this.root.matrixWorld.elements), mask: c.mask }));
    this.root.add(this.greybox);

    this.real = null;
    this.parts = null;
    this.inspectReal = null;
    this.sockets = this.greySockets;
    this.inspecting = false;
    this.socketListeners = [];
    this.center = new THREE.Vector3(position[0], position[1] + this.def.height / 2, position[2]);
    this.radius = this.def.radius;
    this.addColliders('grey', this.greyColliders);
  }

  get isReal() { return !!this.real; }

  addColliders(tag, list) {
    for (const c of list) this.world.addTriangles(this.id + ':' + tag, c.tris, c.mask);
  }

  /** Called with the current socket map whenever it changes (greybox <-> real). */
  onSockets(fn) { this.socketListeners.push(fn); fn(this.sockets, this); }

  emitSockets() { for (const fn of this.socketListeners) fn(this.sockets, this); }

  /** Replaces the greybox with a clone of the loaded template. */
  showReal(template) {
    if (this.real) return;
    const real = template.clone(true);
    this.root.add(real);
    this.root.updateMatrixWorld(true);
    const parts = splitAssetScene(real);
    for (const m of parts.collision) m.visible = false;
    const colTris = parts.collision.length ? meshesToTriangles(parts.collision) : null;
    this.world.removeOwner(this.id + ':grey');
    if (colTris) this.world.addTriangles(this.id + ':col', colTris, MASK_ALL);
    else this.addColliders('grey', this.greyColliders); // no _col in the file: keep the greybox colliders
    this.greybox.visible = false;
    this.real = real; this.parts = parts;
    this.sockets = parts.sockets.size ? parts.sockets : this.greySockets;
    // Bounds from the real meshes (runtime variant) for streaming and inspection framing.
    const box = new THREE.Box3();
    for (const m of parts.runtime) box.expandByObject(m);
    if (!box.isEmpty()) { const s = box.getBoundingSphere(new THREE.Sphere()); this.center.copy(s.center); this.radius = Math.max(s.radius, 0.1); }
    this.setInspect(this.inspecting, true);
    this.emitSockets();
  }

  /** Light -> full: the same model with its full-resolution textures takes over in one step (no greybox frame). */
  swapReal(template) {
    if (!this.real) { this.showReal(template); return; }
    this.showGreybox();
    this.showReal(template);
  }

  /** Back to the greybox (asset released or evicted). */
  showGreybox() {
    if (!this.real) return;
    if (this.inspectReal) { this.root.remove(this.inspectReal); this.inspectReal = null; }
    this.world.removeOwner(this.id + ':col');
    this.world.removeOwner(this.id + ':grey');
    this.addColliders('grey', this.greyColliders);
    this.root.remove(this.real);
    this.real = null; this.parts = null;
    this.greybox.visible = true;
    this.sockets = this.greySockets;
    this.center.set(this.root.position.x, this.root.position.y + this.def.height / 2, this.root.position.z);
    this.radius = this.def.radius;
    this.emitSockets();
  }

  setInspect(on, force = false) {
    if (!force && on === this.inspecting) return;
    this.inspecting = on;
    if (!on && this.inspectReal) this.hideInspectFile();
    if (!this.parts) return;
    const hasInspect = this.parts.inspect.length > 0 || !!this.inspectReal;
    if (!hasInspect) return;
    for (const m of this.parts.runtime) m.visible = !on;
    for (const m of this.parts.inspect) m.visible = on;
  }

  /** Shows a streamed <name>_inspect.glb template in place of the runtime meshes (streamer-driven). */
  showInspectFile(template) {
    if (this.inspectReal || !this.real) return;
    const real = template.clone(true);
    real.name = this.name + '_inspect_file';
    real.traverse((o) => { if (o.isMesh && classifyPath(namePath(real, o)) === 'collision') o.visible = false; });
    this.root.add(real);
    this.inspectReal = real;
    for (const m of this.parts.runtime) m.visible = false;
    for (const m of this.parts.inspect) m.visible = false;
  }

  hideInspectFile() {
    if (!this.inspectReal) return;
    this.root.remove(this.inspectReal);
    this.inspectReal = null;
    if (this.parts) this.setInspect(this.inspecting, true);
  }

  /** Runtime <-> _inspect by camera distance, with hysteresis. */
  updateLod(cameraPos) {
    const d = this.def.inspectDistance;
    if (!d) return;
    const dist = cameraPos.distanceTo(this.center);
    if (!this.inspecting && dist < d * 0.9) this.setInspect(true);
    else if (this.inspecting && dist > d) this.setInspect(false);
  }
}

/* ---------- streaming ---------- */

export class AssetStreamer {
  constructor({ library, camera, maxConcurrent = 3, cacheBytes = 512 * 1024 * 1024, interval = 0.25, prefetchRadius = 14, releaseAfter = 8 }) {
    this.library = library; this.camera = camera;
    this.maxConcurrent = maxConcurrent; this.interval = interval; this.prefetchRadius = prefetchRadius; this.releaseAfter = releaseAfter;
    this.instances = [];
    this.byAsset = new Map();
    this.lru = new LruCache(cacheBytes);
    this.timer = 0;
    this.frustum = new THREE.Frustum();
    this.m = new THREE.Matrix4();
    this.sphere = new THREE.Sphere();
    this.unwanted = new Map();
    this.priority = new Map();
    this.events = [];
    /** Light-first upgrades (set by boot-world.js with library.liteFirst): full files replace the light ones when idle. */
    this.upgrade = false;
    this.upgrading = new Set();
    /** Optional GPU warm-up (render/warmup.js): `(template) => Promise`, awaited between download and swap. */
    this.warm = null;
  }

  add(instance) {
    this.instances.push(instance);
    if (!this.byAsset.has(instance.name)) this.byAsset.set(instance.name, []);
    this.byAsset.get(instance.name).push(instance);
    return instance;
  }

  log(msg) { this.events.push({ t: performance.now(), msg }); if (this.events.length > 8) this.events.shift(); }

  update(dt, focus) {
    const cam = this.camera.position;
    for (const inst of this.instances) inst.updateLod(cam);
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.interval;

    this.camera.updateMatrixWorld();
    this.m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);
    const rows = [];
    for (const [name, list] of this.byAsset) {
      const e = this.library.get(name);
      if (!e) continue;
      const ps = list.map((inst) => {
        this.sphere.set(inst.center, inst.radius);
        return instancePriority({
          inFrustum: this.frustum.intersectsSphere(this.sphere),
          distance: Math.max(0, cam.distanceTo(inst.center) - inst.radius),
          radius: inst.radius,
          loadDistance: LOAD_DISTANCE[inst.def.kind] ?? 80,
          focusDistance: focus ? Math.max(0, focus.distanceTo(inst.center) - inst.radius) : Infinity,
          prefetchRadius: this.prefetchRadius,
          bytes: this.library.bytesOf(name),
        });
      });
      const p = assetPriority(ps);
      this.priority.set(name, p);
      const u = p < 0 ? (this.unwanted.get(name) || 0) + this.interval : 0;
      this.unwanted.set(name, u);
      rows.push({ name, state: e.state, priority: p, unwantedFor: u });
    }
    // Separate <name>_inspect.glb files: wanted only while an instance of the asset is being
    // inspected (close camera), released like any other asset once nobody inspects it.
    for (const [name, list] of this.byAsset) {
      const iname = this.library.inspectName(name);
      if (!iname) continue;
      const e = this.library.get(iname);
      const wanted = list.some((inst) => inst.inspecting && inst.real);
      const u = wanted ? 0 : (this.unwanted.get(iname) || 0) + this.interval;
      this.unwanted.set(iname, u);
      this.priority.set(iname, wanted ? 1000 : -1); // hero close-ups jump the queue
      rows.push({ name: iname, state: e.state, priority: wanted ? 1000 : -1, unwantedFor: u });
    }
    const plan = planStreaming(rows, { maxConcurrent: this.maxConcurrent, releaseAfter: this.releaseAfter });
    for (const name of plan.load) this.startLoad(name);
    for (const name of plan.attach) this.attach(name);
    for (const name of plan.release) this.release(name);
    for (const name of this.lru.evict()) { this.library.dispose(name); this.log('evicted ' + name); }
    if (this.upgrade) {
      const up = planUpgrade(rows.map((r) => { const e = this.library.get(r.name); return { ...r, state: e.state, lite: !!e.lite, upgrading: this.upgrading.has(r.name) }; }));
      if (up) this.startUpgrade(up);
    }
  }

  /** Light-first: fetch the full file of a shown asset, warm it, then swap it in behind the player's back. */
  startUpgrade(name) {
    this.upgrading.add(name);
    this.log('upgrading ' + name);
    const e = this.library.get(name);
    const lite = e.template;
    this.library.loadFull(name).then(async (t) => {
      if (this.warm) { try { await this.warm(t.scene); } catch { /* swap anyway */ } }
      if (e.template !== lite) { disposeTemplate(t.scene); return; } // released and evicted meanwhile: the next load decides again
      if (e.state === 'loaded') for (const inst of this.targets(name)) inst.swapReal(t.scene);
      this.library.adopt(name, t);
      this.lru.touch(name, t.bytes);
      if (e.state !== 'loaded') this.lru.cool(name);
      this.log(`upgraded ${name} (${(t.bytes / 1048576).toFixed(1)} MB)`);
    }).catch(() => { this.log('upgrade failed ' + name); e.lite = false; /* keep the light file, do not retry in a loop */ })
      .finally(() => { this.upgrading.delete(name); });
  }

  /** Instances that an entry attaches to: the asset's own, or (for an _inspect file) the inspecting ones. */
  targets(name) {
    const e = this.library.get(name);
    if (e && e.inspectOf) return (this.byAsset.get(e.inspectOf) || []).filter((inst) => inst.inspecting && inst.real);
    return this.byAsset.get(name) || [];
  }

  startLoad(name) {
    this.log('loading ' + name);
    this.library.load(name).then(async (e) => {
      this.lru.touch(name, e.bytes);
      this.log(`loaded ${name} (${(e.bytes / 1048576).toFixed(1)} MB, ${Math.round(e.loadMs)} ms)`);
      // Textures and shader programs go to the GPU before the swap, spread over frames (no frozen frame on pop-in).
      if (this.warm) { e.state = 'warming'; e.progress = 1; try { await this.warm(e.template); } catch { /* attach anyway */ } }
      if (!e.template) return;
      if ((this.priority.get(name) ?? -1) >= 0) this.attach(name);
      else { e.state = 'cold'; this.lru.cool(name); }
    }).catch(() => { this.log('failed ' + name); });
  }

  attach(name) {
    const e = this.library.get(name);
    if (!e || !e.template) return;
    for (const inst of this.targets(name)) { if (e.inspectOf) inst.showInspectFile(e.template); else inst.showReal(e.template); }
    e.state = 'loaded';
    this.lru.touch(name, e.bytes);
  }

  release(name) {
    const e = this.library.get(name);
    for (const inst of (e && e.inspectOf ? this.byAsset.get(e.inspectOf) : this.byAsset.get(name)) || []) { if (e && e.inspectOf) inst.hideInspectFile(); else inst.showGreybox(); }
    if (e) e.state = 'cold';
    this.lru.cool(name);
    this.log('released ' + name);
  }

  stats() {
    const s = { absent: 0, idle: 0, loading: 0, warming: 0, loaded: 0, cold: 0, failed: 0, cachedBytes: this.lru.bytes, list: [] };
    const names = [...this.byAsset.keys()];
    for (const name of [...names]) { const i = this.library.inspectName(name); if (i) names.push(i); }
    for (const name of names) {
      const e = this.library.get(name);
      s[e.state] = (s[e.state] || 0) + 1;
      s.list.push({ name, state: e.state, lite: !!e.lite, progress: e.progress, priority: this.priority.get(name) ?? -1, error: e.error, bytes: this.library.bytesOf(name) });
    }
    return s;
  }
}
