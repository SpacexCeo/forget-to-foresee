// Walk-in shops (docs/town.md "Shops"; owner, 11.11): E at a shop door fades to dark, the shop's interior streams in
// far beside the town (town-layout.js SHOP_ORIGIN_BASE) with its own collision world, Iris appears inside, and the
// fade lifts. Inside, the counter offers a talk that opens the same panel the door used to open (Exchange: shards +
// Echo; Scribe: glossary; Inn: hiring board) and the door leads back out the same way. The interiors carry their light
// baked into vertex colour, so indoors the sun, sky light, environment, fog and rain are held off and one neutral
// ambient light shows the bake (SHOP_LIGHT). The street is never shown half-loaded: the fade waits for the room.
import * as THREE from 'three';
import { CollisionWorld } from '../physics/collision.js';
import { PropInstance } from '../render/assets.js';
import { setFog } from '../render/fog.js';
import { createSwingSet } from '../render/swing.js';
import { cue } from '../audio/town-audio.js';
import { TOWN_SHOPS, SHOP_LIGHT, SHOP_CAMERA, SHOP_TRANSITION, shopZoneAt, shopPrompt } from './town-layout.js';

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene @param {object} o.streamer @param {object} o.player @param {object} o.rig
 * @param {object} o.lookdev @param {object} o.i18n @param {() => boolean} o.reducedMotion
 * @param {(id: string) => void} o.onCounter opens the shop's panel (town-flow openSpot)
 * @param {{world: object, killY: number, camera: object}} o.street what to restore when Iris leaves
 * @param {Document} [o.doc] @param {object[]} [o.shops]
 */
export function createTownShops({ scene, streamer, player, rig, lookdev, i18n, reducedMotion = () => false, onCounter = () => {}, street, doc = globalThis.document, shops = TOWN_SHOPS }) {
  const fade = doc.createElement('div');
  fade.style.cssText = 'position:fixed;inset:0;background:#05070a;opacity:0;pointer-events:none;z-index:30;transition:opacity .45s ease';
  doc.body.append(fade);
  const prompt = doc.createElement('button'); prompt.type = 'button'; prompt.className = 'ftf-town-prompt'; prompt.hidden = true;
  prompt.style.zIndex = '12';
  const cap = doc.createElement('kbd'); cap.textContent = 'E'; const text = doc.createElement('span'); prompt.append(cap, text);
  prompt.addEventListener('pointerdown', (e) => e.stopPropagation());
  prompt.addEventListener('click', () => { prompt.blur(); interact(); });
  doc.body.append(prompt);
  const ambient = new THREE.AmbientLight(0xffffff, SHOP_LIGHT.ambient); ambient.visible = false; ambient.name = 'shop_ambient'; scene.add(ambient);
  const rooms = new Map(); // id -> {world, inst}
  const swing = createSwingSet(); // the rooms' chandeliers and wall lanterns sway a little too
  const state = { phase: 'street', shop: null, zone: null, busy: false, saved: null };

  function room(shop) {
    let r = rooms.get(shop.id);
    if (!r) {
      const world = new CollisionWorld({ cellSize: 2 });
      const inst = streamer.add(new PropInstance({ name: shop.piece, scene, world, position: shop.origin }));
      r = { world, inst }; rooms.set(shop.id, r);
    }
    return r;
  }
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  async function fadeTo(on) {
    const s = reducedMotion() ? SHOP_TRANSITION.reducedFade : SHOP_TRANSITION.fade;
    fade.style.transition = `opacity ${s}s ease`; fade.style.opacity = on ? '1' : '0';
    await wait(s * 1000 + 30);
  }
  /** Indoors: no sun, no sky light, no environment, no fog or rain; the bake under one neutral ambient light. */
  function holdInterior() {
    lookdev.sun.intensity = 0; lookdev.hemi.intensity = 0;
    scene.environmentIntensity = 0;
    if (scene.fog) { scene.fog.near = 1e4; scene.fog.far = 2e4; }
    setFog({ density: 0 });
    if (lookdev.rain) lookdev.rain.setAmount(0, true);
    lookdev.renderer.toneMappingExposure = Math.pow(2, SHOP_LIGHT.exposure);
    ambient.visible = true;
  }

  async function enter(shop) {
    if (state.busy || state.phase !== 'street') return false;
    state.busy = true; state.phase = 'entering'; state.shop = shop; render();
    const r = room(shop);
    streamer.pin(shop.piece, 1000);
    cue('ui_confirm');
    await fadeTo(true);
    const t0 = performance.now();
    while (!r.inst.real && performance.now() - t0 < SHOP_TRANSITION.wait * 1000) await wait(100);
    if (!r.inst.real) { streamer.pin(shop.piece, null); state.phase = 'street'; state.shop = null; state.busy = false; await fadeTo(false); render(); return false; }
    state.saved = { dist: rig.dist, minDist: rig.minDist, maxDist: rig.maxDist, minPitch: rig.minPitch, pitchOffset: rig.pitchOffset };
    player.world = r.world; rig.world = r.world; player.killY = shop.killY;
    player.teleport(shop.spawn.position.slice(), shop.spawn.heading);
    if (rig.reset) rig.reset(); // behind Iris first, then the room's close, level camera (reset restores defaults)
    rig.minDist = SHOP_CAMERA.minDist; rig.maxDist = SHOP_CAMERA.maxDist; rig.minPitch = SHOP_CAMERA.minPitch; rig.dist = SHOP_CAMERA.dist;
    rig.pitchOffset = SHOP_CAMERA.pitch - (rig.pitchFor ? rig.pitchFor(rig.dist) : 0); // the rig's zoom-tied pitch is cancelled
    holdInterior();
    state.phase = 'inside'; state.zone = null;
    await fadeTo(false);
    state.busy = false; render();
    return true;
  }

  async function leave() {
    if (state.busy || state.phase !== 'inside') return false;
    const shop = state.shop;
    state.busy = true; state.phase = 'leaving'; render();
    cue('ui_click');
    await fadeTo(true);
    ambient.visible = false;
    player.world = street.world(); rig.world = street.world(); player.killY = street.killY;
    player.teleport(shop.street.position.slice(), shop.street.heading);
    if (rig.reset) rig.reset();
    if (state.saved) { const v = state.saved; rig.minDist = v.minDist; rig.maxDist = v.maxDist; rig.minPitch = v.minPitch; rig.dist = v.dist; rig.pitchOffset = v.pitchOffset; }
    lookdev.applyWeather(true); // the hour and the weather come back
    streamer.pin(shop.piece, null);
    state.phase = 'street'; state.shop = null; state.zone = null;
    await fadeTo(false);
    state.busy = false; render();
    return true;
  }

  function render() {
    const p = state.phase === 'inside' && !state.busy ? shopPrompt({ phase: 'inside', shop: state.shop, zone: state.zone }) : null;
    prompt.hidden = !p;
    if (p) { const v = i18n.t(p.key); text.textContent = v === p.key ? i18n.t(p.fallback) : v; }
  }

  /** E inside: talk at the counter, leave at the door. Returns true when it acted. */
  function interact() {
    if (state.phase !== 'inside' || state.busy) return false;
    if (state.zone === 'counter') { onCounter(state.shop.id); return true; }
    if (state.zone === 'exit') { leave(); return true; }
    return false;
  }

  return {
    get phase() { return state.phase; },
    get inside() { return state.phase !== 'street'; },
    get busy() { return state.busy; },
    get shop() { return state.shop; },
    enter: (id) => { const s = shops.find((x) => x.id === id); return s ? enter(s) : Promise.resolve(false); },
    leave, interact,
    /** Per frame: the zone under Iris and, indoors, the light held off (the day cycle and weather pause). */
    update() {
      if (state.phase !== 'inside') return;
      holdInterior();
      const r = rooms.get(state.shop.id);
      if (r && r.inst.real && !r.swung) { swing.set(state.shop.id, r.inst.real); r.swung = true; }
      swing.update(performance.now() / 1000, reducedMotion());
      const z = shopZoneAt(state.shop, player.pos);
      if (z !== state.zone) { state.zone = z; render(); }
    },
    dispose() { fade.remove(); prompt.remove(); scene.remove(ambient); },
  };
}
