// The town's shared pack file: one side-car of the Tripo pack, retargeted offline onto ONE agent-rig body, that the
// game retargets again at load onto every townsperson (play/anim-library.js townsfolkClips, file 'townsfolk_pack').
//   node art/tools/glb_town_pack.mjs <clips.glb> <hero_clips.json> <bones.json> <target id> <out.glb> <clip,names>
// Keeps the named clips, and in them only the rotations of the body bones the pack drives (bones.json → bones values)
// and the pelvis travel: no face, skirt or prop tracks (each body keeps its own rest there). Every clip gets the extras
// the game reads: loop, speed (m/s on this body, locomotion only: the pack's speed times its hips_scale; 0 for a clip that stands), take. Then meshopt (no resample: every track keeps the same key times, as the retarget expects).
// Needs @gltf-transform/cli 4 (global).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const req = createRequire(path.join(root, '@gltf-transform', 'cli', 'package.json'));
const load = (name) => import(pathToFileURL(req.resolve(name)).href);
const { NodeIO } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions');
const { prune } = await load('@gltf-transform/functions');
const { MeshoptDecoder, MeshoptEncoder } = await load('meshoptimizer');

const [src, indexFile, bonesFile, target, dst, list] = process.argv.slice(2);
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const index = JSON.parse(fs.readFileSync(indexFile, 'utf8')), hips = index.hips_scale[target] || 1;
const info = new Map(index.clips.map((c) => [c.name, c]));
const body = new Set(Object.values(JSON.parse(fs.readFileSync(bonesFile, 'utf8')).bones).filter((n) => !/^prop_/.test(n))); // a prop socket keeps its own rest
const keep = list.split(',');
for (const n of keep) if (!info.has(n)) throw new Error('no clip ' + n + ' in the index');
function densify(a) {
  // Every track on the clip's full key times (the exporter leaves a still bone with 2 keys; the game's retarget reads
  // all tracks at the first track's times): linear in between, quaternions normalised
  const chans = a.listChannels(), full = chans.map((ch) => ch.getSampler().getInput()).reduce((m, x) => (x.getCount() > m.getCount() ? x : m));
  const T = full.getArray();
  for (const ch of chans) {
    const s = ch.getSampler(), inp = s.getInput(); if (inp === full) continue;
    const o = s.getOutput(), q = o.getNormalized() ? (o.getArray() instanceof Int16Array ? 32767 : o.getArray() instanceof Int8Array ? 127 : o.getArray() instanceof Uint16Array ? 65535 : 255) : 1; // a quantized track back to floats
    const t = inp.getArray(), v = Float32Array.from(o.getArray(), (x) => (q === 1 ? x : Math.max(x / q, -1))), e = s.getOutput().getElementSize(), out = new Float32Array(T.length * e);
    for (let i = 0, k = 0; i < T.length; i++) {
      while (k + 1 < t.length - 1 && t[k + 1] <= T[i]) k++;
      const k1 = Math.min(k + 1, t.length - 1), u = t[k1] > t[k] ? Math.min(1, Math.max(0, (T[i] - t[k]) / (t[k1] - t[k]))) : 0;
      const dot = e === 4 ? v[k * 4] * v[k1 * 4] + v[k * 4 + 1] * v[k1 * 4 + 1] + v[k * 4 + 2] * v[k1 * 4 + 2] + v[k * 4 + 3] * v[k1 * 4 + 3] : 1;
      let len = 0;
      for (let j = 0; j < e; j++) { const x = v[k * e + j] * (1 - u) + (dot < 0 ? -1 : 1) * v[k1 * e + j] * u; out[i * e + j] = x; len += x * x; }
      if (e === 4) for (let j = 0; j < 4; j++) out[i * 4 + j] /= Math.sqrt(len) || 1;
    }
    s.setInput(full); o.setNormalized(false).setArray(out);
}
}
const doc = await io.read(src);
for (const a of doc.getRoot().listAnimations()) {
  const c = info.get(a.getName());
  if (!keep.includes(a.getName())) { a.dispose(); continue; }
  for (const ch of a.listChannels()) {
    const n = ch.getTargetNode() && ch.getTargetNode().getName(), p = ch.getTargetPath();
    if (!(body.has(n) && (p === 'rotation' || (p === 'translation' && n === 'pelvis')))) ch.dispose();
  }
  const used = new Set(a.listChannels().map((ch) => ch.getSampler()));
  for (const s of a.listSamplers()) if (!used.has(s)) s.dispose(); // the dropped tracks' data out too
  a.setExtras({ loop: !!c.loop, speed: c.tag === 'locomotion' ? +((c.speed_mps || 0) * hips).toFixed(3) : 0, take: 'tripo_townsfolk_pack:' + c.pack_name });
}
await doc.transform(prune({ keepLeaves: true }));
const raw = dst.replace(/\.glb$/, '_raw.glb');
await io.write(raw, doc);
// no resample: the game's retarget (anim-library.js retargetClip) reads every track at the same key times
execFileSync('gltf-transform', ['meshopt', raw, dst, '--level', 'medium']);
fs.unlinkSync(raw);
// the meshopt step folds a still track to 2 keys again: spread them out after it (written back with the same compression)
const packed = await io.read(dst);
for (const a of packed.getRoot().listAnimations()) densify(a);
await io.write(dst, packed);
console.log(JSON.stringify({ out: dst, bytes: fs.statSync(dst).size, clips: doc.getRoot().listAnimations().map((a) => [a.getName(), a.getExtras()]) }));
