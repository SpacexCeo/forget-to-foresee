// Skillshot visuals for the field outside the town walls (docs/town.md, "Outside the walls"). The look follows
// achrefelouafi/LinearAbiltyCastingThreeJS (MIT): a MOBA-style aim arrow or targeting circle drawn by a shader on
// the ground, and fully procedural casts — no textures, no meshes on disk. This is a compact rewrite for the town,
// not a copy: two casts, ground-conforming indicators (the hillside is not flat), one draw call per part.
//
//   Frost Lance  (line cast)  a fracture front races along the line and ice crystals tear up out of the ground
//                             behind it, small at Iris's feet and opening into tall blades at the far end.
//   Storm Snare  (far cast)   a leash of current to the point, the ring snaps open past its radius and settles,
//                             a violet column re-strikes in the middle, tendrils crawl to the rim, then it collapses.
import * as THREE from 'three';

export const CASTS = Object.freeze({
  lance: Object.freeze({ shape: 'line', range: 13, minRange: 0, width: 1.5, cooldown: 1.1, hold: 1.5 }),
  snare: Object.freeze({ shape: 'circle', range: 14, minRange: 0, radius: 3.2, cooldown: 2.4, hold: 1.7 }),
});

const LIFT = 0.07; // decals float this far above the sampled ground
const easeOutBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const clamp01 = (t) => Math.min(1, Math.max(0, t));

/** Deterministic small PRNG (mulberry32): the casts look different every time, but a seed replays one. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------- ground decals (aim arrow, circle, rime, burn) ---------- */

const DECAL_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Arrow: uv.x across (-1..1), uv.y along in metres; uLen the length. Body band with bright edges, scrolling
// chevrons and a head at the far end. uBad turns it red (aimed inside the minimum range).
const ARROW_FRAG = /* glsl */`
uniform float uTime, uLen, uBad, uAlpha;
varying vec2 vUv;
void main() {
  float x = abs(vUv.x), y = vUv.y, head = 1.6;
  float bodyW = 0.42;
  float inHead = step(uLen - head, y);
  float headW = (uLen - y) / head;                               // 1 at the base of the head, 0 at the tip
  float w = mix(bodyW, headW, inHead);
  float inside = step(x, w) * step(0.0, y) * step(y, uLen);
  float edge = smoothstep(w - 0.12, w - 0.02, x) * inside;
  float chev = fract((y - abs(vUv.x) * 0.9) * 0.9 - uTime * 1.4);
  float chevron = smoothstep(0.0, 0.08, chev) * (1.0 - smoothstep(0.18, 0.3, chev)) * (1.0 - inHead);
  float fadeIn = smoothstep(0.0, 1.2, y);
  vec3 good = vec3(0.55, 0.88, 1.0), bad = vec3(1.0, 0.32, 0.25);
  vec3 col = mix(good, bad, uBad);
  float a = inside * (0.16 + 0.5 * edge + 0.22 * chevron + 0.35 * inHead) * fadeIn;
  gl_FragColor = vec4(col * (1.0 + edge), a * uAlpha);
}`;

// Circle: uv in -1..1 over the disc. Thick boundary, faint fill, ticks turning slowly; uReach draws a thin ring.
const CIRCLE_FRAG = /* glsl */`
uniform float uTime, uBad, uAlpha, uThin;
varying vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0);
  float ang = atan(vUv.y - 0.5, vUv.x - 0.5);
  vec3 col = mix(vec3(0.72, 0.6, 1.0), vec3(1.0, 0.32, 0.25), uBad);
  float a;
  if (uThin > 0.5) {
    a = smoothstep(0.955, 0.975, r) * (1.0 - smoothstep(0.99, 1.0, r)) * 0.45;
    a *= 0.6 + 0.4 * step(0.5, fract(ang * 9.549 + uTime * 0.3));
  } else {
    float rim = smoothstep(0.84, 0.88, r) * (1.0 - smoothstep(0.97, 1.0, r));
    float ticks = step(0.72, r) * step(r, 0.8) * step(0.6, fract(ang * 3.82 - uTime * 0.5));
    float fill = (1.0 - smoothstep(0.86, 0.9, r)) * 0.12;
    a = rim * 0.85 + ticks * 0.35 + fill;
  }
  gl_FragColor = vec4(col * 1.2, a * uAlpha);
}`;

// Rime under Frost Lance: frosted streaks along the line, brighter at the edges, melting from the near end.
const RIME_FRAG = /* glsl */`
uniform float uTime, uLen, uFront, uFade;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float x = abs(vUv.x), y = vUv.y;
  float w = 0.55 + 0.45 * clamp(y / uLen, 0.0, 1.0);
  float body = (1.0 - smoothstep(w * 0.7, w, x)) * step(y, uFront) * step(0.0, y);
  float streak = n(vec2(vUv.x * 9.0, y * 1.3)) * n(vec2(vUv.x * 23.0, y * 3.1));
  float front = smoothstep(uFront - 0.8, uFront, y) * step(y, uFront);
  float a = body * (0.25 + 0.7 * streak) * uFade + front * 0.6 * step(uFront, uLen - 0.01);
  gl_FragColor = vec4(vec3(0.7, 0.92, 1.0) * (1.0 + front * 1.5), a);
}`;

// Burn under Storm Snare: a violet disc with a noisy scorch and a hot rim.
const BURN_FRAG = /* glsl */`
uniform float uTime, uFade, uOpen;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 p = vUv * 2.0 - 1.0; float r = length(p) / max(uOpen, 0.001);
  float inside = 1.0 - smoothstep(0.96, 1.0, r);
  float rim = smoothstep(0.82, 0.97, r) * inside;
  float scorch = n(p * 4.0 + uTime * 0.6) * n(p * 9.0 - uTime * 0.9);
  float core = 1.0 - smoothstep(0.0, 0.35, r);
  float a = inside * (0.18 + 0.55 * scorch + 0.8 * rim + 0.6 * core) * uFade;
  vec3 col = mix(vec3(0.55, 0.3, 1.0), vec3(0.95, 0.85, 1.0), rim + core * 0.6);
  gl_FragColor = vec4(col * 1.4, a);
}`;

function decalMaterial(frag, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: DECAL_VERT, fragmentShader: frag, uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

/** A strip along a line, `segs` rows of two vertices; uv.x across (-1..1), uv.y along in metres. */
class GroundStrip {
  constructor(segs, material) {
    this.segs = segs;
    const g = new THREE.BufferGeometry();
    const n = (segs + 1) * 2;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; this.mesh.visible = false;
  }

  /** Lays the strip from `a` toward unit direction `d` (x, z) over `len` metres, `half` wide, on the ground. */
  lay(a, dx, dz, len, half, groundY, widen = 0) {
    const pos = this.mesh.geometry.attributes.position, uv = this.mesh.geometry.attributes.uv;
    const px = -dz, pz = dx;
    for (let i = 0; i <= this.segs; i++) {
      const s = (i / this.segs) * len, w = half * (1 + widen * (s / Math.max(len, 0.01)));
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1, x = a[0] + dx * s + px * w * side, z = a[2] + dz * s + pz * w * side;
        const y = groundY(x, z, a[1]);
        pos.setXYZ(i * 2 + k, x, y + LIFT, z); uv.setXY(i * 2 + k, side, s);
      }
    }
    pos.needsUpdate = true; uv.needsUpdate = true;
  }
}

/** A disc on the ground: `rings` x `spokes` vertices around a centre; uv 0..1 over the bounding square. */
class GroundDisc {
  constructor(rings, spokes, material) {
    this.rings = rings; this.spokes = spokes;
    const g = new THREE.BufferGeometry();
    const n = 1 + rings * spokes;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const uvs = new Float32Array(n * 2); uvs[0] = 0.5; uvs[1] = 0.5;
    const idx = [];
    for (let r = 0; r < rings; r++) for (let s = 0; s < spokes; s++) {
      const rr = (r + 1) / rings, a = (s / spokes) * Math.PI * 2, v = 1 + r * spokes + s;
      uvs[v * 2] = 0.5 + 0.5 * rr * Math.cos(a); uvs[v * 2 + 1] = 0.5 + 0.5 * rr * Math.sin(a);
      const s1 = (s + 1) % spokes;
      if (r === 0) idx.push(0, 1 + s1, 1 + s);
      else { const a0 = 1 + (r - 1) * spokes; idx.push(a0 + s, a0 + s1, v, a0 + s1, 1 + r * spokes + s1, v); }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; this.mesh.visible = false;
  }

  lay(c, radius, groundY) {
    const pos = this.mesh.geometry.attributes.position;
    pos.setXYZ(0, c[0], groundY(c[0], c[2], c[1]) + LIFT, c[2]);
    for (let r = 0; r < this.rings; r++) for (let s = 0; s < this.spokes; s++) {
      const rr = ((r + 1) / this.rings) * radius, a = (s / this.spokes) * Math.PI * 2;
      const x = c[0] + rr * Math.cos(a), z = c[2] + rr * Math.sin(a);
      pos.setXYZ(1 + r * this.spokes + s, x, groundY(x, z, c[1]) + LIFT, z);
    }
    pos.needsUpdate = true;
  }
}

/* ---------- the aim indicator ---------- */

export class AimIndicator {
  constructor(parent) {
    this.u = { uTime: { value: 0 }, uLen: { value: 1 }, uBad: { value: 0 }, uAlpha: { value: 1 } };
    this.arrow = new GroundStrip(24, decalMaterial(ARROW_FRAG, this.u));
    this.cu = { uTime: this.u.uTime, uBad: this.u.uBad, uAlpha: this.u.uAlpha, uThin: { value: 0 } };
    this.circle = new GroundDisc(4, 40, decalMaterial(CIRCLE_FRAG, this.cu));
    this.ru = { uTime: this.u.uTime, uBad: { value: 0 }, uAlpha: this.u.uAlpha, uThin: { value: 1 } };
    this.reach = new GroundDisc(2, 64, decalMaterial(CIRCLE_FRAG, this.ru));
    parent.add(this.arrow.mesh, this.circle.mesh, this.reach.mesh);
  }

  hide() { this.arrow.mesh.visible = this.circle.mesh.visible = this.reach.mesh.visible = false; }

  /** Draws the indicator for `cast` from Iris's feet `from` toward `to`; returns where the cast would land. */
  show(cast, from, to, t, groundY) {
    this.u.uTime.value = t;
    const dx = to[0] - from[0], dz = to[2] - from[2], d = Math.hypot(dx, dz) || 1e-3;
    const ux = dx / d, uz = dz / d;
    const reach = Math.min(d, cast.range);
    this.u.uBad.value = d < cast.minRange ? 1 : 0;
    if (cast.shape === 'line') {
      this.circle.mesh.visible = false; this.reach.mesh.visible = false;
      const start = [from[0] + ux * 0.4, from[1], from[2] + uz * 0.4];
      this.u.uLen.value = cast.range - 0.4;
      this.arrow.lay(start, ux, uz, cast.range - 0.4, cast.width / 2, groundY);
      this.arrow.mesh.visible = true;
      return { dir: [ux, uz], point: [from[0] + ux * cast.range, from[1], from[2] + uz * cast.range] };
    }
    this.arrow.mesh.visible = false;
    const c = [from[0] + ux * reach, from[1], from[2] + uz * reach];
    this.circle.lay(c, cast.radius, groundY); this.circle.mesh.visible = true;
    this.reach.lay(from, cast.range + cast.radius * 0.15, groundY); this.reach.mesh.visible = true;
    c[1] = groundY(c[0], c[2], from[1]);
    return { dir: [ux, uz], point: c };
  }

  dispose() { for (const m of [this.arrow.mesh, this.circle.mesh, this.reach.mesh]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); } }
}

/* ---------- shared pieces of the casts ---------- */

/** A hexagonal crystal 1 m tall, 0.2 m across, base at y = 0, with a pyramid tip and a slightly flared foot. */
function crystalGeometry() {
  const pts = [[0, 0], [0.16, 0.02], [0.2, 0.62], [0.0, 1.0]];
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 6);
  return g.toNonIndexed();
}

/** Spark/chip particles: one Points draw call, simulated on the CPU (a few hundred at most). */
class Sparks {
  constructor(parent, max, color, size) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.age = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color, size, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.points.frustumCulled = false; this.points.renderOrder = 4;
    parent.add(this.points);
  }

  emit(x, y, z, count, speed, up, life, rand) {
    for (let i = 0; i < count; i++) {
      let k = this.n < this.max ? this.n++ : Math.floor(rand() * this.max);
      const a = rand() * Math.PI * 2, s = speed * (0.35 + rand() * 0.65);
      this.p.set([x, y, z], k * 3);
      this.v.set([Math.cos(a) * s, up * (0.4 + rand() * 0.8), Math.sin(a) * s], k * 3);
      this.life[k] = life * (0.6 + rand() * 0.6); this.age[k] = 0;
    }
  }

  update(dt) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) continue;
      const o = i * 3;
      this.v[o + 1] -= 9.8 * dt * 0.6;
      this.p[o] += this.v[o] * dt; this.p[o + 1] += this.v[o + 1] * dt; this.p[o + 2] += this.v[o + 2] * dt;
      if (w !== i) { this.p.copyWithin(w * 3, o, o + 3); this.v.copyWithin(w * 3, o, o + 3); this.life[w] = this.life[i]; this.age[w] = this.age[i]; }
      w++;
    }
    this.n = w;
    this.points.geometry.setDrawRange(0, this.n);
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  dispose() { this.points.removeFromParent(); this.points.geometry.dispose(); this.points.material.dispose(); }
}

/** Camera-facing ribbons for lightning: `bolts` polylines of `pts` points each, rewritten on every re-strike. */
class Bolts {
  constructor(parent, bolts, pts, color) {
    this.bolts = bolts; this.pts = pts;
    const n = bolts * pts * 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let b = 0; b < bolts; b++) for (let i = 0; i < pts - 1; i++) { const a = (b * pts + i) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uFade: { value: 1 } },
      vertexShader: 'attribute float alpha; varying float vA; void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uFade; varying float vA; void main() { gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.45) * 2.0, vA * uFade); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.visible = false;
    this.line = new Float32Array(pts * 3);
    parent.add(this.mesh);
  }

  /** Writes bolt `b` from a to b: midpoint-displaced, `jag` metres of jitter, `width` metres wide, facing `eye`. */
  strike(b, a, z, jag, width, eye, rand, lift = null) {
    const P = this.pts, L = this.line;
    for (let i = 0; i < P; i++) {
      const t = i / (P - 1), env = Math.sin(Math.PI * t);
      L[i * 3] = a[0] + (z[0] - a[0]) * t + (rand() - 0.5) * 2 * jag * env;
      L[i * 3 + 1] = a[1] + (z[1] - a[1]) * t + (rand() - 0.5) * 2 * jag * env;
      L[i * 3 + 2] = a[2] + (z[2] - a[2]) * t + (rand() - 0.5) * 2 * jag * env;
      if (lift) L[i * 3 + 1] = lift(L[i * 3], L[i * 3 + 2]) + 0.12 + rand() * 0.18;
    }
    const pos = this.mesh.geometry.attributes.position, al = this.mesh.geometry.attributes.alpha;
    for (let i = 0; i < P; i++) {
      const j = Math.min(P - 1, i + 1), k = Math.max(0, i - 1);
      const tx = L[j * 3] - L[k * 3], ty = L[j * 3 + 1] - L[k * 3 + 1], tz = L[j * 3 + 2] - L[k * 3 + 2];
      const vx = eye.x - L[i * 3], vy = eye.y - L[i * 3 + 1], vz = eye.z - L[i * 3 + 2];
      let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
      const sl = Math.hypot(sx, sy, sz) || 1, w = width * (0.55 + 0.45 * Math.sin(Math.PI * (i / (P - 1)) * 0.9 + 0.15)) / sl;
      sx *= w; sy *= w; sz *= w;
      const v = (b * P + i) * 2;
      pos.setXYZ(v, L[i * 3] - sx, L[i * 3 + 1] - sy, L[i * 3 + 2] - sz);
      pos.setXYZ(v + 1, L[i * 3] + sx, L[i * 3 + 1] + sy, L[i * 3 + 2] + sz);
      al.setX(v, 0.9); al.setX(v + 1, 0.9);
    }
    pos.needsUpdate = true; al.needsUpdate = true;
  }

  /** Hides bolt `b` (zero alpha). */
  clear(b) { const al = this.mesh.geometry.attributes.alpha; for (let i = 0; i < this.pts * 2; i++) al.setX(b * this.pts * 2 + i, 0); al.needsUpdate = true; }

  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

/* ---------- Frost Lance ---------- */

const LANCE_CRYSTALS = 40, LANCE_SPEED = 26; // crystals per cast, m/s of the fracture front

class FrostLance {
  constructor(parent) {
    this.group = new THREE.Group(); this.group.name = 'cast_frost_lance'; parent.add(this.group);
    this.mat = new THREE.MeshStandardMaterial({ color: 0xa8dcff, emissive: 0x2f8fe8, emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.92, flatShading: true });
    this.mesh = new THREE.InstancedMesh(crystalGeometry(), this.mat, LANCE_CRYSTALS);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.ru = { uTime: { value: 0 }, uLen: { value: 1 }, uFront: { value: 0 }, uFade: { value: 1 } };
    this.rime = new GroundStrip(28, decalMaterial(RIME_FRAG, this.ru));
    this.chips = new Sparks(this.group, 260, 0xd8f2ff, 0.09);
    this.light = new THREE.PointLight(0x7cc8ff, 0, 9, 2); this.light.castShadow = false;
    this.group.add(this.mesh, this.rime.mesh, this.light);
    this.cast = null;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
  }

  get busy() { return !!this.cast || this.chips.n > 0; }

  fire(from, dir, cfg, groundY, seed) {
    const rand = rng(seed), len = cfg.range;
    const crystals = [];
    for (let i = 0; i < LANCE_CRYSTALS; i++) {
      const cluster = i >= LANCE_CRYSTALS - 8; // the cluster thrown up around the far end
      const t = cluster ? 0.9 + rand() * 0.12 : 0.06 + (i / (LANCE_CRYSTALS - 8)) * 0.86;
      const along = t * len, spread = (cluster ? 1.1 : 0.25 + 0.75 * t) * cfg.width * 0.5;
      const side = (rand() - 0.5) * 2 * spread;
      const x = from[0] + dir[0] * along - dir[1] * side, z = from[2] + dir[1] * along + dir[0] * side;
      const h = (0.55 + 2.1 * Math.pow(t, 1.3)) * (0.7 + rand() * 0.5) * (cluster ? 1.15 : 1);
      crystals.push({
        x, z, y: groundY(x, z, from[1]) - 0.05, h, r: (0.7 + t * 1.6) * (0.8 + rand() * 0.4),
        // lean away from the line, a little forward, random twist
        lean: (side >= 0 ? 1 : -1) * (0.12 + rand() * 0.35), pitch: 0.1 + rand() * 0.25, twist: rand() * Math.PI,
        born: along / LANCE_SPEED, sink: cfg.hold + t * 0.35 + rand() * 0.15,
      });
    }
    this.u = cfg;
    this.cast = { from: from.slice(), dir, len, t: 0, crystals, rand, emitted: 0 };
    this.mesh.count = LANCE_CRYSTALS;
    this.rime.lay(from, dir[0], dir[1], len, cfg.width * 0.62, groundY);
    this.ru.uLen.value = len; this.rime.mesh.visible = true;
  }

  update(dt, t, reducedMotion) {
    this.chips.update(dt);
    const c = this.cast;
    if (!c) return;
    c.t += dt;
    const front = Math.min(c.len, c.t * LANCE_SPEED);
    this.ru.uTime.value = t; this.ru.uFront.value = front;
    const end = this.u.hold + 0.9;
    this.ru.uFade.value = 1 - clamp01((c.t - this.u.hold) / 0.9);
    // the front light runs with the fracture, then sits in the cluster and fades
    const lx = c.from[0] + c.dir[0] * front, lz = c.from[2] + c.dir[1] * front;
    this.light.position.set(lx, c.from[1] + 1.2, lz);
    this.light.intensity = 9 * (1 - clamp01((c.t - this.u.hold * 0.6) / 0.8)) * (reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 40));
    for (let i = 0; i < c.crystals.length; i++) {
      const k = c.crystals[i];
      const age = c.t - k.born;
      let s = 0, drop = 0;
      if (age > 0) {
        s = easeOutBack(clamp01(age / 0.16));
        if (k.emitted !== true) { k.emitted = true; this.chips.emit(k.x, k.y + 0.15, k.z, 5, 2.4 + k.h, 3.2 + k.h, 0.7, c.rand); }
        const sinkT = clamp01((c.t - k.sink) / 0.45);
        if (sinkT > 0) { drop = sinkT * sinkT * k.h * 1.05; s *= 1 - sinkT * 0.25; if (sinkT >= 1) s = 0; }
      }
      this._e.set(k.pitch, k.twist, k.lean, 'YXZ');
      this._q.setFromEuler(this._e);
      this._s.set(k.r * Math.max(s, 1e-4), k.h * Math.max(s, 1e-4), k.r * Math.max(s, 1e-4));
      this._p.set(k.x, k.y - drop, k.z);
      this.mesh.setMatrixAt(i, this._m.compose(this._p, this._q, this._s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (c.t > end) { this.cast = null; this.mesh.count = 0; this.rime.mesh.visible = false; this.light.intensity = 0; }
  }

  dispose() { this.chips.dispose(); this.mesh.geometry.dispose(); this.mat.dispose(); this.rime.mesh.geometry.dispose(); this.rime.mesh.material.dispose(); this.group.removeFromParent(); }
}

/* ---------- Storm Snare ---------- */

const SNARE_COLUMN = 5, SNARE_TENDRILS = 8, SNARE_RIM = 6, SNARE_PTS = 18;

class StormSnare {
  constructor(parent) {
    this.group = new THREE.Group(); this.group.name = 'cast_storm_snare'; parent.add(this.group);
    this.bolts = new Bolts(this.group, 1 + SNARE_COLUMN + SNARE_TENDRILS + SNARE_RIM, SNARE_PTS, 0xa77bff);
    this.bu = { uTime: { value: 0 }, uFade: { value: 0 }, uOpen: { value: 0 } };
    this.burn = new GroundDisc(5, 40, decalMaterial(BURN_FRAG, this.bu));
    this.sparks = new Sparks(this.group, 220, 0xe2d4ff, 0.08);
    this.light = new THREE.PointLight(0xa070ff, 0, 14, 2); this.light.castShadow = false;
    this.group.add(this.burn.mesh, this.light);
    this.cast = null;
    this._eye = new THREE.Vector3();
  }

  get busy() { return !!this.cast || this.sparks.n > 0; }

  fire(hand, point, cfg, groundY, seed) {
    this.cfg = cfg;
    this.cast = { hand: hand.slice(), point: point.slice(), t: 0, strikeIn: 0, rand: rng(seed), groundY, snapped: false };
    this.burn.lay(point, cfg.radius * 1.2, groundY); // the shader opens it from the middle (uOpen)
    this.burn.mesh.visible = true; this.bolts.mesh.visible = true;
  }

  update(dt, t, camera, reducedMotion) {
    this.sparks.update(dt);
    const c = this.cast;
    if (!c) return;
    c.t += dt;
    const cfg = this.cfg, R = cfg.radius, leash = 0.2, snap = 0.28, hold = cfg.hold, out = 0.35;
    const k = c.t - leash; // time since the leash landed
    // ring: snaps open past its radius and pulls back onto it, holds, collapses to a thread
    const open = k < 0 ? 0 : k < snap ? easeOutBack(k / snap) : 1;
    const fade = k < hold ? 1 : 1 - clamp01((k - hold) / out);
    this.bu.uTime.value = t; this.bu.uOpen.value = (open / 1.2) * (k < hold ? 1 : 1 - 0.6 * clamp01((k - hold) / out)); this.bu.uFade.value = (k < 0 ? 0 : 1) * fade;
    this.bolts.mat.uniforms.uFade.value = fade;
    const p = c.point, rand = c.rand;
    this.light.position.set(p[0], p[1] + 2.2, p[2]);
    this.light.intensity = k < 0 ? 0 : 14 * fade * (reducedMotion ? 1 : 0.7 + 0.3 * rand());
    if (!c.snapped && k >= 0) { c.snapped = true; this.sparks.emit(p[0], p[1] + 0.3, p[2], 60, 6, 6, 0.9, rand); }
    if ((c.strikeIn -= dt) <= 0) {
      c.strikeIn = reducedMotion ? 0.22 : 0.05 + rand() * 0.04; // re-strike
      camera.getWorldPosition(this._eye);
      const eye = this._eye, gy = c.groundY;
      let b = 0;
      // the leash: from the hand to the point, only before the ring opens and for a beat after
      if (k < 0.12) this.bolts.strike(b++, c.hand, [p[0], p[1] + 0.2, p[2]], 0.35, 0.07, eye, rand); else this.bolts.clear(b++);
      const r = R * open;
      for (let i = 0; i < SNARE_COLUMN; i++) {
        if (k < 0) { this.bolts.clear(b++); continue; }
        const a = rand() * Math.PI * 2, top = 6 + rand() * 3;
        this.bolts.strike(b++, [p[0] + Math.cos(a) * 0.25, p[1], p[2] + Math.sin(a) * 0.25], [p[0] + Math.cos(a) * 0.6, p[1] + top, p[2] + Math.sin(a) * 0.6], 0.35, i === 0 ? 0.16 : 0.07, eye, rand);
      }
      for (let i = 0; i < SNARE_TENDRILS; i++) {
        if (k < 0 || rand() < 0.25) { this.bolts.clear(b++); continue; }
        const a = (i / SNARE_TENDRILS) * Math.PI * 2 + rand() * 0.5;
        this.bolts.strike(b++, [p[0], p[1], p[2]], [p[0] + Math.cos(a) * r, p[1], p[2] + Math.sin(a) * r], 0.45, 0.05, eye, rand, (x, z) => gy(x, z, p[1]));
      }
      for (let i = 0; i < SNARE_RIM; i++) {
        if (k < 0 || rand() < 0.35) { this.bolts.clear(b++); continue; }
        const a0 = rand() * Math.PI * 2, a1 = a0 + 0.6 + rand() * 0.6;
        this.bolts.strike(b++, [p[0] + Math.cos(a0) * r, p[1], p[2] + Math.sin(a0) * r], [p[0] + Math.cos(a1) * r, p[1], p[2] + Math.sin(a1) * r], 0.3, 0.05, eye, rand, (x, z) => gy(x, z, p[1]));
      }
      if (k > 0 && k < hold && !reducedMotion) {
        const a = rand() * Math.PI * 2;
        this.sparks.emit(p[0] + Math.cos(a) * r * 0.95, p[1] + 0.2, p[2] + Math.sin(a) * r * 0.95, 3, 1.5, 2.5, 0.5, rand);
      }
    }
    if (k > hold + out) { this.cast = null; this.burn.mesh.visible = false; this.bolts.mesh.visible = false; this.light.intensity = 0; }
  }

  dispose() { this.sparks.dispose(); this.bolts.dispose(); this.burn.mesh.geometry.dispose(); this.burn.mesh.material.dispose(); this.group.removeFromParent(); }
}

/** Every cast effect of the field, pooled one per kind (a recast restarts it). */
export function createCastEffects(parent) {
  const group = new THREE.Group(); group.name = 'town_casting'; parent.add(group);
  const aim = new AimIndicator(group);
  const lance = new FrostLance(group), snare = new StormSnare(group);
  let seed = 1;
  return {
    group, aim,
    get busy() { return lance.busy || snare.busy; },
    fire(id, { from, hand, dir, point, groundY }) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      if (id === 'lance') lance.fire(from, dir, CASTS.lance, groundY, seed);
      else snare.fire(hand, point, CASTS.snare, groundY, seed);
    },
    update(dt, t, camera, reducedMotion) { lance.update(dt, t, reducedMotion); snare.update(dt, t, camera, reducedMotion); },
    dispose() { aim.dispose(); lance.dispose(); snare.dispose(); group.removeFromParent(); },
  };
}
