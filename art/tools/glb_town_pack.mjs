// The town's shared pack file: one side-car of the Tripo pack, retargeted offline onto ONE agent-rig body, that the
// game retargets again at load onto every townsperson (play/anim-library.js townsfolkClips, file 'townsfolk_pack').
//   node art/tools/glb_town_pack.mjs <clips.glb> <hero_clips.json> <bones.json> <target id> <out.glb> <clip,names>
// Keeps the named clips, and in them only the rotations of the body bones the pack drives (bones.json → bones values)
// and the pelvis travel: no face, skirt or prop tracks (each body keeps its own rest there). Every clip gets the extras
// the game reads: loop, speed (m/s on this body, locomotion only: the pack's speed times its hips_scale; 0 for a clip that stands), take. Then resample + meshopt.
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
const doc = await io.read(src);
for (const a of doc.getRoot().listAnimations()) {
  const c = info.get(a.getName());
  if (!keep.includes(a.getName())) { a.dispose(); continue; }
  for (const ch of a.listChannels()) {
    const n = ch.getTargetNode() && ch.getTargetNode().getName(), p = ch.getTargetPath();
    if (!(body.has(n) && (p === 'rotation' || (p === 'translation' && n === 'pelvis')))) ch.dispose();
  }
  a.setExtras({ loop: !!c.loop, speed: c.tag === 'locomotion' ? +((c.speed_mps || 0) * hips).toFixed(3) : 0, take: 'tripo_townsfolk_pack:' + c.pack_name });
}
await doc.transform(prune({ keepLeaves: true }));
const raw = dst.replace(/\.glb$/, '_raw.glb');
await io.write(raw, doc);
execFileSync('gltf-transform', ['resample', raw, raw]);
execFileSync('gltf-transform', ['meshopt', raw, dst, '--level', 'medium']);
fs.unlinkSync(raw);
console.log(JSON.stringify({ out: dst, bytes: fs.statSync(dst).size, clips: doc.getRoot().listAnimations().map((a) => [a.getName(), a.getExtras()]) }));
