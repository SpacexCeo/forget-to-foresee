// The Loomblade model (art/props/shoal/loomblade, game/public/assets/models/loomblade*.glb): the shipped files keep
// what the code relies on (the grip at the origin, the blade along +Y, the sockets, the budget), and the marker
// outside the walls picks the right file. File and source checks only: no three.js, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const DIR = new URL('../../public/assets/models/', import.meta.url);
const SRC = readFileSync(new URL('../../src/scenes/glass-shoal.js', import.meta.url), 'utf8');

function readGlb(name) {
  const b = readFileSync(new URL(name, DIR));
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bin = b.subarray(20 + jl + 8, 20 + jl + 8 + b.readUInt32LE(20 + jl));
  const sizes = (json.images || []).map((im) => { const v = json.bufferViews[im.bufferView]; const k = bin.subarray(v.byteOffset || 0); return [k.readUInt32LE(20), k.readUInt32LE(24)]; });
  let tris = 0;
  for (const m of json.meshes || []) for (const p of m.primitives) tris += json.accessors[p.indices].count / 3;
  return { json, sizes, tris, bytes: b.length };
}
const node = (g, name) => (g.json.nodes || []).find((n) => n.name === name);
/** The two exported helpers of glass-shoal.js, evaluated from the source (the module itself imports the Vite model list). */
function helpers() {
  const stand = /export const BLADE_STAND = Object\.freeze\((\{[^}]*\})\);/.exec(SRC);
  const fn = /export function bladeModelFile\(mobile, has = hasModelFile\) \{([\s\S]*?)\n\}/.exec(SRC);
  assert.ok(stand && fn, 'BLADE_STAND and bladeModelFile are exported by glass-shoal.js');
  const BLADE_STAND = new Function('return ' + stand[1])();
  const bladeModelFile = new Function('MODELS', 'hasModelFile', 'return function (mobile, has = hasModelFile) {' + fn[1] + '\n}')({ blade: 'loomblade' }, () => false);
  return { BLADE_STAND, bladeModelFile };
}

test('loomblade: the shipped sword keeps its frame, sockets and budget', () => {
  const g = readGlb('loomblade.glb');
  assert.ok(g.tris > 1500 && g.tris <= 3000, 'triangles ' + g.tris);
  for (const s of ['socket_grip', 'socket_guard', 'socket_tip']) assert.ok(node(g, s), s);
  assert.ok(!node(g, 'socket_grip').translation || node(g, 'socket_grip').translation.every((v) => Math.abs(v) < 1e-6), 'the grip socket is the origin');
  const tip = node(g, 'socket_tip').translation;
  assert.ok(Math.abs(tip[0]) < 1e-6 && Math.abs(tip[2]) < 1e-6 && tip[1] > 0.8 && tip[1] < 1.1, 'the blade runs along +Y: ' + tip);
  assert.equal(g.json.materials.length, 1, 'one material, one draw call');
  const m = g.json.materials[0];
  assert.ok(m.emissiveTexture && m.normalTexture && m.pbrMetallicRoughness.baseColorTexture && m.occlusionTexture, 'base colour, normal, ORM and the glowing thread inlay');
  for (const s of g.sizes) assert.ok(s[0] <= 2048 && s[1] <= 2048, 'texture ' + s);
  assert.ok(g.bytes <= 8 * 1048576, 'size ' + g.bytes);
});

test('loomblade: the phone variant is the same sword with textures at most 1024', () => {
  const g = readGlb('loomblade_m.glb'), full = readGlb('loomblade.glb');
  assert.ok(g.tris <= full.tris);
  for (const s of ['socket_grip', 'socket_guard', 'socket_tip']) assert.ok(node(g, s), s);
  for (const s of g.sizes) assert.ok(s[0] <= 1024 && s[1] <= 1024, 'texture ' + s);
  assert.ok(g.bytes <= 3 * 1048576, 'size ' + g.bytes);
});

test('loomblade: the marker loads the right file and stands the sword tip down in the soil', () => {
  const { BLADE_STAND, bladeModelFile } = helpers();
  const all = (n) => n === 'loomblade' || n === 'loomblade_m';
  assert.equal(bladeModelFile(false, all), 'loomblade');
  assert.equal(bladeModelFile(true, all), 'loomblade_m');
  assert.equal(bladeModelFile(true, (n) => n === 'loomblade'), 'loomblade', 'no phone file: the full one');
  assert.equal(bladeModelFile(false, () => false), null, 'no file: the placeholder stays');
  const tip = node(readGlb('loomblade.glb'), 'socket_tip').translation[1];
  assert.ok(Math.abs(BLADE_STAND.tip - tip) < 0.01, 'the fallback length matches the file');
  assert.ok(BLADE_STAND.buried > 0.1 && BLADE_STAND.buried < tip * 0.4, 'the tip is in the soil, the inlay and the guard are above it');
  assert.match(SRC, /m\.rotation\.z = Math\.PI; m\.position\.y = len - BLADE_STAND\.buried;/, 'turned tip down and lifted by the blade length');
});
