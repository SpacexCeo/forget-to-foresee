// Look-dev controller: lighting, atmosphere, post-processing, foliage and quality tiers for the
// island scene (owner 07.11: the game's quality must match the latest references; min spec RTX
// 2060 Super). Owns everything that is "how it looks" and nothing that is game state:
//   sky dome + PMREM environment, sun with a focus-fitted shadow, hemisphere fill, height/distance
//   fog, sea of clouds, instanced grass and flowers, lantern point lights, post stack, occlusion
//   fade, material quality. setQuality(tier) is the hook for the settings UI; setReducedMotion()
//   freezes the clouds, wind and Shell hover (spec 1/3: reduced motion never blocks input).
import * as THREE from 'three';
import { QUALITY, isTier } from './quality.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { SkyDome, TIME_PRESETS, DEFAULT_PRESET } from './sky.js';
import { TierGovernor } from './quality.js';
import { CloudSea } from './clouds.js';
import { PostStack } from './post.js';
import { Foliage } from './foliage.js';
import { OcclusionFader } from './fade.js';
import { applyMaterialQuality } from './materials.js';
import { installHeightFog } from './fog.js';
import { LAYER_OVERLAY } from './layers.js';

export class LookDev {
  /**
   * @param {{renderer:THREE.WebGLRenderer, scene:THREE.Scene, camera:THREE.PerspectiveCamera, cloudLevel:number,
   *          grassPatches:{center:number[], radius:number, tint?:number}[], lanterns:number[][],
   *          tier?:string, reducedMotion?:boolean}} o
   */
  constructor({ renderer, scene, camera, cloudLevel, grassPatches, lanterns = [], tier = 'ultra', reducedMotion = false, autoTier = false, preset = DEFAULT_PRESET }) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.tier = isTier(tier) ? tier : 'ultra';
    this.cfg = QUALITY[this.tier];
    this.reducedMotion = reducedMotion;
    this.listeners = new Set();
    this.governor = autoTier ? new TierGovernor() : null;
    this.preset = TIME_PRESETS[preset] ? preset : DEFAULT_PRESET;
    const P = TIME_PRESETS[this.preset];

    camera.layers.enable(LAYER_OVERLAY);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = Math.pow(2, P.exposure);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.5;

    // Physically based sky: the LUT pass derives the sun colour and the fog colours (sky.js).
    this.sky = new SkyDome();
    const atm = this.sky.setAtmosphere(renderer, P);
    this.atm = atm;
    this.sunDir = atm.sun.clone();
    scene.add(this.sky.mesh);

    // Fog: dense toward the cloud sea, warm gold lobe toward the sun, cool blue-grey base (installed before materials compile).
    installHeightFog({ baseY: cloudLevel, falloff: P.fog.falloff, density: P.fog.density * 0.4, sunDir: this.sunDir, sunTint: atm.fogSunTint.toArray(), sunPower: P.fog.sunPower });
    scene.fog = new THREE.Fog(atm.fogColor.clone(), 80, 380);

    // IBL: sky-dome PMREM right away; the Blender-baked HDR (art/env/bake_env.py) replaces it on tiers that allow it.
    this.envFallback = this.sky.bakeEnvironment(renderer);
    scene.environment = this.envFallback.texture;
    scene.environmentIntensity = P.envIntensity;
    this.envHdr = null;
    this.loadEnvHdr(P);

    // Low cool fill so shadow sides stay blue-grey (the IBL carries most of the ambient).
    this.hemi = new THREE.HemisphereLight(atm.zenith.clone(), 0x3a4048, 0.18);
    this.sun = new THREE.DirectionalLight(atm.sunColor.clone(), atm.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.00025; this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 320;
    scene.add(this.hemi, this.sun, this.sun.target);

    this.clouds = new CloudSea({ level: cloudLevel });
    for (const l of this.clouds.layers) l.material.uniforms.uLit.value.multiply(atm.sunColor); // sun-tinted cloud tops
    scene.add(this.clouds.group);

    this.foliage = new Foliage({ patches: grassPatches, blades: this.cfg.grassBlades, flowers: this.cfg.flowers, fadeDistance: this.cfg.grassFadeDistance });
    scene.add(this.foliage.group);

    this.lanternLights = lanterns.map(([x, y, z]) => {
      const l = new THREE.PointLight(0xffa64d, 14, 11, 2);
      l.position.set(x, y, z); l.castShadow = false; l.name = 'lantern_light';
      scene.add(l);
      return l;
    });

    this.post = new PostStack({ renderer, scene, camera });
    this.fader = new OcclusionFader({ camera });
    this.applyTier();
  }

  /** Loads the baked golden-hour HDR and prefilters it into a PMREM at runtime (tiers with envHdr). */
  loadEnvHdr(P) {
    if (!P.envUrl || !this.cfg.envHdr || this.envHdr || this.envLoading) return;
    this.envLoading = true;
    const base = import.meta.env?.BASE_URL || '/';
    new RGBELoader().load(base + P.envUrl, (tex) => {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envHdr = pmrem.fromEquirectangular(tex);
      pmrem.dispose(); tex.dispose();
      if (this.cfg.envHdr) this.scene.environment = this.envHdr.texture;
    }, undefined, () => { /* keep the dome PMREM */ });
  }

  /** Settings hook: 'ultra' | 'high' | 'low'. Rebuilds the post stack, shadows, foliage density. */
  setQuality(tier) {
    if (!isTier(tier) || tier === this.tier) return this.tier;
    this.tier = tier; this.cfg = QUALITY[tier];
    this.applyTier();
    for (const fn of this.listeners) fn(tier);
    return tier;
  }

  onQualityChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  setReducedMotion(on) { this.reducedMotion = !!on; this.foliage.setWind(on ? 0 : 1); }

  applyTier() {
    const cfg = this.cfg, r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pixelRatioCap));
    r.setSize(window.innerWidth, window.innerHeight);
    const map = this.sun.shadow.map;
    if (map && (map.width !== cfg.shadowMap)) { map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.set(cfg.shadowMap, cfg.shadowMap);
    this.sun.shadow.radius = cfg.shadowRadius;
    this.clouds.setLayers(cfg.cloudLayers);
    this.foliage.rebuild({ blades: cfg.grassBlades, flowers: cfg.flowers, fadeDistance: cfg.grassFadeDistance });
    for (const l of this.lanternLights) l.visible = cfg.pointLights;
    applyMaterialQuality(cfg);
    this.post.configure(cfg);
    if (this.envFallback) {
      if (cfg.envHdr && this.envHdr) this.scene.environment = this.envHdr.texture;
      else if (!cfg.envHdr) this.scene.environment = this.envFallback.texture;
      else this.loadEnvHdr(TIME_PRESETS[this.preset]);
    }
  }

  setSize(w, h) {
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
  }

  /** Tracks an object for the occlusion fade (see fade.js). */
  trackOccluder(spec) { this.fader.track(spec); }

  /**
   * Fits the sun's shadow frustum around the focus (the player) scaled by the camera distance and
   * snaps it to shadow texels so the shadows do not swim as the camera moves.
   */
  fitShadow(focus, camDist) {
    const R = THREE.MathUtils.clamp(camDist * 1.15, 16, 64);
    const sc = this.sun.shadow.camera;
    if (sc.right !== R) { sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.updateProjectionMatrix(); }
    const texel = (2 * R) / this.cfg.shadowMap;
    // Snap the focus in light space.
    const lightView = new THREE.Matrix4().lookAt(this.sunDir, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)).invert();
    const f = focus.clone().applyMatrix4(lightView);
    f.x = Math.round(f.x / texel) * texel; f.y = Math.round(f.y / texel) * texel;
    f.applyMatrix4(lightView.clone().invert());
    this.sun.target.position.copy(f);
    this.sun.position.copy(f).addScaledVector(this.sunDir, 150);
    this.sun.target.updateMatrixWorld();
  }

  /** @param {number} dt seconds; @param {THREE.Vector3} focus the player's chest; @param {number} camDist camera distance */
  update(dt, focus, camDist) {
    if (this.governor) { const next = this.governor.sample(dt * 1000, this.tier); if (next) this.setQuality(next); }
    const motion = this.reducedMotion ? 0 : dt;
    this.sky.follow(this.camera);
    this.sky.setTime(this.sky.material.uniforms.uTime.value + motion);
    this.clouds.follow(this.camera);
    this.clouds.update(motion);
    this.foliage.update(motion);
    this.fitShadow(focus, camDist);
    this.fader.update(dt, focus);
  }

  render() { this.post.render(this.sunDir); }

  /** Numbers for the HUD / measurement: tier, pixel ratio, whether the post stack is active. */
  stats() { return { tier: this.tier, pixelRatio: this.renderer.getPixelRatio(), post: this.post.active, reducedMotion: this.reducedMotion }; }
}
