// Iris's hair cards keep their strands at game distance: a lower alpha cutoff and alpha-to-coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { tuneHairCards, HAIR_ALPHA_TEST } from '../../src/render/hair-cards.js';

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
