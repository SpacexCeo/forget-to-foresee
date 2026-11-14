// Spell VFX for the heroines' casts (owner 14.11: "no glare and balls of light"): small HDR cores, velocity-stretched
// sparks with a colour-over-life ramp, camera-facing ribbon trails that taper and cool from a white-hot head, and
// spinning wind shurikens whose blade tips draw spiral streaks. Layering after the usual AAA breakdowns (a hot core,
// sparks as stretched billboards, ribbons, secondary embers; nothing big and round): the idea follows three.quarks'
// trail and stretched-billboard renderers (MIT), written fresh here for our pools.
//
// Draw calls are fixed whatever the fight does: one instanced mesh for every streak, one merged mesh for every ribbon,
// one billboard per live ember orb, one blade mesh and one spin-blur disc per live shuriken.
//
//   const spell = createSpellFx({ THREE, parent, scale });       // scale < 1 on phones / low tier: fewer sparks
//   const orb = spell.ember(0xff8a3a); parent.add(orb);           // move orb.position; removeFromParent() ends it
//   const disc = spell.gale(0xc8f0ff); parent.add(disc);
//   spell.impact('ember', [x, y, z], [awayX, awayZ]);
//   spell.update(dt, camera);

const STREAK_VS = /* glsl */`
attribute vec2 corner;
attribute vec3 aPos;
attribute vec3 aVel;
attribute vec4 aCol;
attribute vec2 aSz;
varying vec2 vC;
varying vec4 vCol;
varying float vLen;
void main() {
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  vec2 d = (modelViewMatrix * vec4(aVel, 0.0)).xy;
  float sp = length(d);
  vec2 ax = sp > 1e-4 ? d / sp : vec2(0.0, 1.0);
  vec2 pr = vec2(-ax.y, ax.x);
  float half_ = aSz.x + aSz.y * sp;
  mv.xy += ax * corner.y * half_ + pr * corner.x * aSz.x;
  vC = corner; vCol = aCol; vLen = half_ / max(aSz.x, 1e-4);
  gl_Position = projectionMatrix * mv;
}`;
const STREAK_FS = /* glsl */`
varying vec2 vC;
varying vec4 vCol;
varying float vLen;
void main() {
  float y = vC.y * vLen;
  float dy = max(abs(y) - (vLen - 1.0), 0.0);
  float r2 = vC.x * vC.x + dy * dy;
  float a = exp(-r2 * 4.5) * (1.0 - smoothstep(0.85, 1.0, max(abs(vC.x), abs(vC.y))));
  float head = mix(0.3, 1.0, vC.y * 0.5 + 0.5);              // brightest at the leading end
  float core = exp(-r2 * 26.0);
  vec3 col = vCol.rgb * (0.6 + 0.4 * head) + vec3(1.0, 0.97, 0.9) * core * head * vCol.a * 0.6;
  gl_FragColor = vec4(col, a * vCol.a);
}`;

const RIBBON_VS = /* glsl */`
attribute float aU;
attribute float aX;
attribute vec4 aCol;
attribute float aSeed;
varying float vU;
varying float vX;
varying vec4 vCol;
varying float vSeed;
void main() { vU = aU; vX = aX; vCol = aCol; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIBBON_FS = /* glsl */`
uniform float uTime;
varying float vU;
varying float vX;
varying vec4 vCol;
varying float vSeed;
void main() {
  if (vCol.a <= 0.001) discard;
  float x2 = vX * vX;
  float body = exp(-x2 * 3.2);
  float core = exp(-x2 * 38.0);
  float streak = 0.55 + 0.45 * sin(vX * 9.0 + vSeed * 7.0) * sin(vU * 31.0 - uTime * 14.0 + vSeed * 3.0);
  float life = pow(1.0 - clamp(vU, 0.0, 1.0), 1.6);
  vec3 hot = mix(vec3(1.0, 0.98, 0.92), vCol.rgb, smoothstep(0.0, 0.35, vU));
  vec3 col = hot * (body * streak * 0.9 + core * (1.0 - vU) * 1.4);
  gl_FragColor = vec4(col * vCol.a, life * (body * 0.8 + core) * min(vCol.a, 1.0));
}`;

const FLAME_VS = /* glsl */`
uniform float uSize;
varying vec2 vQ;
void main() {
  vQ = position.xy;
  vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += position.xy * uSize;
  gl_Position = projectionMatrix * c;
}`;
const FLAME_FS = /* glsl */`
uniform float uTime, uSeed;
uniform vec3 uColor;
varying vec2 vQ;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  float r = length(vQ);
  if (r > 1.0) discard;
  float ang = atan(vQ.y, vQ.x);
  float t = uTime * 7.0 + uSeed * 10.0;
  float tongues = n(vec2(ang * 2.2 + uSeed * 5.0, r * 5.0 - t)) * 0.65 + n(vec2(ang * 5.0 - uSeed, r * 11.0 - t * 1.6)) * 0.35;
  float flame = smoothstep(0.0, 1.0, (1.0 - r * 1.25) + (tongues - 0.5) * 0.9) * exp(-r * r * 2.5);
  float core = exp(-r * r * 140.0);
  float inner = exp(-r * r * 22.0);
  vec3 deep = uColor * vec3(0.9, 0.35, 0.18);
  vec3 col = mix(deep, uColor, smoothstep(0.1, 0.55, flame)) * flame * 1.8;
  col = mix(col, vec3(1.0, 0.9, 0.62) * 2.2, inner * 0.6) + vec3(1.0, 0.98, 0.92) * core * 5.0;
  float a = clamp(flame * 0.9 + inner + core, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}`;

const BLADE_VS = /* glsl */`varying float vR; varying vec2 vP; void main() { vP = position.xz; vR = length(position.xz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BLADE_FS = /* glsl */`
uniform vec3 uColor;
uniform float uFade;
varying float vR;
varying vec2 vP;
void main() {
  float tip = smoothstep(0.15, 0.78, vR);
  float hub = exp(-pow((vR - 0.17) / 0.04, 2.0));
  vec3 col = mix(uColor * 0.5, vec3(1.0, 1.0, 0.98) * 1.6, tip) + uColor * hub * 1.2;
  gl_FragColor = vec4(col * uFade, (0.35 + 0.65 * tip) * uFade);
}`;
const BLUR_VS = /* glsl */`varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BLUR_FS = /* glsl */`
uniform vec3 uColor;
uniform float uTime, uFade;
varying vec2 vP;
void main() {
  float r = length(vP) / 0.95;
  float ang = atan(vP.y, vP.x);
  float band = pow(0.5 + 0.5 * sin(ang * 4.0 - uTime * 34.0 + r * 3.0), 6.0);
  float ring = smoothstep(0.35, 0.82, r) * (1.0 - smoothstep(0.82, 1.0, r));
  float rim = exp(-pow((r - 0.86) / 0.05, 2.0));
  float a = (band * ring * 0.45 + rim * 0.35) * uFade;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), rim * 0.5) * 1.3, a);
}`;

/** The shuriken's outline: four swept crescent blades round a hub (XY plane, radius ~0.8). */
function shurikenShape(THREE) {
  const s = new THREE.Shape(), P = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    const h0 = P(0.17, a - 0.42), c0 = P(0.6, a - 0.02), tip = P(0.82, a + 0.42), c1 = P(0.34, a + 0.3), h1 = P(0.17, a + 0.62);
    if (k === 0) s.moveTo(h0[0], h0[1]); else s.lineTo(h0[0], h0[1]);
    s.quadraticCurveTo(c0[0], c0[1], tip[0], tip[1]);
    s.quadraticCurveTo(c1[0], c1[1], h1[0], h1[1]);
  }
  s.closePath();
  return s;
}

/** Velocity-stretched additive sparks with a colour-over-life ramp: CPU motion, one instanced draw call. */
export function createStreaks(THREE, parent, cap = 600) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('corner', new THREE.Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const aPos = mk(3), aVel = mk(3), aCol = mk(4), aSz = mk(2);
  g.setAttribute('aPos', aPos); g.setAttribute('aVel', aVel); g.setAttribute('aCol', aCol); g.setAttribute('aSz', aSz);
  g.instanceCount = 0;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const mat = new THREE.ShaderMaterial({ vertexShader: STREAK_VS, fragmentShader: STREAK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false; mesh.name = 'spell-streaks';
  parent.add(mesh);
  // per particle: p(3) v(3) age life c0(3) c1(3) intensity width stretch drag grav
  const p = new Float32Array(cap * 3), v = new Float32Array(cap * 3), c0 = new Float32Array(cap * 3), c1 = new Float32Array(cap * 3);
  const age = new Float32Array(cap), life = new Float32Array(cap), inten = new Float32Array(cap), wid = new Float32Array(cap), str = new Float32Array(cap), drag = new Float32Array(cap), grav = new Float32Array(cap);
  let n = 0;
  const col = new THREE.Color();
  function emit(x, y, z, vx, vy, vz, lifeS, hex0, hex1, intensity, width, stretch, dragK = 0, gravity = 0) {
    const i = n < cap ? n++ : Math.floor(Math.random() * cap);
    p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; v[i * 3] = vx; v[i * 3 + 1] = vy; v[i * 3 + 2] = vz;
    col.setHex(hex0); c0[i * 3] = col.r; c0[i * 3 + 1] = col.g; c0[i * 3 + 2] = col.b;
    col.setHex(hex1); c1[i * 3] = col.r; c1[i * 3 + 1] = col.g; c1[i * 3 + 2] = col.b;
    age[i] = 0; life[i] = lifeS; inten[i] = intensity; wid[i] = width; str[i] = stretch; drag[i] = dragK; grav[i] = gravity;
  }
  function move(from, to) {
    for (let k = 0; k < 3; k++) { p[to * 3 + k] = p[from * 3 + k]; v[to * 3 + k] = v[from * 3 + k]; c0[to * 3 + k] = c0[from * 3 + k]; c1[to * 3 + k] = c1[from * 3 + k]; }
    age[to] = age[from]; life[to] = life[from]; inten[to] = inten[from]; wid[to] = wid[from]; str[to] = str[from]; drag[to] = drag[from]; grav[to] = grav[from];
  }
  function update(dt) {
    for (let i = 0; i < n;) {
      age[i] += dt;
      if (age[i] >= life[i]) { n--; if (i !== n) move(n, i); continue; }
      const k = Math.exp(-drag[i] * dt), o = i * 3;
      v[o] *= k; v[o + 1] = v[o + 1] * k + grav[i] * dt; v[o + 2] *= k;
      p[o] += v[o] * dt; p[o + 1] += v[o + 1] * dt; p[o + 2] += v[o + 2] * dt;
      const t = age[i] / life[i], hot = 1 - Math.min(1, t / 0.18), u = Math.min(1, t * 1.25);
      const b = inten[i] * Math.pow(1 - t, 1.3);
      for (let c = 0; c < 3; c++) {
        const base = c0[o + c] + (c1[o + c] - c0[o + c]) * u;
        aCol.array[i * 4 + c] = (base + (1 - base) * hot * 0.8) * b;
      }
      aCol.array[i * 4 + 3] = Math.min(1, 1.2 * (1 - t));
      aPos.array[o] = p[o]; aPos.array[o + 1] = p[o + 1]; aPos.array[o + 2] = p[o + 2];
      aVel.array[o] = v[o]; aVel.array[o + 1] = v[o + 1]; aVel.array[o + 2] = v[o + 2];
      aSz.array[i * 2] = wid[i] * (1 - 0.5 * t); aSz.array[i * 2 + 1] = str[i];
      i++;
    }
    g.instanceCount = n; mesh.visible = n > 0;
    if (n) { aPos.needsUpdate = aVel.needsUpdate = aCol.needsUpdate = aSz.needsUpdate = true; }
  }
  return {
    mesh, emit, update, get live() { return n; },
    clear() { n = 0; g.instanceCount = 0; mesh.visible = false; },
    dispose() { mesh.removeFromParent(); g.dispose(); mat.dispose(); },
  };
}

/** Camera-facing ribbon trails, all in one merged mesh: `count` ribbons of `samples` points each. */
export function createRibbons(THREE, parent, count = 48, samples = 22) {
  const V = count * samples * 2;
  const g = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(V * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aU = new THREE.BufferAttribute(new Float32Array(V), 1).setUsage(THREE.DynamicDrawUsage);
  const aX = new THREE.BufferAttribute(new Float32Array(V), 1);
  const aCol = new THREE.BufferAttribute(new Float32Array(V * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aSeed = new THREE.BufferAttribute(new Float32Array(V), 1).setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < V; i++) aX.array[i] = i % 2 ? 1 : -1;
  g.setAttribute('position', pos); g.setAttribute('aU', aU); g.setAttribute('aX', aX); g.setAttribute('aCol', aCol); g.setAttribute('aSeed', aSeed);
  const idx = [];
  for (let r = 0; r < count; r++) for (let s = 0; s < samples - 1; s++) { const a = (r * samples + s) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.visible = false; mesh.name = 'spell-ribbons';
  parent.add(mesh);
  const col = new THREE.Color();
  const R = Array.from({ length: count }, () => ({ used: false, open: false, pts: new Float32Array(samples * 4), n: 0, life: 0.3, width: 0.2, r: 1, g: 1, b: 1, k: 1, seed: 0 }));
  let time = 0;
  function take(hex, width, lifeS, intensity = 1.5) {
    const i = R.findIndex((x) => !x.used); if (i < 0) return -1;
    const x = R[i]; x.used = true; x.open = true; x.n = 0; x.life = lifeS; x.width = width; x.k = intensity; x.seed = Math.random();
    col.setHex(hex); x.r = col.r; x.g = col.g; x.b = col.b;
    return i;
  }
  /** Adds a head point to ribbon `i` (newest first). */
  function push(i, px, py, pz) {
    const x = R[i]; if (!x || !x.used) return;
    const P = x.pts;
    if (x.n > 0) { const dx = px - P[0], dy = py - P[1], dz = pz - P[2]; if (dx * dx + dy * dy + dz * dz < 1e-4) { P[3] = time; return; } }
    P.copyWithin(4, 0, (samples - 1) * 4);
    P[0] = px; P[1] = py; P[2] = pz; P[3] = time;
    x.n = Math.min(samples, x.n + 1);
  }
  /** The ribbon stops growing; it fades out as its points age, then frees itself. */
  function release(i) { if (R[i]) R[i].open = false; }
  function update(dt, eye) {
    time += dt; uniforms.uTime.value = time;
    let any = false;
    for (let r = 0; r < count; r++) {
      const x = R[r], P = x.pts, base = r * samples * 2;
      if (x.used) {
        while (x.n > 0 && time - P[(x.n - 1) * 4 + 3] > x.life) x.n--;
        if (!x.open && x.n === 0) x.used = false;
      }
      const live = x.used ? x.n : 0;
      for (let s = 0; s < samples; s++) {
        const v = base + s * 2;
        if (s >= live || live < 2) { aCol.array[v * 4 + 3] = 0; aCol.array[v * 4 + 7] = 0; pos.setXYZ(v, 0, -1e4, 0); pos.setXYZ(v + 1, 0, -1e4, 0); continue; }
        any = true;
        const o = s * 4, j = Math.min(live - 1, s + 1), k = Math.max(0, s - 1);
        const tx = P[k * 4] - P[j * 4], ty = P[k * 4 + 1] - P[j * 4 + 1], tz = P[k * 4 + 2] - P[j * 4 + 2];
        const ex = eye.x - P[o], ey = eye.y - P[o + 1], ez = eye.z - P[o + 2];
        let sx = ty * ez - tz * ey, sy = tz * ex - tx * ez, sz = tx * ey - ty * ex;
        const u = Math.min(1, (time - P[o + 3]) / x.life);
        const w = x.width * (1 - 0.75 * u) * (s === 0 ? 0.6 : 1) / (Math.hypot(sx, sy, sz) || 1);
        sx *= w; sy *= w; sz *= w;
        pos.setXYZ(v, P[o] - sx, P[o + 1] - sy, P[o + 2] - sz); pos.setXYZ(v + 1, P[o] + sx, P[o + 1] + sy, P[o + 2] + sz);
        for (const q of [v, v + 1]) { aU.array[q] = u; aSeed.array[q] = x.seed; aCol.array[q * 4] = x.r; aCol.array[q * 4 + 1] = x.g; aCol.array[q * 4 + 2] = x.b; aCol.array[q * 4 + 3] = x.k; }
      }
    }
    mesh.visible = any;
    pos.needsUpdate = aU.needsUpdate = aCol.needsUpdate = aSeed.needsUpdate = true;
  }
  return { mesh, take, push, release, update, get used() { return R.filter((x) => x.used).length; }, dispose() { mesh.removeFromParent(); g.dispose(); mat.dispose(); } };
}

/**
 * @param {{THREE: object, parent: object, scale?: number, rand?: () => number}} o  scale < 1 thins the sparks (phones, low tier)
 */
export function createSpellFx({ THREE, parent, scale = 1, rand = Math.random }) {
  const group = new THREE.Group(); group.name = 'spell-fx'; parent.add(group);
  const streaks = createStreaks(THREE, group, Math.round(900 * Math.max(0.4, scale)));
  const ribbons = createRibbons(THREE, group, 64, scale < 1 ? 14 : 22);
  const plane = new THREE.PlaneGeometry(2, 2);
  const blades = new THREE.ShapeGeometry(shurikenShape(THREE), 6); blades.rotateX(-Math.PI / 2);
  const blurGeo = new THREE.CircleGeometry(0.95, 40); blurGeo.rotateX(-Math.PI / 2);
  const projs = [];
  const time = { value: 0 };
  const _w = new THREE.Vector3(), _eye = new THREE.Vector3();
  const N = (k) => Math.max(1, Math.round(k * scale));

  function ember(color = 0xff8a3a, size = 0.55) {
    const obj = new THREE.Group(); obj.name = 'spell-ember';
    const m = new THREE.Mesh(plane, new THREE.ShaderMaterial({
      uniforms: { uTime: time, uSeed: { value: rand() }, uSize: { value: size }, uColor: { value: new THREE.Color(color) } },
      vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    m.frustumCulled = false; m.renderOrder = 7; obj.add(m);
    projs.push({ kind: 'ember', obj, color, mats: [m.material], ribs: [ribbons.take(color, 0.26, 0.26, 1.6), ribbons.take(0xffe6b0, 0.07, 0.12, 2.2)], last: null, acc: 0 });
    return obj;
  }

  function gale(color = 0xc8f0ff) {
    const obj = new THREE.Group(); obj.name = 'spell-gale';
    const spin = new THREE.Group(); obj.add(spin);
    const bm = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(color) }, uFade: { value: 1 } }, vertexShader: BLADE_VS, fragmentShader: BLADE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const blade = new THREE.Mesh(blades, bm); blade.frustumCulled = false; blade.renderOrder = 7; spin.add(blade);
    const um = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(color) }, uTime: time, uFade: { value: 1 } }, vertexShader: BLUR_VS, fragmentShader: BLUR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const blur = new THREE.Mesh(blurGeo, um); blur.frustumCulled = false; blur.renderOrder = 6; obj.add(blur);
    obj.rotation.z = (rand() - 0.5) * 0.3;
    projs.push({ kind: 'gale', obj, spin, color, mats: [bm, um], ribs: [ribbons.take(0xffffff, 0.05, 0.16, 1.8), ribbons.take(0xffffff, 0.05, 0.16, 1.8), ribbons.take(color, 0.5, 0.22, 0.55)], last: null, acc: 0, ang: rand() * 6.28 });
    return obj;
  }

  /** The look of a cast landing (on top of render/hit-fx.js's flash and kick): sparks, embers, wind cuts. */
  function impact(kind, at, away = [0, 1]) {
    const [x, y, z] = at;
    if (kind === 'ember') {
      streaks.emit(x, y, z, 0, 0.01, 0, 0.12, 0xffffff, 0xff9a40, 4, 0.32, 0);           // a tiny hot core, not a bloom ball
      for (let i = 0; i < N(34); i++) {
        const a = rand() * 6.283, e = (rand() - 0.3) * 1.4, s = 5 + rand() * 9;
        streaks.emit(x, y, z, Math.cos(a) * Math.cos(e) * s + away[0] * 3, Math.sin(e) * s + 1.5, Math.sin(a) * Math.cos(e) * s + away[1] * 3, 0.25 + rand() * 0.35, 0xffd890, 0xff3a10, 3.2, 0.022, 0.035, 3.5, -9);
      }
      for (let i = 0; i < N(14); i++) streaks.emit(x + (rand() - 0.5) * 0.5, y + (rand() - 0.5) * 0.4, z + (rand() - 0.5) * 0.5, (rand() - 0.5) * 1.6, 0.6 + rand() * 1.6, (rand() - 0.5) * 1.6, 0.8 + rand() * 0.8, 0xffb060, 0x8a1a08, 2.4, 0.028, 0.02, 1.2, 1.4);
    } else if (kind === 'gale') {
      for (let i = 0; i < N(18); i++) {
        const a = rand() * 6.283, s = 7 + rand() * 8, tilt = (rand() - 0.5) * 0.9;
        streaks.emit(x, y, z, Math.cos(a) * s, tilt * s, Math.sin(a) * s, 0.16 + rand() * 0.14, 0xffffff, 0x9fd8ff, 2.6, 0.016, 0.09, 6, 0);
      }
      for (let k = 0; k < 2; k++) {                                                           // the cut: two long crossing slashes
        const a = Math.atan2(away[0], away[1]) + (k ? 0.9 : -0.9);
        streaks.emit(x, y, z, Math.sin(a) * 30, (k ? 6 : -6), Math.cos(a) * 30, 0.1, 0xffffff, 0xc8f0ff, 3, 0.03, 0.03, 18, 0);
      }
      for (let i = 0; i < N(10); i++) streaks.emit(x, y, z, (rand() - 0.5) * 3, rand() * 2, (rand() - 0.5) * 3, 0.5 + rand() * 0.4, 0xe8f8ff, 0x6aa8d0, 1.6, 0.02, 0.02, 1.5, -2);
    } else {
      for (let i = 0; i < N(22); i++) {
        const a = Math.atan2(away[0], away[1]) + (rand() - 0.5) * 2.6, s = 4 + rand() * 7;
        streaks.emit(x, y, z, Math.sin(a) * s, 1 + rand() * 4, Math.cos(a) * s, 0.2 + rand() * 0.3, 0xffffff, 0xffb050, 3, 0.018, 0.04, 2.5, -12);
      }
    }
  }

  function update(dt, camera) {
    time.value += dt;
    if (camera) { camera.getWorldPosition(_eye); group.worldToLocal(_eye); }
    for (let i = projs.length - 1; i >= 0; i--) {
      const P = projs[i], o = P.obj;
      if (!o.parent) { for (const r of P.ribs) if (r >= 0) ribbons.release(r); for (const m of P.mats) m.dispose(); projs.splice(i, 1); continue; }
      let shown = true; for (let q = o; q; q = q.parent) if (!q.visible) { shown = false; break; }
      if (!shown) { P.last = null; continue; }
      o.getWorldPosition(_w); group.worldToLocal(_w);
      const x = _w.x, y = _w.y, z = _w.z;
      let dx = 0, dy = 0, dz = 0, sp = 0;
      if (P.last && dt > 0) { dx = (x - P.last[0]) / dt; dy = (y - P.last[1]) / dt; dz = (z - P.last[2]) / dt; sp = Math.hypot(dx, dy, dz); }
      P.last = [x, y, z];
      if (P.kind === 'ember') {
        if (P.ribs[0] >= 0) ribbons.push(P.ribs[0], x, y, z);
        if (P.ribs[1] >= 0) ribbons.push(P.ribs[1], x, y, z);
        P.acc += dt * 90 * scale;
        for (; P.acc >= 1; P.acc--) {
          const j = 0.12;
          streaks.emit(x + (rand() - 0.5) * j, y + (rand() - 0.5) * j, z + (rand() - 0.5) * j, -dx * 0.12 + (rand() - 0.5) * 2.2, -dy * 0.12 + (rand() - 0.3) * 2.2, -dz * 0.12 + (rand() - 0.5) * 2.2, 0.18 + rand() * 0.3, 0xffd890, 0xff3010, 2.6, 0.02, 0.03, 4, 1.2);
        }
      } else {
        P.ang += dt * 26; P.spin.rotation.y = P.ang;
        o.updateMatrixWorld();
        for (let k = 0; k < 2; k++) {
          if (P.ribs[k] < 0) continue;
          const a = P.ang + k * Math.PI + 0.42;
          _w.set(Math.cos(a) * 0.8, 0, -Math.sin(a) * 0.8).applyMatrix4(o.matrixWorld); group.worldToLocal(_w);
          ribbons.push(P.ribs[k], _w.x, _w.y, _w.z);
        }
        if (P.ribs[2] >= 0) ribbons.push(P.ribs[2], x, y, z);
        P.acc += dt * 60 * scale;
        const l = sp || 1;
        for (; P.acc >= 1; P.acc--) {
          const a = rand() * 6.283, r = 0.5 + rand() * 0.6;
          streaks.emit(x + Math.cos(a) * r, y + (rand() - 0.5) * 0.25, z + Math.sin(a) * r, -dx / l * 3, 0, -dz / l * 3, 0.16 + rand() * 0.12, 0xffffff, 0x9fd8ff, 1.3, 0.01, 0.07, 2, 0);
        }
      }
    }
    streaks.update(dt);
    ribbons.update(dt, _eye);
  }

  return {
    group, streaks, ribbons, ember, gale, impact, update,
    /** Live counts (tests, the dev HUD). */
    stats: () => ({ projectiles: projs.length, streaks: streaks.live, ribbons: ribbons.used }),
    dispose() {
      for (const P of projs) for (const m of P.mats) m.dispose();
      projs.length = 0; streaks.dispose(); ribbons.dispose(); plane.dispose(); blades.dispose(); blurGeo.dispose(); group.removeFromParent();
    },
  };
}
