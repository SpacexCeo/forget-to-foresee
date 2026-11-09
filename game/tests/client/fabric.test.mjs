// Iris's garment material gets a soft sheen; other materials are untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fabricSheen, FABRIC_SHEEN } from '../../src/render/fabric.js';

test('fabric sheen: the garment material becomes physical with sheen, maps and colour kept; skin untouched', () => {
  const root = new THREE.Group();
  const tex = new THREE.Texture();
  const garment = new THREE.MeshStandardMaterial({ name: 'M_Iris_Garment', map: tex, roughness: 0.7, color: 0x333333 });
  const skin = new THREE.MeshStandardMaterial({ name: 'M_Iris_Skin' });
  const meshes = [garment, garment, skin].map((m) => new THREE.Mesh(new THREE.BufferGeometry(), m));
  for (const m of meshes) root.add(m);
  assert.equal(fabricSheen(root), 1);
  const g = meshes[0].material;
  assert.ok(g.isMeshPhysicalMaterial);
  assert.equal(meshes[1].material, g);
  assert.equal(g.map, tex);
  assert.equal(g.roughness, 0.7);
  assert.equal(g.sheen, FABRIC_SHEEN.sheen);
  assert.equal(meshes[2].material, skin);
});
