// The owner's Tripo crystals in the Glass Shoal arena (14.11): the arena's placeholder monoliths (boxes) and horizon
// spires (cones), built by scenes/shoal-arena.js where the rules place them, are swapped for the models once they load.
// Each model is loaded once and every placement is a clone that shares its geometry and material (a 1 m tall model,
// origin at its base, scaled to the placeholder's height). The placeholders are only hidden: the rules never see the
// art, and a failed download leaves the old shapes. Phones get the `_m` files (render/assets.js picks the variant).
import { Box3 } from 'three';
import { fetchGltf, hasModelFile, getModelVariant } from './assets.js';

export const SHOAL_PROPS = Object.freeze({
  monolith: 'shoal_crystal_monolith',
  lamp: 'prop_bridge_torch',                                     // the arena's lamp post and bulb (owner 14.11: no template shapes)
  pickups: Object.freeze({ hp: 'prop_memory_vial', stamina: 'shard' }), // the bobbing health and stamina pickups
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
  n += await dressInPlace(A, get);
  return n;
}

/** Height (m) the dressed lamp and pickups stand at. */
export const DRESS_HEIGHT = Object.freeze({ lamp: 3.4, hp: 1.0, stamina: 0.95 });


/**
 * The placeholders that move (the pickups bob and vanish when taken, the lamp is a group): the model goes inside the
 * placeholder as a child and only the placeholder's own material is hidden, so the arena's animation and visibility
 * still drive what the player sees.
 */
async function dressInPlace(A, get) {
  let n = 0;
  const fit = (src, ph, height, centred) => {
    const o = src.clone(true);
    o.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.frustumCulled = false; } });
    // scale to the height wanted from the model's own bounds; stand it on (or centre it at) the placeholder's origin
    o.updateMatrixWorld(true); const box = new Box3().setFromObject(o), h = Math.max(1e-3, box.max.y - box.min.y), k = height / h;
    o.scale.setScalar(k); o.position.set(-(box.min.x + box.max.x) / 2 * k, centred ? -(box.min.y + box.max.y) / 2 * k : -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
    return o;
  };
  if (A.lamp) {
    const src = await get(SHOAL_PROPS.lamp);
    if (src && A.lamp.parent) {
      A.lamp.add(fit(src, A.lamp, DRESS_HEIGHT.lamp, false));
      for (const c of A.lamp.children) if (/placeholder/.test(c.name || '')) c.visible = false;
      n++;
    }
  }
  for (const p of A.pickups || []) {
    const name = SHOAL_PROPS.pickups[p.kind]; if (!name) continue;
    const src = await get(name);
    if (!src || !p.m.parent) continue;
    // the sphere is scaled 1: its child keeps the model's size; the sphere's material alone is hidden (its bob and its
    // visibility when taken still apply)
    p.m.add(fit(src, p.m, DRESS_HEIGHT[p.kind] || 1, true));
    p.m.material = p.m.material.clone(); p.m.material.visible = false; n++;
  }
  return n;
}
