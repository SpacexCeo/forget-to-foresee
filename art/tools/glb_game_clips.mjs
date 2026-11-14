// A hero's game clip file from a pack side-car: the game's clip names (idle, walk, strike1 ...) cut from the pack's
// clips by a map (e.g. art/heroes/elise_game_clips.json), with the extras play/iris-avatar.js reads.
//   node art/tools/glb_game_clips.mjs <pack side-car.glb> <hero_clips.json> <target id> <map.json> <out.glb>
// Each map entry: { from: pack clip name, window?: [start, end] s, extras: {...} } (walk/run: set extras.speed to the clip's ground speed on this body). A window
// keeps the keys inside it and shifts them to start at 0; the same pack clip may feed several game clips. Then meshopt.
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

const [src, indexFile, target, mapFile, dst] = process.argv.slice(2);
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
const info = new Map(index.clips.map((c) => [c.name, c]));
const map = Object.entries(JSON.parse(fs.readFileSync(mapFile, 'utf8'))).filter(([k]) => k !== '_');
const doc = await io.read(src), R = doc.getRoot(), buf = R.listBuffers()[0];
const packs = new Map(R.listAnimations().map((a) => [a.getName(), a]));
for (const [, e] of map) if (!packs.has(e.from)) throw new Error('no pack clip ' + e.from);
const made = [];
for (const [name, e] of map) {
  const src = packs.get(e.from), out = doc.createAnimation(name);
  const [w0, w1] = e.window || [-Infinity, Infinity];
  for (const ch of src.listChannels()) {
    const s = ch.getSampler(), t = s.getInput().getArray(), v = s.getOutput().getArray(), n = s.getOutput().getElementSize();
    let i0 = t.findIndex((x) => x >= w0 - 1e-4); if (i0 < 0) i0 = t.length - 1;
    let i1 = t.length - 1; while (i1 > i0 && t[i1] > w1 + 1e-4) i1--;
    const t0 = e.window ? t[i0] : 0;
    const T = Float32Array.from(t.subarray(i0, i1 + 1), (x) => x - t0), V = v.slice(i0 * n, (i1 + 1) * n);
    const inp = doc.createAccessor().setType('SCALAR').setArray(T).setBuffer(buf);
    const outp = doc.createAccessor().setType(s.getOutput().getType()).setArray(V).setBuffer(buf).setNormalized(s.getOutput().getNormalized());
    const smp = doc.createAnimationSampler().setInput(inp).setOutput(outp).setInterpolation(s.getInterpolation());
    out.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(ch.getTargetNode()).setTargetPath(ch.getTargetPath()).setSampler(smp));
  }
  const c = info.get(e.from) || {};
  const extras = { take: 'tripo_pack:' + (c.pack_name || e.from) + (e.window ? ` ${e.window[0]}-${e.window[1]}s` : ''), speed: 0, ...e.extras };
  out.setExtras(extras); made.push([name, extras]);
}
for (const a of packs.values()) a.dispose();
await doc.transform(prune({ keepLeaves: true }));
const raw = dst.replace(/\.glb$/, '_raw.glb');
await io.write(raw, doc);
execFileSync('gltf-transform', ['meshopt', raw, dst, '--level', 'medium']);
fs.unlinkSync(raw);
console.log(JSON.stringify({ out: dst, bytes: fs.statSync(dst).size, clips: made }));
