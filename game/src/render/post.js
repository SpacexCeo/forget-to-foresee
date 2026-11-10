// Post-processing stack (quality tiers ultra/high; the low tier renders directly).
//   RenderPass (MSAA 4x, half-float, depth texture)
//   -> GodRaysPass: screen-space light shafts from the sun through the sky mask (quarter/half res)
//   -> GTAOPass (ultra full res, high half res): contact shadows under eaves, rims and roots
//   -> HdrGuard: clamp, NaN/Inf to black (hdr-guard.js)
//   -> UnrealBloomPass: threshold above diffuse white, so only emissives bloom (lanterns, amber floor
//      lights, the glyph, the nacre rim of the Shells, the sun disc), never sunlit stone
//   -> OutputPass: the game's tone mapping and grade (render/grade.js) + sRGB (display referred from here on)
//   -> SMAAPass (ultra): edge smoothing on top of the MSAA, no temporal pass, so nothing smears
//   -> GradePass: vignette and fine grain (the colour grade itself lives in the tone mapping, shared with the direct path)
// The VFX module inserts its soft-particle pass before the bloom (vfx.attachToComposer): it looks
// for a pass whose class name contains Bloom or OutputPass and reads renderTarget1.depthTexture, so
// those two stay and the render target keeps its depth texture.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { OutputShader } from 'three/examples/jsm/shaders/OutputShader.js';
import { createHdrGuardPass } from './hdr-guard.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { LAYER_OVERLAY } from './layers.js';

const COPY_VS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Bloom threshold in linear HDR: diffuse white under the sun stays below it, emissives are above. */
export const BLOOM = Object.freeze({ strength: 0.42, radius: 0.62, threshold: 1.18 });

/** Strength of the light shafts under a clear sky. */
const RAYS = 0.24;

/** Light shafts: sky pixels near the sun form a mask, two radial blurs smear it toward the sun, added back. */
export class GodRaysPass extends Pass {
  constructor({ scale = 0.25 } = {}) {
    super();
    this.scale = scale;
    this.sunUv = new THREE.Vector2(0.5, 0.5);
    this.intensity = 0.36;
    this.color = new THREE.Color(0xffe5c4);
    this.rtA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtB = this.rtA.clone();
    this.maskMat = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: null }, uSun: { value: this.sunUv }, uAspect: { value: 1 } },
      vertexShader: COPY_VS,
      fragmentShader: /* glsl */`
        uniform sampler2D tDepth; uniform vec2 uSun; uniform float uAspect; varying vec2 vUv;
        void main() {
          float d = texture2D(tDepth, vUv).x;
          float sky = step(0.99995, d);
          vec2 v = (vUv - uSun) * vec2(uAspect, 1.0);
          float r = length(v);
          float glow = exp(-r * r * 14.0) + 0.14 * exp(-r * 2.6);
          gl_FragColor = vec4(vec3(sky * glow), 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uSun: { value: this.sunUv }, uDensity: { value: 0.9 }, uDecay: { value: 0.96 }, uWeight: { value: 1.0 } },
      vertexShader: COPY_VS,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uDensity, uDecay, uWeight; varying vec2 vUv;
        const int N = 20;
        void main() {
          vec2 step = (uSun - vUv) * (uDensity / float(N));
          vec2 uv = vUv; float w = uWeight; vec3 acc = vec3(0.0);
          for (int i = 0; i < N; i++) { acc += texture2D(tDiffuse, uv).rgb * w; uv += step; w *= uDecay; }
          gl_FragColor = vec4(acc / float(N) * 1.6, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tRays: { value: null }, uColor: { value: this.color }, uIntensity: { value: 0 } },
      vertexShader: COPY_VS,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse, tRays; uniform vec3 uColor; uniform float uIntensity; varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          float r = texture2D(tRays, vUv).r;
          gl_FragColor = vec4(c.rgb + uColor * r * uIntensity, c.a);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.maskMat);
    this.w = 1; this.h = 1;
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    const sw = Math.max(1, Math.round(w * this.scale)), sh = Math.max(1, Math.round(h * this.scale));
    this.rtA.setSize(sw, sh); this.rtB.setSize(sw, sh);
    this.maskMat.uniforms.uAspect.value = w / h;
  }

  /** The shafts take the sun's colour (linear RGB, normalised) so they agree with the sky. */
  setSunColor(color) { this.color.copy(color).lerp(new THREE.Color(1, 1, 1), 0.25); }

  /** Projects the sun direction; shafts fade out as the sun leaves the frame or goes behind the camera. */
  setSun(sunDirection, camera) {
    const p = camera.position.clone().addScaledVector(sunDirection, 1000).project(camera);
    const behind = p.z > 1 || sunDirection.dot(camera.getWorldDirection(new THREE.Vector3())) < 0;
    this.sunUv.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    const margin = 0.35;
    const inside = behind ? 0 : Math.min(
      THREE.MathUtils.smoothstep(this.sunUv.x, -margin, 0.05) * (1 - THREE.MathUtils.smoothstep(this.sunUv.x, 0.95, 1 + margin)),
      THREE.MathUtils.smoothstep(this.sunUv.y, -margin, 0.05) * (1 - THREE.MathUtils.smoothstep(this.sunUv.y, 0.9, 1 + margin)),
    );
    this.compMat.uniforms.uIntensity.value = this.intensity * inside;
  }

  render(renderer, writeBuffer, readBuffer) {
    if (this.compMat.uniforms.uIntensity.value > 0.001 && readBuffer.depthTexture) {
      this.maskMat.uniforms.tDepth.value = readBuffer.depthTexture;
      this.quad.material = this.maskMat; renderer.setRenderTarget(this.rtA); this.quad.render(renderer);
      this.blurMat.uniforms.tDiffuse.value = this.rtA.texture; this.blurMat.uniforms.uDensity.value = 0.5;
      this.quad.material = this.blurMat; renderer.setRenderTarget(this.rtB); this.quad.render(renderer);
      this.blurMat.uniforms.tDiffuse.value = this.rtB.texture; this.blurMat.uniforms.uDensity.value = 0.9;
      renderer.setRenderTarget(this.rtA); this.quad.render(renderer);
      this.compMat.uniforms.tRays.value = this.rtA.texture;
    } else {
      this.compMat.uniforms.tRays.value = null;
    }
    this.compMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.quad.material = this.compMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  dispose() { this.rtA.dispose(); this.rtB.dispose(); this.maskMat.dispose(); this.blurMat.dispose(); this.compMat.dispose(); this.quad.dispose(); }
}

/**
 * Display-referred grade after tone mapping: soft S-curve, split toning (cool shadows, warm
 * highlights), vignette and fine film grain. Deliberately mild: the grade supports the physically
 * based image, it never replaces it. Grain is time-seeded (uTime), static under reduced motion.
 */
export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uVignette: { value: 0.22 }, uSaturation: { value: 1.0 }, uContrast: { value: 1.0 },
    uShadowTint: { value: new THREE.Color(1, 1, 1) }, uHighlightTint: { value: new THREE.Color(1, 1, 1) },
    uGrain: { value: 0.028 }, uTime: { value: 0 }, uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: COPY_VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVignette, uSaturation, uContrast, uGrain, uTime; uniform vec3 uShadowTint, uHighlightTint; uniform vec2 uResolution; varying vec2 vUv;
    float ftfHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      // Soft shoulder and toe around mid grey instead of a straight contrast line: highlights keep detail.
      c = mix(c, c * c * (3.0 - 2.0 * c), clamp((uContrast - 1.0) * 2.5, 0.0, 1.0));
      c *= mix(uShadowTint, uHighlightTint, smoothstep(0.15, 0.85, l));
      vec2 q = vUv - 0.5; float v = 1.0 - uVignette * smoothstep(0.35, 0.95, dot(q, q) * 2.2);
      c *= v;
      // Grain: blue-ish noise from a hash, weighted toward the mids (film responds least in the highlights).
      float g = ftfHash(vUv * uResolution + fract(uTime * 7.31) * 101.0) - 0.5;
      c += g * uGrain * (1.0 - smoothstep(0.6, 1.0, l)) * (0.35 + 0.65 * smoothstep(0.0, 0.25, l));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

/**
 * three.js's OutputPass knows the built-in tone mappings only; the game's grade is the custom one (render/grade.js),
 * so the pass's tone mapping switch is replaced by a call to it. Still an OutputPass: the VFX module looks for it.
 */
function createOutputPass() {
  const pass = new OutputPass();
  const fs = OutputShader.fragmentShader;
  const a = fs.indexOf('#ifdef LINEAR_TONE_MAPPING'), b = fs.indexOf('// color space');
  if (a > 0 && b > a) { pass.material.fragmentShader = fs.slice(0, a) + 'gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );\n\n\t\t\t' + fs.slice(b); pass.material.needsUpdate = true; }
  return pass;
}

export class PostStack {
  /** @param {{renderer:THREE.WebGLRenderer, scene:THREE.Scene, camera:THREE.Camera}} o */
  constructor({ renderer, scene, camera }) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.cfg = null; this.composer = null; this.target = null;
    this.passes = {};
    this.time = 0;
    this.sunColor = new THREE.Color(1, 0.9, 0.75);
  }

  /** (Re)builds the chain for a tier config (quality.js); null tears it down for the direct path. */
  configure(cfg) {
    this.dispose();
    this.cfg = cfg;
    if (!cfg || !cfg.post) return;
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const depthTexture = new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType);
    this.target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: cfg.msaa, depthTexture });
    const composer = new EffectComposer(r, this.target);
    composer.setPixelRatio(1); // the target already has drawing-buffer size
    composer.setSize(size.x, size.y);
    const render = new RenderPass(this.scene, this.camera);
    composer.addPass(render);
    const rays = new GodRaysPass({ scale: cfg.raysScale || 0.25 });
    rays.enabled = !!cfg.godRays;
    rays.setSunColor(this.sunColor);
    rays.intensity = RAYS * (this.raysScale ?? 1);
    composer.addPass(rays);
    let ao = null;
    if (cfg.ao) {
      const s = cfg.aoScale || 1;
      ao = new GTAOPass(this.scene, this.camera, Math.max(1, Math.round(size.x * s)), Math.max(1, Math.round(size.y * s)));
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.8;
      ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 0.5, scale: 1.0, samples: cfg.aoSlices * 3 || 12, distanceFallOff: 1.0, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 12 });
      // The g-buffer pass must not see camera-facing overlay quads (labels, mist, markers) nor any
      // sprite or transparent mesh (nameplates, holograms, glass): rendered with the normal override
      // material they would leave solid black blocks in the AO buffer.
      const aoRender = ao.render.bind(ao);
      const hidden = [];
      ao.render = (...args) => {
        this.camera.layers.disable(LAYER_OVERLAY);
        hidden.length = 0;
        this.scene.traverse((o) => {
          if (!o.visible || !(o.isSprite || (o.isMesh && o.material && (Array.isArray(o.material) ? o.material.some((m) => m.transparent) : o.material.transparent)))) return;
          o.visible = false; hidden.push(o);
        });
        aoRender(...args);
        for (const o of hidden) o.visible = true;
        this.camera.layers.enable(LAYER_OVERLAY);
      };
      // The AO buffers follow the tier's scale (half res on high), the blend stays full res.
      const aoSetSize = ao.setSize.bind(ao);
      ao.setSize = (w, h) => aoSetSize(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
      composer.addPass(ao);
    }
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    bloom.enabled = !!cfg.bloom;
    // NaN/Inf from the scene, the rays or the AO must not reach the bloom (black squares on the bloom grid):
    // render/hdr-guard.js. It sits after the rays (they read the render target's depth as their read buffer) and
    // before the bloom (the VFX soft-particle pass is inserted before the bloom too and reads renderTarget1's depth).
    const guard = createHdrGuardPass();
    composer.addPass(guard);
    composer.addPass(bloom);
    const output = createOutputPass();
    composer.addPass(output);
    let smaa = null;
    if (cfg.smaa) { smaa = new SMAAPass(size.x, size.y); composer.addPass(smaa); }
    const grade = new ShaderPass(GradeShader);
    grade.enabled = !!cfg.grade;
    grade.uniforms.uResolution.value.set(size.x, size.y);
    composer.addPass(grade);
    this.composer = composer;
    this.passes = { render, guard, rays, ao, bloom, output, smaa, grade };
  }

  get active() { return !!this.composer; }

  setSize(w, h) {
    if (!this.composer) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(size.x, size.y);
    if (this.passes.grade) this.passes.grade.uniforms.uResolution.value.set(size.x, size.y);
    void w; void h;
  }

  /** The sun colour for the light shafts (sky.js derived value). */
  setSunColor(color) { this.sunColor.copy(color); if (this.passes.rays) this.passes.rays.setSunColor(color); }

  /** Weather: light shafts fade with the sun (0 under a closed sky). */
  setRays(k) { this.raysScale = Math.max(0, Math.min(1, k)); if (this.passes.rays) this.passes.rays.intensity = RAYS * this.raysScale; }

  /** Advances the grain seed; pass dt = 0 under reduced motion (static grain, no flicker). */
  update(dt) { this.time += dt; if (this.passes.grade) this.passes.grade.uniforms.uTime.value = this.time; }

  /** @param {THREE.Vector3} sunDirection */
  render(sunDirection) {
    if (!this.composer) { this.renderer.render(this.scene, this.camera); return; }
    if (this.passes.rays && this.passes.rays.enabled) this.passes.rays.setSun(sunDirection, this.camera);
    this.composer.render();
  }

  dispose() {
    if (!this.composer) return;
    for (const p of this.composer.passes) if (p.dispose) p.dispose();
    this.composer.dispose?.();
    this.target?.dispose();
    this.composer = null; this.target = null; this.passes = {};
  }
}
