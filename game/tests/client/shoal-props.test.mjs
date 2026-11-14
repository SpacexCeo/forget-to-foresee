// The owner's Tripo crystals in the Glass Shoal arena (render/shoal-props.js): four models, each with a phone variant,
// inside the triangle budget, swapped in for the placeholder monoliths and spires when the arena look opens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const glb = (f) => { const b = readFileSync(new URL('../../public/assets/models/' + f, import.meta.url)); return { b, json: JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) }; };
const tris = (j) => j.meshes.flatMap((m) => m.primitives).reduce((s, p) => s + j.accessors[p.indices].count / 3, 0);

test('shoal props: four crystal models and their phone files, light enough for twelve placements', () => {
  let total = 0;
  for (const n of ['shoal_crystal_monolith', 'shoal_crystal_spire_a', 'shoal_crystal_spire_b', 'shoal_crystal_spike']) {
    const full = glb(n + '.glb'), m = glb(n + '_m.glb');
    assert.ok(tris(full.json) <= 8000, n + ' has ' + tris(full.json) + ' triangles');
    assert.ok(tris(m.json) <= tris(full.json), n + '_m is no heavier');
    assert.ok(full.b.length <= 1e6 && m.b.length <= 0.5e6, n + ' sizes ' + full.b.length + ' / ' + m.b.length);
    total += tris(full.json) * 3; // up to three placements each
  }
  assert.ok(total <= 90000, 'all placements together: ' + total + ' triangles');
});

test('shoal props: the arena look dresses the placeholders; monoliths get the monolith, the horizon spires take turns', () => {
  const src = readFileSync(new URL('../../src/render/shoal-props.js', import.meta.url), 'utf8');
  assert.match(src, /monolith: 'shoal_crystal_monolith'/);
  assert.match(src, /spires: Object\.freeze\(\['shoal_crystal_spire_a', 'shoal_crystal_spike', 'shoal_crystal_spire_b'\]\)/);
  assert.match(src, /ph\.visible = false/, 'the placeholder is hidden, not removed');
  const look = readFileSync(new URL('../../src/render/shoal-arena-look.js', import.meta.url), 'utf8');
  assert.match(look, /import \{ dressShoalProps \} from '\.\/shoal-props\.js'/); assert.match(look, /dressShoalProps\(arena\)/);
});
