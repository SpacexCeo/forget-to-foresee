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
//   setLocation(name)         'archipelago' | 'town': each has its own sun and air for the same hour (sky.js LOCATION_LOOKS)
//   setWeather(name)          'clear' | 'overcast' | 'rain' (weather.js); eases in, at once under reduced motion
//   light                     { lamps, windows }: what street lamps and lit windows should give now (scenes read it)
//   setHeroLight(pos, k)      the one strong local light (the Tournament altar's amber); null switches it off
//   blobs.track(object)       a soft disc under a character's feet (blobs.js)
//   sky.tint(hex, amount)     mood tint of haze, fill and cloud ambient (the tension effect)
//   update(dt, focus, camDist), render(), stats(), trackOccluder(spec)
// setReducedMotion() freezes the clouds, wind, Shell hover and grain (spec 1/3: reduced motion never blocks input).
import * as THREE from 'three';
import { qualityFor, isTier, isProfile, detectProfile, GOVERNORS, TierGovernor, governorFloor } from './quality.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { SkyDome, TIME_PRESETS, LOCATION_LOOKS, lookFor } from './sky.js';
/** Seconds between re-bakes of the sky's ambient light while the day cycle moves the sun. */
const LIVE_ENV_SECONDS = 2.5;
import { CloudSea } from './clouds.js';
import { PostStack } from './post.js';
import { Foliage } from './foliage.js';
import { OcclusionFader } from './fade.js';
import { applyMaterialQuality, setTextureAnisotropy, setNacreTime } from './materials.js';
import { AirMotes } from './motes.js';
import { installHeightFog, setFog, setFogTint, tickFog } from './fog.js';
import { LAYER_OVERLAY } from './layers.js';
import { SunShadows } from './shadows.js';
import { BlobShadows } from './blobs.js';
import { installGrade } from './grade.js';
import { WeatherSystem, Rain, installWetness, weatherCover, WEATHER, DEFAULT_WEATHER } from './weather.js';
import { setEmissiveLevels } from './materials.js';

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

/** `?weather=clear|overcast|rain`: the weather at start (QA and previews; the jury path has none, so it is clear). */
export function browserWeather() {
  try { const w = new URLSearchParams(location.search).get('weather'); return WEATHER[w] ? w : DEFAULT_WEATHER; } catch { return DEFAULT_WEATHER; }
}

const _c = new THREE.Color(), _c2 = new THREE.Color(), _white = new THREE.Color(1, 1, 1);
/** Mean colour of what the sun hits in a street (plaster, cobbles, stone): the tint of the bounce light. */
const _bounceAlbedo = new THREE.Color(0.62, 0.52, 0.42);

export class LookDev {
  /**
   * @param {{renderer:THREE.WebGLRenderer, scene:THREE.Scene, camera:THREE.PerspectiveCamera, cloudLevel:number,
   *          grassPatches:{center:number[], radius:number, tint?:number}[], lanterns:number[][],
   *          tier?:string, profile?:string, reducedMotion?:boolean, autoTier?:boolean, detectedTier?:string|null, preset?:string}} o
   */
  constructor({ renderer, scene, camera, cloudLevel, grassPatches, lanterns = [], tier = 'ultra', profile = browserProfile(), reducedMotion = false, autoTier = false, detectedTier = null, preset = undefined, weather = browserWeather(), location = 'archipelago' }) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.profile = isProfile(profile) ? profile : 'desktop';
    this.tier = isTier(tier) ? tier : 'ultra';
    this.cfg = qualityFor(this.tier, this.profile);
    this.pixelScale = 1; // the governor's render-resolution step (phones), on top of the tier's pixel ratio cap
    this.reducedMotion = reducedMotion;
    this.listeners = new Set();
    this.governor = autoTier ? new TierGovernor({ ...GOVERNORS[this.profile], floor: governorFloor(detectedTier, this.profile) }) : null;
    // An hour asked for explicitly (?tod=, setPreset) holds in both locations; without one each location shows its own default.
    this.timeOverride = TIME_PRESETS[preset] ? preset : null;
    this.location = LOCATION_LOOKS[location] ? location : 'archipelago';
    this.look = lookFor(this.location, this.timeOverride);
    this.preset = this.look.name;
    this.weather = new WeatherSystem({ name: weather });
    /** What street lamps and lit windows give at this hour and in this weather (1 = as authored). Read by the scenes. */
    this.light = { lamps: 1, windows: 1 };
    this.cloudLevel = cloudLevel;
    this.fogBaseY = cloudLevel; // setAtmosphereFloor moves it while Iris is in the town
    this.tintState = { hex: 0xffffff, amount: 0 };

    camera.layers.enable(LAYER_OVERLAY);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    installGrade(renderer); // AgX plus the game's grade, the same on every tier (render/grade.js)
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
    installWetness();
    scene.fog = new THREE.Fog(0x9aa3ad, 30, 420);

    // Low cool fill so shadow sides stay blue-grey (the IBL carries most of the ambient).
    this.hemi = new THREE.HemisphereLight(0x8fa0b4, 0x3a4048, 0.12);
    // The sun and its two shadow cascades (render/shadows.js). The whole light set exists from the first frame:
    // a light joining later would recompile every lit material (docs/smoothness.md).
    this.shadows = new SunShadows({ scene });
    this.sun = this.shadows.sun;
    scene.add(this.hemi);
    this.heroLight = new THREE.PointLight(0xff8a2a, 0, 26, 1.6);
    this.heroLight.name = 'hero_light'; this.heroLight.castShadow = false;
    this.heroBase = 0;
    scene.add(this.heroLight);
    this.blobs = new BlobShadows();
    scene.add(this.blobs.mesh);
    this.rain = new Rain();
    scene.add(this.rain.mesh);

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
    this.applyAtmosphere(this.look);
    this.applyTier();
  }

  /**
   * Sky LUT, sun, fill, fog, clouds, light shafts, exposure and IBL from a time-of-day preset.
   * Everything that depends on the sun is derived from the same LUT read-back so it all agrees.
   */
  /**
   * The day cycle's keyframes (render/daycycle.js KEYS): reads each hour's sky statistics once (one LUT read-back per
   * hour, cached), so the per-frame path never reads the GPU. Called when the town is set up, under the loading
   * screen. Returns {hour: stats}.
   */
  prepareCycle(location, hours) {
    const out = {};
    for (const h of hours) { this.sky.setAtmosphere(this.renderer, lookFor(location, h)); out[h] = this.sky.lastStats; }
    this.cycleStats = out;
    this.applyAtmosphere(this.look); // back to the hour on show
    return out;
  }

  /**
   * One frame of the day cycle: the blended look with sky statistics blended between the same two keyframes. The sun,
   * its colour and strength, fog, exposure, lamps and windows follow every frame; the sky's ambient light (a PMREM
   * re-bake) every LIVE_ENV_SECONDS.
   */
  applyLookLive(look, stats, now = 0) {
    this.look = look; this.preset = look.name;
    const rebake = !this.liveEnvAt || now - this.liveEnvAt > LIVE_ENV_SECONDS;
    if (rebake) this.liveEnvAt = now;
    this.applyAtmosphere(look, { stats, rebake });
  }

  applyAtmosphere(P, live = null) {
    const atm = live ? this.sky.setAtmosphereLive(this.renderer, P, live.stats) : this.sky.setAtmosphere(this.renderer, P);
    this.atm = atm;
    this.sunDir.copy(atm.sun);
    this.shadows.setDirection(this.sunDir);
    this.sun.color.copy(atm.sunColor);
    // The fill from above is the sky's colour pulled halfway to neutral: shade reads cool, never cyan.
    this.hemi.color.copy(atm.zenith).lerp(_c.setScalar((atm.zenith.r + atm.zenith.g + atm.zenith.b) / 3), 0.5);
    // Shade is filled from below by what the sun throws back off walls and paving: warm, stronger between houses.
    this.hemi.groundColor.copy(atm.sunColor).multiply(_bounceAlbedo).multiplyScalar(P.bounce * 3.0).lerp(_c.copy(atm.fogColor).multiplyScalar(0.45), 0.3);
    // Moonlight (`moonFill`, the town's night): the fill turns blue-silver and the bounce from the paving goes cold, so
    // the streets read moonlit and only the lamps' pools stay warm.
    if (P.moonFill) { this.hemi.color.lerp(_c.setRGB(0.55, 0.66, 0.95), Math.min(1, P.moonFill)); this.hemi.groundColor.lerp(_c.setRGB(0.09, 0.11, 0.17), Math.min(1, P.moonFill)); }
    this.baseHemi = this.hemi.color.clone();
    this.clouds.setLighting({ sun: atm.sun, sunRadiance: atm.sunRadiance, zenith: atm.zenith, fogColor: atm.fogColor, cover: P.cloudCover });
    this.foliage.setSun(this.sunDir, atm.sunColor);
    this.motes.setSun(this.sunDir, atm.sunColor);
    this.post.setSunColor(atm.sunColor);
    for (const l of this.lanternLights) l.color.setHex(0xffa64d);
    if (live) { this.applyWeather(live.rebake); if (this.tintState.amount > 0) this.applyTint(this.tintState.hex, this.tintState.amount); return; }
    if (this.envHdr && this.envHdrPreset !== this.envKey()) { this.envHdr.dispose(); this.envHdr = null; }
    this.applyWeather(true);
    this.loadEnvHdr(P);
    if (this.tintState.amount > 0) this.applyTint(this.tintState.hex, this.tintState.amount);
  }

  /** Identity of the baked HDR in use: it belongs to one hour of one location. */
  envKey() { return this.location + '/' + this.preset; }

  /**
   * Everything the weather scales, on top of the hour's look: sun strength and shadow softness, ambient, the
   * grey lid on the sky, haze, exposure, lamps and windows, rain. Runs on the frames a weather change is easing
   * in and once per look change; `rebake` also re-renders the sky into the ambient light (when the change settles).
   */
  applyWeather(rebake = false) {
    const P = this.look, W = this.weather.state, atm = this.atm;
    if (!atm) return;
    const lid = W.overcast;
    this.sun.intensity = atm.sunIntensity * W.sun;
    this.sun.shadow.intensity = W.shadow; this.shadows.far.shadow.intensity = W.shadow;
    this.renderer.toneMappingExposure = Math.pow(2, P.exposure + W.exposure);
    this.hemi.intensity = (0.12 + 0.5 * P.bounce + 0.4 * (P.moonFill || 0)) * (1 + (W.ambient - 1) * 0.6);
    // Haze: thicker and greyer under cloud, the sun's glow in it goes with the sun.
    const grey = _c.setScalar((atm.fogColor.r * 0.2126 + atm.fogColor.g * 0.7152 + atm.fogColor.b * 0.0722));
    // Under a lid the haze is the lid's own grey, a little darker than the sky above it.
    this.baseFog = atm.fogColor.clone().lerp(_c2.copy(atm.zenith).multiplyScalar(0.85), P.fog.cool || 0).lerp(grey.multiplyScalar(0.8), lid * 0.75);
    if (P.moonFill) this.baseFog.lerp(_c2.setRGB(0.2, 0.25, 0.36), 0.6 * Math.min(1, P.moonFill)); // the ground mist catches the moon
    this.scene.fog.color.copy(this.baseFog);
    this.scene.fog.near = P.fog.near / W.fog; this.scene.fog.far = Math.max(this.scene.fog.near + 20, P.fog.far / W.fog);
    setFog({ baseY: this.fogBaseY, falloff: P.fog.falloff, density: P.fog.density * W.fog, aerial: P.fog.aerial, sunDir: this.sunDir, sunTint: atm.fogSunTint, sunPower: P.fog.sunPower, sunStrength: (P.fog.lobe ?? 1) * (1 - lid * 0.9) });
    this.sky.setWeather({ cover: weatherCover(W, P.cloudCover), overcast: lid, fogColor: this.baseFog });
    this.post.setRays(1 - lid);
    // Lamps and windows come up as daylight goes down.
    const dim = 1 - W.sun;
    this.light.lamps = P.lamps + dim * 0.6; this.light.windows = P.windows + dim * 0.9;
    this.lanternScale = this.light.lamps;
    setEmissiveLevels(this.light);
    this.rain.setAmount(W.rain, this.reducedMotion);
    this.foliage.setWind(this.reducedMotion ? 0 : Math.min(2.4, W.wind / 0.35)); // the calm default is the grass as it always was
    this.rain.setColor(_c.copy(atm.zenith).lerp(_white, 0.6).multiplyScalar(1.4));
    // Ambient light from the sky: the dome baked into a PMREM. The Blender-baked HDR (art/env/bake_env.py) is a clear
    // golden hour on the archipelago, so it serves only there and only while the sky is clear.
    const useHdr = this.cfg.envHdr && this.envHdr && this.envHdrPreset === this.envKey() && lid < 0.3;
    if (rebake || !this.envFallback) {
      if (this.envFallback) this.envFallback.dispose();
      this.envFallback = this.sky.bakeEnvironment(this.renderer);
    }
    this.scene.environment = useHdr ? this.envHdr.texture : this.envFallback.texture;
    // While a change eases in the baked sky is the old one: its level follows the weather, the rebake at the end takes over.
    this.scene.environmentIntensity = P.envIntensity * (this.envWeather == null || rebake ? 1 : 1 + (W.ambient - this.envAmbient) * 0.5);
    if (rebake) { this.envWeather = this.weather.name; this.envAmbient = W.ambient; }
    this.weather.dirty = false;
  }

  /** 'clear' | 'overcast' | 'rain'. Eases in over a few seconds; at once under reduced motion or with `immediate`. */
  setWeather(name, { immediate = false } = {}) {
    if (!WEATHER[name]) return this.weather.name;
    this.weather.set(name, { immediate: immediate || this.reducedMotion });
    this.weatherSettled = false;
    this.applyWeather(this.weather.k >= 1);
    return name;
  }

  /**
   * Which place the camera is in: 'archipelago' | 'town'. Each has its own sun position and air for the same hour
   * (sky.js LOCATION_LOOKS); without an explicit hour each also has its own default (morning below, golden hour above).
   */
  setLocation(name) {
    if (!LOCATION_LOOKS[name] || name === this.location) return this.location;
    this.location = name;
    this.look = lookFor(name, this.timeOverride);
    this.preset = this.look.name;
    this.applyAtmosphere(this.look);
    return name;
  }

  /**
   * The one strong local light of a place (the Tournament altar's amber core): a warm point light without a shadow.
   * @param {THREE.Vector3|number[]|null} position world position, or null to switch it off
   * @param {number} [level] 0..1 and above (the altar's flare); scaled by the hour (stronger as daylight fades)
   */
  setHeroLight(position, level = 1) {
    if (!position) { this.heroBase = 0; this.heroLight.intensity = 0; return; }
    if (Array.isArray(position)) this.heroLight.position.fromArray(position); else this.heroLight.position.copy(position);
    this.heroBase = Math.max(0, Number(level) || 0);
  }

  /**
   * Moves the floor of the atmosphere to another place in the same scene (the town on the ground, scenes/town.js):
   * the height fog pools at `fogBaseY` and the cloud sea lies at `mistLevel` as a sea of mist (`mist: false` hides
   * it). The look follows the place too (`setLocation`): the town has its own sun position and air for the same hour.
   * `null` restores the archipelago's cloud level and look.
   * @param {{fogBaseY: number, mistLevel?: number, mist?: boolean}|null} floor
   */
  setAtmosphereFloor(floor) {
    this.fogBaseY = floor ? floor.fogBaseY : this.cloudLevel;
    setFog({ baseY: this.fogBaseY });
    this.clouds.setLevel(floor && floor.mistLevel != null ? floor.mistLevel : this.cloudLevel);
    this.clouds.group.visible = !(floor && floor.mist === false);
    // The only caller that moves the floor is the town (scenes/town.js via boot-world.js): the look follows the place.
    this.setLocation(floor ? (floor.location || 'town') : 'archipelago');
    if (!floor) this.setHeroLight(null);
  }

  /** Time of day: 'golden' | 'morning' | 'noon' | 'dusk', held in both locations; null returns to each location's default. Returns the active preset. */
  setPreset(name) {
    if (name != null && !TIME_PRESETS[name]) return this.preset;
    const override = name || null;
    if (override === this.timeOverride) return this.preset;
    this.timeOverride = override;
    const look = lookFor(this.location, override);
    if (look.name === this.preset) { this.look = look; return this.preset; } // the hour on show already
    this.look = look; this.preset = look.name;
    this.applyAtmosphere(look);
    return this.preset;
  }

  /**
   * A blended look (render/daycycle.js mixLooks of two lookFor() results) for the town's day cycle. The hour on
   * show becomes the nearer preset's name; leaving the place (setLocation) returns to its preset as before.
   */
  applyLook(look) {
    this.look = look; this.preset = look.name;
    this.applyAtmosphere(look);
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
    const forPreset = this.envKey();
    const base = import.meta.env?.BASE_URL || '/';
    new RGBELoader().load(base + P.envUrl, (tex) => {
      this.envLoading = false;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const rt = pmrem.fromEquirectangular(tex);
      pmrem.dispose(); tex.dispose();
      if (forPreset !== this.envKey()) { rt.dispose(); return; }
      this.envHdr = rt; this.envHdrPreset = forPreset;
      this.applyWeather(false);
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

  setReducedMotion(on) { this.reducedMotion = !!on; this.applyWeather(false); }

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
    this.shadows.configure(cfg); // a 0 shadow map turns the sun shadow off
    this.blobs.setStrength(cfg.blobs || 0);
    this.rain.setMax(cfg.rain || 0); this.rain.setAmount(this.weather.state.rain, this.reducedMotion);
    this.heroLight.visible = !!cfg.pointLights;
    this.clouds.setLayers(cfg.cloudLayers);
    this.clouds.setSteps(cfg.cloudSteps);
    this.foliage.rebuild({ blades: cfg.grassBlades, flowers: cfg.flowers, fadeDistance: cfg.grassFadeDistance });
    for (const l of this.lanternLights) l.visible = cfg.pointLights;
    this.motes.setCount(cfg.motes);
    this.motes.setPixelRatio(r.getPixelRatio());
    applyMaterialQuality(cfg);
    this.post.configure(cfg);
    if (this.envFallback) { this.applyWeather(false); this.loadEnvHdr(this.look); }
  }

  setSize(w, h) {
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
  }

  /** Tracks an object for the occlusion fade (see fade.js). */
  trackOccluder(spec) { this.fader.track(spec); }

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
    this.weather.update(dt, motion);
    if (this.weather.dirty || this.weather.changing) this.applyWeather(false);
    else if (!this.weatherSettled) { this.weatherSettled = true; if (this.envWeather !== this.weather.name) this.applyWeather(true); }
    this.rain.update(motion);
    tickFog(motion);
    this.time += motion;
    this.animateLight(this.time);
    this.shadows.update(focus, camDist);
    this.blobs.update();
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
    // The hero light breathes a little; it grows as daylight fades so the amber is always the strongest local light.
    this.heroLight.intensity = this.heroBase * (16 + 14 * Math.min(1.5, this.light.lamps)) * (1 + 0.05 * Math.sin(t * 1.7));
    setNacreTime(t);
  }

  render() { this.post.render(this.sunDir); }

  /** Numbers for the HUD / measurement: tier, profile, pixel ratio (after the governor's scale), whether the post stack is active. */
  stats() { return { tier: this.tier, profile: this.profile, preset: this.preset, location: this.location, weather: this.weather.name, shadows: this.shadows.stats(), pixelRatio: this.renderer.getPixelRatio(), pixelScale: this.pixelScale, post: this.post.active, reducedMotion: this.reducedMotion }; }
}
