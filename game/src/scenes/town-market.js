// The market square's stalls and the town's banners (owner 14.11: "replace the crude primitives"). The town pieces
// (art/town/build_town.py) bake a box stall and a short banner into their merged meshes; when a piece loads, the
// triangles of those props are cut out of its visual meshes (the colliders stay, so paths and prompts do not move) and
// in their place stand: Kenney's market stalls (Fantasy Town Kit, CC0, models market_stall_red/green.glb), and long
// hanging banners drawn here: a pole on a stone foot, a crossbar with gold finials, a 3.6 m swallow-tailed cloth with
// a gold border and the town's ring emblem, swaying gently in the wind (reduced motion holds them still).
import * as THREE from 'three';
import { TOWN_ORIGIN } from './town-layout.js';

const Y = { t0: 0.0, t1: 2.5, t2: 4.5, t3: 9.5 };   // art/town/town_plan.py TERRACES
/** [x, y, z, rot deg, variant]: the stalls of art/town/build_town.py (H.stall), town-local metres. */
export const MARKET_STALLS = Object.freeze([
  [17.2, Y.t0, 13.4, 0, 0], [21.8, Y.t0, 13.4, 0, 1], [26.4, Y.t0, 13.4, 0, 0],
  [11.6, Y.t2, -4.6, -90, 1], [11.6, Y.t2, -15.4, -90, 0], [-11.6, Y.t2, -15.2, 90, 1],
]);
/** [x, y, z, rot deg, colour, pole height]: the banners of build_town.py (H.banner). */
export const TOWN_BANNERS = Object.freeze([
  [-5.9, Y.t0, 19.0, 0, '#7a2a20', 5.2], [5.9, Y.t0, 19.0, 180, '#2f4c55', 5.2],
  [-4.9, Y.t1, 3.6, 0, '#77501f', 5.2], [4.9, Y.t1, 3.6, 180, '#7a2a20', 5.2],
  [-6.6, Y.t2, -20.6, 0, '#7a2a20', 5.2], [6.6, Y.t2, -20.6, 180, '#7a2a20', 5.2],
  [-12.6, Y.t3, -33.4, 0, '#7a2a20', 6.0], [12.6, Y.t3, -33.4, 180, '#7a2a20', 6.0],
]);
// what each old prop occupied in its own frame (build_town.py: a 2.8 x 1.5 stall with its awning out front; a banner's
// pole at the origin, its arm and cloth along +x): [xmin, xmax, ymin, ymax, zmin, zmax]
const STALL_BOX = [-1.75, 1.75, 0.03, 2.8, -1.05, 1.6];
const BANNER_BOX = [-0.35, 1.15, 0.02, 6.4, -0.3, 0.3];

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const frame = ([x, y, z, rot]) => new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(rot)).setPosition(x + TOWN_ORIGIN[0], y + TOWN_ORIGIN[1], z + TOWN_ORIGIN[2]);
const CUTS = [...MARKET_STALLS.map((s) => [new THREE.Matrix4().copy(frame(s)).invert(), STALL_BOX]), ...TOWN_BANNERS.map((b) => [new THREE.Matrix4().copy(frame(b)).invert(), [...BANNER_BOX.slice(0, 3), b[5] + 0.3, ...BANNER_BOX.slice(4)]])];
const inBox = (p, [inv, b]) => { _p.copy(p).applyMatrix4(inv); return _p.x > b[0] && _p.x < b[1] && _p.y > b[2] && _p.y < b[3] && _p.z > b[4] && _p.z < b[5]; };

/** Cuts the old stalls' and banners' triangles out of a loaded town piece's visual meshes (idempotent). Returns the count. */
export function carveMarket(root) {
  if (!root) return 0;
  let cut = 0;
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.geometry.userData.marketCarved) return;
    const g = o.geometry, pos = g.attributes.position; if (!pos) return;
    g.computeBoundingBox(); const bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
    const near = CUTS.filter(([inv, b]) => { _m.copy(inv).invert(); const box = new THREE.Box3(new THREE.Vector3(b[0], b[2], b[4]), new THREE.Vector3(b[1], b[3], b[5])).applyMatrix4(_m); return box.intersectsBox(bb); });
    g.userData.marketCarved = true;
    if (!near.length) return;
    const idx = g.index ? g.index.array : null, n = idx ? idx.length : pos.count, keep = [];
    for (let i = 0; i < n; i += 3) {
      const ia = idx ? idx[i] : i, ib = idx ? idx[i + 1] : i + 1, ic = idx ? idx[i + 2] : i + 2;
      _a.fromBufferAttribute(pos, ia); _b.fromBufferAttribute(pos, ib); _c.fromBufferAttribute(pos, ic);
      _p.copy(_a).add(_b).add(_c).multiplyScalar(1 / 3).applyMatrix4(o.matrixWorld);
      if (near.some((cutter) => inBox(_p.clone(), cutter))) { cut++; continue; }
      keep.push(ia, ib, ic);
    }
    if (keep.length === n) return;
    g.setIndex(keep); g.clearGroups && g.groups.length && g.clearGroups();
  });
  return cut;
}

/** A banner's cloth texture: the colour, a worn gold border, the town's ring emblem, a weave. */
function clothTexture(colour) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = colour; g.fillRect(0, 0, 128, 512);
  for (let y = 0; y < 512; y += 3) { g.fillStyle = `rgba(0,0,0,${0.05 + 0.04 * ((y / 3) % 2)})`; g.fillRect(0, y, 128, 1); }   // weave
  g.strokeStyle = '#d9a441'; g.lineWidth = 5; g.strokeRect(6, 6, 116, 470);
  g.beginPath(); g.moveTo(10, 470); g.lineTo(64, 505); g.lineTo(118, 470); g.stroke();
  g.lineWidth = 9; g.beginPath(); g.arc(64, 150, 34, 0, Math.PI * 2); g.stroke();            // the ring emblem
  g.lineWidth = 3; g.beginPath(); g.arc(64, 150, 20, 0, Math.PI * 2); g.stroke();
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(64 + Math.cos(a) * 44, 150 + Math.sin(a) * 44); g.lineTo(64 + Math.cos(a) * 54, 150 + Math.sin(a) * 54); g.stroke(); }
  g.fillStyle = '#d9a441'; g.fillRect(28, 250, 72, 4); g.fillRect(40, 262, 48, 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

const CLOTH_W = 0.95, CLOTH_L = 3.6;
/** One long banner (pole at the origin, the cloth hanging from an arm along +x). */
function buildBanner(colour, h, uTime, trash) {
  const g = new THREE.Group(); g.name = 'town_banner';
  const stone = new THREE.MeshStandardMaterial({ color: 0x7d746a, roughness: 0.9 }), wood = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.7 }), gold = new THREE.MeshStandardMaterial({ color: 0xc9953e, roughness: 0.35, metalness: 0.8 });
  trash.push(stone, wood, gold);
  const add = (geo, m, x, y, z, rz = 0) => { trash.push(geo); const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.z = rz; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  add(new THREE.CylinderGeometry(0.2, 0.27, 0.5, 10), stone, 0, 0.25, 0);
  add(new THREE.CylinderGeometry(0.055, 0.075, h - 0.4, 10), wood, 0, 0.4 + (h - 0.4) / 2, 0);
  add(new THREE.SphereGeometry(0.09, 12, 8), gold, 0, h + 0.05, 0);
  add(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 8), wood, 0.58, h - 0.22, 0, Math.PI / 2);
  add(new THREE.SphereGeometry(0.06, 10, 8), gold, 1.22, h - 0.22, 0);
  // the cloth: a swallow-tailed strip pinned under the arm, swaying more toward its tail
  const geo = new THREE.PlaneGeometry(CLOTH_W, CLOTH_L, 4, 24); trash.push(geo);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), v = (CLOTH_L / 2 - p.getY(i)) / CLOTH_L; if (v > 0.9) p.setY(i, p.getY(i) + (1 - Math.abs(x) / (CLOTH_W / 2)) * 0.32 * (v - 0.9) / 0.1); }
  const tex = clothTexture(colour); trash.push(tex);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide }); trash.push(mat);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float hang = clamp((${(CLOTH_L / 2).toFixed(2)} - position.y) / ${CLOTH_L.toFixed(2)}, 0.0, 1.0);
      float ph = modelMatrix[3].x * 0.37 + modelMatrix[3].z * 0.23;
      transformed.z += hang * hang * (0.16 * sin(uTime * 1.3 + ph + position.y * 1.1) + 0.05 * sin(uTime * 3.1 + position.x * 4.0 + ph));
      transformed.x += hang * 0.05 * sin(uTime * 0.9 + ph);`);
  };
  mat.customProgramCacheKey = () => 'town-banner-cloth';
  const cloth = add(geo, mat, 0.6, h - 0.3 - CLOTH_L / 2, 0); cloth.castShadow = true;
  return g;
}

/**
 * @param {{scene: THREE.Object3D, fetchGltf: (name: string) => Promise<{gltf: object}>, hasModelFile: (n: string) => boolean, mobile?: boolean}} o
 */
export function createTownMarket({ scene, fetchGltf, hasModelFile, mobile = false }) {
  const root = new THREE.Group(); root.name = 'town_market'; scene.add(root);
  const trash = [], uTime = { value: 0 };
  for (const b of TOWN_BANNERS) { const g = buildBanner(b[4], b[5], uTime, trash); g.applyMatrix4(frame(b)); root.add(g); }
  const files = ['market_stall_red', 'market_stall_green'].map((n) => (mobile && hasModelFile(n + '_m') ? n + '_m' : n));
  if (files.every((f) => hasModelFile(f))) {
    Promise.all(files.map((f) => fetchGltf(f))).then((res) => {
      MARKET_STALLS.forEach((s) => {
        const m = res[s[4]].gltf.scene.clone(true); m.name = 'market_stall';
        // Kenney's stall is a 1 m kit piece; ours stood 2.8 m wide, 1.5 m deep, its awning toward +z
        m.scale.set(2.8, 2.25, 1.9); m.rotation.y = Math.PI;
        m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        const holder = new THREE.Group(); holder.applyMatrix4(frame(s)); holder.add(m); root.add(holder);
      });
    }).catch(() => { /* the cut-out stalls stay empty rather than break the town */ });
  }
  let time = 0;
  return {
    root,
    /** A town piece arrived: cut its old stalls and banners out. */
    onPiece(real) { return carveMarket(real); },
    update(dt, reduced = false) { if (!reduced) time += dt; uTime.value = time; },
    dispose() { scene.remove(root); for (const t of trash) t.dispose(); },
  };
}
