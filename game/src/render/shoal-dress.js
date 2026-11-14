// The Glass Shoal arena's moving placeholders dressed with models (owner 14.11: no template shapes): the lamp post and
// bulb and the bobbing pickups. Split from render/shoal-props.js so node tests can run it (no asset loader here).
import { Box3 } from 'three';

/** Height (m) the dressed lamp and pickups stand at. */
export const DRESS_HEIGHT = Object.freeze({ lamp: 3.4, hp: 1.0, stamina: 0.95 });


/**
 * The placeholders that move (the pickups bob and vanish when taken, the lamp is a group): the model goes inside the
 * placeholder as a child and only the placeholder's own material is hidden, so the arena's animation and visibility
 * still drive what the player sees.
 */
export async function dressInPlace(A, get, SHOAL_PROPS) {
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
