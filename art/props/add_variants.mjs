// Adds KHR_materials_variants to prop_scroll_fragment.glb: the clan inlay material
// (M_ScrollFragment_Clan) gets one variant per clan plus "dormant" (the fragment gone
// dark after its hold tick). Colours come from variants.json written next to the glb.
// Usage: node add_variants.mjs <in.glb> <out.glb> <variants.json>
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const root = execSync('npm root -g').toString().trim();
const require = createRequire(root + '/@gltf-transform/cli/package.json');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS, KHRMaterialsVariants } = require('@gltf-transform/extensions');

const [inPath, outPath, varPath] = process.argv.slice(2);
const variants = JSON.parse(fs.readFileSync(varPath, 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inPath);
const ext = doc.createExtension(KHRMaterialsVariants);
const base = doc.getRoot().listMaterials().find((m) => m.getName().endsWith('_Clan'));
if (!base) throw new Error('no *_Clan material');
const made = {};
for (const [name, v] of Object.entries(variants)) {
  const m = base.clone().setName(base.getName() + '_' + name);
  m.setBaseColorFactor([...v.color, 1]);
  m.setEmissiveFactor(v.emit.map((c) => Math.min(1, c)));
  const strength = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'KHR_materials_emissive_strength');
  const es = m.getExtension('KHR_materials_emissive_strength');
  if (es) es.setEmissiveStrength(Math.max(1, v.emit_strength));
  else if (strength && v.emit_strength > 1) {
    m.setExtension('KHR_materials_emissive_strength', strength.createEmissiveStrength().setEmissiveStrength(v.emit_strength));
  }
  made[name] = { variant: ext.createVariant(name), material: m };
}
let mapped = 0;
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMaterial() !== base) continue;
    const mv = ext.createMappingList();
    for (const { variant, material } of Object.values(made)) {
      mv.addMapping(ext.createMapping().setMaterial(material).addVariant(variant));
    }
    prim.setExtension('KHR_materials_variants', mv);
    mapped++;
  }
}
if (!mapped) throw new Error('no primitive uses the clan material');
await io.write(outPath, doc);
console.log(`variants: ${Object.keys(made).join(', ')} on ${mapped} primitive(s)`);
