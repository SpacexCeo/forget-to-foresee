// Iris's hair cards keep their strands at game distance: a lower alpha cutoff and alpha-to-coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tuneHairCards, flatHair, HAIR_ALPHA_TEST, HAIR_FLAT_COLOR } from '../../src/render/hair-cards.js';

test('hair cards: alpha-tested hair materials get the lower cutoff and alpha-to-coverage; others are untouched', () => {
  const root = new THREE.Group();
  const hair = new THREE.MeshStandardMaterial({ name: 'M_Iris_Hair', alphaTest: 0.5 });
  const cap = new THREE.MeshStandardMaterial({ name: 'M_Iris_HairCap' });
  const skin = new THREE.MeshStandardMaterial({ name: 'M_Iris_Skin' });
  for (const m of [hair, cap, skin]) root.add(new THREE.Mesh(new THREE.BufferGeometry(), m));
  assert.equal(tuneHairCards(root), 1);
  assert.equal(hair.alphaTest, HAIR_ALPHA_TEST);
  assert.equal(hair.alphaToCoverage, true);
  assert.equal(cap.alphaTest, 0);
  assert.equal(skin.alphaToCoverage, false);
});

test('flat hair: hair cards and the cap become one unlit brown; the cards keep their alpha cutoff; skin untouched', () => {
  const root = new THREE.Group();
  const tex = new THREE.Texture();
  const hair = new THREE.MeshStandardMaterial({ name: 'M_Iris_Hair', alphaTest: 0.5, map: tex });
  const cap = new THREE.MeshStandardMaterial({ name: 'M_Iris_HairCap' });
  const skin = new THREE.MeshStandardMaterial({ name: 'M_Iris_Skin' });
  const meshes = [hair, cap, skin].map((m) => new THREE.Mesh(new THREE.BufferGeometry(), m));
  for (const m of meshes) root.add(m);
  assert.equal(flatHair(root), 2);
  const [h, c, s] = meshes.map((m) => m.material);
  assert.ok(h.isMeshBasicMaterial && c.isMeshBasicMaterial);
  assert.equal(h.map, tex);
  assert.equal(h.alphaTest, HAIR_ALPHA_TEST);
  assert.equal(h.alphaToCoverage, true);
  assert.equal(h.color.getHex(), new THREE.Color(HAIR_FLAT_COLOR).getHex());
  assert.equal(c.alphaTest, 0);
  assert.equal(s, skin);
});
