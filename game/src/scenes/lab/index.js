// Dr. Iris's laboratory, 2048 (sprint plan 9.7): a procedural room for the prologue, built in code so nothing is
// downloaded. 10 m (x) by 8 m (z) by 3.4 m, origin at the room's centre. buildLab() returns the scene parts the
// prologue animates: the door, the red key, the monitors, the ceiling lights, the loose papers and the Glass
// Resonator (device.js). mount(ctx) is the sprint seam (src/sprint/registry.js, flag `labPrologue`): it offers the
// prologue to the intro flow as globalThis.__ftfPrologue.
import * as THREE from 'three';
import { buildDevice } from './device.js';

const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

/** @returns {{root: THREE.Group, dispose(): void, lights: object, props: object, device: object}} */
export function buildLab() {
  const root = new THREE.Group(); root.name = 'lab';
  const trash = [];
  const mat = (o) => { const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o }); trash.push(m); return m; };
  const box = (w, h, d, m, x, y, z, parent = root) => { const g = new THREE.BoxGeometry(w, h, d); trash.push(g); const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o; };

  // floor (tile grid), walls, ceiling
  const tile = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#c9ccd0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#a9adb3'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); });
  tile.wrapS = tile.wrapT = THREE.RepeatWrapping; tile.repeat.set(10, 8); trash.push(tile);
  box(10, 0.1, 8, mat({ map: tile, roughness: 0.55 }), 0, -0.05, 0);
  const wall = mat({ color: 0xe9e6df }), dark = mat({ color: 0x2c3440 });
  box(10, 3.4, 0.1, dark, 0, 1.7, -4.05);                       // north: the dark accent wall
  box(3.5, 3.4, 0.1, wall, -6.75 + 3.5 / 2 + 1.75, 1.7, 4.05);  // south, left of the door
  box(6.45, 3.4, 0.1, wall, 1.775, 1.7, 4.05);                  // south, right of the door
  box(1.1, 1.2, 0.1, wall, -3, 2.8, 4.05);                      // above the door
  box(0.1, 3.4, 8, wall, -5.05, 1.7, 0);                        // west
  box(0.1, 3.4, 3.0, wall, 5.05, 1.7, 2.5); box(0.1, 0.9, 4, wall, 5.05, 0.45, -1); box(0.1, 0.7, 4, wall, 5.05, 3.05, -1); box(0.1, 3.4, 1.0, wall, 5.05, 1.7, -3.5); // east, around the window
  box(10, 0.1, 8, mat({ color: 0xdedbd4 }), 0, 3.45, 0);
  // the window: a night-blue skyline strip of 2048
  const sky = canvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0a1230'); gr.addColorStop(1, '#27407a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    let x = 0, s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    while (x < w) { const bw = 14 + rnd() * 30, bh = 40 + rnd() * 150; g.fillStyle = '#0c1326'; g.fillRect(x, h - bh, bw, bh); g.fillStyle = 'rgba(255,214,140,.85)'; for (let y = h - bh + 6; y < h - 6; y += 9) for (let xx = x + 3; xx < x + bw - 4; xx += 7) if (rnd() > 0.55) g.fillRect(xx, y, 3, 4); x += bw + 2; }
  }); trash.push(sky);
  const skyMat = new THREE.MeshBasicMaterial({ map: sky }); trash.push(skyMat);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.8), skyMat); win.rotation.y = -Math.PI / 2; win.position.set(5.2, 1.8, -1); root.add(win); trash.push(win.geometry);
  // the door (slides west)
  const door = box(1.1, 2.2, 0.06, mat({ color: 0x8d96a3, roughness: 0.4, metalness: 0.3 }), -3, 1.1, 4.02);
  // the computer desk: two monitors (a pulsing waveform), a keyboard, the red glass key
  const wood = mat({ color: 0x6b5a4a }), metal = mat({ color: 0x3a3f47, roughness: 0.4, metalness: 0.5 });
  box(1.8, 0.05, 0.8, wood, 2.2, 0.76, -3.4); for (const [dx, dz] of [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]]) box(0.05, 0.76, 0.05, metal, 2.2 + dx, 0.38, -3.4 + dz);
  const screen = document.createElement('canvas'); screen.width = 256; screen.height = 144; const sg = screen.getContext('2d');
  const screenTex = new THREE.CanvasTexture(screen); screenTex.colorSpace = THREE.SRGBColorSpace; trash.push(screenTex);
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex }); trash.push(screenMat);
  for (const dx of [-0.36, 0.36]) { box(0.66, 0.4, 0.03, metal, 2.2 + dx, 1.12, -3.66); const s = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), screenMat); s.position.set(2.2 + dx, 1.12, -3.642); root.add(s); trash.push(s.geometry); box(0.05, 0.16, 0.05, metal, 2.2 + dx, 0.86, -3.66); }
  box(0.44, 0.02, 0.15, metal, 2.1, 0.795, -3.25);
  box(0.16, 0.03, 0.16, metal, 2.9, 0.8, -3.1);
  const keyMat = new THREE.MeshStandardMaterial({ color: 0xc8303a, emissive: 0x7a0a12, emissiveIntensity: 0.6, roughness: 0.2, transparent: true, opacity: 0.92 }); trash.push(keyMat);
  const key = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.04, 16), keyMat); key.position.set(2.9, 0.835, -3.1); root.add(key); trash.push(key.geometry);
  // the workbench with loose papers, a mug, a towel
  box(2.2, 0.05, 0.9, wood, -2.0, 0.86, -2.4); for (const [dx, dz] of [[-1.05, -0.4], [1.05, -0.4], [-1.05, 0.4], [1.05, 0.4]]) box(0.05, 0.86, 0.05, metal, -2.0 + dx, 0.43, -2.4 + dz);
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
  const bd = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2), boardMat); bd.position.set(-2.75, 1.7, -3.99); root.add(bd); trash.push(bd.geometry);
  // shelves and books on the west wall (instanced)
  for (const y of [0.9, 1.5, 2.1]) box(0.3, 0.04, 3.2, wood, -4.85, y, -0.4);
  const bookGeo = new THREE.BoxGeometry(0.2, 0.26, 0.05); trash.push(bookGeo); const bookMat = new THREE.MeshStandardMaterial({ roughness: 0.8 }); trash.push(bookMat);
  const books = new THREE.InstancedMesh(bookGeo, bookMat, 120); const m4 = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < 120; i++) { m4.makeTranslation(-4.85, [0.9, 1.5, 2.1][i % 3] + 0.15, -1.95 + Math.floor(i / 3) * 0.078); books.setMatrixAt(i, m4); books.setColorAt(i, col.setHSL(((i * 0.137) % 1), 0.35, 0.35 + ((i * 0.31) % 0.25))); }
  root.add(books);
  // the lab coat on its hook by the door (it flies toward the vortex)
  const coat = box(0.45, 0.9, 0.08, mat({ color: 0xf2f2f2 }), -4.6, 1.5, 3.2); coat.userData.home = coat.position.clone();
  // lights: a cool window fill, a warm desk lamp, ceiling strips that flicker
  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x8a8478, 0.9); root.add(hemi);
  const sun = new THREE.DirectionalLight(0xbfd4ff, 1.0); sun.position.set(6, 4, -1); root.add(sun);
  const lamp = new THREE.PointLight(0xffc58a, 6, 6, 2); lamp.position.set(1.5, 1.4, -3.2); root.add(lamp);
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); trash.push(stripMat);
  for (const z of [-2, 1.5]) { const s = new THREE.Mesh(new THREE.BoxGeometry(6, 0.03, 0.2), stripMat); s.position.set(0, 3.38, z); root.add(s); trash.push(s.geometry); }
  const ceil = new THREE.PointLight(0xffffff, 14, 14, 2); ceil.position.set(0, 3.1, 0); root.add(ceil);
  const device = buildDevice(); device.root.position.set(3.2, 0, 0.4); device.root.rotation.y = -Math.PI / 2; root.add(device.root); // the ring faces west, into the room

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
  return {
    root, device,
    lights: { hemi, sun, lamp, ceil, stripMat },
    props: { door, key, keyMat, papers, mug, coat, drawScreen },
    dispose() { for (const t of trash) t.dispose(); books.dispose(); device.dispose(); },
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
