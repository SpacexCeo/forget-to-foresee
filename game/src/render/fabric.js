// Iris's garments read as matte technical knit with a soft sheen on the forms (owner's reference 09.11):
// the baked garment material becomes a MeshPhysicalMaterial with a low, cool sheen; everything else
// (maps, colour, roughness, normal map, alpha) is carried over unchanged.
import * as THREE from 'three';

export const FABRIC_SHEEN = Object.freeze({ sheen: 0.55, sheenRoughness: 0.6, sheenColor: 0x8f8a9c });

/** Replaces every `...Garment` standard material under root with a sheen variant. Returns the count. */
export function fabricSheen(root, opts = FABRIC_SHEEN) {
  let n = 0;
  const done = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const out = list.map((m) => {
      if (!m || !/Garment$/.test(m.name || '') || !m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) return m;
      if (done.has(m)) return done.get(m);
      const p = new THREE.MeshPhysicalMaterial();
      THREE.MeshStandardMaterial.prototype.copy.call(p, m);
      p.sheen = opts.sheen;
      p.sheenRoughness = opts.sheenRoughness;
      p.sheenColor = new THREE.Color(opts.sheenColor);
      done.set(m, p);
      n++;
      return p;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  return n;
}
