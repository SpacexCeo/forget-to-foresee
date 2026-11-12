// Fewer draw calls for a hero's phone model: every skinned primitive that shares a material (and an armature) is
// merged into one: positions, normals, tangents, UVs, weights concatenated, joint indices remapped onto the skin
// with the most joints (each joint's inverse bind matrix must agree, else the group is left alone). Collision
// helpers (`*_col`) and anything with morph targets stay as they are. Then optional per-material simplification
// (meshoptimizer). Run on a dequantized file; meshopt-compress after (art/tools/phone-lod.sh).
//   node art/tools/phone_merge.mjs <in.glb> <out.glb> [--report] [--ratio Mat=0.5,Mat2=0.4]
import { execSync } from 'node:child_process';
const G = execSync('npm root -g').toString().trim() + '/@gltf-transform/cli/node_modules/@gltf-transform/';
const { NodeIO } = await import(G + 'core/dist/index.js');
const { ALL_EXTENSIONS } = await import(G + 'extensions/dist/index.js');
const { prune, simplifyPrimitive } = await import(G + 'functions/dist/index.js');
const { MeshoptSimplifier } = await import(G + '../meshoptimizer/index.js');
const [inp, outp] = process.argv.slice(2);
const report = process.argv.includes('--report');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const root = doc.getRoot();
const tris = (p) => (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
const summary = () => {
  const rows = [];
  for (const n of root.listNodes()) { const m = n.getMesh(); if (!m) continue; for (const p of m.listPrimitives()) rows.push({ node: n.getName(), mat: p.getMaterial() && p.getMaterial().getName(), tris: tris(p), skin: !!n.getSkin(), morph: p.listTargets().length, attrs: p.listSemantics().join(',') }); }
  return { meshes: rows.filter((r) => !/_col/.test(r.node)).length, prims: rows.length, tris: rows.reduce((a, r) => a + r.tris, 0), anims: root.listAnimations().length, skins: root.listSkins().length, rows };
};
const before = summary();
if (report) { console.log(JSON.stringify(before, null, 1)); process.exit(0); }

// group by material; all merged primitives end up on the skin with the most joints
const sameMat = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-4);
const ibm = (skin, j) => { const a = skin.getInverseBindMatrices(); const m = []; a.getElement(j, m); return m; };
// column-major 4x4: multiply, general inverse
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function inv(m) {
  const a = m, o = new Array(16);
  const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
  const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
  const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d;
  o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
  o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d;
  o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d;
  return o;
}
const groups = new Map();
for (const n of root.listNodes()) {
  const m = n.getMesh(), s = n.getSkin(); if (!m || !s || /_col(?:[._]?\d+)?$/.test(n.getName())) continue;
  for (const p of m.listPrimitives()) {
    if (p.listTargets().length || p.getMode() !== 4) continue;
    const k = root.listMaterials().indexOf(p.getMaterial());
    (groups.get(k) || groups.set(k, []).get(k)).push({ n, m, p, s });
  }
}
const SEM = ['POSITION', 'NORMAL', 'TANGENT', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'];
const SIZE = { POSITION: 3, NORMAL: 3, TANGENT: 4, TEXCOORD_0: 2, JOINTS_0: 4, WEIGHTS_0: 4 };
const buffer = root.listBuffers()[0];
const merged = [];
for (const items of groups.values()) {
  if (items.length < 2) continue;
  const names = items.map((it) => it.n.getName());
  const extra = new Set(items.flatMap((it) => it.p.listSemantics()).filter((s) => !SEM.includes(s)));
  if (extra.size) { console.warn('skip (extra attributes)', [...extra], names); continue; }
  const wm = items.map((it) => it.n.getWorldMatrix());
  if (!wm.every((x) => sameMat(x, wm[0]))) { console.warn('skip (node transforms differ)', names); continue; }
  const target = items.map((it) => it.s).sort((a, b) => b.listJoints().length - a.listJoints().length)[0];
  const tj = target.listJoints();
  // each mesh may sit in its own (quantized) vertex space, folded into its inverse bind matrices: the vertices move
  // into the target's space by D = IBM_target^-1 * IBM_item, which must be the same for every joint
  let ok = true; const remap = new Map(), xf = new Map();
  for (const it of items) {
    if (remap.has(it.s)) continue;
    let D = null;
    const r = it.s.listJoints().map((j, i) => {
      const t = tj.indexOf(j); if (t < 0) { ok = false; return 0; }
      const d = mul(inv(ibm(target, t)), ibm(it.s, i));
      if (!D) D = d; else { const e = Math.max(...d.map((x, q) => Math.abs(x - D[q]))); if (e > 2e-3) { if (ok) console.warn('  D differs', it.n.getName(), j.getName(), e.toFixed(5)); ok = false; } }
      return t;
    });
    remap.set(it.s, r); xf.set(it.s, D);
  }
  if (!ok) { console.warn('skip (joints or bind matrices differ)', names); continue; }
  const sems = SEM.filter((s) => items.every((it) => it.p.getAttribute(s)));
  let nv = 0, ni = 0; for (const it of items) { nv += it.p.getAttribute('POSITION').getCount(); ni += it.p.getIndices() ? it.p.getIndices().getCount() : it.p.getAttribute('POSITION').getCount(); }
  const arr = Object.fromEntries(sems.map((s) => [s, s === 'JOINTS_0' ? new Uint16Array(nv * 4) : new Float32Array(nv * SIZE[s])]));
  const idx = new Uint32Array(ni); let vo = 0, io2 = 0; const el = [];
  for (const it of items) {
    const c = it.p.getAttribute('POSITION').getCount(), r = remap.get(it.s), D = xf.get(it.s);
    for (const s of sems) {
      const a = it.p.getAttribute(s), k = SIZE[s];
      for (let i = 0; i < c; i++) {
        a.getElement(i, el);
        if (s === 'POSITION') { const [x, y, z] = el; el[0] = D[0] * x + D[4] * y + D[8] * z + D[12]; el[1] = D[1] * x + D[5] * y + D[9] * z + D[13]; el[2] = D[2] * x + D[6] * y + D[10] * z + D[14]; }
        else if (s === 'NORMAL' || s === 'TANGENT') { const [x, y, z] = el; let u = D[0] * x + D[4] * y + D[8] * z, v = D[1] * x + D[5] * y + D[9] * z, w = D[2] * x + D[6] * y + D[10] * z; const l = Math.hypot(u, v, w) || 1; el[0] = u / l; el[1] = v / l; el[2] = w / l; }
        for (let j = 0; j < k; j++) arr[s][(vo + i) * k + j] = s === 'JOINTS_0' ? r[el[j]] : el[j];
      }
    }
    const I = it.p.getIndices();
    for (let i = 0; i < (I ? I.getCount() : c); i++) idx[io2++] = (I ? I.getScalar(i) : i) + vo;
    vo += c;
  }
  const first = items[0], prim = doc.createPrimitive().setMaterial(first.p.getMaterial());
  for (const s of sems) prim.setAttribute(s, doc.createAccessor().setType(SIZE[s] === 2 ? 'VEC2' : SIZE[s] === 3 ? 'VEC3' : 'VEC4').setArray(arr[s]).setBuffer(buffer));
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(nv < 65536 ? Uint16Array.from(idx) : idx).setBuffer(buffer));
  const mesh = doc.createMesh(first.m.getName()).addPrimitive(prim);
  for (const it of items) it.m.removePrimitive(it.p);
  first.n.setMesh(mesh).setSkin(target);
  for (const it of items.slice(1)) if (!it.m.listPrimitives().length) it.n.setMesh(null);
  merged.push(names.length + ' -> ' + first.n.getName());
}
// per-material simplification
const ra = process.argv.find((a, i) => process.argv[i - 1] === '--ratio');
if (ra) {
  await MeshoptSimplifier.ready;
  const want = Object.fromEntries(ra.split(',').map((x) => x.split('=')).map(([k, v]) => [k, Number(v)]));
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const r = p.getMaterial() && want[p.getMaterial().getName()];
    if (r && !p.listTargets().length) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: r, error: 0.02, lockBorder: false });
  }
}
// nodes left without a mesh but still holding a skin are harmless; drop empty meshes and unused accessors
for (const m of root.listMeshes()) if (!m.listPrimitives().length) m.dispose();
for (const n of root.listNodes()) if (!n.getMesh() && n.getSkin()) n.setSkin(null);
await doc.transform(prune({ keepLeaves: true }));
await io.write(outp, doc);
const after = summary();
console.log(JSON.stringify({ merged, before: { meshes: before.meshes, prims: before.prims, tris: before.tris }, after: { meshes: after.meshes, prims: after.prims, tris: after.tris, rows: after.rows } }, null, 1));
