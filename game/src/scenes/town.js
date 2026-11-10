// The town on the ground (docs/town.md, docs/art/town-brief.md): where play starts. It lives in the SAME
// THREE.Scene as the archipelago, far away at TOWN_ORIGIN, with its own collision world (the Shell interior in
// scenes/shell.js is the precedent): boot-world.js swaps `player.world` / `rig.world` on the way in and out.
//
// Every piece of scenes/town-data.js is one .glb in public/assets/models/town/, placed as a PropInstance on the
// shared AssetStreamer, so warm-up, light-first files, release and the first-frame byte gate work as for the
// island. Town pieces have no greybox: nothing shows and nothing collides until the file is in, which is why
// `ready` (the terrain piece is real) gates Iris's physics. Each .glb carries its own *_col meshes.
// Names this module looks for inside the files:
//   socket_lamp_*          empties for warm lamp lights: the TOWN_LAMPS nearest Iris are lit (point lights, no shadows)
//   altar_focus, altar_stand   empties in town_altar.glb (camera focus, where Iris stands); the data is the fallback
//   M_Altar_Core           the altar's crystal: its emissiveIntensity is driven here (sleep, wake, pulse, flare)
//   town_altar_altar_glyph_00..15 (M_Altar_Glyph)  ring glyphs, lit in sequence as Iris approaches; M_Altar_Eye follows dimly
// Visual only apart from the collision world: no game rule lives in the town.
import * as THREE from 'three';
import { CollisionWorld, rayCast, MASK_PLAYER } from '../physics/collision.js';
import { PropInstance } from '../render/assets.js';
import { createTownLife } from './town-life.js';
import { TOWN_DATA, TOWN_ORIGIN, TOWN_PIECES, TOWN_ALTAR, TOWN_ROUTE, TOWN_TERRAIN, TOWN_ALTAR_ASSET, townFlatGround, altarDistance, altarWake } from './town-layout.js';

/** Most lamp lights lit at once (docs/town.md): point lights are paid by every lit material in view. */
export const TOWN_LAMPS = 6;
/** Altar core emissive intensity: asleep, awake (Iris inside the prompt radius) and the registration flare on top. */
// The file's own strength is overwritten; the colour is forced to a deep amber (CORE_AMBER) so these levels stay amber, not cream.
export const CORE_GLOW = Object.freeze({ idle: 0.9, awake: 2.4, flare: 9, pulse: 0.14 });
const CORE_MATERIAL = /^M_Altar_Core/;
const CORE_AMBER = 0xff7a16;
const GLYPH_MATERIAL = /^M_Altar_Glyph/, EYE_MATERIAL = /^M_Altar_Eye/;
const GLYPH_NODE = /altar_glyph_(\d+)/;
/** Emissive hierarchy of the altar, relative to the core: glyph inlays (fully lit) and the waystone eyes. */
export const ALTAR_RATIO = Object.freeze({ glyph: 0.35, glyphUnlit: 0.04, eye: 0.1 });
const LAMP_SOCKET = /^socket_lamp_/, SMOKE_SOCKET = /^socket_smoke_/;
const LAMP_COLOR = 0xffb268;

const _v = new THREE.Vector3();

/**
 * The `count` sockets nearest a point, written into `out` as indices (-1 pads a short list). No allocations: the
 * town calls it a few times a second to move its lamp lights with Iris.
 * @param {number[][]} points @param {number[]} pos @param {Int16Array|number[]} out
 */
export function nearestLamps(points, pos, out) {
  for (let k = 0; k < out.length; k++) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      let taken = false;
      for (let j = 0; j < k; j++) if (out[j] === i) { taken = true; break; }
      if (taken) continue;
      const p = points[i], d = (p[0] - pos[0]) ** 2 + (p[1] - pos[1]) ** 2 + (p[2] - pos[2]) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    out[k] = best;
  }
  return out;
}

/** The dev flat town (?town=flat, or a build without the terrain file): a plain ground and a code-drawn altar. */
function buildFlatTown(group, ground) {
  const [w, d] = TOWN_DATA.size;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0x8d8674, roughness: 0.95 }));
  plane.rotation.x = -Math.PI / 2; plane.position.set(TOWN_ORIGIN[0], ground.top, TOWN_ORIGIN[2]); plane.receiveShadow = true; plane.name = 'town_flat_ground';
  const stone = new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: 0.9 });
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.45, 24), stone);
  dais.position.set(TOWN_ALTAR.position[0], ground.top + 0.225, TOWN_ALTAR.position[2]); dais.castShadow = true; dais.receiveShadow = true; dais.name = 'town_flat_altar_dais';
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.16, 10, 32), stone);
  ring.position.set(TOWN_ALTAR.position[0], ground.top + 1.55, TOWN_ALTAR.position[2]); ring.castShadow = true; ring.name = 'town_flat_altar_ring';
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), new THREE.MeshStandardMaterial({ color: 0x3a2a12, emissive: 0xffa53a, emissiveIntensity: CORE_GLOW.idle, roughness: 0.4 }));
  core.material.name = 'M_Altar_Core';
  core.position.copy(ring.position); core.name = 'town_flat_altar_core';
  group.add(plane, dais, ring, core);
  return core.material;
}

/**
 * @param {{scene: THREE.Scene, streamer: import('../render/assets.js').AssetStreamer, flat?: boolean, pointLights?: boolean}} o
 *   flat: no models, a flat dev ground (?town=flat); pointLights: the quality tier allows lamp lights
 */
export function createTownScene({ scene, streamer, flat = false, pointLights = true, detail = 1 }) {
  const world = new CollisionWorld({ cellSize: 2 });
  const skyWorld = new CollisionWorld({ cellSize: 8 }); // the sky impostor never collides, whatever its file holds
  const group = new THREE.Group();
  group.name = 'town';
  scene.add(group);
  const life = createTownLife({ parent: group, origin: TOWN_ORIGIN, center: TOWN_ALTAR.stand, detail });

  const library = streamer.library;
  const state = {
    active: true, flat: false, ready: false, time: 0,
    wake: 0, flare: 0, flareTarget: 0, glow: CORE_GLOW.idle,
    /** World points; replaced by the altar_focus / altar_stand empties when the model has them. */
    focus: TOWN_ALTAR.focus.slice(), stand: TOWN_ALTAR.stand.slice(),
  };
  const coreMaterials = [], eyeMaterials = [];
  const glyphs = []; // {index, material}: one cloned material per glyph node, sorted by index
  const lampPoints = new Map(); // instance id -> world positions of its socket_lamp_* empties
  let lampSockets = [];         // all of them, flat
  const lampWanted = new Int16Array(TOWN_LAMPS).fill(-1);
  let lampTimer = 0;
  const lamps = [];
  for (let i = 0; i < TOWN_LAMPS; i++) {
    const l = new THREE.PointLight(LAMP_COLOR, 0, 13, 2);
    l.name = 'town_lamp_light'; l.castShadow = false; l.visible = !!pointLights;
    l.position.set(TOWN_ORIGIN[0], TOWN_ORIGIN[1] + 3, TOWN_ORIGIN[2]);
    l.userData.socket = -1; l.userData.level = 0; l.userData.phase = i * 2.399;
    group.add(l); lamps.push(l);
  }

  /** The socket list changed (a piece arrived or left): every light lets go and is handed out again. */
  function placeLamps() {
    lampSockets = [];
    for (const list of lampPoints.values()) for (const p of list) lampSockets.push(p);
    for (const l of lamps) { l.userData.socket = -1; l.userData.level = 0; l.intensity = 0; }
    lampTimer = 0;
  }

  /**
   * The six lights follow Iris: a light whose socket is no longer among the nearest fades out, then moves to a
   * socket that has none and fades in, so nothing pops. No allocations.
   */
  function updateLamps(t, dt, playerPos, reducedMotion, scale = 1) {
    if ((lampTimer -= dt) <= 0) { lampTimer = 0.4; nearestLamps(lampSockets, playerPos, lampWanted); }
    const k = 1 - Math.exp(-dt * 3);
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i], u = l.userData;
      let wanted = false;
      for (let j = 0; j < lampWanted.length; j++) if (u.socket >= 0 && lampWanted[j] === u.socket) { wanted = true; break; }
      if (!wanted && u.level < 0.02) {
        // free: take a wanted socket no light holds
        u.socket = -1;
        for (let j = 0; j < lampWanted.length && u.socket < 0; j++) {
          const want = lampWanted[j];
          if (want < 0) continue;
          let held = false;
          for (let m = 0; m < lamps.length; m++) if (lamps[m].userData.socket === want) { held = true; break; }
          if (!held) { u.socket = want; const p = lampSockets[want]; l.position.set(p[0], p[1], p[2]); wanted = true; }
        }
      }
      u.level += ((wanted ? 1 : 0) - u.level) * k;
      l.intensity = u.socket < 0 ? 0 : 11 * scale * u.level * (reducedMotion ? 1 : 1 + 0.07 * Math.sin(t * 6.1 + u.phase) + 0.04 * Math.sin(t * 11.3 + u.phase * 1.7));
    }
  }

  /** A piece changed between nothing and its real model (also the light -> full swap): re-read what the file exposes. */
  function onPiece(def, inst) {
    const real = inst.real;
    if (def.visualOnly && real) {
      // The archipelago in the sky: no shadows, and no fog on top of its own painted haze (it is about 330 m away).
      real.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false; o.receiveShadow = false;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && m.fog !== false) { m.fog = false; m.needsUpdate = true; }
      });
    }
    const pts = [];
    if (real) for (const [name, node] of inst.sockets) {
      if (name === 'socket_lamp_altar_core') { state.core = node.getWorldPosition(_v).toArray(); continue; } // the amber core has its own light (LookDev.setHeroLight)
      if (LAMP_SOCKET.test(name)) pts.push(node.getWorldPosition(_v).toArray());
    }
    if (pts.length) lampPoints.set(inst.id, pts); else lampPoints.delete(inst.id);
    // Ambient life (scenes/town-life.js): chimney smoke at the smoke sockets, the sky islands drifting.
    const smoke = [];
    if (real) for (const [name, node] of inst.sockets) if (SMOKE_SOCKET.test(name)) smoke.push(node.getWorldPosition(_v).toArray());
    life.setChimneys(inst.id, smoke);
    if (def.visualOnly) life.setSky(real || null);
    placeLamps();
    if (def.name !== TOWN_ALTAR_ASSET) return;
    coreMaterials.length = 0; eyeMaterials.length = 0; glyphs.length = 0;
    state.focus = TOWN_ALTAR.focus.slice(); state.stand = TOWN_ALTAR.stand.slice();
    if (!real) return;
    real.updateWorldMatrix(true, true);
    real.traverse((o) => {
      const name = o.userData.name || o.name;
      if (name === 'altar_focus') state.focus = o.getWorldPosition(_v).toArray();
      else if (name === 'altar_stand') state.stand = o.getWorldPosition(_v).toArray();
      if (!o.isMesh) return;
      // A glyph node (or the primitive under it) gets its own copy of the glyph material so each one lights alone.
      const g = GLYPH_NODE.exec(name) || (o.parent && GLYPH_NODE.exec(o.parent.userData.name || o.parent.name || ''));
      if (g && !Array.isArray(o.material) && o.material && GLYPH_MATERIAL.test(o.material.name || '')) {
        o.material = o.material.clone();
        glyphs.push({ index: Number(g[1]), material: o.material });
        return;
      }
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m) continue;
        if (CORE_MATERIAL.test(m.name || '') && !coreMaterials.includes(m)) coreMaterials.push(m);
        else if ((EYE_MATERIAL.test(m.name || '') || GLYPH_MATERIAL.test(m.name || '')) && !eyeMaterials.includes(m)) eyeMaterials.push(m); // glyph material outside a glyph node: steady and dim
      }
    });
    glyphs.sort((a, b) => a.index - b.index);
    // The core glows deep amber: a pale authored emission clipped to cream under the tone mapping, a saturated one
    // stays amber at the same brightness (a core with an emissive map keeps its own colours).
    for (const m of coreMaterials) if (m.emissive && !m.emissiveMap) m.emissive.setHex(CORE_AMBER);
  }

  const pieces = [];
  let terrain = null;
  if (!flat) {
    for (const def of TOWN_PIECES) {
      const instance = streamer.add(new PropInstance({ name: def.name, scene, world: def.visualOnly ? skyWorld : world, position: def.position }));
      pieces.push({ def, instance });
      if (def.name === TOWN_TERRAIN) terrain = instance;
      instance.onSockets((_s, inst) => onPiece(def, inst));
    }
  }

  let flatGroup = null;
  /** Switches the dev flat ground on (asked for by the URL, or the terrain file is missing or failed to load). */
  function useFlatGround() {
    if (state.flat) return;
    state.flat = true;
    const g = townFlatGround();
    world.addBox('town_flat', g.min, g.max);
    flatGroup = new THREE.Group(); flatGroup.name = 'town_flat';
    flatGroup.visible = state.active;
    const hasAltar = !flat && library.get(TOWN_ALTAR_ASSET) && library.get(TOWN_ALTAR_ASSET).state !== 'absent';
    const core = buildFlatTown(flatGroup, g);
    if (hasAltar) { for (const c of [...flatGroup.children]) if (/altar/.test(c.name)) flatGroup.remove(c); } // the real altar streams in
    else coreMaterials.push(core);
    group.add(flatGroup);
  }
  if (flat) useFlatGround();

  /** Ground height under a world point (ray cast down through the town's colliders), or null over the void. */
  function groundAt(x, z, fromY = TOWN_ORIGIN[1] + 60) {
    const hit = rayCast(world, [x, fromY, z], [0, -1, 0], 200, MASK_PLAYER);
    return hit ? hit.point[1] : null;
  }

  function checkReady() {
    if (state.ready) return true;
    if (!state.flat && terrain) {
      const e = library.get(TOWN_TERRAIN);
      if (!e || e.state === 'absent' || e.state === 'failed') useFlatGround(); // no ground will ever arrive: walk on the dev ground
    } else if (!state.flat) useFlatGround();
    state.ready = state.flat || !!(terrain && terrain.isReal);
    return state.ready;
  }

  /**
   * Per frame. No allocations.
   * @param {number} t seconds (frozen under reduced motion by the caller is fine: the pulse is skipped anyway)
   * @param {number} dt @param {{playerPos: number[], reducedMotion?: boolean}} o
   */
  function update(t, dt, { playerPos, reducedMotion = false, lamps: lampScale = 1, light = null }) {
    if (!state.active) return;
    life.update(reducedMotion ? 0 : dt, light);
    state.time = t;
    checkReady();
    const target = altarWake(altarDistance(playerPos));
    state.wake += (target - state.wake) * (1 - Math.exp(-dt * 2.5));
    state.flare += (state.flareTarget - state.flare) * (1 - Math.exp(-dt * (state.flareTarget > state.flare ? 2.2 : 5)));
    const pulse = reducedMotion ? 1 : 1 + CORE_GLOW.pulse * (0.5 + 0.5 * state.wake) * Math.sin(t * 1.7);
    state.glow = (CORE_GLOW.idle + (CORE_GLOW.awake - CORE_GLOW.idle) * state.wake) * pulse + CORE_GLOW.flare * state.flare;
    for (let i = 0; i < coreMaterials.length; i++) coreMaterials[i].emissiveIntensity = state.glow;
    for (let i = 0; i < eyeMaterials.length; i++) eyeMaterials[i].emissiveIntensity = state.glow * ALTAR_RATIO.eye;
    // The ring glyphs light one after another as she comes closer (00 first), all of them at the stand; the flare lights all.
    const n = glyphs.length, front = Math.max(state.wake, state.flare) * (n + 1);
    for (let i = 0; i < n; i++) {
      const lit = Math.min(1, Math.max(0, front - i));
      glyphs[i].material.emissiveIntensity = state.glow * (ALTAR_RATIO.glyphUnlit + (ALTAR_RATIO.glyph - ALTAR_RATIO.glyphUnlit) * lit);
    }
    updateLamps(t, dt, playerPos, reducedMotion, lampScale);
  }

  /** The registration flare of the amber core: 1 ramps it up, 0 lets it settle. */
  function setFlare(k) { state.flareTarget = Math.max(0, Math.min(1, Number(k) || 0)); }

  /** Leaving for the archipelago: lights off, dev ground hidden; the streamer releases the pieces by itself. */
  function setActive(on) {
    state.active = !!on;
    for (const l of lamps) l.visible = state.active && !!pointLights;
    life.setActive(state.active);
    if (flatGroup) flatGroup.visible = state.active;
  }

  /** The quality tier changed: lamp lights follow `pointLights`. */
  function setPointLights(on) { pointLights = !!on; for (const l of lamps) l.visible = state.active && pointLights; }

  /** Whether a piece will not change any more: its model is in, or the build has no file for it (or it failed). */
  function settled(name) {
    const piece = pieces.find((x) => x.def.name === name);
    if (!piece || piece.instance.isReal) return true;
    const e = library.get(name);
    return !e || e.state === 'absent' || e.state === 'failed';
  }

  /** Loading state for QA and the dev HUD: per piece name -> library state, real flag. */
  function status() {
    return pieces.map(({ def, instance }) => ({ name: def.name, state: (library.get(def.name) || {}).state || 'unknown', real: instance.isReal }));
  }

  return {
    origin: TOWN_ORIGIN, world, group, pieces, lamps, coreMaterials, glyphs, routePoints: TOWN_ROUTE,
    get ready() { return checkReady(); },
    /** Every piece that carries the streets is in (or will never come): nothing is left to pop in around Iris. */
    get shown() { return checkReady() && (state.flat || pieces.every((x) => x.def.visualOnly || settled(x.def.name))); }, get flat() { return state.flat; }, get active() { return state.active; },
    get altar() { return state; },
    life, update, setFlare, setActive, setPointLights, groundAt, settled, status,
  };
}
