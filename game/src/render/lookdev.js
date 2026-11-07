// Look-dev controller: lighting, atmosphere, post-processing, foliage and quality tiers for the
// island scene (owner 07.11: the game's quality must match the latest references; min spec RTX
// 2060 Super). Owns everything that is "how it looks" and nothing that is game state:
//   sky dome + PMREM environment, sun with a focus-fitted shadow, hemisphere fill, height/distance
//   fog, sea of clouds, instanced grass and flowers, lantern point lights, post stack, occlusion
//   fade, material quality. setQuality(tier) is the hook for the settings UI; setReducedMotion()
//   freezes the clouds, wind and Shell hover (spec 1/3: reduced motion never blocks input).
import * as THREE from 'three';
import { QUALITY, isTier } from './quality.js';
import { SkyDome, SUN_DIRECTION, SUN_COLOR, HAZE_COLOR } from './sky.js';
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
  constructor({ renderer, scene, camera, cloudLevel, grassPatches, lanterns = [], tier = 'ultra', reducedMotion = false }) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.tier = isTier(tier) ? tier : 'ultra';
    this.cfg = QUALITY[this.tier];
    this.reducedMotion = reducedMotion;
    this.sunDir = SUN_DIRECTION.clone();
    this.listeners = new Set();

    camera.layers.enable(LAYER_OVERLAY);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.5;

    // Fog: dense toward the cloud sea, a warm lobe toward the sun (installed before materials compile).
    installHeightFog({ baseY: cloudLevel, falloff: 0.085, density: 0.0075, sunDir: this.sunDir, sunTint: [0.22, 0.14, 0.05], sunPower: 5 });
    scene.fog = new THREE.Fog(HAZE_COLOR, 70, 340);

    this.sky = new SkyDome();
    scene.add(this.sky.mesh);
    scene.environment = this.sky.bakeEnvironment(renderer);
    scene.environmentIntensity = 0.9;

    this.hemi = new THREE.HemisphereLight(0xc9d6de, 0x4d5a52, 0.45);
    this.sun = new THREE.DirectionalLight(SUN_COLOR, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.00025; this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 320;
    scene.add(this.hemi, this.sun, this.sun.target);

    this.clouds = new CloudSea({ level: cloudLevel });
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
