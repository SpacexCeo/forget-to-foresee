// Iris's garments read as matte technical knit with a soft sheen on the forms (owner's reference 09.11):
// the baked garment material becomes a MeshPhysicalMaterial with a low sheen; everything else
// (maps, colour, roughness, normal map, alpha) is carried over unchanged.
// 11.11: sheen 0.55 with a pale lilac colour lifted the near-black knit to taupe velvet wherever the light
// grazed it (brown from the front, black from the back). A weak sheen in a neutral dark grey keeps the
// charcoal the same from every side and still rounds the forms a little.
import * as THREE from 'three';

export const FABRIC_SHEEN = Object.freeze({ sheen: 0.12, sheenRoughness: 0.6, sheenColor: 0x34343a });

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
