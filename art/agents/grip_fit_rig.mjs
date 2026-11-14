// grip_fit_rig.mjs: closes a heroine's right hand on the Loomblade's hilt for a rig that already has finger joints
// (the new Tripo Iris: R_Hand, R_Index1..3, ...; Elise on Mixamo: mixamorig:RightHand, ...RightHandIndex1..3, ...).
// The same grip as art/agents/grip_rig.mjs (the owner's photo, 14.11): the hilt runs diagonally across the palm from
// the base of the index finger to the heel of the hand, every finger closes round it joint by joint until it touches,
// the thumb lies along the hilt toward the guard. No joints are added and the model is not changed.
//
//   node grip_fit_rig.mjs <in.glb> <rig: iris_tripo | mixamo> <out.json> [--obj check.obj] [--diag 24] [--back 0.014]
//
// Output JSON: {rig, seat, sword_in_seat (column-major, in the seat bone's space), pose: {bone: [x, y, z, w]}} with
// three.js node names (GLTFLoader drops ':' from names), plus the fit numbers. art/agents/grip_rigs_js.mjs turns the
// JSON files into game/src/play/grip-pose-rigs.js.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { mat4, vec3, quat } from 'gl-matrix';
import { writeFileSync } from 'node:fs';

const RIGS = {
  iris_tripo: { hand: 'R_Hand', fingers: { index: ['R_Index1', 'R_Index2', 'R_Index3'], middle: ['R_Mid1', 'R_Mid2', 'R_Mid3'], ring: ['R_Ring1', 'R_Ring2', 'R_Ring3'], pinky: ['R_Pinky1', 'R_Pinky2', 'R_Pinky3'] }, thumb: ['R_Thumb1', 'R_Thumb2', 'R_Thumb3'] },
  mixamo: { hand: 'mixamorig:RightHand', fingers: Object.fromEntries(['Index', 'Middle', 'Ring', 'Pinky'].map((f) => [f.toLowerCase(), [1, 2, 3].map((i) => `mixamorig:RightHand${f}${i}`)])), thumb: [1, 2, 3].map((i) => `mixamorig:RightHandThumb${i}`) },
};
const args = process.argv.slice(2);
const [SRC, RIG_NAME, JSON_OUT] = args;
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const RIG = RIGS[RIG_NAME];
if (!RIG) throw new Error('rig: ' + Object.keys(RIGS).join(' | '));
const GRIP_R = 0.0125, SKIN_GAP = 0.0012, want = GRIP_R + SKIN_GAP;
const DIAG = Number(opt('--diag', '24')), BACK = Number(opt('--back', '0.014'));
const threeName = (n) => n.replace(/\s/g, '_').replace(/[[\].:/]/g, '');

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(SRC);
const bodyNode = doc.getRoot().listNodes().find((n) => n.getSkin() && n.getMesh() && n.getSkin().listJoints().some((j) => j.getName() === RIG.hand));
if (!bodyNode) throw new Error('no skinned mesh with ' + RIG.hand);
const skin = bodyNode.getSkin(), joints = skin.listJoints();
const prim = bodyNode.getMesh().listPrimitives()[0];
const J = (name) => { const i = joints.findIndex((j) => j.getName() === name); if (i < 0) throw new Error('no joint ' + name); return i; };
const IBM = joints.map((_, i) => skin.getInverseBindMatrices().getElement(i, []));
const WORLD = joints.map((j) => j.getWorldMatrix());
const pos = (i) => mat4.getTranslation(vec3.create(), WORLD[i]);

// ---- vertices at rest (bind pose), world space
const P = prim.getAttribute('POSITION'), JA = prim.getAttribute('JOINTS_0'), WA = prim.getAttribute('WEIGHTS_0');
const NV = P.getCount(), vj = [], vw = [], rest = [];
const BIND = joints.map((_, i) => mat4.multiply(mat4.create(), WORLD[i], IBM[i]));
for (let v = 0; v < NV; v++) {
  const j = JA.getElement(v, []), w = WA.getElement(v, []), s = w[0] + w[1] + w[2] + w[3] || 1, p = P.getElement(v, []), o = vec3.create();
  vj.push(j); vw.push(w.map((x) => x / s));
  for (let k = 0; k < 4; k++) if (w[k] > 0) vec3.scaleAndAdd(o, o, vec3.transformMat4(vec3.create(), p, BIND[j[k]]), w[k] / s);
  rest.push(o);
}
const wOn = (v, set) => { let s = 0; for (let k = 0; k < 4; k++) if (set.has(vj[v][k])) s += vw[v][k]; return s; };

// ---- the hand's frame: F wrist -> knuckles, G across the palm toward the thumb, N out of the palm
const iHand = J(RIG.hand);
const NAMES = ['pinky', 'ring', 'middle', 'index'];
const chain = Object.fromEntries(NAMES.map((n) => [n, RIG.fingers[n].map(J)]));
const tChain = RIG.thumb.map(J);
const Wp = pos(iHand);
const knuckle = vec3.create(); NAMES.forEach((n) => vec3.scaleAndAdd(knuckle, knuckle, pos(chain[n][0]), 0.25));
const F = vec3.normalize(vec3.create(), vec3.sub(vec3.create(), knuckle, Wp));
const Tv = vec3.sub(vec3.create(), pos(tChain[0]), Wp);
const G = vec3.normalize(vec3.create(), vec3.scaleAndAdd(vec3.create(), Tv, F, -vec3.dot(Tv, F)));
const N = vec3.cross(vec3.create(), F, G);
// the palm side: the thumb's tip sits in front of the palm, and the fingers' own rest curl leans that way too
const curl = vec3.create(); NAMES.forEach((n) => vec3.add(curl, curl, vec3.sub(vec3.create(), pos(chain[n][2]), pos(chain[n][0]))));
const palmVote = vec3.dot(vec3.sub(vec3.create(), pos(tChain[2]), Wp), N) + vec3.dot(curl, N);
if (palmVote < 0) vec3.negate(N, N);
const coords = (p) => { const d = vec3.sub(vec3.create(), p, Wp); return [vec3.dot(d, F), vec3.dot(d, G), vec3.dot(d, N)]; };
const fromCoords = (f, g, n) => { const o = vec3.clone(Wp); vec3.scaleAndAdd(o, o, F, f); vec3.scaleAndAdd(o, o, G, g); vec3.scaleAndAdd(o, o, N, n); return o; };
const fKnuckle = coords(knuckle)[0];

// ---- vertex sets
// only the hand itself: a sleeve cuff or a strand of hair skinned to the hand bone must not move the seat
const handLen = vec3.distance(knuckle, Wp);
const inHand = (v) => { const c = coords(rest[v]); return c[0] > -0.15 * handLen && vec3.distance(rest[v], Wp) < 2.2 * handLen && Math.abs(c[2]) < 0.6 * handLen; };
const fingerSet = Object.fromEntries(NAMES.map((n) => [n, new Set(chain[n])]));
const thumbSet = new Set(tChain), handSet = new Set([iHand]);
const fingerVerts = Object.fromEntries(NAMES.map((n) => [n, []])), thumbVerts = [], palmVerts = [], handVerts = [];
for (let v = 0; v < NV; v++) {
  if (!inHand(v)) continue;
  let any = wOn(v, handSet) + wOn(v, thumbSet);
  for (const n of NAMES) { const w = wOn(v, fingerSet[n]); any += w; if (w > 0.5) fingerVerts[n].push(v); }
  if (wOn(v, thumbSet) > 0.5) thumbVerts.push(v);
  if (wOn(v, handSet) > 0.6) palmVerts.push(v);
  if (any > 0.5) handVerts.push(v);
}
for (const n of NAMES) if (fingerVerts[n].length < 10) throw new Error('too few vertices on ' + n);

// ---- each finger bends about one axis (D x N: a positive turn brings the finger toward the palm)
const fingers = NAMES.map((n) => {
  const c = chain[n], D = vec3.normalize(vec3.create(), vec3.sub(vec3.create(), pos(c[2]), pos(c[0])));
  return { name: n, c, axis: vec3.normalize(vec3.create(), vec3.cross(vec3.create(), D, N)), g: coords(pos(c[0]))[1] };
});
const Bt = pos(tChain[0]);
let far = thumbVerts[0]; for (const v of thumbVerts) if (vec3.distance(rest[v], Bt) > vec3.distance(rest[far], Bt)) far = v;
const Td = vec3.normalize(vec3.create(), vec3.sub(vec3.create(), rest[far], Bt));
const thumbAxis = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), Td, N));

// ---- the hilt: axis A across the palm, seat O lifted off the palm's skin until it clears
const A = vec3.normalize(vec3.create(), vec3.add(vec3.create(), vec3.scale(vec3.create(), G, Math.cos(DIAG * Math.PI / 180)), vec3.scale(vec3.create(), F, Math.sin(DIAG * Math.PI / 180))));
const gMid = (Math.min(...fingers.map((f) => f.g)) + Math.max(...fingers.map((f) => f.g))) / 2;
const distAxis = (p, O) => { const d = vec3.sub(vec3.create(), p, O); const t = vec3.dot(d, A); return Math.hypot(d[0] - A[0] * t, d[1] - A[1] * t, d[2] - A[2] * t); };
const ca = Math.cos(DIAG * Math.PI / 180), sa = Math.sin(DIAG * Math.PI / 180);
const lineDist = (v) => { const c = coords(rest[v]); return Math.abs((c[0] - (fKnuckle - BACK)) * ca - (c[1] - gMid) * sa); };
const under = palmVerts.filter((v) => lineDist(v) < 0.012);
const nSkin = under.length ? Math.max(...under.map((v) => coords(rest[v])[2])) : 0;
let O = null;
// the seat clears everything proximal to the knuckles, whatever bone it is skinned to (on Elise the little finger's
// first bone carries the heel of the hand, where the hilt ends)
const seatVerts = handVerts.filter((v) => coords(rest[v])[0] < fKnuckle + 0.004);
for (let n = nSkin; n <= nSkin + 0.06; n += 0.0005) { const o = fromCoords(fKnuckle - BACK, gMid, n); if (seatVerts.every((v) => distAxis(rest[v], o) >= want)) { O = o; break; } }
if (!O) throw new Error('no seat on the palm');

// ---- posing: rotations about joint pivots in world space, chained down each finger
const rotAbout = (pivot, axis, deg) => { const m = mat4.create(); mat4.translate(m, m, pivot); mat4.rotate(m, m, deg * Math.PI / 180, axis); mat4.translate(m, m, vec3.negate(vec3.create(), pivot)); return m; };
const toAxis = (() => { const d = vec3.sub(vec3.create(), Bt, O); const t = vec3.dot(d, A); const foot = vec3.scaleAndAdd(vec3.create(), O, A, t); return vec3.normalize(foot, vec3.sub(foot, foot, Bt)); })();
function posed(a) {
  const world = WORLD.map((m) => mat4.clone(m)), touched = new Set();
  const apply = (ji, d) => { world[ji] = mat4.multiply(mat4.create(), d, WORLD[ji]); touched.add(ji); };
  const down = (c, d0, keys, axis) => { let d = d0; c.forEach((ji, k) => { const piv = vec3.transformMat4(vec3.create(), pos(ji), d); d = mat4.multiply(mat4.create(), rotAbout(piv, axis, a[keys[k]]), d); apply(ji, d); }); return d; };
  for (const f of fingers) down(f.c, mat4.create(), ['mcp_' + f.name, 'pip_' + f.name, 'dip_' + f.name], f.axis);
  const b = a.t_press * Math.PI / 180;
  const target = vec3.normalize(vec3.create(), vec3.add(vec3.create(), vec3.scale(vec3.create(), A, Math.cos(b)), vec3.scale(vec3.create(), toAxis, Math.sin(b))));
  const k = Math.min(1, a.t_swing / 100), tAx = vec3.cross(vec3.create(), Td, target);
  const tAng = Math.acos(Math.max(-1, Math.min(1, vec3.dot(Td, target)))) * k * 180 / Math.PI;
  const d1 = rotAbout(Bt, vec3.length(tAx) > 1e-6 ? vec3.normalize(tAx, tAx) : thumbAxis, tAng); apply(tChain[0], d1);
  const ax2 = vec3.transformMat4(vec3.create(), thumbAxis, d1); vec3.sub(ax2, ax2, vec3.transformMat4(vec3.create(), [0, 0, 0], d1)); vec3.normalize(ax2, ax2);
  down(tChain.slice(1), d1, ['t_mid', 't_tip'], ax2);
  return { world, touched };
}
const LBS = (world, list) => {
  const mats = world.map((m, i) => mat4.multiply(mat4.create(), m, IBM[i])), out = new Map();
  for (const v of list) { const p = P.getElement(v, []), o = vec3.create(); for (let k = 0; k < 4; k++) if (vw[v][k] > 0) vec3.scaleAndAdd(o, o, vec3.transformMat4(vec3.create(), p, mats[vj[v][k]]), vw[v][k]); out.set(v, o); }
  return out;
};
const minDist = (pts) => { let m = 9; for (const p of pts.values()) m = Math.min(m, distAxis(p, O)); return m; };
const KEYS = [
  ...NAMES.flatMap((n) => [['dip_' + n, 80, n], ['pip_' + n, 105, n], ['mcp_' + n, 95, n]]),
  ['t_swing', 100, 'thumb'], ['t_press', 60, 'thumb'], ['t_mid', 40, 'thumb'], ['t_tip', 40, 'thumb'],
];
const vertsOf = (who) => (who === 'thumb' ? thumbVerts : fingerVerts[who]);
const ang = Object.fromEntries(KEYS.map(([k]) => [k, 0]));
const clear = (a, who) => minDist(LBS(posed(a).world, vertsOf(who))) >= want;
// a relaxed rest hand (Mixamo) curls the little fingers into where the hilt goes: open a whole finger at once first
for (const n of [...NAMES, 'thumb']) {
  const keys = KEYS.filter(([, , who]) => who === n).map(([k]) => k);
  for (let i = 0; i < 30 && !clear(ang, n); i++) for (const k of keys) ang[k] -= 3;
}
for (let round = 0; round < 90; round++) {
  let moved = false;
  for (const [k, lim, who] of KEYS) { if (ang[k] + 2 > lim) continue; ang[k] += 2; if (clear(ang, who)) moved = true; else ang[k] -= 2; }
  if (!moved) break;
}
const { world: PW, touched } = posed(ang);
const pts = LBS(PW, handVerts);

// ---- the pose as local quaternions, the sword's seat in the hand bone's space
const pose = {};
for (const ji of touched) {
  const parent = joints[ji].getParentNode(), pi = joints.indexOf(parent);
  const parentWorld = pi >= 0 ? PW[pi] : parent.getWorldMatrix();
  const local = mat4.multiply(mat4.create(), mat4.invert(mat4.create(), parentWorld), PW[ji]);
  const q = mat4.getRotation(quat.create(), local); quat.normalize(q, q);
  pose[threeName(joints[ji].getName())] = Array.from(q, (x) => +x.toFixed(6));
}
const along = (p) => vec3.dot(vec3.sub(vec3.create(), p, O), A);
const sTop = Math.max(...fingerVerts.index.map((v) => along(pts.get(v))));
const Og = vec3.scaleAndAdd(vec3.create(), O, A, sTop - 0.085);
const Xs = vec3.normalize(vec3.create(), vec3.scaleAndAdd(vec3.create(), F, A, -vec3.dot(F, A))), Zs = vec3.cross(vec3.create(), Xs, A);
const swordWorld = mat4.fromValues(Xs[0], Xs[1], Xs[2], 0, A[0], A[1], A[2], 0, Zs[0], Zs[1], Zs[2], 0, Og[0], Og[1], Og[2], 1);
const swordInSeat = mat4.multiply(mat4.create(), mat4.invert(mat4.create(), WORLD[iHand]), swordWorld);
const near = (list) => list.filter((v) => distAxis(pts.get(v), O) < want + 0.0025).length;
const report = {
  rig: RIG_NAME, seat: threeName(RIG.hand), angles_deg: Object.fromEntries(Object.entries(ang).map(([k, v]) => [k, +v.toFixed(1)])),
  palm_normal: Array.from(N, (x) => +x.toFixed(3)), gap_mm: +((minDist(pts) - GRIP_R) * 1000).toFixed(2),
  vertices_near_the_hilt: { ...Object.fromEntries(NAMES.map((n) => [n, near(fingerVerts[n])])), thumb: near(thumbVerts), palm: near(palmVerts) },
  pose, sword_in_seat: Array.from(swordInSeat, (x) => +x.toFixed(6)),
};
writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
console.log('[grip]', JSON.stringify({ ...report, pose: Object.keys(pose).length + ' bones', sword_in_seat: 'ok' }));

// ---- check mesh: the hand (posed) and a hilt cylinder at the seat, glTF axes
if (opt('--obj')) {
  let out = 'o hand\n', base = 1; const ids = handVerts, map = new Map(ids.map((v, i) => [v, i]));
  for (const v of ids) { const p = pts.get(v); out += `v ${p[0].toFixed(5)} ${p[1].toFixed(5)} ${p[2].toFixed(5)}\n`; }
  const idx = prim.getIndices().getArray();
  for (let i = 0; i < idx.length; i += 3) if (map.has(idx[i]) && map.has(idx[i + 1]) && map.has(idx[i + 2])) out += `f ${map.get(idx[i]) + 1} ${map.get(idx[i + 1]) + 1} ${map.get(idx[i + 2]) + 1}\n`;
  base += ids.length; out += 'o hilt\n';
  const S = 16, H = [-0.09, 0.09], U = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), A, Math.abs(A[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), V = vec3.cross(vec3.create(), A, U);
  for (const h of H) for (let s = 0; s < S; s++) { const t = s / S * Math.PI * 2, p = vec3.scaleAndAdd(vec3.create(), Og, A, h + 0.0); vec3.scaleAndAdd(p, p, U, Math.cos(t) * GRIP_R); vec3.scaleAndAdd(p, p, V, Math.sin(t) * GRIP_R); out += `v ${p[0].toFixed(5)} ${p[1].toFixed(5)} ${p[2].toFixed(5)}\n`; }
  for (let s = 0; s < S; s++) { const a = base + s, b = base + (s + 1) % S; out += `f ${a} ${b} ${b + S} ${a + S}\n`; }
  writeFileSync(opt('--obj'), out);
}
