// Doors that lead inside glow (owner 12.11: "the houses that have an interior: light up their door"). Exactly the
// doors the walk-in code enters (town-layout.js TOWN_SHOPS, the same list shopDoorAt() reads), never a hand-picked
// one: a soft warm-gold frame over the door and a faint pool of light on the ground in front of it, slowly breathing,
// readable from across the square by day and by night, brighter when the heroine stands inside the door's enter
// radius. Cheap on phones: two instanced meshes with one shared shader, additive, no post-processing pass.
import * as THREE from 'three';
import { TOWN_SHOPS } from './town-layout.js';
import { LAYER_OVERLAY } from '../render/layers.js';

/** Look of the glow. Sizes in metres. The door point of the data is where Iris stands to enter, about a metre out on
 *  the street (the door leaf is ~1.2 m in, the wall above it ~1.0 m: measured by ray in the town); the frame stands
 *  `inset` m in from it, just proud of the wall. */
export const DOOR_GLOW = Object.freeze({
  color: 0xffc56e, width: 1.5, height: 2.45, inset: 0.95, lift: 0.02,
  pool: 2.6,                // diameter of the light pool on the ground
  base: 0.5, near: 1.0,     // brightness from afar and inside the enter radius
  dayBoost: 0.35,           // extra by daylight so the frame still reads against sunlit walls
  pulse: 0.18, period: 2.6, // breathing amplitude and seconds
  ease: 4,                  // 1/s: how fast the near-boost comes and goes
});

/** One glow per interior door: {id, position (on the door leaf), heading, radius (the enter radius)}. Pure. */
export function doorGlowSpots(shops = TOWN_SHOPS, o = DOOR_GLOW) {
  return shops.filter((s) => s && s.door && s.piece).map((s) => {
    const h = s.door.heading, p = s.door.position;
    return Object.freeze({ id: s.id, heading: h, radius: s.door.radius, door: p,
      position: Object.freeze([p[0] + Math.sin(h) * o.inset, p[1], p[2] + Math.cos(h) * o.inset]) });
  });
}

const VERT = /* glsl */`
  attribute float aLevel;
  varying vec2 vUv; varying float vLevel;
  void main() {
    vUv = uv; vLevel = aLevel;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
  }`;
const FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uTime, uPulse, uPeriod, uPool;
  varying vec2 vUv; varying float vLevel;
  void main() {
    float breathe = 1.0 + uPulse * sin( 6.2831853 * uTime / uPeriod );
    float a;
    if ( uPool > 0.5 ) {                                   // the light pool: a soft disc, brightest at the threshold
      vec2 q = vUv * 2.0 - 1.0; q.y = q.y * 1.35 + 0.3;
      a = 0.3 * pow( max( 0.0, 1.0 - dot( q, q ) ), 1.6 );
    } else {                                               // the frame: a glowing rim around the door, a faint fill
      vec2 e = min( vUv, 1.0 - vUv ) * vec2( 1.5, 2.45 );  // metres to the nearest edge (width, height)
      float edge = min( e.x, vUv.y < 0.5 ? 9.0 : e.y );    // no rim along the threshold
      float rim = exp( - edge * 9.0 ) * 0.7 + exp( - edge * 3.0 ) * 0.12;   // a hand-wide band, readable across the square
      float fill = smoothstep( 0.0, 0.25, vUv.y ) * ( 1.0 - smoothstep( 0.85, 1.0, vUv.y ) );
      a = rim + 0.03 * fill;
    }
    a *= vLevel * breathe;
    if ( a < 0.002 ) discard;
    gl_FragColor = vec4( uColor * a, 1.0 );   // additive is SRC_ALPHA, ONE: alpha 1 adds the colour
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/**
 * @param {{scene: THREE.Scene, shops?: object[], reducedMotion?: () => boolean, daylight?: () => number}} o
 *   daylight: 0..1, how sunlit the street is (the glow is lifted a little against bright walls)
 */
export function createDoorGlow({ scene, shops = TOWN_SHOPS, reducedMotion = () => false, daylight = () => 0.5 }) {
  const O = DOOR_GLOW, spots = doorGlowSpots(shops, O), n = spots.length;
  const group = new THREE.Group(); group.name = 'door_glow';
  const uniforms = { uColor: { value: new THREE.Color(O.color) }, uTime: { value: 0 }, uPulse: { value: O.pulse }, uPeriod: { value: O.period }, uPool: { value: 0 } };
  const make = (pool) => new THREE.ShaderMaterial({ uniforms: { ...uniforms, uPool: { value: pool ? 1 : 0 } }, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: true });
  const level = new Float32Array(n), near = new Float32Array(n);
  const frameGeo = new THREE.PlaneGeometry(O.width, O.height); frameGeo.translate(0, O.height / 2, 0);
  const poolGeo = new THREE.PlaneGeometry(O.pool, O.pool); poolGeo.rotateX(-Math.PI / 2);
  for (const g of [frameGeo, poolGeo]) g.setAttribute('aLevel', new THREE.InstancedBufferAttribute(level, 1));
  const frames = new THREE.InstancedMesh(frameGeo, make(false), Math.max(1, n));
  const pools = new THREE.InstancedMesh(poolGeo, make(true), Math.max(1, n));
  frames.count = pools.count = n; frames.name = 'door_glow_frames'; pools.name = 'door_glow_pools';
  frames.renderOrder = pools.renderOrder = 2; frames.frustumCulled = pools.frustumCulled = false;
  frames.layers.set(LAYER_OVERLAY); pools.layers.set(LAYER_OVERLAY);   // like the rain: kept out of the occlusion g-buffer
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  spots.forEach((s, i) => {
    q.setFromAxisAngle(up, s.heading);
    m.compose(new THREE.Vector3(s.position[0], s.position[1] + O.lift, s.position[2]), q, one);
    frames.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(s.door[0] + Math.sin(s.heading) * (O.inset - O.pool * 0.3), s.door[1] + O.lift, s.door[2] + Math.cos(s.heading) * (O.inset - O.pool * 0.3)), q, one);   // the pool lies on the street in front
    pools.setMatrixAt(i, m);
  });
  frames.instanceMatrix.needsUpdate = pools.instanceMatrix.needsUpdate = true;
  group.add(pools, frames); scene.add(group);

  return {
    group, spots,
    /** Brightness of each door 0.. (tests, QA). */
    get levels() { return Array.from(level); },
    /** Per frame: breathing, the near-boost for the door she stands at, a lift by daylight. */
    update(dt, playerPos, visible = true) {
      group.visible = visible; if (!visible) return;
      if (!reducedMotion()) { uniforms.uTime.value += dt; }
      frames.material.uniforms.uTime.value = pools.material.uniforms.uTime.value = uniforms.uTime.value;
      frames.material.uniforms.uPulse.value = pools.material.uniforms.uPulse.value = reducedMotion() ? 0 : O.pulse;
      const day = Math.max(0, Math.min(1, daylight()));
      const k = 1 - Math.exp(-O.ease * dt);
      spots.forEach((s, i) => {
        const inside = playerPos && Math.hypot(playerPos[0] - s.door[0], playerPos[2] - s.door[2]) <= s.radius && Math.abs(playerPos[1] - s.door[1]) <= 2;
        near[i] += ((inside ? 1 : 0) - near[i]) * k;
        level[i] = O.base + (O.near - O.base) * near[i] + O.dayBoost * day;
      });
      frameGeo.attributes.aLevel.needsUpdate = true; poolGeo.attributes.aLevel.needsUpdate = true;
    },
    dispose() { scene.remove(group); frameGeo.dispose(); poolGeo.dispose(); frames.material.dispose(); pools.material.dispose(); },
  };
}
