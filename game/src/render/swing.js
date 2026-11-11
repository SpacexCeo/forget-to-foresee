// Rigid swing of hanging things (owner, 11.11): shop signs, lanterns, ring chandeliers and lamp-post heads authored as
// `swing_*` nodes (art/town/town_shops.py) rock about their pivot with the shared wind (render/weather.js windAt).
// A node tilts away from the wind by a few degrees with a slow sway on top; still under reduced motion. No allocations
// per frame. Pure enough to test: the angle function is exported.
import * as THREE from 'three';
import { windAt } from './weather.js';

export const SWING_NODE = /^swing_/;
/** Largest tilt (radians) at full wind; signs swing a little more than lanterns on chains. */
export const SWING_MAX = 0.16;

/** The tilt [about x, about z] for a wind vector {x, z} at time t (s), for a node with phase `ph`. */
export function swingAngles(w, t, ph = 0, max = SWING_MAX) {
  const sway = 0.35 * Math.sin(t * 1.7 + ph) + 0.15 * Math.sin(t * 3.1 + ph * 1.9);
  const s = Math.min(1, Math.hypot(w.x, w.z));
  return [THREE.MathUtils.clamp((w.z + sway * s * 0.6) * max, -max, max), THREE.MathUtils.clamp((-w.x - sway * s * 0.6) * max, -max, max)];
}

export function createSwingSet() {
  const groups = new Map(); // id -> [{node, base: Quaternion, pos: [x,y,z], ph}]
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
  return {
    /** Collects the swing nodes under `root` (a piece that arrived); `root` null forgets them. */
    set(id, root) {
      if (!root) { groups.delete(id); return 0; }
      const list = [];
      root.updateWorldMatrix(true, true);
      root.traverse((o) => { if (SWING_NODE.test(o.userData.name || o.name || '')) list.push({ node: o, base: o.quaternion.clone(), pos: o.getWorldPosition(_v).toArray(), ph: list.length * 1.37 }); });
      if (list.length) groups.set(id, list); else groups.delete(id);
      return list.length;
    },
    get count() { let n = 0; for (const l of groups.values()) n += l.length; return n; },
    update(t, reducedMotion = false) {
      for (const list of groups.values()) for (const s of list) {
        if (reducedMotion) { s.node.quaternion.copy(s.base); continue; }
        const [ax, az] = swingAngles(windAt(s.pos[0], s.pos[2], s.pos[1]), t, s.ph);
        s.node.quaternion.copy(s.base).multiply(_q.setFromEuler(_e.set(ax, 0, az)));
      }
    },
  };
}
