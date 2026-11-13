// Skill rules (sprint plan 5.7 and 5.8): learning tree nodes, the respec, the passive bonuses, the cast validation
// order with its failure messages, cooldowns (own and the 0.5 s global), mana, the effects of the active nodes and the
// damage pipeline (brace, shield, unbroken), and the hotbar layout. Pure: clocks and state are passed in.
import { NODE, NODES, BASE, skillById, GLOBAL_COOLDOWN_MS } from './skills-data.js';
import { skillPointsAt, derived } from './progression.js';

export const RESPEC_COOLDOWN_MS = 5 * 60 * 1000;
export const HOTBAR_SLOTS = 9;
export const HOTBAR_KEY = 'ftf.hotbar.v1';

// ------------------------------------------------------------------ learning

/** Skill points spent by a record and left at level L. */
export const pointsSpent = (rec) => (rec.learned || []).reduce((a, id) => a + ((NODE[id] && NODE[id].cost) || 0), 0);
export const pointsLeft = (L, rec) => skillPointsAt(L) - pointsSpent(rec);

/** Can node `id` be learned now? {ok, reason?, need?}: reason unknown | learned | level | requires | points. */
export function canLearn(L, rec, id) {
  const n = NODE[id];
  if (!n) return { ok: false, reason: 'unknown' };
  const learned = rec.learned || [];
  if (learned.includes(id)) return { ok: false, reason: 'learned' };
  if (n.requires && !learned.includes(n.requires)) return { ok: false, reason: 'requires', need: n.requires };
  if (L < n.level) return { ok: false, reason: 'level', need: n.level };
  if (pointsLeft(L, rec) < n.cost) return { ok: false, reason: 'points', need: n.cost };
  return { ok: true };
}

/** Learn a node: {ok, rec, reason?}. Pure. */
export function learn(L, rec, id) {
  const c = canLearn(L, rec, id);
  if (!c.ok) return { ...c, rec };
  return { ok: true, rec: { ...rec, learned: [...(rec.learned || []), id] } };
}

/** Reset skills and stats: free the first time, then once per RESPEC_COOLDOWN_MS. No silk is spent. */
export function respec(rec, now) {
  const free = !rec.respecs;
  if (!free && now - (rec.respecAt || 0) < RESPEC_COOLDOWN_MS) return { ok: false, rec, reason: 'cooldown', waitMs: RESPEC_COOLDOWN_MS - (now - (rec.respecAt || 0)) };
  return { ok: true, free, rec: { ...rec, learned: [], stats: { voice: 0, mind: 0, grit: 0 }, respecs: (rec.respecs || 0) + 1, respecAt: now } };
}

/** The passive bonuses of the learned nodes. */
export function passives(rec) {
  const p = { hpPct: 0, manaRegenPct: 0, killXpPct: 0, questXpPct: 0, dropPct: 0, skillDamage: {}, hpRegenMult: 1, damageTakenPct: 0, unbroken: false };
  for (const id of rec.learned || []) {
    const e = NODE[id] && NODE[id].effect; if (!e) continue;
    if (e.type === 'maxHp') p.hpPct += e.pct;
    else if (e.type === 'manaRegen') p.manaRegenPct += e.pct;
    else if (e.type === 'killXp') p.killXpPct += e.pct;
    else if (e.type === 'questXp') p.questXpPct += e.pct;
    else if (e.type === 'dropChance') p.dropPct += e.pct;
    else if (e.type === 'skillDamage') p.skillDamage[e.skill] = (p.skillDamage[e.skill] || 0) + e.pct;
    else if (e.type === 'hpRegen') p.hpRegenMult *= e.mult;
    else if (e.type === 'unbroken') { p.unbroken = true; p.damageTakenPct += e.damageTakenPct; }
  }
  return p;
}

/** Derived numbers of a record at level L, the passives folded in. */
export const statsOf = (L, rec) => { const p = passives(rec); return derived(L, rec.stats, { hpPct: p.hpPct, manaRegenPct: p.manaRegenPct, hpRegenMult: p.hpRegenMult, damageTakenPct: p.damageTakenPct }); };

/** Skill damage multiplier: Voice and the node bonus for that skill. */
export const damageMult = (L, rec, skill) => 1 + statsOf(L, rec).damageBonus + (passives(rec).skillDamage[skill] || 0);

/** XP after the Scholar passives (kills and quests). Rounded. */
export const xpAfterPassives = (rec, amount, source) => { const p = passives(rec); return Math.round(amount * (1 + (source === 'quest' ? p.questXpPct : source === 'kill' ? p.killXpPct : 0))); };

// ------------------------------------------------------------------ casting

/** The player-facing message key of each failed validation (play/locales en-hud). */
export const CAST_FAIL = Object.freeze({ dead: 'hud.fail.dead', unlearned: 'hud.fail.unlearned', cooldown: 'hud.fail.cooldown', mana: 'hud.fail.mana', target: 'hud.fail.target', range: 'hud.fail.range' });

/** A fresh caster: mana, cooldown deadlines per skill (ms), the global cooldown, the last damaging hit (for Echo). */
export const initialCaster = (maxMana) => ({ mana: maxMana, ready: {}, gcd: 0, last: null });

/** Is a skill usable by this record (base skills always; nodes when learned and active)? */
export const knows = (rec, id) => !!BASE[id] || ((rec.learned || []).includes(id) && NODE[id] && NODE[id].kind === 'active');

/**
 * Validate a cast in the plan's order: not dead -> learned -> off cooldown (own and global) -> mana -> target -> range.
 * @param {{dead?:boolean, target?:{dist:number}|null}} ctx
 * @returns {{ok:true}|{ok:false, reason:string, key:string, waitMs?:number}}
 */
export function validateCast(caster, rec, id, now, ctx = {}) {
  const s = skillById(id), fail = (reason, extra) => ({ ok: false, reason, key: CAST_FAIL[reason], ...extra });
  if (ctx.dead) return fail('dead');
  if (!s || !knows(rec, id)) return fail('unlearned');
  const ready = Math.max(caster.ready[id] || 0, caster.gcd);
  if (now < ready) return fail('cooldown', { waitMs: ready - now });
  if (caster.mana < (s.mana || 0)) return fail('mana');
  if (s.needsTarget && !ctx.target) return fail('target');
  if (s.needsTarget && s.range && ctx.target.dist > s.range) return fail('range');
  return { ok: true };
}

/** Cast: validate, then spend the mana and start the cooldowns (at effect time). Returns {ok, caster, ...}. */
export function cast(caster, rec, id, now, ctx = {}) {
  const v = validateCast(caster, rec, id, now, ctx);
  if (!v.ok) return { ...v, caster };
  const s = skillById(id);
  const next = { ...caster, mana: caster.mana - (s.mana || 0), ready: { ...caster.ready, [id]: now + (s.cooldownMs || 0) }, gcd: now + GLOBAL_COOLDOWN_MS };
  return { ok: true, caster: next, manaCost: s.mana || 0, cooldownMs: s.cooldownMs || 0 };
}

/** Cooldown left for a slot's skill: {ms, total, global} (global: only the 0.5 s global cooldown runs). */
export function cooldownLeft(caster, id, now) {
  const s = skillById(id), own = Math.max(0, (caster.ready[id] || 0) - now), g = Math.max(0, caster.gcd - now);
  if (own >= g) return { ms: own, total: (s && s.cooldownMs) || 0, global: false };
  return { ms: g, total: GLOBAL_COOLDOWN_MS, global: true };
}

/** Mana regeneration over dt seconds, capped at max. */
export const regenMana = (caster, perSecond, maxMana, dt) => ({ ...caster, mana: Math.min(maxMana, caster.mana + perSecond * dt) });

/** Remember the last damaging hit (Echo repeats it). */
export const noteDamage = (caster, skill, amount, targetId) => ({ ...caster, last: { skill, amount, targetId } });

// ------------------------------------------------------------------ effects (on plain combatants)

/**
 * Apply an active node's effect. `self` {hp, maxHP, buffs: {}}, `target` {id, hp, pos, boss?, marks?},
 * `enemies` [{id, hp, pos, boss?}]. Returns {hits: [{id, amount}], self, target, enemies} (new objects).
 */
export function applyEffect(id, { caster, self, target = null, enemies = [], now, base = {} }) {
  const n = NODE[id], e = n && n.effect, out = { hits: [], self: { ...self, buffs: { ...(self.buffs || {}) } }, target: target && { ...target }, enemies: enemies.map((x) => ({ ...x })) };
  if (!e) return out;
  const markMult = (t) => (t && t.mark && t.mark.until > now ? 1 + t.mark.pct : 1);
  if (e.type === 'echo' && caster.last && target) out.hits.push({ id: target.id, amount: Math.round(caster.last.amount * e.power * markMult(target)) });
  else if (e.type === 'hush') {
    const c = self.pos || [0, 0, 0];
    for (const m of out.enemies) if (Math.hypot(m.pos[0] - c[0], m.pos[2] - c[2]) <= e.radius) m.silencedUntil = now + 1000 * (m.boss ? e.bossSeconds : e.seconds);
  } else if (e.type === 'mark' && out.target) out.target.mark = { pct: e.pct, until: now + e.seconds * 1000 };
  else if (e.type === 'burst' && target) {
    const amt = (base[e.of] || 0) * e.power;
    for (const m of out.enemies) if (Math.hypot(m.pos[0] - target.pos[0], m.pos[2] - target.pos[2]) <= e.radius) out.hits.push({ id: m.id, amount: Math.round(amt * markMult(m)) });
  } else if (e.type === 'brace') out.self.buffs.brace = { pct: e.pct, until: now + e.seconds * 1000 };
  else if (e.type === 'shield') out.self.buffs.shield = { left: Math.round(self.maxHP * e.pct), until: now + e.seconds * 1000 };
  else if (e.type === 'reveal') out.self.buffs.reveal = { until: now + e.seconds * 1000, lootRange: e.lootRange };
  return out;
}

/**
 * Damage taken by the player through the defences: brace, the passive reduction, the shield, then Unbroken (a hit
 * that would kill leaves 1 HP once per 120 s). Returns {self, taken, absorbed, saved}.
 */
export function takeDamage(self, amount, now, rec) {
  const p = passives(rec), s = { ...self, buffs: { ...(self.buffs || {}) } };
  let a = amount * (1 - p.damageTakenPct);
  if (s.buffs.brace && s.buffs.brace.until > now) a *= 1 - s.buffs.brace.pct;
  a = Math.round(a);
  let absorbed = 0;
  if (s.buffs.shield && s.buffs.shield.until > now && s.buffs.shield.left > 0) {
    absorbed = Math.min(a, s.buffs.shield.left); a -= absorbed;
    s.buffs.shield = { ...s.buffs.shield, left: s.buffs.shield.left - absorbed };
  }
  let saved = false;
  if (a >= s.hp && p.unbroken && now >= (s.unbrokenReady || 0)) { a = s.hp - 1; saved = true; s.unbrokenReady = now + 120000; }
  s.hp = Math.max(0, s.hp - a);
  return { self: s, taken: a, absorbed, saved };
}

// ------------------------------------------------------------------ hotbar

/** The default layout: Strike, Lance, Snare, Dash on slots 1 to 4, the rest empty. */
export const defaultHotbar = () => ['strike', 'lance', 'snare', 'dash', null, null, null, null, null];

/** A clean layout from stored data (unknown ids dropped, length 9, no duplicates). */
export function cleanHotbar(v) {
  const out = defaultHotbar();
  if (!Array.isArray(v)) return out;
  const seen = new Set();
  for (let i = 0; i < HOTBAR_SLOTS; i++) { const id = v[i]; out[i] = id && skillById(id) && !seen.has(id) ? id : null; if (out[i]) seen.add(out[i]); }
  return out;
}

/** A newly learned active node goes to the first empty slot among 5 to 9 (unless it is already on the bar). */
export function assignLearned(layout, id) {
  const n = NODE[id];
  if (!n || n.kind !== 'active' || layout.includes(id)) return layout.slice();
  const i = layout.findIndex((x, k) => k >= 4 && !x);
  if (i < 0) return layout.slice();
  const out = layout.slice(); out[i] = id; return out;
}

/** Put a skill on a slot (0-based); it leaves any other slot it was on; null clears the slot. */
export function placeOnSlot(layout, slot, id) {
  if (slot < 0 || slot >= HOTBAR_SLOTS) return layout.slice();
  const out = layout.map((x) => (x === id ? null : x)); out[slot] = id || null; return out;
}

/** After a respec: tree skills leave the bar (base skills stay where they are). */
export const pruneHotbar = (layout, rec) => layout.map((id) => (id && (BASE[id] || (rec.learned || []).includes(id)) ? id : null));

export const ALL_NODES = NODES;
