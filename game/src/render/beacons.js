// Light beacons over the Shells (docs/visual-guidance.md): a soft gold column of light and a slow ring around a
// Shell that has a sign waiting, and a marker above the one the current goal points at. Presentation only: the
// levels come from play/beacon-plan.js, nothing here reads or changes a rule. Unlit and additive on the overlay
// layer (the ambient-occlusion pass never sees them); the bloom picks them up on the high tiers.
import * as THREE from 'three';
import { LAYER_OVERLAY } from './layers.js';
import { beaconStrength, BEACON_GOAL } from '../play/beacon-plan.js';

const GOLD = new THREE.Color(0xe4c272);
const COLUMN_HEIGHT = 46, COLUMN_BASE = 6;

function columnMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: GOLD.clone() }, uStrength: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vNormalV; varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uStrength, uTime; varying vec2 vUv; varying vec3 vNormalV; varying vec3 vViewDir;
      void main() {
        // Dense through the middle, gone at the silhouette: reads as a volume of light, not a tube.
        float facing = abs(dot(normalize(vNormalV), normalize(vViewDir)));
        float body = smoothstep(0.0, 0.85, facing);
        // Fades out with height and breathes upward slowly.
        float rise = pow(1.0 - vUv.y, 1.6) * smoothstep(0.0, 0.06, vUv.y);
        float drift = 0.82 + 0.18 * sin(vUv.y * 14.0 - uTime * 1.3);
        float a = body * rise * drift * uStrength;
        gl_FragColor = vec4(uColor * a * 1.15, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  });
}

function ringMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: GOLD.clone() }, uStrength: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uStrength, uTime; varying vec2 vUv;
      void main() {
        // RingGeometry: uv is the planar position; a soft band with a bright arc that travels around it.
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float band = smoothstep(0.86, 0.93, r) * (1.0 - smoothstep(0.95, 1.0, r));
        float arc = 0.55 + 0.45 * sin(atan(p.y, p.x) * 2.0 - uTime * 0.7);
        float a = band * arc * uStrength;
        gl_FragColor = vec4(uColor * a * 1.3, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  });
}

export class ShellBeacons {
  /** @param {{shells: {instance: {root: THREE.Object3D, def: {height:number, radius:number}}, index:number}[]}} o world3d.shells */
  constructor({ shells }) {
    this.items = [];
    this.time = 0;
    const columnGeo = new THREE.CylinderGeometry(1.6, 3.2, COLUMN_HEIGHT, 28, 1, true);
    const markGeo = new THREE.OctahedronGeometry(1, 0);
    for (const s of shells) {
      const { height = 18, radius = 10 } = s.instance.def || {};
      const group = new THREE.Group();
      group.name = 'shell_beacon_' + (s.index + 1);
      group.visible = false;
      const column = new THREE.Mesh(columnGeo, columnMaterial());
      column.position.y = COLUMN_BASE + COLUMN_HEIGHT / 2;
      const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.02, radius * 1.22, 72, 1), ringMaterial());
      ring.rotation.x = -Math.PI / 2; ring.position.y = height * 0.5;
      // The goal marker: a small gold diamond that hangs above the Shell the quest names.
      const mark = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: GOLD.clone().multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
      mark.scale.set(1.1, 1.9, 1.1); mark.position.y = height + 5;
      for (const m of [column, ring, mark]) { m.layers.set(LAYER_OVERLAY); m.frustumCulled = false; m.renderOrder = 4; }
      group.add(column, ring, mark);
      s.instance.root.add(group);
      this.items.push({ group, column, ring, mark, markY: mark.position.y, strength: 0, goal: 0, level: 0, phase: s.index * 1.7 });
    }
  }

  /** @param {number[]} levels per Shell I..IV (play/beacon-plan.js) */
  setLevels(levels) { this.items.forEach((it, i) => { it.level = levels[i] || 0; }); }

  /** Per frame; reduced motion keeps the light steady (no drift, no bob, no fade animation). */
  update(dt, reducedMotion = false) {
    if (!reducedMotion) this.time += dt;
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.2);
    for (const it of this.items) {
      it.strength += (beaconStrength(it.level) - it.strength) * k;
      it.goal += ((it.level === BEACON_GOAL ? 1 : 0) - it.goal) * k;
      const on = it.strength > 0.01;
      it.group.visible = on;
      if (!on) continue;
      const t = this.time + it.phase;
      it.column.material.uniforms.uStrength.value = it.strength;
      it.column.material.uniforms.uTime.value = t;
      it.ring.material.uniforms.uStrength.value = it.strength;
      it.ring.material.uniforms.uTime.value = t;
      it.mark.material.opacity = it.goal * 0.95;
      it.mark.visible = it.goal > 0.02;
      it.mark.position.y = it.markY + Math.sin(t * 1.6) * 0.7;
      it.mark.rotation.y = t * 0.8;
    }
  }

  dispose() {
    for (const it of this.items) {
      it.group.removeFromParent();
      for (const m of [it.column, it.ring, it.mark]) m.material.dispose();
      it.ring.geometry.dispose();
    }
    if (this.items[0]) { this.items[0].column.geometry.dispose(); this.items[0].mark.geometry.dispose(); }
    this.items = [];
  }
}

/**
 * The ground pointer: three gold chevrons on the ground ahead of Iris, running toward the place the goal names.
 * From the start balcony no Shell is on screen; this is the cue that is always in frame.
 */
export class GoalPointer {
  constructor({ scene }) {
    this.group = new THREE.Group();
    this.group.name = 'goal_pointer'; this.group.visible = false;
    this.time = 0; this.strength = 0; this.yaw = 0; this.hasYaw = false;
    // A chevron in the XZ plane pointing at +Z.
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.42); shape.lineTo(0.5, -0.1); shape.lineTo(0.5, -0.34); shape.lineTo(0, 0.18); shape.lineTo(-0.5, -0.34); shape.lineTo(-0.5, -0.1); shape.closePath();
    this.geometry = new THREE.ShapeGeometry(shape);
    this.geometry.rotateX(Math.PI / 2); // shape +Y becomes +Z, flat on the ground
    this.chevrons = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: GOLD.clone().multiplyScalar(1.5), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
      m.position.set(0, 0, 1.5 + i * 0.75);
      m.scale.setScalar(0.95 - i * 0.14);
      m.layers.set(LAYER_OVERLAY); m.renderOrder = 4;
      this.group.add(m);
      return m;
    });
    scene.add(this.group);
  }

  /**
   * @param {number} dt @param {number[]} ground Iris's position (feet) @param {{yaw:number, strength:number}} pose
   *   from play/beacon-plan.js pointerPose @param {boolean} reducedMotion steady chevrons, no running pulse
   */
  update(dt, ground, pose, reducedMotion = false) {
    if (!reducedMotion) this.time += dt;
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 4);
    this.strength += (pose.strength - this.strength) * k;
    const on = this.strength > 0.02;
    this.group.visible = on;
    if (!on) { this.hasYaw = false; return; }
    if (pose.strength > 0) {
      // Turn the short way round; snap when the pointer has just appeared.
      if (!this.hasYaw) { this.yaw = pose.yaw; this.hasYaw = true; }
      else { const d = Math.atan2(Math.sin(pose.yaw - this.yaw), Math.cos(pose.yaw - this.yaw)); this.yaw += d * (reducedMotion ? 1 : 1 - Math.exp(-dt * 8)); }
    }
    this.group.position.set(ground[0], ground[1] + 0.07, ground[2]);
    this.group.rotation.y = this.yaw;
    this.chevrons.forEach((m, i) => {
      const wave = reducedMotion ? 1 : 0.35 + 0.65 * Math.max(0, Math.sin(this.time * 3.2 - i * 0.9));
      m.material.opacity = this.strength * wave * 0.9;
    });
  }

  dispose() { this.group.removeFromParent(); this.geometry.dispose(); for (const m of this.chevrons) m.material.dispose(); }
}
