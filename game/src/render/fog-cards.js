// Ground-fog cards in the town (owner, 11.11: "night: rolling ground fog layers near the walls and stairs; early
// morning: light ground mist in the lower streets"). A handful of soft, wide, low quads along the main street and
// stairs, turned to the camera around the vertical axis, drifting slowly with the wind. Their strength follows the
// hour (`look.mistCards`, render/sky.js) plus a little in rain; their colour is the scene fog's. Off on the low tier;
// held still under reduced motion. One shared material, no textures loaded (the softness is procedural).
import * as THREE from 'three';

const VS = /* glsl */`
  varying vec2 vUv; varying float vSeed;
  attribute float seed;
  void main() { vUv = uv; vSeed = seed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FS = /* glsl */`
  uniform vec3 uColor; uniform float uAmount, uTime;
  varying vec2 vUv; varying float vSeed;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec2 c = vUv - 0.5;
    float edge = smoothstep(0.5, 0.15, abs(c.x)) * smoothstep(0.5, 0.05, abs(c.y)) * smoothstep(0.0, 0.35, vUv.y + 0.1) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    vec2 p = vec2(vUv.x * 3.0 + uTime * 0.02 + vSeed * 7.0, vUv.y * 1.5 + vSeed * 3.0);
    float cloud = n(p) * 0.6 + n(p * 2.3 + 1.7) * 0.4;
    float a = edge * smoothstep(0.25, 0.85, cloud) * uAmount * 0.55;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

/**
 * @param {THREE.Scene} scene
 * @param {number[][]} points world-space ground points (the street and the stairs)
 * @param {{count?: number, width?: number, height?: number}} [o]
 */
export function createFogCards(scene, points, { count = 12, width = 9, height = 2.6 } = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0.6, 0.65, 0.72) }, uAmount: { value: 0 }, uTime: { value: 0 } },
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: false,
  });
  const group = new THREE.Group(); group.name = 'fog_cards'; group.visible = false;
  const cards = [];
  const n = Math.max(1, Math.min(count, points.length * 2));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n * (points.length - 1), j = Math.min(points.length - 2, Math.floor(t)), f = t - j;
    const a = points[j], b = points[j + 1];
    const side = (i % 2 ? 1 : -1) * (2.2 + (i * 0.37) % 1.6);
    const dx = b[2] - a[2], dz = -(b[0] - a[0]), dl = Math.hypot(dx, dz) || 1;
    const geo = new THREE.PlaneGeometry(width * (0.8 + ((i * 0.61) % 0.5)), height, 1, 1);
    geo.translate(0, height * 0.42, 0);
    geo.setAttribute('seed', new THREE.Float32BufferAttribute(new Array(4).fill((i * 0.137) % 1), 1));
    const m = new THREE.Mesh(geo, material);
    m.position.set(a[0] + (b[0] - a[0]) * f + dx / dl * side, a[1] + (b[1] - a[1]) * f - 0.2, a[2] + (b[2] - a[2]) * f + dz / dl * side);
    m.renderOrder = 5; m.frustumCulled = true;
    group.add(m); cards.push({ m, base: m.position.clone(), phase: i * 1.7 });
  }
  scene.add(group);
  return {
    group,
    /**
     * @param {number} t seconds @param {THREE.Camera} camera @param {number} amount 0..1 @param {THREE.Color} color
     * @param {{reducedMotion?: boolean, enabled?: boolean}} [o]
     */
    update(t, camera, amount, color, { reducedMotion = false, enabled = true } = {}) {
      const on = enabled && amount > 0.01;
      group.visible = on;
      if (!on) return;
      material.uniforms.uAmount.value = Math.min(1, amount);
      material.uniforms.uColor.value.copy(color).lerp(new THREE.Color(1, 1, 1), 0.12);
      if (!reducedMotion) material.uniforms.uTime.value = t;
      for (const c of cards) {
        const drift = reducedMotion ? 0 : Math.sin(t * 0.05 + c.phase) * 1.2;
        c.m.position.set(c.base.x + drift, c.base.y, c.base.z + drift * 0.4);
        c.m.rotation.y = Math.atan2(camera.position.x - c.m.position.x, camera.position.z - c.m.position.z);
      }
    },
    dispose() { scene.remove(group); material.dispose(); for (const c of cards) c.m.geometry.dispose(); },
  };
}
