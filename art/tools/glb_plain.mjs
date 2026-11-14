// Make a shipped .glb readable by Blender's importer: meshopt compression off, KTX2 textures back to PNG.
//   node art/tools/glb_plain.mjs <in.glb> <out.glb>
// Needs @gltf-transform/cli 4 installed globally (its own node_modules carry core, extensions, functions,
// meshoptimizer and ktx-parse) and KTX-Software (`ktx` on the PATH) for the textures.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const base = path.join(root, '@gltf-transform', 'cli');
const req = createRequire(path.join(base, 'package.json'));
const load = (name) => import(pathToFileURL(req.resolve(name)).href);
const { NodeIO } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS, EXTMeshoptCompression, KHRTextureBasisu } = await load('@gltf-transform/extensions');
const { MeshoptDecoder, MeshoptEncoder } = await load('meshoptimizer');
const fs = await import('node:fs');
const os = await import('node:os');

const [src, dst] = process.argv.slice(2);
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
for (const ext of doc.getRoot().listExtensionsUsed()) if (ext instanceof EXTMeshoptCompression) ext.dispose();
let ktx = 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plain-'));
for (const [i, tex] of doc.getRoot().listTextures().entries()) {
  if (tex.getMimeType() !== 'image/ktx2') continue;
  const a = path.join(tmp, i + '.ktx2'), b = path.join(tmp, i + '.png');
  fs.writeFileSync(a, tex.getImage());
  execFileSync('ktx', ['extract', a, b]);
  tex.setImage(fs.readFileSync(b)).setMimeType('image/png'); ktx++;
}
for (const ext of doc.getRoot().listExtensionsUsed()) if (ext instanceof KHRTextureBasisu) ext.dispose();
await io.write(dst, doc);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('plain', dst, fs.statSync(dst).size, 'bytes,', ktx, 'textures decoded');
