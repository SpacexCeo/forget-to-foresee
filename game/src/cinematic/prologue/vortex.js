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
        c += vec3(0.6, 0.8, 1.0) * smoothstep(0.1, 0.0, r) * 0.5;
        float arms = pow(0.5 + 0.5 * sin(sw * 4.0 - r * 6.0), 3.0);   // spiral arms that read as a whirl, not a white disc
        gl_FragColor = vec4(c * (0.15 + 0.35 * n + 0.45 * arms), uOpen * smoothstep(1.0, 0.86, r) * (0.55 + 0.45 * arms)); }`,
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

/**
 * Around the open vortex (owner, 14.11: "more fashionable effects"): sparks spiralling in from the room, a white-hot
 * core, and lightning arcs that jump from the rim to the centre. Built in the disk's own frame (unit radius, facing
 * +z); the prologue places it with the disk.
 */
export function buildVortexFx({ phone = false } = {}) {
  const root = new THREE.Group(); root.visible = false; const trash = [];
  const N = phone ? 500 : 1600;
  const seed = new Float32Array(N * 4); let s = 9; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < N; i++) seed.set([rnd() * Math.PI * 2, 0.4 + rnd() * 1.4, rnd(), 0.5 + rnd()], i * 4);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4)); trash.push(geo);
  const sparkMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `attribute vec4 aSeed; uniform float uTime, uOpen, uPx; varying float vK; varying float vHot;
      void main(){ float k = fract(aSeed.z + uTime * 0.22 * aSeed.w); float r = aSeed.y * pow(1.0 - k, 1.6);
        float a = aSeed.x + k * 7.0 * aSeed.w + uTime * 0.6; vec3 p = vec3(cos(a) * r, sin(a) * r, (1.0 - k) * (aSeed.w - 1.0) * 1.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vK = k; vHot = 1.0 - smoothstep(0.0, 0.5, r);
        gl_PointSize = uPx * (1.0 + 1.5 * vHot) * uOpen / max(0.8, -mv.z); }`,
    fragmentShader: `varying float vK; varying float vHot; uniform float uOpen;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard; float f = exp(-d * 14.0);
        vec3 col = mix(vec3(0.3, 0.85, 1.0), vec3(1.0, 0.8, 0.45), smoothstep(0.3, 0.8, vK)); col = mix(col, vec3(1.2), vHot);
        gl_FragColor = vec4(col * f * 1.3, f * uOpen * smoothstep(0.0, 0.12, vK) * (1.0 - 0.7 * vHot)); }`,
  }); trash.push(sparkMat);
  const sparks = new THREE.Points(geo, sparkMat); sparks.frustumCulled = false; root.add(sparks);
  // the core: a white-hot glow that breathes
  const coreTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(200,240,255,.8)'); gr.addColorStop(0.55, 'rgba(120,90,255,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })(); trash.push(coreTex);
  const coreMat = new THREE.SpriteMaterial({ map: coreTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }); trash.push(coreMat);
  const core = new THREE.Sprite(coreMat); root.add(core);
  // lightning: jagged lines from points on the rim to the centre, redrawn a dozen times a second
  const ARCS = phone ? 3 : 6, SEG = 12;
  const arcGeo = new THREE.BufferGeometry(); const arcPos = new Float32Array(ARCS * SEG * 2 * 3); arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3)); trash.push(arcGeo);
  const arcMat = new THREE.LineBasicMaterial({ color: 0xbff4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }); arcMat.color.multiplyScalar(3); trash.push(arcMat);
  const arcs = new THREE.LineSegments(arcGeo, arcMat); arcs.frustumCulled = false; root.add(arcs);
  let arcT = -1;
  const drawArcs = () => {
    let o = 0;
    for (let a = 0; a < ARCS; a++) {
      const ang = rnd() * Math.PI * 2, r0 = 0.9 + rnd() * 0.5; let px = Math.cos(ang) * r0, py = Math.sin(ang) * r0, pz = (rnd() - 0.5) * 0.4;
      for (let k = 1; k <= SEG; k++) {
        const f = 1 - k / SEG, jit = 0.18 * Math.sin(Math.PI * k / SEG);
        const nx = Math.cos(ang) * r0 * f + (rnd() - 0.5) * jit, ny = Math.sin(ang) * r0 * f + (rnd() - 0.5) * jit, nz = pz * f + (rnd() - 0.5) * jit;
        arcPos.set([px, py, pz, nx, ny, nz], o); o += 6; px = nx; py = ny; pz = nz;
      }
    }
    arcGeo.attributes.position.needsUpdate = true;
  };
  return {
    root,
    /** open 0..1 as the disk; px: the drawing buffer's height in pixels (keeps the sparks one size on any screen). */
    update(t, open, radius, px = 720) {
      root.visible = open > 0.001; if (!root.visible) return;
      root.scale.setScalar(radius);
      sparkMat.uniforms.uTime.value = t; sparkMat.uniforms.uOpen.value = open; sparkMat.uniforms.uPx.value = px * 0.007;
      const breathe = 0.85 + 0.15 * Math.sin(t * 9) + 0.1 * Math.sin(t * 23);
      core.scale.setScalar(0.2 * breathe * open); coreMat.opacity = 0.6 * open;
      if (Math.floor(t * 12) !== arcT) { arcT = Math.floor(t * 12); drawArcs(); }
      arcMat.opacity = open * (rnd() > 0.25 ? 1 : 0.2);
    },
    dispose() { for (const x of trash) x.dispose(); },
  };
}

/**
 * The screen warp of the pull and the tunnel: a swirl that sucks the picture toward the vortex, a shock ring when it
 * opens, radial zoom blur and colour fringes. A ShaderPass definition for the prologue's composer.
 */
export const WarpShader = {
  uniforms: { tDiffuse: { value: null }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1 }, uPinch: { value: 0 }, uChroma: { value: 0 }, uZoom: { value: 0 }, uRing: { value: -1 }, uRingW: { value: 0.07 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uCenter; uniform float uAspect, uPinch, uChroma, uZoom, uRing, uRingW; varying vec2 vUv;
    void main(){
      vec2 d = vUv - uCenter; d.x *= uAspect; float r = length(d); vec2 dir = r > 1e-4 ? d / r : vec2(0.0);
      float pull = uPinch * exp(-r * 2.6); float ang = pull * 3.0; float c = cos(ang), s = sin(ang);
      vec2 dd = mat2(c, -s, s, c) * d * (1.0 - pull * 0.55);
      float ring = uRing > 0.0 ? exp(-pow((r - uRing) / uRingW, 2.0)) : 0.0; dd -= dir * ring * 0.035;
      dd.x /= uAspect; vec2 uv = uCenter + dd;
      float ca = uChroma + ring * 0.012;
      if (uZoom < 0.001) {
        vec2 off = (uv - uCenter) * ca;
        gl_FragColor = vec4(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b, 1.0);
        return;
      }
      vec3 col = vec3(0.0);
      for (int i = 0; i < 10; i++) { float k = float(i) / 9.0; vec2 su = uCenter + (uv - uCenter) * (1.0 - uZoom * k * 0.1); vec2 off = (su - uCenter) * ca;
        col += vec3(texture2D(tDiffuse, su + off).r, texture2D(tDiffuse, su).g, texture2D(tDiffuse, su - off).b); }
      gl_FragColor = vec4(col / 10.0, 1.0);
    }`,
};

/** Light streaks in the tunnel: thin lines along its axis rushing at the camera, teal turning gold with k. */
export function buildTunnelStreaks({ phone = false } = {}) {
  const N = phone ? 160 : 520, pos = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2), sd = new Float32Array(N * 2 * 2);
  let s = 3; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2, r = 0.8 + rnd() * 2.8, z = rnd() * 84, sp = 0.6 + rnd() * 0.8, hue = rnd();
    for (let e = 0; e < 2; e++) { pos.set([Math.cos(a) * r, Math.sin(a) * r, z], (i * 2 + e) * 3); end[i * 2 + e] = e; sd.set([sp, hue], (i * 2 + e) * 2); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1)); geo.setAttribute('aSd', new THREE.BufferAttribute(sd, 2));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uK: { value: 0 }, uSpeed: { value: 18 } },
    vertexShader: `attribute float aEnd; attribute vec2 aSd; uniform float uTime, uSpeed; varying float vA; varying float vC;
      void main(){ float z = -mod(position.z + uTime * uSpeed * aSd.x * 1.6, 84.0) + 2.0; float len = 1.0 + uSpeed * 0.12 * aSd.x;
        vec3 p = vec3(position.xy, z - aEnd * len); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); vA = (1.0 - aEnd) * smoothstep(-84.0, -40.0, z); vC = aSd.y; }`,
    fragmentShader: `uniform float uK; varying float vA; varying float vC;
      void main(){ vec3 c = mix(mix(vec3(0.4, 0.95, 1.0), vec3(0.75, 0.55, 1.0), step(0.7, vC)), vec3(1.0, 0.82, 0.45), uK); gl_FragColor = vec4(c * 2.2, vA); }`,
  });
  const lines = new THREE.LineSegments(geo, mat); lines.frustumCulled = false;
  return { lines, update(t, k, speed = 18) { mat.uniforms.uTime.value = t; mat.uniforms.uK.value = k; mat.uniforms.uSpeed.value = speed; }, dispose() { geo.dispose(); mat.dispose(); } };
}
