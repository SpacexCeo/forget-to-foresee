// Greybox stand-ins for every catalog asset, shown (with a "not final art" label) until the real
// .glb exists and has streamed in. Each greybox is merged into ONE mesh per material slot (default
// grey, nacre, glass, amber, gold, cloth; render/materials.js) with vertex colors, so a plain prop
// costs a single draw call and a Shell one nacre draw call, plus a label sprite. Greyboxes also
// carry simple colliders and the same socket names as the real art (e.g. the anchor pads), so
// gameplay code works the same before art arrives.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { boxTriangles, prismTriangles, transformTriangles, MASK_ALL, MASK_CAMERA, MASK_PLAYER } from '../physics/collision.js';
import { assetByName } from './asset-catalog.js';
import { SLOT_MATERIALS, greyMaterial } from './materials.js';
import { LAYER_OVERLAY } from './layers.js';
import { CLANS, ANCHOR_ZONES, ANCHOR_ZONE_RADIUS, RAIL_HEIGHT, PILLAR_DEPTH, platforms, bridges, parapetOpenings } from '../scenes/layout.js';

class Builder {
  constructor() { this.parts = new Map(); this.colliders = []; this.sockets = []; }

  /** Adds a primitive with a flat color, transformed by position / Euler rotation / scale, into a material slot. */
  add(geometry, color, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], flat = false, slot = 'default' } = {}) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    g.applyMatrix4(m);
    if (flat) g.computeVertexNormals(); // non-indexed: one normal per face = faceted look
    const c = new THREE.Color(color);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!this.parts.has(slot)) this.parts.set(slot, []);
    this.parts.get(slot).push(g);
    return this;
  }

  box(size, color, opts = {}) { return this.add(new THREE.BoxGeometry(...size), color, opts); }

  collideBox(min, max, mask = MASK_ALL) { this.colliders.push({ tris: boxTriangles(min, max), mask }); return this; }
  collidePrism(cx, cz, r, y0, y1, sides = 8, mask = MASK_ALL) { this.colliders.push({ tris: prismTriangles(cx, cz, r, y0, y1, sides), mask }); return this; }
  collideRotatedBox(size, position, rotationY, mask = MASK_ALL) {
    const [sx, sy, sz] = size;
    const local = boxTriangles([-sx / 2, -sy / 2, -sz / 2], [sx / 2, sy / 2, sz / 2]);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY), new THREE.Vector3(1, 1, 1));
    this.colliders.push({ tris: transformTriangles(local, m.elements), mask });
    return this;
  }

  socket(name, position, rotationY = 0, userData = {}) { this.sockets.push({ name, position, rotationY, userData }); return this; }

  build(name) {
    const group = new THREE.Group();
    group.name = name + '_greybox_root';
    let mesh = null;
    for (const [slot, parts] of this.parts) {
      const geo = mergeGeometries(parts, false);
      for (const g of parts) g.dispose();
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, SLOT_MATERIALS[slot] || greyMaterial);
      m.name = name + '_greybox' + (slot === 'default' ? '' : '_' + slot);
      m.castShadow = slot !== 'glass'; m.receiveShadow = true;
      m.userData.lookdevSlot = slot;
      group.add(m);
      if (slot === 'default' || !mesh) mesh = m;
    }
    const sockets = new Map();
    for (const s of this.sockets) {
      const o = new THREE.Object3D();
      o.name = s.name; o.position.set(...s.position); o.rotation.y = s.rotationY;
      o.userData = { name: s.name, ...s.userData };
      group.add(o); sockets.set(s.name, o);
    }
    return { object: group, mesh, colliders: this.colliders, sockets };
  }
}

/* ---------- label sprites ---------- */
const labelCache = new Map();
/**
 * Text sprite with a constant on-screen size: `screenHeight` is the label height at 1 m from the
 * camera (sizeAttenuation off), so 0.03 is roughly 5% of the view height at the default FOV.
 */
export function makeLabel(text, screenHeight = 0.03) {
  let tex = labelCache.get(text);
  if (!tex) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const font = '600 44px system-ui, sans-serif';
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 40;
    canvas.width = w; canvas.height = 72;
    ctx.font = font;
    ctx.fillStyle = 'rgba(20, 24, 22, 0.78)';
    ctx.beginPath(); ctx.roundRect(0, 0, w, 72, 14); ctx.fill();
    ctx.fillStyle = '#e9efe9'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 20, 38);
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData.aspect = w / 72;
    labelCache.set(text, tex);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: false, fog: false }));
  sprite.scale.set(screenHeight * tex.userData.aspect, screenHeight, 1);
  sprite.renderOrder = 10;
  sprite.name = 'label';
  sprite.layers.set(LAYER_OVERLAY);
  return sprite;
}

/* ---------- per-asset greyboxes ---------- */
const STONE = 0x7d8781, CHARCOAL = 0x4a4f4c, PAD = 0xc9d3cc, AMBER = 0xd9a441, BRONZE = 0x8a7350;

function anchor(b) {
  // Dimensions follow docs/art/HANDOFF-anchor.md so socket positions match the real anchor.glb.
  b.add(new THREE.CylinderGeometry(0.28, 0.28, 0.11, 16), CHARCOAL, { position: [0, 0.055, 0] });
  for (const deg of [180, 300, 60]) {
    const a = (deg * Math.PI) / 180;
    b.box([0.05, 0.42, 0.3], STONE, { position: [Math.sin(a) * 0.29, 0.21 + 0.11, Math.cos(a) * 0.29], rotation: [0, a, 0] });
  }
  b.add(new THREE.CylinderGeometry(0.13, 0.17, 0.41, 12), STONE, { position: [0, 0.315, 0] });
  b.add(new THREE.CylinderGeometry(0.162, 0.162, 0.34, 8), STONE, { position: [0, 0.69, 0], rotation: [0, Math.PI / 8, 0] });
  for (const z of [1, -1]) {
    b.box([0.094, 0.112, 0.012], PAD, { position: [0, 0.765, 0.148 * z] });
    b.box([0.094, 0.072, 0.012], PAD, { position: [0, 0.63, 0.148 * z] });
  }
  b.add(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 10), STONE, { position: [0, 0.94, 0] });
  b.add(new THREE.CylinderGeometry(0.2, 0.19, 0.05, 16), BRONZE, { position: [0, 1.045, 0] });
  b.add(new THREE.IcosahedronGeometry(0.085, 1), AMBER, { position: [0, 1.226, 0], slot: 'amber' });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.add(new THREE.CylinderGeometry(0.01, 0.01, 0.36, 4), BRONZE, { position: [Math.sin(a) * 0.16, 1.25, Math.cos(a) * 0.16] });
  }
  b.add(new THREE.ConeGeometry(0.15, 0.2, 10), STONE, { position: [0, 1.53, 0] });
  b.collidePrism(0, 0, 0.42, 0, 0.45, 8).collidePrism(0, 0, 0.2, 0.45, 1.6, 8);
  const pad = (face, role, y, size) => b.socket(`socket_${role === 'tick' ? 'tick' : 'shell'}_${face}`, [0, y, 0.154 * (face === 'front' ? 1 : -1)], face === 'front' ? 0 : Math.PI,
    { socket: role, face, pad_size_m: size, outward_normal_gltf: [0, 0, face === 'front' ? 1 : -1] });
  pad('front', 'shell_number', 0.765, [0.094, 0.112]); pad('front', 'tick', 0.63, [0.094, 0.072]);
  pad('back', 'shell_number', 0.765, [0.094, 0.112]); pad('back', 'tick', 0.63, [0.094, 0.072]);
  b.socket('socket_beacon', [0, 1.226, 0], 0, { socket: 'beacon' });
}

function scrollTable(b) {
  // The Scroll as a large floor medallion with gold inlay, six sector sockets (one per clan) and a
  // small centre piece holding the double-ring recess (owner concept 07.11, third image).
  const GOLD = 0xc9a24a;
  b.add(new THREE.CylinderGeometry(3.6, 3.6, 0.06, 48), 0xb9b4a6, { position: [0, 0.03, 0] });
  for (const [r0, r1] of [[3.2, 3.36], [2.1, 2.2], [0.95, 1.02]]) b.add(new THREE.RingGeometry(r0, r1, 64), GOLD, { position: [0, 0.065, 0], rotation: [-Math.PI / 2, 0, 0], slot: 'gold' });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.box([0.08, 0.012, 2.2], GOLD, { position: [Math.sin(a) * 2.1, 0.066, Math.cos(a) * 2.1], rotation: [0, a, 0], slot: 'gold' });
    const m = a + Math.PI / 6;
    b.socket('socket_sector_' + i, [Math.sin(m) * 2.65, 0.07, Math.cos(m) * 2.65], m, { socket: 'sector', index: i });
  }
  b.add(new THREE.CylinderGeometry(0.42, 0.55, 0.5, 12), 0x9a958a, { position: [0, 0.25, 0], flat: true });
  b.add(new THREE.TorusGeometry(0.3, 0.05, 6, 20), GOLD, { position: [0, 0.52, 0], rotation: [-Math.PI / 2, 0, 0], slot: 'gold' });
  b.socket('socket_center', [0, 0.55, 0], 0, { socket: 'double_ring' });
  b.collidePrism(0, 0, 3.6, 0, 0.06, 24);           // low enough to walk onto
  b.collidePrism(0, 0, 0.55, 0, 0.55, 10);
}

function shard(b) {
  b.add(new THREE.OctahedronGeometry(0.2, 0), 0xb9d6dd, { position: [0, 0.2, 0], scale: [0.55, 1, 0.55], slot: 'glass' });
  b.add(new THREE.OctahedronGeometry(0.09, 0), 0xdbe9ec, { position: [0.07, 0.12, 0.02], scale: [0.6, 1, 0.6], rotation: [0, 0, 0.5], slot: 'glass' });
}

// Ammonite-like coiled Shells (owner concept 07.11, third image): a planispiral tube growing
// logarithmically, coil plane facing the plaza. I elongated, II massive, III asymmetric, IV cracked.
const SHELL_STYLE = [
  { turns: 3.2, growth: 0.16, thick: 0.42, sx: 0.8, sy: 1.25, skew: 0, crack: 0 },
  { turns: 3.0, growth: 0.17, thick: 0.55, sx: 1.05, sy: 1.0, skew: 0, crack: 0 },
  { turns: 3.1, growth: 0.18, thick: 0.45, sx: 1.15, sy: 0.92, skew: 0.18, crack: 0 },
  { turns: 3.2, growth: 0.17, thick: 0.46, sx: 1, sy: 1, skew: 0, crack: 0.22 },
];
const SHELL_H = 18;
/** Shell radius at height fraction t: an inverted cone (point down) closing in a low dome on top. */
function spiralShellGeometry(style) {
  // Path: r(theta) = a * e^(k theta) in the XY plane; tube radius proportional to r.
  const k = style.growth, steps = 120, ring = 9;
  const thetaMax = style.turns * Math.PI * 2;
  const a = 1;
  const rMax = a * Math.exp(k * thetaMax);
  const pos = [];
  const pt = (th) => { const r = a * Math.exp(k * th); return [Math.cos(th) * r, Math.sin(th) * r, r]; };
  const rings = [];
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * thetaMax;
    const [x, y, r] = pt(th);
    const [x2, y2] = pt(th + 0.01);
    const t = [x2 - x, y2 - y]; const tl = Math.hypot(t[0], t[1]); t[0] /= tl; t[1] /= tl;
    const nrm = [-t[1], t[0]]; // in-plane normal
    const rho = r * style.thick;
    const verts = [];
    for (let j = 0; j < ring; j++) {
      const ph = (j / ring) * Math.PI * 2;
      verts.push([x + nrm[0] * Math.cos(ph) * rho, y + nrm[1] * Math.cos(ph) * rho, Math.sin(ph) * rho * 0.9]);
    }
    rings.push(verts);
  }
  const crackFrom = Math.floor(steps * (1 - style.crack));
  for (let i = 0; i < steps; i++) {
    if (style.crack && i >= crackFrom && (i % 3 !== 0)) continue; // broken outer whorl
    for (let j = 0; j < ring; j++) {
      const A = rings[i][j], B = rings[i][(j + 1) % ring], C = rings[i + 1][(j + 1) % ring], D = rings[i + 1][j];
      pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // Fit: total height SHELL_H with the bottom at y = 0 and the coil centered on X.
  g.computeBoundingBox();
  const bb = g.boundingBox, h = bb.max.y - bb.min.y;
  const s = SHELL_H / h;
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, 0);
  g.scale(s * style.sx, s * style.sy, s);
  void rMax;
  return g;
}

/** Faceted spiral Shell stand-in, point down (owner concept 07.11); the four differ by silhouette. */
function shell(b, n) {
  const style = SHELL_STYLE[n - 1];
  const geo = spiralShellGeometry(style);
  if (style.skew) geo.applyMatrix4(new THREE.Matrix4().set(1, style.skew, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));
  geo.computeBoundingBox();
  const bb = geo.boundingBox.clone();
  b.add(geo, n === 2 ? 0xe6e2de : 0xf1ede9, { flat: true, slot: 'nacre' });
  // Camera-only collider: the coil's box with a 0.25 m margin for the code-driven hover.
  const m = 0.25;
  b.collideBox([bb.min.x - m, bb.min.y - m, bb.min.z - m], [bb.max.x + m, bb.max.y + m, bb.max.z + m], MASK_CAMERA);
}

function interior(b) {
  // Closed volume ~20 x 12 m, vault 12 m: floor, walls, ceiling, glass wall at the far end.
  const W = 20, D = 12, Hh = 12;
  b.box([W, 0.3, D], 0x6f7873, { position: [0, -0.15, 0] });
  b.box([W, 0.3, D], 0x59625d, { position: [0, Hh + 0.15, 0] });
  b.box([0.3, Hh, D], 0x7a837e, { position: [-W / 2 - 0.15, Hh / 2, 0] });
  b.box([0.3, Hh, D], 0x7a837e, { position: [W / 2 + 0.15, Hh / 2, 0] });
  b.box([W, Hh, 0.3], 0x7a837e, { position: [0, Hh / 2, D / 2 + 0.15] });
  b.box([12, 7, 0.1], 0xdfe8ea, { position: [0, 5, -D / 2 + 0.1], slot: 'glass' });
  // Amber floor lights along the walk to the glass wall (owner concept: dark wet stone, amber inlays).
  for (const x of [-3, 3]) for (const z of [-3.5, -1, 1.5, 4]) b.box([0.35, 0.02, 0.2], 0xffc270, { position: [x, 0.01, z], slot: 'amber' });
  b.box([W, Hh, 0.3], 0x7a837e, { position: [0, Hh / 2, -D / 2 - 0.15] });
  b.collideBox([-W / 2, -0.3, -D / 2], [W / 2, 0, D / 2]).collideBox([-W / 2, Hh, -D / 2], [W / 2, Hh + 0.3, D / 2]);
  b.collideBox([-W / 2 - 0.3, 0, -D / 2], [-W / 2, Hh, D / 2]).collideBox([W / 2, 0, -D / 2], [W / 2 + 0.3, Hh, D / 2]);
  b.collideBox([-W / 2, 0, D / 2], [W / 2, Hh, D / 2 + 0.3]).collideBox([-W / 2, 0, -D / 2 - 0.3], [W / 2, Hh, -D / 2]);
}

/** Clan camp: plot, hologram circle (free 2 m circle in the middle), shelter behind, 2-3 details. */
function camp(b, clanId) {
  const clan = CLANS.find((c) => c.id === clanId);
  const tint = new THREE.Color(0x8d9a8c).lerp(new THREE.Color(clan.color), 0.2).getHex();
  b.add(new THREE.CylinderGeometry(3.9, 4.0, 0.06, 8), tint, { position: [0, 0.03, 0], rotation: [0, Math.PI / 8, 0] });
  b.add(new THREE.RingGeometry(0.95, 1.1, 32), 0xe8e2c8, { position: [0, 0.07, 0], rotation: [-Math.PI / 2, 0, 0] });
  const detail = (size, color, x, z, slot = 'default') => { b.box(size, color, { position: [x, size[1] / 2, z], slot }); b.collideBox([x - size[0] / 2, 0, z - size[2] / 2], [x + size[0] / 2, size[1], z + size[2] / 2]); };
  const WOOD = 0x6b4f35;
  // Two warm lanterns on posts flank the shelter (owner references: lantern glow in every camp).
  for (const x of [-1.9, 1.9]) {
    b.add(new THREE.CylinderGeometry(0.04, 0.05, 1.7, 6), WOOD, { position: [x, 0.85, -1.4] });
    b.box([0.22, 0.26, 0.22], 0xffd27a, { position: [x, 1.55, -1.4], slot: 'amber' });
    b.add(new THREE.ConeGeometry(0.2, 0.12, 4), 0x3a322b, { position: [x, 1.74, -1.4], rotation: [0, Math.PI / 4, 0] });
    b.socket('socket_lantern_' + (x < 0 ? 'l' : 'r'), [x, 1.55, -1.4], 0, { socket: 'lantern' });
  }
  switch (clanId) {
    case 'iris': // violet tent, an iris flower
      b.add(new THREE.ConeGeometry(1.4, 2.4, 6), 0x8a6fc4, { position: [0, 1.2, -2.4], flat: true, slot: 'cloth' }); b.collidePrism(0, -2.4, 1.25, 0, 2.4, 6);
      detail([0.12, 1.0, 0.12], 0x5b7a4a, -2.2, -0.6); b.add(new THREE.IcosahedronGeometry(0.3, 0), 0xa58ad8, { position: [-2.2, 1.15, -0.6], flat: true });
      detail([0.9, 0.45, 0.6], 0x9c8fb8, 2.1, -0.8); break;
    case 'sol': // white crystals, scales
      for (const [x, z, s] of [[-0.6, -2.4, 1.3], [0.5, -2.6, 1.0], [0, -1.9, 0.7]]) b.add(new THREE.OctahedronGeometry(0.5, 0), 0xf2f3ef, { position: [x, 0.55 * s, z], scale: [0.6 * s, 1.2 * s, 0.6 * s], flat: true, slot: 'glass' });
      b.collidePrism(0, -2.3, 1.1, 0, 1.4, 6);
      detail([1.0, 0.9, 0.5], 0xb7b19b, 2.1, -0.8); b.add(new THREE.OctahedronGeometry(0.35, 0), 0xe9ecea, { position: [-2.1, 0.4, -0.7], flat: true, slot: 'glass' }); break;
    case 'pepel': // wooden frame and palisade: fear and defense
      for (const x of [-1.1, 1.1]) for (const z of [-3.2, -1.6]) detail([0.16, 2.2, 0.16], WOOD, x, z);
      b.box([2.5, 0.14, 0.16], WOOD, { position: [0, 2.2, -3.2] }); b.box([2.5, 0.14, 0.16], WOOD, { position: [0, 2.2, -1.6] });
      for (let i = 0; i < 6; i++) detail([0.18, 1.5 + (i % 2) * 0.35, 0.18], 0x4a3a2a, -2.9 + i * 0.3, -0.9); break;
    case 'moh': // soft, open, a shared green cauldron
      b.add(new THREE.ConeGeometry(1.5, 1.8, 7), 0x6f8f55, { position: [0, 0.9, -2.5], flat: true }); b.collidePrism(0, -2.5, 1.3, 0, 1.8, 7);
      b.add(new THREE.CylinderGeometry(0.6, 0.45, 0.65, 12), 0x4f6b3c, { position: [2.1, 0.33, -0.6] }); b.collidePrism(2.1, -0.6, 0.6, 0, 0.65, 8);
      detail([0.8, 0.3, 0.8], 0x7e9a63, -2.1, -0.8); break;
    case 'yantar': // warm chests, scales and locks
      b.add(new THREE.ConeGeometry(1.4, 2.2, 4), 0xc98f3a, { position: [0, 1.1, -2.4], rotation: [0, Math.PI / 4, 0], flat: true }); b.collidePrism(0, -2.4, 1.2, 0, 2.2, 4);
      detail([0.8, 0.55, 0.5], 0xb57a2e, -2.1, -0.7); detail([0.7, 0.5, 0.5], 0xd59a3a, 2.1, -0.9); detail([0.6, 0.45, 0.45], 0x9a6a2e, 2.3, 0.3); break;
    case 'iney': // cold glass arch, instruments, tables of signs
      b.add(new THREE.TorusGeometry(1.3, 0.1, 6, 18, Math.PI), 0xbfe0ec, { position: [0, 0, -2.4], slot: 'glass' });
      // Glass pavilion canopy on four slender posts (owner concept: Frost = glass pavilion).
      for (const [x, z] of [[-1.3, -3.4], [1.3, -3.4], [-1.3, -1.4], [1.3, -1.4]]) b.add(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 6), 0x9fb4bd, { position: [x, 1.2, z] });
      b.add(new THREE.ConeGeometry(2.0, 1.1, 4), 0xd8eef7, { position: [0, 2.95, -2.4], rotation: [0, Math.PI / 4, 0], flat: true, slot: 'glass' });
      b.collidePrism(-1.3, -2.4, 0.15, 0, 1.3, 6); b.collidePrism(1.3, -2.4, 0.15, 0, 1.3, 6);
      detail([1.2, 0.8, 0.6], 0xbfd9e4, -2.1, -0.7, 'glass'); detail([0.2, 1.4, 0.2], 0x9fc4d6, 2.2, -0.8, 'glass'); break;
    default: break;
  }
}

/** Deterministic pseudo-random numbers for repeatable greybox rocks and trees. */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Flat walkable disc collider (triangle fan) at y. */
function discTris(cx, cz, r, y = 0, n = 32) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    out.push(cx, y, cz, cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r, cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r);
  }
  return out;
}

/**
 * The archipelago (owner concept 07.11, third image): plaza and camp plateaus on faceted rock
 * pillars that sink into the clouds, a balcony, railed stone bridges and parapets with openings.
 * Every bridge has railings with colliders so the capsule cannot walk off it.
 */
function island(b) {
  const rand = rng(7);
  const ROCK = 0x6d716c, ROCK_DARK = 0x5a5e5a, STONE_TOP = 0xa7ab9f, PAVING = 0xbdb6a2, GRASS = 0x7f8f74;
  for (const p of platforms()) {
    const [cx, , cz] = p.center, r = p.radius;
    // Walk surface, a terrace step below it, and the pillar down into the clouds.
    b.add(new THREE.CylinderGeometry(r, r, 0.6, 28), p.id === 'plaza' ? PAVING : p.id === 'balcony' ? STONE_TOP : GRASS, { position: [cx, -0.3, cz] });
    b.add(new THREE.CylinderGeometry(r + 0.9, r + 0.6, 1.4, 14), ROCK, { position: [cx, -1.6, cz], flat: true });
    const pillar = new THREE.CylinderGeometry(r * 0.95, r * 0.45, PILLAR_DEPTH, 12, 6, true);
    const pp = pillar.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), k = 1 + (rand() - 0.5) * 0.18;
      pp.setXYZ(i, x * k, y, z * k);
    }
    b.add(pillar, ROCK_DARK, { position: [cx, -2.3 - PILLAR_DEPTH / 2, cz], flat: true });
    b.colliders.push({ tris: discTris(cx, cz, r), mask: MASK_ALL });
    // Parapet ring with openings where bridges attach.
    const openings = parapetOpenings(p.id);
    const n = p.id === 'plaza' ? 36 : 22;
    const halfOpen = (Math.asin(Math.min(1, 1.5 / r)) * 180) / Math.PI;
    for (let i = 0; i < n; i++) {
      const midDeg = ((i + 0.5) / n) * 360;
      const segHalf = 180 / n;
      if (openings.some((o) => Math.abs(((midDeg - o + 540) % 360) - 180) < halfOpen + segHalf)) continue;
      const a = (midDeg * Math.PI) / 180, len = 2 * r * Math.sin(Math.PI / n) + 0.05;
      const px = cx + Math.cos(a) * (r - 0.15), pz = cz + Math.sin(a) * (r - 0.15);
      const rotY = -a + Math.PI / 2;
      b.box([len, RAIL_HEIGHT * 0.8, 0.3], STONE_TOP, { position: [px, RAIL_HEIGHT * 0.4, pz], rotation: [0, rotY, 0] });
      b.collideRotatedBox([len, RAIL_HEIGHT * 0.8, 0.3], [px, RAIL_HEIGHT * 0.4, pz], rotY);
    }
  }
  for (const br of bridges()) {
    const [ax, , az] = br.from, [cx, , cz] = br.to;
    const dx = cx - ax, dz = cz - az, len = Math.hypot(dx, dz), rotY = Math.atan2(dx, dz);
    const mx = (ax + cx) / 2, mz = (az + cz) / 2;
    b.box([br.width, 0.5, len], STONE_TOP, { position: [mx, -0.25, mz], rotation: [0, rotY, 0] });
    // A keel under the deck (the arch is left to the island art).
    b.box([br.width * 0.6, 0.7, len - 0.6], ROCK, { position: [mx, -0.85, mz], rotation: [0, rotY, 0] });
    b.collideRotatedBox([br.width, 0.5, len], [mx, -0.25, mz], rotY);
    // Railings on both sides (colliders for player and camera).
    for (const side of [-1, 1]) {
      const ox = Math.cos(rotY) * side * (br.width / 2 - 0.1), oz = -Math.sin(rotY) * side * (br.width / 2 - 0.1);
      b.box([0.2, RAIL_HEIGHT, len], STONE_TOP, { position: [mx + ox, RAIL_HEIGHT / 2, mz + oz], rotation: [0, rotY, 0] });
      b.collideRotatedBox([0.2, RAIL_HEIGHT, len], [mx + ox, RAIL_HEIGHT / 2, mz + oz], rotY);
    }
  }
  for (const z of ANCHOR_ZONES) {
    b.add(new THREE.CircleGeometry(ANCHOR_ZONE_RADIUS, 32), 0x8e958c, { position: [z.position[0], 0.02, z.position[2]], rotation: [-Math.PI / 2, 0, 0] });
    b.add(new THREE.RingGeometry(ANCHOR_ZONE_RADIUS - 0.12, ANCHOR_ZONE_RADIUS, 40), 0xd9a441, { position: [z.position[0], 0.03, z.position[2]], rotation: [-Math.PI / 2, 0, 0], slot: 'gold' });
  }
  // A few pines on the camp plateaus' outer edges.
  for (const p of platforms()) {
    if (!p.id.startsWith('plateau_')) continue;
    const [cx, , cz] = p.center, out = Math.atan2(cz, cx);
    for (const da of [-0.55, 0.6]) {
      const a = out + da, r = p.radius - 1.1, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, h = 2.2 + rand() * 1.2;
      b.add(new THREE.CylinderGeometry(0.1, 0.14, 0.8, 5), 0x5a4532, { position: [x, 0.4, z] });
      b.add(new THREE.ConeGeometry(0.75, h, 6), 0x3f5a46, { position: [x, 0.8 + h / 2, z], flat: true });
      b.collidePrism(x, z, 0.28, 0, 2, 6);
    }
  }
}

function fill(b, name) {
  if (name === 'anchor') anchor(b);
  else if (name === 'scroll_table') scrollTable(b);
  else if (name === 'shard') shard(b);
  else if (/^shell_[1-4]$/.test(name)) shell(b, Number(name.slice(6)));
  else if (name === 'shell_interior') interior(b);
  else if (name.startsWith('camp_')) camp(b, name.slice(5));
  else if (name === 'island') island(b);
  else b.box([1, 1, 1], 0xff00ff, { position: [0, 0.5, 0] });
}

/**
 * Only the colliders of a greybox (local space), with no mesh, material or label sprite. Runs under
 * node: the authoritative room (game/src/net/world-map.js) builds its collision world from these, so
 * the server validates movement against exactly the colliders the client walks on.
 */
export function greyboxColliders(name) {
  const b = new Builder();
  fill(b, name);
  for (const list of b.parts.values()) for (const g of list) g.dispose();
  return b.colliders;
}

/** Builds the greybox for a catalog asset by exact name. */
export function buildGreybox(name) {
  const def = assetByName(name);
  const b = new Builder();
  fill(b, name);
  const built = b.build(name);
  const labelY = name === 'island' ? 1.6 : /^shell_/.test(name) ? -0.6 : (def ? def.height : 1) + 0.35;
  const label = makeLabel((def ? def.label : name) + ' \u00b7 not final art', def && def.kind === 'hero' ? 0.015 : 0.019);
  label.position.set(0, labelY, 0);
  built.object.add(label);
  return built;
}

export { greyMaterial };
