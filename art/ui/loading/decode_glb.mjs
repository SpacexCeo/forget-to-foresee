// Decodes a meshopt/quantized glb into a plain glb Blender can import. Textures (KTX2) are dropped: the
// loading-screen render is a silhouette and replaces every material.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
const [,, src, dst] = process.argv;
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
for (const e of doc.getRoot().listExtensionsUsed()) if (e instanceof EXTMeshoptCompression) e.dispose();
await doc.transform(dequantize());
for (const e of doc.getRoot().listExtensionsUsed()) if (e instanceof KHRMeshQuantization) e.dispose();
for (const t of doc.getRoot().listTextures()) t.dispose();
for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'KHR_texture_basisu') e.dispose();
await io.write(dst, doc);
console.log('ok', doc.getRoot().listExtensionsUsed().map((e) => e.extensionName));
