// The Glass Shoal arena (docs/plans/boss/glass-shoal-boss.md): the island's scene graph, the Hollow Tide fight and
// its HUD. Imported by scenes/glass-shoal.js only when the dragon ride starts (nothing of it loads before).
// Gameplay seat: geometry, spawn points, the fight. The rendering seat (A2) owns the look: `arena.look` exposes the
// floor, the sun, the fog colour and the glowing parts so its reflector, sky and grade can replace these simple
// materials without touching the rules. The rules are pure (game/shoal-rules.js); this file only runs and draws them.
// Elise's kit ("Elise's kit" in the plan): casts aimed at the cursor (touch: the nearest foe), take-off and flight
// with stamina, and the ultimate Tempest of Embers. Placeholder motion until Fable's clips land: hover = her idle
// pose with a bob, a lean and a bank; the casts reuse the strike clips.
import * as R from '../game/shoal-rules.js';
import { shoalSkillsFor, shoalExtrasFor, comboStep } from '../rpg/shoal-skills.js';
/** The sword clips of the Loomblade combo, per step (null: the old strike stays until its cut is approved). */
export const COMBO_CLIPS = Object.freeze(['slash1', null, null]);
import { hasModelFile, fetchGltf, getModelVariant } from '../render/assets.js';
import { bossAnimStep, freshBossAnim, fadeWeights, BOSS_ANIM, clipOn } from '../game/shoal-boss-anim.js';
import { createAddsView } from './shoal-adds-view.js';
import { createHitFx } from '../render/hit-fx.js';
import { impactOf, IMPACT } from '../render/hit-fx-core.js';
import { cue, cueAt } from '../audio/town-audio.js';
import { ALLY, ALLY_COLOR, freshAllies, alliesStep, allyTarget } from '../game/shoal-allies.js';

const CSS = `
.sa-boss{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 14px);transform:translateX(-50%);width:min(520px,calc(100vw - 32px));z-index:14;color:#f3ead2;font:600 14px/1.2 "Atkinson Hyperlegible",system-ui,sans-serif;text-align:center;text-shadow:0 1px 3px #000;pointer-events:none}
.sa-bar{height:10px;margin-top:4px;border-radius:5px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.25);overflow:hidden;position:relative}.sa-bar b{display:block;height:100%;background:linear-gradient(90deg,#7fd8ff,#b48bff);transition:width .15s}
.sa-bar i{position:absolute;top:0;bottom:0;width:2px;background:rgba(255,255,255,.7)}
.sa-boss.sa-open b{background:linear-gradient(90deg,#ffd27a,#ff8a3a)}
.sa-me{position:fixed;left:calc(env(safe-area-inset-left,0px) + 16px);top:calc(env(safe-area-inset-top,0px) + 14px);width:min(220px,40vw);z-index:14;color:#f3ead2;font:12px/1.2 system-ui,sans-serif;text-shadow:0 1px 2px #000;pointer-events:none}
.sa-me .sa-bar{height:8px;margin:2px 0 6px}.sa-hp b{background:#e05a5a!important}.sa-st b{background:#e8c860!important}.sa-mp b{background:#5a9ce0!important}.sa-ul b{background:linear-gradient(90deg,#ff8a3a,#c8f0ff)!important;transition:none}
.sa-me.sa-ready .sa-ul{box-shadow:0 0 8px #ffb060}
.sa-skills{position:fixed;right:calc(env(safe-area-inset-right,0px) + 16px);bottom:calc(env(safe-area-inset-bottom,0px) + 16px);display:grid;grid-template-columns:repeat(3,64px);grid-auto-rows:64px;gap:8px;z-index:14}
.sa-skill{position:relative;box-sizing:border-box;width:100%;height:100%;border-radius:14px;border:1px solid rgba(246,200,96,.7);background:rgba(18,14,8,.8);color:#f6e2a8;font:600 11px/1.1 system-ui,sans-serif;cursor:pointer;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;padding:4px}
.sa-skill span{position:relative}
.sa-skill kbd{position:absolute;left:4px;top:3px;font:600 10px system-ui;opacity:.75}.sa-skill s{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);text-decoration:none}
.sa-skill u{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(0deg,rgba(255,138,58,.55),rgba(200,240,255,.25));text-decoration:none}
.sa-skill.sa-ultb{grid-column:span 2;font-size:13px}
.sa-skill.sa-ultb.sa-ready{border-color:#ffd27a;color:#fff;box-shadow:0 0 14px rgba(255,170,80,.85);animation:sa-pulse 1.2s ease-in-out infinite}
.sa-skill.sa-on{border-color:#c8f0ff;color:#fff;background:rgba(40,70,90,.85)}
.sa-skill.sa-down{transform:scale(.94)}
@keyframes sa-pulse{50%{box-shadow:0 0 24px rgba(255,190,100,1)}}
body.ts-touch .sa-skill kbd{display:none}@media (pointer:coarse){.sa-skill kbd{display:none}}
.sa-exit{position:fixed;left:calc(env(safe-area-inset-left,0px) + 16px);top:calc(env(safe-area-inset-top,0px) + 132px);z-index:14;min-height:40px;padding:6px 14px;border-radius:10px;border:1px solid rgba(246,200,96,.7);background:rgba(18,14,8,.8);color:#f6e2a8;font:600 13px system-ui,sans-serif;cursor:pointer}
.sa-exit.sa-next{border-color:#ffd27a;color:#fff;background:rgba(80,60,20,.9)}
.sa-msg{position:fixed;left:50%;top:32%;transform:translateX(-50%);z-index:15;color:#ffe6a6;font:700 22px system-ui,sans-serif;text-shadow:0 2px 6px #000;pointer-events:none;text-align:center;max-width:calc(100vw - 32px)}
.sa-hint{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 18px);transform:translateX(-50%);z-index:14;color:#f3ead2;font:500 13px/1.3 system-ui,sans-serif;text-shadow:0 1px 3px #000;pointer-events:none;text-align:center;max-width:calc(100vw - 260px);opacity:.9}
@media (max-width:899px){.sa-boss{left:auto;right:12px;transform:none;width:calc(58vw - 12px)}.sa-me{width:36vw}.sa-skills{grid-template-columns:repeat(3,58px);grid-auto-rows:58px}.sa-hint{display:none}}
@media (max-height:440px){.sa-skills{grid-template-columns:repeat(3,54px);grid-auto-rows:54px;gap:6px}.sa-msg{top:22%;font-size:18px}}
@media (prefers-reduced-motion:reduce){.sa-skill.sa-ultb.sa-ready{animation:none}}
html[data-motion=reduce] .sa-skill.sa-ultb.sa-ready{animation:none}
`;

/**
 * @param {object} o
 * @param {typeof import('three')} o.THREE @param {object} o.scene @param {object} o.center the arena's world centre (Vector3)
 * @param {object} [o.camera] the camera (the cursor aim) @param {(k: string, a?: object) => string} o.say
 * @param {(s: string) => void} o.toast @param {() => boolean} o.reduced
 * @param {boolean} o.mobile @param {() => string} o.hero @param {(name: string) => void} o.clip @param {() => number[]} o.axes
 * @param {object} o.rig the camera rig (ground axes) @param {() => void} o.onWin @param {() => void} o.onDeath @param {() => void} o.onHome
 */
export function createShoalArena(o) {
  const { THREE, scene, center, camera = null, say, reduced, mobile, hero, clip, axes, rig, onWin, onDeath, onHome } = o;
  // the heroine's own companion dragons (their world positions, kinds and a flourish), when the chain says she has any
  const allies = typeof o.allies === 'function' ? o.allies : () => [];
  const doc = globalThis.document;
  if (!doc.getElementById('sa-css')) { const st = doc.createElement('style'); st.id = 'sa-css'; st.textContent = CSS; doc.head.append(st); }
  const root = new THREE.Group(); root.name = 'glass-shoal'; root.position.copy(center); root.visible = false; scene.add(root);

  // ---- the scene graph (A2 restyles these through `look`)
  const look = {};
  look.floor = new THREE.Mesh(new THREE.CircleGeometry(R.ARENA.radius + 60, 96), new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.12, metalness: 0.55 }));
  look.floor.rotation.x = -Math.PI / 2; look.floor.receiveShadow = true; root.add(look.floor);
  look.rim = new THREE.Mesh(new THREE.RingGeometry(R.ARENA.radius - 0.4, R.ARENA.radius, 96), new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.25, depthWrite: false }));
  look.rim.rotation.x = -Math.PI / 2; look.rim.position.y = 0.03; root.add(look.rim);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5e5a56, roughness: 0.9 });
  look.monoliths = R.ARENA.monoliths.map(([x, z], i) => { const h = 5 + (i % 3) * 2.5; const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, h, 1.4), stoneMat); m.position.set(x, h / 2 - 0.3, z); m.rotation.set(0.05 * (i % 2 ? 1 : -1), i * 0.9, 0.08 * ((i % 3) - 1)); m.castShadow = true; root.add(m); return m; });
  const crystal = new THREE.MeshStandardMaterial({ color: 0x9fdcff, emissive: 0x3a8cff, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 });
  look.spires = R.ARENA.spires.map(([x, z], i) => { const h = 14 + (i % 4) * 6; const m = new THREE.Mesh(new THREE.ConeGeometry(2 + (i % 2), h, 6), crystal); m.position.set(x, h / 2 - 1, z); root.add(m); return m; });
  look.lamp = new THREE.Group();
  { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 4.2, 8), new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.7, roughness: 0.4 })); post.position.y = 2.1;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 })); bulb.position.y = 4.3;
    look.lamp.add(post, bulb); if (!mobile) { const l = new THREE.PointLight(0xffc98a, 6, 18, 2); l.position.y = 4.3; look.lamp.add(l); }
    look.lamp.position.set(R.ARENA.lamp[0], 0, R.ARENA.lamp[1]); root.add(look.lamp); }
  look.sun = new THREE.DirectionalLight(0xffd2a0, 1.6); look.sun.position.set(-60, 30, -80); look.sun.target = look.floor; root.add(look.sun);
  look.fill = new THREE.HemisphereLight(0xbcd4ff, 0x4a4038, 0.7); root.add(look.fill);
  look.fog = 0xd8c8b8;
  /** Spawn points (arena-local [x, z]) for the rendering seat and the models seat. */
  const spawns = { landing: R.ARENA.landing, boss: R.ARENA.boss, chest: R.ARENA.chest, pickups: R.ARENA.pickups };

  // the Hollow Tide: a segmented serpent rising out of the mirror (placeholder until the boss model lands)
  const boss = new THREE.Group(); boss.position.set(R.ARENA.boss[0], 0, R.ARENA.boss[1]); root.add(boss);
  const hide = new THREE.MeshStandardMaterial({ color: 0x3e4a5a, roughness: 0.6, metalness: 0.3 });
  const segs = []; for (let i = 0; i < 9; i++) { const r = 2.6 - i * 0.18; const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), hide); s.castShadow = true; boss.add(s); segs.push(s); }
  const crestMat = new THREE.MeshStandardMaterial({ color: 0x9fdcff, emissive: 0x2a6cff, emissiveIntensity: 0.6, roughness: 0.2 });
  const crest = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.2, 6), crestMat); boss.add(crest);
  look.crest = crestMat;
  // the model `hollow_tide` (art/shoal/boss): its clips follow the fight through game/shoal-boss-anim.js
  let bossModel = null, bossMixer = null, bossActions = null, bossAnim = freshBossAnim(), bossGlow = [];
  const bossW = {};
  if (hasModelFile('hollow_tide')) {
    const lite = 'hollow_tide' + getModelVariant();
    fetchGltf(hasModelFile(lite) ? lite : 'hollow_tide').then(({ gltf }) => {
      for (const s of segs) s.visible = false; crest.visible = false;
      bossModel = gltf.scene; boss.add(bossModel);
      bossModel.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; if (o.material && o.material.emissiveMap) bossGlow.push({ m: o.material, base: o.material.emissiveIntensity }); } });
      if (gltf.animations.length) {
        bossMixer = new THREE.AnimationMixer(bossModel); bossActions = {};
        for (const c of gltf.animations) { const a = bossMixer.clipAction(c); a.setEffectiveWeight(0); a.play(); a.paused = true; bossActions[c.name] = a; }
      }
    }).catch(() => {});
  }
  // telegraphs: the ground ring (slam), the band (sweep), the charge line (lunge)
  const teleMat = () => new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 1, 48), teleMat()); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.visible = false; root.add(ring);
  const band = new THREE.Mesh(new THREE.RingGeometry(R.BOSS.attacks.sweep.inner, R.BOSS.attacks.sweep.radius, 64), teleMat()); band.rotation.x = -Math.PI / 2; band.position.set(R.ARENA.boss[0], 0.05, R.ARENA.boss[1]); band.visible = false; root.add(band);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(R.BOSS.attacks.lunge.width, R.BOSS.attacks.lunge.length), teleMat()); line.geometry.rotateX(-Math.PI / 2); line.geometry.translate(0, 0, R.BOSS.attacks.lunge.length / 2); line.position.y = 0.05; line.visible = false; root.add(line);
  // the ice dragon's: a cone of breath and the arc of its claws, flat fans opening along +z (rotated to her at the telegraph)
  const fan = (radius, half, color) => { const g = new THREE.CircleGeometry(radius, 40, Math.PI / 2 - half, half * 2); g.rotateX(-Math.PI / 2); g.scale(1, 1, -1); const m = new THREE.Mesh(g, teleMat()); m.material.color.setHex(color); m.position.y = 0.06; m.visible = false; root.add(m); return m; };
  const breathFan = fan(R.BOSS.attacks.breath.length, R.BOSS.attacks.breath.half, 0x9fe8ff), clawFan = fan(R.BOSS.attacks.claw.radius, R.BOSS.attacks.claw.half, 0xff7a3a);
  // pickups, adds, projectiles, the chest
  const orbMat = { hp: new THREE.MeshBasicMaterial({ color: 0x6aff9a }), stamina: new THREE.MeshBasicMaterial({ color: 0xffe066 }) };
  const orbs = new Map(R.ARENA.pickups.map((p) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), orbMat[p.kind]); m.position.set(p.at[0], 1, p.at[1]); root.add(m); return [p.id, m]; }));
  const addsView = createAddsView(root); // the Hollow Tide's spawn: the model `shoal_tideling`, one clone per add (scenes/shoal-adds-view.js)
  const shots = [];
  const chest = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.8, roughness: 0.3, emissive: 0x6a4a10, emissiveIntensity: 0.5 }));
  chest.position.set(R.ARENA.chest[0], 0.45, R.ARENA.chest[1]); chest.visible = false; root.add(chest);
  // projectiles and the Tempest's spiral share these
  const orbGeo = new THREE.SphereGeometry(0.32, 10, 8), discGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.06, 20);
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff8a3a }), windMat = new THREE.MeshBasicMaterial({ color: 0xc8f0ff, transparent: true, opacity: 0.8 });
  const SPIRAL = 16;
  const spiral = new THREE.Group(); spiral.visible = false; root.add(spiral);
  const spiralBits = Array.from({ length: SPIRAL }, (_, i) => { const m = new THREE.Mesh(i % 2 ? discGeo : orbGeo, i % 2 ? windMat : fireMat); spiral.add(m); return m; });
  const burst = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  burst.rotation.x = -Math.PI / 2; burst.position.y = 0.08; root.add(burst);
  // the aim: a small ring on the mirror where her casts will fly (cursor or the nearest foe)
  const aimMark = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.65, 32), new THREE.MeshBasicMaterial({ color: 0xffe6a6, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  aimMark.rotation.x = -Math.PI / 2; aimMark.position.y = 0.06; aimMark.visible = false; root.add(aimMark);
  // impact effects (night 14.11, render/hit-fx.js, pooled): ember blooms, gale shards, the Loomblade's arcs, the boss's
  // slams on the mirror, and the camera kick of the blows (added in shakeCamera). Sounds through audio/town-audio.js.
  const fx = createHitFx({ THREE, parent: root, doc, scale: mobile ? 0.6 : 1 });
  let bossFlashT = 0;
  /** A blow of `src` (hit-fx-core IMPACT) landing at `at` (arena-local): the look, a short shake, its hit-stop. */
  function landFx(src, at, kill = false, color = null) {
    const red = reduced(), imp = impactOf(src, { radius: 0.7, kill, reduced: red });
    if (color != null) imp.color = color;
    const dx = at[0] - me3.x, dz = at[2] - me3.z, l = Math.hypot(dx, dz) || 1;
    fx.impact(at, [dx / l, dz / l], imp, 0);
    if (imp.shake > 0) { if (shakeT <= 0) shakeAmp = 0; shakeAmp = Math.max(shakeAmp, imp.shake * 0.5); shakeT = 0.22; }
    if (!red && imp.stop) stopT = Math.max(stopT, imp.stop);
  }
  // ---- the dragon allies (game/shoal-allies.js): a small bolt each every few seconds at the nearest foe
  let allyTimers = [];
  const allyGeo = new THREE.SphereGeometry(0.2, 8, 6), _ap = new THREE.Vector3();
  function allyShoot(a) {
    if (!a || !a.pos) return;
    _ap.copy(a.pos).sub(root.position);
    const tgt = allyTarget([_ap.x, _ap.z], B.adds, R.ARENA.boss, R.BOSS.contact, !B.dead); if (!tgt) return;
    const color = ALLY_COLOR[a.kind] || IMPACT.dragon.color;
    const dx = tgt.at[0] - _ap.x, dz = tgt.at[1] - _ap.z, dist = Math.hypot(dx, dz) || 1;
    const mesh = new THREE.Mesh(allyGeo, new THREE.MeshBasicMaterial({ color })); mesh.position.copy(_ap); root.add(mesh);
    const s = { id: 'ally', ally: true, src: 'dragon', color, speed: ALLY.speed, radius: ALLY.radius, damage: ALLY.damage, range: dist + 6, pierce: false, hitCue: a.kind === 'cinder' ? 'ember_hit' : 'hit_frost' };
    shots.push({ s, mesh, x: _ap.x, y: _ap.y, z: _ap.z, dx: dx / dist, dz: dz / dist, vy: ((1.4 - _ap.y) / dist) * ALLY.speed, left: s.range, hitBoss: false, hit: new Set() });
    fx.burst([_ap.x, _ap.y, _ap.z], color, 3, 0.35);
    cueAt(a.kind === 'cinder' ? 'ember_cast' : 'gale_cast', null, 0.45);
    if (a.flourish) a.flourish();
  }
  /** Where a blow reaches the serpent: its body on her side, at chest height. */
  function bossHitAt(y = 2) {
    const dx = me3.x - R.ARENA.boss[0], dz = me3.z - R.ARENA.boss[1], l = Math.hypot(dx, dz) || 1, r = R.BOSS.contact * 0.6;
    return [R.ARENA.boss[0] + dx / l * r, y, R.ARENA.boss[1] + dz / l * r];
  }

  // ---- HUD
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const hud = el('div'); hud.hidden = true; doc.body.append(hud);
  const bossHud = el('div', 'sa-boss'); const bossName = el('div'); const bossBar = el('div', 'sa-bar'); const bossFill = el('b'); bossBar.append(bossFill);
  for (const p of R.BOSS.phases.slice(1)) { const i = el('i'); i.style.left = (p.above * 100) + '%'; bossBar.append(i); }
  bossHud.append(bossName, bossBar); hud.append(bossHud);
  const me = el('div', 'sa-me'); const bars = {}; const barRows = {};
  for (const [k, cls] of [['hp', 'sa-hp'], ['stamina', 'sa-st'], ['mana', 'sa-mp'], ['ult', 'sa-ul']]) { const lab = el('div', null, say('shoal.' + k)); const b = el('div', 'sa-bar ' + cls); const fill = el('b'); b.append(fill); me.append(lab, b); bars[k] = fill; barRows[k] = [lab, b]; }
  hud.append(me);
  const skillsEl = el('div', 'sa-skills'); hud.append(skillsEl);
  const msg = el('div', 'sa-msg'); msg.hidden = true; hud.append(msg);
  const hint = el('div', 'sa-hint'); hint.hidden = true; hud.append(hint);
  // the way out, always on screen (touch has no E): Leave the Shoal mid-fight; after the win, Open the chest, then Fly home
  const exitBtn = el('button', 'sa-exit'); exitBtn.type = 'button'; hud.append(exitBtn);
  exitBtn.addEventListener('click', () => { if (!active) return; if (won && !chestOpen) openChest(); else onHome(); });
  let msgT = 0, hintT = 0;
  const flash = (text, secs = 2.2) => { msg.textContent = text; msg.hidden = false; msgT = secs; };
  let skillBtns = [], liftBtn = null, ultBtn = null;
  function buildSkills() {
    skillsEl.textContent = ''; skillBtns = []; liftBtn = ultBtn = null;
    const keyCap = (k) => (k === 'Space' ? '␣' : k);
    // Elise: Lift and the Tempest on the top row (the Tempest twice as wide), her three casts under them
    for (const s of shoalExtrasFor(hero())) {
      const b = el('button', 'sa-skill' + (s.kind === 'ultimate' ? ' sa-ultb' : ' sa-liftb')); b.type = 'button'; b.dataset.skill = s.id;
      b.setAttribute('aria-label', say('shoal.skill.' + s.id));
      if (s.kind === 'ultimate') { b.append(el('u'), el('kbd', null, keyCap(s.key)), el('span', null, say('shoal.skill.' + s.id))); ultBtn = b; b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); ult(); }); }
      else {
        b.append(el('kbd', null, keyCap(s.key)), el('span', null, say('shoal.skill.' + s.id))); liftBtn = b;
        // touch: hold to rise, let go to sink slowly; a mouse click toggles (take off / land)
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
          if (e.pointerType === 'mouse') { toggleLift(); return; }
          touchFlight = true; liftHeld = true; b.classList.add('sa-down'); if (!R.airborne(FL)) takeOffNow();
        });
        const up = () => { liftHeld = false; b.classList.remove('sa-down'); };
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      }
      skillsEl.append(b);
    }
    for (const s of shoalSkillsFor(hero())) {
      const b = el('button', 'sa-skill'); b.type = 'button'; b.dataset.skill = s.id;
      b.append(el('kbd', null, keyCap(s.key)), el('span', null, say('shoal.skill.' + s.id)), el('s'));
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (e.pointerType !== 'mouse') touchAim = true; use(s); });
      skillsEl.append(b); skillBtns.push({ b, s });
    }
    const eliseOn = hero() === 'elise';
    for (const n of barRows.ult) n.hidden = !eliseOn;
  }

  // ---- fight state
  let H = R.freshHero(), B = R.freshBoss(), timers = {}, active = false, won = false, chestOpen = false;
  let FL = R.freshFlight();
  const me3 = { x: R.ARENA.landing[0], z: R.ARENA.landing[1], heading: Math.PI, speed: 0, lift: 0, dodgeDir: [0, -1] };
  let combo = 0, comboT = 0, heavyT = 0, deadT = 0;
  let kbVert = 0, liftHeld = false, touchFlight = false, landing = false, lastJump = -9, touchAim = false;
  let ultT = 0, ultEl = 0, ultGrounded = false, stopT = 0, shakeT = 0, shakeAmp = 0, burstT = 0, wasReady = false;
  let hover = null; // the mouse over the canvas (client px), from input()
  const elise = () => hero() === 'elise';

  function enter(save) {
    root.visible = true; hud.hidden = false; active = true; buildSkills();
    won = save && (save.step === 'return' || save.step === 'done');
    B = won ? { ...R.freshBoss(2), hp: 0, dead: true } : R.freshBoss(0); H = R.freshHero(); timers = {}; FL = R.freshFlight();
    me3.x = R.ARENA.landing[0]; me3.z = R.ARENA.landing[1]; me3.heading = Math.PI; me3.lift = 0;
    ultT = 0; stopT = 0; shakeT = 0; landing = false; spiral.visible = false;
    chest.visible = won; chestOpen = false; boss.visible = !won; bossAnim = freshBossAnim(won);
    bossName.textContent = say('shoal.boss') + ' · ' + say('shoal.phase', { n: B.phase + 1 });
    if (elise() && !won) { hint.textContent = say(mobile ? 'shoal.flyHintTouch' : 'shoal.flyHint'); hint.hidden = false; hintT = 14; }
  }
  function leave() { fx.still(); root.visible = false; hud.hidden = true; active = false; for (const s of shots) s.mesh.removeFromParent(); shots.length = 0; spiral.visible = false; }

  const bossDist = () => Math.hypot(me3.x - R.ARENA.boss[0], me3.z - R.ARENA.boss[1]);
  const faceBoss = () => { if (bossDist() < 14) me3.heading = Math.atan2(R.ARENA.boss[0] - me3.x, R.ARENA.boss[1] - me3.z); };
  const charge = (dealt, taken) => { H = { ...H, ult: R.chargeUlt(H.ult, dealt, taken) }; };
  const damageBoss = (amount, opts = {}) => {
    const r = R.hitBoss(B, amount, R.BOSS, opts); B = r.boss;
    if (!opts.noCharge) charge(r.dealt, 0);
    if (r.dealt > 0) bossFlashT = 0.12;
    if (r.phaseUp) { flash(say(B.phase === 1 ? 'shoal.phase2' : 'shoal.phase3')); cue('storm_crack'); shakeT = 0.3; shakeAmp = reduced() ? 0 : 0.3; } // the roar
    if (B.dead && !won) { won = true; boss.visible = !!bossModel; /* the model falls and sinks first (draw hides it) */ chest.visible = true; addsView.clear(); B = { ...B, adds: [] }; flash(say('shoal.victory'), 3.5); onWin(); }
    return r.dealt;
  };
  const hurt = (amount) => { const r = R.hitHero(H, amount); H = r.hero; if (r.taken) { charge(0, r.taken); cue('iris_hurt'); } return r; };

  // ---- aim: the cursor's point on the mirror (desktop), else the nearest foe (touch)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
  function screenAim(x, y) {
    if (!camera || !globalThis.innerWidth) return null;
    ndc.set((x / globalThis.innerWidth) * 2 - 1, -(y / globalThis.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    plane.constant = -center.y;
    if (!ray.ray.intersectPlane(plane, hitP)) { // above the horizon: straight ahead along the camera
      const d = ray.ray.direction; const l = Math.hypot(d.x, d.z) || 1; return [me3.x + (d.x / l) * 30, me3.z + (d.z / l) * 30];
    }
    const lx = hitP.x - center.x, lz = hitP.z - center.z;
    const d = Math.hypot(lx - me3.x, lz - me3.z);
    if (d > 60) return [me3.x + ((lx - me3.x) / d) * 60, me3.z + ((lz - me3.z) / d) * 60];
    return [lx, lz];
  }
  function aimPoint() {
    if (!touchAim && hover) { const p = screenAim(hover.x, hover.y); if (p) return p; }
    return R.autoAim([me3.x, me3.z], B.adds);
  }

  function use(s) {
    if (!active || deadT > 0 || ultT > 0) return;
    if (won) { interact(); return; }
    if (s.kind === 'movement') {
      const h2 = R.startDodge(H); if (h2 === H) return; H = h2;
      const ax = axes(); const { fwd, right } = rig.groundAxes();
      let dx = fwd.x * (ax[1] || 0) + right.x * (ax[0] || 0), dz = fwd.y * (ax[1] || 0) + right.y * (ax[0] || 0);
      if (!dx && !dz) { dx = -Math.sin(me3.heading); dz = -Math.cos(me3.heading); }
      const d = Math.hypot(dx, dz) || 1; me3.dodgeDir = [dx / d, dz / d];
      clip('dash'); cue('dash_whoosh'); return;
    }
    const h2 = R.useSkill(H, s); if (!h2) return; H = h2;
    if (s.kind === 'ranged') {
      const at = aimPoint(); me3.heading = Math.atan2(at[0] - me3.x, at[1] - me3.z);
      if (s.id === 'ember_palms') { for (const side of [-1, 1]) shoot(s, side * 0.35, 0, at); clip('strike1'); cue('ember_cast'); }
      else if (s.id === 'gale_discs') { for (let k = 0; k < s.count; k++) shoot(s, 0, (k - (s.count - 1) / 2) * s.spread, at); clip('strike2'); cue('gale_cast'); }
      return;
    }
    faceBoss();
    if (s.id === 'loom_combo') {
      combo = comboT > 0 ? combo + 1 : 1; comboT = 0.9;
      // the Loomblade's own cuts where they exist (art/anim/iris_combat.py), the old strikes otherwise (Elise, older files)
      const i = comboStep(combo); if (!(COMBO_CLIPS[i] && clip(COMBO_CLIPS[i]))) clip('strike' + (i + 1));
      melee(s.range, s.damage[i], false, i);
    } else if (s.id === 'loom_heavy') { heavyT = s.windup; clip('strike3'); cue('cast_charge_frost'); }
  }
  function melee(range, dmg, heavy = false, step = 0) {
    const fx0 = Math.sin(me3.heading), fz0 = Math.cos(me3.heading);
    const hx = me3.x + fx0 * range * 0.6, hz = me3.z + fz0 * range * 0.6;
    // the blade's arc: the combo cuts right, left, then a rising finisher; the heavy slash a wide, slower crescent
    const src = heavy ? 'blade_heavy' : 'blade', onBoss = bossDist() <= R.BOSS.contact + range;
    fx.slash([me3.x, 1.15 + me3.lift, me3.z], me3.heading, range * (heavy ? 1.1 : 0.9), IMPACT[src].color, heavy ? 1 : step % 2 ? -1 : 1, heavy ? 0 : step === 2 ? -0.5 : 0.15, heavy ? 0.28 : 0.2);
    cue(heavy ? 'strike_heavy' : 'strike_swing');
    if (onBoss) { damageBoss(dmg); landFx(src, bossHitAt(1.6)); cue(heavy ? 'strike_heavy' : 'strike_impact'); }
    const near = B.adds.filter((a) => Math.hypot(a.x - hx, a.z - hz) <= range + 0.8);
    const h = R.hitAdds(B.adds, [hx, hz], range, dmg); B = { ...B, adds: h.adds }; if (h.hit) charge(dmg * h.hit * R.BOSS.armor, 0);
    if (h.hit) { const left = new Set(h.adds.map((a) => a.id)); for (const a of near) landFx(src, [a.x, 0.9, a.z], !left.has(a.id)); if (!onBoss) cue('strike_impact'); }
  }
  function shoot(s, offset, angle, at) {
    const h = me3.heading + angle, dx = Math.sin(h), dz = Math.cos(h);
    const mesh = new THREE.Mesh(s.id === 'gale_discs' ? discGeo : orbGeo, s.id === 'gale_discs' ? windMat : fireMat);
    const x = me3.x + Math.cos(me3.heading) * offset, z = me3.z - Math.sin(me3.heading) * offset, y = 1.3 + me3.lift;
    // from the air the casts dip toward the mirror where she aims (the adds walk there); at the boss they stay level
    const dist = Math.max(4, Math.hypot(at[0] - me3.x, at[1] - me3.z));
    const atBoss = Math.hypot(at[0] - R.ARENA.boss[0], at[1] - R.ARENA.boss[1]) < R.BOSS.contact + 2;
    const vy = atBoss ? 0 : ((1 - y) / dist) * s.speed;
    mesh.position.set(x, y, z); root.add(mesh);
    shots.push({ s, mesh, x, y, z, dx, dz, vy, left: s.range, hitBoss: false, hit: new Set() });
  }
  function openChest() { chestOpen = true; chest.rotation.x = -0.001; flash(say('shoal.reward', { xp: R.REWARD.xp, title: say('shoal.title.' + R.REWARD.title) }), 4); }
  function interact() {
    if (!won) return false;
    if (!chestOpen && Math.hypot(me3.x - R.ARENA.chest[0], me3.z - R.ARENA.chest[1]) < 3) { openChest(); return true; }
    if (chestOpen || Math.hypot(me3.x - R.ARENA.landing[0], me3.z - R.ARENA.landing[1]) < 4) { onHome(); return true; }
    return false;
  }

  // ---- Elise: flight and the Tempest
  function takeOffNow() {
    if (!elise() || deadT > 0 || ultT > 0 || R.airborne(FL)) return;
    const f2 = R.takeOff(FL, H, me3.lift);
    if (f2 === FL) { flash(say('shoal.tired'), 1.2); return; }
    FL = f2; landing = false; H = { ...H, dodge: 0 }; // the hop turns into flight
  }
  function toggleLift() {
    if (!elise()) return;
    if (R.airborne(FL)) { if (FL.mode === 'fly') landing = true; }
    else { touchFlight = false; takeOffNow(); }
  }
  function ult() {
    if (!elise() || !active || won || deadT > 0 || ultT > 0) return;
    const h2 = R.startUlt(H); if (h2 === H) return; H = h2;
    ultT = R.ULT.duration; ultEl = 0; ultGrounded = !R.airborne(FL) || landing;
    if (!R.airborne(FL)) FL = { ...R.freshFlight(), mode: 'fly', y: me3.lift };
    landing = false; spiral.visible = true; clip('strike3'); flash(say('shoal.tempest'), 1.6);
  }
  function tempestPulse() {
    if (!won && R.inTempest([me3.x, me3.z], R.ARENA.boss, R.BOSS.contact)) damageBoss(R.ULT.damage, { pierce: true, noCharge: true });
    if (B.adds.length) B = { ...B, adds: R.hitAdds(B.adds, [me3.x, me3.z], R.ULT.radius, R.ULT.damage).adds };
    const red = reduced();
    stopT = red ? 0 : R.ULT.hitStop; shakeT = 0.22; shakeAmp = red ? 0 : R.ULT.shake; burstT = 0.35;
    cue('ember_hit');
  }

  function strikeLands(atk, damage) {
    // the boss's blow lands: a shock on the mirror where it does, and the slam's sound
    const A = R.BOSS.attacks[atk.kind];
    if (A && atk.kind === 'slam' && atk.at) fx.shock([atk.at[0], 0, atk.at[1]], 0xff9a5a, A.radius);
    else if (A && atk.kind === 'sweep') fx.shock([R.ARENA.boss[0], 0, R.ARENA.boss[1]], 0xff9a5a, A.radius);
    else if (A && atk.kind === 'lunge' && atk.at && atk.dir) fx.shock([atk.at[0] + atk.dir[0] * A.length * 0.5, 0, atk.at[1] + atk.dir[1] * A.length * 0.5], 0xff9a5a, A.width * 1.2);
    else if (A && atk.kind === 'dive' && atk.at) { fx.shock([atk.at[0], 0, atk.at[1]], 0x9fe8ff, A.radius); shakeT = 0.22; shakeAmp = reduced() ? 0 : 0.25; }
    else if (A && atk.kind === 'breath' && atk.dir) fx.shock([atk.at[0] + atk.dir[0] * A.length * 0.6, 0, atk.at[1] + atk.dir[1] * A.length * 0.6], 0x9fe8ff, A.length * 0.4);
    else if (A && atk.kind === 'claw' && atk.dir) fx.shock([atk.at[0] + atk.dir[0] * A.radius * 0.6, 0, atk.at[1] + atk.dir[1] * A.radius * 0.6], 0xff9a5a, A.radius * 0.5);
    cue(atk.kind === 'breath' ? 'cast_release_frost' : atk.kind === 'claw' ? 'strike_heavy' : 'mob_hulker_slam');
    if (!R.inDanger(atk, me3.x, me3.z, R.BOSS, me3.lift)) return;
    const real = H.dodge > 0; // a dodge's frames open the crest; the Tempest's do not
    const r = hurt(damage);
    if (r.dodged && real) { B = R.exposeBoss(B); flash(say('shoal.weak'), 1.4); }
  }

  function update(dt) {
    if (!active) return;
    if (msgT > 0 && (msgT -= dt) <= 0) msg.hidden = true;
    if (hintT > 0 && (hintT -= dt) <= 0) hint.hidden = true;
    let sdt = dt; if (stopT > 0) { stopT -= dt; sdt = dt * 0.06; } // the Tempest's hit-stop
    let drain = 0;
    if (comboT > 0) comboT -= sdt;
    if (heavyT > 0 && (heavyT -= sdt) <= 0) { const s = shoalSkillsFor('iris')[1]; melee(s.range, s.damage, true); }
    if (deadT > 0) { if ((deadT -= dt) <= 0) { const r = R.respawnAfterDeath(B); B = r.boss; H = r.hero; FL = R.freshFlight(); me3.lift = 0; landing = false; me3.x = r.at[0]; me3.z = r.at[1]; addsView.clear(); } }
    else {
      // movement: running on the mirror, or flying
      const ax = axes(); const { fwd, right } = rig.groundAxes();
      let wx = fwd.x * (ax[1] || 0) + right.x * (ax[0] || 0), wz = fwd.y * (ax[1] || 0) + right.y * (ax[0] || 0);
      const wl = Math.hypot(wx, wz);
      if (wl > 1) { wx /= wl; wz /= wl; }
      if (ultT > 0) { wx = 0; wz = 0; }
      if (H.dodge > 0) { wx = me3.dodgeDir[0] * R.HERO.dodgeSpeed; wz = me3.dodgeDir[1] * R.HERO.dodgeSpeed; }
      else if (R.airborne(FL)) {
        const vert = ultT > 0 ? (FL.y < R.ULT.rise ? 1 : 0) : landing ? -1 : kbVert || (touchFlight ? (liftHeld ? 1 : R.releaseVert()) : 0);
        const before = FL.mode;
        const r = R.flightStep(FL, [wx, wz], vert, ultT > 0 ? R.HERO.stamina : H.stamina, sdt);
        FL = r.flight; drain = ultT > 0 ? 0 : r.drain;
        if (before === 'fly' && FL.mode === 'glide') flash(say('shoal.tired'), 1.4);
        if (r.landed) { landing = false; touchFlight = false; }
        wx = FL.vx; wz = FL.vz;
        if (Math.hypot(wx, wz) > 0.4 && ultT <= 0) me3.heading = Math.atan2(wx, wz);
      } else if (wl > 0) { const sp = R.HERO.speed * (heavyT > 0 ? 0.2 : 1); wx *= sp; wz *= sp; me3.heading = Math.atan2(wx, wz); }
      let nx = me3.x + wx * sdt, nz = me3.z + wz * sdt;
      // the body blocks her
      const bd = Math.hypot(nx - R.ARENA.boss[0], nz - R.ARENA.boss[1]);
      if (!won && bd < R.BOSS.contact - 1.5) { const k = (R.BOSS.contact - 1.5) / (bd || 1); nx = R.ARENA.boss[0] + (nx - R.ARENA.boss[0]) * k; nz = R.ARENA.boss[1] + (nz - R.ARENA.boss[1]) * k; }
      [me3.x, me3.z] = R.clampToArena(nx, nz);
      me3.speed = Math.hypot(wx, wz);
      if (R.airborne(FL)) me3.lift = FL.y;
      else { const liftTo = elise() && H.dodge > 0 ? 2.4 : 0; me3.lift += (liftTo - me3.lift) * Math.min(1, sdt * 10); }
      // pickups (orbs float a metre up: high flight passes over them)
      timers = R.pickupsTick(timers, sdt);
      const p = me3.lift < 2.2 ? R.pickupAt(timers, me3.x, me3.z) : null; if (p) { H = R.pickUp(H, p.kind); timers = { ...timers, [p.id]: R.HERO.pickupRespawn }; }
      // the Tempest
      if (ultT > 0) {
        const t0 = ultEl; ultEl += sdt; ultT -= sdt;
        for (let n = R.ultPulses(t0, ultEl); n > 0; n--) tempestPulse();
        if (ultT <= 0) { spiral.visible = false; if (ultGrounded) landing = true; }
      }
      // the boss
      if (!won) {
        const r = R.bossStep(B, sdt, [me3.x, me3.z]); B = r.boss;
        for (const e of r.events) {
          if (e.type === 'strike') strikeLands(e.attack, e.damage);
          else if (e.type === 'takeoff') { flash(say('shoal.takeoff'), 1.8); cue('dash_whoosh'); }
          else if (e.type === 'telegraph' && e.attack.kind === 'breath') cue('cast_charge_frost'); // the inhale
        }
        const a = R.addsStep(B.adds, sdt, [me3.x, me3.z], R.BOSS, me3.lift); B = { ...B, adds: a.adds };
        if (a.damage) hurt(a.damage);
      }
      if (H.hp <= 0 && deadT <= 0) { deadT = 2.2; ultT = 0; spiral.visible = false; flash(say('shoal.dead'), 2.2); onDeath(); }
    }
    H = R.heroTick(H, sdt, { drain, air: R.airborne(FL) });
    const ready = R.ultReady(H); if (ready && !wasReady && elise() && !won) flash(say('shoal.ultReady'), 1.6); wasReady = ready;
    // the dragons join in while she fights (not while she is down, after the win, or inside the Tempest)
    { const al = allies() || []; if (al.length !== allyTimers.length) allyTimers = freshAllies(al.length);
      for (const i of alliesStep(allyTimers, sdt, active && !won && deadT <= 0 && ultT <= 0)) allyShoot(al[i]); }
    // projectiles
    for (let i = shots.length - 1; i >= 0; i--) {
      const sh = shots[i], step = sh.s.speed * sdt;
      sh.x += sh.dx * step; sh.z += sh.dz * step; sh.left -= step; sh.y = Math.max(0.6, sh.y + sh.vy * sdt);
      sh.mesh.position.set(sh.x, sh.y, sh.z); if (sh.s.id === 'gale_discs') sh.mesh.rotation.y += sdt * 20;
      const gale = sh.s.id === 'gale_discs', src = sh.s.src || (gale ? 'gale' : 'ember'), col = sh.s.color || IMPACT[src].color, hitCue = sh.s.hitCue || (gale ? 'gale_hit' : 'ember_hit');
      sh.wake = (sh.wake || 0) - sdt; if (sh.wake <= 0) { sh.wake = (gale ? 0.035 : 0.018) * (mobile ? 2 : 1); fx.trail([sh.x, sh.y, sh.z], col, gale ? 0.22 : 0.32, gale ? 0.25 : 0.12); }
      let spent = sh.left <= 0;
      if (!won && !sh.hitBoss && Math.hypot(sh.x - R.ARENA.boss[0], sh.z - R.ARENA.boss[1]) <= R.BOSS.contact * 0.6 + sh.s.radius) { damageBoss(sh.s.damage, { noCharge: !!sh.s.ally }); sh.hitBoss = true; landFx(src, [sh.x, sh.y, sh.z], false, col); cue(hitCue); if (!sh.s.pierce) spent = true; }
      if (B.adds.length && sh.y < 3) {
        const h = R.hitAdds(B.adds.filter((a) => !sh.hit.has(a.id)), [sh.x, sh.z], sh.s.radius, sh.s.damage, !sh.s.pierce);
        if (h.hit) {
          const before = new Map(B.adds.map((a) => [a.id, a])); const after = new Map(h.adds.map((a) => [a.id, a]));
          B = { ...B, adds: B.adds.map((a) => (sh.hit.has(a.id) ? a : after.get(a.id))).filter(Boolean) };
          for (const id of before.keys()) if (!after.has(id) || after.get(id).hp !== before.get(id).hp) { sh.hit.add(id); const a = before.get(id); landFx(src, [a.x, 0.9, a.z], !after.has(id), col); }
          cue(hitCue);
          if (!sh.s.ally) charge(sh.s.damage * h.hit * R.BOSS.armor, 0); // the dragons never fill her Tempest
          if (!sh.s.pierce) spent = true;
        }
      }
      if (spent) { if (sh.left <= 0 && !sh.hitBoss && !sh.hit.size) fx.burst([sh.x, sh.y, sh.z], col, 3, 0.3); sh.mesh.removeFromParent(); if (sh.s.ally) sh.mesh.material.dispose(); shots.splice(i, 1); }
    }
    draw(dt, sdt);
  }

  let tt = 0, bossLift = 0;
  function draw(dt, sdt) {
    tt += sdt;
    const red = reduced();
    // the serpent's arc: a hump that rises over the plain, its head toward her
    const rise = won ? 0 : 1, sway = red ? 0 : Math.sin(tt * 0.8) * 0.4;
    const toMe = Math.atan2(me3.x - R.ARENA.boss[0], me3.z - R.ARENA.boss[1]);
    if (!won) boss.rotation.y = toMe;
    bossLift += ((B.airborne && !won ? 9 : 0) - bossLift) * Math.min(1, sdt * (B.airborne ? 1.6 : 4)); boss.position.y = bossLift; // in the air (phase 3) it hovers high
    if (bossModel) {
      bossAnim = bossAnimStep(bossAnim, B, red ? 0 : sdt, R.BOSS.phases[B.phase].telegraph, won);
      if (red && bossAnim.clip === 'rise') bossAnim = { ...bossAnim, clip: 'idle', time: 0 }; // reduced motion: it is simply there
      if (red && won) bossAnim = { ...bossAnim, clip: 'death', time: BOSS_ANIM.len.death };      // reduced motion: it is simply gone
      if (won && bossAnim.time >= BOSS_ANIM.len.death) boss.visible = false;
      if (bossMixer) {
        const shown = clipOn(bossAnim.clip, (n) => !!bossActions[n]); // the dragon's own clip, or its stand-in on another model
        fadeWeights(bossW, shown, red ? 1 : sdt);
        for (const name in bossActions) { const a = bossActions[name]; a.setEffectiveWeight(bossW[name] || 0); if (name === shown) a.time = Math.min(bossAnim.time, a.getClip().duration - 1e-3); }
        bossMixer.update(0);
      }
      for (const g of bossGlow) g.m.emissiveIntensity = g.base * (B.exposed > 0 ? 1.8 + 0.6 * Math.sin(tt * 12) : won ? Math.max(0, 1 - bossAnim.time / 2) : 1);
    }
    const coil = B.state === 'telegraph' ? 0.8 : B.state === 'active' ? -0.6 : 0;
    segs.forEach((s, i) => { const k = i / (segs.length - 1); s.position.set(Math.sin(k * 3 + tt * 0.6) * sway * 2, rise * (Math.sin(k * Math.PI) * 9 + k * 6 - coil * k * 3), (k - 0.5) * 6 - coil * k * 2); });
    const head = segs[segs.length - 1].position; crest.position.set(head.x, head.y + 2, head.z);
    crestMat.emissiveIntensity = (B.exposed > 0 ? 3 + Math.sin(tt * 12) : 0.6) + (bossFlashT > 0 ? 2.5 * bossFlashT / 0.12 : 0);
    if (bossFlashT > 0) bossFlashT = Math.max(0, bossFlashT - dt);
    { const k = 0.7 * bossFlashT / 0.12; hide.emissive.setRGB(k, k * 0.92, k * 0.85); }   // the hide flashes when a blow bites
    crestMat.emissive.setHex(B.exposed > 0 ? 0xffa040 : 0x2a6cff);
    bossHud.classList.toggle('sa-open', B.exposed > 0);
    // telegraphs
    ring.visible = band.visible = line.visible = breathFan.visible = clawFan.visible = false;
    if (B.attack && (B.state === 'telegraph' || B.state === 'active')) {
      const a = B.attack, k = B.state === 'active' ? 1 : 1 - Math.max(0, B.t) / (R.BOSS.phases[B.phase].telegraph || 1);
      const op = B.state === 'active' ? 0.85 : 0.25 + 0.45 * k;
      if (a.kind === 'slam') { ring.visible = true; ring.position.set(a.at[0], 0.05, a.at[1]); const r = R.BOSS.attacks.slam.radius; ring.scale.set(r, r, r); ring.material.opacity = op; }
      if (a.kind === 'sweep') { band.visible = true; band.material.opacity = op; }
      if (a.kind === 'dive') { ring.visible = true; ring.position.set(a.at[0], 0.05, a.at[1]); const r = R.BOSS.attacks.dive.radius; ring.scale.set(r, r, r); ring.material.opacity = op; }
      if (a.kind === 'breath' || a.kind === 'claw') { const m = a.kind === 'breath' ? breathFan : clawFan; m.visible = true; m.position.set(a.at[0], 0.06, a.at[1]); m.rotation.y = Math.atan2(a.dir[0], a.dir[1]); m.material.opacity = op; }
      if (a.kind === 'lunge') { line.visible = true; line.position.set(a.at[0], 0.05, a.at[1]); line.rotation.y = Math.atan2(a.dir[0], a.dir[1]); line.material.opacity = op; }
    }
    // adds
    addsView.sync(B.adds, sdt, [me3.x, me3.z], red, tt);
    for (const [id, m] of orbs) { m.visible = !(id in timers); if (!red) m.position.y = 1 + Math.sin(tt * 2 + m.position.x) * 0.15; }
    if (chestOpen) chest.rotation.x = Math.max(-0.9, chest.rotation.x - dt * 2);
    // the Tempest: orbs and blades spiral out from her, a ring bursts on the mirror at each blow
    if (spiral.visible) {
      spiral.position.set(me3.x, me3.lift, me3.z);
      const spin = red ? 1.2 : 4;
      spiralBits.forEach((m, i) => {
        const ph = (ultEl * 0.9 + i / SPIRAL) % 1, a = (i / SPIRAL) * Math.PI * 2 + ultEl * spin + ph * 3;
        const r = 1 + ph * (R.ULT.radius - 1);
        m.position.set(Math.sin(a) * r, 1.2 + Math.sin(ph * Math.PI) * 1.4 - ph * me3.lift * 0.8, Math.cos(a) * r);
        if (i % 2) m.rotation.y += sdt * 18;
      });
    }
    if (burstT > 0) { burstT -= dt; const k = 1 - burstT / 0.35; const r = 1 + k * R.ULT.radius; burst.position.set(me3.x, 0.08, me3.z); burst.scale.set(r, r, r); burst.material.opacity = 0.7 * (1 - k); }
    else burst.material.opacity = 0;
    if (reduced()) fx.still();
    fx.update(sdt); // under the hit-stop the sparks hang in the air with everything else
    // the aim ring (desktop: the cursor; touch: the auto target), only while there is something to aim at
    const showAim = elise() && !won && deadT <= 0 && (hover || touchAim);
    aimMark.visible = !!showAim;
    if (showAim) { const p = aimPoint(); aimMark.position.set(p[0], 0.06, p[1]); }
    // HUD
    bossHud.hidden = won;
    { const k = won ? (chestOpen ? 'shoal.prompt.home' : 'shoal.prompt.chest') : 'shoal.leave'; const txt = say(k); if (exitBtn.textContent !== txt) exitBtn.textContent = txt; exitBtn.classList.toggle('sa-next', won); }
    bossName.textContent = say('shoal.boss') + ' · ' + say('shoal.phase', { n: B.phase + 1 });
    bossFill.style.width = (100 * B.hp / R.BOSS.hp).toFixed(1) + '%';
    bars.hp.style.width = H.hp + '%'; bars.stamina.style.width = H.stamina + '%'; bars.mana.style.width = H.mana + '%'; bars.ult.style.width = (100 * (H.ult || 0) / R.ULT.max).toFixed(1) + '%';
    const ready = R.ultReady(H);
    me.classList.toggle('sa-ready', ready);
    for (const { b, s } of skillBtns) { const cd = H.cds[s.id] || 0; b.querySelector('s').style.height = cd > 0 ? Math.min(100, (cd * 1000 / s.cooldownMs) * 100) + '%' : '0'; }
    if (ultBtn) { ultBtn.classList.toggle('sa-ready', ready && ultT <= 0); ultBtn.querySelector('u').style.height = (ultT > 0 ? 100 * ultT / R.ULT.duration : 100 * (H.ult || 0) / R.ULT.max).toFixed(1) + '%'; }
    if (liftBtn) liftBtn.classList.toggle('sa-on', R.airborne(FL));
  }

  return {
    root, look, spawns,
    enter, leave, update, interact,
    get state() { return { hero: { ...H }, boss: { ...B, adds: B.adds.length }, won, chestOpen, flight: { ...FL }, lift: me3.lift, pos: [me3.x, me3.z], heading: me3.heading, ultT, shots: shots.length }; },
    /**
     * Keys while the fight owns her: F / 1 / a click = skill 1, Q / 2 = skill 2, Space / 4 = dodge, E = the chest / fly
     * home. Elise: Space twice or L takes off; in the air Space rises, Shift sinks, L lands; R / 3 = the Tempest.
     */
    input(input) {
      const sk = shoalSkillsFor(hero());
      hover = input.touchControls ? null : input.hover;
      if (input.touchControls) touchAim = true; else if (hover) touchAim = false;
      const clicks = input.clicks && input.clicks.length ? input.clicks : null;
      if (clicks && !input.touchControls) hover = { x: clicks[clicks.length - 1].x, y: clicks[clicks.length - 1].y };
      if (input.hit('KeyF') || input.hit('Digit1') || clicks) use(sk[0]);
      if (input.hit('KeyQ') || input.hit('Digit2')) use(sk[1]);
      if (elise()) {
        if (input.hit('Space')) {
          if (!R.airborne(FL)) { if (tt - lastJump < R.FLIGHT.doubleTap) takeOffNow(); else use(sk[2]); }
          lastJump = tt;
        }
        if (input.hit('Digit4')) use(sk[2]);
        if (input.hit('KeyL')) toggleLift();
        if (input.hit('KeyR') || input.hit('Digit3')) ult();
        const keys = input.keys || new Set();
        kbVert = input.down('Space') ? 1 : (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? -1 : 0;
        if (kbVert) touchFlight = false;
      } else if (input.hit('Space') || input.hit('Digit4')) use(sk[2]);
      if (input.hit('KeyE')) interact();
    },
    /** The heroine's pose in world space: flying adds a bob (hover = her idle pose), a forward lean and a bank. */
    pose(p) {
      const air = R.airborne(FL);
      const bob = air && !reduced() ? Math.sin(tt * 2.6) * 0.08 : 0;
      p.pos.set(center.x + me3.x, center.y + me3.lift + bob, center.z + me3.z); p.heading = me3.heading;
      p.speed = air ? 0 : me3.speed; p.bob = bob;
      p.bank = air && !reduced() ? FL.bank : 0;
      p.pitch = air ? Math.min(0.22, 0.22 * Math.hypot(FL.vx, FL.vz) / R.FLIGHT.airSpeed) : 0;
    },
    /** After the camera rig: the Tempest's screen shake (none under reduced motion). */
    shakeCamera(cam, dt) {
      cam.position.add(fx.kick); // the blows' kick along their direction (zero under reduced motion)
      if (shakeT <= 0 || shakeAmp <= 0) return;
      shakeT -= dt; const k = shakeAmp * Math.max(0, shakeT / 0.22);
      cam.position.x += (Math.random() - 0.5) * k; cam.position.y += (Math.random() - 0.5) * k; cam.position.z += (Math.random() - 0.5) * k;
    },
    /** Dev and tests: deal damage straight to the boss. */
    debugHit(n) { return damageBoss(n); },
    /** Dev and tests: fill the Tempest's meter. */
    debugCharge() { H = { ...H, ult: R.ULT.max }; },
    /** Dev and tests: the boss falls and the chest opens (the reward runs as in a real win). */
    debugWin() { B = { ...B, exposed: 0 }; damageBoss(1e9 / R.BOSS.armor); chestOpen = true; },
    dispose() { leave(); fx.dispose(); root.removeFromParent(); hud.remove(); },
  };
}
