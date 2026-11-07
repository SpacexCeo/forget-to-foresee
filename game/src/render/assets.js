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
import { ASSETS, LOAD_DISTANCE, assetByName, classifyPath, isValidModelName, modelUrl, socketRole } from './asset-catalog.js';
import { instancePriority, assetPriority, planStreaming, LruCache } from './streaming.js';
import { buildGreybox } from './greybox.js';
import { transformTriangles, MASK_ALL } from '../physics/collision.js';

const BASE = import.meta.env.BASE_URL || '/';

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
  const url = modelUrl(name, BASE);
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
  const gltf = await loader().parseAsync(buffer, url.slice(0, url.lastIndexOf('/') + 1));
  return { gltf, bytes: buffer.byteLength };
}

export class AssetLibrary {
  constructor({ available = MODEL_FILES } = {}) {
    this.entries = new Map();
    for (const def of ASSETS) {
      const bytes = available[def.name];
      this.entries.set(def.name, { name: def.name, def, bytes: bytes || 0, state: bytes ? 'idle' : 'absent', template: null, stats: null, error: null, loadMs: 0, progress: 0 });
    }
  }

  get(name) { return this.entries.get(name); }

  async load(name) {
    const e = this.entries.get(name);
    if (!e || !isValidModelName(name)) throw new Error('unknown asset ' + name);
    e.state = 'loading'; e.progress = 0;
    const t0 = performance.now();
    try {
      const { gltf, bytes } = await fetchGltf(name, { onProgress: (got, total) => { e.progress = total ? got / total : 0; } });
      const scene = gltf.scene;
      scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
      });
      e.template = scene;
      e.stats = analyzeAssetScene(scene);
      e.bytes = bytes;
      e.loadMs = performance.now() - t0;
      return e;
    } catch (err) {
      e.state = 'failed'; e.error = String(err && err.message ? err.message : err);
      console.warn('[assets]', e.error);
      throw err;
    }
  }

  /** Frees GPU and CPU memory of a template (all instances must have detached first). */
  dispose(name) {
    const e = this.entries.get(name);
    if (!e || !e.template) return;
    const seen = new Set();
    e.template.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry?.dispose();
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!mat || seen.has(mat)) continue;
        seen.add(mat);
        for (const v of Object.values(mat)) if (v && v.isTexture) v.dispose();
        mat.dispose();
      }
    });
    e.template = null; e.stats = null; e.state = 'idle';
  }
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

  /** Back to the greybox (asset released or evicted). */
  showGreybox() {
    if (!this.real) return;
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
    if (!this.parts || !this.parts.inspect.length) return;
    for (const m of this.parts.runtime) m.visible = !on;
    for (const m of this.parts.inspect) m.visible = on;
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
  constructor({ library, camera, maxConcurrent = 2, cacheBytes = 512 * 1024 * 1024, interval = 0.25, prefetchRadius = 14, releaseAfter = 8 }) {
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
        });
      });
      const p = assetPriority(ps);
      this.priority.set(name, p);
      const u = p < 0 ? (this.unwanted.get(name) || 0) + this.interval : 0;
      this.unwanted.set(name, u);
      rows.push({ name, state: e.state, priority: p, unwantedFor: u });
    }
    const plan = planStreaming(rows, { maxConcurrent: this.maxConcurrent, releaseAfter: this.releaseAfter });
    for (const name of plan.load) this.startLoad(name);
    for (const name of plan.attach) this.attach(name);
    for (const name of plan.release) this.release(name);
    for (const name of this.lru.evict()) { this.library.dispose(name); this.log('evicted ' + name); }
  }

  startLoad(name) {
    this.log('loading ' + name);
    this.library.load(name).then((e) => {
      this.lru.touch(name, e.bytes);
      if ((this.priority.get(name) ?? -1) >= 0) this.attach(name);
      else { e.state = 'cold'; this.lru.cool(name); }
      this.log(`loaded ${name} (${(e.bytes / 1048576).toFixed(1)} MB, ${Math.round(e.loadMs)} ms)`);
    }).catch(() => { this.log('failed ' + name); });
  }

  attach(name) {
    const e = this.library.get(name);
    if (!e || !e.template) return;
    for (const inst of this.byAsset.get(name) || []) inst.showReal(e.template);
    e.state = 'loaded';
    this.lru.touch(name, e.bytes);
  }

  release(name) {
    const e = this.library.get(name);
    for (const inst of this.byAsset.get(name) || []) inst.showGreybox();
    if (e) e.state = 'cold';
    this.lru.cool(name);
    this.log('released ' + name);
  }

  stats() {
    const s = { absent: 0, idle: 0, loading: 0, loaded: 0, cold: 0, failed: 0, cachedBytes: this.lru.bytes, list: [] };
    for (const name of this.byAsset.keys()) {
      const e = this.library.get(name);
      s[e.state] = (s[e.state] || 0) + 1;
      s.list.push({ name, state: e.state, progress: e.progress, priority: this.priority.get(name) ?? -1, error: e.error });
    }
    return s;
  }
}
