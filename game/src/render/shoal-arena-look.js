// The Glass Shoal look inside the game (flag glassShoal, docs/plans/boss/glass-shoal-boss.md). While the boss fight
// runs, the town's lookdev (sky, clouds, sun, fill, its post stack) steps aside and the Shoal look draws the frame. It adds
// the sky without a sun disc, the mirror flat under the arena, fog and mist, cascaded shadows, bloom on the crystals and
// the grade. It restyles the arena's simple materials through `arena.look`, so the rules never see it. When the fight
// ends, everything it hid or changed goes back exactly as it was. Loaded with import() by boot-world.js the first time
// the arena opens.
import * as THREE from 'three';
import { createShoalLook } from './shoal-look.js';
import { lookFromQuery } from './shoal-look-data.js';
import { createShoalPanel } from './shoal-panel.js';
import { dressShoalProps } from './shoal-props.js';
import { FOG_UNIFORMS } from './fog.js';

/** The town's shared fog lobe glows warm toward its sun; on the ice it is a faint cold glint (icy air, owner 14.11). */
const ICE_LOBE = Object.freeze([0.5, 0.62, 0.75, 0.25]);
function icyLobe() { FOG_UNIFORMS.ftfFogSunTint.value.set(ICE_LOBE); }

/**
 * @param {object} o
 * @param {THREE.WebGLRenderer} o.renderer @param {THREE.Scene} o.scene @param {THREE.PerspectiveCamera} o.camera
 * @param {object} o.lookdev the game's LookDev (render/lookdev.js) @param {object} o.arena scenes/shoal-arena.js's arena
 * @param {string} [o.tier] 'ultra' | 'high' | 'low' @param {string} [o.profile] 'desktop' | 'phone'
 * @param {() => boolean} [o.reduced] @param {string} [o.search] location.search (?render=1 opens the panel, ?shoalLook=<preset>)
 */
export function createArenaLook({ renderer, scene, camera, lookdev, arena, tier = 'high', profile = 'desktop', reduced = () => false, search = '' }) {
  const q = lookFromQuery(search);
  const center = arena.root.position.clone();
  const look = createShoalLook({ renderer, scene, camera, tier, profile, params: q.params, reduced, origin: center, embedded: true });
  look.setVisible(false);
  const A = arena.look || {};
  let active = false, saved = null, attachT = 0, panel = null;
  // the owner's Tripo crystals in place of the placeholder monoliths and spires (render/shoal-props.js)
  dressShoalProps(arena).catch((e) => console.warn('[shoal props]', e));

  // what the town shows that the Shoal replaces
  const townBits = () => [lookdev.sky && lookdev.sky.mesh, lookdev.clouds && lookdev.clouds.group, lookdev.motes && lookdev.motes.points,
    lookdev.splashes && lookdev.splashes.mesh, A.floor, A.sun, A.fill].filter(Boolean);
  // (the cascade lights are hidden while the look is off, so the visible filter in enter() leaves them alone)
  const townLights = () => scene.children.filter((o) => o.isLight && o !== lookdev.heroLight && !look.root.children.includes(o));
  // The town and the archipelago stay in the scene 700 m and more away, and every one of their meshes was still drawn
  // (and drawn again into the mirror's reflection): about 1400 draw calls a frame for things the fog hides (GPU bench
  // 14.11). While the fight runs, every top-level object whose nearest mesh is farther than FAR_M from the arena is
  // hidden and left out of the matrix updates; the heroine, the arena, the lights and the pooled effects that start
  // at the origin (her strike trail, the spell streaks) stay.
  const FAR_M = 220, KEEP = /^(player_|glass-shoal$|shoal_look$|strike_|spell-|levelup_burst$|blob_shadows$|move_marker$|ftf-autowalk-trail$)/;
  const _p = new THREE.Vector3();
  function farObjects() {
    const out = [], c = arena.root.getWorldPosition(new THREE.Vector3());
    for (const o of scene.children) {
      if (!o.visible || o.isLight || o === look.root || o === arena.root || KEEP.test(o.name || '') || townBits().includes(o)) continue;
      let near = Infinity, drawn = 0;
      o.traverse((d) => { if (d.isMesh || d.isPoints || d.isLine || d.isSprite) { drawn++; d.getWorldPosition(_p); near = Math.min(near, _p.distanceTo(c)); } });
      if (drawn && near > FAR_M) out.push(o);
    }
    return out;
  }

  function enter() {
    if (active) return;
    active = true;
    saved = {
      fog: scene.fog, background: scene.background, environment: scene.environment,
      toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, fov: camera.fov,
      hidden: [...townBits(), ...townLights()].filter((o) => o.visible),
      far: farObjects(),
      lobe: Float32Array.from(FOG_UNIFORMS.ftfFogSunTint.value),
      spires: A.spires && A.spires[0] ? { m: A.spires[0].material, k: A.spires[0].material.emissiveIntensity, op: A.spires[0].material.opacity } : null,
    };
    for (const o of saved.hidden) o.visible = false;
    for (const o of saved.far) { o.visible = false; o.matrixWorldAutoUpdate = false; }
    scene.fog = look.fog; scene.background = null;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    look.setVisible(true); look.set({});   // re-applies exposure, the FOV, the light
    if (saved.spires) { saved.spires.m.emissiveIntensity = 2.8; saved.spires.m.opacity = 1; saved.spires.m.transparent = false; saved.spires.m.needsUpdate = true; } // above the bloom threshold
    look.attach(arena.root);
    if (q.panel && !panel) panel = createShoalPanel({ look, doc: globalThis.document, fps: () => 0 });
  }
  function leave() {
    if (!active) return;
    active = false;
    look.setVisible(false);
    for (const o of saved.hidden) o.visible = true;
    for (const o of saved.far) { o.visible = true; o.matrixWorldAutoUpdate = true; }
    scene.fog = saved.fog; scene.background = saved.background; scene.environment = saved.environment;
    renderer.toneMapping = saved.toneMapping; renderer.toneMappingExposure = saved.exposure;
    FOG_UNIFORMS.ftfFogSunTint.value.set(saved.lobe);
    camera.fov = saved.fov; camera.updateProjectionMatrix();
    if (saved.spires) { saved.spires.m.emissiveIntensity = saved.spires.k; saved.spires.m.opacity = saved.spires.op; saved.spires.m.transparent = true; saved.spires.m.needsUpdate = true; }
    if (panel) { panel.dispose && panel.dispose(); panel = null; }
    saved = null;
  }

  const onResize = () => { const s = renderer.getSize(new THREE.Vector2()); look.setSize(s.x, s.y); };
  globalThis.addEventListener && globalThis.addEventListener('resize', onResize);

  return {
    look,
    get active() { return active; },
    /** On while the arena is up: call every frame with the arena's state; it turns itself on and off. */
    sync(on) { if (on) enter(); else leave(); },
    update(dt, focus) {
      if (!active) return;
      if ((attachT -= dt) <= 0) { attachT = 1; look.attach(arena.root); } // adds and new meshes get the cascaded shadows too
      look.update(dt, focus);
    },
    render() { if (active) icyLobe(); look.render(); }, // after the town's look update, which rewrites the lobe
    dispose() { leave(); globalThis.removeEventListener && globalThis.removeEventListener('resize', onResize); look.dispose(); },
  };
}
