// The tournament Shells feel alive (owner, 14.11): a soft glow as if the spire were lit from within, motes drifting
// up around it, and a slow pulse of light climbing the suture. Presentation only, no rule is read or changed.
// Cheap: per Shell three draw calls (one spindle, one ribbon, one point cloud), all additive and unlit on the overlay
// layer (out of the ambient-occlusion pass), animated in the shaders: nothing is rebuilt or uploaded per frame.
// Phones and the low tier get fewer motes and no glow spindle. Reduced motion: the light holds still.
// The shapes come from render/shell-curve.js, the model's own analytic curve, so they sit on the real spire.
import * as THREE from 'three';
import { LAYER_OVERLAY } from './layers.js';
import { SHELL, sutureSamples, spireRadius } from './shell-curve.js';

/** What the aura draws per quality: motes per Shell, whether the glow spindle is drawn, suture samples per whorl. */
export const SHELL_AURA = Object.freeze({
  full: Object.freeze({ motes: 56, glow: true, perWhorl: 40 }),
  lite: Object.freeze({ motes: 20, glow: false, perWhorl: 24 }),
  color: 0xffe2b0,          // warm pearl: the Shell's own light
  pulse: 0xfff0d2,
  glowStrength: 0.16, pulseStrength: 0.9, moteStrength: 0.85,
  pulsePeriod: 9,           // seconds for one pulse to climb a whorl's worth of suture
  whorls: 11,               // how far up the suture the ribbon runs (the apex whorls are too small to read)
});

/** A spindle that hugs the spire a little outside its surface (LatheGeometry profile, bottom to top). */
export function glowProfile(steps = 28, swell = 1.14, pad = 0.25) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const y = (i / steps) * SHELL.HEIGHT;
    pts.push([i === 0 || i === steps ? 0 : spireRadius(y) * swell + pad, y]);
  }
  return pts;
}

function glowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(SHELL_AURA.color) }, uStrength: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying float vH;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vH = position.y / ${SHELL.HEIGHT.toFixed(1)};
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uStrength, uTime; varying vec3 vN; varying vec3 vV; varying float vH;
      void main() {
        // dense where we look through the middle of the spire, gone at its outline: light inside, not a painted skin
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float body = pow(smoothstep(0.05, 0.95, facing), 1.6);
        float breathe = 0.86 + 0.14 * sin(uTime * 0.55 + vH * 5.0);
        float a = body * breathe * (0.55 + 0.45 * smoothstep(0.0, 0.5, vH)) * uStrength;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    // both sides: the far half is behind the Shell and fails the depth test, so only the near half adds light
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  });
}

function sutureMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(SHELL_AURA.pulse) }, uStrength: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec2 aUv; varying vec2 vUv;
      void main() { vUv = aUv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uStrength, uTime; varying vec2 vUv;
      void main() {
        // vUv.x: turns from the aperture; vUv.y: across the ribbon. A faint steady thread, and a soft pulse that
        // climbs it one whorl per period, three of them on the spire at a time.
        float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
        float ph = fract(vUv.x / 3.6 - uTime / (${SHELL_AURA.pulsePeriod.toFixed(1)} * 3.6));
        float pulse = exp(-pow((ph - 0.5) * 9.0, 2.0));
        float ends = smoothstep(0.0, 0.5, vUv.x) * (1.0 - smoothstep(${(SHELL_AURA.whorls - 2).toFixed(1)}, ${SHELL_AURA.whorls.toFixed(1)}, vUv.x));
        float a = pow(across, 1.5) * (0.10 + 0.90 * pulse) * ends * uStrength;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

function moteMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(SHELL_AURA.color) }, uStrength: { value: 0 }, uTime: { value: 0 }, uPx: { value: 1 } },
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime, uPx; varying float vTw;
      void main() {
        // each mote circles the spire slowly and rises, wrapping from the top back to the foot; the path narrows
        // with the spire. All of it from one seed per point: nothing is uploaded per frame.
        float rise = fract(aSeed.w + uTime * (0.006 + 0.010 * aSeed.y));
        float y = rise * ${(SHELL.HEIGHT * 1.08).toFixed(2)};
        float taper = mix(1.0, 0.22, smoothstep(0.15, 1.0, rise));
        float ang = aSeed.x * 6.2832 + uTime * (0.05 + 0.09 * aSeed.z) + sin(uTime * 0.3 + aSeed.w * 20.0) * 0.25;
        float rad = (2.9 + 3.4 * aSeed.z) * taper + 0.35 * sin(uTime * 0.4 + aSeed.x * 12.0);
        vec3 p = vec3(cos(ang) * rad, y, sin(ang) * rad);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vTw = (0.45 + 0.55 * sin(uTime * (0.8 + aSeed.y * 1.4) + aSeed.x * 40.0)) * smoothstep(0.0, 0.06, rise) * (1.0 - smoothstep(0.9, 1.0, rise));
        gl_PointSize = uPx * (0.10 + 0.16 * aSeed.y) * 300.0 / max(1.0, -mv.z);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uStrength; varying float vTw;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 2.2) * vTw * uStrength;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  });
}

/** The suture ribbon: two vertices per sample, across the groove (up and down the axis), a little out of it. */
function sutureGeometry(perWhorl) {
  const samples = sutureSamples({ whorls: SHELL_AURA.whorls, perWhorl, lift: 0.07 });
  const pos = new Float32Array(samples.length * 6), uv = new Float32Array(samples.length * 4), idx = [];
  samples.forEach((s, i) => {
    const half = 0.11 * s.g + 0.012; // the thread is as wide as the whorl is big
    pos.set([s.p[0], s.p[1] - half, s.p[2], s.p[0], s.p[1] + half, s.p[2]], i * 6);
    uv.set([s.u, 0, s.u, 1], i * 4);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aUv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function moteGeometry(count, seed) {
  // a small deterministic generator: the same Shell always carries the same motes
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seeds[i] = rnd();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, SHELL.HEIGHT / 2, 0), SHELL.HEIGHT);
  return g;
}

export class ShellAura {
  /**
   * @param {{shells: {instance: {root: THREE.Object3D}, index: number}[], lite?: boolean, pixelRatio?: number}} o
   *        world3d.shells; `lite` for phones and the low tier
   */
  constructor({ shells, lite = false, pixelRatio = 1 }) {
    this.items = [];
    this.time = 0;
    this.strength = 0;   // fades in once, so the light does not pop when the Shells stream in
    this.enabled = true;
    const q = lite ? SHELL_AURA.lite : SHELL_AURA.full;
    const glowGeo = q.glow ? new THREE.LatheGeometry(glowProfile().map(([r, y]) => new THREE.Vector2(r, y)), 24) : null;
    const sutureGeo = sutureGeometry(q.perWhorl);
    this.shared = [glowGeo, sutureGeo].filter(Boolean);
    for (const s of shells) {
      const group = new THREE.Group();
      group.name = 'shell_aura_' + (s.index + 1);
      const parts = [];
      if (glowGeo) parts.push(new THREE.Mesh(glowGeo, glowMaterial()));
      parts.push(new THREE.Mesh(sutureGeo, sutureMaterial()));
      const motes = new THREE.Points(moteGeometry(q.motes, s.index + 1), moteMaterial());
      motes.material.uniforms.uPx.value = pixelRatio;
      parts.push(motes);
      for (const m of parts) { m.layers.set(LAYER_OVERLAY); m.frustumCulled = false; m.renderOrder = 3; }
      group.add(...parts);
      s.instance.root.add(group);
      this.items.push({ group, parts, glow: glowGeo ? parts[0] : null, suture: parts[glowGeo ? 1 : 0], motes, phase: s.index * 2.3 });
    }
  }

  /** Off switch (feature flag, a film that wants the Shells plain). */
  setEnabled(on) { this.enabled = !!on; }

  /** Per frame; reduced motion holds the time still (a steady glow, the pulse and the motes at rest). */
  update(dt, reducedMotion = false) {
    if (!reducedMotion) this.time += dt;
    this.strength += ((this.enabled ? 1 : 0) - this.strength) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 1.2));
    const on = this.strength > 0.01;
    for (const it of this.items) {
      it.group.visible = on;
      if (!on) continue;
      const t = this.time + it.phase;
      if (it.glow) { it.glow.material.uniforms.uStrength.value = SHELL_AURA.glowStrength * this.strength; it.glow.material.uniforms.uTime.value = t; }
      it.suture.material.uniforms.uStrength.value = SHELL_AURA.pulseStrength * this.strength; it.suture.material.uniforms.uTime.value = t;
      it.motes.material.uniforms.uStrength.value = SHELL_AURA.moteStrength * this.strength; it.motes.material.uniforms.uTime.value = t;
    }
  }

  dispose() {
    for (const it of this.items) {
      it.group.removeFromParent();
      for (const m of it.parts) m.material.dispose();
      it.motes.geometry.dispose();
    }
    for (const g of this.shared) g.dispose();
    this.items = [];
  }
}
