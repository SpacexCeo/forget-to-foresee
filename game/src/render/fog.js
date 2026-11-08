// Atmospheric perspective for the archipelago (owner concept 07.11 + style addendum: golden haze
// against cool shadows, a sea of mist below). Three parts, all in one shader chunk:
//   distance fog   the cool anti-sun horizon colour, linear in view distance (scene.fog)
//   height fog     exponential mist that pools on the cloud sea, integrated analytically along the
//                  view ray (Quilez), so looking down into the mist and across it both read right
//   sun lobe       warm in-scatter toward the sun (a Henyey-Greenstein-like power lobe) so haze
//                  glows gold against the light and stays blue-grey away from it
// three.js only ships distance/exponential fog, so this patches the shared fog shader chunks once,
// before any material compiles. Everything stays inside #ifdef USE_FOG, so scenes without fog (the
// review page) are untouched. All fog parameters live in SHARED uniforms whose values are typed
// arrays: UniformsUtils.clone copies typed arrays by reference, so every material (built-in or
// ShaderMaterial merging UniformsLib.fog) reads the same memory and a change in setFog() /
// setFogTint() reaches every shader on the next frame with no per-material bookkeeping.
import * as THREE from 'three';

/** Shared fog uniforms (typed arrays: see the header). Read by the patched fog chunk. */
export const FOG_UNIFORMS = Object.freeze({
  /** baseY (m, densest), falloff (1/m above baseY), density (extinction per m at baseY), aerial cool shift (0..1) */
  ftfFogParams: { value: new Float32Array([-28, 0.085, 0.009, 0.35]) },
  /** direction toward the sun (xyz, world) and the lobe power */
  ftfFogSun: { value: new Float32Array([0, 1, 0, 7]) },
  /** linear RGB added to the fog colour looking into the sun, and its strength */
  ftfFogSunTint: { value: new Float32Array([0, 0, 0, 1]) },
  /** runtime tint (linear RGB) and its amount: the tension effect warms the haze (presentation.js) */
  ftfFogTint: { value: new Float32Array([1, 1, 1, 0]) },
  /** mist drift: time (s, frozen under reduced motion), amplitude (0..1 of the height density), spatial scale (1/m) */
  ftfFogDrift: { value: new Float32Array([0, 0.3, 0.045]) },
});

let installed = false;

/**
 * Patches the fog chunks and registers the shared uniforms on every built-in shader that fogs.
 * Idempotent; call before the first material compiles.
 */
export function installHeightFog(params = {}) {
  if (!installed) {
    installed = true;
    Object.assign(THREE.UniformsLib.fog, FOG_UNIFORMS);
    for (const lib of Object.values(THREE.ShaderLib)) if (lib && lib.uniforms && lib.uniforms.fogColor) Object.assign(lib.uniforms, FOG_UNIFORMS);
    THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
#endif`;
    THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorldPos = ( inverse( viewMatrix ) * mvPosition ).xyz;
#endif`;
    THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform vec4 ftfFogParams, ftfFogSun, ftfFogSunTint, ftfFogTint;
  uniform vec3 ftfFogDrift;
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  // Optical depth of exp(-falloff * (y - baseY)) mist along the segment camera -> point.
  float ftfHeightFogDepth( vec3 cam, vec3 p ) {
    vec3 d = p - cam;
    float len = length( d );
    float dy = d.y / max( len, 1e-4 );
    float k = ftfFogParams.y;
    float top = exp( - max( cam.y - ftfFogParams.x, 0.0 ) * k );
    float dense = ftfFogParams.z * top;
    float e = k * dy * len;
    // (1 - exp(-e)) / e, stable near e = 0
    float f = abs( e ) > 1e-3 ? ( 1.0 - exp( - e ) ) / e : 1.0 - 0.5 * e;
    // Slow rolling banks of mist (owner 08.11: the world is alive): two travelling waves modulate the
    // density along the ray, sampled at its midpoint. No texture, so every material pays four sines.
    vec2 m = ( cam.xz + p.xz ) * 0.5 * ftfFogDrift.z;
    float tt = ftfFogDrift.x;
    float bank = sin( m.x * 1.0 + tt * 0.11 ) * sin( m.y * 1.3 - tt * 0.07 ) * 0.6 + sin( ( m.x - m.y ) * 2.1 + tt * 0.16 ) * 0.4;
    return dense * len * f * ( 1.0 + ftfFogDrift.y * bank );
  }
#endif`;
    THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  float heightFog = 1.0 - exp( - ftfHeightFogDepth( cameraPosition, vFogWorldPos ) );
  vec3 ftfViewDir = normalize( vFogWorldPos - cameraPosition );
  float ftfMu = max( dot( ftfViewDir, ftfFogSun.xyz ), 0.0 );
  float ftfSun = pow( ftfMu, ftfFogSun.w ) * ftfFogSunTint.w;
  vec3 ftfFogColor = fogColor + ftfFogSunTint.rgb * ftfSun;
  // The runtime tint pulls the haze toward a colour (tension): hue only, the brightness stays.
  float ftfFogLum = dot( ftfFogColor, vec3( 0.2126, 0.7152, 0.0722 ) );
  ftfFogColor = mix( ftfFogColor, ftfFogTint.rgb * ftfFogLum / max( dot( ftfFogTint.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-3 ), ftfFogTint.w );
  // Aerial perspective before the mix: far surfaces lose warmth and contrast (Rayleigh in-scatter).
  float ftfAir = fogFactor * ftfFogParams.w;
  gl_FragColor.rgb = mix( gl_FragColor.rgb, gl_FragColor.rgb * vec3( 0.92, 0.97, 1.05 ) + fogColor * 0.08, ftfAir );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, ftfFogColor, clamp( max( fogFactor, heightFog ), 0.0, 1.0 ) );
#endif`;
  }
  setFog(params);
}

/**
 * @param {{baseY?:number, falloff?:number, density?:number, aerial?:number, sunDir?:{x:number,y:number,z:number},
 *          sunTint?:number[]|THREE.Color, sunPower?:number, sunStrength?:number}} p
 */
export function setFog({ baseY, falloff, density, aerial, sunDir, sunTint, sunPower, sunStrength } = {}) {
  const P = FOG_UNIFORMS.ftfFogParams.value, S = FOG_UNIFORMS.ftfFogSun.value, T = FOG_UNIFORMS.ftfFogSunTint.value;
  if (baseY != null) P[0] = baseY;
  if (falloff != null) P[1] = falloff;
  if (density != null) P[2] = density;
  if (aerial != null) P[3] = aerial;
  if (sunDir) { S[0] = sunDir.x; S[1] = sunDir.y; S[2] = sunDir.z; }
  if (sunPower != null) S[3] = sunPower;
  if (sunTint) { const c = sunTint.isColor ? [sunTint.r, sunTint.g, sunTint.b] : sunTint; T[0] = c[0]; T[1] = c[1]; T[2] = c[2]; }
  if (sunStrength != null) T[3] = sunStrength;
}

/** Runtime haze tint: hex colour and amount 0..1 (0 = the preset's own haze). */
export function setFogTint(hex, amount) {
  const c = new THREE.Color(hex);
  const v = FOG_UNIFORMS.ftfFogTint.value;
  v[0] = c.r; v[1] = c.g; v[2] = c.b; v[3] = THREE.MathUtils.clamp(Number(amount) || 0, 0, 1);
}

/** Advances the mist drift clock; pass dt = 0 under reduced motion. */
export function tickFog(dt) { FOG_UNIFORMS.ftfFogDrift.value[0] += Number(dt) || 0; }

/** Current fog settings (for tests and the dev HUD). */
export function fogState() {
  const P = FOG_UNIFORMS.ftfFogParams.value, S = FOG_UNIFORMS.ftfFogSun.value, T = FOG_UNIFORMS.ftfFogSunTint.value, Q = FOG_UNIFORMS.ftfFogTint.value;
  const D = FOG_UNIFORMS.ftfFogDrift.value;
  return { baseY: P[0], falloff: P[1], density: P[2], aerial: P[3], sunDir: [S[0], S[1], S[2]], sunPower: S[3], sunTint: [T[0], T[1], T[2]], sunStrength: T[3], tint: [Q[0], Q[1], Q[2]], tintAmount: Q[3], driftTime: D[0], driftAmplitude: D[1], installed };
}

/**
 * The same optical depth the shader integrates, in JS: lets tests pin the mist behaviour (looking
 * down into the sea is denser than looking across at the same distance) without a GPU.
 */
export function heightFogDepth(cam, p, { baseY = FOG_UNIFORMS.ftfFogParams.value[0], falloff = FOG_UNIFORMS.ftfFogParams.value[1], density = FOG_UNIFORMS.ftfFogParams.value[2] } = {}) {
  const dx = p[0] - cam[0], dy0 = p[1] - cam[1], dz = p[2] - cam[2];
  const len = Math.hypot(dx, dy0, dz);
  const dy = dy0 / Math.max(len, 1e-4);
  const top = Math.exp(-Math.max(cam[1] - baseY, 0) * falloff);
  const dense = density * top;
  const e = falloff * dy * len;
  const f = Math.abs(e) > 1e-3 ? (1 - Math.exp(-e)) / e : 1 - 0.5 * e;
  return dense * len * f;
}
