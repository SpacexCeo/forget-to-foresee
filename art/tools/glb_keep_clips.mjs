// Keep only some animations of a clip side-car (the townsfolk need the idle, social and locomotion clips of the pack,
// not the sports and combat ones): by the tags of the pack's index.
//   node art/tools/glb_keep_clips.mjs <in.glb> <out.glb> <hero_clips.json> idle,social,locomotion [extra,clip,names]
// Needs @gltf-transform/cli 4 (global). Writes the kept clip names to stdout.
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

const [src, dst, indexFile, tagList, extra = ''] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const tags = new Set(tagList.split(',')); const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
const keep = new Set([...index.clips.filter((c) => tags.has(c.tag)).map((c) => c.name), ...extra.split(',').filter(Boolean)]);
const doc = await io.read(src);
for (const a of doc.getRoot().listAnimations()) if (!keep.has(a.getName())) a.dispose();
// --no-fingers: the finger tracks out (half of a Mixamo rig's bones; the townsfolk read at street distance)
if (process.argv.includes('--no-fingers')) for (const a of doc.getRoot().listAnimations()) for (const ch of a.listChannels()) {
  const n = ch.getTargetNode() && ch.getTargetNode().getName();
  if (n && /Hand(Thumb|Index|Middle|Ring|Pinky)\d/.test(n)) ch.dispose();
}
await doc.transform(prune({ keepLeaves: true }));
await io.write(dst, doc);
console.log(JSON.stringify({ out: dst, bytes: fs.statSync(dst).size, kept: doc.getRoot().listAnimations().map((a) => a.getName()) }));
