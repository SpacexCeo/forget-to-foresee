// The view side of salvage (story TZ Q2, behind ?story=1): every monster kill beyond the walls rolls game/salvage.js
// with its kill id; a part goes into the profile inventory (source 'salvage'), the toast "A brass part" shows and a
// small brass spark rises where the creature fell. The salvage state (misses in a row, the day's count) lives in this
// browser under SALVAGE_KEY. No network, no chain.
import * as THREE from 'three';
import { salvageRoll, initialSalvage } from '../game/salvage.js';
import { createInventory } from '../game/inventory.js';

export const SALVAGE_KEY = 'ftf.salvage.v1';

/**
 * @param {{scene: THREE.Scene, storage: Storage|null, toast: (text: string) => void, t: (key: string) => string,
 *   win?: Window, reduced?: () => boolean, onPart?: (partId: string) => void}} o
 */
export function createSalvageView({ scene, storage, toast, t, win = globalThis.window, reduced = () => false, onPart = null }) {
  let state = initialSalvage();
  try { const s = JSON.parse((storage && storage.getItem(SALVAGE_KEY)) || 'null'); if (s && typeof s.miss === 'number') state = s; } catch { /* fresh */ }
  const save = () => { try { if (storage) storage.setItem(SALVAGE_KEY, JSON.stringify(state)); } catch { /* memory only */ } };
  const sparks = [];
  const geo = new THREE.OctahedronGeometry(0.09, 0);
  function spark(pos) {
    if (!scene || reduced()) return;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xe8b04a, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(pos[0], pos[1] + 0.4, pos[2]); m.renderOrder = 4; scene.add(m); sparks.push({ m, t: 0 });
  }
  const onKill = (e) => {
    const d = e && e.detail; if (!d || !d.killId) return;
    const r = salvageRoll(state, { killId: d.killId, mob: d.type });
    state = r.state; save();
    if (!r.partId) return;
    createInventory({ storage }).add(r.partId, 1, 'salvage');
    toast(t('story.salvage.found'));
    if (d.pos) spark(d.pos);
    if (onPart) onPart(r.partId);
  };
  if (win) win.addEventListener('ftf:mob-killed', onKill);
  return {
    get state() { return state; },
    /** Per frame: the sparks rise, spin and fade over a second. */
    update(dt) {
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]; s.t += dt; s.m.position.y += dt * 0.9; s.m.rotation.y += dt * 6; s.m.material.opacity = Math.max(0, 1 - s.t);
        if (s.t >= 1) { scene.remove(s.m); s.m.material.dispose(); sparks.splice(i, 1); }
      }
    },
    dispose() { if (win) win.removeEventListener('ftf:mob-killed', onKill); for (const s of sparks) { scene.remove(s.m); s.m.material.dispose(); } geo.dispose(); },
  };
}
