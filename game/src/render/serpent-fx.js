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
//   sfx.frostOn(at); sfx.wave(at, color, radius); sfx.update(dt, reduced)

/** Numbers of the effects (pure, for the tests and tuning). */
export const SERPENT_FX = Object.freeze({
  frost: 360, frostPhone: 160, waves: 8, ice: 0x9fe8ff, deep: 0x3a8cff, warm: 0xff9a5a,
  waveLife: 0.75, geyserLife: 0.9, arcLife: 0.45, crustLife: 1.6,
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

/** Drives a tell: progress k (0..1), opacity, the clock. */
export function setTele(mat, k, op, t) { const u = mat.uniforms; u.uK.value = teleFill(k); u.uOp.value = op; u.uTime.value = t; }

const PTS_VERT = `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vA; varying vec3 vC; uniform float uScale;
void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`;
const PTS_FRAG = `varying float vA; varying vec3 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float r = dot(c, c) * 4.0; if (r > 1.0) discard; float s = exp(-r * 3.0); gl_FragColor = vec4(vC * (0.6 + s), vA * s); }`;
const WAVE_FRAG = `uniform vec3 uColor; uniform float uA; varying vec2 vUv; void main(){ gl_FragColor = vec4(uColor, uA * smoothstep(0.0, 0.6, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y))); }`;
const GEY_FRAG = `uniform vec3 uColor; uniform float uA; varying vec2 vUv; void main(){ float h = vUv.y; gl_FragColor = vec4(uColor * (1.2 - h * 0.5), uA * (1.0 - h) * (0.55 + 0.45 * sin(vUv.x * 37.7))); }`;
const UV_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** @param {{THREE: object, parent: object, mobile?: boolean, rand?: () => number}} o */
export function createSerpentFx({ THREE, parent, mobile = false, rand = Math.random }) {
  const F = SERPENT_FX, cap = mobile ? F.frostPhone : F.frost;
  const group = new THREE.Group(); group.name = 'serpent_fx'; parent.add(group);
  // ---- frost points: a ring buffer of particles
  const pos = new Float32Array(cap * 3), vel = new Float32Array(cap * 3), col = new Float32Array(cap * 3), size = new Float32Array(cap), alpha = new Float32Array(cap), life = new Float32Array(cap), age = new Float32Array(cap), drag = new Float32Array(cap), grav = new Float32Array(cap), size0 = new Float32Array(cap);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: { uScale: { value: 1000 } }, vertexShader: PTS_VERT, fragmentShader: PTS_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; group.add(pts);
  let head = 0, live = 0, reducedNow = false;
  const tmpC = new THREE.Color();
  /** One particle (no allocation): position, velocity, colour, size (metres across; uScale ~ pixels per metre at 1 m), life (s), drag (1/s), gravity (m/s²). */
  function emit(x, y, z, vx, vy, vz, color, sz, lf, dr = 1.5, gr = 0) {
    if (reducedNow && rand() > 0.34) return;
    const i = head; head = (head + 1) % cap;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    tmpC.setHex(color); col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
    size0[i] = sz; size[i] = sz; life[i] = lf; age[i] = 0; drag[i] = dr; grav[i] = gr; alpha[i] = 1;
  }
  // ---- waves: expanding rings on the mirror
  const waveGeo = new THREE.RingGeometry(0.82, 1, 72, 1); // uv.y runs 0 (inner) .. 1 (outer) after the remap below
  { const uv = waveGeo.attributes.uv, p = waveGeo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setY(i, (Math.hypot(p.getX(i), p.getY(i)) - 0.82) / 0.18); }
  const waves = Array.from({ length: F.waves }, () => {
    const m = new THREE.Mesh(waveGeo, new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color() }, uA: { value: 0 } }, vertexShader: UV_VERT, fragmentShader: WAVE_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.visible = false; m.frustumCulled = false; group.add(m);
    return { m, t: 0, life: F.waveLife, r0: 0.5, r1: 5, delay: 0 };
  });
  let waveNext = 0;
  /** A ring that grows from r0 to r1 over `lf` seconds, after `delay`. */
  function wave(at, color, r1, { r0 = 0.4, lf = F.waveLife, delay = 0, y = 0.07 } = {}) {
    const w = waves[waveNext]; waveNext = (waveNext + 1) % waves.length;
    w.m.position.set(at[0], (at[1] || 0) + y, at[2]); w.m.material.uniforms.uColor.value.setHex(color);
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

  let inhaleT = 0, inhaleAt = [0, 0, 0];
  const api = {
    group,
    /** The inhale before the breath: motes drawn into the jaws for `secs`. */
    inhale(mouth, secs) { inhaleT = secs; inhaleAt[0] = mouth[0]; inhaleAt[1] = mouth[1]; inhaleAt[2] = mouth[2]; },
    /** One frame of the breath (call while it is active): a stream of frost from the jaws along the cone, mist at its tip. */
    breathFrame(mouth, dir, half, length, dt) {
      inhaleT = 0;
      const n = Math.max(1, Math.round((mobile ? 90 : 220) * dt));
      for (let i = 0; i < n; i++) {
        const s = (rand() * 2 - 1) * half, a = Math.atan2(dir[0], dir[1]) + s, sp = 16 + rand() * 10;
        emit(mouth[0] + (rand() - 0.5) * 0.4, mouth[1] + (rand() - 0.5) * 0.4, mouth[2] + (rand() - 0.5) * 0.4,
          Math.sin(a) * sp, -mouth[1] / (length / sp) * (0.8 + rand() * 0.4), Math.cos(a) * sp,
          rand() < 0.25 ? 0xffffff : rand() < 0.5 ? F.ice : 0x6cc8ff, 0.32 + rand() * 0.4, length / sp * (0.9 + rand() * 0.3), 0.6, 0);
      }
      const c = crustFor(half, length); c.position.set(mouth[0], 0.04, mouth[2]); c.rotation.y = Math.atan2(dir[0], dir[1]); crustT = 0;
    },
    /** A blow landing: `info` {at: [x, z] arena-local, dir: [dx, dz], A: the attack's numbers, boss: [x, z]}. */
    strike(kind, info) {
      const A = info.A || {}, at = info.at, dir = info.dir;
      if (kind === 'slam' || kind === 'dive') {
        const r = A.radius || 6;
        wave([at[0], 0, at[1]], F.ice, r * 1.25, { lf: 0.6 }); wave([at[0], 0, at[1]], 0xffffff, r * 1.7, { lf: 0.85, delay: 0.12, r0: r * 0.5 });
        geyser.position.set(at[0], 0, at[1]); geyT = 0; geyR = Math.max(1.5, r * 0.32);
        for (let i = 0; i < 70; i++) { const a = rand() * Math.PI * 2, s = 3 + rand() * 9; emit(at[0] + Math.sin(a) * r * 0.3, 0.2, at[1] + Math.cos(a) * r * 0.3, Math.sin(a) * s, 8 + rand() * 12, Math.cos(a) * s, rand() < 0.4 ? 0xffffff : F.ice, 0.3 + rand() * 0.45, 0.9 + rand() * 0.6, 0.8, 18); }
      } else if (kind === 'sweep') {
        const b = info.boss, r = A.radius || 16;
        arc.position.set(b[0], 0.1, b[1]); arc.scale.setScalar(r); arcT = 0; arcR = r; arcDir = rand() < 0.5 ? 1 : -1;
        wave([b[0], 0, b[1]], F.ice, r * 1.05, { r0: (A.inner || 6), lf: 0.55 });
      } else if (kind === 'lunge' && dir) {
        const L = A.length || 30;
        for (let i = 0; i < 90; i++) { const u = rand(), side = (rand() - 0.5) * (A.width || 4); emit(at[0] + dir[0] * L * u + dir[1] * side, 0.3, at[1] + dir[1] * L * u - dir[0] * side, dir[1] * side * 1.5, 2 + rand() * 4, -dir[0] * side * 1.5, F.ice, 0.28 + rand() * 0.3, 0.6 + rand() * 0.5, 2.2, 9); }
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
      for (let i = 0; i < 80; i++) { const a = rand() * Math.PI * 2, s = 6 + rand() * 8; emit(at[0], 3 + rand() * 6, at[1], Math.sin(a) * s, rand() * 6, Math.cos(a) * s, F.ice, 0.35 + rand() * 0.35, 1 + rand() * 0.6, 1.2, 4); }
    },
    /** Frost bursting off her when a blow lands on her: shards and a small ring at her feet. */
    frostOn(at) {
      for (let i = 0; i < 40; i++) { const a = rand() * Math.PI * 2, s = 2 + rand() * 4; emit(at[0], at[1] + 0.6 + rand() * 1.1, at[2], Math.sin(a) * s, 1 + rand() * 4, Math.cos(a) * s, rand() < 0.5 ? 0xffffff : F.ice, 0.08 + rand() * 0.1, 0.5 + rand() * 0.4, 2.5, 9); }
      wave([at[0], at[1], at[2]], F.ice, 1.8, { lf: 0.4 });
    },
    /** A plain ring (her landings, a shockwave). */
    wave(at, color, radius, opts) { wave(at, color, radius, opts); },
    /** Per frame. */
    update(dt, reduced = false) {
      reducedNow = reduced;
      if (inhaleT > 0) { // motes from a shell around the jaws, drawn in
        inhaleT -= dt;
        const n = Math.max(1, Math.round((mobile ? 30 : 70) * dt));
        for (let i = 0; i < n; i++) { const a = rand() * Math.PI * 2, b = (rand() - 0.3) * 1.2, r = 5 + rand() * 3, x = Math.cos(b) * Math.sin(a) * r, y = Math.sin(b) * r, z = Math.cos(b) * Math.cos(a) * r, k = 1.6; emit(inhaleAt[0] + x, inhaleAt[1] + y, inhaleAt[2] + z, -x * k, -y * k, -z * k, F.ice, 0.14 + rand() * 0.16, 0.55, 0, 0); }
      }
      live = 0;
      for (let i = 0; i < cap; i++) {
        if (age[i] >= life[i]) { if (alpha[i] !== 0) { alpha[i] = 0; size[i] = 0; } continue; }
        live++;
        age[i] += dt; const k = age[i] / life[i], d = Math.exp(-drag[i] * dt);
        vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d - grav[i] * dt; vel[i * 3 + 2] *= d;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] = Math.max(0.03, pos[i * 3 + 1] + vel[i * 3 + 1] * dt); pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        alpha[i] = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85; size[i] = size0[i] * (0.7 + 0.6 * k);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aAlpha.needsUpdate = true; geo.attributes.aSize.needsUpdate = true; geo.attributes.aColor.needsUpdate = true;
      for (const w of waves) {
        if (w.t > w.life) { w.m.visible = false; continue; }
        w.t += dt; if (w.t < 0) continue;
        const k = Math.min(1, w.t / w.life), e = 1 - (1 - k) * (1 - k);
        w.m.visible = true; w.m.scale.setScalar(w.r0 + (w.r1 - w.r0) * e); w.m.material.uniforms.uA.value = (1 - k) * 0.9;
      }
      if (geyT < F.geyserLife) {
        geyT += dt; const k = geyT / F.geyserLife, rise = reduced ? 1 : Math.min(1, geyT / 0.18);
        geyser.visible = true; geyser.scale.set(geyR * (1 + k * 0.3), 14 * rise * (1 - k * 0.3), geyR * (1 + k * 0.3)); geyser.material.uniforms.uA.value = (1 - k) * 0.85;
      } else geyser.visible = false;
      if (arcT < F.arcLife) {
        arcT += dt; const k = arcT / F.arcLife;
        arc.visible = true; arc.rotation.z = arcDir * (reduced ? 0 : k * Math.PI * 1.6); arc.material.opacity = (1 - k) * 0.8;
        if (!reduced) for (let i = 0; i < 3; i++) { const a = arc.rotation.z + rand() * Math.PI * 0.7; emit(arc.position.x + Math.cos(a) * arcR, 0.3, arc.position.z - Math.sin(a) * arcR, 0, 2 + rand() * 3, 0, F.ice, 0.3, 0.5, 1, 6); }
      } else arc.visible = false;
      if (crust) { if (crustT < F.crustLife) { crustT += dt; crust.visible = true; crustMat.opacity = 0.32 * (1 - crustT / F.crustLife); } else crust.visible = false; }
    },
    /** Live particles (tests and the HUD). */
    get live() { return live; },
    dispose() { geo.dispose(); waveGeo.dispose(); geyGeo.dispose(); arcGeo.dispose(); if (crust) crust.geometry.dispose(); group.removeFromParent(); },
  };
  return api;
}
