// Overcast sky with a sun disc and god-ray-friendly bright patch (owner concept 07.11: soft grey-blue
// overcast, warm light breaking through, a sea of clouds below the horizon). One shader dome; the
// same dome is rendered into a PMREM cubemap so image-based lighting matches what the camera sees.
import * as THREE from 'three';

/** Sun direction (towards the sun, world space): high and in front-left of the default +Z view so the shafts land in frame. */
export const SUN_DIRECTION = Object.freeze(new THREE.Vector3(-0.58, 0.50, -0.52).normalize());
export const SUN_COLOR = 0xffe9cf;
/** Horizon haze colour; the distance and height fog use it too. */
export const HAZE_COLOR = 0x9aa8b0;

const NOISE = /* glsl */`
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; }
    return v;
  }
`;

export const SKY_SHADER = {
  uniforms: {
    uSunDir: { value: SUN_DIRECTION.clone() },
    uZenith: { value: new THREE.Color(0x5e7384) },
    uHorizon: { value: new THREE.Color(HAZE_COLOR) },
    uCloudLit: { value: new THREE.Color(0xd9dfe0) },
    uCloudDark: { value: new THREE.Color(0x76858f) },
    uSunColor: { value: new THREE.Color(SUN_COLOR) },
    uBelow: { value: new THREE.Color(0xc6ced0) },
    uTime: { value: 0 },
    uCover: { value: 0.62 },
    uSunDisc: { value: 7.0 },
  },
  vertexShader: /* glsl */`
    varying vec3 vDir;
    void main() {
      vDir = position; // the dome is a unit sphere centered on the camera: local position = view direction
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      gl_Position.z = gl_Position.w; // always at the far plane
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uSunDir, uZenith, uHorizon, uCloudLit, uCloudDark, uSunColor, uBelow;
    uniform float uTime, uCover, uSunDisc;
    varying vec3 vDir;
    ${NOISE}
    void main() {
      vec3 d = normalize(vDir);
      float up = d.y;
      // Clear-sky gradient: pale haze at the horizon, cool grey-blue overhead.
      float t = pow(clamp(up, 0.0, 1.0), 0.45);
      vec3 sky = mix(uHorizon, uZenith, t);
      float sunDot = max(dot(d, uSunDir), 0.0);
      // Cloud cover sampled on a sky plane (flattens near the horizon like a real cloud deck).
      vec2 cp = d.xz / max(up + 0.12, 0.02);
      float n = fbm(cp * 1.4 + vec2(uTime * 0.004, uTime * 0.0015));
      float cover = smoothstep(1.0 - uCover - 0.25, 1.0 - uCover + 0.2, n);
      float thick = smoothstep(0.35, 0.95, n);
      // Clouds are lit from the sun side: thin edges glow, thick cores go dark.
      vec3 cloud = mix(uCloudLit, uCloudDark, thick * 0.85);
      cloud += uSunColor * pow(sunDot, 6.0) * (1.0 - thick) * 0.45;
      float horizonFade = smoothstep(0.0, 0.18, up);
      vec3 col = mix(sky, cloud, cover * horizonFade);
      // Warm scatter around the sun and a soft disc that reads through the thin clouds.
      col += uSunColor * (pow(sunDot, 24.0) * 0.35 + pow(sunDot, 180.0) * 0.9 * (1.0 - thick * 0.8));
      col += uSunColor * uSunDisc * smoothstep(0.9993, 0.9998, sunDot) * (1.0 - thick * 0.9);
      // Below the horizon: the sea of clouds, brightest right under the horizon.
      vec3 below = mix(uBelow * 0.85, uHorizon, smoothstep(-0.35, 0.0, up));
      col = mix(below, col, smoothstep(-0.02, 0.03, up));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

export class SkyDome {
  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SKY_SHADER.uniforms),
      vertexShader: SKY_SHADER.vertexShader,
      fragmentShader: SKY_SHADER.fragmentShader,
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material);
    this.mesh.name = 'sky_dome';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    this.mesh.scale.setScalar(450);
    this.mesh.matrixAutoUpdate = true;
  }

  /** Keeps the dome centered on the camera (its vertex shader pins it to the far plane). */
  follow(camera) { this.mesh.position.copy(camera.position); }

  setTime(t) { this.material.uniforms.uTime.value = t; }

  /**
   * Bakes the dome into a PMREM environment map. Call once (and again if the sky colours change);
   * the result is a texture the caller assigns to scene.environment.
   */
  bakeEnvironment(renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const sc = new THREE.Scene();
    const m = new THREE.Mesh(this.mesh.geometry, this.material);
    m.scale.setScalar(450);
    sc.add(m);
    const rt = pmrem.fromScene(sc, 0, 0.1, 1000);
    pmrem.dispose();
    return rt.texture;
  }
}
