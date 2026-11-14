// Dr. Iris's laboratory, 2048 (sprint plan 9.7): 10 m (x) by 8 m (z) by 3.4 m, origin at the room's centre. A
// procedural shell after the owner's concept (walls, door, window, coffered ceiling with LED coves) round the furniture
// model `lab_furniture` (art/lab/build_lab_furniture.py: desk, chairs, bench, cabinets, pads, ...) and the owner's
// device model `lab_device`. buildLab() returns the scene parts the prologue animates: the door, the red key, the
// story screens, the ceiling lights, the loose papers and the Resonator (device.js). mount(ctx) is the sprint seam
// (src/sprint/registry.js, flag `labPrologue`): it offers the prologue to the intro flow as globalThis.__ftfPrologue.
import * as THREE from 'three';
import { buildDevice } from './device.js';

const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

/** @returns {{root: THREE.Group, dispose(): void, lights: object, props: object, device: object}} */
/** The models the lab asks for (public/assets/models), with the light variant on phones when it ships. */
export const LAB_MODELS = Object.freeze({ room: 'lab_furniture', device: 'lab_device' });
/** The round pads of the furniture model (x, z, radius, top): Iris steps onto them (the prologue lifts her by floorAt). */
export const LAB_PADS = Object.freeze([{ x: 3.22, z: 0.42, r: 1.75, top: 0.07 }, { x: -0.6, z: 2.3, r: 1.0, top: 0.06 }]);

/** Floor height at (x, z): a pad's top inside it, easing up over its last 15 cm. */
export function floorAt(x, z, pads = LAB_PADS) {
  let y = 0;
  for (const p of pads) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r) y = Math.max(y, p.top * Math.min(1, (p.r - d) / 0.15)); }
  return y;
}

export function buildLab() {
  const root = new THREE.Group(); root.name = 'lab';
  const trash = [];
  const mat = (o) => { const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o }); trash.push(m); return m; };
  const box = (w, h, d, m, x, y, z, parent = root) => { const g = new THREE.BoxGeometry(w, h, d); trash.push(g); const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o; };

  // The shell after the owner's concept (14.11): warm grey metal panels, a dark polished floor with glass hatches over
  // machinery, a coffered ceiling whose soffits carry warm LED coves and vents, warm LED lines along the wall feet,
  // and a wide window on a sunset city of 2048.
  const panels = (base, seam, cw, ch) => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h); g.strokeStyle = seam; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
    g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, h * ch); g.lineTo(w, h * ch); g.moveTo(w * cw, 0); g.lineTo(w * cw, h * ch); g.stroke();
  });
  const N = -4.05, D = 4.05 - N, ZC = (4.05 + N) / 2;
  const floorTex = panels('#4a4d52', '#2e3034', 0.5, 0.5); floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(5, 4.7); trash.push(floorTex);
  box(10, 0.1, D, mat({ map: floorTex, roughness: 0.3, metalness: 0.35 }), 0, -0.05, ZC);
  const wallTex = panels('#8d8882', '#6c6761', 0.5, 0.62); wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(4, 1); trash.push(wallTex);
  const wall = mat({ map: wallTex, roughness: 0.45, metalness: 0.35 }), dark = mat({ map: wallTex, color: 0x9a948e, roughness: 0.45, metalness: 0.35 });
  box(10, 3.4, 0.1, dark, 0, 1.7, N - 0.05);                    // north
  box(3.5, 3.4, 0.1, wall, -6.75 + 3.5 / 2 + 1.75, 1.7, 4.05);  // south, left of the door
  box(6.45, 3.4, 0.1, wall, 1.775, 1.7, 4.05);                  // south, right of the door
  box(1.1, 1.2, 0.1, wall, -3, 2.8, 4.05);                      // above the door
  box(0.1, 3.4, D, wall, -5.05, 1.7, ZC);                       // west
  // east, round a wide window: z -3.4 .. 2.0, sill at 0.55 m, head at 3.0 m
  box(0.1, 3.4, 2.05, wall, 5.05, 1.7, 3.025); box(0.1, 0.55, 5.4, wall, 5.05, 0.275, -0.7); box(0.1, 0.4, 5.4, wall, 5.05, 3.2, -0.7); box(0.1, 3.4, 0.65, wall, 5.05, 1.7, -3.725);
  const frame = mat({ color: 0x3b3d42, roughness: 0.35, metalness: 0.6 });
  for (const z of [-3.4, 2.0]) box(0.16, 2.45, 0.08, frame, 5.0, 1.775, z);
  for (const y of [0.55, 3.0]) box(0.16, 0.08, 5.48, frame, 5.0, y, -0.7);
  box(0.12, 2.45, 0.05, frame, 5.0, 1.775, -0.7);
  // the ceiling: a recessed centre framed by soffits; warm LED coves on their inner edges, vents in them
  const ceilTex = panels('#a9a49d', '#8b867f', 0.5, 0.5); ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping; ceilTex.repeat.set(4, 4); trash.push(ceilTex);
  const ceilMat = mat({ map: ceilTex, roughness: 0.6, metalness: 0.2 });
  box(10, 0.1, D, ceilMat, 0, 3.45, ZC);
  const S = 0.9, soffitY = 3.27;
  box(10, 0.26, S, ceilMat, 0, soffitY, N + S / 2); box(10, 0.26, S, ceilMat, 0, soffitY, 4.05 - S / 2);
  box(S, 0.26, D - 2 * S, ceilMat, -5.05 + S / 2, soffitY, ZC); box(S, 0.26, D - 2 * S, ceilMat, 5.05 - S / 2, soffitY, ZC);
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffb46a, toneMapped: false }); stripMat.color.multiplyScalar(2.6); stripMat.userData.base = stripMat.color.clone(); // above white: it blooms trash.push(stripMat);
  const strip = (w, d, x, y, z) => { const g = new THREE.BoxGeometry(w, 0.03, d); trash.push(g); const o = new THREE.Mesh(g, stripMat); o.position.set(x, y, z); root.add(o); return o; };
  const inX = 5.05 - S, inN = N + S, inS = 4.05 - S;
  strip(2 * inX, 0.05, 0, soffitY - 0.13, inN); strip(2 * inX, 0.05, 0, soffitY - 0.13, inS);
  strip(0.05, inS - inN, -inX, soffitY - 0.13, (inN + inS) / 2); strip(0.05, inS - inN, inX, soffitY - 0.13, (inN + inS) / 2);
  strip(2 * inX - 0.2, 0.04, 0, 3.39, inN + 0.06); strip(2 * inX - 0.2, 0.04, 0, 3.39, inS - 0.06); // the glow up into the recess
  // warm lines along the wall feet (west and south)
  strip(0.04, D - 0.2, -4.98, 0.06, ZC); strip(1.6, 0.04, -4.2, 0.06, 3.98); strip(6.3, 0.04, 1.8, 0.06, 3.98);
  // vents: dark slats in the soffits
  const ventMat = mat({ color: 0x1f2124, roughness: 0.7 });
  for (const [x, z, w, d] of [[-2.2, N + 0.45, 1.6, 0.35], [1.6, N + 0.45, 1.6, 0.35], [-1.5, 3.6, 1.8, 0.35], [-4.6, -1.0, 0.35, 1.8], [4.6, 2.9, 0.35, 1.2]]) {
    const along = w > d;
    for (let k = 0; k < 5; k++) box(along ? w : 0.04, 0.02, along ? 0.04 : d, ventMat, x + (along ? 0 : (k - 2) * w * 0.2), soffitY - 0.135, z + (along ? (k - 2) * d * 0.2 : 0));
  }
  // glass hatches in the floor over lit machinery (clear of Iris's path)
  const hatch = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#121418'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a3e45'; g.lineWidth = 6;
    for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(20, 30 + i * 48); g.lineTo(236, 50 + i * 40); g.stroke(); }
    g.strokeStyle = '#8a8f98'; g.lineWidth = 2; for (let i = 0; i < 4; i++) g.strokeRect(30 + i * 52, 70, 34, 110);
    g.fillStyle = 'rgba(255,170,90,.55)'; for (let i = 0; i < 9; i++) g.fillRect(24 + i * 25, 220, 10, 4);
    g.strokeStyle = 'rgba(255,190,120,.9)'; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6);
  }); trash.push(hatch);
  const hatchMat = new THREE.MeshBasicMaterial({ map: hatch, color: 0xb9b9b9 }); trash.push(hatchMat);
  for (const [x, z, w, d] of [[-3.6, 2.2, 1.2, 2.0]]) { const h = new THREE.Mesh(new THREE.PlaneGeometry(w, d), hatchMat); h.rotation.x = -Math.PI / 2; h.position.set(x, 0.004, z); root.add(h); trash.push(h.geometry); }
  // the window: a sunset city of 2048, towers, a hovering ring, lit windows
  const sky = canvasTex(1024, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5a4f86'); gr.addColorStop(0.45, '#d98a8a'); gr.addColorStop(0.7, '#f6b26b'); gr.addColorStop(1, '#f9d79a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const sunG = g.createRadialGradient(330, 360, 4, 330, 360, 120); sunG.addColorStop(0, 'rgba(255,240,200,1)'); sunG.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = sunG; g.fillRect(0, 0, w, h);
    let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (const [layer, col, lo, hi] of [[0, '#8f86b0', 120, 300], [1, '#4d5a80', 60, 220], [2, '#2b3352', 30, 140]]) {
      let x = -10;
      while (x < w) {
        const bw = 18 + rnd() * (40 - layer * 6), bh = lo + rnd() * (hi - lo);
        g.fillStyle = col; g.fillRect(x, h - bh - layer * 4, bw, bh + layer * 4); if (layer === 0 && rnd() > 0.7) g.fillRect(x + bw / 2 - 2, h - bh - 70, 4, 70);
        if (layer > 0) { g.fillStyle = 'rgba(255,214,150,.75)'; for (let y = h - bh + 8; y < h - 6; y += 10) for (let xx = x + 3; xx < x + bw - 4; xx += 7) if (rnd() > 0.72) g.fillRect(xx, y, 3, 4); }
        x += bw + 3 + rnd() * 10;
      }
    }
    g.strokeStyle = 'rgba(200,225,255,.8)'; g.lineWidth = 4; g.beginPath(); g.ellipse(700, 150, 90, 14, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#3d4566'; g.fillRect(694, 150, 12, 260);
  }); trash.push(sky);
  const skyMat = new THREE.MeshBasicMaterial({ map: sky, color: 0xd8d8d8, toneMapped: false }); trash.push(skyMat);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.45), skyMat); win.rotation.y = -Math.PI / 2; win.position.set(5.2, 1.775, -0.7); root.add(win); trash.push(win.geometry);
  // the door (slides west)
  const door = box(1.1, 2.2, 0.06, mat({ color: 0x8d96a3, roughness: 0.4, metalness: 0.3 }), -3, 1.1, 4.02);
  // the computer desk: two monitors (a pulsing waveform), a keyboard, the red glass key
  // the desk itself is in lab_furniture; here the key's base, the story screens, the key
  const metal = mat({ color: 0x3a3f47, roughness: 0.4, metalness: 0.5 });
  const screen = document.createElement('canvas'); screen.width = 256; screen.height = 144; const sg = screen.getContext('2d');
  const screenTex = new THREE.CanvasTexture(screen); screenTex.colorSpace = THREE.SRGBColorSpace; trash.push(screenTex);
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex }); trash.push(screenMat);
  for (const dx of [-0.36, 0.36]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), screenMat); s.position.set(2.2 + dx, 1.12, -3.642); root.add(s); trash.push(s.geometry); } // housings: lab_furniture
  box(0.16, 0.03, 0.16, metal, 2.9, 0.8, -3.1);
  const keyMat = new THREE.MeshStandardMaterial({ color: 0xc8303a, emissive: 0x7a0a12, emissiveIntensity: 0.6, roughness: 0.2, transparent: true, opacity: 0.92 }); trash.push(keyMat);
  const key = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.04, 16), keyMat); key.position.set(2.9, 0.835, -3.1); root.add(key); trash.push(key.geometry);
  // the workbench with loose papers, a mug, a towel
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.9, side: THREE.DoubleSide }); trash.push(paperMat);
  const paperGeo = new THREE.PlaneGeometry(0.21, 0.3); trash.push(paperGeo); const papers = [];
  for (let i = 0; i < 14; i++) { const p = new THREE.Mesh(paperGeo, paperMat); p.rotation.x = -Math.PI / 2; p.rotation.z = (i * 1.7) % 3; p.position.set(-2.9 + (i % 7) * 0.3, 0.89 + i * 0.001, -2.6 + Math.floor(i / 7) * 0.4); p.userData.home = p.position.clone(); p.userData.spin = 2 + (i * 0.37) % 3; root.add(p); papers.push(p); }
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 12), mat({ color: 0x2f6f8a })); mug.position.set(-1.2, 0.93, -2.2); root.add(mug); trash.push(mug.geometry);
  box(0.3, 0.03, 0.2, mat({ color: 0xd8dbe0 }), -1.5, 0.9, -2.6);
  // the language board on the north wall: scribbles and glyphs on a pale grid
  const board = canvasTex(512, 300, (g, w, h) => {
    g.fillStyle = '#f2f4f6'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(120,160,210,.25)'; for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    let s = 11; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    g.strokeStyle = '#27324a'; g.lineWidth = 2; for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) { const x = 24 + c * 54, y = 30 + r * 46; g.beginPath(); for (let k = 0; k < 4; k++) g.lineTo(x + rnd() * 30, y + rnd() * 26); g.stroke(); if (rnd() > 0.6) { g.beginPath(); g.arc(x + 15, y + 13, 6 + rnd() * 8, 0, 6.3 * rnd()); g.stroke(); } }
    g.strokeStyle = '#c0392b'; g.lineWidth = 3; g.beginPath(); g.arc(370, 150, 60, 0, 6.3); g.stroke();
  }); trash.push(board);
  const boardMat = new THREE.MeshBasicMaterial({ map: board }); trash.push(boardMat);
  const bd = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.6), boardMat); bd.position.set(-2.4, 1.75, N + 0.01); root.add(bd); trash.push(bd.geometry);
  // the lab coat on its hook by the door (it flies toward the vortex)
  const coat = box(0.45, 0.9, 0.08, mat({ color: 0xf2f2f2 }), -4.6, 1.5, 3.2); coat.userData.home = coat.position.clone();
  // lights: a cool window fill, a warm desk lamp, ceiling strips that flicker
  const hemi = new THREE.HemisphereLight(0xffe6cc, 0x4a4038, 0.32); root.add(hemi);
  // the low sun through the window: it throws the window's frame across the floor and up the west wall
  const sun = new THREE.DirectionalLight(0xffb978, 2.2); sun.position.set(11, 3.4, -1.6); sun.target.position.set(0, 0.4, -0.2); root.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 5, bottom: -5, near: 1, far: 22 });
  const lamp = new THREE.PointLight(0xffc58a, 2.5, 5, 2); lamp.position.set(1.5, 1.4, -3.2); root.add(lamp);
  const ceil = new THREE.PointLight(0xffd2a0, 5, 12, 2); ceil.position.set(0, 3.0, -0.6); root.add(ceil);
  // downlights: warm pools on the desk, the bench and the device's pad, each from a lit disc in the ceiling
  const discMat = new THREE.MeshBasicMaterial({ color: 0xfff1dc, toneMapped: false }); discMat.color.multiplyScalar(4); trash.push(discMat);
  const discGeo = new THREE.CircleGeometry(0.09, 24); trash.push(discGeo);
  for (const [x, z, tx, tz, i, shadow] of [[2.2, -3.1, 2.2, -3.45, 6, true], [-2.0, -2.3, -2.0, -2.4, 5, false], [3.2, 0.4, 3.2, 0.4, 4, false], [-0.6, 2.3, -0.6, 2.3, 3, false]]) {
    const sp = new THREE.SpotLight(0xffd7aa, i, 7, 0.62, 0.65, 1.6); sp.position.set(x, 3.36, z); sp.target.position.set(tx, 0, tz); root.add(sp, sp.target);
    if (shadow) { sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); sp.shadow.bias = -0.0005; }
    const d = new THREE.Mesh(discGeo, discMat); d.rotation.x = Math.PI / 2; d.position.set(x, 3.395, z); root.add(d);
  }
  for (const [x, z] of [[-3.6, -3.8], [-3.6, 2.6], [3.6, -3.8], [3.6, 2.6]]) { const c = new THREE.PointLight(0xffb070, 3, 5, 2); c.position.set(x, 3.0, z); root.add(c); } // the coves
  // the pads' rims glow warm, like the floor rings of the concept
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xffb46a, toneMapped: false }); rimMat.color.multiplyScalar(2.2); trash.push(rimMat);
  for (const p of LAB_PADS) { const g = new THREE.RingGeometry(p.r * 0.78, p.r * 0.78 + 0.035, 96); trash.push(g); const r = new THREE.Mesh(g, rimMat); r.rotation.x = -Math.PI / 2; r.position.set(p.x, p.top + 0.006, p.z); root.add(r); }
  const device = buildDevice(); device.root.position.set(3.2, LAB_PADS[0].top, 0.4); device.root.rotation.y = -Math.PI / 2; root.add(device.root); // faces west, into the room

  // the owner's room and device models arrive after the film starts building (the prologue fetches them early)
  const models = [];
  /** @param {{room?: THREE.Object3D, device?: THREE.Object3D}} m scenes from the glTF loader (cloned here) */
  function attachModels(m) {
    if (m.room) { const r = m.room.clone(true); r.name = 'lab_furniture_model'; r.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = o.receiveShadow = true; } }); root.add(r); models.push(r); }
    if (m.device) device.attachModel(m.device);
  }

  let screenT = -1;
  /** The monitors: a teal waveform; `armed` shows the warning. */
  function drawScreen(t, armed = false, warn = false) {
    if (Math.abs(t - screenT) < 0.08) return; screenT = t;
    sg.fillStyle = '#06141a'; sg.fillRect(0, 0, 256, 144); sg.strokeStyle = '#2fd0c2'; sg.lineWidth = 2; sg.beginPath();
    for (let x = 0; x <= 256; x += 4) sg.lineTo(x, 72 + Math.sin(x * 0.07 + t * 5) * 22 * Math.sin(x * 0.013 + t) + Math.sin(x * 0.21 + t * 9) * 5);
    sg.stroke();
    if (warn) { sg.fillStyle = '#e04a3a'; sg.beginPath(); sg.moveTo(222, 18); sg.lineTo(240, 48); sg.lineTo(204, 48); sg.closePath(); sg.fill(); }
    if (armed) { sg.fillStyle = 'rgba(255,255,255,.92)'; sg.fillRect(20, 52, 216, 40); sg.fillStyle = '#b3202a'; sg.font = 'bold 20px monospace'; sg.textAlign = 'center'; sg.fillText('RESONATOR ARMED', 128, 79); }
    screenTex.needsUpdate = true;
  }
  drawScreen(0);
  // shadows: the shell and the props catch and cast them; lit and unlit surfaces (screens, LEDs, sky) stay out
  root.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) { o.castShadow = true; o.receiveShadow = true; } });
  return {
    root, device, attachModels, floorAt,
    lights: { hemi, sun, lamp, ceil, stripMat },
    props: { door, key, keyMat, papers, mug, coat, drawScreen },
    dispose() { for (const t of trash) t.dispose(); device.dispose(); for (const r of models) root.remove(r); },
  };
}

/** The sprint seam: offers the prologue to the intro flow (npe/index.js reads ctx.prologue or globalThis.__ftfPrologue). */
export function mount(ctx = {}) {
  let api = null;
  const load = () => (api ||= import('../../cinematic/prologue/index.js').then((m) => m.createPrologue(ctx)));
  const pro = {
    playLabPrologue: (o) => load().then((p) => p.playLabPrologue(o)),
    playWakeUp: (o) => load().then((p) => p.playWakeUp(o)),
    skip: () => { if (api) api.then((p) => p.skip()); },
  };
  globalThis.__ftfPrologue = pro;
  return { dispose() { if (globalThis.__ftfPrologue === pro) delete globalThis.__ftfPrologue; if (api) api.then((p) => p.dispose()); } };
}
