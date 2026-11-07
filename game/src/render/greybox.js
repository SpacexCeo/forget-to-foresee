// Greybox stand-ins for every catalog asset, shown (with a "not final art" label) until the real
// .glb exists and has streamed in. Each greybox is ONE merged mesh with vertex colors, so it costs a
// single draw call, plus a label sprite. Greyboxes also carry simple colliders and the same socket
// names as the real art (e.g. the anchor pads), so gameplay code works the same before art arrives.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { boxTriangles, prismTriangles, transformTriangles, MASK_ALL, MASK_CAMERA, MASK_PLAYER } from '../physics/collision.js';
import { assetByName } from './asset-catalog.js';
import { CLANS, ISLAND_RADIUS, SHORE_WIDTH, PLAZA_RADIUS, ANCHOR_ZONES, ANCHOR_ZONE_RADIUS, PATH_WIDTH, pathSegments } from '../scenes/layout.js';

const greyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });

class Builder {
  constructor() { this.parts = []; this.colliders = []; this.sockets = []; }

  /** Adds a primitive with a flat color, transformed by position / Euler rotation / scale. */
  add(geometry, color, { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], flat = false } = {}) {
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
    this.parts.push(g);
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
    const geo = mergeGeometries(this.parts, false);
    for (const g of this.parts) g.dispose();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, greyMaterial);
    mesh.name = name + '_greybox';
    mesh.castShadow = true; mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.name = name + '_greybox_root';
    group.add(mesh);
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
  b.add(new THREE.IcosahedronGeometry(0.085, 1), AMBER, { position: [0, 1.226, 0] });
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
  // Pale ring of six segments with a round hole in the middle (owner concept 07.11).
  const ring = [new THREE.Vector2(0.45, 0), new THREE.Vector2(1.6, 0), new THREE.Vector2(1.5, 0.9), new THREE.Vector2(0.45, 0.9), new THREE.Vector2(0.45, 0)];
  for (let i = 0; i < 6; i++) {
    const gap = (4 * Math.PI) / 180;
    b.add(new THREE.LatheGeometry(ring, 10, (i / 6) * Math.PI * 2 + gap / 2, Math.PI / 3 - gap), 0xe4e1d6);
    const a = ((i + 0.5) / 6) * Math.PI * 2;
    b.socket('socket_sector_' + i, [Math.sin(a) * 1.0, 0.91, Math.cos(a) * 1.0], a, { socket: 'sector', index: i });
  }
  b.add(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 20), CHARCOAL, { position: [0, 0.15, 0] });
  b.socket('socket_center', [0, 0.32, 0], 0, { socket: 'double_ring' });
  b.collidePrism(0, 0, 1.6, 0, 0.9, 12);
}

function shard(b) {
  b.add(new THREE.OctahedronGeometry(0.2, 0), 0xb9d6dd, { position: [0, 0.2, 0], scale: [0.55, 1, 0.55] });
  b.add(new THREE.OctahedronGeometry(0.09, 0), 0xdbe9ec, { position: [0.07, 0.12, 0.02], scale: [0.6, 1, 0.6], rotation: [0, 0, 0.5] });
}

const SHELL_STYLE = [
  { maxR: 3.0, power: 0.9, ridges: 9, sx: 1, skew: 0, phi: Math.PI * 2, twist: 1.1 },        // I  elongated, thin
  { maxR: 6.0, power: 0.5, ridges: 7, sx: 1, skew: 0, phi: Math.PI * 2, twist: 0.6 },        // II massive
  { maxR: 4.5, power: 0.65, ridges: 8, sx: 1.3, skew: 0.22, phi: Math.PI * 2, twist: 0.8 },  // III asymmetric
  { maxR: 4.6, power: 0.65, ridges: 8, sx: 1, skew: 0, phi: Math.PI * 1.55, twist: 0.8 },    // IV cracked open
];
const SHELL_H = 18;
/** Shell radius at height fraction t: an inverted cone (point down) closing in a low dome on top. */
function shellRadius(style, t) {
  const cone = style.maxR * Math.pow(Math.max(t, 0.004), style.power);
  const dome = t > 0.84 ? Math.sqrt(Math.max(0, 1 - ((t - 0.84) / 0.16) ** 2)) : 1;
  return cone * dome;
}

/** Faceted spiral Shell stand-in, point down (owner concept 07.11); the four differ by silhouette. */
function shell(b, n) {
  const style = SHELL_STYLE[n - 1];
  const pts = [];
  for (let i = 0; i <= 36; i++) {
    const t = i / 36;
    const ridge = 1 + 0.07 * Math.sin(t * style.ridges * Math.PI * 2);
    pts.push(new THREE.Vector2(Math.max(0.02, shellRadius(style, t) * ridge), t * SHELL_H));
  }
  const geo = new THREE.LatheGeometry(pts, 9, 0, style.phi);
  // Twist the facets into a spiral.
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), a = (y / SHELL_H) * style.twist * Math.PI * 2, x = pos.getX(i), z = pos.getZ(i);
    pos.setXYZ(i, x * Math.cos(a) - z * Math.sin(a) + style.skew * y, y, x * Math.sin(a) + z * Math.cos(a));
  }
  b.add(geo, n === 2 ? 0x8e9a95 : 0xb3bcb7, { scale: [style.sx, 1, 1], flat: true });
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 48 }, (_, i) => {
    const t = 0.06 + (i / 47) * 0.8, y = t * SHELL_H, r = shellRadius(style, t) * 1.03;
    const a = t * Math.PI * 2 * 3;
    return new THREE.Vector3((Math.cos(a) * r + style.skew * y) * style.sx, y, Math.sin(a) * r);
  }));
  b.add(new THREE.TubeGeometry(curve, 160, 0.16, 5, false), 0x5c6762);
  // Camera-only colliders: Shells float out of reach, but the camera must never enter them.
  for (let k = 0; k < 6; k++) {
    const y0 = (k / 6) * SHELL_H, y1 = ((k + 1) / 6) * SHELL_H;
    const r = shellRadius(style, Math.min(1, (k + 1) / 6 + 0.05)) * 1.1 * Math.max(1, style.sx) + 0.3;
    // Extended 0.25 m up and down: the code-driven hover (scenes/island.js) stays inside.
    b.collidePrism(style.skew * (y0 + y1) / 2 * style.sx, 0, r + 0.25, y0 - 0.25, y1 + 0.25, 10, MASK_CAMERA);
  }
}

function interior(b) {
  // Closed volume ~20 x 12 m, vault 12 m: floor, walls, ceiling, glass wall at the far end.
  const W = 20, D = 12, Hh = 12;
  b.box([W, 0.3, D], 0x6f7873, { position: [0, -0.15, 0] });
  b.box([W, 0.3, D], 0x59625d, { position: [0, Hh + 0.15, 0] });
  b.box([0.3, Hh, D], 0x7a837e, { position: [-W / 2 - 0.15, Hh / 2, 0] });
  b.box([0.3, Hh, D], 0x7a837e, { position: [W / 2 + 0.15, Hh / 2, 0] });
  b.box([W, Hh, 0.3], 0x7a837e, { position: [0, Hh / 2, D / 2 + 0.15] });
  b.box([12, 7, 0.1], 0xdfe8ea, { position: [0, 5, -D / 2 + 0.1] });
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
  const detail = (size, color, x, z) => { b.box(size, color, { position: [x, size[1] / 2, z] }); b.collideBox([x - size[0] / 2, 0, z - size[2] / 2], [x + size[0] / 2, size[1], z + size[2] / 2]); };
  const WOOD = 0x6b4f35;
  switch (clanId) {
    case 'iris': // violet tent, an iris flower
      b.add(new THREE.ConeGeometry(1.4, 2.4, 6), 0x8a6fc4, { position: [0, 1.2, -2.4], flat: true }); b.collidePrism(0, -2.4, 1.25, 0, 2.4, 6);
      detail([0.12, 1.0, 0.12], 0x5b7a4a, -2.2, -0.6); b.add(new THREE.IcosahedronGeometry(0.3, 0), 0xa58ad8, { position: [-2.2, 1.15, -0.6], flat: true });
      detail([0.9, 0.45, 0.6], 0x9c8fb8, 2.1, -0.8); break;
    case 'sol': // white crystals, scales
      for (const [x, z, s] of [[-0.6, -2.4, 1.3], [0.5, -2.6, 1.0], [0, -1.9, 0.7]]) b.add(new THREE.OctahedronGeometry(0.5, 0), 0xf2f3ef, { position: [x, 0.55 * s, z], scale: [0.6 * s, 1.2 * s, 0.6 * s], flat: true });
      b.collidePrism(0, -2.3, 1.1, 0, 1.4, 6);
      detail([1.0, 0.9, 0.5], 0xb7b19b, 2.1, -0.8); b.add(new THREE.OctahedronGeometry(0.35, 0), 0xe9ecea, { position: [-2.1, 0.4, -0.7], flat: true }); break;
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
      b.add(new THREE.TorusGeometry(1.3, 0.1, 6, 18, Math.PI), 0xbfe0ec, { position: [0, 0, -2.4] });
      b.collidePrism(-1.3, -2.4, 0.15, 0, 1.3, 6); b.collidePrism(1.3, -2.4, 0.15, 0, 1.3, 6);
      detail([1.2, 0.8, 0.6], 0xbfd9e4, -2.1, -0.7); detail([0.2, 1.4, 0.2], 0x9fc4d6, 2.2, -0.8); break;
    default: break;
  }
}

/** Deterministic pseudo-random numbers for repeatable greybox rocks and trees. */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function island(b) {
  const R = ISLAND_RADIUS, rand = rng(7);
  const SAND = 0xcdb98f;
  b.add(new THREE.CircleGeometry(R, 72), 0x7f8f84, { rotation: [-Math.PI / 2, 0, 0] });
  // Rocky low-poly cliffs dropping into the sea.
  const cliff = new THREE.CylinderGeometry(R + 0.2, R + SHORE_WIDTH, 4, 30, 3, true);
  const cp = cliff.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), r = Math.hypot(x, z);
    const k = y > 1.99 ? 0 : 1 + (rand() - 0.5) * 0.06;
    cp.setXYZ(i, (x / r) * r * k, y + (y > 1.99 ? 0 : (rand() - 0.5) * 0.6), (z / r) * r * k);
  }
  b.add(cliff, 0x6d706b, { position: [0, -2, 0], flat: true });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand() * 0.2, r = R + 1 + rand() * 2.5, s = 0.8 + rand() * 1.6;
    b.add(new THREE.DodecahedronGeometry(s, 0), 0x63665f, { position: [Math.cos(a) * r, -0.9 + rand() * 0.5, Math.sin(a) * r], rotation: [rand() * 3, rand() * 3, 0], flat: true });
  }
  b.add(new THREE.CircleGeometry(PLAZA_RADIUS, 48), SAND, { position: [0, 0.02, 0], rotation: [-Math.PI / 2, 0, 0] });
  for (const [a, c] of pathSegments()) {
    const dx = c[0] - a[0], dz = c[2] - a[2], len = Math.hypot(dx, dz);
    b.box([PATH_WIDTH, 0.02, len + PATH_WIDTH * 0.5], SAND, { position: [(a[0] + c[0]) / 2, 0.03, (a[2] + c[2]) / 2], rotation: [0, Math.atan2(dx, dz), 0] });
  }
  for (const z of ANCHOR_ZONES) {
    b.add(new THREE.CircleGeometry(ANCHOR_ZONE_RADIUS, 40), 0x66726c, { position: [z.position[0], 0.04, z.position[2]], rotation: [-Math.PI / 2, 0, 0] });
    b.add(new THREE.RingGeometry(ANCHOR_ZONE_RADIUS - 0.2, ANCHOR_ZONE_RADIUS, 48), 0xd9a441, { position: [z.position[0], 0.05, z.position[2]], rotation: [-Math.PI / 2, 0, 0] });
  }
  // A few pines near the shore, kept clear of the anchor-zone diagonals.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26 + rand() * 0.15, r = R - 3.2 - rand() * 1.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 2.4 + rand() * 1.4;
    b.add(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 5), 0x5a4532, { position: [x, 0.45, z] });
    b.add(new THREE.ConeGeometry(0.85, h, 6), 0x3f5a46, { position: [x, 0.9 + h / 2, z], flat: true });
    b.collidePrism(x, z, 0.3, 0, 2, 6);
  }
  // Ground: a flat fan slightly larger than the visible disc; a player-only rim keeps Iris on land.
  const ground = [];
  const n = 48, gr = R + 0.5;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    ground.push(0, 0, 0, Math.cos(a1) * gr, 0, Math.sin(a1) * gr, Math.cos(a0) * gr, 0, Math.sin(a0) * gr);
  }
  b.colliders.push({ tris: ground, mask: MASK_ALL });
  const rim = [], rr = R - 0.6;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const ax = Math.cos(a0) * rr, az = Math.sin(a0) * rr, bx = Math.cos(a1) * rr, bz = Math.sin(a1) * rr;
    rim.push(ax, -1, az, bx, -1, bz, bx, 3, bz, ax, -1, az, bx, 3, bz, ax, 3, az);
  }
  b.colliders.push({ tris: rim, mask: MASK_PLAYER });
}

/** Builds the greybox for a catalog asset by exact name. */
export function buildGreybox(name) {
  const def = assetByName(name);
  const b = new Builder();
  if (name === 'anchor') anchor(b);
  else if (name === 'scroll_table') scrollTable(b);
  else if (name === 'shard') shard(b);
  else if (/^shell_[1-4]$/.test(name)) shell(b, Number(name.slice(6)));
  else if (name === 'shell_interior') interior(b);
  else if (name.startsWith('camp_')) camp(b, name.slice(5));
  else if (name === 'island') island(b);
  else b.box([1, 1, 1], 0xff00ff, { position: [0, 0.5, 0] });
  const built = b.build(name);
  const labelY = name === 'island' ? 0.8 : /^shell_/.test(name) ? -0.6 : (def ? def.height : 1) + 0.35;
  const label = makeLabel((def ? def.label : name) + ' \u00b7 not final art', def && def.kind === 'hero' ? 0.015 : 0.019);
  label.position.set(0, labelY, name === 'island' ? ISLAND_RADIUS - 6 : 0);
  built.object.add(label);
  return built;
}

export { greyMaterial };
