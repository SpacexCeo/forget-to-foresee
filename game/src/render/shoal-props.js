// The owner's Tripo crystals in the Glass Shoal arena (14.11): the arena's placeholder monoliths (boxes) and horizon
// spires (cones), built by scenes/shoal-arena.js where the rules place them, are swapped for the models once they load.
// Each model is loaded once and every placement is a clone that shares its geometry and material (a 1 m tall model,
// origin at its base, scaled to the placeholder's height). The placeholders are only hidden: the rules never see the
// art, and a failed download leaves the old shapes. Phones get the `_m` files (render/assets.js picks the variant).
import { fetchGltf, hasModelFile, getModelVariant } from './assets.js';

export const SHOAL_PROPS = Object.freeze({
  monolith: 'shoal_crystal_monolith',
  spires: Object.freeze(['shoal_crystal_spire_a', 'shoal_crystal_spike', 'shoal_crystal_spire_b']), // round the horizon in turn
});

/** Which model stands where (pure): monolith i → the monolith, spire i → SHOAL_PROPS.spires[i % 3]. */
export function propFor(kind, i) { return kind === 'monolith' ? SHOAL_PROPS.monolith : SHOAL_PROPS.spires[i % SHOAL_PROPS.spires.length]; }

/** Height of a placeholder mesh (its geometry's bounding box times its scale). */
function heightOf(m) { const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox(); return (g.boundingBox.max.y - g.boundingBox.min.y) * m.scale.y; }

/**
 * Dresses the arena (`arena.look.monoliths`, `arena.look.spires`); resolves to the number of placements swapped.
 * @param {object} arena scenes/shoal-arena.js's arena @param {(name: string) => Promise<{gltf: object}>} [load]
 */
export async function dressShoalProps(arena, load = (name) => fetchGltf(name + (hasModelFile(name + getModelVariant()) ? getModelVariant() : ''))) {
  const A = (arena && arena.look) || {};
  const jobs = [...(A.monoliths || []).map((m, i) => ['monolith', i, m]), ...(A.spires || []).map((m, i) => ['spire', i, m])];
  const cache = new Map(), get = (name) => { if (!cache.has(name)) cache.set(name, hasModelFile(name) ? load(name).then((r) => r.gltf.scene, () => null) : Promise.resolve(null)); return cache.get(name); };
  let n = 0;
  await Promise.all(jobs.map(async ([kind, i, ph]) => {
    const src = await get(propFor(kind, i));
    if (!src || !ph.parent) return;
    const h = heightOf(ph), base = ph.position.y - h / 2; // the placeholder stands centred on its height
    const o = src.clone(true);
    o.name = propFor(kind, i) + '#' + i;
    o.position.set(ph.position.x, base, ph.position.z);
    o.rotation.set(0, ph.rotation.y + i * 1.3, 0);
    o.scale.setScalar(h * (kind === 'monolith' ? 1.15 : 1));
    o.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = kind === 'monolith'; } });
    ph.parent.add(o); ph.visible = false; n++;
  }));
  return n;
}
