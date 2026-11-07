// Post-processing stack (quality tiers ultra/high; the low tier renders directly).
//   RenderPass (MSAA, half-float, depth texture)
//   -> GodRaysPass: screen-space light shafts from the sun through the sky mask (quarter res)
//   -> GTAOPass (ultra only): contact shadows
//   -> UnrealBloomPass: lanterns, amber floor lights, the sun disc
//   -> OutputPass: AgX tone mapping + sRGB
//   -> GradePass: gentle film curve, cool shadows / warm highlights, vignette
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { LAYER_OVERLAY } from './layers.js';

const COPY_VS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Light shafts: sky pixels near the sun form a mask, two radial blurs smear it toward the sun, added back. */
export class GodRaysPass extends Pass {
  constructor({ scale = 0.25 } = {}) {
    super();
    this.scale = scale;
    this.sunUv = new THREE.Vector2(0.5, 0.5);
    this.intensity = 0.55;
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
          float glow = exp(-r * r * 9.0) + 0.18 * exp(-r * 2.2);
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

/** Display-referred grade after tone mapping: soft S-curve, split toning, vignette. Deliberately mild. */
export const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.3 }, uSaturation: { value: 1.1 }, uContrast: { value: 1.14 }, uShadowTint: { value: new THREE.Color(0.93, 0.97, 1.04) }, uHighlightTint: { value: new THREE.Color(1.04, 1.0, 0.95) } },
  vertexShader: COPY_VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVignette, uSaturation, uContrast; uniform vec3 uShadowTint, uHighlightTint; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      c = (c - 0.5) * uContrast + 0.5;
      c *= mix(uShadowTint, uHighlightTint, smoothstep(0.15, 0.85, l));
      vec2 q = vUv - 0.5; float v = 1.0 - uVignette * smoothstep(0.35, 0.95, dot(q, q) * 2.2);
      gl_FragColor = vec4(clamp(c * v, 0.0, 1.0), 1.0);
    }`,
};

export class PostStack {
  /** @param {{renderer:THREE.WebGLRenderer, scene:THREE.Scene, camera:THREE.Camera}} o */
  constructor({ renderer, scene, camera }) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.cfg = null; this.composer = null; this.target = null;
    this.passes = {};
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
    const rays = new GodRaysPass();
    rays.enabled = !!cfg.godRays;
    composer.addPass(rays);
    let ao = null;
    if (cfg.ao) {
      ao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.blendIntensity = 0.85;
      ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 0.6, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 12 });
      // The g-buffer pass must not see camera-facing overlay quads (labels, mist, markers): rendered
      // with the normal override material they would leave solid black blocks in the AO buffer.
      const aoRender = ao.render.bind(ao);
      ao.render = (...args) => { this.camera.layers.disable(LAYER_OVERLAY); aoRender(...args); this.camera.layers.enable(LAYER_OVERLAY); };
      composer.addPass(ao);
    }
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.55, 1.0);
    bloom.enabled = !!cfg.bloom;
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const grade = new ShaderPass(GradeShader);
    grade.enabled = !!cfg.grade;
    composer.addPass(grade);
    this.composer = composer;
    this.passes = { render, rays, ao, bloom, grade };
  }

  get active() { return !!this.composer; }

  setSize(w, h) {
    if (!this.composer) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(size.x, size.y);
    void w; void h;
  }

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
