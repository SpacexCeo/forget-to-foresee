// KTX2 + meshopt compression without native tools (WebAssembly Basis encoder from npm), used when
// toktx is not available (cloud sessions). Same intent as compress-glb.sh: textures capped at 2048,
// normals -> UASTC + RDO + zstd, colour (sRGB) and data maps (linear) -> ETC1S, geometry -> meshopt.
// Setup in a scratch folder: npm i @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 meshoptimizer ktx2-encoder sharp
// Usage: node compress-glb-wasm.mjs in.glb out.glb [maxSize=2048]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, dedup, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import sharp from 'sharp';

const [inp, out, maxArg] = process.argv.slice(2);
const MAX = Number(maxArg || 2048);
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);

// 1) cap every texture at MAX (lossless PNG so the KTX2 encoder gets clean input)
for (const t of doc.getRoot().listTextures()) {
  const img = t.getImage(); if (!img || t.getMimeType() === 'image/ktx2') continue;
  const meta = await sharp(img).metadata();
  const png = await sharp(img).resize({ width: Math.min(MAX, meta.width), height: Math.min(MAX, meta.height), fit: 'inside' }).png({ compressionLevel: 3 }).toBuffer();
  t.setImage(new Uint8Array(png)); t.setMimeType('image/png');
  console.log('resize', t.getName() || '(tex)', meta.width + 'x' + meta.height, '->', Math.min(MAX, meta.width));
}
const imageDecoder = async (buf) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};
// 2) normals -> UASTC + RDO + zstd (linear); 3) colour (sRGB) and data maps (linear) -> ETC1S
await doc.transform(ktx2({ slots: /normalTexture/, isUASTC: true, isNormalMap: true, enableRDO: true, rdoQualityLevel: 4, needSupercompression: true, generateMipmap: true, isSetKTX2SRGBTransferFunc: false, isPerceptual: false, imageDecoder }));
await doc.transform(ktx2({ slots: /baseColorTexture|emissiveTexture/, isUASTC: false, qualityLevel: 230, compressionLevel: 2, generateMipmap: true, isSetKTX2SRGBTransferFunc: true, imageDecoder }));
await doc.transform(ktx2({ slots: /metallicRoughnessTexture|occlusionTexture/, isUASTC: false, qualityLevel: 230, compressionLevel: 2, generateMipmap: true, isSetKTX2SRGBTransferFunc: false, isPerceptual: false, imageDecoder }));
// 4) geometry
await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
for (const t of doc.getRoot().listTextures()) console.log('out', t.getMimeType(), t.getImage().byteLength);
