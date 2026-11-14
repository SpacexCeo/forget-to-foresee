// Put a side-car clip file's animations onto a character model, the way the game does at run time (tracks are bound
// to the model's bones by NAME), and write one plain .glb Blender can import with the clips as actions on the rig.
//   node art/tools/glb_with_clips.mjs <model.glb> <clips.glb> <out.glb>
// The model's own clips with the same names are dropped (the side-car set is the game's default); meshopt is taken
// off and KTX2 textures go back to PNG, as in glb_plain.mjs. Needs @gltf-transform/cli 4 (global) and `ktx`.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const req = createRequire(path.join(root, '@gltf-transform', 'cli', 'package.json'));
const load = (name) => import(pathToFileURL(req.resolve(name)).href);
const { NodeIO } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS, EXTMeshoptCompression, KHRTextureBasisu } = await load('@gltf-transform/extensions');
const { mergeDocuments, prune, unpartition } = await load('@gltf-transform/functions');
const { MeshoptDecoder, MeshoptEncoder } = await load('meshoptimizer');

const [modelFile, clipsFile, out] = process.argv.slice(2);
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(modelFile), clips = await io.read(clipsFile);
const names = new Set(clips.getRoot().listAnimations().map((a) => a.getName()));
for (const a of doc.getRoot().listAnimations()) if (names.has(a.getName())) a.dispose();
const own = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
const before = new Set(doc.getRoot().listNodes()), scenesBefore = new Set(doc.getRoot().listScenes());
mergeDocuments(doc, clips);
let bound = 0, lost = 0;
for (const a of doc.getRoot().listAnimations()) {
  if (!names.has(a.getName())) continue;
  for (const ch of a.listChannels()) {
    const t = ch.getTargetNode(); if (!t || before.has(t)) continue;
    const mine = own.get(t.getName());
    if (mine) { ch.setTargetNode(mine); bound++; } else { ch.dispose(); lost++; }
  }
}
for (const s of doc.getRoot().listScenes()) if (!scenesBefore.has(s)) s.dispose();
for (const n of doc.getRoot().listNodes()) if (!before.has(n)) n.dispose();
for (const ext of doc.getRoot().listExtensionsUsed()) if (ext instanceof EXTMeshoptCompression) ext.dispose();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clips-')); let ktx = 0;
for (const [i, tex] of doc.getRoot().listTextures().entries()) {
  if (tex.getMimeType() !== 'image/ktx2') continue;
  const a = path.join(tmp, i + '.ktx2'), b = path.join(tmp, i + '.png');
  fs.writeFileSync(a, tex.getImage()); execFileSync('ktx', ['extract', a, b]);
  tex.setImage(fs.readFileSync(b)).setMimeType('image/png'); ktx++;
}
for (const ext of doc.getRoot().listExtensionsUsed()) if (ext instanceof KHRTextureBasisu) ext.dispose();
await doc.transform(prune({ keepLeaves: true, keepAttributes: true }), unpartition());   // one buffer: a .glb holds no more
await io.write(out, doc);
fs.rmSync(tmp, { recursive: true, force: true });
const speeds = Object.fromEntries(doc.getRoot().listAnimations().map((a) => [a.getName(), (a.getExtras() || {}).speed]).filter(([, v]) => v != null));
console.log(JSON.stringify({ out, bytes: fs.statSync(out).size, clips: [...names], channels_bound: bound, channels_without_bone: lost, textures_decoded: ktx, speeds }));
