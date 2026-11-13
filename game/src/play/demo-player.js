// The demo player in town (owner, 13.11): "Sheriffchenko (demo player)", a scripted townsperson in the Sheriffchenko
// skin (render/asset-catalog 'sheriffchenko': the agent rig with the heroine's retargeted clips) who wanders the town
// (play/demo-walker.js: only along the authored routes, clear of the portal and the doors). It is drawn like a
// remote player, with a "demo" badge on its name tag, and tapping it opens the same player card, which says
// plainly that it is a scripted demo player and keeps its trades as practice trades on this device.
import { createRemotePlayers } from './remote-players.js';
import { createDemoWalker } from './demo-walker.js';

export const DEMO_ID = 'demo-sheriffchenko';

/**
 * @param {{scene: object, t: Function, origin: number[], groundAt?: (x: number, z: number, y: number) => number|null, phone?: boolean, rand?: Function}} o
 */
export function createDemoPlayer({ scene, t, origin, groundAt = null, phone = false, rand = Math.random }) {
  const walker = createDemoWalker({ rand });
  const remote = createRemotePlayers({ scene, phone, aiLabel: t('pc.demoBadge') });
  const rec = { id: DEMO_ID, name: t('pc.demoName'), skin: 'sheriffchenko', ai: true, demo: true, lv: 6, silkC: 1240, p: [0, 0, 0], h: 0, speed: 0 };
  return {
    rec,
    /** Per frame while the town is shown; `from` is Iris's world position (for the draw distance). */
    update(dt, from, reducedMotion = false) {
      walker.step(reducedMotion ? 0 : dt);
      const x = walker.x + origin[0], z = walker.z + origin[2];
      const g = groundAt ? groundAt(x, z, walker.y + origin[1] + 1.5) : null;
      rec.p = [x, g != null && Math.abs(g - (walker.y + origin[1])) < 1.2 ? g : walker.y + origin[1], z];
      rec.h = walker.yaw; rec.speed = walker.speed;
      remote.update(dt, [rec], from, reducedMotion);
    },
    pick: (raycaster) => remote.pick(raycaster),
    hide() { remote.update(0, [], [0, 0, 0]); },
    dispose() { remote.clear(); },
  };
}
