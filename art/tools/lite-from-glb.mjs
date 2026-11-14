// Bake the light `_m` file of a prop from its shipped .glb: every KTX2 texture decoded, halved (1024 -> 512), re-encoded
// the same way (ETC1S colour and ORM, UASTC normals), geometry untouched (already meshopt). Usage (needs @gltf-transform/core+extensions, meshoptimizer, KTX-Software 4.4 ktx + toktx): node art/tools/lite-from-glb.mjs in.glb out_m.glb [size=512]. Baked the 21 archipelago props (14.11) on the GPU box; a prop whose weight is geometry (fauna, guest) gains nothing and keeps no _m
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [,, inp, out, size = '512'] = process.argv;
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lite-'));
let n = 0;
for (const tex of doc.getRoot().listTextures()) {
  if (tex.getMimeType() !== 'image/ktx2') continue;
  const name = tex.getName() || ('t' + n);
  const src = path.join(tmp, name + '.ktx2'), png = path.join(tmp, name + '.png'), dst = path.join(tmp, name + '_m.ktx2');
  fs.writeFileSync(src, tex.getImage());
  execFileSync('ktx', ['extract', '--transcode', 'rgba8', src, png]);
  const normal = /normal/i.test(name), linear = normal || /orm|rough|metal|occl/i.test(name);
  const args = ['--t2', '--genmipmap', '--resize', `${size}x${size}`, '--assign_oetf', linear ? 'linear' : 'srgb'];
  if (normal) args.push('--encode', 'uastc', '--uastc_quality', '2', '--uastc_rdo_l', '4', '--zcmp', '19', '--normal_mode');
  else args.push('--encode', 'etc1s', '--qlevel', '255', '--clevel', '4');
  execFileSync('toktx', [...args, dst, png]);
  tex.setImage(fs.readFileSync(dst)); n++;
}
await io.write(out, doc);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(JSON.stringify({ out, textures: n, bytes: fs.statSync(out).size, from: fs.statSync(inp).size }));
