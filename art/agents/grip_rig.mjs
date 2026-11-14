// grip_rig.mjs: gives a heroine's right hand finger joints and works out the pose that closes it on a sword grip.
//
//   node grip_rig.mjs <in.glb> <out.glb> <out.json> [--sword sword.glb --obj check.obj] [--radius 0.0125]
//
// <in.glb> must be readable without meshopt (gltf-transform dequantize first; textures stay as they are);
// compress <out.glb> again with `gltf-transform meshopt`. See art/agents/grip.sh.
//
// Why: the rig has one bone per finger group (thumb_R, index_R, fingers_R), so the hand could only bend at the
// knuckles and never closed on a hilt (docs/art/qa/loomblade/hand_fit.json). A morph target would change the body's
// target count and break the 23-wide face tracks, so the fingers get real joints instead:
//   index_mid_R, index_tip_R            children of index_R
//   middle_/ring_/pinky_mid_R, _tip_R   children of fingers_R
//   thumb_tip_R                         child of thumb_R
// The existing bones stay the knuckle joints, every clip keeps working (the new joints rest straight).
// Finger vertices are found from the skin weights and split into four fingers by where they lie across the palm;
// each vertex's group weight is shared between group / mid / tip along its finger.
// Output JSON: the grip pose as local quaternions per bone (set them after the mixer), the sword's matrix in the
// space of `prop_R` (column-major, as three.js Matrix4.fromArray takes it), and the fit numbers.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mat4, vec3, quat } from 'gl-matrix';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const [SRC, DST, JSON_OUT] = args;
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const GRIP_R = Number(opt('--radius', '0.0125'));   // the hilt's half-width (art/props/shoal/loomblade/parts.json)
const SKIN_GAP = 0.0012;                             // how far the closed hand stays off the hilt
const BLEND = 0.006;                                 // half-width of the bend zone at a joint, metres

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SRC);
const root = doc.getRoot();
const bodyNode = root.listNodes().find((n) => n.getName() === 'body' && n.getSkin() && n.getMesh());
if (!bodyNode) throw new Error('no skinned node "body"');
const skin = bodyNode.getSkin();
const prim = bodyNode.getMesh().listPrimitives().find((p) => /Skin/.test(p.getMaterial().getName())) || bodyNode.getMesh().listPrimitives()[0];
const joints = skin.listJoints();
const jointOf = (name) => { const i = joints.findIndex((j) => j.getName() === name); if (i < 0) throw new Error('no joint ' + name); return i; };
const ibmAcc = skin.getInverseBindMatrices();
const IBM = joints.map((_, i) => ibmAcc.getElement(i, []));
const WORLD = joints.map((j) => j.getWorldMatrix());
const BIND = joints.map((_, i) => mat4.multiply(mat4.create(), WORLD[i], IBM[i]));   // joint world x inverse bind: mesh -> world at rest
const posOf = (i) => mat4.getTranslation(vec3.create(), WORLD[i]);

// ---- vertices at rest, in world space
const P = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), Wt = prim.getAttribute('WEIGHTS_0');
const NV = P.getCount();
const vj = [], vw = [], rest = [];
for (let v = 0; v < NV; v++) {
  const j = J.getElement(v, []), w = Wt.getElement(v, []);
  const s = w[0] + w[1] + w[2] + w[3] || 1;
  vj.push(j.slice()); vw.push(w.map((x) => x / s));
  const p = P.getElement(v, []), out = vec3.create();
  for (let k = 0; k < 4; k++) if (w[k] > 0) vec3.scaleAndAdd(out, out, vec3.transformMat4(vec3.create(), p, BIND[j[k]]), w[k] / s);
  rest.push(out);
}
const weightOn = (v, ji) => { let s = 0; for (let k = 0; k < 4; k++) if (vj[v][k] === ji) s += vw[v][k]; return s; };

// ---- the hand's frame: F wrist -> knuckles, G across the palm toward the thumb, N out of the palm
const iHand = jointOf('hand_R'), iFing = jointOf('fingers_R'), iIdx = jointOf('index_R'), iThumb = jointOf('thumb_R'), iProp = jointOf('prop_R');
const Wp = posOf(iHand);
const knuckle = vec3.lerp(vec3.create(), posOf(iFing), posOf(iIdx), 0.5);
const F = vec3.normalize(vec3.create(), vec3.sub(vec3.create(), knuckle, Wp));
const T = vec3.sub(vec3.create(), posOf(iThumb), Wp);
const G = vec3.normalize(vec3.create(), vec3.scaleAndAdd(vec3.create(), T, F, -vec3.dot(T, F)));
const N = vec3.cross(vec3.create(), F, G);
if (vec3.dot(N, [-Wp[0], 0, 0]) < 0) vec3.negate(N, N);   // at rest (arms down) the palm looks at the body
const coords = (p) => { const d = vec3.sub(vec3.create(), p, Wp); return [vec3.dot(d, F), vec3.dot(d, G), vec3.dot(d, N)]; };
const fromCoords = (f, g, n) => { const o = vec3.clone(Wp); vec3.scaleAndAdd(o, o, F, f); vec3.scaleAndAdd(o, o, G, g); vec3.scaleAndAdd(o, o, N, n); return o; };
const fKnuckle = coords(knuckle)[0];

// ---- four fingers: 1-D k-means across the palm on the clean finger vertices, then a line per finger
const fingerW = (v) => weightOn(v, iFing) + weightOn(v, iIdx);
const clean = [];
for (let v = 0; v < NV; v++) if (fingerW(v) > 0.9 && coords(rest[v])[0] > fKnuckle + 0.012) clean.push(v);
if (clean.length < 40) throw new Error('too few finger vertices: ' + clean.length);
const gs = clean.map((v) => coords(rest[v])[1]).sort((a, b) => a - b);
let centres = [0.125, 0.375, 0.625, 0.875].map((q) => gs[Math.floor(q * (gs.length - 1))]);
for (let it = 0; it < 40; it++) {
  const sum = [0, 0, 0, 0], cnt = [0, 0, 0, 0];
  for (const v of clean) { const g = coords(rest[v])[1]; let b = 0; for (let k = 1; k < 4; k++) if (Math.abs(g - centres[k]) < Math.abs(g - centres[b])) b = k; sum[b] += g; cnt[b]++; }
  centres = centres.map((c, k) => (cnt[k] ? sum[k] / cnt[k] : c));
}
centres.sort((a, b) => a - b);   // pinky ... index (the thumb side is +G)
const NAMES = ['pinky', 'ring', 'middle', 'index'];
const fingers = NAMES.map((name, k) => {
  const vs = clean.filter((v) => { const g = coords(rest[v])[1]; let b = 0; for (let q = 1; q < 4; q++) if (Math.abs(g - centres[q]) < Math.abs(g - centres[b])) b = q; return b === k; });
  // least squares g(f) and n(f)
  const fs = vs.map((v) => coords(rest[v])[0]), mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const fit = (ys) => { const mf = mean(fs), my = mean(ys); let sxx = 0, sxy = 0; fs.forEach((f, i) => { sxx += (f - mf) ** 2; sxy += (f - mf) * (ys[i] - my); }); const b = sxy / (sxx || 1); return [my - b * mf, b]; };
  const [ag, bg] = fit(vs.map((v) => coords(rest[v])[1])), [an, bn] = fit(vs.map((v) => coords(rest[v])[2]));
  const D = vec3.normalize(vec3.create(), [F[0] + bg * G[0] + bn * N[0], F[1] + bg * G[1] + bn * N[1], F[2] + bg * G[2] + bn * N[2]]);
  const K = fromCoords(fKnuckle, ag + bg * fKnuckle, an + bn * fKnuckle);
  const along = (p) => vec3.dot(vec3.sub(vec3.create(), p, K), D);
  const L = Math.max(...vs.map((v) => along(rest[v])));
  const axis = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), D, N));   // a positive turn brings D toward N: the finger closes
  return { name, group: name === 'index' ? iIdx : iFing, lineG: (f) => ag + bg * f, D, K, L, along, axis, dMid: 0.40 * L, dTip: 0.70 * L,
    Jmid: vec3.scaleAndAdd(vec3.create(), K, D, 0.40 * L), Jtip: vec3.scaleAndAdd(vec3.create(), K, D, 0.70 * L), verts: [] };
});
const fingerFor = (v) => { const [f, g] = coords(rest[v]); let b = fingers[0]; for (const fi of fingers) if (Math.abs(g - fi.lineG(f)) < Math.abs(g - b.lineG(f))) b = fi; return b; };

// ---- the thumb: from its joint to its farthest vertex
const thumbClean = []; for (let v = 0; v < NV; v++) if (weightOn(v, iThumb) > 0.9) thumbClean.push(v);
const Bt = posOf(iThumb);
let far = thumbClean[0]; for (const v of thumbClean) if (vec3.distance(rest[v], Bt) > vec3.distance(rest[far], Bt)) far = v;
const Td = vec3.normalize(vec3.create(), vec3.sub(vec3.create(), rest[far], Bt));
const Lt = vec3.distance(rest[far], Bt);
const thumb = { D: Td, K: Bt, L: Lt, dTip: 0.55 * Lt, along: (p) => vec3.dot(vec3.sub(vec3.create(), p, Bt), Td), Jtip: vec3.scaleAndAdd(vec3.create(), Bt, Td, 0.55 * Lt),
  axis: vec3.normalize(vec3.create(), vec3.cross(vec3.create(), Td, N)) };

// ---- new joints (world-aligned at rest), appended to the skin
const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const meshBind = BIND[iFing];   // mesh -> world at rest (the same for every joint of a skin)
const newJoints = [];           // {name, node, index, world, parentIndex}
function addJoint(name, parentIndex, at) {
  const parentWorld = parentIndex < joints.length ? WORLD[parentIndex] : newJoints[parentIndex - joints.length].world;
  const parentNode = parentIndex < joints.length ? joints[parentIndex] : newJoints[parentIndex - joints.length].node;
  const world = mat4.fromTranslation(mat4.create(), at);
  const local = mat4.multiply(mat4.create(), mat4.invert(mat4.create(), parentWorld), world);
  const node = doc.createNode(name).setMatrix(local);
  parentNode.addChild(node);
  const index = joints.length + newJoints.length;
  newJoints.push({ name, node, index, world, parentIndex, ibm: mat4.multiply(mat4.create(), mat4.invert(mat4.create(), world), meshBind) });
  return index;
}
for (const fi of fingers) { fi.iMid = addJoint(fi.name + '_mid_R', fi.group, fi.Jmid); fi.iTip = addJoint(fi.name + '_tip_R', fi.iMid, fi.Jtip); }
thumb.iTip = addJoint('thumb_tip_R', iThumb, thumb.Jtip);

// ---- weights: a vertex's group weight is shared along its finger
const newJ = new Uint8Array(NV * 4), newW = new Float32Array(NV * 4);
let touched = 0;
for (let v = 0; v < NV; v++) {
  const map = new Map();
  for (let k = 0; k < 4; k++) if (vw[v][k] > 0) map.set(vj[v][k], (map.get(vj[v][k]) || 0) + vw[v][k]);
  const share = (group, mid, tip, d, dMid, dTip) => {
    const wg = map.get(group) || 0; if (wg <= 0) return;
    const wm = smooth(d, dMid - BLEND, dMid + BLEND), wt = tip == null ? 0 : smooth(d, dTip - BLEND, dTip + BLEND);
    map.set(group, wg * (1 - wm)); if (wm > 0) map.set(mid, (map.get(mid) || 0) + wg * wm * (1 - wt)); if (wm * wt > 0) map.set(tip, (map.get(tip) || 0) + wg * wm * wt);
    touched++;
  };
  if (fingerW(v) > 0.02) { const fi = fingerFor(v); fi.verts.push(v); share(fi.group, fi.iMid, fi.iTip, fi.along(rest[v]), fi.dMid, fi.dTip); }
  if (weightOn(v, iThumb) > 0.02) share(iThumb, thumb.iTip, null, thumb.along(rest[v]), thumb.dTip, 0);
  const top = [...map.entries()].filter(([, w]) => w > 1e-5).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const s = top.reduce((a, [, w]) => a + w, 0) || 1;
  top.forEach(([j, w], k) => { newJ[v * 4 + k] = j; newW[v * 4 + k] = w / s; });
}
for (const nj of newJoints) skin.addJoint(nj.node);
const allIBM = new Float32Array((joints.length + newJoints.length) * 16);
IBM.forEach((m, i) => allIBM.set(m, i * 16));
newJoints.forEach((nj) => allIBM.set(nj.ibm, nj.index * 16));
skin.setInverseBindMatrices(doc.createAccessor('grip_ibm').setType('MAT4').setArray(allIBM).setBuffer(ibmAcc.getBuffer()));
prim.setAttribute('JOINTS_0', doc.createAccessor('grip_joints').setType('VEC4').setArray(newJ).setBuffer(P.getBuffer()));
prim.setAttribute('WEIGHTS_0', doc.createAccessor('grip_weights').setType('VEC4').setArray(newW).setBuffer(P.getBuffer()));

// ---- the grip (owner's reference photo, 14.11): the hilt runs diagonally across the palm, from the base of the index
// finger to the heel of the hand on the little-finger side; every finger closes round it, joint by joint, until it
// touches; the thumb lies along the hilt toward the guard.
const rotAbout = (pivot, axis, deg) => { const m = mat4.create(); mat4.translate(m, m, pivot); mat4.rotate(m, m, (deg * Math.PI) / 180, axis); mat4.translate(m, m, vec3.negate(vec3.create(), pivot)); return m; };
const allWorld = () => [...WORLD, ...newJoints.map((n) => n.world)];
const allBind = [...IBM, ...newJoints.map((n) => n.ibm)];
const DIAG = Number(opt('--diag', '24'));                 // degrees between the hilt and the knuckle line
const A = vec3.normalize(vec3.create(), vec3.add(vec3.create(), vec3.scale(vec3.create(), G, Math.cos((DIAG * Math.PI) / 180)), vec3.scale(vec3.create(), F, Math.sin((DIAG * Math.PI) / 180))));
const want = GRIP_R + SKIN_GAP;
const groupAxis = (ji) => { const fs = fingers.filter((f) => f.group === ji); const a = vec3.create(); fs.forEach((f) => vec3.add(a, a, f.axis)); return vec3.normalize(a, a); };
// the thumb: a swing toward the hilt's direction, then a press against its side
const thumbSwingAxis = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), Td, A));
const thumbSwingMax = (Math.acos(Math.max(-1, Math.min(1, vec3.dot(Td, A)))) * 180) / Math.PI;
function posed(a) {
  const world = allWorld().map((m) => mat4.clone(m)), delta = new Map();
  const set = (ji, parentDelta, pivot, axis, deg, extra) => { let r = rotAbout(pivot, axis, deg); if (extra) r = mat4.multiply(mat4.create(), extra, r); const d = mat4.multiply(mat4.create(), parentDelta, r); delta.set(ji, d); mat4.multiply(world[ji], d, world[ji]); return d; };
  const I = mat4.create();
  const dg = { [iFing]: set(iFing, I, posOf(iFing), groupAxis(iFing), a.mcp_f), [iIdx]: set(iIdx, I, posOf(iIdx), groupAxis(iIdx), a.mcp_i) };
  for (const fi of fingers) { const dm = set(fi.iMid, dg[fi.group], fi.Jmid, fi.axis, a['pip_' + fi.name]); set(fi.iTip, dm, fi.Jtip, fi.axis, a['dip_' + fi.name]); }
  // the thumb turns from its rest direction to lie along the hilt toward the guard, leaning `t_press` degrees in
  // toward the hilt's axis (0: parallel to the hilt, beside it)
  const toAxis = (() => { const d = vec3.sub(vec3.create(), Bt, O); const t = vec3.dot(d, A); const foot = vec3.scaleAndAdd(vec3.create(), O, A, t); return vec3.normalize(foot, vec3.sub(foot, foot, Bt)); })();
  const b = (a.t_press * Math.PI) / 180;
  const target = vec3.normalize(vec3.create(), vec3.add(vec3.create(), vec3.scale(vec3.create(), A, Math.cos(b)), vec3.scale(vec3.create(), toAxis, Math.sin(b))));
  const k = Math.min(1, a.t_swing / 100);   // how far along the way from rest to that direction
  const tAxis = vec3.cross(vec3.create(), Td, target);
  const tAng = Math.acos(Math.max(-1, Math.min(1, vec3.dot(Td, target)))) * k * 180 / Math.PI;
  const dt = set(iThumb, I, Bt, vec3.length(tAxis) > 1e-6 ? vec3.normalize(tAxis, tAxis) : thumb.axis, tAng);
  set(thumb.iTip, dt, thumb.Jtip, thumb.axis, a.t_tip);
  return { world, delta };
}
// the hand's vertices (anything weighted to the hand, the fingers or the thumb); only those are skinned while posing
const handVerts = []; for (let v = 0; v < NV; v++) if (weightOn(v, iHand) + fingerW(v) + weightOn(v, iThumb) > 0.5) handVerts.push(v);
const thumbVerts = handVerts.filter((v) => weightOn(v, iThumb) > 0.2);
const palmVerts = handVerts.filter((v) => fingerW(v) < 0.2 && weightOn(v, iThumb) < 0.2);
function skinned(world, list = null) {
  const mats = world.map((m, i) => mat4.multiply(mat4.create(), m, allBind[i]));
  const out = new Array(NV);
  for (const v of list || Array.from({ length: NV }, (_, i) => i)) {
    const p = P.getElement(v, []), o = vec3.create();
    for (let k = 0; k < 4; k++) { const w = newW[v * 4 + k]; if (w > 0) vec3.scaleAndAdd(o, o, vec3.transformMat4(vec3.create(), p, mats[newJ[v * 4 + k]]), w); }
    out[v] = o;
  }
  return out;
}
const distAxis = (p, O) => { const d = vec3.sub(vec3.create(), p, O); const t = vec3.dot(d, A); return Math.hypot(d[0] - A[0] * t, d[1] - A[1] * t, d[2] - A[2] * t); };
// the seat: the axis through the palm just short of the knuckles, across the middle of the four fingers, lifted off
// the palm until the palm's skin clears the hilt
const gMid = (centres[0] + centres[3]) / 2;
let O = null;
// start at the palm's skin under the line (a circle inside the hand would also be "clear" of every surface vertex)
const lineDist = (v) => { const c = coords(rest[v]); const df = c[0] - (fKnuckle - Number(opt('--back', '0.014'))), dg = c[1] - gMid; const ca = Math.cos((DIAG * Math.PI) / 180), sa = Math.sin((DIAG * Math.PI) / 180); return Math.abs(df * ca - dg * sa); };
const nSkin = Math.max(...palmVerts.filter((v) => lineDist(v) < 0.012).map((v) => coords(rest[v])[2]));
for (let n = nSkin; n <= nSkin + 0.05; n += 0.0005) {
  const o = fromCoords(fKnuckle - Number(opt('--back', '0.014')), gMid, n);
  if (palmVerts.every((v) => distAxis(rest[v], o) >= want)) { O = o; break; }
}
if (!O) throw new Error('no seat on the palm');
const minDist = (pts, list) => { let m = 9; for (const v of list) { const d = distAxis(pts[v], O); if (d < m) m = d; } return m; };
const fingerList = (name) => fingers.find((f) => f.name === name).verts;
const KEYS = [
  ...['pinky', 'ring', 'middle', 'index'].flatMap((n) => [['dip_' + n, 75, [n]], ['pip_' + n, 110, [n]]]),
  ['mcp_f', 95, ['pinky', 'ring', 'middle']], ['mcp_i', 95, ['index']],
  ['t_swing', 100, 'thumb'], ['t_press', 60, 'thumb'], ['t_tip', 30, 'thumb'],
];
const vertsOf = (who) => (who === 'thumb' ? thumbVerts : who.flatMap(fingerList));
const ang = Object.fromEntries(KEYS.map(([k]) => [k, 0]));
const clear = (a, who) => minDist(skinned(posed(a).world, vertsOf(who)), vertsOf(who)) >= want;
// open anything that starts inside the hilt (the rest pose curls the fingers a little), then close joint by joint
for (const [k, , who] of KEYS) for (let i = 0; i < 20 && !clear(ang, who); i++) ang[k] -= 3;
for (let round = 0; round < 80; round++) {
  let moved = false;
  for (const [k, lim, who] of KEYS) {
    if (ang[k] + 2 > lim) continue;
    ang[k] += 2;
    if (clear(ang, who)) moved = true; else ang[k] -= 2;
  }
  if (!moved) break;
}
const { world: poseWorld, delta: poseDelta } = posed(ang);
const pts = skinned(poseWorld);
const gapAll = minDist(pts, handVerts);
const chosen = { angles: Object.fromEntries(Object.entries(ang).map(([k, v]) => [k, +v.toFixed(1)])), world: poseWorld, delta: poseDelta, pts };

// ---- local quaternions of the pose, the sword's seat
const parentIndexOf = (ji) => { if (ji >= joints.length) return newJoints[ji - joints.length].parentIndex; const p = joints[ji].getParentNode(); return p ? joints.indexOf(p) : -1; };
const restWorld = allWorld();
const pose = {};
for (const ji of chosen.delta.keys()) {
  const pi = parentIndexOf(ji);
  const parentPosed = pi >= 0 ? chosen.world[pi] : mat4.create();
  const local = mat4.multiply(mat4.create(), mat4.invert(mat4.create(), parentPosed), chosen.world[ji]);
  const q = mat4.getRotation(quat.create(), local); quat.normalize(q, q);
  pose[ji < joints.length ? joints[ji].getName() : newJoints[ji - joints.length].name] = Array.from(q, (x) => +x.toFixed(6));
}
// the fist sits under the guard: the index finger's top edge 8.5 cm up the hilt from the grip centre (the ferrule starts at 8.3)
const along = (p) => vec3.dot(vec3.sub(vec3.create(), p, O), A);
const sTop = Math.max(...fingerList('index').map((v) => along(pts[v])));
const Og = vec3.scaleAndAdd(vec3.create(), O, A, sTop - 0.085);
const Ys = A, Xs = vec3.normalize(vec3.create(), vec3.scaleAndAdd(vec3.create(), F, A, -vec3.dot(F, A))), Zs = vec3.cross(vec3.create(), Xs, Ys);
const swordWorld = mat4.fromValues(Xs[0], Xs[1], Xs[2], 0, Ys[0], Ys[1], Ys[2], 0, Zs[0], Zs[1], Zs[2], 0, Og[0], Og[1], Og[2], 1);
const swordInProp = mat4.multiply(mat4.create(), mat4.invert(mat4.create(), restWorld[iProp]), swordWorld);
const touching = (list) => list.filter((v) => distAxis(pts[v], O) < want + 0.0025).length;
const report = {
  bones_added: newJoints.map((n) => n.name), finger_vertices: touched, angles_deg: chosen.angles, diagonal_deg: DIAG,
  grip_radius_mm: GRIP_R * 1000, gap_mm: +((gapAll - GRIP_R) * 1000).toFixed(2),
  vertices_near_the_hilt: Object.fromEntries([...fingers.map((f) => [f.name, touching(f.verts)]), ['thumb', touching(thumbVerts)], ['palm', touching(palmVerts)]]),
  finger_lengths_mm: Object.fromEntries(fingers.map((f) => [f.name, +(f.L * 1000).toFixed(1)])), thumb_length_mm: +(Lt * 1000).toFixed(1),
  pose, sword_in_prop_R: Array.from(swordInProp, (x) => +x.toFixed(6)),
};
writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
await io.write(DST, doc);
console.log('[grip]', JSON.stringify({ ...report, pose: Object.keys(pose).length + ' bones', sword_in_prop_R: 'ok' }));

// ---- optional check mesh: the body in the grip pose and the sword at its seat, one OBJ (glTF axes, metres)
if (opt('--obj')) {
  let out = 'o body\n', base = 1;
  for (const p of chosen.pts) out += `v ${p[0].toFixed(5)} ${p[1].toFixed(5)} ${p[2].toFixed(5)}\n`;
  const idx = prim.getIndices().getArray();
  for (let i = 0; i < idx.length; i += 3) out += `f ${idx[i] + 1} ${idx[i + 1] + 1} ${idx[i + 2] + 1}\n`;
  base += NV;
  if (opt('--sword')) {
    const sd = await io.read(opt('--sword'));
    out += 'o sword\n';
    for (const node of sd.getRoot().listNodes()) {
      const mesh = node.getMesh(); if (!mesh) continue;
      const m = mat4.multiply(mat4.create(), swordWorld, node.getWorldMatrix());
      for (const sp of mesh.listPrimitives()) {
        const pa = sp.getAttribute('POSITION'), ia = sp.getIndices().getArray();
        for (let v = 0; v < pa.getCount(); v++) { const q = vec3.transformMat4(vec3.create(), pa.getElement(v, []), m); out += `v ${q[0].toFixed(5)} ${q[1].toFixed(5)} ${q[2].toFixed(5)}\n`; }
        for (let i = 0; i < ia.length; i += 3) out += `f ${ia[i] + base} ${ia[i + 1] + base} ${ia[i + 2] + base}\n`;
        base += pa.getCount();
      }
    }
  }
  writeFileSync(opt('--obj'), out);
}
