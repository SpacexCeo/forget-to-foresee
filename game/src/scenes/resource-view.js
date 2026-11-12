// The view side of monster resources (game/resources.js, behind ?story=1 for now): every kill beyond the walls rolls
// the creature's drop table with its kill id; the drop goes into the profile inventory (source 'drop'), one toast
// lists it ("+2 Spider silk thread · +1 Chitin plate") and a small spark in the rarest drop's colour rises where the
// creature fell. The drop state (the wanted resource's misses, the day's count) lives in this browser under
// RESOURCE_KEY. No network, no chain.
//
// For the other workers: `window` gets 'ftf:resource-drop' {killId, mob, drops: [{id, n}]} after each drop (quests log
// it, the market can count supply); a quest that waits for a resource dispatches 'ftf:resource-want' {id} (or {id:
// null} when done), or passes `want()`, and the pity of game/resources.js applies to that resource.
import * as THREE from 'three';
import { rollDrops, initialDrops, RESOURCES } from '../game/resources.js';
import { RARITIES, createInventory } from '../game/inventory.js';

export const RESOURCE_KEY = 'ftf.resources.v1';

/** Spark colour per rarity (the rarest drop of a kill colours its spark). */
export const DROP_SPARK = Object.freeze({ common: 0xf2e6c8, uncommon: 0x3fe0c8, rare: 0xffa63a, epic: 0xb070ff, legendary: 0xff7a1a });

/** The rarest resource of a drop list (null for none). Pure. */
export function rarestDrop(drops) {
  let best = null, rank = -1;
  for (const d of drops || []) { const r = RARITIES.indexOf((RESOURCES[d.id] || {}).rarity || 'common'); if (r > rank) { rank = r; best = d; } }
  return best;
}

/**
 * @param {{scene: THREE.Scene, storage: Storage|null, toast: (text: string) => void, t: (key: string, p?: object) => string,
 *   win?: Window, reduced?: () => boolean, want?: () => string|null, onDrop?: (drops: {id:string,n:number}[]) => void}} o
 */
export function createResourceView({ scene, storage, toast, t, win = globalThis.window, reduced = () => false, want = null, onDrop = null }) {
  let state = initialDrops(), wanted = null;
  try { const s = JSON.parse((storage && storage.getItem(RESOURCE_KEY)) || 'null'); if (s && typeof s.miss === 'number') { state = s; wanted = s.want || null; } } catch { /* fresh */ }
  const save = () => { try { if (storage) storage.setItem(RESOURCE_KEY, JSON.stringify(state)); } catch { /* memory only */ } };
  const sparks = [];
  const geo = new THREE.OctahedronGeometry(0.08, 0);
  function spark(pos, rarity, delay) {
    if (!scene || reduced()) return;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: DROP_SPARK[rarity] || DROP_SPARK.common, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(pos[0] + 0.25, pos[1] + 0.35, pos[2]); m.renderOrder = 4; m.visible = false; scene.add(m); sparks.push({ m, t: -delay });
  }
  const onWant = (e) => { const id = e && e.detail ? e.detail.id : null; wanted = id && RESOURCES[id] ? id : null; };
  const onKill = (e) => {
    const d = e && e.detail; if (!d || !d.killId) return;
    const w = (want && want()) || wanted;
    const r = rollDrops(state, { killId: d.killId, mob: d.type, want: w });
    state = r.state; save();
    if (!r.drops.length) return;
    const inv = createInventory({ storage });
    for (const x of r.drops) inv.add(x.id, x.n, 'drop');
    toast(r.drops.map((x) => t('story.res.found', { n: x.n, name: t(RESOURCES[x.id].nameKey) })).join(' · '));
    const top = rarestDrop(r.drops);
    if (d.pos && top) spark(d.pos, RESOURCES[top.id].rarity, 0.15);   // a beat after the salvage spark, beside it
    if (win) win.dispatchEvent(new CustomEvent('ftf:resource-drop', { detail: { killId: d.killId, mob: d.type, drops: r.drops.map((x) => ({ id: x.id, n: x.n })) } }));
    if (onDrop) onDrop(r.drops);
  };
  if (win) { win.addEventListener('ftf:mob-killed', onKill); win.addEventListener('ftf:resource-want', onWant); }
  return {
    get state() { return state; },
    get wanted() { return (want && want()) || wanted; },
    /** Per frame: the sparks rise, spin and fade over a second. */
    update(dt) {
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]; s.t += dt; if (s.t < 0) continue;
        s.m.visible = true; s.m.position.y += dt * 0.9; s.m.rotation.y += dt * 6; s.m.material.opacity = Math.max(0, 1 - s.t);
        if (s.t >= 1) { scene.remove(s.m); s.m.material.dispose(); sparks.splice(i, 1); }
      }
    },
    dispose() {
      if (win) { win.removeEventListener('ftf:mob-killed', onKill); win.removeEventListener('ftf:resource-want', onWant); }
      for (const s of sparks) { scene.remove(s.m); s.m.material.dispose(); } geo.dispose();
    },
  };
}
