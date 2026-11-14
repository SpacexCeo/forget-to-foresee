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
const ANGLES = { mcp: 58, pip: 86, dip: 48, thumb: 46, thumbTip: 40 };   // a power grip on a 25 mm handle, degrees, at scale 1

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

// ---- the grip pose: world-space turns about each joint, parents first
const rotAbout = (pivot, axis, deg) => { const m = mat4.create(); mat4.translate(m, m, pivot); mat4.rotate(m, m, (deg * Math.PI) / 180, axis); mat4.translate(m, m, vec3.negate(vec3.create(), pivot)); return m; };
const allWorld = () => [...WORLD, ...newJoints.map((n) => n.world)];
const allBind = [...IBM, ...newJoints.map((n) => n.ibm)];
function posed(angles) {
  const world = allWorld().map((m) => mat4.clone(m)), delta = new Map();
  const groupAxis = (ji) => { const fs = fingers.filter((f) => f.group === ji); const a = vec3.create(); fs.forEach((f) => vec3.add(a, a, f.axis)); return vec3.normalize(a, a); };
  const set = (ji, parentDelta, pivot, axis, deg) => { const d = mat4.multiply(mat4.create(), parentDelta, rotAbout(pivot, axis, deg)); delta.set(ji, d); mat4.multiply(world[ji], d, world[ji]); return d; };
  const I = mat4.create();
  for (const g of [iFing, iIdx]) {
    const dg = set(g, I, posOf(g), groupAxis(g), angles.mcp);
    for (const fi of fingers.filter((f) => f.group === g)) { const dm = set(fi.iMid, dg, fi.Jmid, fi.axis, angles.pip); set(fi.iTip, dm, fi.Jtip, fi.axis, angles.dip); }
  }
  const dt = set(iThumb, I, Bt, thumb.axis, angles.thumb);
  set(thumb.iTip, dt, thumb.Jtip, thumb.axis, angles.thumbTip);
  return { world, delta };
}
function skinned(world) {
  const mats = world.map((m, i) => mat4.multiply(mat4.create(), m, allBind[i]));
  const out = new Array(NV);
  for (let v = 0; v < NV; v++) {
    const p = P.getElement(v, []), o = vec3.create();
    for (let k = 0; k < 4; k++) { const w = newW[v * 4 + k]; if (w > 0) vec3.scaleAndAdd(o, o, vec3.transformMat4(vec3.create(), p, mats[newJ[v * 4 + k]]), w); }
    out[v] = o;
  }
  return out;
}
// the hand's vertices (anything weighted to the hand, the fingers or the thumb)
const handVerts = []; for (let v = 0; v < NV; v++) if (weightOn(v, iHand) + fingerW(v) + weightOn(v, iThumb) > 0.5) handVerts.push(v);
const gAll = fingers.flatMap((f) => f.verts.map((v) => coords(rest[v])[1]));
const gLo = Math.min(...gAll), gHi = Math.max(...gAll);
const want = GRIP_R + SKIN_GAP;
/**
 * Where the grip can sit in a closed hand: its axis runs along G; the circle of radius `want` round it must be free
 * of the hand and enclosed by it on at least 260 degrees (inside the fist, not beside it). Of all such places the
 * one nearest the palm wins. Returns [free radius, f, n] or null.
 */
function seat(pts) {
  const fn = handVerts.filter((v) => { const g = coords(pts[v])[1]; return g > gLo - 0.004 && g < gHi + 0.004; }).map((v) => { const c = coords(pts[v]); return [c[0], c[2]]; });
  let best = null;
  for (let n = 0.012; n <= 0.062; n += 0.001) {
    for (let f = 0.035; f <= 0.115; f += 0.001) {
      let r = 9; const bins = new Uint8Array(18);
      for (const [pf, pn] of fn) { const d = Math.hypot(pf - f, pn - n); if (d < r) { r = d; if (r < want) break; } if (d < 0.036) bins[Math.floor(((Math.atan2(pn - n, pf - f) + Math.PI) / (2 * Math.PI)) * 18) % 18] = 1; }
      if (r < want) continue;
      if (bins.reduce((x, y) => x + y, 0) >= 13 && (!best || r > best[0])) best = [r, f, n];
    }
    if (best) return best;   // the first row off the palm that has room
  }
  return null;
}
// which closing angles put the grip nearest the palm: the knuckles, the middle and the end joints are tried apart
let chosen = null;
for (const mcp of [24, 30, 36, 42, 48, 54]) for (const pip of [40, 48, 56, 64, 72, 80]) for (const dip of [20, 30, 40, 50]) {
  const angles = { mcp, pip, dip, thumb: ANGLES.thumb, thumbTip: ANGLES.thumbTip };
  const { world, delta } = posed(angles);
  const pts = skinned(world);
  const c = seat(pts);
  if (!c) continue;
  const score = c[2] * 1000 - 0.012 * (mcp + pip + dip);   // nearest the palm; of equals, the more closed hand
  if (process.env.GRIP_DEBUG) console.log('[grip] try', mcp, pip, dip, 'n', (c[2] * 1000).toFixed(0), 'free', (c[0] * 1000).toFixed(1), 'score', score.toFixed(2));
  if (!chosen || score < chosen.score) chosen = { angles, world, delta, pts, c, score };
}
if (!chosen) throw new Error('the hand never leaves room for the grip');
// the thumb closes round the grip from the other side: as far as it goes without cutting the hilt
{
  const thumbVerts = handVerts.filter((v) => weightOn(v, iThumb) > 0.2);
  const [, fc0, nc0] = chosen.c;
  for (const [t1, t2] of [[96, 70], [84, 64], [72, 58], [60, 50], [46, 40]]) {
    const angles = { ...chosen.angles, thumb: t1, thumbTip: t2 };
    const { world, delta } = posed(angles);
    const pts = skinned(world);
    let r = 9; for (const v of thumbVerts) { const q = coords(pts[v]); const d = Math.hypot(q[0] - fc0, q[2] - nc0); if (d < r) r = d; }
    if (process.env.GRIP_DEBUG) console.log('[grip] thumb', t1, t2, 'free mm', (r * 1000).toFixed(1));
    if (r >= GRIP_R + 0.0006) { chosen = { ...chosen, angles, world, delta, pts }; break; }
  }
}

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
const [rad, fc, nc] = chosen.c;
const gFistHi = Math.max(...fingers.flatMap((f) => f.verts.map((v) => coords(chosen.pts[v])[1])));
const gSeat = gFistHi - 0.062;   // the fist sits under the guard: about 2 cm of grip between the index finger and the ferrule
const O = fromCoords(fc, gSeat, nc);
const Ys = G, Xs = vec3.normalize(vec3.create(), vec3.scaleAndAdd(vec3.create(), F, G, -vec3.dot(F, G))), Zs = vec3.cross(vec3.create(), Xs, Ys);
const swordWorld = mat4.fromValues(Xs[0], Xs[1], Xs[2], 0, Ys[0], Ys[1], Ys[2], 0, Zs[0], Zs[1], Zs[2], 0, O[0], O[1], O[2], 1);
const swordInProp = mat4.multiply(mat4.create(), mat4.invert(mat4.create(), restWorld[iProp]), swordWorld);
const report = {
  bones_added: newJoints.map((n) => n.name), finger_vertices: touched, angles_deg: chosen.angles,
  grip_radius_mm: GRIP_R * 1000, free_radius_mm: +(rad * 1000).toFixed(2), gap_mm: +((rad - GRIP_R) * 1000).toFixed(2),
  finger_lengths_mm: Object.fromEntries(fingers.map((f) => [f.name, +(f.L * 1000).toFixed(1)])), thumb_length_mm: +(Lt * 1000).toFixed(1),
  seat_in_hand_mm: { along_fingers: +(fc * 1000).toFixed(1), off_palm: +(nc * 1000).toFixed(1), toward_thumb: +(gSeat * 1000).toFixed(1) },
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
