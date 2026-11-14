// Add the clips of one side-car (e.g. the rider's `ride`, art/heroes/ride_clip.py) to a hero's clip file, bound to its
// nodes by name, with the extras from a JSON file; a clip of the same name is replaced.
//   node art/tools/glb_add_clips.mjs <clip file.glb> <extra clips.glb> <extras.json> <out.glb>
// Every added track is spread over the clip's full key times (the game's runtime retarget, anim-library.js
// retargetClip, reads all tracks at the first track's times). Keeps the clip file's compression. Needs
// @gltf-transform/cli 4 (global).
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

const [dstIn, srcFile, extrasFile, out] = process.argv.slice(2);
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(dstIn), src = await io.read(srcFile), R = doc.getRoot(), buf = R.listBuffers()[0];
const extras = JSON.parse(fs.readFileSync(extrasFile, 'utf8'));
const nodes = new Map(R.listNodes().map((n) => [n.getName(), n]));
const deq = (a) => { const v = a.getArray(); if (!a.getNormalized()) return Float32Array.from(v); const q = v instanceof Int16Array ? 32767 : v instanceof Int8Array ? 127 : v instanceof Uint16Array ? 65535 : 255; return Float32Array.from(v, (x) => Math.max(x / q, -1)); };
const added = [];
for (const a of src.getRoot().listAnimations()) {
  for (const old of R.listAnimations()) if (old.getName() === a.getName()) old.dispose();
  const chans = a.listChannels().filter((c) => c.getTargetNode() && nodes.has(c.getTargetNode().getName()));
  const T = chans.map((c) => c.getSampler().getInput()).reduce((m, x) => (x.getCount() > m.getCount() ? x : m)).getArray();
  const anim = doc.createAnimation(a.getName()), times = doc.createAccessor().setType('SCALAR').setArray(Float32Array.from(T)).setBuffer(buf);
  for (const c of chans) {
    const s = c.getSampler(), t = s.getInput().getArray(), v = deq(s.getOutput()), n = s.getOutput().getElementSize(), o = new Float32Array(T.length * n);
    for (let i = 0, k = 0; i < T.length; i++) { // linear (normalised for quaternions) between the source keys
      while (k + 1 < t.length - 1 && t[k + 1] <= T[i]) k++;
      const k1 = Math.min(k + 1, t.length - 1), u = t[k1] > t[k] ? Math.min(1, Math.max(0, (T[i] - t[k]) / (t[k1] - t[k]))) : 0;
      let dot = 0; if (n === 4) for (let j = 0; j < 4; j++) dot += v[k * 4 + j] * v[k1 * 4 + j];
      let len = 0;
      for (let j = 0; j < n; j++) { const x = v[k * n + j] * (1 - u) + (dot < 0 ? -1 : 1) * v[k1 * n + j] * u; o[i * n + j] = x; len += x * x; }
      if (n === 4) for (let j = 0; j < 4; j++) o[i * 4 + j] /= Math.sqrt(len) || 1;
    }
    const smp = doc.createAnimationSampler().setInput(times).setInterpolation('LINEAR')
      .setOutput(doc.createAccessor().setType(s.getOutput().getType()).setArray(o).setBuffer(buf));
    anim.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(nodes.get(c.getTargetNode().getName())).setTargetPath(c.getTargetPath()).setSampler(smp));
  }
  anim.setExtras(extras); added.push([a.getName(), chans.length, T.length]);
}
await doc.transform(prune({ keepLeaves: true }));
await io.write(out, doc);
console.log(JSON.stringify({ out, bytes: fs.statSync(out).size, added }));
