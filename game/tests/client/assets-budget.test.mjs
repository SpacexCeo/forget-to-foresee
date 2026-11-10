// Texture budget of the shipped models (public/assets/models): every texture is KTX2 (GPU-compressed),
// every model is meshopt-compressed, and every model with textures above 2048 has a phone variant
// <name>_m.glb (art/tools/glb_mobile.py) whose textures are at most 2048 with a valid mip chain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const DIR = new URL('../../public/assets/models/', import.meta.url);
const KTX2_ID = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

function readGlb(name) {
  const b = readFileSync(new URL(name, DIR));
  assert.equal(b.readUInt32LE(0), 0x46546c67, name + ' is not a glb');
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bin = b.subarray(20 + jl + 8, 20 + jl + 8 + b.readUInt32LE(20 + jl));
  return { json, bin };
}
function textures({ json, bin }) {
  return (json.images || []).map((im) => {
    const v = json.bufferViews[im.bufferView];
    const k = bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    if (im.mimeType !== 'image/ktx2') return { mime: im.mimeType };
    assert.deepEqual([...k.subarray(0, 12)], KTX2_ID, 'KTX2 identifier');
    const width = k.readUInt32LE(20), height = k.readUInt32LE(24), levels = k.readUInt32LE(40);
    return { mime: im.mimeType, width, height, levels };
  });
}
const files = readdirSync(DIR).filter((f) => f.endsWith('.glb'));
// The town (public/assets/models/town/, docs/town.md) follows the same rules, for the files that exist. While the
// Blender blockout is in that folder (uncompressed grey models, a few hours on the way to the final art), this
// switch lets town files without KTX2 textures, meshopt geometry or a phone variant pass. The art session sets it
// to false when the final compressed files land; from then on the town is held to the budget like every model.
const TOWN_BLOCKOUT_OK = false;
const TOWN_DIR = new URL('town/', DIR);
const townFiles = existsSync(TOWN_DIR) ? readdirSync(TOWN_DIR).filter((f) => f.endsWith('.glb')).map((f) => 'town/' + f) : [];

test('assets: every shipped texture is KTX2 and every model is meshopt-compressed', () => {
  assert.ok(files.length > 20);
  for (const f of files) {
    const g = readGlb(f);
    for (const t of textures(g)) assert.equal(t.mime, 'image/ktx2', f + ' has an uncompressed ' + t.mime + ' texture');
    if ((g.json.meshes || []).length) assert.ok((g.json.extensionsUsed || []).includes('EXT_meshopt_compression'), f + ' geometry is not meshopt-compressed');
  }
});

test('assets: town models are valid .glb files with unique lowercase names; compressed like the rest once the blockout is over', () => {
  for (const f of townFiles) {
    const base = f.slice('town/'.length);
    assert.match(base, /^[a-z0-9_]{1,64}\.glb$/, f + ' name');
    assert.ok(!files.includes(base), f + ' repeats the name of a model in the flat folder');
    const g = readGlb(f);
    if (TOWN_BLOCKOUT_OK) continue;
    for (const t of textures(g)) assert.equal(t.mime, 'image/ktx2', f + ' has an uncompressed ' + t.mime + ' texture');
    if ((g.json.meshes || []).length) assert.ok((g.json.extensionsUsed || []).includes('EXT_meshopt_compression'), f + ' geometry is not meshopt-compressed');
  }
});

test('assets: town models with textures above 2048 have a phone variant capped at 2048 (after the blockout)', () => {
  if (TOWN_BLOCKOUT_OK) return;
  for (const f of townFiles.filter((x) => !x.endsWith('_m.glb'))) {
    const max = Math.max(0, ...textures(readGlb(f)).map((t) => t.width || 0));
    if (max <= 2048) continue;
    const m = f.replace(/\.glb$/, '_m.glb');
    assert.ok(townFiles.includes(m), f + ' (' + max + ' px) has no ' + m);
    for (const t of textures(readGlb(m))) assert.ok(t.width <= 2048 && t.height <= 2048, m + ' texture is ' + t.width);
  }
});

test('assets: models with textures above 2048 have a phone variant capped at 2048', () => {
  for (const f of files.filter((x) => !x.endsWith('_m.glb'))) {
    const max = Math.max(0, ...textures(readGlb(f)).map((t) => t.width || 0));
    if (max <= 2048) continue;
    const m = f.replace(/\.glb$/, '_m.glb');
    assert.ok(files.includes(m), f + ' (' + max + ' px) has no ' + m);
    const full = textures(readGlb(f)), small = textures(readGlb(m));
    assert.equal(small.length, full.length, m + ' texture count');
    small.forEach((t, i) => {
      assert.ok(t.width <= 2048 && t.height <= 2048, m + ' texture ' + i + ' is ' + t.width);
      const drop = Math.max(0, Math.log2(full[i].width / t.width));
      assert.equal(t.levels, full[i].levels - drop, m + ' texture ' + i + ' mip chain');
    });
  }
});
