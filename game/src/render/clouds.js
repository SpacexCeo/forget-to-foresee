// Sea of clouds below the archipelago (owner concept 07.11): one lit, opaque deck at CLOUD_LEVEL
// plus optional translucent drift layers above it, so the rock pillars sink into moving mist.
// Noise is evaluated in the fragment shader (no textures); each layer is one draw call. The height
// fog (render/fog.js) still applies on top, so the deck blends into the horizon haze.
import * as THREE from 'three';
import { SUN_DIRECTION } from './sky.js';

const NOISE = /* glsl */`
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(7.3, 3.1); a *= 0.5; }
    return v;
  }
`;

function cloudMaterial({ opaque, scale, speed, lit, dark, alphaLow, alphaHigh }) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uSunDir: { value: SUN_DIRECTION.clone() },
      uLit: { value: new THREE.Color(lit) },
      uDark: { value: new THREE.Color(dark) },
      uScale: { value: scale },
      uSpeed: { value: speed },
      uAlpha: { value: new THREE.Vector2(alphaLow, alphaHigh) },
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
      uniform float uTime, uScale, uSpeed;
      uniform vec3 uSunDir, uLit, uDark;
      uniform vec2 uAlpha;
      varying vec3 vWorld;
      ${NOISE}
      void main() {
        vec2 p = vWorld.xz * uScale + vec2(uTime * uSpeed, uTime * uSpeed * 0.35);
        float n = fbm(p);
        float n2 = fbm(p * 2.7 + 11.0);
        float h = n * 0.75 + n2 * 0.25;
        // Finite-difference normal of the height field for a soft sun shading.
        float e = 0.08;
        float hx = fbm(p + vec2(e, 0.0)) - n, hz = fbm(p + vec2(0.0, e)) - n;
        vec3 nrm = normalize(vec3(-hx * 6.0, 1.0, -hz * 6.0));
        float ndl = clamp(dot(nrm, uSunDir), 0.0, 1.0);
        vec3 col = mix(uDark, uLit, 0.35 + 0.65 * ndl) * (0.82 + 0.3 * h);
        float alpha = ${opaque ? '1.0' : 'smoothstep(uAlpha.x, uAlpha.y, h)'};
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: !opaque, depthWrite: opaque, fog: true, side: THREE.DoubleSide,
  });
}

export class CloudSea {
  /** @param {{level:number, radius?:number}} o */
  constructor({ level, radius = 460 }) {
    this.group = new THREE.Group();
    this.group.name = 'cloud_sea';
    this.layers = [];
    const geo = new THREE.CircleGeometry(radius, 64);
    const specs = [
      { y: 0, opaque: true, scale: 0.012, speed: 0.08, lit: 0xd3dadb, dark: 0x66747f },
      { y: 3.5, opaque: false, scale: 0.02, speed: 0.14, lit: 0xdde3e4, dark: 0x9aa7ad, alphaLow: 0.48, alphaHigh: 0.78 },
      { y: 7.5, opaque: false, scale: 0.03, speed: 0.22, lit: 0xe4e8e8, dark: 0xaeb9bd, alphaLow: 0.55, alphaHigh: 0.85 },
    ];
    for (const s of specs) {
      const m = new THREE.Mesh(geo, cloudMaterial(s));
      m.rotation.x = -Math.PI / 2; m.position.y = level + s.y; m.name = 'cloud_layer';
      m.renderOrder = s.opaque ? 0 : -5; m.frustumCulled = false; m.receiveShadow = false;
      this.group.add(m); this.layers.push(m);
    }
    this.time = 0;
  }

  /** Number of visible layers (1 = only the opaque deck). */
  setLayers(n) { this.layers.forEach((l, i) => { l.visible = i < n; }); }

  /** Advances the drift; pass dt = 0 under reduced motion. */
  update(dt) {
    this.time += dt;
    for (const l of this.layers) l.material.uniforms.uTime.value = this.time;
  }

  /** The deck follows the camera on the ground plane so its edge never shows. */
  follow(camera) { this.group.position.set(camera.position.x, 0, camera.position.z); }
}
