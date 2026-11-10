// Physically based sky (owner concept 07.11 + style addendum: golden hour over a floating
// archipelago, warm gold haze against cool blue-grey shadows). Adapted from Hillaire, "A Scalable
// and Production Ready Sky and Atmosphere Rendering Technique" (EGSR 2020): the expensive
// Rayleigh + Mie + ozone single-scattering raymarch runs only into a small sky-view LUT
// (256x128, non-linear latitude so the horizon gets most texels) when the time of day changes;
// the dome samples that LUT per pixel, adds a limb-darkened sun disc and a layer of high
// altocumulus lit with a Henyey-Greenstein phase, so its per-pixel cost is a few texture fetches.
// The LUT is read back once per preset to normalise the sky's brightness and to derive the fog
// colours (aerial perspective toward and away from the sun), so sky, fog and IBL always agree.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { getNoiseTexture } from './noise.js';

const DEG = Math.PI / 180;

/** Direction toward the sun in three.js world space. Azimuth: degrees from -Z toward -X (the default view looks toward -Z). */
export function sunDirection(elevationDeg, azimuthDeg) {
  const el = elevationDeg * DEG, az = azimuthDeg * DEG;
  return new THREE.Vector3(-Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

/**
 * Time-of-day presets. `golden` is the concept look and matches the HDR baked in Blender
 * (art/env/bake_env.py: elevation 13, azimuth 34); the others fall back to the sky-dome PMREM.
 *   sunIntensity  directional light intensity (three.js units) before the atmosphere tint
 *   skyMean       mean radiance of the upper sky hemisphere after normalisation (ambient level)
 *   mie           aerosol multiplier (golden haze); exposure in EV
 *   fog           height fog density (extinction per m at the cloud sea) and falloff (per m above it),
 *                 distance fog near/far (m), the sun lobe power and strength (`lobe`, default 1) and the aerial
 *                 cool shift (render/fog.js); `cool` pulls the haze colour toward the zenith (blue hour)
 */
export const TIME_PRESETS = Object.freeze({
  golden: Object.freeze({
    label: 'Golden hour', elevation: 13, azimuth: 34, sunIntensity: 5.0, skyMean: 0.30, mie: 2.4, ozone: 1.0,
    exposure: 0.25, envUrl: 'assets/env/golden_1k.hdr', envIntensity: 0.28, cloudCover: 0.58, warmth: 1.0,
    fog: { density: 0.06, falloff: 0.1, near: 30, far: 420, sunPower: 7, aerial: 0.35 },
  }),
  morning: Object.freeze({
    label: 'Morning', elevation: 24, azimuth: -38, sunIntensity: 4.6, skyMean: 0.36, mie: 1.6, ozone: 1.0,
    exposure: 0.0, envUrl: null, envIntensity: 0.34, cloudCover: 0.42, warmth: 0.6,
    fog: { density: 0.05, falloff: 0.1, near: 35, far: 460, sunPower: 6, aerial: 0.3 },
  }),
  noon: Object.freeze({
    label: 'Noon', elevation: 58, azimuth: 20, sunIntensity: 4.4, skyMean: 0.42, mie: 1.0, ozone: 1.0,
    exposure: -0.3, envUrl: null, envIntensity: 0.4, cloudCover: 0.36, warmth: 0.2,
    fog: { density: 0.04, falloff: 0.1, near: 45, far: 520, sunPower: 5, aerial: 0.25 },
  }),
  // Blue hour: the sun sits on the horizon and gives a last warm rim; the sky is the light, cool and dim, so lamps
  // and lit windows carry the scene. Little aerosol (a heavy golden haze turned the whole frame orange).
  dusk: Object.freeze({
    label: 'Dusk', elevation: 3, azimuth: 48, sunIntensity: 1.1, skyMean: 0.13, mie: 1.3, ozone: 1.7,
    exposure: 0.55, envUrl: null, envIntensity: 0.5, cloudCover: 0.5, warmth: 1.3,
    fog: { density: 0.05, falloff: 0.1, near: 35, far: 480, sunPower: 9, aerial: 0.4, lobe: 0.45, cool: 0.7 },
  }),
});
export const DEFAULT_PRESET = 'golden';

/**
 * A look per location (docs/atmosphere.md). The archipelago floats in open sky and keeps the presets above. The
 * town climbs a hill toward -Z with a cliff behind it, so a sun in the north (the archipelago's golden hour) leaves
 * every street in the hill's shadow: the town turns the sun to its open south-east side, starts in the morning by
 * default, and has its own air (valley haze below the hill instead of mist pooling on a cloud sea, a longer view).
 *   lamps / windows   how much street lamps and lit windows give at that hour (1 = as authored, at dusk they take over)
 *   bounce            warm light thrown back by sunlit walls and paving into the shade (hemisphere ground term)
 */
export const LOCATION_LOOKS = Object.freeze({
  archipelago: Object.freeze({
    default: 'golden', altitude: 1800,
    presets: Object.freeze({
      // Less aerosol and a lower exposure than the 08.11 pass: the haze keeps the far islands soft, the sky keeps its blue.
      golden: { mie: 1.5, exposure: -0.1, cloudCover: 0.46, lamps: 0.8, windows: 1, bounce: 0.3, fog: { density: 0.035, falloff: 0.1, near: 60, far: 760, sunPower: 8, aerial: 0.45 } },
      morning: { lamps: 0.3, windows: 0.5, bounce: 0.25 },
      noon: { lamps: 0.15, windows: 0.3, bounce: 0.3 },
      dusk: { lamps: 1.3, windows: 1.8, bounce: 0.04 },
    }),
  }),
  town: Object.freeze({
    default: 'morning', altitude: 420,
    presets: Object.freeze({
      morning: { elevation: 34, azimuth: -142, sunIntensity: 5.2, skyMean: 0.34, mie: 1.5, exposure: 0.0, envIntensity: 0.42, cloudCover: 0.4, lamps: 0.2, windows: 0.45, bounce: 0.5,
        fog: { density: 0.02, falloff: 0.05, near: 70, far: 900, sunPower: 6, aerial: 0.45 } },
      noon: { elevation: 58, azimuth: -165, envIntensity: 0.46, lamps: 0.1, windows: 0.3, bounce: 0.55,
        fog: { density: 0.014, falloff: 0.05, near: 90, far: 1000, sunPower: 5, aerial: 0.35 } },
      golden: { elevation: 19, azimuth: -124, sunIntensity: 5.0, mie: 1.6, exposure: 0.1, envUrl: null, envIntensity: 0.36, lamps: 0.7, windows: 1.1, bounce: 0.5,
        fog: { density: 0.016, falloff: 0.05, near: 60, far: 850, sunPower: 7, aerial: 0.5 } },
      dusk: { azimuth: -112, envIntensity: 0.55, lamps: 1.25, windows: 2.4, bounce: 0.05,
        fog: { density: 0.02, falloff: 0.05, near: 50, far: 700, sunPower: 9, aerial: 0.5 } },
    }),
  }),
});
export const LOCATIONS = Object.freeze(Object.keys(LOCATION_LOOKS));

/**
 * The preset a location shows at a time of day: the shared preset with the location's overrides on top.
 * Unknown input falls back to the archipelago and to the location's own default hour.
 * @param {string} location 'archipelago' | 'town' @param {string} [time] a TIME_PRESETS key
 */
export function lookFor(location, time) {
  const loc = LOCATION_LOOKS[location] ? location : 'archipelago';
  const L = LOCATION_LOOKS[loc];
  const name = TIME_PRESETS[time] ? time : L.default;
  const base = TIME_PRESETS[name], over = L.presets[name] || {};
  return Object.freeze({ lamps: 1, windows: 1, bounce: 0.25, ...base, ...over, fog: Object.freeze({ ...base.fog, ...(over.fog || {}) }), name, location: loc, altitude: L.altitude });
}

/** Back-compat exports (golden hour). */
export const SUN_DIRECTION = Object.freeze(sunDirection(TIME_PRESETS.golden.elevation, TIME_PRESETS.golden.azimuth));
export const SUN_COLOR = 0xffd2a0;
export const HAZE_COLOR = 0x9aa3ad;

// ---- Atmosphere constants (Earth, Hillaire 2020 / Bruneton) shared by the JS and GLSL paths. ----
const RP = 6360e3, RA = 6460e3, HR = 8000, HM = 1200;
const BR = [5.802e-6, 13.558e-6, 33.1e-6], BO = [0.65e-6, 1.881e-6, 0.085e-6];
const BM_SCAT = 3.996e-6, BM_ABS = 4.4e-6;
/** Observer altitude: the archipelago floats high above the cloud sea. */
export const OBSERVER_ALTITUDE = 1800;

/** Transmittance of sunlight from the top of the atmosphere down to the observer (linear RGB). */
export function sunTransmittance(elevationDeg, { mie = 1, ozone = 1, altitude = OBSERVER_ALTITUDE } = {}) {
  const el = elevationDeg * DEG;
  const o = [0, RP + altitude, 0], d = [Math.cos(el), Math.sin(el), 0];
  const b = o[1] * d[1], c = o[1] * o[1] - RA * RA, len = -b + Math.sqrt(b * b - c);
  const N = 96, ds = len / N, od = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) * ds, x = d[0] * t, y = o[1] + d[1] * t;
    const h = Math.hypot(x, y) - RP;
    if (h < 0) return [0, 0, 0];
    const dR = Math.exp(-h / HR), dM = Math.exp(-h / HM), dO = Math.max(0, 1 - Math.abs(h - 25000) / 15000);
    for (let k = 0; k < 3; k++) od[k] += (BR[k] * dR + mie * (BM_SCAT + BM_ABS) * dM + BO[k] * dO * ozone) * ds;
  }
  return od.map((v) => Math.exp(-v));
}

const GLSL_COMMON = /* glsl */`
  #define PI 3.14159265359
  vec3 ftfLutDir(vec2 uv) {
    float az = (uv.x - 0.5) * 2.0 * PI;
    float s = uv.y * 2.0 - 1.0;
    float lat = sign(s) * s * s * 0.5 * PI;
    return vec3(cos(lat) * cos(az), sin(lat), cos(lat) * sin(az));
  }
  vec2 ftfLutUv(vec3 d) {
    float lat = asin(clamp(d.y, -1.0, 1.0));
    float az = atan(d.z, d.x);
    return vec2(az / (2.0 * PI) + 0.5, 0.5 + 0.5 * sign(lat) * sqrt(abs(lat) / (0.5 * PI)));
  }
`;

const LUT_FS = /* glsl */`
  uniform vec3 uSunDir;
  uniform float uAlt, uMie, uOzone;
  uniform vec3 uGroundAlbedo;
  varying vec2 vUv;
  ${GLSL_COMMON}
  const float RP = ${RP.toFixed(1)}, RA = ${RA.toFixed(1)}, HR = ${HR.toFixed(1)}, HM = ${HM.toFixed(1)};
  const vec3 BR = vec3(${BR.map((v) => v.toExponential(4)).join(', ')});
  const vec3 BO = vec3(${BO.map((v) => v.toExponential(4)).join(', ')});
  const float BMS = ${BM_SCAT.toExponential(4)}, BMA = ${BM_ABS.toExponential(4)};
  vec2 raySphere(vec3 ro, vec3 rd, float r) {
    float b = dot(ro, rd), c = dot(ro, ro) - r * r, h = b * b - c;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h); return vec2(-b - h, -b + h);
  }
  vec3 extinction(float h) {
    float dR = exp(-h / HR), dM = exp(-h / HM), dO = max(0.0, 1.0 - abs(h - 25000.0) / 15000.0);
    return BR * dR + vec3(uMie * (BMS + BMA)) * dM + BO * dO * uOzone;
  }
  vec3 toSun(vec3 p) {
    if (raySphere(p, uSunDir, RP).x > 0.0) return vec3(0.0);
    float len = raySphere(p, uSunDir, RA).y, ds = len / 12.0;
    vec3 od = vec3(0.0);
    for (int i = 0; i < 12; i++) { vec3 q = p + uSunDir * (ds * (float(i) + 0.5)); od += extinction(length(q) - RP) * ds; }
    return exp(-od);
  }
  void main() {
    vec3 d = ftfLutDir(vUv);
    vec3 ro = vec3(0.0, RP + uAlt, 0.0);
    float tmax = raySphere(ro, d, RA).y;
    vec2 tg = raySphere(ro, d, RP);
    bool ground = tg.x > 0.0;
    if (ground) tmax = tg.x;
    float mu = dot(d, uSunDir);
    float pR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
    const float g = 0.8;
    float pM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
    vec3 L = vec3(0.0), T = vec3(1.0);
    const int N = 40;
    for (int i = 0; i < N; i++) {
      // Quadratic step distribution: dense near the observer, sparse far away.
      float a = float(i) / float(N), b = float(i + 1) / float(N);
      float t0 = tmax * a * a, t1 = tmax * b * b, ds = t1 - t0;
      vec3 p = ro + d * (0.5 * (t0 + t1));
      float h = length(p) - RP;
      float dR = exp(-h / HR), dM = exp(-h / HM);
      vec3 ext = extinction(h);
      vec3 S = toSun(p);
      vec3 scat = BR * dR * pR + vec3(uMie * BMS * dM) * pM;
      // Cheap multiple-scattering term (isotropic, scaled single scatter) so the anti-sun sky is not black.
      vec3 ms = (BR * dR + vec3(uMie * BMS * dM)) * (0.08 / (4.0 * PI));
      vec3 stepT = exp(-ext * ds);
      L += T * (scat * S + ms * (0.4 + 0.6 * S)) * (1.0 - stepT) / max(ext, vec3(1e-12));
      T *= stepT;
    }
    if (ground) {
      // Below the horizon: the top of the cloud sea, a bright diffuse "ground".
      vec3 p = ro + d * tmax, n = normalize(p);
      L += T * toSun(p + n * 50.0) * max(dot(n, uSunDir), 0.0) * uGroundAlbedo / PI;
    }
    gl_FragColor = vec4(L, 1.0);
  }
`;

const DOME_VS = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position; // unit sphere centred on the camera: local position = view direction
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_Position.z = gl_Position.w; // always at the far plane
  }
`;

const DOME_FS = /* glsl */`
  uniform sampler2D tLut, tNoise;
  uniform vec3 uSunDir, uSunDisc, uCloudSun, uCloudAmb, uHorizon;
  uniform float uScale, uTime, uCover, uDiscOn, uCosDisc, uOvercast;
  uniform vec3 uLid;
  varying vec3 vDir;
  ${GLSL_COMMON}
  float hg(float mu, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * mu, 1.5)); }
  void main() {
    vec3 d = normalize(vDir);
    vec3 sky = texture2D(tLut, ftfLutUv(d)).rgb * uScale;
    float mu = dot(d, uSunDir);
    // Sun disc with limb darkening; off while baking the environment (the light is the sun).
    if (uDiscOn > 0.5 && uOvercast < 0.98) {
      float k = smoothstep(uCosDisc, mix(uCosDisc, 1.0, 0.25), mu);
      float r = clamp((1.0 - mu) / (1.0 - uCosDisc), 0.0, 1.0);
      sky += uSunDisc * k * (1.0 - 0.6 * (1.0 - sqrt(1.0 - r * r))) * (1.0 - uOvercast) * (1.0 - uOvercast);
    }
    // Two cloud layers on planes above the observer: high altocumulus (2.5 km, fine billows carved by
    // cellular puffs) and a lower band of heavier cumulus (1.1 km) that only shows near the horizon,
    // where the sun lights it from behind: the drama line of the key art.
    if (d.y > 0.0) {
      for (int layer = 0; layer < 2; layer++) {
        float alt = layer == 0 ? 2.5 : 1.1;
        float t = alt / max(d.y, 0.03);
        vec2 p = d.xz * t * (layer == 0 ? 0.06 : 0.035) + vec2(uTime * 0.0006, uTime * 0.00025) * (layer == 0 ? 1.0 : 1.6) + float(layer) * 0.43;
        vec4 n1 = texture2D(tNoise, p);
        vec4 n2 = texture2D(tNoise, p * 3.1 + 0.37);
        float base = n1.r * 0.65 + n1.b * 0.35;
        float detail = n2.g * 0.5 + n2.a * 0.5;
        float cover = layer == 0 ? uCover : uCover * 0.75;
        float dens = smoothstep(1.0 - cover, 1.0 - cover + 0.28, base - (1.0 - detail) * 0.18);
        float thick = smoothstep(0.55, 1.0, base) * (layer == 0 ? 1.0 : 1.25);
        // Silver/gold lining: forward scattering through thin edges, dark cool cores.
        vec3 lit = uCloudSun * (0.16 + 3.0 * hg(mu, 0.62) * (1.0 - thick * 0.8) + 0.35 * hg(mu, -0.2)) + uCloudAmb * (0.78 - thick * 0.5);
        float far = exp(-t * (layer == 0 ? 0.09 : 0.16));
        lit = mix(sky, lit, far);
        float fade = layer == 0 ? smoothstep(0.015, 0.14, d.y) : smoothstep(0.012, 0.06, d.y) * (1.0 - smoothstep(0.16, 0.3, d.y));
        sky = mix(sky, lit, dens * fade * 0.92);
      }
    }
    // Overcast: a grey lid with slow, soft structure; a little brighter toward the hidden sun.
    if (uOvercast > 0.0) {
      vec2 lp = d.xz / max(d.y + 0.25, 0.25) * 0.5 + vec2(uTime * 0.0011, uTime * 0.0004);
      vec4 ln = texture2D(tNoise, lp);
      float mott = ln.r * 0.6 + ln.b * 0.4;
      vec3 lid = uLid * (0.78 + 0.4 * mott) * (1.0 + 0.35 * pow(max(mu, 0.0), 3.0));
      sky = mix(sky, lid, uOvercast * smoothstep(-0.04, 0.12, d.y + 0.02));
    }
    // Below the horizon the cloud sea covers the dome; keep it the horizon haze so any gap matches the fog.
    sky = mix(uHorizon, sky, smoothstep(-0.06, 0.005, d.y));
    gl_FragColor = vec4(sky, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const LUT_W = 256, LUT_H = 128;

export class SkyDome {
  constructor() {
    this.lut = new THREE.WebGLRenderTarget(LUT_W, LUT_H, { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false });
    this.lut.texture.wrapS = THREE.RepeatWrapping;
    this.lutMat = new THREE.ShaderMaterial({
      uniforms: { uSunDir: { value: SUN_DIRECTION.clone() }, uAlt: { value: OBSERVER_ALTITUDE }, uMie: { value: 1 }, uOzone: { value: 1 }, uGroundAlbedo: { value: new THREE.Color(0.72, 0.72, 0.74) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: LUT_FS, depthTest: false, depthWrite: false,
    });
    this.lutQuad = new FullScreenQuad(this.lutMat);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tLut: { value: this.lut.texture }, tNoise: { value: getNoiseTexture() },
        uSunDir: { value: SUN_DIRECTION.clone() }, uSunDisc: { value: new THREE.Color() }, uCloudSun: { value: new THREE.Color() },
        uCloudAmb: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color(HAZE_COLOR) },
        uScale: { value: 1 }, uTime: { value: 0 }, uCover: { value: 0.45 }, uDiscOn: { value: 1 }, uCosDisc: { value: Math.cos(0.75 * DEG) },
        uOvercast: { value: 0 }, uLid: { value: new THREE.Color(0.4, 0.42, 0.45) },
      },
      vertexShader: DOME_VS, fragmentShader: DOME_FS,
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material);
    this.mesh.name = 'sky_dome';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    this.mesh.scale.setScalar(450);
    /** Derived each setAtmosphere(): what the fog, clouds and lights use. Linear RGB. */
    this.derived = null;
    this.tintState = null;
    /** @type {null|((hex:number|string, amount:number) => void)} set by LookDev to propagate tint() */
    this.onTint = null;
  }

  /** Keeps the dome centred on the camera (its vertex shader pins it to the far plane). */
  follow(camera) { this.mesh.position.copy(camera.position); }

  /**
   * Runtime mood tint (the tension effect in play/presentation.js calls `lookdev.sky.tint(hex, amount)`):
   * pulls the horizon haze and the cloud ambient toward a colour, hue only, and tells the look-dev
   * (`onTint`) so the fog, the fill light and the cloud sea follow. amount 0 restores the preset.
   */
  tint(hex, amount) {
    const k = THREE.MathUtils.clamp(Number(amount) || 0, 0, 1);
    this.tintState = { hex, amount: k };
    if (!this.derived) return;
    const c = new THREE.Color(hex);
    const toward = (base) => { const l = base.r * 0.2126 + base.g * 0.7152 + base.b * 0.0722; const cl = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722 || 1e-3; return base.clone().lerp(c.clone().multiplyScalar(l / cl), k * 0.6); };
    const m = this.material.uniforms;
    m.uHorizon.value.copy(toward(this.derived.fogColor));
    m.uCloudAmb.value.copy(toward(this.derived.zenith.clone().multiplyScalar(0.9)));
    if (typeof this.onTint === 'function') this.onTint(hex, k);
  }

  setTime(t) { this.material.uniforms.uTime.value = t; }

  /**
   * Weather on the dome (render/weather.js): cloud cover, the grey lid of an overcast sky, and the haze colour the
   * horizon blends into. The lid's brightness comes from the clear sky's own mean, so it follows the hour.
   * @param {{cover: number, overcast: number, fogColor?: THREE.Color}} w
   */
  setWeather({ cover, overcast, fogColor }) {
    const m = this.material.uniforms;
    m.uCover.value = cover; m.uOvercast.value = overcast;
    if (this.derived) {
      const z = this.derived.zenith, h = this.derived.horizonSun;
      const l = (z.r + z.g + z.b) / 3 * 0.6 + (h.r + h.g + h.b) / 3 * 0.4;
      m.uLid.value.setRGB(l * 1.02, l * 1.05, l * 1.1).multiplyScalar(1.25 - 0.3 * overcast);
      if (fogColor && !(this.tintState && this.tintState.amount > 0)) m.uHorizon.value.copy(fogColor);
    }
  }

  /**
   * Re-renders the sky-view LUT for a preset and derives the sun colour, the sky normalisation and
   * the fog colours from it. Returns `derived`.
   * @param {THREE.WebGLRenderer} renderer
   * @param {typeof TIME_PRESETS.golden} preset
   */
  setAtmosphere(renderer, preset) {
    const sun = sunDirection(preset.elevation, preset.azimuth);
    const u = this.lutMat.uniforms;
    u.uSunDir.value.copy(sun); u.uMie.value = preset.mie; u.uOzone.value = preset.ozone; u.uAlt.value = preset.altitude ?? OBSERVER_ALTITUDE;
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.lut); this.lutQuad.render(renderer);
    // Read back (once per preset) to normalise and to sample horizon colours.
    const raw = new Uint16Array(LUT_W * LUT_H * 4);
    let px = null;
    try { renderer.readRenderTargetPixels(this.lut, 0, 0, LUT_W, LUT_H, raw); px = Float32Array.from(raw, THREE.DataUtils.fromHalfFloat); } catch { px = null; }
    renderer.setRenderTarget(prevTarget);
    const at = (uvx, uvy) => {
      if (!px) return [0.3, 0.33, 0.38];
      const x = ((Math.round(uvx * LUT_W - 0.5) % LUT_W) + LUT_W) % LUT_W, y = Math.min(LUT_H - 1, Math.max(0, Math.round(uvy * LUT_H - 0.5)));
      const i = (y * LUT_W + x) * 4; return [px[i], px[i + 1], px[i + 2]];
    };
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    // Solid-angle weighted mean of the upper hemisphere.
    let sum = 0, wsum = 0;
    for (let y = LUT_H / 2; y < LUT_H; y++) {
      const s0 = (y / LUT_H) * 2 - 1, s1 = ((y + 1) / LUT_H) * 2 - 1;
      const l0 = s0 * s0 * Math.PI / 2, l1 = s1 * s1 * Math.PI / 2;
      const w = Math.cos((l0 + l1) / 2) * (l1 - l0);
      for (let x = 0; x < LUT_W; x += 4) { sum += lum(at((x + 0.5) / LUT_W, (y + 0.5) / LUT_H)) * w; wsum += w; }
    }
    const mean = px ? sum / wsum : 0.3;
    const scale = mean > 1e-6 ? preset.skyMean / mean : 1;
    const dirUv = (d) => [Math.atan2(d.z, d.x) / (2 * Math.PI) + 0.5, 0.5 + 0.5 * Math.sign(Math.asin(d.y)) * Math.sqrt(Math.abs(Math.asin(d.y)) / (Math.PI / 2))];
    const sample = (d) => at(...dirUv(d)).map((v) => v * scale);
    const horiz = (azOffset, el = 2) => sunDirection(el, preset.azimuth + azOffset);
    const towardSun = sample(horiz(0, 3)), awaySun = sample(horiz(180, 3)), side = sample(horiz(90, 3)), zenith = sample(new THREE.Vector3(0, 1, 0));
    // Fog: the cool anti-sun horizon is the base; the gold toward the sun is added by the phase lobe.
    const base = awaySun.map((v, k) => 0.45 * v + 0.4 * side[k] + 0.15 * towardSun[k]);
    const sunTint = towardSun.map((v, k) => Math.max(0, v - base[k]));
    const T = sunTransmittance(preset.elevation, { mie: preset.mie, ozone: preset.ozone, altitude: preset.altitude ?? OBSERVER_ALTITUDE });
    const tMax = Math.max(...T, 1e-6);
    const sunColor = new THREE.Color(T[0] / tMax, T[1] / tMax, T[2] / tMax);
    const sunRadiance = sunColor.clone().multiplyScalar(preset.sunIntensity / Math.PI);
    const m = this.material.uniforms;
    m.uSunDir.value.copy(sun); m.uScale.value = scale; m.uCover.value = preset.cloudCover;
    m.uSunDisc.value.copy(sunColor).multiplyScalar(60 * Math.max(0.15, tMax));
    m.uCloudSun.value.copy(sunRadiance);
    m.uCloudAmb.value.setRGB(...zenith).multiplyScalar(0.9);
    m.uHorizon.value.setRGB(...base);
    this.derived = {
      sun, sunColor, sunIntensity: preset.sunIntensity, sunRadiance, scale, rawMean: mean,
      fogColor: new THREE.Color(...base), fogSunTint: new THREE.Color(...sunTint),
      zenith: new THREE.Color(...zenith), horizonSun: new THREE.Color(...towardSun),
    };
    if (this.tintState && this.tintState.amount > 0) this.tint(this.tintState.hex, this.tintState.amount);
    return this.derived;
  }

  /**
   * Bakes the dome (without the sun disc) into a PMREM environment map: the IBL fallback for the
   * low tier, for presets without a baked HDR, and until the HDR has streamed in.
   */
  bakeEnvironment(renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const sc = new THREE.Scene();
    const m = new THREE.Mesh(this.mesh.geometry, this.material);
    m.scale.setScalar(450);
    sc.add(m);
    const disc = this.material.uniforms.uDiscOn.value;
    this.material.uniforms.uDiscOn.value = 0;
    const rt = pmrem.fromScene(sc, 0, 0.1, 1000);
    this.material.uniforms.uDiscOn.value = disc;
    pmrem.dispose();
    return rt;
  }

  dispose() { this.lut.dispose(); this.lutMat.dispose(); this.lutQuad.dispose(); this.material.dispose(); this.mesh.geometry.dispose(); }
}
