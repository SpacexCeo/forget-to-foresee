// Weather and wind for both locations (docs/atmosphere.md).
//
//   clear      the calm default of the jury path
//   haze       a pale veil: softer sun, the distance fades sooner
//   fog        thick low cloud: the far town goes, damp ground, no shadows to speak of
//   overcast   a grey lid: weak sun, soft shadows, brighter flat ambient, thicker cooler haze
//   drizzle    light rain: thin streaks, the ground darkens and starts to shine
//   rain       rain: dense streaks, splashes on the cobbles, wet sheen and puddle reflections, darker sky, misty distance
//   storm      heavy rain and wind with distant flashes (lightning far off, no bolt geometry)
//
// Weather never touches a rule or a collider; it changes light, air and surfaces only. `?weather=` picks one at
// start, `lookdev.setWeather(name)` eases to another over a few seconds (at once under reduced motion).
//
// WIND is one shared uniform for everything that moves in the air: grass (render/foliage.js), air motes, rain,
// and whatever the scenes animate (banners, trees, smoke). Three ways to use it:
//   shader      merge WIND_UNIFORMS into a ShaderMaterial and call ftfWind( worldPos ) from WIND_GLSL
//   material    withWind( material, { kind: 'cloth' | 'foliage', amplitude } ) patches a built-in material's vertices
//   JS          windAt( x, z ) returns the same gust value for CPU-side animation (smoke, hanging signs)
// Wetness is global too: the patched chunk below darkens and smooths every lit surface that faces up, so the town
// and the archipelago get wet together with no per-material bookkeeping.
import * as THREE from 'three';
import { LAYER_OVERLAY } from './layers.js';
import { setWindHook } from './materials.js';

/** World wind direction on the ground plane (x, z), unit length. The grass has always leaned this way. */
export const WIND_DIR = Object.freeze([0.83, -0.56]);

/**
 * Weather presets.
 *   sun        multiplier on the sun's intensity          shadow   shadow strength (1 = full, lower = softer, lifted)
 *   ambient    multiplier on sky ambient (IBL and fill)   cover    cloud cover on the sky dome (null keeps the hour's)
 *   overcast   0..1 grey lid on the sky dome              fog      multiplier on haze density (the view shortens with it)
 *   wet        0..1 surface wetness                       rain     0..1 share of the tier's rain streaks
 *   wind       0..1 strength for everything that sways    exposure EV offset
 */
export const WEATHER = Object.freeze({
  clear: Object.freeze({ label: 'Clear', sun: 1, shadow: 1, ambient: 1, cover: null, overcast: 0, fog: 1, wet: 0, rain: 0, wind: 0.35, exposure: 0, flash: 0 }),
  haze: Object.freeze({ label: 'Haze', sun: 0.72, shadow: 0.8, ambient: 1.15, cover: null, overcast: 0.25, fog: 1.7, wet: 0, rain: 0, wind: 0.3, exposure: 0.03, flash: 0 }),
  fog: Object.freeze({ label: 'Fog', sun: 0.32, shadow: 0.5, ambient: 1.35, cover: 0.85, overcast: 0.6, fog: 3.4, wet: 0.25, rain: 0, wind: 0.15, exposure: 0.05, flash: 0 }),
  overcast: Object.freeze({ label: 'Overcast', sun: 0.22, shadow: 0.55, ambient: 1.6, cover: 0.97, overcast: 0.85, fog: 1.12, wet: 0, rain: 0, wind: 0.55, exposure: 0.05, flash: 0 }),
  drizzle: Object.freeze({ label: 'Light rain', sun: 0.18, shadow: 0.5, ambient: 1.25, cover: 0.97, overcast: 0.92, fog: 1.3, wet: 0.75, rain: 0.45, wind: 0.6, exposure: -0.12, flash: 0 }),
  rain: Object.freeze({ label: 'Rain', sun: 0.12, shadow: 0.42, ambient: 1.1, cover: 1, overcast: 1, fog: 1.6, wet: 1, rain: 1, wind: 0.8, exposure: -0.3, flash: 0 }),
  storm: Object.freeze({ label: 'Storm', sun: 0.07, shadow: 0.35, ambient: 0.95, cover: 1, overcast: 1, fog: 1.85, wet: 1, rain: 1.5, wind: 1, exposure: -0.45, flash: 1 }),
});
export const WEATHER_NAMES = Object.freeze(Object.keys(WEATHER));
export const DEFAULT_WEATHER = 'clear';
const NUMERIC = ['sun', 'shadow', 'ambient', 'overcast', 'fog', 'wet', 'rain', 'wind', 'exposure', 'flash'];
/** Weathers that may not appear on the readable jury path (?demo=judge). */
export const HEAVY_WEATHER = Object.freeze(['rain', 'storm']);

/** A weather state between two presets (k 0..1). `cover` null means "the hour's own cloud cover". */
export function mixWeather(a, b, k) {
  const out = {};
  for (const key of NUMERIC) out[key] = a[key] + (b[key] - a[key]) * k;
  out.cover = a.cover == null && b.cover == null ? null : { from: a.cover, to: b.cover, k };
  return out;
}

/** Cloud cover of a mixed state given the hour's own cover. */
export function weatherCover(state, hourCover) {
  if (state.cover == null) return hourCover;
  if (typeof state.cover === 'number') return state.cover;
  const from = state.cover.from ?? hourCover, to = state.cover.to ?? hourCover;
  return from + (to - from) * state.cover.k;
}

/** Shared uniforms (typed arrays, shared by reference like the fog's: see render/fog.js). */
export const WIND_UNIFORMS = Object.freeze({
  /** direction x, direction z, strength 0..1, time (s; frozen under reduced motion) */
  ftfWind: { value: new Float32Array([WIND_DIR[0], WIND_DIR[1], 0.35, 0]) },
});
export const WEATHER_UNIFORMS = Object.freeze({
  /** wetness 0..1, puddle amount 0..1, time (s), unused */
  ftfWeather: { value: new Float32Array([0, 0, 0, 0]) },
});

/**
 * GLSL: ftfWind( worldPos ) returns xy = horizontal push (m per unit of amplitude) and z = gust level 0..1.
 * Gust fronts travel downwind as two crossing waves; a fine flutter rides on top. Needs `uniform vec4 ftfWind`.
 */
export const WIND_GLSL = /* glsl */`
  uniform vec4 ftfWind;
  vec3 ftfWind3( vec3 wp ) {
    vec2 dir = ftfWind.xy; float t = ftfWind.w;
    float along = dot( wp.xz, dir ), across = dot( wp.xz, vec2( -dir.y, dir.x ) );
    float gust = 0.5 + 0.5 * sin( along * 0.11 - t * 0.9 + sin( across * 0.07 + t * 0.13 ) * 1.7 );
    gust = gust * gust * ( 0.55 + 0.45 * sin( along * 0.031 - t * 0.21 + 1.3 ) );
    float flutter = sin( along * 1.9 - t * 4.3 + wp.y * 2.1 ) * 0.5 + sin( across * 2.7 + t * 5.9 + wp.y * 1.3 ) * 0.5;
    float push = ftfWind.z * ( 0.35 + 0.65 * gust );
    return vec3( dir * push + vec2( -dir.y, dir.x ) * flutter * 0.18 * ftfWind.z, gust );
  }
`;

/** The same gust field in JS (for smoke, signs, anything animated on the CPU). Returns {x, z, gust}. */
export function windAt(x, z, y = 0, U = WIND_UNIFORMS.ftfWind.value) {
  const dx = U[0], dz = U[1], s = U[2], t = U[3];
  const along = x * dx + z * dz, across = -x * dz + z * dx;
  let gust = 0.5 + 0.5 * Math.sin(along * 0.11 - t * 0.9 + Math.sin(across * 0.07 + t * 0.13) * 1.7);
  gust = gust * gust * (0.55 + 0.45 * Math.sin(along * 0.031 - t * 0.21 + 1.3));
  const flutter = Math.sin(along * 1.9 - t * 4.3 + y * 2.1) * 0.5 + Math.sin(across * 2.7 + t * 5.9 + y * 1.3) * 0.5;
  const push = s * (0.35 + 0.65 * gust);
  return { x: dx * push - dz * flutter * 0.18 * s, z: dz * push + dx * flutter * 0.18 * s, gust };
}

const WIND_KINDS = Object.freeze({
  // Cloth hangs from its upper edge: the lower it hangs, the more it swings and ripples.
  cloth: { amplitude: 0.22, ripple: 0.05 },
  // Canopies and bushes lean with the gusts and shiver.
  foliage: { amplitude: 0.1, ripple: 0.02 },
});

/**
 * Makes a built-in material (Standard, Physical, Lambert...) move with the wind. Idempotent per material.
 * The sway of a vertex is scaled by a weight in 0..1:
 *   - the `_wind` vertex attribute when the mesh has one (glTF attribute `_WIND`: 0 = pinned, 1 = free end);
 *   - otherwise `1 - uv.y` for cloth when `weight: 'uv'` is asked for;
 *   - otherwise a constant small weight (a gentle shiver that cannot tear a pinned edge visibly).
 * @param {THREE.Material} material @param {{kind?: 'cloth'|'foliage', amplitude?: number, weight?: 'attribute'|'uv'|'constant'}} [o]
 */
export function withWind(material, { kind = 'cloth', amplitude, weight = 'attribute' } = {}) {
  if (!material || material.userData.ftfWind) return material;
  const K = WIND_KINDS[kind] || WIND_KINDS.cloth;
  const amp = amplitude ?? K.amplitude;
  material.userData.ftfWind = { kind, amplitude: amp, weight };
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.ftfWind = WIND_UNIFORMS.ftfWind;
    const w = weight === 'attribute' ? '_wind' : weight === 'uv' ? '( 1.0 - uv.y )' : '0.25';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_GLSL}\n${weight === 'attribute' ? 'attribute float _wind;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 ftfWp = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
          #else
            vec3 ftfWp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
          #endif
          vec3 ftfW = ftfWind3( ftfWp );
          float ftfK = clamp( ${w}, 0.0, 1.0 );
          // World-space push brought back into object space (rotation only), plus a ripple along the normal.
          vec3 ftfPush = vec3( ftfW.x, - abs( ftfW.x ) * 0.15 - abs( ftfW.y ) * 0.15, ftfW.y ) * ${amp.toFixed(4)} * ftfK * ftfK;
          transformed += ( vec4( ftfPush, 0.0 ) * modelMatrix ).xyz / max( dot( modelMatrix[ 0 ].xyz, modelMatrix[ 0 ].xyz ), 1e-6 );
          transformed += objectNormal * sin( dot( ftfWp, vec3( 2.3, 1.7, 2.9 ) ) - ftfWind.w * 5.1 ) * ${K.ripple.toFixed(4)} * ${kind === 'foliage' ? 'ftfK * ftfK' : 'ftfK'} * ftfWind.z;
        }`);
  };
  const key = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : () => '';
  material.customProgramCacheKey = () => key() + `-ftf-wind-${kind}-${weight}-${amp}`;
  material.needsUpdate = true;
  return material;
}

/** How computed sway weights are shaped (windWeights). Lengths in metres (model units). */
export const WIND_SHAPE = Object.freeze({
  touch: 0.03,        // parts whose boxes come this close are one object (a banner and its tail, an awning and its stripes)
  hangHeight: 1.2,    // a cloth at least this tall and taller than it is wide hangs free (a banner)
  hangFree: 0.45,     // only its lower part swings: the upper part carries an emblem made of another material
  awning: 0.3,        // a stretched sheet (awning, stall roof) only breathes a little at its lower edge
  crown: 1.5,         // foliage at least this tall is a tree crown or a big bush: it leans as one body
  smallFoliage: 0.22, // window boxes, planters: the tips barely stir (the push goes with the square of the weight)
  smallPart: 0.75,    // a foliage part lower than this is a small plant: it never joins a crown, whatever it touches
});

/**
 * Sway weights for a mesh whose file has no `_WIND` attribute (the town kit). Unknown geometry stays still: a part
 * moves only when its shape says what it is.
 *   1. The geometry is split into connected parts, and parts whose bounding boxes touch are joined into objects, so
 *      everything that belongs to one banner or one awning gets one answer and cannot slide apart.
 *   2. Cloth: a tall hanging sheet (a banner) is pinned along its upper part and free at the hem; a wide stretched
 *      sheet (an awning) breathes slightly at its lower edge; anything else made of cloth (rugs, candles, books) is 0.
 *   3. Foliage is rooted at the bottom of its object: a crown leans, small plants only stir at the tips and are
 *      never joined to a crown they touch.
 * Pure maths on the position attribute; runs once per geometry.
 * @param {{count:number, getX:(i:number)=>number, getY:(i:number)=>number, getZ:(i:number)=>number}} position
 * @param {{count:number, getX:(i:number)=>number}|null} index @param {'cloth'|'foliage'} kind
 * @returns {Float32Array} one weight per vertex, 0 = still
 */
export function windWeights(position, index, kind = 'cloth') {
  const n = position.count, parent = new Int32Array(n), S = WIND_SHAPE;
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  // Vertices at the same place are one point of the surface (seams split them for normals and UVs).
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const key = Math.round(position.getX(i) * 2000) + '_' + Math.round(position.getY(i) * 2000) + '_' + Math.round(position.getZ(i) * 2000);
    const j = seen.get(key);
    if (j === undefined) { seen.set(key, i); parent[i] = i; } else parent[i] = j;
  }
  const tris = index ? index.count : n;
  for (let t = 0; t + 2 < tris; t += 3) {
    const a = find(index ? index.getX(t) : t), b = find(index ? index.getX(t + 1) : t + 1), c = find(index ? index.getX(t + 2) : t + 2);
    if (b !== a) parent[b] = a;
    const c2 = find(c); if (c2 !== a) parent[c2] = a;
  }
  // Bounding box per part, then parts that touch become one object.
  const boxes = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i), x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    let B = boxes.get(r);
    if (!B) boxes.set(r, B = [x, y, z, x, y, z, r]);
    else { if (x < B[0]) B[0] = x; if (y < B[1]) B[1] = y; if (z < B[2]) B[2] = z; if (x > B[3]) B[3] = x; if (y > B[4]) B[4] = y; if (z > B[5]) B[5] = z; }
  }
  // Small plants (window boxes, planters) keep to themselves: a flower touching a tree crown or a bush must not
  // become part of it, or it would lean with the crown and leave its box.
  const small = new Uint8Array(n);
  if (kind === 'foliage') for (const B of boxes.values()) if (B[4] - B[1] < S.smallPart) small[B[6]] = 1;
  const list = [...boxes.values()].sort((p, q) => p[0] - q[0]);
  for (let merged = true, pass = 0; merged && pass < 8; pass++) {
    merged = false;
    for (let i = 0; i < list.length; i++) {
      const A = list[i];
      for (let j = i + 1; j < list.length && list[j][0] <= A[3] + S.touch; j++) {
        const B = list[j], ra = find(A[6]), rb = find(B[6]);
        if (ra === rb || small[A[6]] !== small[B[6]] || B[1] > A[4] + S.touch || A[1] > B[4] + S.touch || B[2] > A[5] + S.touch || A[2] > B[5] + S.touch) continue;
        parent[rb] = ra; merged = true;
      }
    }
  }
  const obj = new Map();
  for (const B of list) {
    const r = find(B[6]); const O = obj.get(r);
    if (!O) obj.set(r, B.slice(0, 6));
    else { for (let k = 0; k < 3; k++) { if (B[k] < O[k]) O[k] = B[k]; if (B[k + 3] > O[k + 3]) O[k + 3] = B[k + 3]; } }
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const O = obj.get(find(i)), h = O[4] - O[1], wide = Math.max(O[3] - O[0], O[5] - O[2]);
    if (h < 1e-4) continue;
    const k = (position.getY(i) - O[1]) / h; // 0 at the bottom of the object, 1 at its top
    if (kind === 'foliage') out[i] = k * (h >= S.crown && !small[find(i)] ? 1 : S.smallFoliage);
    else if (h >= S.hangHeight && h >= wide * 1.2) out[i] = Math.max(0, 1 - k / S.hangFree);
    else if (wide >= 1.5 && h >= 0.2 && h < wide * 0.6) out[i] = S.awning * (1 - k);
  }
  return out;
}

/** The look-material hook: a cloth or foliage mesh without authored weights gets computed ones, then the material sways. */
setWindHook((material, o = {}) => {
  const g = o.geometry;
  if (g && g.getAttribute && !g.getAttribute('_wind') && g.getAttribute('position')) {
    try { g.setAttribute('_wind', new THREE.BufferAttribute(windWeights(g.getAttribute('position'), g.index, o.kind), 1)); } catch { /* keeps the constant shiver */ }
  }
  if (!material) return material;
  return withWind(material, { kind: o.kind, weight: g && g.getAttribute && g.getAttribute('_wind') ? 'attribute' : o.weight });
});

let wetInstalled = false;

/**
 * Patches the standard material's roughness chunk once so rain wets the world: up-facing surfaces darken (rough,
 * porous ones more) and turn smooth, and puddles collect on flat ground as mirror-smooth patches that pick up the
 * sky from the image-based light. Costs one uniform test when dry. Requires the fog chunks of render/fog.js (they
 * carry the world position); call after installHeightFog and before the first material compiles.
 */
export function installWetness() {
  if (wetInstalled) return;
  wetInstalled = true;
  Object.assign(THREE.UniformsLib.fog, WEATHER_UNIFORMS);
  for (const lib of Object.values(THREE.ShaderLib)) if (lib && lib.uniforms && lib.uniforms.fogColor) Object.assign(lib.uniforms, WEATHER_UNIFORMS);
  THREE.ShaderChunk.fog_pars_fragment += /* glsl */`
#ifdef USE_FOG
  uniform vec4 ftfWeather;
  float ftfPuddleK = 0.0;
  float ftfHash21( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
  float ftfValueNoise( vec2 p ) {
    vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( ftfHash21( i ), ftfHash21( i + vec2( 1.0, 0.0 ) ), f.x ), mix( ftfHash21( i + vec2( 0.0, 1.0 ) ), ftfHash21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
  }
#endif`;
  THREE.ShaderChunk.roughnessmap_fragment += /* glsl */`
#if defined( USE_FOG ) && defined( STANDARD )
  if ( ftfWeather.x > 0.001 ) {
    #ifdef FLAT_SHADED
      float ftfUp = 1.0;
    #else
      float ftfUp = clamp( ( vec4( normalize( vNormal ), 0.0 ) * viewMatrix ).y, 0.0, 1.0 );
    #endif
    float ftfWet = ftfWeather.x * smoothstep( 0.15, 0.75, ftfUp );
    // Puddles: low spots of a slow noise on nearly flat ground.
    float ftfN = ftfValueNoise( vFogWorldPos.xz * 0.23 ) * 0.7 + ftfValueNoise( vFogWorldPos.xz * 0.9 + 7.3 ) * 0.3;
    float ftfPuddle = ftfWeather.y * smoothstep( 0.93, 0.995, ftfUp ) * smoothstep( 0.55, 0.4, ftfN );
    ftfPuddleK = ftfPuddle;
    diffuseColor.rgb *= mix( 1.0, 0.5, ftfWet * clamp( roughnessFactor * 1.3, 0.0, 1.0 ) );
    roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.5, ftfWet );
    roughnessFactor = mix( roughnessFactor, 0.1, ftfPuddle );
  }
#endif`;
  // Standing water is flat: inside a puddle the normal map gives way to the surface's own normal, so the puddle
  // mirrors the sky as a calm sheen instead of sparkling on every bump.
  THREE.ShaderChunk.normal_fragment_maps += /* glsl */`
#if defined( USE_FOG ) && defined( STANDARD )
  normal = normalize( mix( normal, nonPerturbedNormal, ftfPuddleK ) );
#endif`;
}

/** Sets wetness and puddles directly (tests, the dev page). */
export function setWetness(wet, puddles = wet) {
  const v = WEATHER_UNIFORMS.ftfWeather.value;
  v[0] = Math.min(1, Math.max(0, wet)); v[1] = Math.min(1, Math.max(0, puddles));
}

function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Rain streaks: instanced camera-facing slivers falling through a box that wraps around the camera, slanted by the
 * wind. One draw call, no light, on the overlay layer (the ambient-occlusion pass never sees it). Under reduced
 * motion the streaks hang still and thin out (a hint of rain, nothing moving).
 */
export class Rain {
  /** @param {{capacity?: number, size?: number, height?: number, seed?: number}} o */
  constructor({ capacity = 6000, size = 44, height = 26, seed = 5 } = {}) {
    this.capacity = capacity;
    const rnd = mulberry(seed);
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const seedA = new Float32Array(capacity * 4);
    for (let i = 0; i < capacity; i++) { seedA[i * 4] = rnd() * size; seedA[i * 4 + 1] = rnd() * height; seedA[i * 4 + 2] = rnd() * size; seedA[i * 4 + 3] = 0.75 + rnd() * 0.5; }
    quad.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedA, 4));
    quad.instanceCount = 0;
    quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        ftfWind: WIND_UNIFORMS.ftfWind, uTime: { value: 0 }, uBox: { value: new THREE.Vector3(size, height, size) },
        uAmount: { value: 0 }, uColor: { value: new THREE.Color(0.75, 0.8, 0.86) }, uStill: { value: 0 },
      },
      vertexShader: /* glsl */`
        uniform vec4 ftfWind; uniform float uTime, uAmount, uStill; uniform vec3 uBox;
        attribute vec4 aSeed;
        varying float vAlpha; varying vec2 vQ;
        void main() {
          float speed = 9.5 * aSeed.w;
          vec3 fall = vec3( ftfWind.x * ftfWind.z * 3.2, - speed, ftfWind.y * ftfWind.z * 3.2 );
          vec3 p = aSeed.xyz + fall * uTime;
          p = mod( p - cameraPosition + 0.5 * uBox, uBox ) - 0.5 * uBox + cameraPosition;
          vec3 dir = normalize( fall );
          vec3 side = normalize( cross( dir, cameraPosition - p ) );
          float len = mix( 0.75, 0.14, uStill ) * aSeed.w;
          // Never thinner than about a pixel: far streaks would flicker in and out otherwise.
          float width = max( 0.012, distance( cameraPosition, p ) * 0.0014 );
          vec3 wp = p - dir * position.y * len + side * position.x * width;
          vec4 mv = viewMatrix * vec4( wp, 1.0 );
          float d = - mv.z;
          vAlpha = uAmount * smoothstep( 0.5, 2.5, d ) * smoothstep( uBox.x * 0.5, uBox.x * 0.3, d );
          vQ = position.xy;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying float vAlpha; varying vec2 vQ;
        void main() {
          float a = vAlpha * ( 1.0 - abs( vQ.x ) * 2.0 ) * smoothstep( 0.0, 0.25, vQ.y ) * ( 1.0 - smoothstep( 0.6, 1.0, vQ.y ) );
          gl_FragColor = vec4( uColor * a * 0.22, 1.0 );   // additive is SRC_ALPHA, ONE: alpha 1 adds the colour
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(quad, this.material);
    this.mesh.name = 'rain'; this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.visible = false;
    this.mesh.layers.set(LAYER_OVERLAY);
    this.max = capacity; this.time = 0;
  }

  /** The tier's streak budget (0 turns rain streaks off: wet ground and haze still say "rain"). */
  setMax(n) { this.max = Math.max(0, Math.min(this.capacity, n | 0)); }

  /** @param {number} amount 0..1 @param {boolean} still reduced motion */
  setAmount(amount, still = false) {
    const n = Math.round(Math.min(this.capacity, this.max * Math.min(1.5, Math.max(0, amount))) * (still ? 0.35 : 1));
    this.mesh.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    this.material.uniforms.uAmount.value = Math.min(1.4, amount * 1.2);
    this.material.uniforms.uStill.value = still ? 1 : 0;
  }

  setColor(color) { this.material.uniforms.uColor.value.copy(color); }

  update(dt) { this.time += dt; this.material.uniforms.uTime.value = this.time; }

  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
}

/**
 * Rain splashes on the ground around the camera: flat rings that open and fade, each reborn at a new spot every
 * cycle (a hash of its cycle number), at the walking height the scene gives (`setGround`). One draw call, additive,
 * depth-tested so walls and steps hide the ones behind them. None under reduced motion.
 */
export class Splashes {
  /** @param {{capacity?: number, radius?: number}} o */
  constructor({ capacity = 900, radius = 9 } = {}) {
    this.capacity = capacity;
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
    quad.setIndex([0, 2, 1, 0, 3, 2]);
    const seed = new Float32Array(capacity * 2), rnd = mulberry(11);
    for (let i = 0; i < capacity; i++) { seed[i * 2] = rnd(); seed[i * 2 + 1] = 0.7 + rnd() * 0.6; }
    quad.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 2));
    quad.instanceCount = 0;
    quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uRadius: { value: radius }, uColor: { value: new THREE.Color(0.8, 0.85, 0.9) } },
      vertexShader: /* glsl */`
        uniform float uTime, uAmount, uRadius; uniform vec3 uCenter;
        attribute vec2 aSeed;
        varying vec2 vQ; varying float vK, vA;
        float h1( float n ) { return fract( sin( n ) * 43758.5453 ); }
        void main() {
          float t = uTime * aSeed.y + aSeed.x * 7.0, cyc = floor( t ), k = fract( t );
          float id = aSeed.x * 1000.0 + cyc * 13.17;
          float a = h1( id ) * 6.2831853, r = sqrt( h1( id + 3.1 ) ) * uRadius;
          vec3 c = uCenter + vec3( cos( a ) * r, 0.02, sin( a ) * r );
          float size = mix( 0.03, 0.17, k ) * ( 0.7 + 0.6 * h1( id + 7.7 ) );
          vQ = position.xz; vK = k;
          vA = uAmount * ( 1.0 - smoothstep( uRadius * 0.6, uRadius, r ) ) * step( h1( id + 1.9 ), uAmount );
          gl_Position = projectionMatrix * viewMatrix * vec4( c + vec3( position.x, 0.0, position.z ) * size, 1.0 );
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying vec2 vQ; varying float vK, vA;
        void main() {
          float d = length( vQ );
          float ring = smoothstep( 0.6, 0.85, d ) * ( 1.0 - smoothstep( 0.85, 1.0, d ) );
          float drop = ( 1.0 - smoothstep( 0.0, 0.35, d ) ) * ( 1.0 - smoothstep( 0.0, 0.25, vK ) );
          float a = vA * ( ring * ( 1.0 - vK ) + drop ) ;
          if ( a < 0.003 ) discard;
          gl_FragColor = vec4( uColor * a * 0.28, 1.0 );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.mesh = new THREE.Mesh(quad, this.material);
    this.mesh.name = 'rain_splashes'; this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.visible = false;
    this.max = capacity; this.time = 0;
  }

  setMax(n) { this.max = Math.max(0, Math.min(this.capacity, n | 0)); }

  /** @param {number} amount 0..1.5 (the rain share) @param {boolean} still reduced motion */
  setAmount(amount, still = false) {
    const a = still ? 0 : Math.min(1, Math.max(0, amount));
    const n = Math.round(this.max * a);
    this.mesh.geometry.instanceCount = n; this.mesh.visible = n > 0;
    this.material.uniforms.uAmount.value = a;
  }

  /** Where the rings fall: the ground under the camera's subject (x, walking height, z). */
  setGround(x, y, z) { this.material.uniforms.uCenter.value.set(x, y, z); }

  setColor(color) { this.material.uniforms.uColor.value.copy(color); }

  update(dt) { this.time += dt; this.material.uniforms.uTime.value = this.time; }

  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
}

/**
 * Eases between weather presets and keeps the shared wind and wetness uniforms current. The look-dev controller
 * reads `state` every frame and applies it to the sun, the sky, the fog and the exposure.
 */
export class WeatherSystem {
  constructor({ name = DEFAULT_WEATHER, seconds = 5 } = {}) {
    this.name = WEATHER[name] ? name : DEFAULT_WEATHER;
    this.from = WEATHER[this.name]; this.to = WEATHER[this.name];
    this.k = 1; this.seconds = seconds;
    this.state = mixWeather(this.from, this.to, 1);
    /** Wetness lags behind the rain: ground wets in seconds, dries slowly. */
    this.wet = this.state.wet;
    /** Puddles as a share of wetness (0 on the cheap tiers: no mirror patches). */
    this.puddles = 1;
    /** Lightning: 0..1 brightness of the current flash, the seconds to the next one, a seeded random. */
    this.flash = 0; this.flashT = -1; this.nextFlash = 4; this.rand = mulberry(97);
    /** Called with the delay (s) of the thunder that follows a flash, for the sound layer. */
    this.onThunder = null;
    this.dirty = true;
    this.apply(0);
  }

  /** @param {string} name @param {{immediate?: boolean}} [o] */
  set(name, { immediate = false, seconds } = {}) {
    if (!WEATHER[name]) return this.name;
    if (name === this.name && this.k >= 1) return name;
    if (seconds > 0) this.seconds = seconds;
    this.from = { ...this.state, cover: weatherCoverSnapshot(this.state) };
    this.to = WEATHER[name]; this.name = name;
    this.k = immediate ? 1 : 0;
    if (immediate) this.wet = this.to.wet;
    this.state = mixWeather(this.from, this.to, this.k);
    this.dirty = true;
    this.apply(0);
    return name;
  }

  /** True while a change is easing in (the look-dev re-applies light and fog on those frames). */
  get changing() { return this.k < 1 || Math.abs(this.wet - this.state.wet) > 0.002; }

  /** @param {number} dt seconds @param {number} motion seconds of animated time (0 under reduced motion) */
  update(dt, motion = dt) {
    if (this.k < 1) {
      this.k = Math.min(1, this.k + dt / this.seconds);
      const e = this.k * this.k * (3 - 2 * this.k);
      this.state = mixWeather(this.from, this.to, e);
      this.dirty = true;
    }
    const target = this.state.wet, rate = target > this.wet ? 0.25 : 0.04;
    if (this.wet !== target) { this.wet += Math.sign(target - this.wet) * Math.min(Math.abs(target - this.wet), rate * dt); this.dirty = true; }
    this.lightning(dt);
    this.apply(motion);
  }

  /** Distant flashes while the storm share is up: a double pulse every 7–20 s, brighter the stormier. */
  lightning(dt) {
    const f = this.state.flash || 0;
    if (f < 0.05) { if (this.flash) { this.flash = 0; this.dirty = true; } this.flashT = -1; return; }
    if (this.flashT >= 0) {
      this.flashT += dt;
      const t = this.flashT, pulse = (c, w) => Math.max(0, 1 - Math.abs(t - c) / w);
      this.flash = f * Math.min(1, pulse(0.05, 0.06) * 0.8 + pulse(0.22, 0.12));
      this.dirty = true;
      if (t > 0.4) { this.flashT = -1; this.flash = 0; }
      return;
    }
    this.nextFlash -= dt;
    if (this.nextFlash <= 0) {
      this.flashT = 0; this.nextFlash = 7 + this.rand() * 13;
      if (this.onThunder) this.onThunder(1.5 + this.rand() * 4);
    }
  }

  apply(motion) {
    const W = WIND_UNIFORMS.ftfWind.value;
    W[2] = this.state.wind; W[3] += motion;
    setWetness(this.wet, this.wet * this.puddles);
    WEATHER_UNIFORMS.ftfWeather.value[2] = W[3];
  }
}

/** Cover of a mixed state as a plain number or null (so a new transition can start from the middle of an old one). */
function weatherCoverSnapshot(state) {
  if (state.cover == null || typeof state.cover === 'number') return state.cover;
  const { from, to, k } = state.cover;
  if (from == null && to == null) return null;
  if (from == null || to == null) return k >= 0.5 ? to : from;
  return from + (to - from) * k;
}
