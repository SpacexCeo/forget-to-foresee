// Blob shadows: a soft dark disc under each character's feet (docs/atmosphere.md). The sun's shadow map gives
// characters a cast shadow in sunlight; in the shade, under an overcast sky, and on phones (no ambient
// occlusion pass, a coarser shadow map) nothing would tie their feet to the ground. One instanced draw call for
// all of them, no light, no shadow map; it fades with distance and never appears on the ambient-occlusion pass.
//
//   const id = lookdev.blobs.track(object3D, { radius: 0.42 })   feet at the object's origin
//   lookdev.blobs.untrack(object3D)
// Options: radius (m), strength (0..1), lift (m above the origin), visible: () => boolean (e.g. not while flying).
import * as THREE from 'three';
import { LAYER_OVERLAY } from './layers.js';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

export class BlobShadows {
  /** @param {{capacity?: number}} o */
  constructor({ capacity = 48 } = {}) {
    this.capacity = capacity;
    this.items = [];
    this.strength = 0.4;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uStrength: { value: this.strength }, uFade: { value: new THREE.Vector2(35, 60) } },
      vertexShader: /* glsl */`
        varying vec2 vQ; varying float vDist;
        void main() {
          vQ = uv * 2.0 - 1.0;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
          vDist = - mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uStrength; uniform vec2 uFade; varying vec2 vQ; varying float vDist;
        void main() {
          float r = dot( vQ, vQ );
          if ( r > 1.0 ) discard;
          float a = ( 1.0 - r ) * ( 1.0 - r ) * uStrength * ( 1.0 - smoothstep( uFade.x, uFade.y, vDist ) );
          gl_FragColor = vec4( 0.02, 0.025, 0.04, a );
        }`,
      transparent: true, depthWrite: false, fog: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), this.material, capacity);
    this.mesh.name = 'blob_shadows'; this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.layers.set(LAYER_OVERLAY);
  }

  /** @param {THREE.Object3D} object @param {{radius?: number, strength?: number, lift?: number, visible?: () => boolean}} [o] */
  track(object, { radius = 0.42, strength = 1, lift = 0.03, visible = null } = {}) {
    if (!object || this.items.some((i) => i.object === object)) return object;
    if (this.items.length < this.capacity) this.items.push({ object, radius, strength, lift, visible });
    return object;
  }

  untrack(object) { const i = this.items.findIndex((x) => x.object === object); if (i >= 0) this.items.splice(i, 1); }

  /** Tier knob: 0 hides the draw call. */
  setStrength(s) { this.strength = Math.max(0, Number(s) || 0); this.material.uniforms.uStrength.value = this.strength; }

  /** Per frame, no allocations. Objects that left the scene or are hidden are skipped. */
  update() {
    let n = 0;
    if (this.strength > 0) {
      for (const it of this.items) {
        const o = it.object;
        if (!o.parent || !o.visible || (it.visible && !it.visible())) continue;
        o.getWorldPosition(_p); _p.y += it.lift;
        const r = it.radius * (0.6 + 0.4 * it.strength);
        _m.compose(_p, FLAT, _s.set(r, r, r));
        this.mesh.setMatrixAt(n++, _m);
      }
    }
    void _q;
    this.mesh.count = n; this.mesh.visible = n > 0;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
}
