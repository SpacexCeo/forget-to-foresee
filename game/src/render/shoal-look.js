// The Glass Shoal's look (docs/plans/boss/glass-shoal-boss.md; original work, nothing copied from any demo): a vast
// mirror-wet salt flat under a low warm sun, cool sky fill, mist, god rays through it, bloom on crystals and a colour
// grade (lift / gamma / gain baked into a LUT). The gameplay seat builds the island's scene graph; this module owns
// how it looks and how it is rendered:
//   const look = createShoalLook({ renderer, scene, camera, tier, profile, params });
//   look.attach(root)        wires every MeshStandard/Physical material under root to the cascaded shadows
//   look.update(dt, focus)   time (ripples, mist), the sun shadow follows the focus (the player)
//   look.render()            the post stack (or the direct path)
//   look.set(params)         any SHOAL_PARAMS subset (the render panel calls it); look.params, look.quality
//   look.crystal(hex)        an emissive material that blooms (spires, VFX)
//   look.dispose()
// Quality (shoalQuality): desktop high = planar reflector + cascaded shadows + bloom + god rays; phone = a static
// reflection of the sky (no second scene render), one shadow cascade, half-resolution bloom.
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GodRaysPass } from './post.js';
import { clampParams, shoalQuality, sunDirection, sunColor, buildLut, SHOAL_DEFAULT } from './shoal-look-data.js';

export const SHOAL_SIZE = 900;          // the flat's side in metres (it reads as endless under the fog)
const SKY_R = 1600;

// ---------------------------------------------------------------- sky
const SKY_VS = /* glsl */`varying vec3 vDir; void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = /* glsl */`
  uniform vec3 uSun, uSunColor, uZenith, uHorizon, uGround; uniform float uHaze;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir); float h = d.y;
    float toward = max(dot(d, uSun), 0.0);
    vec3 sky = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.38, h), 0.7));
    sky = mix(sky, uHorizon * 1.15 + uSunColor * 0.25, pow(1.0 - abs(h), 6.0) * (0.55 + 0.45 * toward));   // the warm band at the horizon
    sky += uSunColor * pow(toward, 3.0) * 0.14;                                                        // no sun in the sky: only a broad glow toward the light
    sky = mix(sky, uGround, smoothstep(0.0, -0.08, h));
    sky = mix(sky, uHorizon, uHaze * (1.0 - smoothstep(0.0, 0.35, abs(h))) * 0.6);
    gl_FragColor = vec4(sky, 1.0);
  }`;

// ---------------------------------------------------------------- the mirror flat (planar reflector shader)
const FLAT_VS = /* glsl */`
  uniform mat4 textureMatrix; varying vec4 vUvR; varying vec3 vWorld; varying vec2 vUv;
  void main() { vUv = uv; vUvR = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const NOISE = /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
  vec2 rippleN(vec2 p, float t) {                       // the ripple normal: two drifting octaves, finite differences
    float e = 0.08;
    float h0 = fbm(p * 0.9 + vec2(t * 0.05, t * 0.03)) + 0.5 * fbm(p * 3.1 - vec2(t * 0.11, -t * 0.07));
    float hx = fbm((p + vec2(e, 0)) * 0.9 + vec2(t * 0.05, t * 0.03)) + 0.5 * fbm((p + vec2(e, 0)) * 3.1 - vec2(t * 0.11, -t * 0.07));
    float hy = fbm((p + vec2(0, e)) * 0.9 + vec2(t * 0.05, t * 0.03)) + 0.5 * fbm((p + vec2(0, e)) * 3.1 - vec2(t * 0.11, -t * 0.07));
    return vec2(hx - h0, hy - h0) / e;
  }`;
const FLAT_FS = /* glsl */`
  uniform sampler2D tDiffuse; uniform vec3 color;
  uniform float uTime, uMirror, uRough, uRipple, uFogDensity, uMist; uniform vec3 uFogColor, uSun, uSunColor, uCam, uSalt;
  varying vec4 vUvR; varying vec3 vWorld; varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = vWorld.xz * 0.35;
    // wet (mirror) and dry (salt crust) patches: the puddle edges
    float wetMask = smoothstep(0.32, 0.48, fbm(vWorld.xz * 0.045) + 0.15);
    vec2 n = rippleN(p, uTime) * uRipple * (0.4 + 0.6 * wetMask);
    vec3 N = normalize(vec3(-n.x * 0.12, 1.0, -n.y * 0.12));
    vec3 V = normalize(uCam - vWorld);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    // the reflection: projected uv bent by the ripples, blurred by roughness (an 8-tap ring)
    vec2 uv = vUvR.xy / vUvR.w + n * 0.012 * uRipple;
    float r = uRough * 0.012 * (1.0 + (1.0 - wetMask) * 2.0);
    vec3 refl = texture2D(tDiffuse, uv).rgb * 0.2;
    for (int i = 0; i < 8; i++) { float a = float(i) * 0.7853981; refl += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * r).rgb * 0.1; }
    // the salt: pale and slightly cool, brighter where it is dry
    vec3 salt = uSalt * (0.82 + 0.25 * fbm(vWorld.xz * 0.6)) * mix(1.15, 0.55, wetMask);
    float lit = max(dot(N, uSun), 0.0) * 0.6 + 0.4;
    vec3 base = salt * lit * uSunColor * 0.55;
    float m = uMirror * mix(0.25, 1.0, wetMask) * mix(0.45, 1.0, fres);
    vec3 c = mix(base, refl, m);
    // the sun's glitter on the ripples
    vec3 H = normalize(uSun + V);
    c += uSunColor * pow(max(dot(N, H), 0.0), 36.0) * 0.5 * wetMask * (0.4 + uRipple);   // a broad sheen, not a sun path
    // fog and the low mist (thicker toward the horizon, it hugs the flat)
    float d = length(vWorld - uCam);
    float fog = 1.0 - exp(-pow(uFogDensity * d, 2.0));
    fog = max(fog, uMist * smoothstep(40.0, 420.0, d) * 0.85);
    c = mix(c, uFogColor, clamp(fog, 0.0, 1.0));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// ---------------------------------------------------------------- the grade (after tone mapping, display space)
const GradeLutShader = {
  uniforms: { tDiffuse: { value: null }, tLut: { value: null }, uSize: { value: 16 }, uVignette: { value: 0.28 }, uAmount: { value: 1 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tLut; uniform float uSize, uVignette, uAmount; varying vec2 vUv;
    vec3 lut(vec3 c) {
      c = clamp(c, 0.0, 1.0); float b = c.b * (uSize - 1.0); float b0 = floor(b), b1 = min(b0 + 1.0, uSize - 1.0);
      vec2 rg = (c.rg * (uSize - 1.0) + 0.5) / vec2(uSize * uSize, uSize);
      vec3 s0 = texture2D(tLut, rg + vec2(b0 / uSize, 0.0)).rgb, s1 = texture2D(tLut, rg + vec2(b1 / uSize, 0.0)).rgb;
      return mix(s0, s1, b - b0);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 g = mix(c.rgb, lut(c.rgb), uAmount);
      vec2 q = vUv - 0.5; g *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
      gl_FragColor = vec4(g, c.a);
    }`,
};

/**
 * @param {{renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, tier?: string, profile?: string,
 *   params?: object, reduced?: () => boolean, withFlat?: boolean, origin?: {x: number, y: number, z: number}, embedded?: boolean}} o
 *   `origin`: where the flat sits in the world (the arena's centre). `embedded`: inside the game (the arena look): the
 *   pixel ratio, shadow type and scene fog stay the game's; the caller swaps `look.fog` in and out (shoal-arena-look.js).
 */
export function createShoalLook({ renderer, scene, camera, tier = 'high', profile = 'desktop', params = SHOAL_DEFAULT, reduced = () => false, withFlat = true, origin = null, embedded = false }) {
  const Q = shoalQuality(tier, profile);
  let P = clampParams(params);
  const root = new THREE.Group(); root.name = 'shoal_look'; if (origin) root.position.set(origin.x, origin.y, origin.z); scene.add(root);
  const sunDir = new THREE.Vector3(), sunCol = new THREE.Color();
  const zenith = new THREE.Color().setRGB(0.07, 0.2, 0.38), horizon = new THREE.Color(0xe7c39a), ground = new THREE.Color(0x8a8278), fogColor = new THREE.Color(0xd9c3a6);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  if (!embedded) { renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, Q.pixelRatioMax)); }

  // sky
  const skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDir }, uSunColor: { value: sunCol }, uZenith: { value: zenith }, uHorizon: { value: horizon }, uGround: { value: ground }, uHaze: { value: 0.22 } } });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 48, 24), skyMat); sky.name = 'shoal_sky'; sky.frustumCulled = false; sky.renderOrder = -10; root.add(sky);
  // light: the low sun (cascaded on desktop), a cool sky fill
  const hemi = new THREE.HemisphereLight(0x9fb4c4, 0x6e5b48, 0.55); root.add(hemi);
  let csm = null, sun = null;
  if (Q.cascades > 1) {
    csm = new CSM({ maxFar: 600, cascades: Q.cascades, mode: 'practical', parent: scene, shadowMapSize: Q.shadowSize, lightDirection: new THREE.Vector3(0, -1, 0), camera, lightIntensity: 3.2, lightMargin: 120 });
    csm.fade = true;
  } else {
    sun = new THREE.DirectionalLight(0xffffff, 3.2); sun.castShadow = true; sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
    const s = sun.shadow.camera; s.left = -60; s.right = 60; s.top = 60; s.bottom = -60; s.near = 1; s.far = 400; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    root.add(sun, sun.target);
  }
  const fog = new THREE.FogExp2(fogColor, P.fog);
  if (!embedded) scene.fog = fog;

  // the flat
  let flat = null, reflector = null, flatMat = null;
  if (withFlat) {
    const geo = new THREE.PlaneGeometry(SHOAL_SIZE, SHOAL_SIZE, 1, 1);
    if (Q.reflector) {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2()).multiplyScalar(Q.reflectorScale);
      reflector = new Reflector(geo, { textureWidth: Math.max(256, Math.round(size.x)), textureHeight: Math.max(256, Math.round(size.y)), clipBias: 0.002,
        shader: { name: 'ShoalFlat', uniforms: {
          color: { value: new THREE.Color(0xffffff) }, tDiffuse: { value: null }, textureMatrix: { value: null },
          uTime: { value: 0 }, uMirror: { value: P.mirror }, uRough: { value: P.roughness }, uRipple: { value: P.ripple }, uFogDensity: { value: P.fog }, uMist: { value: P.mist },
          uFogColor: { value: fogColor }, uSun: { value: sunDir }, uSunColor: { value: sunCol }, uCam: { value: new THREE.Vector3() }, uSalt: { value: new THREE.Color(0xd8d3ca) } },
          vertexShader: FLAT_VS, fragmentShader: FLAT_FS } });
      reflector.rotation.x = -Math.PI / 2; reflector.name = 'shoal_flat'; flat = reflector; flatMat = reflector.material;
      const u = flatMat.uniforms; u.uFogColor.value = fogColor; u.uSun.value = sunDir; u.uSunColor.value = sunCol;   // Reflector clones the uniforms: share the live ones again
    } else {
      // phones: one static reflection of the sky (PMREM), a ripple normal map, no second scene render
      const pmrem = new THREE.PMREMGenerator(renderer); const skyScene = new THREE.Scene(); skyScene.add(sky.clone());
      const env = pmrem.fromScene(skyScene, 0, 1, 3000).texture; pmrem.dispose();
      flatMat = new THREE.MeshPhysicalMaterial({ color: 0xcfc9bf, roughness: 0.08 + P.roughness * 0.4, metalness: 0, envMap: env, envMapIntensity: 1.2 * P.mirror + 0.2, clearcoat: 1, clearcoatRoughness: 0.05 + P.roughness * 0.3 });
      flatMat.normalMap = rippleNormalTexture(); flatMat.normalMap.wrapS = flatMat.normalMap.wrapT = THREE.RepeatWrapping; flatMat.normalMap.repeat.set(120, 120);
      flatMat.normalScale.set(0.25 * P.ripple, 0.25 * P.ripple);
      flat = new THREE.Mesh(geo, flatMat); flat.rotation.x = -Math.PI / 2; flat.receiveShadow = true; flat.name = 'shoal_flat';
    }
    root.add(flat);
  }

  // low mist sheets near the horizon (soft, depth-tested, no shadows)
  const mistMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false,
    uniforms: { uColor: { value: fogColor }, uAmount: { value: P.mist }, uTime: { value: 0 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uAmount, uTime; varying vec2 vUv; ${NOISE}
      void main() { float n = fbm(vec2(vUv.x * 6.0 + uTime * 0.01, vUv.y * 2.0)); float a = smoothstep(1.0, 0.0, vUv.y) * smoothstep(0.0, 0.25, vUv.y) * (0.5 + 0.5 * n);
        gl_FragColor = vec4(uColor, a * uAmount * 0.55); }` });
  const mist = new THREE.Group(); mist.name = 'shoal_mist';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, m = new THREE.Mesh(new THREE.PlaneGeometry(520, 34), mistMat);
    m.position.set(Math.sin(a) * 330, 12, Math.cos(a) * 330); m.lookAt(0, 12, 0); m.renderOrder = 2; mist.add(m);
  }
  root.add(mist);

  // the post stack
  let composer = null, bloom = null, rays = null, grade = null, lutTex = null;
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: Q.msaa });
  rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (Q.rays) { rays = new GodRaysPass({ scale: Q.raysScale }); composer.addPass(rays); }
  if (Q.bloom) { bloom = new UnrealBloomPass(new THREE.Vector2(size.x * Q.bloomScale, size.y * Q.bloomScale), P.bloom * 0.35, 0.35, 2.2); composer.addPass(bloom); }
  composer.addPass(new OutputPass());
  grade = new ShaderPass(GradeLutShader); composer.addPass(grade);
  const rebuildLut = () => {
    const L = buildLut(P, 16);
    if (lutTex) lutTex.dispose();
    lutTex = new THREE.DataTexture(L.data, L.width, L.height, THREE.RGBAFormat); lutTex.minFilter = lutTex.magFilter = THREE.LinearFilter; lutTex.needsUpdate = true;
    grade.uniforms.tLut.value = lutTex; grade.uniforms.uSize.value = L.size;
  };

  function apply() {
    const d = sunDirection(P.sunHeight, P.sunBearing); sunDir.set(d[0], d[1], d[2]).normalize();
    const c = sunColor(P.sunHeight); sunCol.setRGB(c[0], c[1], c[2]);
    horizon.setRGB(0.91 * (0.75 + 0.25 * c[1]), 0.76 * (0.7 + 0.3 * c[1]), 0.6 * (0.6 + 0.4 * c[2]));
    fogColor.copy(horizon).lerp(new THREE.Color(0xc9ccc8), 0.35);
    fog.color.copy(fogColor); fog.density = P.fog;
    if (csm) { csm.lightDirection.copy(sunDir).negate(); for (const l of csm.lights) l.color.copy(sunCol); }
    if (sun) { sun.color.copy(sunCol); }
    hemi.intensity = 1.1 + 0.4 * Math.min(1, P.sunHeight / 25);   // no sun disc: the sky fill carries the shadow side
    renderer.toneMappingExposure = P.exposure;
    camera.fov = P.fov; camera.updateProjectionMatrix();
    if (flatMat && flatMat.uniforms) { const u = flatMat.uniforms; u.uMirror.value = P.mirror; u.uRough.value = P.roughness; u.uRipple.value = P.ripple; u.uFogDensity.value = P.fog; u.uMist.value = P.mist; }
    else if (flatMat) { flatMat.roughness = 0.08 + P.roughness * 0.4; flatMat.envMapIntensity = 1.2 * P.mirror + 0.2; flatMat.normalScale.set(0.25 * P.ripple, 0.25 * P.ripple); flatMat.clearcoatRoughness = 0.05 + P.roughness * 0.3; }
    mistMat.uniforms.uAmount.value = P.mist;
    if (bloom) bloom.strength = P.bloom * 0.35;
    if (rays) { rays.enabled = P.rays > 0; rays.intensity = P.rays * 0.18; rays.setSunColor(sunCol); }
    rebuildLut();
  }
  apply();

  const crystals = [];
  let time = 0;
  const api = {
    root, fog, get params() { return { ...P }; }, quality: Q, get composer() { return composer; },
    set(p) { P = clampParams({ ...P, ...p }); apply(); },
    attach(obj) { if (!csm) return; obj.traverse((o) => { if (o.isMesh) { o.castShadow = o.castShadow !== false; o.receiveShadow = true; const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) && !m.userData.csm) { csm.setupMaterial(m); m.userData.csm = true; } } }); },
    crystal(hex = 0x9fe8e0, k = 3.2) { const m = new THREE.MeshStandardMaterial({ color: 0x223a3a, emissive: hex, emissiveIntensity: k, roughness: 0.15, metalness: 0.1 }); crystals.push(m); return m; },
    update(dt, focus = null) {
      if (!reduced()) time += dt;
      if (flatMat && flatMat.uniforms) { flatMat.uniforms.uTime.value = time; flatMat.uniforms.uCam.value.copy(camera.position); }
      mistMat.uniforms.uTime.value = time;
      sky.position.copy(camera.position).sub(root.position);   // the dome follows the camera (root-local)
      if (csm) csm.update();
      if (sun) { const f = focus || camera.position, o = root.position; sun.target.position.set(f.x - o.x, 0, f.z - o.z); sun.position.set(f.x - o.x + sunDir.x * 200, sunDir.y * 200, f.z - o.z + sunDir.z * 200); }
      if (rays) rays.setSun(sunDir, camera);
    },
    render() { composer.render(); },
    /** Show or hide everything this look added (the arena look turns it on for the fight only). */
    setVisible(v) { root.visible = v; if (csm) for (const l of csm.lights) l.visible = v; },
    setSize(w, h) { composer.setSize(w, h); if (bloom) bloom.setSize(w * Q.bloomScale, h * Q.bloomScale); if (csm) csm.updateFrustums(); },
    dispose() { scene.remove(root); if (scene.fog === fog) scene.fog = null; composer.dispose(); rt.dispose(); if (lutTex) lutTex.dispose(); if (csm) csm.dispose(); if (reflector) reflector.dispose(); skyMat.dispose(); mistMat.dispose(); for (const m of crystals) m.dispose(); },
  };
  return api;
}

/** A tileable ripple normal map (phones), made once. */
function rippleNormalTexture(n = 128) {
  const h = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let v = 0; for (let k = 1; k <= 4; k++) v += Math.sin((x / n) * Math.PI * 2 * k * 3 + k * 1.7) * Math.cos((y / n) * Math.PI * 2 * (k * 2 + 1) + k) / k;
    h[y * n + x] = v;
  }
  const d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = h[y * n + ((x + 1) % n)] - h[y * n + ((x + n - 1) % n)], dy = h[((y + 1) % n) * n + x] - h[((y + n - 1) % n) * n + x];
    const v = new THREE.Vector3(-dx, -dy, 4).normalize(), i = (y * n + x) * 4;
    d[i] = (v.x * 0.5 + 0.5) * 255; d[i + 1] = (v.y * 0.5 + 0.5) * 255; d[i + 2] = (v.z * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat); t.needsUpdate = true; return t;
}

/**
 * Placeholder dressing for the look preview and stills (the real island comes from the gameplay seat): broken
 * monoliths, crystal spires on the horizon, a lone lamp post, cracked rocks, a figure for scale. Original shapes.
 */
export function dressPreview(look, scene) {
  const g = new THREE.Group(); g.name = 'shoal_preview_dressing';
  const stone = new THREE.MeshStandardMaterial({ color: 0x6d675f, roughness: 0.82 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3b3936, roughness: 0.6, metalness: 0.2 });
  const rnd = mulberry(7);
  for (let i = 0; i < 9; i++) {                                   // monoliths in a loose broken ring
    const a = (i / 9) * Math.PI * 2 + rnd() * 0.3, r = 38 + rnd() * 26, h = 7 + rnd() * 16;
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.4 + rnd() * 2, h, 1.6 + rnd()), stone);
    m.position.set(Math.sin(a) * r, h / 2 - 0.6, Math.cos(a) * r); m.rotation.set((rnd() - 0.5) * 0.25, rnd() * Math.PI, (rnd() - 0.5) * 0.3);
    m.castShadow = true; g.add(m);
  }
  const glow = look.crystal(0x9fe8e0, 3.4), glowWarm = look.crystal(0xffc98a, 2.6);
  for (let i = 0; i < 14; i++) {                                  // crystal spires on the horizon
    const a = rnd() * Math.PI * 2, r = 160 + rnd() * 140, h = 18 + rnd() * 50;
    const c = new THREE.Mesh(new THREE.ConeGeometry(2 + rnd() * 5, h, 5), i % 4 ? glow : glowWarm);
    c.position.set(Math.sin(a) * r, h / 2, Math.cos(a) * r); c.rotation.z = (rnd() - 0.5) * 0.3; g.add(c);
  }
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.2, 10), dark); post.position.set(9, 2.6, -6); post.castShadow = true; g.add(post);
  const lampMat = look.crystal(0xffd59a, 4.5), lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), lampMat); lamp.position.set(9, 5.3, -6); g.add(lamp);
  const pl = new THREE.PointLight(0xffc78a, 18, 24, 1.6); pl.position.copy(lamp.position); g.add(pl);
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + rnd() * 2.4, 0), stone); r.position.set((rnd() - 0.5) * 70, 0.4, (rnd() - 0.5) * 70 - 20); r.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); r.castShadow = true; g.add(r); }
  const figure = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.1, 6, 12), new THREE.MeshStandardMaterial({ color: 0x24201c, roughness: 0.7 })); figure.position.set(0, 0.88, 0); figure.castShadow = true; g.add(figure);
  scene.add(g); look.attach(g);
  return g;
}
const mulberry = (a) => () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
