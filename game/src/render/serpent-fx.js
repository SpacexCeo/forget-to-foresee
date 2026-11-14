// The ice serpent's attacks, readable and felt (owner 14.11: "удары, волны, VFX — делай"). Pooled, a fixed number of
// draw calls whatever the fight does, nothing allocated per frame:
//   telegraphs  the arena's ground shapes (slam ring, sweep band, lunge line, breath cone) fill from the body outwards as
//               the blow comes, with a bright rim and a moving front: how long is left reads at a glance (telegraphMaterial)
//   frost       one Points pool (soft discs, additive): the inhale's motes drawn into the jaws, the breath's stream along
//               the cone, the slam's spray, the lunge's wake, frost bursting off Iris when a blow lands on her
//   waves       expanding rings on the mirror (slam double ring, sweep, lunge end, roar triple ring, her landings)
//   geyser      a column of ice light that shoots up where a slam lands
//   arc         the sweep's crescent racing round the body
//   crust       frost left on the mirror where the breath passed, fading
// Reduced motion: a third of the particles and no column or arc motion (the rings and fills stay: they carry the tell).
//
//   const sfx = createSerpentFx({ THREE, parent: root, mobile });
//   sfx.inhale(mouth, seconds); sfx.breathFrame(mouth, dir, half, length, dt); sfx.strike(kind, info); sfx.roar(at);
//   sfx.frostOn(at); sfx.chill(at); sfx.hitSerpent(at, dir, heavy); sfx.exposedFrame(at, dt); sfx.death(at);
//   sfx.wave(at, color, radius); sfx.update(dt, reduced)

/** Numbers of the effects (pure, for the tests and tuning). */
export const SERPENT_FX = Object.freeze({
  frost: 900, frostPhone: 300, waves: 8, ice: 0x9fe8ff, deep: 0x3a8cff, warm: 0xff9a5a,
  waveLife: 0.75, geyserLife: 0.9, breathRun: 0.5, arcLife: 0.45, crustLife: 1.6,
});

/**
 * Telegraph fill (pure): where along the shape the fill has reached for progress `k` (0 at the start of the tell, 1 when
 * the blow lands), eased so the last third speeds up, the way a swing gathers.
 */
export function teleFill(k) { const x = Math.min(1, Math.max(0, k)); return x * x * (3 - 2 * x) * 0.35 + x * x * 0.65; }

const TELE_VERT = `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const TELE_FRAG = `uniform vec3 uColor; uniform float uK, uOp, uTime, uInner, uOuter; uniform int uAxis; varying vec3 vP;
void main(){
  float d = uAxis == 0 ? length(vP.xy) : uAxis == 1 ? length(vP.xz) : vP.z;
  float t = clamp((d - uInner) / max(uOuter - uInner, 1e-3), 0.0, 1.0);
  float fill = 1.0 - smoothstep(uK - 0.015, uK + 0.015, t);
  float rim = smoothstep(0.9, 1.0, t) + (uAxis == 2 ? 0.0 : smoothstep(0.08, 0.0, t) * 0.3);
  float front = exp(-abs(t - uK) * 38.0) * step(uK, 0.995);
  float stripe = step(0.55, fract(t * 9.0 - uTime * 1.6)) * 0.07;
  float a = clamp(uOp * (0.3 * fill + 0.9 * rim + 0.9 * front + stripe * fill), 0.0, 0.95);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), front * 0.6), a);
}`;

/**
 * The arena's tell material: `axis` 0 = radial in the local XY plane (a RingGeometry laid flat by the mesh), 1 = radial
 * in XZ (a fan baked flat), 2 = along local +z (the lunge strip). `inner`/`outer` are the shape's radii (or 0..length).
 */
export function telegraphMaterial(THREE, { color = 0xff7a3a, axis = 0, inner = 0, outer = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uK: { value: 0 }, uOp: { value: 0 }, uTime: { value: 0 }, uInner: { value: inner }, uOuter: { value: outer }, uAxis: { value: axis } },
    vertexShader: TELE_VERT, fragmentShader: TELE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, // normal blending: an additive tell vanished on the bright mirror
  });
}

const CRACK_VERT = `varying vec3 vP; varying vec3 vW; void main(){ vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const CRACK_FRAG = `uniform float uK, uOp, uTime, uInner, uOuter, uSeed; uniform int uAxis; varying vec3 vP; varying vec3 vW;
vec2 h2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  float a = h2(i).x, b = h2(i + vec2(1.0, 0.0)).x, c = h2(i + vec2(0.0, 1.0)).x, d = h2(i + vec2(1.0, 1.0)).x; return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }
float edge(vec2 x){ vec2 n = floor(x), f = fract(x); float F1 = 8.0, F2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)); vec2 r = g + h2(n + g + uSeed) - f; float d = dot(r, r); if (d < F1) { F2 = F1; F1 = d; } else if (d < F2) F2 = d; }
  return sqrt(F2) - sqrt(F1); }
void main(){
  float d = uAxis == 0 ? length(vP.xy) : uAxis == 1 ? length(vP.xz) : vP.z;
  float t = clamp((d - uInner) / max(uOuter - uInner, 1e-3), 0.0, 1.0);
  float tt = t + (n2(vW.xz * 0.6 + uSeed) - 0.5) * 0.14;
  float reveal = 1.0 - smoothstep(uK - 0.05, uK + 0.01, tt);
  float rim = 1.0 - smoothstep(0.82, 1.0, tt);
  float e1 = edge(vW.xz * 0.32), e2 = edge(vW.xz * 1.1 + 7.3);
  float w1 = 0.075 + 0.045 * (1.0 - t), core = 1.0 - smoothstep(0.0, w1 * 0.45, e1), halo = 1.0 - smoothstep(0.0, w1 * 1.7, e1);
  float fine = (1.0 - smoothstep(0.0, 0.035, e2)) * smoothstep(uK - 0.35, uK, tt);
  float front = exp(-abs(tt - uK) * 22.0) * step(uK, 0.995);
  float a = uOp * reveal * rim * clamp(halo * 0.9 + fine * 0.5 + front * halo * 0.6, 0.0, 1.0);
  vec3 deep = vec3(0.05, 0.16, 0.27), ice = vec3(0.82, 0.97, 1.0);
  vec3 col = mix(deep, ice, clamp(core + fine * 0.6 + front * 0.7, 0.0, 1.0));
  gl_FragColor = vec4(col, a);
}`;

/**
 * The arena's tells as frost cracks spreading over the mirror (owner 14.11: no flat geometric warnings): the same shapes
 * as before (axis as telegraphMaterial) but nothing is filled: a web of cracks (Voronoi cell edges in world space) runs out
 * from the body toward the shape's edge as the blow comes, a ragged bright front with hairline cracks just behind it, and
 * the field thins out at its edge instead of ending on an outline. A crack is a bright core with a dark lip, so it reads
 * on the sky-bright and the dark parts of the mirror alike.
 */
export function crackMaterial(THREE, { axis = 0, inner = 0, outer = 1, seed = Math.random() * 50 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uOp: { value: 0 }, uTime: { value: 0 }, uInner: { value: inner }, uOuter: { value: outer }, uAxis: { value: axis }, uSeed: { value: seed } },
    vertexShader: CRACK_VERT, fragmentShader: CRACK_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

/** Drives a tell: progress k (0..1), opacity, the clock. */
export function setTele(mat, k, op, t) { const u = mat.uniforms; u.uK.value = teleFill(k); u.uOp.value = op; u.uTime.value = t; }

// Two kinds in one pool (owner 14.11: "glare and balls of light, like bloom balls" -> small points, glows, layered detail):
//   mist     (aKind 0..1, the fraction is a per-puff seed) a dim, lumpy puff, kept under the bloom threshold so it never
//            turns into a glowing ball; it carries the volume of the breath and the impacts
//   sparkle  (aKind >= 1) a crisp pinpoint (min 1.5 px) with a faint four-point glint that twinkles; only its few-pixel
//            core crosses the bloom threshold, so bloom gives a small glint, not a blob. Colour over life: white-hot ->
//            the particle's ice colour -> deep blue as it dies.
const PTS_VERT = `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute float aKind; attribute float aK;
varying float vA; varying vec3 vC; varying float vKind; varying float vK; uniform float uScale;
void main(){ vA = aAlpha; vC = aColor; vKind = aKind; vK = aK; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float px = aSize * uScale / max(0.5, -mv.z); gl_PointSize = aKind >= 1.0 ? clamp(px, 1.5, 24.0) : min(px, 220.0); gl_Position = projectionMatrix * mv; }`;
const PTS_FRAG = `varying float vA; varying vec3 vC; varying float vKind; varying float vK; uniform float uTime;
float h1(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){ vec2 c = gl_PointCoord - 0.5; float r = dot(c, c) * 4.0; if (r > 1.0) discard;
  if (vKind < 1.0) { // mist: lumpy, soft-edged, dim
    float sd = vKind * 61.0, n = vn(c * 4.0 + sd + vK * 1.5) * 0.65 + vn(c * 9.0 - sd) * 0.35;
    float a = smoothstep(1.0, 0.15, r) * smoothstep(0.25, 0.75, n + 0.35 * (1.0 - r));
    gl_FragColor = vec4(vC * 0.72, vA * a * 0.55); return; }
  float sd = fract(vKind) * 97.0, tw = 0.55 + 0.45 * sin(uTime * 23.0 + sd * 6.283);
  float core = exp(-r * 16.0), halo = exp(-r * 4.0) * 0.25;
  float star = (max(0.0, 1.0 - abs(c.x) * 14.0) * max(0.0, 1.0 - abs(c.y) * 2.2) + max(0.0, 1.0 - abs(c.y) * 14.0) * max(0.0, 1.0 - abs(c.x) * 2.2)) * 0.35 * tw;
  vec3 ramp = mix(mix(vec3(1.0), vC, smoothstep(0.0, 0.35, vK)), vec3(0.23, 0.45, 0.95), smoothstep(0.6, 1.0, vK));
  float a = clamp(core + halo + star, 0.0, 1.0);
  gl_FragColor = vec4(ramp * (0.8 + 0.9 * core * tw), vA * a); }`;
// Frost streaks: one line segment per particle, from where it is back along its velocity; thin, crisp, motion-read.
const STK_VERT = `attribute vec4 aRGBA; varying vec4 vC; void main(){ vC = aRGBA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const STK_FRAG = `varying vec4 vC; void main(){ gl_FragColor = vC; }`;
const WAVE_VERT = `varying vec2 vUv; varying vec2 vQ; void main(){ vUv = uv; vQ = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const WAVE_FRAG = `uniform vec3 uColor; uniform float uA, uSeed; varying vec2 vUv; varying vec2 vQ;
void main(){ float ang = atan(vQ.y, vQ.x);
  float broken = clamp(0.3 + 0.9 * sin(ang * 7.0 + uSeed) * sin(ang * 13.0 - uSeed * 1.7) + 0.3 * sin(ang * 23.0 + uSeed * 0.4), 0.0, 1.0);  // a ripple of frost, broken round its circle
  float lead = vUv.y + 0.12 * sin(ang * 9.0 + uSeed * 2.3);
  gl_FragColor = vec4(uColor * 0.8, 0.7 * uA * broken * smoothstep(0.0, 0.7, lead) * (1.0 - smoothstep(0.8, 1.0, lead))); }`;
const GEY_FRAG = `uniform vec3 uColor; uniform float uA; varying vec2 vUv; void main(){ float h = vUv.y; float fil = pow(max(0.0, sin(vUv.x * 113.0 + h * 3.0)), 6.0) + 0.25 * pow(max(0.0, sin(vUv.x * 41.0 - h * 5.0)), 4.0); gl_FragColor = vec4(uColor * (0.75 - h * 0.35), uA * (1.0 - h) * (1.0 - h) * fil); }`;
const UV_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** @param {{THREE: object, parent: object, mobile?: boolean, rand?: () => number}} o */
export function createSerpentFx({ THREE, parent, mobile = false, rand = Math.random }) {
  const F = SERPENT_FX, cap = mobile ? F.frostPhone : F.frost;
  const group = new THREE.Group(); group.name = 'serpent_fx'; parent.add(group);
  // ---- frost points: a ring buffer of particles
  const pos = new Float32Array(cap * 3), vel = new Float32Array(cap * 3), col = new Float32Array(cap * 3), size = new Float32Array(cap), alpha = new Float32Array(cap), life = new Float32Array(cap), age = new Float32Array(cap), drag = new Float32Array(cap), grav = new Float32Array(cap), size0 = new Float32Array(cap), amax = new Float32Array(cap), kind = new Float32Array(cap), kage = new Float32Array(cap);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aK', new THREE.BufferAttribute(kage, 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  // normal blending: additive frost vanished on the bright mirror (the sky's reflection); the ice reads on light and dark
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: { uScale: { value: 1000 }, uTime: { value: 0 } }, vertexShader: PTS_VERT, fragmentShader: PTS_FRAG, transparent: true, depthWrite: false }));
  pts.frustumCulled = false; group.add(pts);
  const _sz = new THREE.Vector2();
  pts.onBeforeRender = (renderer, scene, camera) => { if (camera && camera.isPerspectiveCamera) { renderer.getDrawingBufferSize(_sz); pts.material.uniforms.uScale.value = _sz.y / (2 * Math.tan(camera.fov * Math.PI / 360)); } };
  // ---- streaks: a pool of short frost/spark lines (one draw call)
  const scap = mobile ? 90 : 320, sPos = new Float32Array(scap * 6), sRGBA = new Float32Array(scap * 8), sP = new Float32Array(scap * 3), sV = new Float32Array(scap * 3), sCol = new Float32Array(scap * 3), sLife = new Float32Array(scap), sAge = new Float32Array(scap).fill(1), sDrag = new Float32Array(scap), sGrav = new Float32Array(scap), sLen = new Float32Array(scap);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  sGeo.setAttribute('aRGBA', new THREE.BufferAttribute(sRGBA, 4).setUsage(THREE.DynamicDrawUsage));
  sGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const streaks = new THREE.LineSegments(sGeo, new THREE.ShaderMaterial({ vertexShader: STK_VERT, fragmentShader: STK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  streaks.frustumCulled = false; streaks.visible = false; group.add(streaks);
  let sHead = 0, sLive = 0;
  /** One streak: position, velocity, colour, life, length (seconds of travel drawn behind it), drag, gravity. */
  function streak(x, y, z, vx, vy, vz, color, lf, len = 0.05, dr = 2, gr = 0) {
    if (reducedNow && rand() > 0.34) return;
    const i = sHead; sHead = (sHead + 1) % scap;
    sP[i * 3] = x; sP[i * 3 + 1] = y; sP[i * 3 + 2] = z; sV[i * 3] = vx; sV[i * 3 + 1] = vy; sV[i * 3 + 2] = vz;
    tmpC.setHex(color); sCol[i * 3] = tmpC.r * 0.85; sCol[i * 3 + 1] = tmpC.g * 0.85; sCol[i * 3 + 2] = tmpC.b * 0.85;
    sLife[i] = lf; sAge[i] = 0; sDrag[i] = dr; sGrav[i] = gr; sLen[i] = len;
  }
  const lod = mobile ? 0.4 : 1; // the cinematic tier on desktop, a lighter one on phones (and a third under reduced motion)
  let chillT = 0, exposedT = 0, deathT = 1e9; const deathAt = [0, 0, 0];
  let head = 0, live = 0, reducedNow = false;
  const tmpC = new THREE.Color();
  /** One particle (no allocation): position, velocity, colour, size (metres across; uScale ~ pixels per metre at 1 m), life (s), drag (1/s), gravity (m/s²). */
  function emit(x, y, z, vx, vy, vz, color, sz, lf, dr = 1.5, gr = 0, op = 1) {
    if (reducedNow && rand() > 0.34) return;
    const i = head; head = (head + 1) % cap;
    // a big particle is mist (a dim lumpy puff, smaller than it used to be), a small one a pinpoint sparkle
    if (sz >= 1) { kind[i] = rand() * 0.99; sz *= 0.75; op *= 0.55; } else { kind[i] = 1 + rand() * 0.99; sz *= 0.32; }
    kage[i] = 0;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    tmpC.setHex(color); col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
    size0[i] = sz; size[i] = sz; life[i] = lf; age[i] = 0; drag[i] = dr; grav[i] = gr; alpha[i] = 0; amax[i] = op;
  }
  // ---- waves: expanding rings on the mirror
  const waveGeo = new THREE.RingGeometry(0.82, 1, 72, 1); // uv.y runs 0 (inner) .. 1 (outer) after the remap below
  { const uv = waveGeo.attributes.uv, p = waveGeo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setY(i, (Math.hypot(p.getX(i), p.getY(i)) - 0.82) / 0.18); }
  const waves = Array.from({ length: F.waves }, () => {
    const m = new THREE.Mesh(waveGeo, new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color() }, uA: { value: 0 }, uSeed: { value: 0 } }, vertexShader: WAVE_VERT, fragmentShader: WAVE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.visible = false; m.frustumCulled = false; group.add(m);
    return { m, t: 0, life: F.waveLife, r0: 0.5, r1: 5, delay: 0 };
  });
  let waveNext = 0;
  /** A ring that grows from r0 to r1 over `lf` seconds, after `delay`. */
  function wave(at, color, r1, { r0 = 0.4, lf = F.waveLife, delay = 0, y = 0.07 } = {}) {
    const w = waves[waveNext]; waveNext = (waveNext + 1) % waves.length;
    w.m.position.set(at[0], (at[1] || 0) + y, at[2]); w.m.material.uniforms.uColor.value.setHex(color); w.m.material.uniforms.uSeed.value = rand() * 20;
    w.t = -delay; w.life = lf; w.r0 = r0; w.r1 = r1; w.m.visible = false;
  }
  // ---- the slam's geyser column
  const geyGeo = new THREE.CylinderGeometry(1, 1.25, 1, 28, 1, true); geyGeo.translate(0, 0.5, 0);
  const geyser = new THREE.Mesh(geyGeo, new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(F.ice) }, uA: { value: 0 } }, vertexShader: UV_VERT, fragmentShader: GEY_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  geyser.visible = false; geyser.frustumCulled = false; group.add(geyser);
  let geyT = 1e9, geyR = 3;
  // ---- the sweep's crescent
  const arcGeo = new THREE.RingGeometry(0.86, 1, 48, 1, 0, Math.PI * 0.7);
  const arc = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color: F.ice, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  arc.rotation.x = -Math.PI / 2; arc.visible = false; group.add(arc);
  let arcT = 1e9, arcR = 10, arcDir = 1;
  // ---- frost crust where the breath passed
  const crustMat = new THREE.MeshBasicMaterial({ color: 0xcff4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  let crust = null, crustT = 1e9;
  function crustFor(half, length) {
    if (crust && crust.userData.key === half + ':' + length) return crust;
    if (crust) { crust.geometry.dispose(); group.remove(crust); }
    const g = new THREE.CircleGeometry(length, 36, Math.PI / 2 - half, half * 2); g.rotateX(-Math.PI / 2); g.scale(1, 1, -1);
    crust = new THREE.Mesh(g, crustMat); crust.userData.key = half + ':' + length; crust.visible = false; group.add(crust);
    return crust;
  }

  let inhaleT = 0, inhaleAt = [0, 0, 0], breathT = 0, breathIdle = 1;
  const api = {
    group,
    /** The inhale before the breath: motes drawn into the jaws for `secs`. */
    inhale(mouth, secs) { inhaleT = secs; inhaleAt[0] = mouth[0]; inhaleAt[1] = mouth[1]; inhaleAt[2] = mouth[2]; },
    /** One frame of the breath (call while it is active): a stream of frost from the jaws along the cone, mist at its tip. */
    breathFrame(mouth, dir, half, length, dt, origin = mouth) { // origin: the cone's apex on the mirror (the tell's)
      inhaleT = 0;
      if (breathIdle > 0.3) breathT = 0; // a new breath
      breathIdle = 0; breathT += dt;
      // the frost front: it races along the mirror from the jaws to the cone's end in BREATH_RUN s, a wall of mist and shards
      // at its edge (what the camera behind her sees; the stream from the jaws is high above the frame)
      const front = Math.min(1, breathT / F.breathRun) * length, ang = Math.atan2(dir[0], dir[1]);
      const m2 = Math.max(1, Math.round((mobile ? 160 : 420) * dt));
      for (let i = 0; i < m2; i++) {
        const u = Math.max(0.5, front - rand() * 3.5), s2 = (rand() * 2 - 1) * half * 0.95, a2 = ang + s2, mist = rand() < 0.35;
        emit(origin[0] + Math.sin(a2) * u, 0.15 + rand() * (mist ? 0.6 : 1.4), origin[2] + Math.cos(a2) * u, Math.sin(a2) * 3, 1 + rand() * 2.5, Math.cos(a2) * 3,
          mist ? 0xb8e2f4 : rand() < 0.4 ? 0xffffff : F.ice, mist ? 2.6 + rand() * 2 : 0.6 + rand() * 0.8, 0.55 + rand() * 0.4, 1.2, mist ? 0 : 5, mist ? 0.4 : 0.9);
      }
      // the stream from the jaws, layered: a cone of mist puffs that widen as they travel, fine crystalline sparkles and
      // fast frost streaks racing along it
      const n = Math.max(1, Math.round((mobile ? 160 : 460) * dt)), base = Math.atan2(dir[0], dir[1]);
      for (let i = 0; i < n; i++) {
        const s = (rand() * 2 - 1) * half * (0.4 + 0.6 * rand()), a = base + s, sp = 16 + rand() * 10, roll = rand();
        const vy = -mouth[1] / (length / sp) * (0.8 + rand() * 0.4), lf = length / sp * (0.9 + rand() * 0.3);
        if (roll < 0.22) emit(mouth[0] + (rand() - 0.5) * 0.6, mouth[1] + (rand() - 0.5) * 0.6, mouth[2] + (rand() - 0.5) * 0.6, Math.sin(a) * sp * 0.8, vy * 0.8, Math.cos(a) * sp * 0.8, rand() < 0.5 ? 0xa9d6ea : 0x8cc4e0, 1.3 + rand() * 1.4, lf * 1.15, 0.5, -0.6, 0.32);
        else emit(mouth[0] + (rand() - 0.5) * 0.4, mouth[1] + (rand() - 0.5) * 0.4, mouth[2] + (rand() - 0.5) * 0.4, Math.sin(a) * sp, vy, Math.cos(a) * sp, rand() < 0.3 ? 0xffffff : rand() < 0.6 ? F.ice : 0x6cc8ff, 0.35 + rand() * 0.5, lf, 0.6, 0, 0.95);
      }
      const ns = Math.max(1, Math.round((mobile ? 30 : 110) * dt));
      for (let i = 0; i < ns; i++) { const a = base + (rand() * 2 - 1) * half * 0.8, sp = 22 + rand() * 12; streak(mouth[0], mouth[1], mouth[2], Math.sin(a) * sp, -mouth[1] / (length / sp), Math.cos(a) * sp, rand() < 0.4 ? 0xffffff : F.ice, length / sp * (0.6 + rand() * 0.4), 0.04, 0.3); }
      const c = crustFor(half, length); c.position.set(origin[0], 0.04, origin[2]); c.rotation.y = ang; c.scale.setScalar(Math.max(0.03, front / length)); crustT = 0; // the crust grows with the front
    },
    /** A blow landing: `info` {at: [x, z] arena-local, dir: [dx, dz], A: the attack's numbers, boss: [x, z]}. */
    strike(kind, info) {
      const A = info.A || {}, at = info.at, dir = info.dir;
      if (kind === 'slam' || kind === 'dive') {
        const r = A.radius || 6;
        wave([at[0], 0, at[1]], F.ice, r * 1.25, { lf: 0.6 }); wave([at[0], 0, at[1]], 0xffffff, r * 1.7, { lf: 0.85, delay: 0.12, r0: r * 0.5 });
        geyser.position.set(at[0], 0, at[1]); geyT = 0; geyR = Math.max(1.5, r * 0.32);
        for (let i = 0; i < 40 * lod; i++) { const a = rand() * 6.283, rr = geyR * rand(); streak(at[0] + Math.sin(a) * rr, 0.2, at[1] + Math.cos(a) * rr, Math.sin(a) * 2, 14 + rand() * 14, Math.cos(a) * 2, rand() < 0.5 ? 0xffffff : F.ice, 0.5 + rand() * 0.4, 0.035, 1, 16); }
        for (let i = 0; i < 70; i++) { const a = rand() * Math.PI * 2, s = 3 + rand() * 9; emit(at[0] + Math.sin(a) * r * 0.3, 0.2, at[1] + Math.cos(a) * r * 0.3, Math.sin(a) * s, 8 + rand() * 12, Math.cos(a) * s, rand() < 0.4 ? 0xffffff : F.ice, 0.5 + rand() * 0.7, 0.9 + rand() * 0.6, 0.8, 18); }
      } else if (kind === 'sweep') {
        const b = info.boss, r = A.radius || 16;
        arc.position.set(b[0], 0.1, b[1]); arc.scale.setScalar(r); arcT = 0; arcR = r; arcDir = rand() < 0.5 ? 1 : -1;
        wave([b[0], 0, b[1]], F.ice, r * 1.05, { r0: (A.inner || 6), lf: 0.55 });
      } else if (kind === 'lunge' && dir) {
        const L = A.length || 30;
        for (let i = 0; i < 90; i++) { const u = rand(), side = (rand() - 0.5) * (A.width || 4); emit(at[0] + dir[0] * L * u + dir[1] * side, 0.3, at[1] + dir[1] * L * u - dir[0] * side, dir[1] * side * 1.5, 2 + rand() * 4, -dir[0] * side * 1.5, F.ice, 0.5 + rand() * 0.5, 0.6 + rand() * 0.5, 2.2, 9); }
        wave([at[0] + dir[0] * L, 0, at[1] + dir[1] * L], F.ice, (A.width || 4) * 1.4, { lf: 0.5 });
      } else if (kind === 'breath' && dir) {
        const L = A.length || 24; wave([at[0] + dir[0] * L * 0.8, 0, at[1] + dir[1] * L * 0.8], 0xcff4ff, L * 0.35, { lf: 0.7 });
      } else if (kind === 'claw' && dir) {
        const r = A.radius || 9; wave([at[0] + dir[0] * r * 0.5, 0, at[1] + dir[1] * r * 0.5], F.warm, r * 0.6, { lf: 0.45 });
      }
    },
    /** The roar at a phase change: three rings racing out from the body, frost thrown off it. */
    roar(at) {
      for (let i = 0; i < 3; i++) wave([at[0], 0, at[1]], i === 1 ? 0xffffff : F.ice, 22 + i * 6, { r0: 2, lf: 0.9 + i * 0.15, delay: i * 0.16 });
      for (let i = 0; i < 80; i++) { const a = rand() * Math.PI * 2, s = 6 + rand() * 8; emit(at[0], 3 + rand() * 6, at[1], Math.sin(a) * s, rand() * 6, Math.cos(a) * s, F.ice, 0.6 + rand() * 0.6, 1 + rand() * 0.6, 1.2, 4); }
    },
    /** Frost bursting off her when a blow lands on her: shards and a small ring at her feet. */
    frostOn(at) {
      for (let i = 0; i < 40; i++) { const a = rand() * Math.PI * 2, s = 2 + rand() * 4; emit(at[0], at[1] + 0.6 + rand() * 1.1, at[2], Math.sin(a) * s, 1 + rand() * 4, Math.cos(a) * s, rand() < 0.5 ? 0xffffff : F.ice, 0.12 + rand() * 0.18, 0.5 + rand() * 0.4, 2.5, 9); }
      for (let i = 0; i < 14 * lod; i++) { const a = rand() * 6.283, s = 4 + rand() * 5; streak(at[0], at[1] + 0.8 + rand() * 0.8, at[2], Math.sin(a) * s, 1 + rand() * 3, Math.cos(a) * s, 0xdff6ff, 0.25 + rand() * 0.2, 0.03, 3, 6); }
      for (let i = 0; i < 4; i++) emit(at[0] + (rand() - 0.5), at[1] + 0.5 + rand(), at[2] + (rand() - 0.5), (rand() - 0.5), 0.6, (rand() - 0.5), 0xbfe6f6, 1.1 + rand() * 0.6, 0.9, 1.5, 0, 0.5);
      wave([at[0], at[1], at[2]], F.ice, 1.8, { lf: 0.4 });
      chillT = 2.2; // frost clings to her for a while (chill)
    },
    /** Per frame with her position: while chilled, frost sparkles cling and drift off her, a thin breath of mist at her feet. */
    chill(at) {
      if (chillT <= 0) return;
      const n = rand() < (mobile ? 0.35 : 0.9) * Math.min(1, chillT) ? (mobile ? 1 : 2) : 0;
      for (let i = 0; i < n; i++) { const a = rand() * 6.283, r = 0.25 + rand() * 0.3; emit(at[0] + Math.sin(a) * r, at[1] + 0.2 + rand() * 1.6, at[2] + Math.cos(a) * r, Math.sin(a) * 0.3, 0.3 + rand() * 0.5, Math.cos(a) * 0.3, rand() < 0.5 ? 0xffffff : F.ice, 0.18 + rand() * 0.15, 0.6 + rand() * 0.4, 1, -0.2, 0.9); }
      if (rand() < 0.08) emit(at[0], at[1] + 0.1, at[2], (rand() - 0.5) * 0.6, 0.15, (rand() - 0.5) * 0.6, 0xa9d6ea, 1.2 + rand() * 0.5, 1.1, 1, 0, 0.35);
    },
    /** A blow landing on the serpent (`dir` [dx, dz] from her toward it): ice shards chip off back toward her, a few small sparks, a puff of frost dust. */
    hitSerpent(at, dir, heavy = false) {
      const dx = -(dir ? dir[0] : 0), dz = -(dir ? dir[1] : 0), k = heavy ? 1.8 : 1;
      for (let i = 0; i < 16 * k * lod; i++) { const s = 3 + rand() * 6; emit(at[0], at[1], at[2], dx * s + (rand() - 0.5) * 5, 2 + rand() * 5, dz * s + (rand() - 0.5) * 5, rand() < 0.5 ? 0xffffff : F.ice, 0.22 + rand() * 0.3, 0.45 + rand() * 0.45, 1.4, 14); }
      for (let i = 0; i < 9 * k * lod; i++) { const s = 7 + rand() * 9; streak(at[0], at[1], at[2], dx * s + (rand() - 0.5) * 9, rand() * 6, dz * s + (rand() - 0.5) * 9, rand() < 0.35 ? 0xffd9a0 : 0xe8fbff, 0.16 + rand() * 0.16, 0.025, 4, 10); }
      for (let i = 0; i < 2 * k; i++) emit(at[0], at[1], at[2], dx * 1.2 + (rand() - 0.5), 0.5, dz * 1.2 + (rand() - 0.5), 0xa9d6ea, 1.1 + rand() * 0.8, 0.6, 2, 0, 0.45);
    },
    /** Per frame while its crest is open (the stagger window): glints crawl over the body like fresh cracks catching light, motes shimmer up off it. `at` the body's centre, `r` its rough radius. */
    exposedFrame(at, dt, r = 3) {
      const n = Math.max(1, Math.round((mobile ? 30 : 90) * dt));
      for (let i = 0; i < n; i++) { const a = rand() * 6.283, y = at[1] + 1 + rand() * 6, rr = r * (0.8 + rand() * 0.4), x = at[0] + Math.sin(a) * rr, z = at[2] + Math.cos(a) * rr;
        if (rand() < 0.45) { const t = a + 1.5708, s = 1.2 + rand() * 2; streak(x, y, z, Math.sin(t) * s, (rand() - 0.5) * 2, Math.cos(t) * s, rand() < 0.5 ? 0xffc070 : 0xe8fbff, 0.18 + rand() * 0.15, 0.12, 0, 0); }
        else emit(x, y, z, Math.sin(a) * 0.4, 0.8 + rand() * 1.2, Math.cos(a) * 0.4, rand() < 0.4 ? 0xffd6a0 : F.ice, 0.2 + rand() * 0.2, 0.7 + rand() * 0.5, 0.8, -0.4, 0.95); }
    },
    /** The serpent shatters: shards and streaks burst off the whole body, a slow frost wave, then a fall of glittering ice dust for a few seconds. */
    death(at) {
      deathAt[0] = at[0]; deathAt[1] = at[1]; deathAt[2] = at[2]; deathT = 0;
      for (let i = 0; i < 170 * lod; i++) { const a = rand() * 6.283, s = 4 + rand() * 12, y = at[1] + 1 + rand() * 8; emit(at[0] + Math.sin(a) * 2, y, at[2] + Math.cos(a) * 2, Math.sin(a) * s, 3 + rand() * 9, Math.cos(a) * s, rand() < 0.45 ? 0xffffff : rand() < 0.7 ? F.ice : 0x6cc8ff, 0.25 + rand() * 0.45, 1.2 + rand() * 1.2, 0.9, 9); }
      for (let i = 0; i < 90 * lod; i++) { const a = rand() * 6.283, s = 10 + rand() * 16; streak(at[0], at[1] + 2 + rand() * 6, at[2], Math.sin(a) * s, 2 + rand() * 10, Math.cos(a) * s, rand() < 0.5 ? 0xffffff : F.ice, 0.4 + rand() * 0.5, 0.035, 1.5, 9); }
      for (let i = 0; i < 18; i++) { const a = rand() * 6.283, s = 2 + rand() * 3; emit(at[0] + Math.sin(a) * 3, at[1] + 0.5 + rand() * 4, at[2] + Math.cos(a) * 3, Math.sin(a) * s, 0.5 + rand(), Math.cos(a) * s, 0x9cc9e0, 2 + rand() * 1.5, 1.8 + rand(), 0.9, 0, 0.4); }
      for (let i = 0; i < 3; i++) wave([at[0], 0, at[2]], i === 1 ? 0xdff6ff : F.ice, 16 + i * 8, { r0: 2, lf: 1.2 + i * 0.25, delay: i * 0.22 });
    },
    /**
     * One frame of a tell's front: ice shards and a little mist rising where the cracks are running now. `kind`:
     * 'ring' {at, r}, 'band' {at, r0, r1}, 'strip' {at, dir, len, width}, 'cone' {at, dir, half, len}; k the tell's progress.
     */
    tellFrame(kind, g, k, dt) {
      const big = kind === 'band' || kind === 'cone' || kind === 'strip', n = Math.max(1, Math.round((mobile ? 26 : 60) * (big ? 2.6 : 1) * dt));
      for (let i = 0; i < n; i++) {
        let x = 0, z = 0;
        if (kind === 'ring') { const a = rand() * 6.283, r = g.r * Math.min(1, k + 0.02) * (0.85 + 0.15 * rand()); x = g.at[0] + Math.sin(a) * r; z = g.at[2] + Math.cos(a) * r; }
        else if (kind === 'band') { const a = rand() * 6.283, r = g.r0 + (g.r1 - g.r0) * Math.min(1, k + 0.02) * (0.9 + 0.1 * rand()); x = g.at[0] + Math.sin(a) * r; z = g.at[2] + Math.cos(a) * r; }
        else if (kind === 'strip') { const u = g.len * Math.min(1, k) * (0.85 + 0.15 * rand()), s2 = (rand() - 0.5) * g.width; x = g.at[0] + g.dir[0] * u + g.dir[1] * s2; z = g.at[2] + g.dir[1] * u - g.dir[0] * s2; }
        else { const a = Math.atan2(g.dir[0], g.dir[1]) + (rand() * 2 - 1) * g.half, u = g.len * Math.min(1, k) * (0.85 + 0.15 * rand()); x = g.at[0] + Math.sin(a) * u; z = g.at[2] + Math.cos(a) * u; }
        const mist = rand() < 0.2;
        emit(x, 0.05, z, (rand() - 0.5) * 0.4, mist ? 0.4 + rand() * 0.4 : 1.4 + rand() * 1.8, (rand() - 0.5) * 0.4, mist ? 0xd6eef8 : rand() < 0.4 ? 0xffffff : F.ice, mist ? 1.2 + rand() * 0.8 : 0.16 + rand() * 0.2, mist ? 0.9 : 0.5 + rand() * 0.3, 1.6, mist ? 0 : -0.5, mist ? 0.3 : 0.95);
      }
    },
    /** A plain ring (her landings, a shockwave). */
    wave(at, color, radius, opts) { wave(at, color, radius, opts); },
    /** Per frame. */
    update(dt, reduced = false) {
      reducedNow = reduced; breathIdle += dt; chillT -= dt; pts.material.uniforms.uTime.value += dt;
      if (deathT < 3.5) { deathT += dt; const n = rand() < (mobile ? 0.5 : 1) ? (mobile ? 1 : 3) : 0; for (let i = 0; i < n; i++) emit(deathAt[0] + (rand() - 0.5) * 10, deathAt[1] + 3 + rand() * 7, deathAt[2] + (rand() - 0.5) * 10, (rand() - 0.5) * 0.6, -0.4 - rand() * 0.6, (rand() - 0.5) * 0.6, rand() < 0.5 ? 0xffffff : F.ice, 0.15 + rand() * 0.15, 2 + rand(), 0.5, 0.2, 0.9); }
      if (inhaleT > 0) { // motes from a shell around the jaws, drawn in
        inhaleT -= dt;
        const n = Math.max(1, Math.round((mobile ? 50 : 120) * dt));
        for (let i = 0; i < n; i++) { const a = rand() * Math.PI * 2, b = (rand() - 0.3) * 1.2, r = 5 + rand() * 3, x = Math.cos(b) * Math.sin(a) * r, y = Math.sin(b) * r, z = Math.cos(b) * Math.cos(a) * r, k = 1.6; emit(inhaleAt[0] + x, inhaleAt[1] + y, inhaleAt[2] + z, -x * k, -y * k, -z * k, F.ice, 0.35 + rand() * 0.35, 0.55, 0, 0); }
      }
      live = 0;
      for (let i = 0; i < cap; i++) {
        if (age[i] >= life[i]) { if (alpha[i] !== 0) { alpha[i] = 0; size[i] = 0; } continue; }
        live++;
        age[i] += dt; const k = age[i] / life[i], d = Math.exp(-drag[i] * dt);
        vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d - grav[i] * dt; vel[i * 3 + 2] *= d;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] = Math.max(0.03, pos[i * 3 + 1] + vel[i * 3 + 1] * dt); pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        alpha[i] = amax[i] * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85); kage[i] = k; size[i] = size0[i] * (kind[i] < 1 ? 0.6 + 1.1 * k : 1.1 - 0.5 * k); // mist billows, sparkles shrink
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aAlpha.needsUpdate = true; geo.attributes.aSize.needsUpdate = true; geo.attributes.aColor.needsUpdate = true; geo.attributes.aKind.needsUpdate = true; geo.attributes.aK.needsUpdate = true;
      sLive = 0;
      for (let i = 0; i < scap; i++) {
        const o = i * 6, q = i * 8;
        if (sAge[i] >= sLife[i]) { if (sRGBA[q + 3] !== 0) sRGBA[q + 3] = 0; continue; }
        sLive++; sAge[i] += dt; const k = Math.min(1, sAge[i] / sLife[i]), d = Math.exp(-sDrag[i] * dt);
        sV[i * 3] *= d; sV[i * 3 + 1] = sV[i * 3 + 1] * d - sGrav[i] * dt; sV[i * 3 + 2] *= d;
        sP[i * 3] += sV[i * 3] * dt; sP[i * 3 + 1] = Math.max(0.03, sP[i * 3 + 1] + sV[i * 3 + 1] * dt); sP[i * 3 + 2] += sV[i * 3 + 2] * dt;
        const L = sLen[i] * (1 - 0.5 * k);
        sPos[o] = sP[i * 3]; sPos[o + 1] = sP[i * 3 + 1]; sPos[o + 2] = sP[i * 3 + 2];
        sPos[o + 3] = sP[i * 3] - sV[i * 3] * L; sPos[o + 4] = sP[i * 3 + 1] - sV[i * 3 + 1] * L; sPos[o + 5] = sP[i * 3 + 2] - sV[i * 3 + 2] * L;
        const a = k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9, wh = 1 - Math.min(1, k * 2.5); // a white-hot head cooling to the streak's colour, the tail fading out
        for (let j = 0; j < 3; j++) { sRGBA[q + j] = sCol[i * 3 + j] + (0.95 - sCol[i * 3 + j]) * wh; sRGBA[q + 4 + j] = sCol[i * 3 + j] * 0.5; }
        sRGBA[q + 3] = a; sRGBA[q + 7] = 0;
      }
      streaks.visible = sLive > 0; sGeo.attributes.position.needsUpdate = true; sGeo.attributes.aRGBA.needsUpdate = true;
      for (const w of waves) {
        if (w.t > w.life) { w.m.visible = false; continue; }
        w.t += dt; if (w.t < 0) continue;
        const k = Math.min(1, w.t / w.life), e = 1 - (1 - k) * (1 - k);
        w.m.visible = true; w.m.scale.setScalar(w.r0 + (w.r1 - w.r0) * e); w.m.material.uniforms.uA.value = (1 - k) * 0.9;
      }
      if (geyT < F.geyserLife) {
        geyT += dt; const k = geyT / F.geyserLife, rise = reduced ? 1 : Math.min(1, geyT / 0.18);
        geyser.visible = true; geyser.scale.set(geyR * (1 + k * 0.3), 14 * rise * (1 - k * 0.3), geyR * (1 + k * 0.3)); geyser.material.uniforms.uA.value = (1 - k) * 0.6;
      } else geyser.visible = false;
      if (arcT < F.arcLife) {
        arcT += dt; const k = arcT / F.arcLife;
        arc.visible = true; arc.rotation.z = arcDir * (reduced ? 0 : k * Math.PI * 1.6); arc.material.opacity = (1 - k) * 0.8;
        if (!reduced) for (let i = 0; i < 3; i++) { const a = arc.rotation.z + rand() * Math.PI * 0.7; emit(arc.position.x + Math.cos(a) * arcR, 0.3, arc.position.z - Math.sin(a) * arcR, 0, 2 + rand() * 3, 0, F.ice, 0.5, 0.5, 1, 6); }
      } else arc.visible = false;
      if (crust) { if (crustT < F.crustLife) { crustT += dt; crust.visible = true; crustMat.opacity = 0.32 * (1 - crustT / F.crustLife); } else crust.visible = false; }
    },
    /** Live particles (tests and the HUD). */
    get live() { return live; },
    /** Live streaks. */
    get streaks() { return sLive; },
    dispose() { geo.dispose(); sGeo.dispose(); waveGeo.dispose(); geyGeo.dispose(); arcGeo.dispose(); if (crust) crust.geometry.dispose(); group.removeFromParent(); },
  };
  return api;
}
