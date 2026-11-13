// The Glass Shoal arena (docs/plans/boss/glass-shoal-boss.md): the island's scene graph, the Hollow Tide fight and
// its HUD. Imported by scenes/glass-shoal.js only when the dragon ride starts (nothing of it loads before).
// Gameplay seat: geometry, spawn points, the fight. The rendering seat (A2) owns the look: `arena.look` exposes the
// floor, the sun, the fog colour and the glowing parts so its reflector, sky and grade can replace these simple
// materials without touching the rules. The rules are pure (game/shoal-rules.js); this file only runs and draws them.
import * as R from '../game/shoal-rules.js';
import { shoalSkillsFor, comboStep } from '../rpg/shoal-skills.js';
import { hasModelFile, fetchGltf } from '../render/assets.js';

const CSS = `
.sa-boss{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 14px);transform:translateX(-50%);width:min(520px,calc(100vw - 32px));z-index:14;color:#f3ead2;font:600 14px/1.2 "Atkinson Hyperlegible",system-ui,sans-serif;text-align:center;text-shadow:0 1px 3px #000;pointer-events:none}
.sa-bar{height:10px;margin-top:4px;border-radius:5px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.25);overflow:hidden;position:relative}.sa-bar b{display:block;height:100%;background:linear-gradient(90deg,#7fd8ff,#b48bff);transition:width .15s}
.sa-bar i{position:absolute;top:0;bottom:0;width:2px;background:rgba(255,255,255,.7)}
.sa-boss.sa-open b{background:linear-gradient(90deg,#ffd27a,#ff8a3a)}
.sa-me{position:fixed;left:calc(env(safe-area-inset-left,0px) + 16px);top:calc(env(safe-area-inset-top,0px) + 14px);width:min(220px,40vw);z-index:14;color:#f3ead2;font:12px/1.2 system-ui,sans-serif;pointer-events:none}
.sa-me .sa-bar{height:8px;margin:2px 0 6px}.sa-hp b{background:#e05a5a!important}.sa-st b{background:#e8c860!important}.sa-mp b{background:#5a9ce0!important}
.sa-skills{position:fixed;right:calc(env(safe-area-inset-right,0px) + 16px);bottom:calc(env(safe-area-inset-bottom,0px) + 16px);display:flex;gap:8px;z-index:14}
.sa-skill{position:relative;width:64px;height:64px;border-radius:14px;border:1px solid rgba(246,200,96,.7);background:rgba(18,14,8,.8);color:#f6e2a8;font:600 11px/1.1 system-ui,sans-serif;cursor:pointer;overflow:hidden;touch-action:none;padding:4px}
.sa-skill kbd{position:absolute;left:4px;top:3px;font:600 10px system-ui;opacity:.75}.sa-skill s{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);text-decoration:none}
.sa-msg{position:fixed;left:50%;top:32%;transform:translateX(-50%);z-index:15;color:#ffe6a6;font:700 22px system-ui,sans-serif;text-shadow:0 2px 6px #000;pointer-events:none;text-align:center;max-width:calc(100vw - 32px)}
@media (max-width:899px){.sa-boss{left:auto;right:12px;transform:none;width:calc(58vw - 12px)}.sa-me{width:36vw}.sa-skill{width:58px;height:58px}}
`;

/**
 * @param {object} o
 * @param {typeof import('three')} o.THREE @param {object} o.scene @param {object} o.center the arena's world centre (Vector3)
 * @param {(k: string, a?: object) => string} o.say @param {(s: string) => void} o.toast @param {() => boolean} o.reduced
 * @param {boolean} o.mobile @param {() => string} o.hero @param {(name: string) => void} o.clip @param {() => number[]} o.axes
 * @param {object} o.rig the camera rig (ground axes) @param {() => void} o.onWin @param {() => void} o.onDeath @param {() => void} o.onHome
 */
export function createShoalArena(o) {
  const { THREE, scene, center, say, toast, reduced, mobile, hero, clip, axes, rig, onWin, onDeath, onHome } = o;
  const doc = globalThis.document;
  if (!doc.getElementById('sa-css')) { const st = doc.createElement('style'); st.id = 'sa-css'; st.textContent = CSS; doc.head.append(st); }
  const root = new THREE.Group(); root.name = 'glass-shoal'; root.position.copy(center); root.visible = false; scene.add(root);
  const W = (x, z, y = 0) => new THREE.Vector3(x, y, z); // arena-local

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
  if (hasModelFile('hollow_tide')) fetchGltf('hollow_tide').then(({ gltf }) => { for (const s of segs) s.visible = false; boss.add(gltf.scene); }).catch(() => {});
  // telegraphs: the ground ring (slam), the band (sweep), the charge line (lunge)
  const teleMat = () => new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 1, 48), teleMat()); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.visible = false; root.add(ring);
  const band = new THREE.Mesh(new THREE.RingGeometry(R.BOSS.attacks.sweep.inner, R.BOSS.attacks.sweep.radius, 64), teleMat()); band.rotation.x = -Math.PI / 2; band.position.set(R.ARENA.boss[0], 0.05, R.ARENA.boss[1]); band.visible = false; root.add(band);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(R.BOSS.attacks.lunge.width, R.BOSS.attacks.lunge.length), teleMat()); line.geometry.rotateX(-Math.PI / 2); line.geometry.translate(0, 0, R.BOSS.attacks.lunge.length / 2); line.position.y = 0.05; line.visible = false; root.add(line);
  // pickups, adds, projectiles, the chest
  const orbMat = { hp: new THREE.MeshBasicMaterial({ color: 0x6aff9a }), stamina: new THREE.MeshBasicMaterial({ color: 0xffe066 }) };
  const orbs = new Map(R.ARENA.pickups.map((p) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), orbMat[p.kind]); m.position.set(p.at[0], 1, p.at[1]); root.add(m); return [p.id, m]; }));
  const addMat = new THREE.MeshStandardMaterial({ color: 0x6a8aa8, emissive: 0x1a3a6a, emissiveIntensity: 0.6, roughness: 0.4 });
  const addMeshes = new Map();
  const shots = [];
  const chest = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.8, roughness: 0.3, emissive: 0x6a4a10, emissiveIntensity: 0.5 }));
  chest.position.set(R.ARENA.chest[0], 0.45, R.ARENA.chest[1]); chest.visible = false; root.add(chest);

  // ---- HUD
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const hud = el('div'); hud.hidden = true; doc.body.append(hud);
  const bossHud = el('div', 'sa-boss'); const bossName = el('div'); const bossBar = el('div', 'sa-bar'); const bossFill = el('b'); bossBar.append(bossFill);
  for (const p of R.BOSS.phases.slice(1)) { const i = el('i'); i.style.left = (p.above * 100) + '%'; bossBar.append(i); }
  bossHud.append(bossName, bossBar); hud.append(bossHud);
  const me = el('div', 'sa-me'); const bars = {};
  for (const [k, cls] of [['hp', 'sa-hp'], ['stamina', 'sa-st'], ['mana', 'sa-mp']]) { const lab = el('div', null, say('shoal.' + k)); const b = el('div', 'sa-bar ' + cls); const fill = el('b'); b.append(fill); me.append(lab, b); bars[k] = fill; }
  hud.append(me);
  const skillsEl = el('div', 'sa-skills'); hud.append(skillsEl);
  const msg = el('div', 'sa-msg'); msg.hidden = true; hud.append(msg);
  let msgT = 0;
  const flash = (text, secs = 2.2) => { msg.textContent = text; msg.hidden = false; msgT = secs; };
  let skillBtns = [];
  function buildSkills() {
    skillsEl.textContent = ''; skillBtns = [];
    for (const s of shoalSkillsFor(hero())) {
      const b = el('button', 'sa-skill'); b.type = 'button'; b.dataset.skill = s.id;
      b.append(el('kbd', null, s.key === 'Space' ? '␣' : s.key), el('span', null, say('shoal.skill.' + s.id)), el('s'));
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); use(s); });
      skillsEl.append(b); skillBtns.push({ b, s });
    }
  }

  // ---- fight state
  let H = R.freshHero(), B = R.freshBoss(), timers = {}, active = false, won = false, chestOpen = false;
  const me3 = { x: R.ARENA.landing[0], z: R.ARENA.landing[1], heading: Math.PI, speed: 0, lift: 0, dodgeDir: [0, -1] };
  let combo = 0, comboT = 0, heavyT = 0, deadT = 0, lastPhase = 0;

  function enter(save) {
    root.visible = true; hud.hidden = false; active = true; buildSkills();
    won = save && (save.step === 'return' || save.step === 'done');
    B = won ? { ...R.freshBoss(2), hp: 0, dead: true } : R.freshBoss(0); H = R.freshHero(); timers = {};
    me3.x = R.ARENA.landing[0]; me3.z = R.ARENA.landing[1]; me3.heading = Math.PI; lastPhase = B.phase;
    chest.visible = won; chestOpen = false; boss.visible = !won;
    bossName.textContent = say('shoal.boss') + ' · ' + say('shoal.phase', { n: B.phase + 1 });
  }
  function leave() { root.visible = false; hud.hidden = true; active = false; for (const s of shots) s.mesh.removeFromParent(); shots.length = 0; }

  const bossDist = () => Math.hypot(me3.x - R.ARENA.boss[0], me3.z - R.ARENA.boss[1]);
  const faceBoss = () => { if (bossDist() < 14) me3.heading = Math.atan2(R.ARENA.boss[0] - me3.x, R.ARENA.boss[1] - me3.z); };
  const damageBoss = (amount) => {
    const r = R.hitBoss(B, amount); B = r.boss;
    if (r.phaseUp) { flash(say(B.phase === 1 ? 'shoal.phase2' : 'shoal.phase3')); }
    if (B.dead && !won) { won = true; boss.visible = false; chest.visible = true; for (const m of addMeshes.values()) m.removeFromParent(); addMeshes.clear(); B = { ...B, adds: [] }; flash(say('shoal.victory'), 3.5); onWin(); }
    return r.dealt;
  };
  function use(s) {
    if (!active || deadT > 0) return;
    if (won) { interact(); return; }
    if (s.kind === 'movement') {
      const h2 = R.startDodge(H); if (h2 === H) return; H = h2;
      const ax = axes(); const { fwd, right } = rig.groundAxes();
      let dx = fwd.x * (ax[1] || 0) + right.x * (ax[0] || 0), dz = fwd.y * (ax[1] || 0) + right.y * (ax[0] || 0);
      if (!dx && !dz) { dx = -Math.sin(me3.heading); dz = -Math.cos(me3.heading); }
      const d = Math.hypot(dx, dz) || 1; me3.dodgeDir = [dx / d, dz / d];
      clip('dash'); return;
    }
    const h2 = R.useSkill(H, s); if (!h2) return; H = h2;
    faceBoss();
    if (s.id === 'loom_combo') {
      combo = comboT > 0 ? combo + 1 : 1; comboT = 0.9;
      const i = comboStep(combo); clip('strike' + (i + 1));
      melee(s.range, s.damage[i]);
    } else if (s.id === 'loom_heavy') { heavyT = s.windup; clip('strike3'); }
    else if (s.id === 'ember_palms') { for (const side of [-1, 1]) shoot(s, side * 0.35, 0); clip('strike1'); }
    else if (s.id === 'gale_discs') { for (let k = 0; k < s.count; k++) shoot(s, 0, (k - (s.count - 1) / 2) * s.spread); clip('strike2'); }
  }
  function melee(range, dmg) {
    const fx = Math.sin(me3.heading), fz = Math.cos(me3.heading);
    const hx = me3.x + fx * range * 0.6, hz = me3.z + fz * range * 0.6;
    if (bossDist() <= R.BOSS.contact + range) damageBoss(dmg);
    B = { ...B, adds: R.hitAdds(B.adds, [hx, hz], range, dmg).adds };
  }
  const orbGeo = new THREE.SphereGeometry(0.32, 10, 8), discGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.06, 20);
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff8a3a }), windMat = new THREE.MeshBasicMaterial({ color: 0xc8f0ff, transparent: true, opacity: 0.8 });
  function shoot(s, offset, angle) {
    const h = me3.heading + angle, dx = Math.sin(h), dz = Math.cos(h);
    const mesh = new THREE.Mesh(s.id === 'gale_discs' ? discGeo : orbGeo, s.id === 'gale_discs' ? windMat : fireMat);
    const x = me3.x + Math.cos(me3.heading) * offset, z = me3.z - Math.sin(me3.heading) * offset;
    mesh.position.set(x, 1.3 + me3.lift, z); root.add(mesh);
    shots.push({ s, mesh, x, z, dx, dz, left: s.range, hitBoss: false, hit: new Set() });
  }
  function interact() {
    if (!won) return false;
    if (!chestOpen && Math.hypot(me3.x - R.ARENA.chest[0], me3.z - R.ARENA.chest[1]) < 3) { chestOpen = true; chest.rotation.x = -0.001; flash(say('shoal.reward', { xp: R.REWARD.xp, title: say('shoal.title.' + R.REWARD.title) }), 4); return true; }
    if (chestOpen || Math.hypot(me3.x - R.ARENA.landing[0], me3.z - R.ARENA.landing[1]) < 4) { onHome(); return true; }
    return false;
  }

  function strikeLands(atk, damage) {
    if (!R.inDanger(atk, me3.x, me3.z)) return;
    const r = R.hitHero(H, damage); H = r.hero;
    if (r.dodged) { B = R.exposeBoss(B); flash(say('shoal.weak'), 1.4); }
  }

  function update(dt) {
    if (!active) return;
    if (msgT > 0 && (msgT -= dt) <= 0) msg.hidden = true;
    H = R.heroTick(H, dt);
    if (comboT > 0) comboT -= dt;
    if (heavyT > 0 && (heavyT -= dt) <= 0) { const s = shoalSkillsFor('iris')[1]; melee(s.range, s.damage); }
    if (deadT > 0) { if ((deadT -= dt) <= 0) { const r = R.respawnAfterDeath(B); B = r.boss; H = r.hero; me3.x = r.at[0]; me3.z = r.at[1]; for (const m of addMeshes.values()) m.removeFromParent(); addMeshes.clear(); } }
    else {
      // movement
      const ax = axes(); const { fwd, right } = rig.groundAxes();
      let wx = fwd.x * (ax[1] || 0) + right.x * (ax[0] || 0), wz = fwd.y * (ax[1] || 0) + right.y * (ax[0] || 0);
      const wl = Math.hypot(wx, wz);
      if (H.dodge > 0) { wx = me3.dodgeDir[0] * R.HERO.dodgeSpeed; wz = me3.dodgeDir[1] * R.HERO.dodgeSpeed; }
      else if (wl > 0) { const sp = R.HERO.speed * (heavyT > 0 ? 0.2 : 1) / Math.max(1, wl); wx *= sp; wz *= sp; me3.heading = Math.atan2(wx, wz); }
      let nx = me3.x + wx * dt, nz = me3.z + wz * dt;
      // the body blocks her
      const bd = Math.hypot(nx - R.ARENA.boss[0], nz - R.ARENA.boss[1]);
      if (!won && bd < R.BOSS.contact - 1.5) { const k = (R.BOSS.contact - 1.5) / (bd || 1); nx = R.ARENA.boss[0] + (nx - R.ARENA.boss[0]) * k; nz = R.ARENA.boss[1] + (nz - R.ARENA.boss[1]) * k; }
      [me3.x, me3.z] = R.clampToArena(nx, nz);
      me3.speed = Math.hypot(wx, wz);
      const liftTo = hero() === 'elise' && H.dodge > 0 ? 2.4 : 0; me3.lift += (liftTo - me3.lift) * Math.min(1, dt * 10);
      // pickups
      timers = R.pickupsTick(timers, dt);
      const p = R.pickupAt(timers, me3.x, me3.z); if (p) { H = R.pickUp(H, p.kind); timers = { ...timers, [p.id]: R.HERO.pickupRespawn }; }
      // the boss
      if (!won) {
        const r = R.bossStep(B, dt, [me3.x, me3.z]); B = r.boss;
        for (const e of r.events) if (e.type === 'strike') strikeLands(e.attack, e.damage);
        const a = R.addsStep(B.adds, dt, [me3.x, me3.z]); B = { ...B, adds: a.adds };
        if (a.damage) H = R.hitHero(H, a.damage).hero;
        if (B.phase !== lastPhase) lastPhase = B.phase;
      }
      if (H.hp <= 0 && deadT <= 0) { deadT = 2.2; flash(say('shoal.dead'), 2.2); onDeath(); }
    }
    // projectiles
    for (let i = shots.length - 1; i >= 0; i--) {
      const sh = shots[i], step = sh.s.speed * dt;
      sh.x += sh.dx * step; sh.z += sh.dz * step; sh.left -= step;
      sh.mesh.position.x = sh.x; sh.mesh.position.z = sh.z; if (sh.s.id === 'gale_discs') sh.mesh.rotation.y += dt * 20;
      let spent = sh.left <= 0;
      if (!won && !sh.hitBoss && Math.hypot(sh.x - R.ARENA.boss[0], sh.z - R.ARENA.boss[1]) <= R.BOSS.contact * 0.6 + sh.s.radius) { damageBoss(sh.s.damage); sh.hitBoss = true; if (!sh.s.pierce) spent = true; }
      if (B.adds.length) { const h = R.hitAdds(B.adds.filter((a) => !sh.hit.has(a.id)), [sh.x, sh.z], sh.s.radius, sh.s.damage, !sh.s.pierce); if (h.hit) { const before = new Map(B.adds.map((a) => [a.id, a])); const after = new Map(h.adds.map((a) => [a.id, a])); B = { ...B, adds: B.adds.map((a) => (sh.hit.has(a.id) ? a : after.get(a.id))).filter(Boolean) }; for (const id of before.keys()) if (!after.has(id) || after.get(id).hp !== before.get(id).hp) sh.hit.add(id); if (!sh.s.pierce) spent = true; } }
      if (spent) { sh.mesh.removeFromParent(); shots.splice(i, 1); }
    }
    draw(dt);
  }

  let tt = 0;
  function draw(dt) {
    tt += dt;
    const red = reduced();
    // the serpent's arc: a hump that rises over the plain, its head toward her
    const rise = won ? 0 : 1, sway = red ? 0 : Math.sin(tt * 0.8) * 0.4;
    const toMe = Math.atan2(me3.x - R.ARENA.boss[0], me3.z - R.ARENA.boss[1]);
    boss.rotation.y = toMe;
    const coil = B.state === 'telegraph' ? 0.8 : B.state === 'active' ? -0.6 : 0;
    segs.forEach((s, i) => { const k = i / (segs.length - 1); s.position.set(Math.sin(k * 3 + tt * 0.6) * sway * 2, rise * (Math.sin(k * Math.PI) * 9 + k * 6 - coil * k * 3), (k - 0.5) * 6 - coil * k * 2); });
    const head = segs[segs.length - 1].position; crest.position.set(head.x, head.y + 2, head.z);
    crestMat.emissiveIntensity = B.exposed > 0 ? 3 + Math.sin(tt * 12) : 0.6;
    crestMat.emissive.setHex(B.exposed > 0 ? 0xffa040 : 0x2a6cff);
    bossHud.classList.toggle('sa-open', B.exposed > 0);
    // telegraphs
    ring.visible = band.visible = line.visible = false;
    if (B.attack && (B.state === 'telegraph' || B.state === 'active')) {
      const a = B.attack, k = B.state === 'active' ? 1 : 1 - Math.max(0, B.t) / (R.BOSS.phases[B.phase].telegraph || 1);
      const op = B.state === 'active' ? 0.85 : 0.25 + 0.45 * k;
      if (a.kind === 'slam') { ring.visible = true; ring.position.set(a.at[0], 0.05, a.at[1]); const r = R.BOSS.attacks.slam.radius; ring.scale.set(r, r, r); ring.material.opacity = op; }
      if (a.kind === 'sweep') { band.visible = true; band.material.opacity = op; }
      if (a.kind === 'lunge') { line.visible = true; line.position.set(a.at[0], 0.05, a.at[1]); line.rotation.y = Math.atan2(a.dir[0], a.dir[1]); line.material.opacity = op; }
    }
    // adds
    const live = new Set();
    for (const a of B.adds) {
      live.add(a.id);
      let m = addMeshes.get(a.id);
      if (!m) { m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), addMat); root.add(m); addMeshes.set(a.id, m); }
      m.position.set(a.x, 0.8 + (red ? 0 : Math.abs(Math.sin(tt * 6 + a.id)) * 0.3), a.z); if (!red) m.rotation.y += dt * 3;
    }
    for (const [id, m] of addMeshes) if (!live.has(id)) { m.removeFromParent(); addMeshes.delete(id); }
    for (const [id, m] of orbs) { m.visible = !(id in timers); if (!red) m.position.y = 1 + Math.sin(tt * 2 + m.position.x) * 0.15; }
    if (chestOpen) chest.rotation.x = Math.max(-0.9, chest.rotation.x - dt * 2);
    // HUD
    bossHud.hidden = won;
    bossName.textContent = say('shoal.boss') + ' · ' + say('shoal.phase', { n: B.phase + 1 });
    bossFill.style.width = (100 * B.hp / R.BOSS.hp).toFixed(1) + '%';
    bars.hp.style.width = H.hp + '%'; bars.stamina.style.width = H.stamina + '%'; bars.mana.style.width = H.mana + '%';
    for (const { b, s } of skillBtns) { const cd = H.cds[s.id] || 0; b.querySelector('s').style.height = cd > 0 ? Math.min(100, (cd * 1000 / s.cooldownMs) * 100) + '%' : '0'; b.disabled = false; }
  }

  return {
    root, look, spawns,
    enter, leave, update, interact,
    get state() { return { hero: { ...H }, boss: { ...B, adds: B.adds.length }, won, chestOpen }; },
    /** Keys while the fight owns her: F / 1 / a click = skill 1, Q / 2 = skill 2, Space / 4 = dodge, E = the chest / fly home. */
    input(input) {
      const sk = shoalSkillsFor(hero());
      if (input.hit('KeyF') || input.hit('Digit1') || (input.clicks && input.clicks.length)) use(sk[0]);
      if (input.hit('KeyQ') || input.hit('Digit2')) use(sk[1]);
      if (input.hit('Space') || input.hit('Digit4')) use(sk[2]);
      if (input.hit('KeyE')) interact();
    },
    /** The heroine's pose in world space. */
    pose(p) { p.pos.set(center.x + me3.x, center.y + me3.lift, center.z + me3.z); p.heading = me3.heading; p.speed = me3.speed; },
    /** Dev and tests: deal damage straight to the boss. */
    debugHit(n) { return damageBoss(n); },
    /** Dev and tests: the boss falls and the chest opens (the reward runs as in a real win). */
    debugWin() { B = { ...B, exposed: 0 }; damageBoss(1e9 / R.BOSS.armor); chestOpen = true; },
    dispose() { leave(); root.removeFromParent(); hud.remove(); },
  };
}
