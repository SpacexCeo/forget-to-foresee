// Distance fog + height fog (owner concept 07.11: pale haze, dense low fog over the sea).
// three.js only ships distance/exponential fog, so this patches the shared fog shader chunks once,
// before any material compiles. Everything stays inside #ifdef USE_FOG, so scenes without fog (the
// review page) are untouched. The world position comes from mvPosition, which every built-in
// material (sprites included) has in its vertex shader.
import * as THREE from 'three';

let installed = false;

/**
 * @param {{baseY?:number, falloff?:number, density?:number}} o
 *   baseY: height (m) where the height fog is densest; falloff: per meter above baseY;
 *   density: extinction per meter of view distance at baseY.
 */
export function installHeightFog({ baseY = -0.6, falloff = 0.3, density = 0.006 } = {}) {
  if (installed) return;
  installed = true;
  const f = (v) => Number(v).toFixed(6);
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
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  float heightAmount = exp( - max( vFogWorldPos.y - (${f(baseY)}), 0.0 ) * ${f(falloff)} );
  float heightFog = 1.0 - exp( - ${f(density)} * vFogDepth * heightAmount );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, max( fogFactor, heightFog ) );
#endif`;
}
