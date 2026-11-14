// Loads and places the town's decor (scenes/town-decor.js): one load per model (the light `_m` file on phones and the
// low tier, render/assets.js picks the variant), a clone per spot set on the ground the town reports there and turned
// toward its `face`; collision meshes never draw; each pole gets a thin player-only collider so Iris walks round it.
// Visual otherwise; a failed download just leaves the spot empty.
import { fetchGltf, hasModelFile, getModelVariant } from '../render/assets.js';
import { MASK_PLAYER } from '../physics/collision.js';
import { TOWN_DECOR, facing } from './town-decor.js';

/**
 * @param {{THREE: object, scene: object, origin: number[], groundAt: (x:number, z:number, fromY?:number) => (number|null), world?: object}} o
 * @returns {Promise<number>} spots placed
 */
export async function placeTownDecor({ THREE, scene, origin, groundAt, world = null, decor = TOWN_DECOR, load = (name) => fetchGltf(name + (hasModelFile(name + getModelVariant()) ? getModelVariant() : '')) }) {
  const group = new THREE.Group(); group.name = 'town_decor'; scene.add(group);
  const cache = new Map(), get = (name) => { if (!cache.has(name)) cache.set(name, hasModelFile(name) ? load(name).then((r) => r.gltf.scene, () => null) : Promise.resolve(null)); return cache.get(name); };
  let n = 0;
  await Promise.all(decor.map(async (d) => {
    const src = await get(d.asset); if (!src) return;
    const x = d.at[0] + origin[0], z = d.at[2] + origin[2];
    const g = groundAt(x, z, d.at[1] + origin[1] + 2);
    const y = g == null ? d.at[1] + origin[1] : g;
    const o = src.clone(true); o.name = d.id;
    const cols = []; o.traverse((m) => { if (m.isMesh) { if (/_col(_|[0-9]|$)/.test(m.name || '')) cols.push(m); else { m.castShadow = true; m.receiveShadow = true; } } });
    for (const c of cols) c.removeFromParent();
    o.position.set(x, y, z); o.rotation.y = facing(d.at, d.face);
    group.add(o); n++;
    if (world && d.pole) { const r = d.pole; world.addBox('town_decor:' + d.id, [x - r, y, z - r], [x + r, y + Math.min(d.height, 2.2), z + r], MASK_PLAYER); }
  }));
  return n;
}
