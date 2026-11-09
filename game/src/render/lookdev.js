// Look-dev controller: lighting, atmosphere, post-processing, foliage and quality tiers for the
// island scene (owner 07.11: the game's quality must match the latest references; min spec RTX
// 2060 Super; style addendum: golden-hour haze against cool shadows, one luminous landmark).
// Owns everything that is "how it looks" and nothing that is game state:
//   sky dome + PMREM environment, sun with a focus-fitted shadow, hemisphere fill, analytic
//   height fog with a sun lobe, raymarched sea of clouds, instanced grass and flowers with wind and
//   backlight, lantern point lights, post stack, occlusion fade, material quality.
// Public look API (kept stable for the play layer, the VFX module and the trailer capture):
//   tier, profile, reducedMotion, sky, post.composer, hemi, sun, sunDir, clouds, foliage
//   setQuality(tier), onQualityChange(fn), setReducedMotion(on), setPixelScale(s), setSize(w, h)
//   setPreset(name)           time of day (sky.js TIME_PRESETS): sky, sun, fog, clouds, IBL, exposure
//   sky.tint(hex, amount)     mood tint of haze, fill and cloud ambient (the tension effect)
//   update(dt, focus, camDist), render(), stats(), trackOccluder(spec)
// setReducedMotion() freezes the clouds, wind, Shell hover and grain (spec 1/3: reduced motion never blocks input).
import * as THREE from 'three';
import { qualityFor, isTier, isProfile, detectProfile, GOVERNORS, TierGovernor } from './quality.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { SkyDome, TIME_PRESETS, DEFAULT_PRESET } from './sky.js';
import { CloudSea } from './clouds.js';
import { PostStack } from './post.js';
import { Foliage } from './foliage.js';
import { OcclusionFader } from './fade.js';
import { applyMaterialQuality, setTextureAnisotropy, setNacreTime } from './materials.js';
import { AirMotes } from './motes.js';
import { installHeightFog, setFog, setFogTint, tickFog } from './fog.js';
import { LAYER_OVERLAY } from './layers.js';

/**
 * Render profile of this browser (docs/mobile.md): phones get the phone knob set for every tier name.
 * `?profile=phone|desktop` overrides it for QA on a desktop (like `?tier=`).
 */
export function browserProfile() {
  try {
    const forced = new URLSearchParams(location.search).get('profile');
    if (isProfile(forced)) return forced;
    const ua = navigator.userAgent || '';
    const coarse = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
    const screenMin = Math.min(screen?.width || Infinity, screen?.height || Infinity);
    return detectProfile({ mobile: /Mobi|Android/i.test(ua), coarse, screenMin: Number.isFinite(screenMin) ? screenMin : 0 });
  } catch { return 'desktop'; }
}

export class LookDev {
  /**
   * @param {{renderer:THREE.WebGLRenderer, scene:THREE.Scene, camera:THREE.PerspectiveCamera, cloudLevel:number,
   *          grassPatches:{center:number[], radius:number, tint?:number}[], lanterns:number[][],
   *          tier?:string, profile?:string, reducedMotion?:boolean, autoTier?:boolean, preset?:string}} o
   */
  constructor({ renderer, scene, camera, cloudLevel, grassPatches, lanterns = [], tier = 'ultra', profile = browserProfile(), reducedMotion = false, autoTier = false, preset = DEFAULT_PRESET }) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.profile = isProfile(profile) ? profile : 'desktop';
    this.tier = isTier(tier) ? tier : 'ultra';
    this.cfg = qualityFor(this.tier, this.profile);
    this.pixelScale = 1; // the governor's render-resolution step (phones), on top of the tier's pixel ratio cap
    this.reducedMotion = reducedMotion;
    this.listeners = new Set();
    this.governor = autoTier ? new TierGovernor(GOVERNORS[this.profile]) : null;
    this.preset = TIME_PRESETS[preset] ? preset : DEFAULT_PRESET;
    this.cloudLevel = cloudLevel;
    this.tintState = { hex: 0xffffff, amount: 0 };

    camera.layers.enable(LAYER_OVERLAY);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.5;
    setTextureAnisotropy(renderer.capabilities.getMaxAnisotropy());

    // Physically based sky: the LUT pass derives the sun colour and the fog colours (sky.js).
    this.sky = new SkyDome();
    this.sky.onTint = (hex, k) => this.applyTint(hex, k);
    scene.add(this.sky.mesh);
    this.sunDir = new THREE.Vector3(0, 1, 0);

    // Fog chunks are patched before the first material compiles; the values follow the preset.
    installHeightFog({ baseY: cloudLevel });
    scene.fog = new THREE.Fog(0x9aa3ad, 30, 420);

    // Low cool fill so shadow sides stay blue-grey (the IBL carries most of the ambient).
    this.hemi = new THREE.HemisphereLight(0x8fa0b4, 0x3a4048, 0.12);
    this.sun = new THREE.DirectionalLight(0xffffff, 3.6);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.00025; this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 320;
    scene.add(this.hemi, this.sun, this.sun.target);

    this.clouds = new CloudSea({ level: cloudLevel });
    scene.add(this.clouds.group);

    this.foliage = new Foliage({ patches: grassPatches, blades: this.cfg.grassBlades, flowers: this.cfg.flowers, fadeDistance: this.cfg.grassFadeDistance });
    scene.add(this.foliage.group);

    this.lanternLights = lanterns.map(([x, y, z], i) => {
      const l = new THREE.PointLight(0xffa64d, 14, 11, 2);
      l.position.set(x, y, z); l.castShadow = false; l.name = 'lantern_light';
      l.userData.phase = i * 1.618 * Math.PI; // flicker phase: no two lanterns in step
      scene.add(l);
      return l;
    });
    this.motes = new AirMotes({ count: 500 });
    scene.add(this.motes.points);
    this.time = 0;

    this.post = new PostStack({ renderer, scene, camera });
    this.fader = new OcclusionFader({ camera });
    this.envFallback = null; this.envHdr = null; this.envHdrPreset = null;
    this.applyAtmosphere(TIME_PRESETS[this.preset]);
    this.applyTier();
  }

  /**
   * Sky LUT, sun, fill, fog, clouds, light shafts, exposure and IBL from a time-of-day preset.
   * Everything that depends on the sun is derived from the same LUT read-back so it all agrees.
   */
  applyAtmosphere(P) {
    const atm = this.sky.setAtmosphere(this.renderer, P);
    this.atm = atm;
    this.sunDir.copy(atm.sun);
    this.renderer.toneMappingExposure = Math.pow(2, P.exposure);
    this.sun.color.copy(atm.sunColor); this.sun.intensity = atm.sunIntensity;
    this.hemi.color.copy(atm.zenith); this.hemi.groundColor.copy(atm.fogColor).multiplyScalar(0.45);
    this.baseFog = atm.fogColor.clone(); this.baseHemi = this.hemi.color.clone();
    this.scene.fog.color.copy(atm.fogColor); this.scene.fog.near = P.fog.near; this.scene.fog.far = P.fog.far;
    setFog({ baseY: this.cloudLevel, falloff: P.fog.falloff, density: P.fog.density, aerial: P.fog.aerial, sunDir: this.sunDir, sunTint: atm.fogSunTint, sunPower: P.fog.sunPower, sunStrength: 1 });
    this.clouds.setLighting({ sun: atm.sun, sunRadiance: atm.sunRadiance, zenith: atm.zenith, fogColor: atm.fogColor, cover: P.cloudCover });
    this.foliage.setSun(this.sunDir, atm.sunColor);
    this.motes.setSun(this.sunDir, atm.sunColor);
    this.post.setSunColor(atm.sunColor);
    for (const l of this.lanternLights) l.color.setHex(0xffa64d);
    // IBL: sky-dome PMREM right away; the Blender-baked HDR (art/env/bake_env.py) replaces it on tiers that allow it.
    if (this.envFallback) this.envFallback.dispose();
    this.envFallback = this.sky.bakeEnvironment(this.renderer);
    this.scene.environment = this.envFallback.texture;
    this.scene.environmentIntensity = P.envIntensity;
    if (this.envHdr && this.envHdrPreset !== this.preset) { this.envHdr.dispose(); this.envHdr = null; }
    this.loadEnvHdr(P);
    if (this.tintState.amount > 0) this.applyTint(this.tintState.hex, this.tintState.amount);
  }

  /** Time of day: 'golden' (default, matches the baked HDR) | 'morning' | 'noon' | 'dusk'. Returns the active preset. */
  setPreset(name) {
    if (!TIME_PRESETS[name] || name === this.preset) return this.preset;
    this.preset = name;
    this.applyAtmosphere(TIME_PRESETS[name]);
    return name;
  }

  /** Mood tint from sky.tint(): fog uniforms, the scene fog colour and the fill light follow the sky dome. */
  applyTint(hex, k) {
    this.tintState = { hex, amount: k };
    setFogTint(hex, k);
    const c = new THREE.Color(hex);
    if (this.baseFog) this.scene.fog.color.copy(this.baseFog).lerp(c, k * 0.3);
    if (this.baseHemi) this.hemi.color.copy(this.baseHemi).lerp(c, k * 0.45);
  }

  /** Loads the baked golden-hour HDR and prefilters it into a PMREM at runtime (tiers with envHdr). */
  loadEnvHdr(P) {
    if (!P.envUrl || !this.cfg.envHdr || this.envHdr || this.envLoading) return;
    this.envLoading = true;
    const forPreset = this.preset;
    const base = import.meta.env?.BASE_URL || '/';
    new RGBELoader().load(base + P.envUrl, (tex) => {
      this.envLoading = false;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const rt = pmrem.fromEquirectangular(tex);
      pmrem.dispose(); tex.dispose();
      if (forPreset !== this.preset) { rt.dispose(); return; }
      this.envHdr = rt; this.envHdrPreset = forPreset;
      if (this.cfg.envHdr) this.scene.environment = this.envHdr.texture;
    }, undefined, () => { this.envLoading = false; /* keep the dome PMREM */ });
  }

  /** Settings hook: 'ultra' | 'high' | 'low'. Rebuilds the post stack, shadows, foliage density. */
  setQuality(tier) {
    if (!isTier(tier) || tier === this.tier) return this.tier;
    this.tier = tier; this.cfg = qualityFor(tier, this.profile);
    this.applyTier();
    for (const fn of this.listeners) fn(tier);
    return tier;
  }

  onQualityChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  setReducedMotion(on) { this.reducedMotion = !!on; this.foliage.setWind(on ? 0 : 1); }

  /** Governor step on the bottom tier (phones): render at a fraction of the tier's pixel ratio. */
  setPixelScale(scale) {
    scale = THREE.MathUtils.clamp(Number(scale) || 1, 0.5, 1);
    if (scale === this.pixelScale) return;
    this.pixelScale = scale;
    this.applyPixelRatio();
  }

  applyPixelRatio() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.cfg.pixelRatioCap) * this.pixelScale);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.post.setSize(window.innerWidth, window.innerHeight);
  }

  applyTier() {
    const cfg = this.cfg, r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pixelRatioCap) * this.pixelScale);
    r.setSize(window.innerWidth, window.innerHeight);
    const map = this.sun.shadow.map;
    if (map && (map.width !== cfg.shadowMap)) { map.dispose(); this.sun.shadow.map = null; }
    this.sun.castShadow = cfg.shadowMap > 0; // a 0 shadow map turns the sun shadow off
    this.sun.shadow.mapSize.set(Math.max(1, cfg.shadowMap), Math.max(1, cfg.shadowMap));
    this.sun.shadow.radius = cfg.shadowRadius;
    this.clouds.setLayers(cfg.cloudLayers);
    this.clouds.setSteps(cfg.cloudSteps);
    this.foliage.rebuild({ blades: cfg.grassBlades, flowers: cfg.flowers, fadeDistance: cfg.grassFadeDistance });
    for (const l of this.lanternLights) l.visible = cfg.pointLights;
    this.motes.setCount(cfg.motes);
    this.motes.setPixelRatio(r.getPixelRatio());
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
    const texel = (2 * R) / Math.max(1, this.cfg.shadowMap);
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
    if (this.governor) {
      const change = this.governor.step(dt * 1000, this.tier);
      if (change?.tier) this.setQuality(change.tier);
      else if (change?.pixelScale) this.setPixelScale(change.pixelScale);
    }
    const motion = this.reducedMotion ? 0 : dt;
    this.sky.follow(this.camera);
    this.sky.setTime(this.sky.material.uniforms.uTime.value + motion);
    this.clouds.follow(this.camera);
    this.clouds.update(motion);
    this.foliage.update(motion, this.camera);
    this.post.update(motion);
    this.motes.update(motion);
    tickFog(motion);
    this.time += motion;
    this.animateLight(this.time);
    this.fitShadow(focus, camDist);
    this.fader.update(dt, focus);
  }

  /**
   * Slow life in the light (owner 08.11: everything is animated): lantern flames flicker (each on its
   * own phase, a few percent, never a strobe), the nacre shimmers. t stops under reduced motion.
   */
  animateLight(t) {
    for (const l of this.lanternLights) {
      const p = l.userData.phase || 0;
      l.intensity = 14 * (this.lanternScale ?? 1) * (1 + 0.1 * (Math.sin(t * 7.3 + p) * 0.5 + Math.sin(t * 13.1 + p * 1.7) * 0.3 + Math.sin(t * 2.1 + p) * 0.2));
    }
    setNacreTime(t);
  }

  render() { this.post.render(this.sunDir); }

  /** Numbers for the HUD / measurement: tier, profile, pixel ratio (after the governor's scale), whether the post stack is active. */
  stats() { return { tier: this.tier, profile: this.profile, preset: this.preset, pixelRatio: this.renderer.getPixelRatio(), pixelScale: this.pixelScale, post: this.post.active, reducedMotion: this.reducedMotion }; }
}
