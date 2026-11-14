// The walk-in shops carry their light as a lightmap (art/town/build_town.py "Lightmap"): one texture per room,
// shipped as the occlusion map of the room's large surfaces on the second UV set. The client lights a shop with one
// ambient light and three.js multiplies ambient light by the occlusion map, so losing the map, its UV set or its
// size would flatten the rooms again without any error. These checks read the shipped files only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOWN_DATA } from '../../src/scenes/town-data.js';

const DIR = new URL('../../public/assets/models/town/', import.meta.url);

function readGlb(name) {
  const b = readFileSync(new URL(name, DIR));
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bin = b.subarray(20 + jl + 8, 20 + jl + 8 + b.readUInt32LE(20 + jl));
  return { json, bin };
}
function imageSize({ json, bin }, index) {
  const v = json.bufferViews[json.images[index].bufferView];
  const k = bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
  return [k.readUInt32LE(20), k.readUInt32LE(24)];
}
/** What a shipped room says about its lightmap: the image, the materials that use it and the meshes they sit on. */
function lightmapOf(file, piece) {
  const g = readGlb(file);
  const { json } = g;
  const image = (json.images || []).findIndex((im) => im.name === 'lm_' + piece);
  const source = (t) => (t.extensions && t.extensions.KHR_texture_basisu ? t.extensions.KHR_texture_basisu.source : t.source);
  const mats = [];
  (json.materials || []).forEach((m, i) => { if (m.occlusionTexture && source(json.textures[m.occlusionTexture.index]) === image) mats.push({ i, name: m.name, texCoord: m.occlusionTexture.texCoord || 0 }); });
  const ids = new Set(mats.map((m) => m.i));
  let prims = 0, withUv = 0, tris = 0, lmTris = 0;
  for (const mesh of json.meshes || []) {
    if (/_col$/.test(mesh.name || '')) continue;
    for (const p of mesh.primitives) {
      const n = p.indices != null ? json.accessors[p.indices].count / 3 : 0;
      tris += n;
      if (!ids.has(p.material)) continue;
      prims++; lmTris += n;
      if (p.attributes.TEXCOORD_1 != null) withUv++;
    }
  }
  return { image, size: image >= 0 ? imageSize(g, image) : null, mats, prims, withUv, tris, lmTris };
}

const rooms = (TOWN_DATA.interiors || []).map((it) => it.name);

test('shop lightmap: every room ships one light texture, on the second UV set of its large surfaces', () => {
  assert.ok(rooms.length >= 3, 'the three shops');
  for (const piece of rooms) {
    const lm = lightmapOf(piece + '.glb', piece);
    assert.ok(lm.image >= 0, piece + ' has no lm_' + piece + ' image');
    assert.deepEqual(lm.size, [2048, 2048], piece + ' lightmap size');
    assert.ok(lm.mats.length >= 4, piece + ': floor, walls, timber and cloth at least use the lightmap');
    for (const m of lm.mats) assert.equal(m.texCoord, 1, piece + ' ' + m.name + ' must sample the lightmap on TEXCOORD_1');
    assert.ok(lm.prims > 0 && lm.withUv === lm.prims, piece + ': every lightmapped primitive carries TEXCOORD_1');
    assert.ok(lm.lmTris / lm.tris > 0.25, piece + ': the large surfaces are lightmapped (' + lm.lmTris + ' of ' + lm.tris + ' triangles)');
  }
});

test('shop lightmap: the phone variant keeps the lightmap at half the size', () => {
  for (const piece of rooms) {
    const lm = lightmapOf(piece + '_m.glb', piece);
    assert.ok(lm.image >= 0, piece + '_m has no lightmap');
    assert.deepEqual(lm.size, [1024, 1024], piece + '_m lightmap size');
    for (const m of lm.mats) assert.equal(m.texCoord, 1, piece + '_m ' + m.name);
  }
});

test('shop lightmap: the material names keep the town prefixes the client keys on', () => {
  // render/materials.js: M_Town_* keeps its authored material; M_Town_Cloth / M_Town_Foliage follow the look roles
  for (const piece of rooms) {
    const lm = lightmapOf(piece + '.glb', piece);
    for (const m of lm.mats) assert.match(m.name, /^M_(Town|Shop)_[A-Za-z]+_LM_[a-z]+$/, m.name);
  }
});

test('shop rooms stay inside the interior triangle budget', () => {
  for (const piece of rooms) for (const f of [piece + '.glb', piece + '_m.glb']) assert.ok(lightmapOf(f, piece).tris <= 60000, f);
});
