// The Glass Resonator (sprint plan 9.7): a stone-and-brass plinth, a ring with a turning glyph band and a glass pane
// that fills with light: an echo of the town's Gate-Loom, so the two read as one invention. States by `power` 0..1:
// dormant (0) -> armed -> humming -> open (1). Built facing +Z; the lab turns it to face the room.
import * as THREE from 'three';

export function buildDevice() {
  const root = new THREE.Group(); root.name = 'resonator'; const trash = [];
  const stone = new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 0.9 }), brass = new THREE.MeshStandardMaterial({ color: 0xb08a3e, roughness: 0.35, metalness: 0.8 }); trash.push(stone, brass);
  const add = (geo, m, y) => { trash.push(geo); const o = new THREE.Mesh(geo, m); o.position.y = y; root.add(o); return o; };
  add(new THREE.CylinderGeometry(0.95, 1.05, 0.3, 24), stone, 0.15); add(new THREE.CylinderGeometry(0.8, 0.8, 0.04, 24), brass, 0.32);
  const ring = add(new THREE.TorusGeometry(1.04, 0.06, 12, 64), brass, 1.5);
  // the glyph band: a data texture of bars and dots, turning inside the ring
  const W = 128, data = new Uint8Array(W * 4 * 4); let s = 5; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let x = 0; x < W; x++) { const on = rnd() > 0.45, tall = rnd() > 0.5; for (let y = 0; y < 4; y++) { const v = on && (tall || y === 1 || y === 2) ? 255 : 0, i = (y * W + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255; } }
  const glyphs = new THREE.DataTexture(data, W, 4, THREE.RGBAFormat); glyphs.wrapS = THREE.RepeatWrapping; glyphs.magFilter = THREE.NearestFilter; glyphs.needsUpdate = true; trash.push(glyphs);
  const bandMat = new THREE.MeshBasicMaterial({ map: glyphs, color: 0x7fe6dc, transparent: true, opacity: 0.25, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }); trash.push(bandMat);
  const band = add(new THREE.CylinderGeometry(0.96, 0.96, 0.1, 64, 1, true), bandMat, 1.5); band.rotation.x = Math.PI / 2;
  const paneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime, uPower;
      void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
        float a = atan(p.y, p.x); float swirl = 0.5 + 0.5 * sin(a * 3.0 + r * 9.0 - uTime * 2.2);
        vec3 pale = mix(vec3(0.55, 0.75, 0.85), vec3(1.0, 0.92, 0.7), uPower);
        float glow = mix(0.10, 1.0, uPower) * (0.55 + 0.45 * swirl) * (1.0 - r * r * 0.6);
        gl_FragColor = vec4(pale * (0.25 + glow), 0.18 + 0.75 * uPower * (1.0 - r * 0.4)); }`,
  }); trash.push(paneMat);
  const pane = add(new THREE.CircleGeometry(0.98, 48), paneMat, 1.5);
  const light = new THREE.PointLight(0xbfe8ff, 0, 9, 2); light.position.set(0, 1.5, 0.3); root.add(light);
  let spin = 0;
  return {
    root, ring, pane, light,
    /** power 0..1: the band spins up to 1.5 turns a second, the pane fills with light. */
    update(dt, t, power) {
      spin += dt * power * 1.5 * Math.PI * 2; band.rotation.y = spin; bandMat.opacity = 0.25 + 0.75 * power;
      paneMat.uniforms.uTime.value = t; paneMat.uniforms.uPower.value = power; light.intensity = 7 * power; // a cool light: at arm's length a warm 11 turned her black jacket olive (QA 14.11)
      light.color.setRGB(0.72 + 0.12 * power, 0.9, 1.0 - 0.08 * power);
    },
    dispose() { for (const x of trash) x.dispose(); },
  };
}
