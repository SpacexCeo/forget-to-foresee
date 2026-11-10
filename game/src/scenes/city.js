// Evermind, the open city (owner 10.11): a walled hub town with a plaza and fountain, the Shell Gate to the
// tournament, a market street, a tavern, the Exchange hall with live price boards and a quest board. Beyond
// the wall a forest and hills run to the horizon; they are scenery only (the wall is the edge of the world).
// Like the Shell interior, the city lives in the island's THREE.Scene far away (CITY_ORIGIN) with its own
// collision world, so the look-dev stack, the camera rig and the character controller are reused unchanged.
// Everything is built in code (faceted shapes, vertex colours, a handful of draw calls): no download stands
// between the player and the city. Layout data: src/city/layout.js. No game rule is read here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CollisionWorld, boxTriangles, prismTriangles, transformTriangles, MASK_ALL, MASK_PLAYER } from '../physics/collision.js';
import { LAYER_OVERLAY } from '../render/layers.js';
import { CLANS } from './layout.js';
import { CITY_ORIGIN, WALL_RADIUS, WALL_THICKNESS, WALL_HEIGHT, PLAZA_RADIUS, PLACES, STALLS, SOLIDS, HOUSES, TOWER_ANGLES, LAMPS, TOWN_TREES, CITY_SPAWN, forestTrees, horizonHills, ring, faceCentre, sceneryRng } from '../city/layout.js';

const PAL = {
  stone: 0x8d8778, stoneDark: 0x6f6a5e, stoneLight: 0xa9a392, slate: 0x4a4f55, terracotta: 0x9a5a3c, timber: 0x4b3a2a,
  plaster: [0xd8cdb4, 0xc9b99a, 0xbfc4b6, 0xd2bfa6], roof: [0x4a4f55, 0x8a4f37, 0x5a5348, 0x6b3f33],
  wood: 0x6b5138, woodLight: 0x8a6c48, iron: 0x33363a, gold: 0xd9b25a, water: 0x4f8ea0,
  leafDark: 0x34503a, leaf: 0x466b3f, leafWarm: 0x6f7f3c, trunk: 0x4a3a2c, grass: 0x56683f, earth: 0x7a6a50, hill: 0x4c5e55,
};

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
/** Local transform: position, yaw, optional pitch/roll and scale. */
function M(x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz));
}

/** Collects coloured parts and merges them into one faceted mesh (one draw call). */
class Mass {
  constructor() { this.parts = []; }
  /** @param {THREE.BufferGeometry} geom @param {number} color @param {...THREE.Matrix4} mats applied right to left like a scene graph */
  add(geom, color, ...mats) {
    const g = geom.index ? geom.toNonIndexed() : geom.clone();
    _m.identity();
    for (const m of mats) _m.multiply(m);
    g.applyMatrix4(_m);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }
  geometry() {
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return g;
  }
  mesh(material, name) {
    const mesh = new THREE.Mesh(this.geometry(), material);
    mesh.name = name;
    return mesh;
  }
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r, h, seg = 6) => new THREE.ConeGeometry(r, h, seg);

/** A gable roof: a triangular prism w wide, h high, d deep, its base at y = 0. */
function gable(w, h, d) {
  const a = [-w / 2, 0, -d / 2], b = [w / 2, 0, -d / 2], c = [0, h, -d / 2], dd = [-w / 2, 0, d / 2], e = [w / 2, 0, d / 2], f = [0, h, d / 2];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([dd, e, f, b, a, c, a, dd, f, a, f, c, e, b, c, e, c, f].flat(), 3));
  g.computeVertexNormals();
  return g;
}

/** The town's floor painted once: cobbles, the plaza's rings, roads to every place, lawns by the wall. */
function groundTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), R = WALL_RADIUS + 2, px = (v) => ((v + R) / (2 * R)) * size, s = size / (2 * R);
  const rnd = sceneryRng(4242);
  g.fillStyle = '#6f6b5c'; g.fillRect(0, 0, size, size);
  // lawns between the roads, near the wall
  for (const [a, r, w] of [[25, 36, 9], [-28, 37, 8], [150, 36, 9], [205, 37, 8], [78, 40, 6], [102, 40, 6], [-75, 30, 7], [-105, 30, 7], [130, 14, 3], [50, 15, 3]]) {
    const [x, , z] = ring(r, a);
    const grd = g.createRadialGradient(px(x), px(z), 0, px(x), px(z), w * s);
    grd.addColorStop(0, 'rgba(92,112,66,0.95)'); grd.addColorStop(0.7, 'rgba(88,106,64,0.8)'); grd.addColorStop(1, 'rgba(88,106,64,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(px(x), px(z), w * s, 0, Math.PI * 2); g.fill();
  }
  // roads from the plaza to the gates and the places
  g.lineCap = 'round'; g.strokeStyle = '#8f8975';
  const road = (x, z, w) => { g.lineWidth = w * s; g.beginPath(); g.moveTo(px(0), px(0)); g.lineTo(px(x), px(z)); g.stroke(); };
  road(0, -47, 6); road(0, 47, 6); road(30, 0, 5.5); road(-28, -1, 5.5); road(21, 27, 4.5); road(-18, 23, 4);
  g.lineWidth = 4.5 * s; g.beginPath(); g.arc(px(0), px(0), 31 * s, -0.62, 0.62); g.stroke(); // the market arc
  // plaza: pale stone, concentric rings, a gold inlay ring (the game's ring motif)
  g.fillStyle = '#a39d88'; g.beginPath(); g.arc(px(0), px(0), PLAZA_RADIUS * s, 0, Math.PI * 2); g.fill();
  for (let r = 2; r < PLAZA_RADIUS; r += 1.5) { g.strokeStyle = 'rgba(70,66,54,0.35)'; g.lineWidth = 0.08 * s; g.beginPath(); g.arc(px(0), px(0), r * s, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = 'rgba(217,178,90,0.9)'; g.lineWidth = 0.22 * s; g.beginPath(); g.arc(px(0), px(0), (PLAZA_RADIUS - 1.2) * s, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; g.beginPath(); g.moveTo(px(Math.cos(a) * 4.2), px(Math.sin(a) * 4.2)); g.lineTo(px(Math.cos(a) * (PLAZA_RADIUS - 1.2)), px(Math.sin(a) * (PLAZA_RADIUS - 1.2))); g.stroke(); }
  // cobbles: many small stones, lighter and darker than the bed
  const stones = Math.round((size * size) / 90);
  for (let i = 0; i < stones; i++) {
    const x = rnd() * size, y = rnd() * size, w = (0.16 + rnd() * 0.2) * s, hh = (0.13 + rnd() * 0.15) * s, v = rnd();
    g.fillStyle = v < 0.5 ? `rgba(40,38,32,${0.03 + rnd() * 0.07})` : `rgba(226,220,198,${0.03 + rnd() * 0.06})`;
    g.fillRect(x, y, w, hh);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** The pearly light inside the Shell Gate. */
function portalTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 6, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,250,236,0.95)'); grd.addColorStop(0.35, 'rgba(214,226,238,0.55)'); grd.addColorStop(0.7, 'rgba(196,170,226,0.28)'); grd.addColorStop(1, 'rgba(160,190,220,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) { // faint spiral ribs, like a Shell's growth lines
    g.strokeStyle = `rgba(255,236,190,${0.1 + i * 0.03})`; g.lineWidth = 3;
    g.beginPath();
    for (let a = 0; a < Math.PI * 3; a += 0.1) { const r = 8 + a * (9 + i * 2.2); const x = 128 + Math.cos(a + i * 1.3) * r, y = 128 + Math.sin(a + i * 1.3) * r; if (a === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function treeGeometry(kind) {
  const m = new Mass();
  if (kind === 'conifer') {
    m.add(cyl(0.16, 0.26, 1.7, 5), PAL.trunk, M(0, 0.85, 0));
    m.add(cone(1.65, 2.5, 6), PAL.leafDark, M(0, 2.6, 0));
    m.add(cone(1.25, 2.2, 6), PAL.leaf, M(0, 3.9, 0, 0.5));
    m.add(cone(0.8, 1.9, 6), PAL.leaf, M(0, 5.1, 0, 1));
  } else {
    m.add(cyl(0.2, 0.32, 2.4, 5), PAL.trunk, M(0, 1.2, 0));
    m.add(new THREE.IcosahedronGeometry(1.9, 0), PAL.leaf, M(0, 3.8, 0, 0.3, 1, 0.86, 1));
    m.add(new THREE.IcosahedronGeometry(1.25, 0), PAL.leafWarm, M(0.9, 4.6, 0.4, 1.1, 1, 0.9, 1));
    m.add(new THREE.IcosahedronGeometry(1.1, 0), PAL.leafDark, M(-0.9, 3.4, -0.5, 2));
  }
  return m.geometry();
}

/**
 * @param {{scene: THREE.Scene, mobile?: boolean}} o
 * @returns the city: root group, collision world, boards, lights and helpers (see the return statement)
 */
export function createCityScene({ scene, mobile = false }) {
  const world = new CollisionWorld({ cellSize: 2 });
  const root = new THREE.Group();
  root.name = 'city_scene';
  root.position.set(...CITY_ORIGIN);
  root.visible = false;
  scene.add(root);
  const O = M(...CITY_ORIGIN);
  const solid = (id, tris, mask = MASK_ALL, ...mats) => { _m.copy(O); for (const m of mats) _m.multiply(m); world.addTriangles('city:' + id, transformTriangles(tris, _m.elements), mask); };
  const solidBox = (id, w, h, d, ...mats) => solid(id, boxTriangles([-w / 2, 0, -d / 2], [w / 2, h, d / 2]), MASK_ALL, ...mats);

  const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });
  const town = new Mass();   // casts and receives shadows
  const glow = new Mass();   // warm windows and lanterns: emissive, no shadows
  const far = new Mass();    // hills: no shadows

  /* ---------- ground ---------- */
  const terrain = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.MeshStandardMaterial({ color: PAL.grass, roughness: 1 }));
  terrain.rotation.x = -Math.PI / 2; terrain.position.y = -0.03; terrain.receiveShadow = true; terrain.name = 'city_terrain';
  const floor = new THREE.Mesh(new THREE.CircleGeometry(WALL_RADIUS + 2, 72), new THREE.MeshStandardMaterial({ map: groundTexture(mobile ? 1024 : 2048), roughness: 0.96 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = 'city_floor';
  const roadOut = new THREE.Mesh(new THREE.PlaneGeometry(6, 260), new THREE.MeshStandardMaterial({ color: PAL.earth, roughness: 1 }));
  roadOut.rotation.x = -Math.PI / 2; roadOut.position.set(0, -0.015, WALL_RADIUS + 130); roadOut.receiveShadow = true;
  root.add(terrain, floor, roadOut);
  // walkable ground under the whole town (a little past the wall, which is the real limit)
  solid('ground', boxTriangles([-(WALL_RADIUS + 6), -1, -(WALL_RADIUS + 6)], [WALL_RADIUS + 6, 0, WALL_RADIUS + 6]));

  /* ---------- wall, towers, gates ---------- */
  const SEG = 48, segLen = (2 * Math.PI * (WALL_RADIUS + WALL_THICKNESS / 2)) / SEG + 0.25;
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * 360, gateN = Math.abs(a - 270) < 4, gateS = Math.abs(a - 90) < 4;
    const [x, , z] = ring(WALL_RADIUS + WALL_THICKNESS / 2, a), yaw = faceCentre(a), P = M(x, 0, z, yaw);
    // the collider ring is complete: both gates are shut for walking
    solidBox('wall' + i, segLen, WALL_HEIGHT + 4, WALL_THICKNESS, P);
    if (gateN || gateS) continue;
    town.add(box(segLen, WALL_HEIGHT, WALL_THICKNESS), i % 2 ? PAL.stone : PAL.stoneDark, P, M(0, WALL_HEIGHT / 2, 0));
    town.add(box(segLen, 0.5, WALL_THICKNESS + 0.5), PAL.stoneLight, P, M(0, WALL_HEIGHT + 0.25, 0));
    for (const dx of [-segLen / 3, 0, segLen / 3]) town.add(box(1.1, 0.9, 0.6), PAL.stone, P, M(dx, WALL_HEIGHT + 0.95, -WALL_THICKNESS / 2 + 0.05));
  }
  for (const a of TOWER_ANGLES) {
    const [x, , z] = ring(WALL_RADIUS + WALL_THICKNESS / 2, a);
    town.add(cyl(3.1, 3.5, 10.5, 9), PAL.stoneDark, M(x, 5.25, z));
    town.add(cyl(3.6, 3.1, 1, 9), PAL.stoneLight, M(x, 11, z));
    town.add(cone(4, 5, 9), PAL.slate, M(x, 14, z));
    glow.add(box(0.5, 1.1, 0.2), 0xffc878, M(x, 7.5, z, faceCentre(a)), M(0, 0, 3.35));
  }
  // the Shell Gate (north): two piers, a lintel, an arch of nacre; the way to the tournament
  const gateZ = -(WALL_RADIUS + WALL_THICKNESS / 2);
  for (const sx of [-1, 1]) {
    town.add(box(3.4, 11, 6.5), PAL.stoneDark, M(sx * 5.2, 5.5, gateZ + 0.2));
    town.add(box(3.9, 0.8, 7), PAL.stoneLight, M(sx * 5.2, 11.4, gateZ + 0.2));
    town.add(cone(2.6, 3.6, 4), PAL.slate, M(sx * 5.2, 13.6, gateZ + 0.2, Math.PI / 4));
    glow.add(box(0.45, 0.7, 0.45), 0xffd9a0, M(sx * 3.9, 3.2, gateZ + 3.6));
    town.add(box(0.14, 0.9, 0.14), PAL.iron, M(sx * 3.9, 4, gateZ + 3.6));
  }
  town.add(box(14, 1.6, 5), PAL.stone, M(0, 10.4, gateZ + 0.2));
  const nacre = new THREE.MeshStandardMaterial({ color: 0xe9e2d2, roughness: 0.25, metalness: 0.35, emissive: 0xbfa878, emissiveIntensity: 0.35 });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.42, 8, 28, Math.PI), nacre);
  arch.position.set(0, 5.6, gateZ + 3.1); arch.castShadow = true; arch.name = 'shell_gate_arch';
  const portal = new THREE.Mesh(new THREE.CircleGeometry(3.5, 40), new THREE.MeshBasicMaterial({ map: portalTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide }));
  portal.position.set(0, 4.6, gateZ + 3); portal.name = 'shell_gate_portal'; portal.layers.set(LAYER_OVERLAY);
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(7, 9.6), new THREE.MeshStandardMaterial({ color: 0x1c2228, roughness: 0.6 }));
  veil.position.set(0, 4.8, gateZ + 2.2); veil.name = 'shell_gate_veil';
  root.add(arch, portal, veil);
  for (const s of [-1, 1]) town.add(box(1.2, 0.5, 2.4), PAL.stoneLight, M(s * 3.4, 0.25, gateZ + 4.4)); // threshold stones
  // the south gate: shut timber doors, the road to the forest behind them
  const southZ = WALL_RADIUS + WALL_THICKNESS / 2;
  for (const sx of [-1, 1]) {
    town.add(box(3, 9, 5), PAL.stoneDark, M(sx * 4.6, 4.5, southZ));
    town.add(cone(2.3, 3, 4), PAL.slate, M(sx * 4.6, 10.5, southZ, Math.PI / 4));
    town.add(box(3.05, 6.2, 0.35), PAL.wood, M(sx * 1.55, 3.1, southZ - 0.6));
    for (const y of [1.4, 3.2, 5]) town.add(box(3.1, 0.22, 0.42), PAL.iron, M(sx * 1.55, y, southZ - 0.6));
  }
  town.add(box(12.4, 2.2, 4), PAL.stone, M(0, 7.4, southZ));

  /* ---------- plaza: fountain, banners, benches, lamps ---------- */
  town.add(cyl(3.1, 3.3, 0.7, 12), PAL.stoneLight, M(0, 0.35, 0));
  town.add(cyl(0.55, 0.8, 2.2, 8), PAL.stone, M(0, 1.3, 0));
  town.add(cyl(1.5, 0.5, 0.45, 10), PAL.stoneLight, M(0, 2.5, 0));
  solid('fountain', prismTriangles(0, 0, 3.25, 0, 1.2, 12));
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.85, 24), new THREE.MeshStandardMaterial({ color: PAL.water, roughness: 0.12, metalness: 0.1, emissive: 0x16323a, emissiveIntensity: 0.6 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.715; water.name = 'fountain_water';
  const ringGlyph = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 6, 36), new THREE.MeshStandardMaterial({ color: 0xf3ecd8, emissive: PAL.gold, emissiveIntensity: 1.4, roughness: 0.35, metalness: 0.4 }));
  ringGlyph.position.y = 3.9; ringGlyph.name = 'fountain_glyph';
  root.add(water, ringGlyph);
  CLANS.forEach((clan, i) => {
    const [x, , z] = ring(PLAZA_RADIUS + 1.6, i * 60), yaw = faceCentre(i * 60); // none at 90°: that is where the camera looks from
    town.add(cyl(0.07, 0.09, 5.2, 6), PAL.iron, M(x, 2.6, z));
    town.add(box(0.95, 2.1, 0.05), clan.color, M(x, 3.9, z, yaw), M(0.52, 0, 0));
    town.add(box(0.95, 0.12, 0.07), PAL.gold, M(x, 4.98, z, yaw), M(0.52, 0, 0));
  });
  for (const a of [45, 135, 225, 315]) {
    const [x, , z] = ring(PLAZA_RADIUS - 2.4, a), P = M(x, 0, z, faceCentre(a));
    town.add(box(1.9, 0.12, 0.6), PAL.woodLight, P, M(0, 0.48, 0));
    for (const dx of [-0.8, 0.8]) town.add(box(0.12, 0.48, 0.55), PAL.stoneDark, P, M(dx, 0.24, 0));
    solidBox('bench' + a, 1.9, 0.55, 0.6, P);
  }
  const lights = [];
  LAMPS.forEach(([x, , z], i) => {
    town.add(cyl(0.06, 0.1, 3.3, 6), PAL.iron, M(x, 1.65, z));
    town.add(box(0.5, 0.08, 0.5), PAL.iron, M(x, 3.72, z));
    glow.add(box(0.34, 0.42, 0.34), 0xffc070, M(x, 3.45, z));
    solid('lamp' + i, prismTriangles(x, z, 0.14, 0, 3.4, 5), MASK_PLAYER);
    if (i < (mobile ? 2 : 4)) {
      const l = new THREE.PointLight(0xffa64d, 0, 13, 2);
      l.position.set(x, 3.4, z); l.castShadow = false; l.name = 'city_lamp_light'; l.userData.phase = i * 2.4;
      root.add(l); lights.push(l);
    }
  });

  /* ---------- houses ---------- */
  for (const hh of HOUSES) {
    const [w, d, wallH] = hh.size, P = M(hh.position[0], 0, hh.position[2], hh.yaw), roofH = 2.1 + (hh.tone % 2) * 0.6;
    town.add(box(w, wallH, d), PAL.plaster[hh.tone], P, M(0, wallH / 2, 0));
    town.add(gable(w + 0.7, roofH, d + 0.7), PAL.roof[hh.tone], P, M(0, wallH, 0));
    for (const sx of [-1, 1]) town.add(box(0.22, wallH, 0.22), PAL.timber, P, M(sx * (w / 2 - 0.08), wallH / 2, d / 2 + 0.02));
    town.add(box(w, 0.22, 0.2), PAL.timber, P, M(0, wallH - 0.2, d / 2 + 0.03));
    town.add(box(1.05, 2, 0.14), PAL.wood, P, M(-w / 4, 1, d / 2 + 0.05));
    glow.add(box(0.8, 0.9, 0.1), 0xffcf8a, P, M(w / 4, wallH * 0.55, d / 2 + 0.04));
    if (wallH > 4) glow.add(box(0.7, 0.7, 0.1), 0xffcf8a, P, M(-w / 4, wallH - 0.9, d / 2 + 0.04));
    town.add(box(0.6, 1.5, 0.6), PAL.stoneDark, P, M(w / 4, wallH + roofH * 0.55, -d / 5));
    solidBox(hh.id, w, wallH, d, P);
  }

  /* ---------- tavern (west): the Mossy Kettle ---------- */
  {
    const P = M(-32, 0, -2, Math.PI / 2); // local +Z faces the plaza (+X)
    town.add(box(13, 5, 10), PAL.plaster[1], P, M(0, 2.5, 0));
    town.add(gable(13.8, 3.6, 10.9), 0x4f6a48, P, M(0, 5, 0));
    town.add(box(13, 0.3, 0.25), PAL.timber, P, M(0, 2.9, 5.03));
    for (const dx of [-6.4, -2.2, 2.2, 6.4]) town.add(box(0.28, 5, 0.28), PAL.timber, P, M(dx, 2.5, 5.02));
    town.add(box(1.5, 2.4, 0.16), PAL.wood, P, M(0, 1.2, 5.06));
    for (const dx of [-4.3, 4.3]) { glow.add(box(1.5, 1.2, 0.1), 0xffc880, P, M(dx, 1.9, 5.05)); glow.add(box(1.1, 0.9, 0.1), 0xffc880, P, M(dx, 4, 5.05)); }
    town.add(box(1, 2.2, 1), PAL.stoneDark, P, M(4, 7.4, -2));
    // awning over the terrace and the hanging sign
    town.add(box(9, 0.14, 3.4), 0x6f8f55, P, M(0, 3.2, 6.6, 0, 1, 1, 1, 0.16));
    for (const dx of [-4.3, 4.3]) town.add(cyl(0.07, 0.07, 3, 6), PAL.wood, P, M(dx, 1.5, 8.1));
    town.add(box(0.1, 0.1, 1.5), PAL.iron, P, M(6.9, 4.2, 5.7));
    town.add(box(1.3, 0.9, 0.1), PAL.woodLight, P, M(6.9, 3.55, 6.3, Math.PI / 2));
    glow.add(cyl(0.2, 0.2, 0.03, 12), 0xd9b25a, P, M(6.84, 3.55, 6.3, 0, 1, 1, 1, 0, Math.PI / 2));
    // terrace tables
    for (const [tx, tz, i] of [[-23.6, -7.2, 0], [-23.6, 3.4, 1], [-20.6, -9.8, 2]]) {
      town.add(cyl(0.75, 0.75, 0.08, 10), PAL.woodLight, M(tx, 0.82, tz));
      town.add(cyl(0.1, 0.16, 0.8, 6), PAL.wood, M(tx, 0.4, tz));
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + i; town.add(cyl(0.2, 0.2, 0.5, 7), PAL.wood, M(tx + Math.cos(a) * 1.15, 0.25, tz + Math.sin(a) * 1.15)); }
      glow.add(cyl(0.07, 0.09, 0.18, 6), 0xffc070, M(tx, 0.95, tz));
      solid('table' + i, prismTriangles(tx, tz, 0.8, 0, 0.9, 8), MASK_PLAYER);
    }
  }

  /* ---------- market (east): four stalls on an arc ---------- */
  STALLS.forEach((st, i) => {
    const P = M(st.position[0], 0, st.position[2], st.yaw);
    town.add(box(3.3, 0.95, 1.2), PAL.wood, P, M(0, 0.475, 0));
    town.add(box(3.5, 0.1, 1.4), PAL.woodLight, P, M(0, 1, 0));
    for (const [dx, dz] of [[-1.6, -0.9], [1.6, -0.9], [-1.6, 0.9], [1.6, 0.9]]) town.add(cyl(0.06, 0.06, 2.9, 5), PAL.timber, P, M(dx, 1.45, dz));
    for (let k = 0; k < 4; k++) town.add(box(0.9, 0.08, 2.5), k % 2 ? 0xe8dfc8 : st.awning, P, M(-1.35 + k * 0.9, 2.95, 0.1, 0, 1, 1, 1, 0.2));
    // wares on the counter
    const wares = [[0xd9b382, 0xb8d0a0], [0xcaa24a, 0x3b3a39], [0x2c3440, 0xe9e2d2], [0xd59a3a, 0xe8b860]][i];
    for (let k = 0; k < 5; k++) town.add(k % 2 ? box(0.34, 0.26, 0.34) : new THREE.IcosahedronGeometry(0.19, 0), wares[k % 2], P, M(-1.2 + k * 0.6, 1.2, (k % 2) * 0.25 - 0.1, k));
    town.add(box(0.8, 0.7, 0.8), PAL.woodLight, P, M(-2.4, 0.35, -0.6, 0.3));
    town.add(cyl(0.38, 0.34, 0.9, 8), PAL.wood, P, M(2.5, 0.45, -0.5));
    solidBox(st.id, 3.5, 1.1, 1.4, P);
  });

  /* ---------- the Exchange (south-east): a hall with three live price boards ---------- */
  const exchange = SOLIDS.find((s) => s.id === 'exchange_hall').box;
  const EX = M(exchange[0], 0, exchange[1], exchange[5]);
  town.add(box(9.6, 6, 1.2), PAL.stoneDark, EX, M(0, 3, 0));
  town.add(box(10.6, 0.5, 6.4), PAL.slate, EX, M(0, 6.3, 2.4));
  town.add(gable(10.6, 1.4, 6.4), PAL.slate, EX, M(0, 6.55, 2.4));
  for (const dx of [-4.6, 4.6]) { town.add(cyl(0.3, 0.36, 6, 8), PAL.stoneLight, EX, M(dx, 3, 5)); solid('excol' + dx, prismTriangles(0, 0, 0.4, 0, 6, 6), MASK_ALL, EX, M(dx, 0, 5)); }
  town.add(box(9.6, 0.3, 1.5), PAL.stoneLight, EX, M(0, 0.15, 0.9));
  const boards = {};
  ['near', 'memes', 'nfts'].forEach((name, i) => {
    const canvas = document.createElement('canvas');
    canvas.width = 384; canvas.height = 512;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 3.6), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    mesh.applyMatrix4(new THREE.Matrix4().multiplyMatrices(EX, M((i - 1) * 3.05, 3.1, 0.7)));
    mesh.name = 'exchange_board_' + name;
    root.add(mesh);
    town.add(box(2.9, 3.8, 0.1), PAL.timber, EX, M((i - 1) * 3.05, 3.1, 0.6));
    boards[name] = { canvas, texture: tex, mesh };
  });

  /* ---------- quest board (south-west) ---------- */
  {
    const b = SOLIDS.find((s) => s.id === 'quest_board').box, P = M(b[0], 0, b[1], b[5]);
    for (const dx of [-1.6, 1.6]) town.add(box(0.22, 3.2, 0.22), PAL.timber, P, M(dx, 1.6, 0));
    town.add(box(3.6, 2, 0.16), PAL.wood, P, M(0, 2, 0));
    town.add(gable(4.2, 0.6, 0.9), PAL.roof[1], P, M(0, 3.15, 0));
    const notes = [[-1.1, 2.4, 0.1], [-0.2, 2.2, -0.08], [0.9, 2.45, 0.05], [-0.7, 1.6, -0.05], [0.5, 1.55, 0.12], [1.25, 1.7, -0.1]];
    for (const [nx, ny, rz] of notes) town.add(box(0.55, 0.7, 0.02), 0xe6dcc0, P, M(nx, ny, 0.1, 0, 1, 1, 1, 0, rz));
  }

  /* ---------- colliders for the listed solids ---------- */
  for (const s of SOLIDS) { const [cx, cz, w, d, h, yaw] = s.box; solidBox(s.id, w, h, d, M(cx, 0, cz, yaw)); }

  /* ---------- trees: inside the walls, the forest ring, and the hills on the horizon ---------- */
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  const trees = forestTrees(mobile ? 520 : 1400);
  const tint = new THREE.Color(), dummy = new THREE.Object3D();
  for (const kind of ['conifer', 'broadleaf']) {
    const geom = treeGeometry(kind);
    const town_ = kind === 'broadleaf' ? TOWN_TREES.map(([x, , z], i) => ({ x, z, scale: 1.05 + (i % 3) * 0.15, hue: (i * 0.37) % 1 })) : [];
    const list = [...town_, ...trees.filter((t) => t.kind === kind)];
    const nearList = list.filter((t) => Math.hypot(t.x, t.z) < 110), farList = list.filter((t) => Math.hypot(t.x, t.z) >= 110);
    for (const [items, cast, tag] of [[nearList, true, 'near'], [farList, false, 'far']]) {
      if (!items.length) continue;
      const inst = new THREE.InstancedMesh(geom, treeMat, items.length);
      inst.name = `city_trees_${kind}_${tag}`; inst.castShadow = cast && !mobile; inst.receiveShadow = false; inst.frustumCulled = false;
      items.forEach((t, i) => {
        dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.hue * 6.28, 0); dummy.scale.set(t.scale, t.scale * (0.9 + t.hue * 0.3), t.scale);
        dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix);
        inst.setColorAt(i, tint.setHSL(0.24 + t.hue * 0.08, 0.25, 0.78 + t.hue * 0.22));
      });
      inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      root.add(inst);
    }
  }
  TOWN_TREES.forEach(([x, , z], i) => solid('tree' + i, prismTriangles(x, z, 0.4, 0, 3, 6)));
  const hillRnd = sceneryRng(9);
  for (const hl of horizonHills()) {
    const g = new THREE.ConeGeometry(hl.radius, hl.height, 7, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < hl.height / 2 - 0.01) p.setXYZ(i, p.getX(i) * (0.85 + hillRnd() * 0.35), p.getY(i), p.getZ(i) * (0.85 + hillRnd() * 0.35));
    far.add(g, hillRnd() < 0.5 ? PAL.hill : 0x55685a, M(hl.x, hl.height / 2 - 2, hl.z, hillRnd() * 6));
  }

  const townMesh = town.mesh(stoneMat, 'city_town');
  townMesh.castShadow = true; townMesh.receiveShadow = true;
  const glowMesh = glow.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffb45a, emissiveIntensity: 1.5, roughness: 0.6 }), 'city_glow');
  const farMesh = far.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }), 'city_hills');
  root.add(townMesh, glowMesh, farMesh);

  const toWorld = (p) => [p[0] + CITY_ORIGIN[0], p[1] + CITY_ORIGIN[1], p[2] + CITY_ORIGIN[2]];
  const toLocal = (p) => [p[0] - CITY_ORIGIN[0], p[1] - CITY_ORIGIN[1], p[2] - CITY_ORIGIN[2]];

  /** Visual-only life: the gate's light turns, the fountain ring floats, the lamps flicker. `t` stops under reduced motion. */
  function update(t) {
    portal.rotation.z = t * 0.12;
    portal.material.opacity = 0.82 + Math.sin(t * 0.9) * 0.12;
    ringGlyph.rotation.y = t * 0.3;
    ringGlyph.position.y = 3.9 + Math.sin(t * 0.7) * 0.1;
    for (const l of lights) { const p = l.userData.phase; l.intensity = l.userData.on ? 12 * (1 + 0.1 * (Math.sin(t * 7.3 + p) * 0.5 + Math.sin(t * 13.1 + p * 1.7) * 0.3)) : 0; }
  }
  /** Shows or hides the whole city; `pointLights` follows the quality tier. */
  function setActive(on, pointLights = true) {
    root.visible = on;
    for (const l of lights) { l.userData.on = on && pointLights; l.visible = on && pointLights; }
  }

  return {
    root, world, origin: CITY_ORIGIN, boards, lights, places: PLACES,
    spawn: () => ({ pos: toWorld(CITY_SPAWN.position), heading: CITY_SPAWN.heading }),
    toWorld, toLocal, update, setActive,
  };
}
