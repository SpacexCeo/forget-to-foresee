// The vortex disk (P9) and the time tunnel (P10) of the prologue (sprint plan 9.10). Never on screen together.
import * as THREE from 'three';

const NOISE = `float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }`;

/** A swirling disk: deep indigo, teal, a gold rim; radius 1 (scale it), additive, no depth write. */
export function buildVortexDisk() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uOpen: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime, uOpen; ${NOISE}
      void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard; float a = atan(p.y, p.x);
        float sw = a + uTime * 1.4 * (1.6 - r) + r * 5.0;
        float n = noise(vec2(sw * 1.3, r * 4.0 - uTime)) * 0.6 + noise(vec2(sw * 2.7, r * 9.0 + uTime * 1.7)) * 0.3 + noise(vec2(sw * 5.0, r * 17.0)) * 0.1;
        vec3 c = mix(vec3(0.08, 0.04, 0.23), vec3(0.18, 0.72, 0.69), n); c = mix(c, vec3(1.0, 0.78, 0.38), smoothstep(0.72, 1.0, r));
        c += vec3(1.0) * smoothstep(0.25, 0.0, r) * 0.8;
        gl_FragColor = vec4(c * (0.6 + n), uOpen * smoothstep(1.0, 0.86, r)); }`,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 64), mat); mesh.visible = false; mesh.renderOrder = 5;
  return { mesh, update(t, open, radius) { mesh.visible = open > 0.001; mat.uniforms.uTime.value = t; mat.uniforms.uOpen.value = open; mesh.scale.setScalar(radius); }, dispose() { mesh.geometry.dispose(); mat.dispose(); } };
}

/**
 * The tunnel: an inside-out cylinder with scrolling streaks, rings of light rushing past, and plates with the years
 * counting back from 2048. The camera sits on its axis looking down -Z.
 */
export function buildTunnel({ phone = false } = {}) {
  const root = new THREE.Group(); root.visible = false; const trash = [];
  const wallMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, uniforms: { uTime: { value: 0 }, uGold: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime, uGold; ${NOISE}
      void main(){ float along = vUv.y * 30.0 + uTime * 6.0; float n = noise(vec2(vUv.x * 40.0, along)) * 0.7 + noise(vec2(vUv.x * 90.0, along * 2.3)) * 0.3;
        float streak = smoothstep(0.55, 1.0, n); vec3 c = mix(vec3(0.05, 0.03, 0.16), mix(vec3(0.18, 0.72, 0.69), vec3(1.0, 0.78, 0.38), uGold), streak);
        gl_FragColor = vec4(c, 1.0); }`,
  }); trash.push(wallMat);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 90, 32, 1, true), wallMat); wall.rotation.x = Math.PI / 2; wall.position.z = -40; root.add(wall); trash.push(wall.geometry);
  const ringGeo = new THREE.TorusGeometry(3.7, 0.05, 6, 48), ringMat = new THREE.MeshBasicMaterial({ color: 0x9ff3ea }); trash.push(ringGeo, ringMat);
  const rings = []; for (let i = 0; i < 28; i++) { const r = new THREE.Mesh(ringGeo, ringMat); r.position.z = -i * 3; root.add(r); rings.push(r); }
  // year plates: canvas sprites, drawn once; the text is rewritten as they recycle
  const plates = []; const N = phone ? 5 : 10;
  for (let i = 0; i < N; i++) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; trash.push(tex);
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); trash.push(m);
    const s = new THREE.Sprite(m); s.scale.set(1.6, 0.8, 1); const a = i * 2.39996; s.position.set(Math.cos(a) * 2.4, Math.sin(a) * 2.4, -8 - i * 7); root.add(s); plates.push({ s, c, tex, year: null });
  }
  const label = (p, year) => { if (p.year === year) return; p.year = year; const g = p.c.getContext('2d'); g.clearRect(0, 0, 256, 128); g.strokeStyle = 'rgba(255,220,150,.9)'; g.lineWidth = 3; g.strokeRect(6, 6, 244, 116); g.fillStyle = '#ffe6b0'; g.font = 'bold 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(year), 128, 68); p.tex.needsUpdate = true; };
  return {
    root,
    /** k: 0..1 through the tunnel; speed in m/s. */
    update(t, k, speed = 18) {
      wallMat.uniforms.uTime.value = t; wallMat.uniforms.uGold.value = k;
      const travel = t * speed;
      for (let i = 0; i < rings.length; i++) rings[i].position.z = -((i * 3 - travel % 3 + 84) % 84) + 2;
      for (let i = 0; i < plates.length; i++) { const p = plates[i], span = plates.length * 7, z = -(((8 + i * 7 - travel) % span) + span) % span - 2; p.s.position.z = z; label(p, Math.max(1, Math.round(2048 * Math.pow(1 - Math.min(1, k * 0.999), 2.2) - i * 3))); p.s.material.opacity = Math.min(1, (-z - 2) / 6); }
    },
    dispose() { for (const x of trash) x.dispose(); },
  };
}
