// Post-process and verify the fauna glbs (Node 20+, global @gltf-transform/cli 4.x).
//
//   node art/fauna/post_fauna.mjs post  <name>   art/fauna/out/fauna_<name>_raw.glb -> _ext.glb
//        sets the material extensions Blender cannot export reliably (iridescence, transmission,
//        volume, emissive strength), alpha modes and double-sidedness; tags root extras.
//   node art/fauna/post_fauna.mjs check <name>   verifies game/public/assets/models/fauna_<name>.glb:
//        triangles, joints, clips (duration, first/last pose error of loops), KTX2/meshopt use,
//        glTF validator; writes art/fauna/out/fauna_<name>_check.json.
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = execSync('npm root -g').toString().trim();
const req = createRequire(root + '/@gltf-transform/cli/package.json');
const { NodeIO } = req('@gltf-transform/core');
const EXT = req('@gltf-transform/extensions');
const { MeshoptDecoder } = req('meshoptimizer');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const OUT = path.join(HERE, 'out');
const [mode, name] = process.argv.slice(2);
const LOOPS = { skyray: ['glide', 'bank', 'bank_r'], driftjelly: ['pulse'], glyphmote: ['orbit'], cloudwhale: ['swim'], moss_critter: ['idle', 'hop'] };

// Material look by name suffix (restrained palette, gold glow; see build_fauna.py).
const LOOK = [
  [/_Nacre$|_Shell$/, { irid: [0.7, 1.3, 140, 460] }],
  [/_Membrane$/, { alpha: 'BLEND', ds: true, irid: [1.0, 1.32, 180, 620], emissive: [0.10, 0.075, 0.04], es: 1 }],
  [/_Filament$/, { alpha: 'BLEND', ds: true, emissive: [1.0, 0.78, 0.45], es: 0.9, irid: [0.6, 1.3, 200, 500] }],
  [/_Bell$/, { transmission: 0.9, ior: 1.34, volume: [0.04, 0.35, [1.0, 0.88, 0.68]], irid: [0.9, 1.33, 160, 520], emissive: [1.0, 0.82, 0.55], es: 0.35, rough: 0.12 }],
  [/_Glow$/, { emissive: [1.0, 0.78, 0.42], es: 6 }],
  [/^M_Glyphmote_Nacre$/, { irid: [1.0, 1.3, 220, 640], emissive: [1.0, 0.8, 0.5], es: 0.8, rough: 0.18 }],
  [/_Body$/, {}],
];

async function io() {
  await MeshoptDecoder.ready;
  return new NodeIO().registerExtensions(EXT.ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
}

async function post() {
  const nio = await io();
  const doc = await nio.read(path.join(OUT, `fauna_${name}_raw.glb`));
  const irid = doc.createExtension(EXT.KHRMaterialsIridescence);
  const trans = doc.createExtension(EXT.KHRMaterialsTransmission);
  const vol = doc.createExtension(EXT.KHRMaterialsVolume);
  const ior = doc.createExtension(EXT.KHRMaterialsIOR);
  const es = doc.createExtension(EXT.KHRMaterialsEmissiveStrength);
  const used = new Set();
  for (const m of doc.getRoot().listMaterials()) {
    const look = LOOK.find(([re]) => re.test(m.getName()));
    if (!look) continue;
    const L = look[1];
    m.setAlphaMode(L.alpha || 'OPAQUE');
    m.setDoubleSided(!!L.ds || m.getDoubleSided());
    if (L.rough !== undefined) m.setRoughnessFactor(L.rough);
    if (L.irid) {
      const [f, i, t0, t1] = L.irid;
      m.setExtension('KHR_materials_iridescence', irid.createIridescence().setIridescenceFactor(f).setIridescenceIOR(i)
        .setIridescenceThicknessMinimum(t0).setIridescenceThicknessMaximum(t1));
      used.add('iridescence');
    }
    if (L.transmission) {
      m.setExtension('KHR_materials_transmission', trans.createTransmission().setTransmissionFactor(L.transmission));
      m.setExtension('KHR_materials_ior', ior.createIOR().setIOR(L.ior || 1.4));
      if (L.volume) {
        const [th, dist, color] = L.volume;
        m.setExtension('KHR_materials_volume', vol.createVolume().setThicknessFactor(th).setAttenuationDistance(dist).setAttenuationColor(color));
      }
      used.add('transmission');
    }
    if (L.emissive) {
      m.setEmissiveFactor(L.emissive);
      if (L.es && L.es > 1) m.setExtension('KHR_materials_emissive_strength', es.createEmissiveStrength().setEmissiveStrength(L.es));
      else if (L.es) m.setEmissiveFactor(L.emissive.map((c) => c * L.es));
    }
  }
  const scene = doc.getRoot().listScenes()[0];
  scene.setExtras({ ...scene.getExtras(), ftf: { asset: `fauna_${name}`, loops: LOOPS[name], doc: 'docs/art/fauna.md' } });
  await nio.write(path.join(OUT, `fauna_${name}_ext.glb`), doc);
  console.log(`post ${name}: extensions ${[...used].join(', ')}`);
}

function quatErr(a, b) {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI; // degrees
}

async function check() {
  const file = path.join(REPO, 'game', 'public', 'assets', 'models', `fauna_${name}.glb`);
  const nio = await io();
  const doc = await nio.read(file);
  const R = doc.getRoot();
  let tris = 0;
  const meshes = {};
  for (const n of R.listNodes()) {
    const mesh = n.getMesh();
    if (!mesh) continue;
    let t = 0;
    for (const p of mesh.listPrimitives()) t += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
    meshes[n.getName()] = { triangles: t, skinned: !!n.getSkin(), materials: mesh.listPrimitives().map((p) => p.getMaterial()?.getName()) };
    tris += t;
  }
  const clips = {};
  for (const a of R.listAnimations()) {
    let dur = 0, maxPos = 0, maxRot = 0, maxScl = 0, keys = 0;
    for (const ch of a.listChannels()) {
      const s = ch.getSampler();
      const inp = s.getInput().getArray(), out = s.getOutput();
      dur = Math.max(dur, inp[inp.length - 1]);
      keys = Math.max(keys, inp.length);
      const n = out.getCount();
      const first = out.getElement(0, []), last = out.getElement(n - 1, []);
      const p = ch.getTargetPath();
      if (p === 'rotation') maxRot = Math.max(maxRot, quatErr(first, last));
      else {
        const e = Math.hypot(...first.map((v, i) => v - last[i]));
        if (p === 'translation') maxPos = Math.max(maxPos, e); else maxScl = Math.max(maxScl, e);
      }
    }
    clips[a.getName()] = { duration_s: +dur.toFixed(3), keys, channels: a.listChannels().length, loop: LOOPS[name].includes(a.getName()),
      loop_error: { rotation_deg: +maxRot.toFixed(4), translation_m: +maxPos.toFixed(5), scale: +maxScl.toFixed(5) } };
  }
  const joints = R.listSkins().reduce((m, s) => Math.max(m, s.listJoints().length), 0);
  const textures = R.listTextures().map((t) => ({ name: t.getName(), mime: t.getMimeType(), size: t.getSize() }));
  const exts = R.listExtensionsUsed().map((e) => e.extensionName);
  let validator = null;
  try {
    const validate = req('gltf-validator');
    const rep = await validate.validateBytes(new Uint8Array(fs.readFileSync(file)), { maxIssues: 50 });
    validator = { errors: rep.issues.numErrors, warnings: rep.issues.numWarnings,
      messages: rep.issues.messages.filter((m) => m.severity <= 1).slice(0, 8).map((m) => `${m.code} ${m.pointer || ''}`) };
  } catch (e) { validator = { error: String(e) }; }
  const res = { file: path.relative(REPO, file), bytes: fs.statSync(file).size, triangles: tris, joints, meshes, clips, textures, extensions: exts, validator };
  fs.writeFileSync(path.join(OUT, `fauna_${name}_check.json`), JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ name, bytes: res.bytes, triangles: tris, joints, clips, validator: { e: validator.errors, w: validator.warnings, m: validator.messages } }));
}

await (mode === 'post' ? post() : check());
