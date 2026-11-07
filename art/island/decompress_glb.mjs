// Render helper: turns a shipped (KTX2 + meshopt + quantized) .glb back into a plain glTF that the
// Blender importer reads (PNG textures, float attributes). Used only for the island QA renders,
// which place the compressed camp / scroll table / anchor glbs around the island.
// Usage: NODE_PATH=<gltf-transform cli node_modules> node decompress_glb.mjs in.glb out.glb
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(process.env.NODE_PATH.replace(/\/?$/, '/') + 'x.js');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { dequantize } = require('@gltf-transform/functions');
const { MeshoptDecoder } = require('meshoptimizer');

const [inp, out] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
const tmp = mkdtempSync(join(tmpdir(), 'unktx-'));
let i = 0;
for (const tex of doc.getRoot().listTextures()) {
  if (tex.getMimeType() !== 'image/ktx2') continue;
  const a = join(tmp, `t${i}.ktx2`), b = join(tmp, `t${i}.png`);
  i++;
  writeFileSync(a, tex.getImage());
  execFileSync('ktx', ['extract', '--transcode', 'rgba8', a, b]);
  tex.setImage(readFileSync(b)).setMimeType('image/png');
  if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.ktx2$/, '.png'));
}
await doc.transform(dequantize());
for (const ext of doc.getRoot().listExtensionsUsed()) {
  if (['EXT_meshopt_compression', 'KHR_texture_basisu', 'KHR_mesh_quantization'].includes(ext.extensionName)) ext.dispose();
}
await io.write(out, doc);
rmSync(tmp, { recursive: true, force: true });
console.log('decompressed', inp, '->', out, 'textures', i);
