// Sea of clouds below the archipelago (owner concept 07.11; style addendum: a sea of volumetric
// clouds with depth and parallax). Two meshes, both following the camera on the ground plane:
//   deck   an opaque, lit height-field disc at the cloud base: the "valley floor" of the sea, the
//          backstop that keeps the sky from showing through gaps, and the depth the god rays see.
//          Every tier draws it (one draw call, 4 texture fetches per pixel).
//   slab   a translucent disc at the cloud tops whose fragment shader raymarches a 2.5D cloud volume
//          (a noise height field of billows, cellular puffs and fine detail) down through the slab:
//          Beer-Lambert extinction, a two-tap sun shadow for silver linings, Henyey-Greenstein
//          forward scattering, ambient from the sky's zenith and horizon colours. The march starts
//          at the slab's top, so pillars that sink into the clouds and near/far clouds slide against
//          each other as the camera moves (true parallax). Ultra 28 steps, high 16, off on low/phones.
// Noise comes from the shared pre-baked texture (render/noise.js). The height fog (render/fog.js)
// still applies on top, so the sea fades into the horizon haze.
import * as THREE from 'three';
import { SUN_DIRECTION } from './sky.js';
import { getNoiseTexture } from './noise.js';

const CLOUD_GLSL = /* glsl */`
  uniform sampler2D tNoise;
  uniform float uTime, uScale, uCover, uTop, uBottom;
  uniform vec2 uWind;
  // Height of the cloud top as a fraction of the slab thickness (0 = no cloud).
  float ftfCloudH(vec2 xz) {
    vec2 p = xz * uScale + uWind * uTime;
    float n1 = texture2D(tNoise, p).r;                 // large billows (about 70 m)
    float n2 = texture2D(tNoise, p * 2.9 + 0.31).b;    // cellular puffs
    float n3 = texture2D(tNoise, p * 7.0 + 0.67).g;    // fine detail
    float h = n1 * 0.7 + n2 * 0.22 + n3 * 0.08;
    float lo = 1.0 - uCover - 0.22, hi = 1.0 - uCover + 0.30;
    return smoothstep(lo, hi, h);
  }
  float ftfHg(float mu, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * 3.14159265 * pow(1.0 + g2 - 2.0 * g * mu, 1.5)); }
`;

function deckMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      tNoise: { value: getNoiseTexture() },
      uTime: { value: 0 }, uScale: { value: 0.0038 }, uCover: { value: 0.46 }, uTop: { value: 0 }, uBottom: { value: -28 },
      uWind: { value: new THREE.Vector2(0.04, 0.014) },
      uSunDir: { value: SUN_DIRECTION.clone() },
      uSunCol: { value: new THREE.Color(1, 0.85, 0.6) },
      uAmbUp: { value: new THREE.Color(0.5, 0.56, 0.62) },
      uAmbDown: { value: new THREE.Color(0.22, 0.25, 0.29) },
    }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform vec3 uSunDir, uSunCol, uAmbUp, uAmbDown;
      varying vec3 vWorld;
      ${CLOUD_GLSL}
      // The deck uses the soft billows alone: from 100 m up, fine detail aliases into a dotted texture.
      float ftfDeckH(vec2 xz) {
        vec2 p = xz * uScale + uWind * uTime;
        float h = texture2D(tNoise, p).r * 0.78 + texture2D(tNoise, p * 2.9 + 0.31).b * 0.22;
        return smoothstep(1.0 - uCover - 0.3, 1.0 - uCover + 0.3, h);
      }
      void main() {
        float h = ftfDeckH(vWorld.xz);
        // Finite-difference normal of the height field for a soft sun shading.
        float e = 6.0;
        float hx = ftfDeckH(vWorld.xz + vec2(e, 0.0)) - h, hz = ftfDeckH(vWorld.xz + vec2(0.0, e)) - h;
        vec3 nrm = normalize(vec3(-hx * 3.0, 1.0, -hz * 3.0));
        float ndl = clamp(dot(nrm, uSunDir), 0.0, 1.0);
        vec3 amb = mix(uAmbDown, uAmbUp, 0.35 + 0.65 * h);
        vec3 col = amb + uSunCol * ndl * (0.25 + 0.55 * h);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    fog: true, side: THREE.DoubleSide,
  });
}

function slabMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      tNoise: { value: getNoiseTexture() },
      uTime: { value: 0 }, uScale: { value: 0.0038 }, uCover: { value: 0.46 }, uTop: { value: -16 }, uBottom: { value: -28 },
      uWind: { value: new THREE.Vector2(0.04, 0.014) },
      uSteps: { value: 16 },
      uSunDir: { value: SUN_DIRECTION.clone() },
      uSunCol: { value: new THREE.Color(1, 0.85, 0.6) },
      uAmbUp: { value: new THREE.Color(0.5, 0.56, 0.62) },
      uAmbDown: { value: new THREE.Color(0.22, 0.25, 0.29) },
    }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform float uSteps;
      uniform vec3 uSunDir, uSunCol, uAmbUp, uAmbDown;
      varying vec3 vWorld;
      ${CLOUD_GLSL}
      float ftfDensity(vec3 p) {
        float top = uBottom + (uTop - uBottom) * ftfCloudH(p.xz);
        float d = (top - p.y) / (uTop - uBottom);
        return smoothstep(0.0, 0.38, d);
      }
      void main() {
        vec3 ro = cameraPosition;
        vec3 rd = normalize(vWorld - ro);
        if (rd.y > -0.002) discard; // looking up through the slab never happens; guard anyway
        float tEnter = length(vWorld - ro);
        float tExit = (uBottom - ro.y) / rd.y;
        float len = min(tExit - tEnter, 110.0);
        float steps = max(uSteps, 4.0);
        float ds = len / steps;
        // Per-pixel jitter breaks the step banding (static: no shimmer under reduced motion).
        float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        float mu = dot(rd, uSunDir);
        float phase = 0.65 * ftfHg(mu, 0.55) + 0.35 * ftfHg(mu, -0.18);
        float sigma = 0.55; // extinction per metre inside a cloud
        vec3 L = vec3(0.0);
        float T = 1.0;
        for (int i = 0; i < 32; i++) {
          if (float(i) >= steps || T < 0.02) break;
          vec3 p = vWorld + rd * ((float(i) + jitter) * ds);
          float d = ftfDensity(p);
          if (d < 0.01) continue;
          float sh = ftfDensity(p + uSunDir * 2.5) * 0.55 + ftfDensity(p + uSunDir * 7.0) * 0.45;
          float lit = exp(-sh * 1.7);
          float hfrac = clamp((p.y - uBottom) / (uTop - uBottom), 0.0, 1.0);
          vec3 amb = mix(uAmbDown, uAmbUp, hfrac);
          // Powder term: thin edges catch more light than the dense interior.
          float powder = 1.0 - 0.35 * exp(-d * 4.0);
          vec3 S = uSunCol * lit * phase * 3.0 * powder + amb * (0.7 + 0.3 * lit);
          float a = 1.0 - exp(-d * sigma * ds);
          L += T * S * a;
          T *= 1.0 - a;
        }
        float alpha = 1.0 - T;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(L / alpha, alpha);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
  });
}

export class CloudSea {
  /** @param {{level:number, radius?:number, thickness?:number}} o level = cloud base (m); thickness = slab height */
  constructor({ level, radius = 460, thickness = 12 }) {
    this.group = new THREE.Group();
    this.group.name = 'cloud_sea';
    this.level = level; this.thickness = thickness;
    const geo = new THREE.CircleGeometry(radius, 64);
    this.deck = new THREE.Mesh(geo, deckMaterial());
    this.deck.rotation.x = -Math.PI / 2; this.deck.position.y = level; this.deck.name = 'cloud_deck';
    this.deck.renderOrder = 0; this.deck.frustumCulled = false; this.deck.receiveShadow = false;
    this.slab = new THREE.Mesh(geo, slabMaterial());
    this.slab.rotation.x = -Math.PI / 2; this.slab.position.y = level + thickness; this.slab.name = 'cloud_slab';
    this.slab.renderOrder = -5; this.slab.frustumCulled = false; this.slab.receiveShadow = false;
    this.group.add(this.deck, this.slab);
    /** Both meshes, deck first (kept for callers that iterate the layers). */
    this.layers = [this.deck, this.slab];
    for (const m of this.layers) { m.material.uniforms.uBottom.value = level; m.material.uniforms.uTop.value = level + thickness; }
    this.time = 0;
  }

  /** Visible layers: 1 = the deck alone (low tier, phones), 2 = deck + raymarched slab. */
  setLayers(n) { this.slab.visible = n >= 2; }

  /** Raymarch step count (quality.js cloudSteps); 0 hides the slab. */
  setSteps(n) { this.slab.material.uniforms.uSteps.value = Math.min(32, Math.max(4, n || 0)); if (!n) this.slab.visible = false; }

  /**
   * Lighting from the sky (sky.js derived values, linear RGB): sun direction and radiance, the
   * zenith colour for lit tops, the horizon/fog colour for the shadowed bases.
   * @param {{sun:THREE.Vector3, sunRadiance:THREE.Color, zenith:THREE.Color, fogColor:THREE.Color, cover?:number}} atm
   */
  setLighting({ sun, sunRadiance, zenith, fogColor, cover }) {
    for (const m of this.layers) {
      const u = m.material.uniforms;
      u.uSunDir.value.copy(sun);
      u.uSunCol.value.copy(sunRadiance);
      u.uAmbUp.value.copy(zenith).lerp(fogColor, 0.4).multiplyScalar(1.05);
      u.uAmbDown.value.copy(fogColor).multiplyScalar(0.8);
      if (cover != null) u.uCover.value = cover;
    }
  }

  /** Advances the drift; pass dt = 0 under reduced motion. */
  update(dt) {
    this.time += dt;
    for (const l of this.layers) l.material.uniforms.uTime.value = this.time;
  }

  /** The sea follows the camera on the ground plane so its edge never shows. */
  follow(camera) { this.group.position.set(camera.position.x, 0, camera.position.z); }

  dispose() { for (const l of this.layers) l.material.dispose(); this.deck.geometry.dispose(); }
}
