// The RPG HUD layer (sprint A2; mounted by A5's seam behind the `rpgHud` flag; the old scenes/player-hud.js stays the
// fallback when the flag is off). `mount(ctx)` wires the pure rules (progression.js, skills.js) to the game: the
// hotbar keys 1-9 and the direct keys (F, Q, V, Space) go through skills.js so mana and cooldowns are one truth, the
// game's own strike/dash/cast code still does the fighting (the key is forwarded to it), HP is read from the
// hillside fight and passed through the defences (brace, shield, unbroken), XP and levels come from the town ledger.
import { createHud, slotView } from './hud.js';
import { hudT } from './hud-text.js';
import { levelInfo, initialProgress, skillPointsAt, statPointsLeft, levelsGained, spendStat } from './progression.js';
import * as S from './skills.js';
import { skillById, BASE, NODE } from './skills-data.js';
import { bindings, actionOf, keyLabel, FIXED_ALIASES, onBindings } from '../ui/keybinds.js';
import { ledgerSilkView } from './silk-chip.js';
import * as silkCore from '../net/silk-core.js';
import { portalFee } from '../game/expedition-config.js';
import { xpForKill } from '../game/town-economy.js';
import { mobDisplayName } from '../game/mob-names.js';
import { blocksWindows } from '../ui/onboarding-queue.js';

export const RPG_KEY = 'ftf.rpg.v1';
const WORLD_HP = 100;                           // the hillside fight counts Iris's health out of 100 (play/mobs.js IRIS_HP)
const DIRECT = Object.freeze({ strike: 'strike', lance: 'lance', snare: 'snare', dash: 'dash' });
const WINDOWS = ['character', 'skills', 'journal', 'map', 'bag', 'market'];

export function loadProgress(storage) {
  try { const r = JSON.parse((storage && storage.getItem(RPG_KEY)) || 'null'); if (r && r.v === 1 && r.stats) return { ...initialProgress(), ...r, learned: (r.learned || []).filter((id) => NODE[id]) }; } catch { /* fresh */ }
  return initialProgress();
}
export function loadHotbar(storage) { try { return S.cleanHotbar(JSON.parse((storage && storage.getItem(S.HOTBAR_KEY)) || 'null')); } catch { return S.defaultHotbar(); } }

/**
 * @param {object} ctx {ledger, player, t, toast?, reduced?, storage, bus?, silk?, active?: () => boolean, mobs?: () => object,
 *   ui?: {open?(id)}, openMenu?(), openSettings?(tab), base?, doc?, win?, now?}
 */
export function mount(ctx) {
  const doc = ctx.doc || globalThis.document, win = ctx.win || globalThis.window, now = ctx.now || (() => performance.now());
  const t = hudT(ctx.t), storage = ctx.storage;
  const emit = (name, payload) => { try { if (ctx.bus && ctx.bus.emit) ctx.bus.emit(name, payload); else win.dispatchEvent(new CustomEvent('ftf:' + name, { detail: payload })); } catch { /* never break the frame */ } };
  const mobsOf = () => (ctx.mobs ? ctx.mobs() : (win.__ftf && win.__ftf.town && win.__ftf.town.mobs)) || null;
  let rec = loadProgress(storage), bar = loadHotbar(storage);
  const save = () => { try { storage && storage.setItem(RPG_KEY, JSON.stringify(rec)); storage && storage.setItem(S.HOTBAR_KEY, JSON.stringify(bar)); } catch { /* memory only */ } };
  const levelNow = () => levelInfo(ctx.ledger ? ctx.ledger.xp : 0);
  let L = levelNow().level, stats = S.statsOf(L, rec);
  let caster = S.initialCaster(stats.maxMana), self = { hp: stats.maxHP, maxHP: stats.maxHP, buffs: {} };
  let lastWorldHp = null, flash = {}, pressed = {}, manaPulseUntil = 0, lastFailLog = 0, targetId = null, cast = null, open = {}, silkPop = false, lastGate = null;
  let tree = null, sheet = null, map = null, cheat = null;
  const fee = portalFee(win.location ? win.location.search : '').feeC;
  // the ONE silk number (A3's model, net/silk-core.js); the ledger only when no model is installed and none is given
  const silkView = () => (ctx.silk && ctx.silk.silkView ? ctx.silk.silkView() : silkCore.silkView ? silkCore.silkView() : ledgerSilkView(ctx.ledger, fee));
  const refreshStats = () => { const before = stats; stats = S.statsOf(L, rec); if (stats.maxHP !== before.maxHP) self = { ...self, hp: Math.min(stats.maxHP, Math.round(self.hp * stats.maxHP / before.maxHP)), maxHP: stats.maxHP }; caster = { ...caster, mana: Math.min(caster.mana, stats.maxMana) }; };

  const hud = createHud({ doc, t, base: ctx.base || '/', reduced: () => !!(ctx.reduced && ctx.reduced()), keyOf: (a) => keyLabel(bindings()[a]),
    onSlot: (i) => press(i, 'click'), onTray: (id) => openWindow(id), onSync: () => { if (ctx.silk && ctx.silk.syncSilkNow) ctx.silk.syncSilkNow(); else silkCore.syncSilkNow(); },
    onSilk: () => { if (ctx.ui && ctx.ui.openWallet) ctx.ui.openWallet(); else win.dispatchEvent(new CustomEvent('ftf:open-window', { detail: { id: 'wallet' } })); },
    onMap: () => openWindow('map'), onZoom: (d) => map && map.zoom(d), onFrame: () => openWindow('character'),
    onDropSkill: (i, id) => { bar = S.placeOnSlot(bar, i, id); save(); } });
  import('./minimap.js').then((m) => { map = m.createMinimap({ canvas: hud.canvas, markers: ctx.markers, mobs: mobsOf, player: ctx.player, origin: () => (ctx.townOrigin ? ctx.townOrigin() : (win.__ftf && win.__ftf.town && win.__ftf.town.origin) || [0, 0, 0]), reveal: () => !!(self.buffs.reveal && self.buffs.reveal.until > now()) }); }).catch(() => {});
  emit('hud.mounted', { layout: win.innerWidth < 900 ? 'phone' : 'desktop' });
  const fail = (slot, v) => {
    flash[slot] = now() + 120;
    if (v.reason === 'mana') manaPulseUntil = now() + 400;
    if (now() - lastFailLog > 1000) { hud.log(t(v.key), 'err'); lastFailLog = now(); }
  };

  // ------------------------------------------------------------------ casting
  const mobById = (id) => { const M = mobsOf(); return M && M.brain ? M.brain.mobs.find((m) => m.id === id && m.state !== 'dead' && m.state !== 'gone') : null; };
  const currentTarget = () => { const M = mobsOf(); const m = (targetId && mobById(targetId)) || (M && M.locked) || null; if (!m || !ctx.player) return null; return { mob: m, dist: Math.hypot(m.pos[0] - ctx.player.pos[0], m.pos[2] - ctx.player.pos[2]) }; };
  const dead = () => { const M = mobsOf(); return !!(M && M.iris && !M.iris.alive); };
  /** Forward a key to the game's own handlers (the bound physical key, marked so this layer lets it through). */
  function forward(action, type) {
    const code = bindings()[action]; if (!code) return;
    const e = new KeyboardEvent(type, { code, key: '', bubbles: true, cancelable: true }); e.__rpg = true; win.dispatchEvent(e);
  }
  /** A slot press (key or click). */
  function press(i, how, keyUp = false) {
    const id = bar[i]; if (!id) return;
    if (keyUp) { if (BASE[id]) forward(DIRECT[id], 'keyup'); pressed[i] = 0; return; }
    pressed[i] = now() + 80;
    if (BASE[id]) {
      const v = S.validateCast(caster, rec, id, now(), { dead: dead() });
      const fightTimed = id === 'strike' || id === 'dash';                          // their cooldown is the fight's own (play/mobs.js)
      if (fightTimed ? baseCooldown(id) > 0 : (!v.ok && v.reason === 'cooldown')) return fail(i, { reason: 'cooldown', key: S.CAST_FAIL.cooldown });
      if (!v.ok && v.reason !== 'cooldown') return fail(i, v);
      forward(DIRECT[id], 'keydown'); if (how === 'click') setTimeout(() => forward(DIRECT[id], 'keyup'), 60);
      return;
    }
    const tgt = currentTarget();
    const r = S.cast(caster, rec, id, now(), { dead: dead(), target: tgt ? { dist: tgt.dist } : null });
    if (!r.ok) return fail(i, r);
    caster = r.caster; applyNode(id, tgt);
    emit('skill.cast', { id, slot: i + 1, targetId: tgt ? tgt.mob.id : undefined, manaCost: r.manaCost, cooldownMs: r.cooldownMs });
  }
  /** The fight's own cooldown left for a base skill (ms), so the sweep matches what the game allows. */
  function baseCooldown(id) {
    const M = mobsOf();
    if (id === 'strike' && M && M.actions) return M.actions.strikeCd * 1000;
    if (id === 'dash' && M && M.actions) return M.actions.dashCd * 1000;
    return 0;
  }
  function applyNode(id, tgt) {
    const M = mobsOf(), brain = M && M.brain, t0 = now();
    const enemies = brain ? brain.mobs.filter((m) => m.state !== 'dead' && m.state !== 'gone').map((m) => ({ id: m.id, hp: m.hp, pos: m.pos, boss: !!m.T.elite, mark: m.rpgMark })) : [];
    const target = tgt ? enemies.find((e) => e.id === tgt.mob.id) : null;
    const lanceBase = 20;   // play/mobs.js CAST_DAMAGE.lance at the time of writing; Babel multiplies it
    const out = S.applyEffect(id, { caster, self: { ...self, pos: ctx.player ? ctx.player.pos : [0, 0, 0] }, target, enemies, now: t0, base: { lance: lanceBase } });
    self = { ...self, buffs: out.self.buffs };
    if (brain) {
      for (const h of out.hits) { const m = brain.mobs.find((x) => x.id === h.id); if (m) brain.pending.push({ at: 0, mob: m, amount: h.amount, root: 0 }); }
      for (const e of out.enemies) if (e.silencedUntil) { const m = brain.mobs.find((x) => x.id === e.id); if (m) { m.cooldown = Math.max(m.cooldown || 0, (e.silencedUntil - t0) / 1000); if (m.state === 'windup') { m.state = 'recover'; m.t = 0; } } }
      if (out.target && out.target.mark) { const m = brain.mobs.find((x) => x.id === out.target.id); if (m) m.rpgMark = out.target.mark; }
    }
    hud.log(t('hud.cast', { name: skillById(id).name }), 'sys');
  }
  // the game's casts: mana and cooldown are spent when the cast leaves her hands (plan 5.8)
  let lastSkill = { id: 'strike', at: 0 };
  const onCastEvent = (e) => {
    const d = e.detail || {}; if (!BASE[d.id]) return;
    if (d.phase === 'release') lastSkill = { id: d.id, at: now() };
    if (d.phase === 'start') cast = { id: d.id, name: BASE[d.id].name, t0: now(), dur: (d.release || 0) * 1000 };
    if (d.phase === 'release') { const r = S.cast({ ...caster, gcd: 0, ready: { ...caster.ready, [d.id]: 0 } }, rec, d.id, now()); if (r.ok) { caster = r.caster; emit('skill.cast', { id: d.id, slot: bar.indexOf(d.id) + 1, manaCost: r.manaCost, cooldownMs: r.cooldownMs }); } cast = null; }
  };
  win.addEventListener('ftf:cast', onCastEvent);

  // ------------------------------------------------------------------ keys (capture: before the game's input sees them)
  const typing = (e) => { const el = e.target; return !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || ''))) || !!doc.querySelector('dialog[open]'); };
  const active = () => (ctx.active ? ctx.active() : !!(win.__ftf && win.__ftf.town && win.__ftf.town.active));   // the town phase only (not the archipelago)
  const onKey = (e) => {
    if (e.__rpg || !active() || typing(e) || (e.target && e.target.closest && e.target.closest('.rpg-modal:not([hidden])'))) return;   // keys inside the tree or the sheet are theirs
    const action = actionOf(e.code) || FIXED_ALIASES[e.code] || null; if (!action) return;
    const down = e.type === 'keydown';
    const slot = /^hotbar(\d)$/.exec(action);
    if (slot) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat || !down) press(Number(slot[1]) - 1, 'key', !down); return; }
    if (DIRECT[action] && down && !e.repeat) {                                       // F / Q / V / Space: mana and cooldown gate, then the game handles it
      const v = S.validateCast(caster, rec, action, now(), { dead: dead() });
      if (!v.ok && v.reason === 'mana') { e.preventDefault(); e.stopImmediatePropagation(); fail(bar.indexOf(action), v); }
      return;
    }
    if (!down) return;
    if (action === 'target') { e.preventDefault(); e.stopImmediatePropagation(); cycleTarget(); return; }
    if ((WINDOWS.includes(action) || action === 'help') && blocksWindows()) { e.preventDefault(); e.stopImmediatePropagation(); return; }   // a first-time overlay runs
    if (WINDOWS.includes(action) && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); openWindow(action); return; }
    if (action === 'help') { e.preventDefault(); e.stopImmediatePropagation(); openWindow('help'); }
  };
  win.addEventListener('keydown', onKey, true); win.addEventListener('keyup', onKey, true);
  const offBind = onBindings(() => { /* labels repaint every frame */ });
  function cycleTarget() {
    const M = mobsOf(); if (!M || !M.brain || !ctx.player) return;
    const p = ctx.player.pos, list = M.brain.mobs.filter((m) => m.state !== 'dead' && m.state !== 'gone' && Math.hypot(m.pos[0] - p[0], m.pos[2] - p[2]) < 25)
      .sort((a, b) => Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) - Math.hypot(b.pos[0] - p[0], b.pos[2] - p[2]));
    if (!list.length) { targetId = null; return; }
    const i = list.findIndex((m) => m.id === targetId); targetId = list[(i + 1) % list.length].id;
  }
  function openWindow(id) {
    if (id !== 'menu' && blocksWindows()) return;                                   // a first-time overlay runs: windows wait
    if (id === 'menu') { if (ctx.openMenu) ctx.openMenu(); else { const e = new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }); e.__rpg = true; win.dispatchEvent(e); } return; }
    if (id === 'skills') { import('./skill-tree-ui.js').then((m) => { tree = tree || m.createSkillTree({ doc, t, api }); tree.toggle(); open.skills = tree.isOpen; }); return; }
    if (id === 'character') { import('./character-panel.js').then((m) => { sheet = sheet || m.createCharacterPanel({ doc, t, api }); sheet.toggle(); open.character = sheet.isOpen; }); return; }
    if (id === 'help') {                                                             // F1: the read-only cheat sheet (rebind lives in Settings -> Controls)
      import('./cheat-sheet.js').then((m) => { cheat = cheat || m.createCheatSheet({ doc, t, touch: () => !!(ctx.keys && ctx.keys.touchControls),
        onRebind: () => { if (ctx.openSettings) ctx.openSettings('controls'); else win.dispatchEvent(new CustomEvent('ftf:open-window', { detail: { id: 'settings', tab: 'controls' } })); },
        onGlossary: () => import('../npe/glossary.js').then((g) => g.openGlossary({ doc, t: ctx.t })).catch(() => win.dispatchEvent(new CustomEvent('ftf:open-window', { detail: { id: 'glossary' } }))) });
        cheat.toggle(); });
      return;
    }
    if (id === 'market') { win.dispatchEvent(new CustomEvent('ftf:market-open', { detail: { tab: 'buy' } })); return; } // B and the tray: boot-world mounts market/ lazily on this event
    if (ctx.ui && ctx.ui.open) ctx.ui.open(id); else win.dispatchEvent(new CustomEvent('ftf:open-window', { detail: { id } }));
  }

  // ------------------------------------------------------------------ XP, levels, kills
  let lastXp = ctx.ledger ? ctx.ledger.xp : 0;
  const onXp = () => {
    const x = ctx.ledger ? ctx.ledger.xp : 0; if (x === lastXp) return;
    const gained = x - lastXp, lv = levelsGained(lastXp, x); lastXp = x;
    if (gained > 0) { emit('xp.gained', { amount: gained, source: 'kill', total: x }); hud.log(t('hud.log.xp', { n: gained }), 'xp'); }
    for (const n of lv) {
      L = n; refreshStats(); self = { ...self, hp: stats.maxHP }; caster = { ...caster, mana: stats.maxMana };
      const sp = S.pointsLeft(n, rec), tp = statPointsLeft(n, rec);
      emit('level.up', { level: n, skillPoints: sp, statPoints: tp });
      hud.levelUp(n); hud.log(t('hud.levelup.log', { n, sp, tp }), 'quest');
    }
  };
  const offLedger = ctx.ledger && ctx.ledger.subscribe ? ctx.ledger.subscribe(onXp) : null;
  // Voice (+2% skill damage per point) and Clear Diction (+10% Lance): the fight's own hit (bus 'mob.hit') gets its bonus
  // as a follow-up hit through the brain's queue; the follow-ups are remembered so they never earn a bonus themselves
  const bonusOut = [];
  const onHit = (p) => {
    if (!p || !p.id || !(p.dmg > 0)) return;
    const k = bonusOut.findIndex((b) => b.id === p.id && b.amount === p.dmg); if (k >= 0) { bonusOut.splice(k, 1); return; }
    const skill = now() - lastSkill.at < 1500 ? lastSkill.id : 'strike';
    const extra = Math.round(p.dmg * (S.damageMult(L, rec, skill) - 1));
    const M = mobsOf(), m = M && M.brain && M.brain.mobs.find((x) => x.id === p.id && x.state !== 'dead' && x.state !== 'gone');
    if (extra > 0 && m) { bonusOut.push({ id: p.id, amount: extra }); if (bonusOut.length > 50) bonusOut.shift(); M.brain.pending.push({ at: 0.05, mob: m, amount: extra, root: 0 }); }
  };
  const offHit = ctx.bus && ctx.bus.on ? ctx.bus.on('mob.hit', onHit) : null;
  const onKill = (e) => {
    const d = e.detail || {}; if (!d.type) return;
    hud.log(t('hud.log.kill', { mob: mobDisplayName(d.type) }), 'sys');
    const p = S.passives(rec).killXpPct;                                             // Scholar: Field Notes
    if (p > 0 && ctx.ledger && ctx.ledger.grant) ctx.ledger.grant({ xp: Math.round(xpForKill(d.type, !!d.elite) * p) });
    if (targetId && !mobById(targetId)) targetId = null;
  };
  win.addEventListener('ftf:mob-killed', onKill);
  const onCloseAll = () => { for (const w of [tree, sheet, cheat]) if (w && w.isOpen) w.close(); };
  win.addEventListener('ftf:close-windows', onCloseAll);

  // ------------------------------------------------------------------ the API the tree, the sheet and e2e use
  const api = {
    get level() { return L; }, get rec() { return rec; }, get bar() { return bar; }, get stats() { return stats; },
    pointsLeft: () => S.pointsLeft(L, rec), statLeft: () => statPointsLeft(L, rec), canLearn: (id) => S.canLearn(L, rec, id),
    learn(id) { const r = S.learn(L, rec, id); if (!r.ok) return r; rec = r.rec; bar = S.assignLearned(bar, id); refreshStats(); save(); emit('skill.learned', { id, branch: NODE[id].branch, pointsLeft: S.pointsLeft(L, rec) }); return r; },
    respec() { const r = S.respec(rec, Date.now()); if (!r.ok) return r; rec = r.rec; bar = S.pruneHotbar(bar, rec); refreshStats(); save(); emit('skill.respec', { costSilk: 0, free: r.free }); return r; },
    spend(stat) { const r = spendStat(L, rec, stat); if (!r.ok) return r; rec = r.rec; refreshStats(); save(); emit('stat.spent', { stat, value: rec.stats[stat] }); return r; },
    place(slot, id) { bar = S.placeOnSlot(bar, slot, id); save(); },
    get xp() { return levelNow(); },
  };
  if (win.location && /[?&]test=1\b/.test(win.location.search)) {
    win.__ftfTest = win.__ftfTest || {};
    win.__ftfTest.rpg = { grantXp: (n) => ctx.ledger && ctx.ledger.grant && ctx.ledger.grant({ xp: n }), setLevel: (n) => ctx.ledger && ctx.ledger.grant && ctx.ledger.grant({ xp: Math.max(0, 50 * (n - 1) * n - ctx.ledger.xp) }),
      learn: (id) => api.learn(id), spend: (stat) => api.spend(stat), cast: (slot) => press(slot - 1, 'click'), state: () => ({ level: L, rec, bar, mana: caster.mana, hp: self.hp, maxHP: stats.maxHP, maxMana: stats.maxMana, lines: hud.lines }) };
  }

  // ------------------------------------------------------------------ per frame
  return {
    api, hud,
    update(dt) {
      const on = active(); hud.setVisible(on); if (!on) return;
      const tnow = now(), M = mobsOf();
      caster = S.regenMana(caster, stats.manaRegen, stats.maxMana, dt);
      // HP: the fight's 0..100 is the share of her max HP; every drop goes through the defences
      if (M && M.iris) {
        const w = M.iris.hp;
        if (lastWorldHp != null && w < lastWorldHp - 1e-6) {
          const dmg = lastWorldHp - w, r = S.takeDamage({ ...self, hp: lastWorldHp / WORLD_HP * stats.maxHP }, dmg, tnow, rec);
          self = { ...r.self, maxHP: stats.maxHP }; M.iris.hp = Math.max(0, self.hp / stats.maxHP * WORLD_HP);
          if (ctx.floatNumber && r.taken > 0 && ctx.player) ctx.floatNumber({ kind: 'taken', amount: r.taken, pos: [ctx.player.pos[0], ctx.player.pos[1] + 1.9, ctx.player.pos[2]] });
        } else self = { ...self, hp: w / WORLD_HP * stats.maxHP, maxHP: stats.maxHP };
        lastWorldHp = M.iris.hp;
      }
      for (const k of Object.keys(self.buffs)) if (self.buffs[k].until <= tnow) { const b = { ...self.buffs }; delete b[k]; self = { ...self, buffs: b }; }
      const keyOf = (i) => keyLabel(bindings()['hotbar' + (i + 1)]);
      const slots = bar.map((id, i) => {
        let cd = id ? S.cooldownLeft(caster, id, tnow) : null;
        if (id && (id === 'strike' || id === 'dash')) { const ms = baseCooldown(id); cd = ms > 0 ? { ms, total: BASE[id].cooldownMs, global: false } : null; }
        const sk = id && skillById(id);
        return { id, key: keyOf(i), pressed: (pressed[i] || 0) > tnow, ...slotView({ id, cd, mana: caster.mana, manaCost: sk ? sk.mana || 0 : 0, flash: (flash[i] || 0) > tnow }) };
      });
      const tg = currentTarget();
      const xi = levelNow();
      if (xi.level !== L && !levelsGained(lastXp, ctx.ledger ? ctx.ledger.xp : 0).length) { L = xi.level; refreshStats(); }
      const sv = silkView(); silkPop = lastGate != null && sv.gateC > lastGate; lastGate = sv.gateC;
      const sp = S.pointsLeft(L, rec), tp = statPointsLeft(L, rec);
      const skin = (ctx.skin ? ctx.skin() : (win.__ftf && win.__ftf.iris && win.__ftf.iris.hero && win.__ftf.iris.hero.id)) || 'iris';
      hud.render({
        portrait: (ctx.base || '/') + 'assets/cards/' + skin + '.webp', name: skin === 'elise' ? 'Elise' : 'Iris',
        level: L, hp: self.hp, maxHP: stats.maxHP, mana: caster.mana, maxMana: stats.maxMana, manaPulse: manaPulseUntil > tnow,
        target: tg ? { name: mobDisplayName(tg.mob.type).replace(/^./, (c) => c.toUpperCase()), hp: tg.mob.hp, maxHp: tg.mob.T.hp, elite: !!tg.mob.T.elite } : null,
        buffs: Object.entries(self.buffs).map(([id, b]) => ({ id, name: id, left: (b.until - tnow) / 1000, debuff: false })),
        cast: cast && cast.dur > 300 ? { name: cast.name, p: Math.min(1, (tnow - cast.t0) / cast.dur) } : null,
        slots, xpInto: xi.into, xpNeed: xi.need, silk: sv, silkPop,
        open: { skills: !!(tree && tree.isOpen), character: !!(sheet && sheet.isOpen) }, badges: { skills: sp > 0 && L >= 2, character: tp > 0 },
        coords: ctx.player && map ? map.coords() : null, zoomMin: map && map.atMin, zoomMax: map && map.atMax,
      });
      if (map) map.draw(dt);
      const mk = doc.querySelector('.ftf-mk > button'); if (mk) { const full = mk.textContent.trim(); if (mk.title !== full) mk.title = full; }   // R7: the cut ticker keeps its full text
      if (tree && tree.isOpen) tree.refresh(); if (sheet && sheet.isOpen) sheet.refresh();
    },
    dispose() {
      win.removeEventListener('keydown', onKey, true); win.removeEventListener('keyup', onKey, true); win.removeEventListener('ftf:cast', onCastEvent); win.removeEventListener('ftf:mob-killed', onKill); win.removeEventListener('ftf:close-windows', onCloseAll);
      if (offLedger) offLedger(); if (offHit) offHit(); offBind(); hud.dispose(); if (tree) tree.dispose(); if (sheet) sheet.dispose(); if (cheat) cheat.dispose();
    },
  };
}
