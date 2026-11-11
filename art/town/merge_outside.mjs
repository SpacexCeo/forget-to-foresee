// Swaps the hillside outside the lower gate into a shipped, compressed town_terrain(.glb | _m.glb):
//   1. drops the old skirt in front of the south wall: the triangles of town_terrain_ground / _cobble whose
//      three vertices lie at z >= 35.6 (town-local; the terrain's pivot is the town origin);
//   2. appends the meshes of the (meshopt-quantized) town_outside.glb as new nodes, with every material
//      replaced by the shipped one of the same name (M_Town_Ground, M_Town_Cobble, M_Town_Foliage, ...), so
//      the textures are the ones already in the file. Materials the file does not have yet are copied.
// Nothing inside the walls is rebuilt or re-quantized. Needs @gltf-transform 4.x and meshoptimizer next to the
// script (ln -s "$(npm root -g)/@gltf-transform/cli/node_modules" art/town/node_modules):
//   node merge_outside.mjs <shipped.glb> <town_outside_q.glb> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, prune, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const [src, add, dst] = process.argv.slice(2);
const Z_SEAM = 35.6 - 0.01;
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src), extra = await io.read(add);
const root = doc.getRoot();

let dropped = 0, kept = 0;
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh || !/^town_terrain_(ground|cobble)$/.test(node.getName())) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
    const z = (i) => { const p = pos.getElement(i, []); return m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]; };
    const old = idx.getArray(), out = [];
    for (let t = 0; t + 2 < old.length; t += 3) {
      if (z(old[t]) >= Z_SEAM && z(old[t + 1]) >= Z_SEAM && z(old[t + 2]) >= Z_SEAM) { dropped++; continue; }
      out.push(old[t], old[t + 1], old[t + 2]); kept++;
    }
    idx.setArray(new old.constructor(out));
  }
}

const have = new Map(root.listMaterials().map((mat) => [mat.getName(), mat]));
const sceneCount = root.listScenes().length;
mergeDocuments(doc, extra);
const scene = root.listScenes()[0];
const copied = new Set();
for (const s of root.listScenes().slice(sceneCount)) {
  for (const node of s.listChildren()) {
    scene.addChild(node);
    node.traverse((n) => {
      for (const prim of n.getMesh() ? n.getMesh().listPrimitives() : []) {
        const mat = prim.getMaterial(), twin = mat && have.get(mat.getName());
        if (twin) prim.setMaterial(twin); else if (mat) copied.add(mat.getName());
      }
    });
  }
  s.dispose();
}
await doc.transform(unpartition(), prune({ keepAttributes: true, keepIndices: true, keepLeaves: true, keepSolidTextures: true }));
await io.write(dst, doc);
console.log(JSON.stringify({ dst, dropped, kept, newMaterials: [...copied] }));
