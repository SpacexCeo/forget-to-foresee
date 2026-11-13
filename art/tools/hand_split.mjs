// A second joint for every finger group, so a fist can close (docs/art/townsfolk/rigging-best-practices.md, 12).
// The shared agent rig gives each hand three bones: thumb_<side>, index_<side> and fingers_<side> (the other three
// fingers), each one straight bone from the knuckle to the tip. One joint can only sweep the finger at the knuckle:
// at 90 degrees it stands the fingers up against the palm, which reads as a claw, and curling further swings them
// through the palm. This adds `<group>_1_<side>` under each of those bones, partway along the finger, and moves the
// weight of the outer part of the finger onto it. Nothing else changes: the mesh, its UVs, the textures, the bind
// pose and every existing clip are untouched, and a clip that does not mention the new bones leaves them straight,
// so the character looks and moves exactly as before until the clips use them.
//   node art/tools/hand_split.mjs <in.glb> <out.glb>        (run it where @gltf-transform/core resolves:
//      a folder whose node_modules links core, extensions and functions from the gltf-transform CLI)
//      [--at 0.42] [--blend 0.33,0.60] [--groups thumb,index,fingers]
// `--at` is where the new joint sits along the finger (share of its length), `--blend` the band over which the
// weight passes from the parent to it. Run it before the textures and the geometry are compressed, or re-run
// `gltf-transform meshopt` afterwards.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
// meshopt is only needed when the input is already compressed; without it, decompress first (gltf-transform copy)
let MeshoptDecoder = null, MeshoptEncoder = null;
try { ({ MeshoptDecoder, MeshoptEncoder } = await import('meshoptimizer')); } catch { /* uncompressed input only */ }

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const [src, dst] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!src || !dst) { console.error('usage: hand_split.mjs <in.glb> <out.glb> [--at 0.42] [--blend 0.33,0.60] [--groups thumb,index,fingers]'); process.exit(2); }
const AT = Number(arg('at', 0.42)), [B0, B1] = arg('blend', '0.33,0.60').split(',').map(Number);
const GROUPS = arg('groups', 'thumb,index,fingers').split(',');
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
if (MeshoptDecoder) io.registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot();
const skins = root.listSkins();
if (!skins.length) { console.error('no skin in ' + src); process.exit(1); }

/** World matrix of a node (gltf-transform gives it only through the scene graph). */
const worldOf = (node) => node.getWorldMatrix();
const mulDir = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
const norm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The inverse of a 4x4 column-major matrix (bones have no shear, but a general inverse keeps this honest). */
function invert(m) {
  const inv = new Array(16), a = m;
  inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10];
  inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10];
  inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9];
  inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9];
  inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10];
  inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10];
  inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9];
  inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9];
  inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6];
  inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6];
  inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5];
  inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5];
  inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6];
  inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6];
  inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5];
  inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5];
  let det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
  if (!det) throw new Error('singular matrix');
  det = 1 / det;
  return inv.map((x) => x * det);
}

/** a × b, both 4x4 column-major. */
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}

const report = [];
// A character can be cut into many skinned meshes, each with its own skin, all sharing the same bone nodes (Iris:
// 21 skins of 48 joints). Everything here is read from the skin's own inverse bind matrices rather than from the
// scene graph: a skinned mesh's vertices live in the space those matrices map from, which is not the world (Iris's
// are a metre and a half out of it). The inverse of a joint's bind matrix puts the bone in that same space.
const skinPrims = new Map();                    // skin -> [primitive]
for (const node of root.listNodes()) {
  const skin = node.getSkin();
  if (!skin || !node.getMesh()) continue;
  const list = skinPrims.get(skin) || [];
  for (const p of node.getMesh().listPrimitives()) list.push(p);
  skinPrims.set(skin, list);
}
const bindOf = (skin, ji) => invert(Array.from(skin.getInverseBindMatrices().getArray().slice(ji * 16, ji * 16 + 16)));

for (const side of ['L', 'R']) {
  for (const group of GROUPS) {
    const name = `${group}_${side}`;
    // the bone, and in which skins it carries skin: for each, where it sits in that mesh's own space
    let bone = null;
    const users = [];
    for (const [skin, prims] of skinPrims) {
      const joints = skin.listJoints(), ji = joints.findIndex((j) => j.getName() === name);
      if (ji < 0) continue;
      bone = bone || joints[ji];
      const B = bindOf(skin, ji), head = [B[12], B[13], B[14]];
      const scale = Math.hypot(B[4], B[5], B[6]) || 1, axis = norm([B[4], B[5], B[6]]);
      const hits = [];
      for (const p of prims) {
        const J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0'), P = p.getAttribute('POSITION');
        if (!J || !W || !P) continue;
        for (let v = 0; v < P.getCount(); v++) {
          const jj = J.getElement(v, []), ww = W.getElement(v, []);
          if (!jj.some((x, i) => x === ji && ww[i] > 0.2)) continue;
          const q = P.getElement(v, []);
          hits.push(dot([q[0] - head[0], q[1] - head[1], q[2] - head[2]], axis));
        }
      }
      if (hits.length >= 8) { hits.sort((x, y) => x - y); users.push({ skin, prims, ji, B, head, axis, scale, len: hits[Math.floor(hits.length * 0.95)], n: hits.length }); }
    }
    if (!bone || !users.length) { report.push(`${name}: no skin on this bone, skipped`); continue; }
    users.sort((x, y) => y.n - x.n);
    const main = users[0];
    if (!(main.len / main.scale > 0.004)) { report.push(`${name}: ${(main.len * 100).toFixed(1)} units long, skipped`); continue; }
    const localY = (AT * main.len) / main.scale;        // where the new joint sits, in the parent bone's own space

    const child = doc.createNode(`${group}_1_${side}`);
    child.setTranslation([0, localY, 0]);
    bone.addChild(child);

    let moved = 0, tight = 0;
    for (const u of users) {
      const len = (localY / AT) * u.scale;               // the same point, in this mesh's units
      const Bc = mul(u.B, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, localY, 0, 1]);
      u.skin.addJoint(child);
      const ci = u.skin.listJoints().length - 1;
      const acc = u.skin.getInverseBindMatrices();
      acc.setArray(Float32Array.from([...acc.getArray(), ...invert(Bc)])).setType('MAT4');
      for (const p of u.prims) {
        const J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0'), P = p.getAttribute('POSITION');
        if (!J || !W || !P) continue;
        for (let v = 0; v < P.getCount(); v++) {
          const jj = J.getElement(v, []), ww = W.getElement(v, []);
          const slot = jj.findIndex((x, i) => x === u.ji && ww[i] > 0);
          if (slot < 0) continue;
          const q = P.getElement(v, []);
          const d = dot([q[0] - u.head[0], q[1] - u.head[1], q[2] - u.head[2]], u.axis);
          const k = ss(B0 * len, B1 * len, d);
          if (k <= 0.001) continue;
          const give = ww[slot] * k;
          // where the new bone's weight goes: its own slot if it has one, else an empty slot, else the smallest
          // influence of the four (whose weight goes back to this finger, the bone next to it)
          let target = jj.findIndex((x, i) => x === ci && i !== slot);
          if (target < 0) target = ww.findIndex((x, i) => x <= 1e-5 && i !== slot);
          if (target < 0) { let lo = Infinity; for (let i = 0; i < 4; i++) if (i !== slot && ww[i] < lo) { lo = ww[i]; target = i; } tight++; }
          const had = jj[target] === ci ? ww[target] : 0;          // it may already hold this bone
          const displaced = jj[target] === ci ? 0 : ww[target];     // what it held goes back to the finger beside it
          ww[slot] = ww[slot] - give + displaced;
          jj[target] = ci; ww[target] = had + give;
          const sum = ww[0] + ww[1] + ww[2] + ww[3];
          if (sum > 0) for (let i = 0; i < 4; i++) ww[i] /= sum;
          J.setElement(v, jj); W.setElement(v, ww);
          moved++;
        }
      }
    }
    report.push(`${name}: ${(main.len / main.scale * 100).toFixed(1)} cm long, joint at ${(localY * 100).toFixed(1)} cm, ${moved} vertices moved in ${users.length} skin(s)${tight ? `, ${tight} needed a slot` : ''}`);
  }
}

await io.write(dst, doc);
const after = root.listSkins().map((s) => s.listJoints().length);
console.log(report.join('\n'));
console.log('HAND_SPLIT', dst, 'joints now', after.join(','));
