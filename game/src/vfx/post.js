// VfxPass: an EffectComposer pass that renders soft particles off-screen (sampling the scene
// depth) and composites them with the screen-space effects: vision distortion, chromatic fringe,
// shockwave refraction, vision tint/desaturation and the tension grade. Insert it before bloom so
// HDR particles bloom (index.js attachToComposer does this).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { FULLSCREEN_VS, COMPOSITE_FS } from './shaders.js';

export class VfxPass extends Pass {
  constructor(vfxState) {
    super();
    this.state = vfxState;          // {particles, offscene, camera, post: uniforms values}
    this.needsSwap = true;
    this.scale = 1;
    this.depthTexture = null;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.uniforms = {
      tScene: { value: null }, tParticles: { value: this.rt.texture }, uHasParticles: { value: 0 },
      uTime: { value: 0 }, uAspect: { value: 1 }, uDistort: { value: 0 }, uChroma: { value: 0 },
      uShock: { value: 0 }, uShockT: { value: 0 }, uShockCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uTint: { value: new THREE.Color(1, 1, 1) }, uTintAmount: { value: 0 }, uDesat: { value: 0 },
      uTension: { value: 0 }, uTensionTint: { value: new THREE.Color(0.62, 0.36, 0.24) },
    };
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: FULLSCREEN_VS, fragmentShader: COMPOSITE_FS, depthTest: false, depthWrite: false,
    }));
    this._clear = new THREE.Color();
  }

  setSize(w, h) {
    this.width = w; this.height = h;
    this.rt.setSize(Math.max(1, Math.round(w * this.scale)), Math.max(1, Math.round(h * this.scale)));
    this.uniforms.uAspect.value = w / Math.max(1, h);
  }

  render(renderer, writeBuffer, readBuffer) {
    const s = this.state;
    const depth = this.depthTexture || readBuffer.depthTexture;
    const hasParticles = !!depth && s.particles.anyVisible;
    if (hasParticles) {
      s.particles.setDepth(depth, readBuffer.width, readBuffer.height, s.camera);
      const oldClear = renderer.getClearColor(this._clear), oldAlpha = renderer.getClearAlpha();
      renderer.setRenderTarget(this.rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      renderer.render(s.offscene, s.camera);
      renderer.setClearColor(oldClear, oldAlpha);
    }
    this.uniforms.uHasParticles.value = hasParticles ? 1 : 0;
    this.uniforms.tScene.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  /**
   * The composer that hosts this pass disposes every pass when the look-dev stack rebuilds it on a
   * tier change (render/post.js); the pass belongs to the VFX system and is re-attached to the new
   * composer, so the composer's dispose() is a no-op here. createVfx().dispose() calls release().
   */
  dispose() {}
  release() { this.rt.dispose(); this.quad.material.dispose(); this.quad.dispose(); }
}
