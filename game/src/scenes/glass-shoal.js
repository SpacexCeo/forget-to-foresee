// The Glass Shoal, town side and controller (docs/plans/boss/glass-shoal-boss.md, flag `glassShoal`). Loaded with
// import() by boot-world.js once Iris is in town and the flag is on. It owns:
//  - the main quest "The Call of the Shoal" (unlocked at level 5): the giver's gold light ray, a shimmering tracker
//    line, the offer card (opened by E or a tap on the prompt; nothing pops by itself), the Loomblade find;
//  - the cliff stone above the Crownrift arena, where the pearl dragon lands; E or a tap mounts;
//  - the guided ride in a bounded corridor (soft leash, Skip, reduced motion jumps to the landing);
//  - the arena (scenes/shoal-arena.js, imported only when the ride starts) and the way home.
// While the ride or the fight runs this module owns the heroine: boot-world.js skips its physics and input and asks
// `applyAvatar` for her pose. Placeholders stand in for the dragon and the blade until the model files land
// (MODELS: the loaders pick them up by name through render/assets.js).
import * as R from '../game/shoal-rules.js';
import { shoalText } from '../locales/shoal.js';
import { hasModelFile, fetchGltf, getModelVariant } from '../render/assets.js';
import { dragonMix, DRAGON_ANIM } from '../game/shoal-dragon-anim.js';

/** Model files the models seat delivers (render/asset-catalog names); placeholders until hasModelFile says yes. */
export const MODELS = Object.freeze({ dragon: 'shoal_dragon', saddle: 'dragon_saddle', blade: 'loomblade', boss: 'hollow_tide' });
/** Town-local spots: the Loomblade's marker outside the walls, the cliff stone above the Crownrift arena. */
export const SPOTS = Object.freeze({ blade: Object.freeze([-26, 60]), stone: Object.freeze([24, 106]), radius: 2.6, giver: 3.2 });

const CSS = `
.gs-track{position:fixed;left:calc(env(safe-area-inset-left,0px) + 16px);top:calc(env(safe-area-inset-top,0px) + 96px);max-width:min(340px,calc(100vw - 32px));z-index:12;
 box-sizing:border-box;padding:8px 12px;border-radius:10px;border:1px solid rgba(246,200,96,.6);background:rgba(20,16,8,.72);color:#f6e2a8;font:600 14px/1.35 "Atkinson Hyperlegible",system-ui,sans-serif;
 background-image:linear-gradient(100deg,transparent 30%,rgba(255,226,150,.28) 50%,transparent 70%);background-size:250% 100%;animation:gs-shimmer 3.2s linear infinite,gs-breathe 2.4s ease-in-out infinite;pointer-events:none}
.gs-track small{display:block;color:#c9b27a;font-weight:400;font-size:12px;letter-spacing:.04em;text-transform:uppercase}
@keyframes gs-shimmer{from{background-position:120% 0}to{background-position:-120% 0}}
@keyframes gs-breathe{0%,100%{box-shadow:0 0 6px rgba(246,200,96,.25)}50%{box-shadow:0 0 18px rgba(246,200,96,.65)}}
.gs-prompt{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 150px);transform:translateX(-50%);z-index:14;min-height:40px;padding:8px 18px;border-radius:999px;border:1px solid rgba(255,255,255,.35);
 background:rgba(10,14,14,.55);color:#fff;font:500 15px/1.2 "Atkinson Hyperlegible",system-ui,sans-serif;text-shadow:0 1px 2px rgba(0,0,0,.6);box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer}
.gs-prompt:hover{background:rgba(10,14,14,.7);border-color:rgba(255,255,255,.55)}
.gs-prompt kbd{border:1px solid rgba(255,255,255,.45);border-radius:4px;padding:0 6px;margin-right:8px;font:600 12px/18px ui-monospace,Consolas,monospace;color:#fff;background:none}
body.ts-touch .gs-prompt kbd{display:none}@media (pointer:coarse){.gs-prompt kbd{display:none}}
.gs-card{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:30;width:min(420px,calc(100vw - 32px));box-sizing:border-box;padding:16px;border-radius:12px;border:1px solid #f6c860;
 background:rgba(18,14,8,.94);color:#f3ead2;font:15px/1.45 "Atkinson Hyperlegible",system-ui,sans-serif}
.gs-card h3{margin:0 0 8px;color:#f6c860;font-size:18px}.gs-card .gs-row{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
.gs-card button,.gs-skip{min-height:44px;min-width:88px;border-radius:10px;border:1px solid #f6c860;background:rgba(246,200,96,.14);color:#f6e2a8;font:600 15px system-ui,sans-serif;cursor:pointer}
.gs-ride{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 70px);transform:translateX(-50%);z-index:14;text-align:center;color:#f3ead2;font:600 16px system-ui,sans-serif;text-shadow:0 1px 3px #000;pointer-events:none}
.gs-ride small{display:block;font-weight:400;font-size:13px;opacity:.85}.gs-ride i{display:block;width:220px;height:5px;margin:6px auto 0;border-radius:3px;background:rgba(255,255,255,.18);overflow:hidden}.gs-ride i b{display:block;height:100%;background:#f6c860}
.gs-skip{position:fixed;right:calc(env(safe-area-inset-right,0px) + 16px);bottom:calc(env(safe-area-inset-bottom,0px) + 24px);z-index:15}
body.gs-owned .ph,body.gs-owned .ftf-town-objective,body.gs-owned .ftf-story-goal,body.gs-owned .ftf-cast,body.gs-owned .ftf-cast-bar,body.gs-owned .ftf-mk,body.gs-owned .ftf-chat,body.gs-owned .ft,body.gs-owned .ts-btn,body.gs-owned .ts-arc,body.gs-owned .ftf-town-prompt,body.gs-owned .ftf-scene-hint,
body.gs-owned .rpg,body.gs-owned .ftf-bark,body.gs-owned .ftf-altar-timer,body.gs-owned .ftf-run-toggle{display:none!important}
html[data-motion=reduce] .gs-track{animation:none}
@media (prefers-reduced-motion:reduce){.gs-track{animation:none}}
`;

/**
 * @param {object} o
 * @param {typeof import('three')} o.THREE
 * @param {object} o.scene @param {object} o.camera @param {object} o.rig the camera rig @param {object} o.player
 * @param {(local: number[]) => number[]} o.toWorld town-local -> world @param {(x: number, z: number) => number|null} o.groundAt
 * @param {(key: string) => number[]|null} o.folkAt a townsperson's live world position
 * @param {object} o.ledger the town ledger (level, grant) @param {object} [o.chests] the chest bag
 * @param {Storage} [o.storage] @param {() => string} o.locale @param {(s: string) => void} o.toast
 * @param {() => boolean} o.reduced @param {boolean} o.mobile @param {() => string} o.hero 'iris' | 'elise'
 * @param {(name: string) => void} [o.clip] plays a combat clip on the heroine
 * @param {() => number[]} o.axes the movement axes [x, y] (keys or the stick)
 */
export function createGlassShoal(o) {
  const { THREE, scene, rig, player, toWorld, groundAt, folkAt, ledger, chests = null, storage = null, toast = () => {}, reduced = () => false, mobile = false, hero = () => 'iris', clip = () => {}, axes = () => [0, 0] } = o;
  const say = (k, a) => shoalText(o.locale ? o.locale() : 'en', k, a);
  const doc = globalThis.document;
  if (doc && !doc.getElementById('gs-css')) { const st = doc.createElement('style'); st.id = 'gs-css'; st.textContent = CSS; doc.head.append(st); }
  let save = R.readShoal(storage ? storage.getItem(R.SHOAL_KEY) : null);
  const persist = () => { try { if (storage) storage.setItem(R.SHOAL_KEY, JSON.stringify(save)); } catch { /* memory only */ } };
  const level = () => (ledger && ledger.level ? ledger.level.level : 1);
  const event = (ev) => { const n = R.questEvent(save, ev, level()); if (n !== save) { save = n; persist(); return true; } return false; };

  // ---- 3D: the gold ray over the giver, the Loomblade marker, the cliff stone, the dragon
  const group = new THREE.Group(); group.name = 'glass-shoal-town'; scene.add(group);
  const gold = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const makeRay = () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 40, 16, 1, true), gold.clone()); m.geometry.translate(0, 20, 0); m.renderOrder = 5; m.frustumCulled = false; return m; };
  const giverRay = makeRay(); group.add(giverRay);
  const bladeRay = makeRay(); group.add(bladeRay);
  const stoneRay = makeRay(); group.add(stoneRay);
  let seated = 0; // spots on real ground (the town's ground streams in after this module mounts)
  const place = (obj, local) => { const w = toWorld([local[0], 0, local[1]]); const gy = groundAt(w[0], w[2]); if (gy != null) seated++; obj.position.set(w[0], gy == null ? w[1] + 20 : gy, w[2]); return obj.position; };
  // the Loomblade: a woven blade stuck in the ground (placeholder until MODELS.blade lands)
  const blade = new THREE.Group();
  { const steel = new THREE.MeshStandardMaterial({ color: 0xcfd8e6, metalness: 0.9, roughness: 0.25, emissive: 0x3a5a8a, emissiveIntensity: 0.6 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.2, 0.02), steel); b.position.y = 0.55;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.08), new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.8, roughness: 0.3 })); guard.position.y = 1.16;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.8 })); grip.position.y = 1.34;
    blade.add(b, guard, grip); blade.rotation.z = 0.12; group.add(blade); }
  // the cliff stone: a standing slab with a gold rune
  const stone = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 0.7), new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.95, emissive: 0x6a4a10, emissiveIntensity: 0.25 }));
  stone.geometry.translate(0, 1.3, 0); group.add(stone);
  let bladeAt = null, stoneAt = null;
  const placeAll = () => { seated = 0; bladeAt = place(blade, SPOTS.blade).clone(); bladeRay.position.copy(bladeAt); stoneAt = place(stone, SPOTS.stone).clone(); stoneRay.position.copy(stoneAt); };
  placeAll();
  const dragon = makeDragon(THREE); dragon.root.visible = false; scene.add(dragon.root);
  const variantOf = (name) => (hasModelFile(name + getModelVariant()) ? name + getModelVariant() : name); // phones and the low tier: `_m`
  if (hasModelFile(MODELS.dragon)) fetchGltf(variantOf(MODELS.dragon)).then(({ gltf }) => {
    dragon.useModel(gltf.scene, gltf.animations);
    if (hasModelFile(MODELS.saddle)) fetchGltf(variantOf(MODELS.saddle)).then((r) => dragon.useSaddle(r.gltf.scene)).catch(() => { /* she rides bareback */ });
  }).catch(() => { /* the placeholder stays */ });

  // ---- DOM: the tracker line, the prompt, the offer card, the ride HUD
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const track = el('div', 'gs-track'); track.setAttribute('role', 'status'); track.hidden = true; doc.body.append(track);
  const prompt = el('button', 'gs-prompt'); prompt.type = 'button'; prompt.hidden = true; doc.body.append(prompt);
  let promptAction = null;
  prompt.addEventListener('click', () => { if (promptAction) promptAction(); });
  let card = null;
  const closeCard = () => { if (card) { card.remove(); card = null; } };
  function openOffer() {
    if (card) return;
    card = el('div', 'gs-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', say('shoal.quest'));
    const row = el('div', 'gs-row'); const later = el('button', null, say('shoal.later')); const yes = el('button', null, say('shoal.accept'));
    later.type = yes.type = 'button';
    later.addEventListener('click', closeCard);
    yes.addEventListener('click', () => { closeCard(); if (event('accept')) { ledger && ledger.addXp && ledger.addXp('questStep'); toast(say('shoal.track.' + save.step)); } });
    row.append(later, yes); card.append(el('h3', null, say('shoal.quest')), el('p', null, say('shoal.offer')), row); doc.body.append(card);
    // a tap outside closes it (phones)
    setTimeout(() => doc.addEventListener('pointerdown', function out(e) { if (card && !card.contains(e.target)) { closeCard(); } if (!card) doc.removeEventListener('pointerdown', out); }), 0);
    yes.focus();
  }

  // ---- state
  let mode = 'town';   // 'town' | 'landing' (the dragon descends) | 'ride' | 'arena' | 'home' (fade back)
  let ride = null, rideHud = null, skipBtn = null, landT = 0, arena = null, arenaLoading = null;
  const pose = { pos: new THREE.Vector3(), heading: 0, speed: 0, bank: 0, pitch: 0, bob: 0 };
  const savedRig = {};
  const rideBasis = () => { const O = stoneAt.clone().add(new THREE.Vector3(0, 6, 4)); const A = O.clone().add(new THREE.Vector3(0, -40, R.RIDE.length + 60)); return { O, A }; };
  const arenaCenter = () => rideBasis().A;

  function loadArena() {
    if (!arenaLoading) arenaLoading = import('./shoal-arena.js').then((m) => { arena = m.createShoalArena({ THREE, scene, camera: o.camera, center: arenaCenter(), say, toast, reduced, mobile, hero, clip, axes, rig,
      onWin: () => { try { globalThis.dispatchEvent(new CustomEvent('ftf:feat', { detail: { k: 'boss', v: 'shoal' } })); } catch { /* the room's action feed is optional */ } if (event('boss_down') && ledger) { ledger.grant({ xp: R.REWARD.xp }); if (chests) try { chests.add({ tier: R.REWARD.chest, source: 'boss' }); } catch { /* the bag is optional */ } } },
      onDeath: () => event('death'), onHome: () => flyHome() }); return arena; });
    return arenaLoading;
  }

  function startRide() {
    if (mode !== 'landing' && mode !== 'town') return;
    event('mount'); loadArena(); // stream the island while she flies
    mode = 'ride'; ride = R.freshRide(); dragon.root.visible = true;
    Object.assign(savedRig, { dist: rig.dist, maxDist: rig.maxDist, minPitch: rig.minPitch });
    rig.maxDist = Math.max(rig.maxDist || 0, 22); rig.dist = 16;
    rideHud = el('div', 'gs-ride'); rideHud.innerHTML = ''; rideHud.append(el('span', null, say('shoal.ride.title')), el('small', null, say('shoal.ride.hint')));
    const bar = el('i'); bar.append(el('b')); rideHud.append(bar); doc.body.append(rideHud);
    skipBtn = el('button', 'gs-skip', say('shoal.skip')); skipBtn.type = 'button'; skipBtn.addEventListener('click', () => endRide()); doc.body.append(skipBtn);
    if (reduced()) endRide();
  }
  function endRide() {
    if (mode !== 'ride') return;
    if (rideHud) rideHud.remove(); if (skipBtn) skipBtn.remove(); rideHud = skipBtn = null;
    rig.dist = savedRig.dist; rig.maxDist = savedRig.maxDist;
    dragon.root.visible = false; mode = 'arena-wait';
    loadArena().then((a) => { event('landed'); mode = 'arena'; a.enter(save); toast(say('shoal.landed')); }).catch((e) => { console.warn('[shoal] arena', e); mode = 'town'; backToStone(); });
  }
  function backToStone() {
    const w = stoneAt.clone().add(new THREE.Vector3(0, 0.2, -3));
    player.teleport([w.x, w.y + 0.2, w.z], Math.PI);
  }
  function flyHome() {
    if (arena) arena.leave();
    mode = 'town'; backToStone();
    if (event('home')) toast(say('shoal.home') + ' ' + say('shoal.reward', { xp: R.REWARD.xp, title: say('shoal.title.' + R.REWARD.title) }));
  }

  // ---- per frame
  function nearXZ(pos, p, r) { return !!p && Math.hypot(pos[0] - p.x, pos[2] - p.z) <= r && Math.abs(pos[1] - p.y) <= 4; }
  function setPrompt(textKey, action) {
    promptAction = action;
    if (!textKey) { prompt.hidden = true; return; }
    prompt.textContent = ''; if (!o.touch || !o.touch()) prompt.append(el('kbd', null, 'E')); prompt.append(doc.createTextNode(say(textKey))); prompt.hidden = false;
  }
  let tAcc = 0, seatT = 0, seatedFor = 0, ownedClass = false;
  function update(dt, t) {
    tAcc += dt;
    if (seatedFor < 3 && (seatT += dt) > 0.5) { seatT = 0; placeAll(); if (seated >= 2) seatedFor += 0.5; } // re-seat until the ground answers
    const lv = level();
    const offered = R.questOffered(save, lv), active = R.questActive(save);
    // the giver's ray: while the quest is offered (or to turn in nothing: it is told at the stone)
    const g = folkAt('shardkeeper');
    giverRay.visible = !!g && offered && mode === 'town';
    if (g) giverRay.position.set(g[0], g[1], g[2]);
    const pulse = reduced() ? 0.35 : 0.22 + 0.16 * (0.5 + 0.5 * Math.sin(tAcc * 2.4));
    for (const r of [giverRay, bladeRay, stoneRay]) r.material.opacity = pulse;
    blade.visible = active && !save.blade && mode === 'town';
    bladeRay.visible = blade.visible;
    stoneRay.visible = mode === 'town' && active && (save.step === 'reach_stone' || save.step === 'ride');
    if (!reduced()) blade.rotation.y += dt * 0.6;
    // the tracker line
    const tk = mode === 'town' ? R.trackerKey(save, lv) : null;
    track.hidden = !tk || !!card;
    if (tk) { track.textContent = ''; track.append(el('small', null, say('shoal.quest')), doc.createTextNode(say(tk))); }
    if (mode === 'town') {
      const pos = player.pos;
      let pk = null, act = null;
      if (offered && g && Math.hypot(pos[0] - g[0], pos[2] - g[2]) <= SPOTS.giver) { pk = 'shoal.prompt.giver'; act = openOffer; }
      else if (blade.visible && nearXZ(pos, bladeAt, SPOTS.radius)) { pk = 'shoal.prompt.blade'; act = () => { if (event('blade')) { toast(say('shoal.blade.got')); ledger && ledger.addXp && ledger.addXp('questStep'); } }; }
      else if (stoneRay.visible && nearXZ(pos, stoneAt, SPOTS.radius + 1.5)) {
        if (save.step === 'reach_stone') event('stone');
        if (dragon.root.visible || landT > 0) { pk = 'shoal.prompt.mount'; act = startRide; }
        else { landT = reduced() ? 2.5 : 0.001; dragon.root.visible = true; }
      }
      setPrompt(pk, act);
      if (landT > 0 && landT < 2.5) { // the dragon lands beside the stone
        landT = Math.min(2.5, landT + dt);
        const k = 1 - landT / 2.5, p = stoneAt.clone().add(new THREE.Vector3(4, 0.5 + 30 * k * k, 2));
        dragon.root.position.copy(p); dragon.root.rotation.set(0, Math.PI, 0); dragon.update(dt, reduced(), 0, true);
      } else if (dragon.root.visible) dragon.update(dt, reduced(), 0, true);
    } else setPrompt(null);
    if (mode === 'ride') {
      const ax = axes();
      ride = R.rideStep(ride, [ax[0] || 0, ax[1] || 0], dt);
      const { O, A } = rideBasis();
      const p = R.rideProgress(ride), k = smooth(0.82, 1, p);
      const x = O.x + ride.x * (1 - k) + (A.x + R.ARENA.landing[0] - O.x) * k;
      const y = (O.y + ride.y - R.RIDE.startY - 24 * p) * (1 - k) + (A.y + 2) * k;
      const z = O.z + ride.z * (1 - k) + (A.z + R.ARENA.landing[1]) * k;
      dragon.root.position.set(x, y, z);
      dragon.root.rotation.set(0, 0, reduced() ? 0 : ride.bank);
      dragon.update(dt, reduced(), ride.bank, false);
      pose.pos.copy(dragon.saddle()); pose.heading = 0; pose.speed = 0; pose.bank = pose.pitch = pose.bob = 0;
      if (rideHud) rideHud.querySelector('b').style.width = Math.round(p * 100) + '%';
      if (ride.done) endRide();
    }
    if (mode === 'arena' && arena) { arena.update(dt, t); arena.pose(pose); }
    const own = mode === 'ride' || mode === 'arena' || mode === 'arena-wait';
    if (own !== ownedClass) { ownedClass = own; doc.body.classList.toggle('gs-owned', own); }
    void t;
  }
  /** E pressed in town (boot-world calls it before its own E): true when the Shoal used it. */
  function interact() {
    if (card) return true;
    if (!prompt.hidden && promptAction) { promptAction(); return true; }
    return false;
  }

  return {
    get mode() { return mode; },
    get save() { return { ...save }; },
    /** True while the ride or the fight owns the heroine (boot-world skips its physics and town input). */
    owns: () => mode === 'ride' || mode === 'arena' || mode === 'arena-wait',
    update, interact,
    /** Input while owned (keys from boot-world's Input). */
    input(input) {
      if (mode === 'arena' && arena) arena.input(input);
    },
    /** The heroine's pose while owned: position, heading, animation speed. */
    applyAvatar(avatar, focus) {
      avatar.position.copy(pose.pos); avatar.rotation.set(pose.pitch || 0, pose.heading, pose.bank || 0); // flight: a lean forward and a bank into the turn
      focus.set(pose.pos.x, pose.pos.y + 1.1 - (pose.bob || 0), pose.pos.z); // the hover bob moves her, not the camera
      return pose.speed;
    },
    /** After the camera rig: the fight's screen shake (the ultimate). */
    shakeCamera(camera, dt) { if (mode === 'arena' && arena && arena.shakeCamera) arena.shakeCamera(camera, dt); },
    skipRide: () => endRide(),
    get arena() { return arena; },
    /** Dev and tests: jump the quest to a step (?shoal=<step>), or boot straight onto the dragon (?shoal=ride) or
     *  into the fight (?shoal=arena: the arena owns the heroine as after the ride). */
    debugStep(step) {
      const r = R.debugJump(save, step);
      if (r.save !== save) { save = r.save; persist(); }
      if (r.jump === 'ride') startRide();
      else if (r.jump === 'arena' && mode === 'town') {
        mode = 'arena-wait';
        loadArena().then((a) => { mode = 'arena'; a.enter(save); toast(say('shoal.landed')); }).catch((e) => { console.warn('[shoal] arena', e); mode = 'town'; });
      }
    },
    dispose() { group.removeFromParent(); dragon.root.removeFromParent(); track.remove(); prompt.remove(); closeCard(); if (arena) arena.dispose(); },
  };
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The great pearl dragon: the model `shoal_dragon` (seven clips mixed by game/shoal-dragon-anim.js, a `saddle` bone
 *  as the rider's socket) once it has loaded; until then a placeholder body with flapping wings and a saddle point. */
function makeDragon(THREE) {
  const root = new THREE.Group(); root.name = 'shoal-dragon';
  const pearl = new THREE.MeshStandardMaterial({ color: 0xeee8f2, roughness: 0.35, metalness: 0.2, emissive: 0x3a3450, emissiveIntensity: 0.25 });
  const body = new THREE.Group(); root.add(body);
  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), pearl); torso.scale.set(1.5, 1.2, 3.6); body.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 3, 10), pearl); neck.position.set(0, 1.2, 3.6); neck.rotation.x = 0.9; body.add(neck);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2, 10), pearl); head.position.set(0, 2.2, 5.2); head.rotation.x = Math.PI / 2; body.add(head);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.7, 6, 10), pearl); tail.position.set(0, 0, -6); tail.rotation.x = -Math.PI / 2; body.add(tail);
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xd9d2ea, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  const wing = (s) => { const pivot = new THREE.Group(); pivot.position.set(1.2 * s, 0.8, 0.6); const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.4), wingMat); m.rotation.x = -Math.PI / 2; m.position.x = 3.5 * s; pivot.add(m); body.add(pivot); return pivot; };
  const wl = wing(-1), wr = wing(1);
  let t = 0, model = null, mixer = null, actions = null, socket = null, socketRest = null, phase = '', phaseT = 0;
  const saddle = new THREE.Object3D(); saddle.position.set(0, 1.25, 0.6); root.add(saddle);
  const tmp = new THREE.Vector3();
  return {
    root,
    saddle: () => { root.updateMatrixWorld(true); return (socket || saddle).getWorldPosition(tmp); },
    useModel(scene, clips = []) {
      model = scene; body.visible = false; root.add(model);
      model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } if (o.name === 'saddle') socket = o; });
      if (socket) { // the socket bone's rest frame against the model: what keeps the saddle upright on the bone
        model.updateMatrixWorld(true);
        const toBone = new THREE.Matrix4().copy(socket.matrixWorld).invert().multiply(model.matrixWorld);
        const at = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(socket.matrixWorld));
        socketRest = toBone.multiply(new THREE.Matrix4().makeTranslation(at.x, at.y, at.z));
      }
      if (clips.length) {
        mixer = new THREE.AnimationMixer(model); actions = {};
        for (const c of clips) { const a = mixer.clipAction(c); a.enabled = true; a.setEffectiveWeight(0); a.play(); actions[c.name] = a; }
        for (const one of ['land', 'takeoff']) if (actions[one]) { actions[one].setLoop(THREE.LoopOnce, 1); actions[one].clampWhenFinished = true; }
      }
    },
    /** The saddle model (its origin is the socket, its axes the dragon's): it rides on the `saddle` bone. */
    useSaddle(scene) {
      if (!socket || !socketRest) return;
      scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; } });
      scene.matrixAutoUpdate = false; scene.matrix.copy(socketRest); socket.add(scene);
    },
    update(dt, reduced, bank, perched) {
      t += dt;
      if (model) {
        const next = perched ? 'land' : 'ride';
        if (next !== phase) { phase = next; phaseT = 0; }
        // reduced motion: no descent and no strokes, the settled poses only (perched idle, a still glide)
        phaseT = reduced ? (perched ? 1e3 : DRAGON_ANIM.takeoff + DRAGON_ANIM.beats + 1) : phaseT + dt;
        const mix = dragonMix(phase, phaseT, bank);
        model.position.y = -(DRAGON_ANIM.hover * (1 - mix.lift) + DRAGON_ANIM.bodyHeight * mix.lift);
        if (mixer) {
          for (const name in actions) { const a = actions[name]; a.setEffectiveWeight(mix.weights[name] || 0); if (name in mix.times) { a.paused = true; a.time = mix.times[name]; } }
          mixer.update(reduced ? 0 : dt);
        }
        return;
      }
      const flap = reduced ? 0.15 : (perched ? 0.12 * Math.sin(t * 1.4) : 0.55 * Math.sin(t * 3.2));
      wl.rotation.z = flap; wr.rotation.z = -flap;
      if (!reduced && !perched) body.position.y = 0.25 * Math.sin(t * 3.2 + 0.6);
    },
  };
}
