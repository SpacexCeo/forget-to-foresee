// The Glass Shoal (docs/plans/boss/glass-shoal-boss.md): the rules of the level-5 main quest, the dragon ride's
// corridor, and the Hollow Tide boss fight. Pure functions over plain objects: no DOM, no three.js, no clock.
// scenes/glass-shoal.js runs them every frame; tests/client/glass-shoal.test.mjs checks them.

const f = Object.freeze;

// ---------------------------------------------------------------- the quest
export const SHOAL_KEY = 'ftf.shoal.v1';
export const UNLOCK_LEVEL = 5;
/** The quest's steps in order. `done` is the state after the return. */
export const QUEST_STEPS = f(['find_blade', 'reach_stone', 'ride', 'defeat', 'return', 'done']);
export const REWARD = f({ xp: 600, chest: 'legendary', title: 'Tidebreaker' });

/** A fresh save: the quest not yet offered. */
export const freshShoal = () => ({ v: 1, step: null, blade: false, title: null, wins: 0, deaths: 0 });

/** Pure: a stored save (string or object) -> a valid save, anything broken -> fresh. */
export function readShoal(raw) {
  let p = raw;
  try { if (typeof raw === 'string') p = JSON.parse(raw); } catch { p = null; }
  if (!p || typeof p !== 'object' || p.v !== 1) return freshShoal();
  const s = { ...freshShoal(), ...p };
  if (s.step !== null && !QUEST_STEPS.includes(s.step)) s.step = null;
  return s;
}

/** Pure: is the quest offered (level 5 reached, not yet taken)? */
export const questOffered = (save, level) => save.step === null && (Number(level) || 0) >= UNLOCK_LEVEL;
/** Pure: is the quest active (taken, not finished)? The giver's gold glow runs while offered or active. */
export const questActive = (save) => save.step !== null && save.step !== 'done';

/**
 * Pure: the save after an event. Events: 'accept', 'blade' (the Loomblade picked up), 'stone' (at the cliff stone),
 * 'mount' (on the dragon), 'landed' (on the Shoal), 'boss_down', 'home' (back at the cliff stone or in town).
 * An event out of order leaves the save unchanged (the same object), so callers can compare by identity.
 */
export function questEvent(save, ev, level = UNLOCK_LEVEL) {
  const s = save.step;
  const to = (step, extra = {}) => ({ ...save, step, ...extra });
  switch (ev) {
    case 'accept': return questOffered(save, level) ? to(save.blade ? 'reach_stone' : 'find_blade') : save;
    case 'blade': return s === 'find_blade' ? to('reach_stone', { blade: true }) : (!save.blade && s !== null ? { ...save, blade: true } : save);
    case 'stone': return s === 'reach_stone' ? to('ride') : save;
    case 'mount': return s === 'reach_stone' || s === 'ride' ? to('ride') : save;
    case 'landed': return s === 'ride' ? to('defeat') : save;
    case 'boss_down': return s === 'defeat' ? to('return', { wins: save.wins + 1, title: REWARD.title }) : save;
    case 'home': return s === 'return' ? to('done') : save;
    case 'death': return { ...save, deaths: save.deaths + 1 };
    default: return save;
  }
}

/** Pure: the tracker line's text key for a save (null when nothing to show). */
export function trackerKey(save, level) {
  if (questOffered(save, level)) return 'shoal.track.offer';
  if (!questActive(save)) return null;
  return 'shoal.track.' + save.step;
}

// ---------------------------------------------------------------- the ride
/**
 * The flight corridor, in its own frame: the dragon flies from z = 0 to z = length along +z (the caller turns and
 * places it). Half width and the height band bound it; a soft leash steers the dragon back near the edges.
 */
export const RIDE = f({ length: 520, halfWidth: 38, minY: 18, maxY: 70, speed: 11, steer: 14, climb: 7, leash: 0.7, startY: 34 });

/** Pure: a fresh ride state (the dragon at the corridor's start). */
export const freshRide = () => ({ x: 0, y: RIDE.startY, z: 0, vx: 0, vy: 0, bank: 0, t: 0, done: false });

/**
 * Pure: one ride step. `steer` is [-1..1, -1..1] (left/right, down/up). Past `leash` of the half width or the
 * height band the leash pushes back harder than the player can steer, so the dragon can never leave the corridor.
 */
export function rideStep(st, steer, dt, R = RIDE) {
  if (st.done) return st;
  const sx = Math.max(-1, Math.min(1, Number(steer && steer[0]) || 0));
  const sy = Math.max(-1, Math.min(1, Number(steer && steer[1]) || 0));
  const midY = (R.minY + R.maxY) / 2, halfY = (R.maxY - R.minY) / 2;
  const nx = st.x / R.halfWidth, ny = (st.y - midY) / halfY;
  const pull = (n) => (Math.abs(n) > R.leash ? -Math.sign(n) * ((Math.abs(n) - R.leash) / (1 - R.leash)) * 2.2 : 0);
  const ax = (sx + pull(nx)) * R.steer, ay = (sy + pull(ny)) * R.climb;
  const vx = st.vx + (ax - st.vx * 1.8) * dt, vy = st.vy + (ay - st.vy * 2.2) * dt;
  const x = Math.max(-R.halfWidth, Math.min(R.halfWidth, st.x + vx * dt));
  const y = Math.max(R.minY, Math.min(R.maxY, st.y + vy * dt));
  const z = Math.min(R.length, st.z + R.speed * dt);
  const bank = st.bank + (-vx / R.steer * 0.9 - st.bank) * Math.min(1, dt * 3);
  return { x, y, z, vx: x === st.x + vx * dt ? vx : 0, vy: y === st.y + vy * dt ? vy : 0, bank, t: st.t + dt, done: z >= R.length };
}
/** Pure: the ride's progress 0..1. */
export const rideProgress = (st, R = RIDE) => Math.max(0, Math.min(1, st.z / R.length));
/** Pure: the ride's full length in seconds (the spec asks for about 40 to 60 s). */
export const rideSeconds = (R = RIDE) => R.length / R.speed;

// ---------------------------------------------------------------- the arena
/** The Shoal in its own frame (the scene places it): a round, flat salt plain; positions are [x, z]. */
export const ARENA = f({
  radius: 46,
  landing: f([0, 34]),
  boss: f([0, -10]),
  chest: f([0, -4]),
  lamp: f([14, 22]),
  pickups: f([f({ id: 'hp1', kind: 'hp', at: f([-18, 8]) }), f({ id: 'hp2', kind: 'hp', at: f([20, 4]) }), f({ id: 'st1', kind: 'stamina', at: f([0, 20]) }), f({ id: 'hp3', kind: 'hp', at: f([-6, -26]) })]),
  monoliths: f([f([-30, 18]), f([28, 20]), f([-36, -8]), f([34, -14]), f([-14, -36]), f([18, -34])]),
  spires: f([f([-70, -60]), f([-40, -82]), f([10, -90]), f([55, -74]), f([80, -40]), f([-85, -20])]),
});
/** Pure: keep a point on the plain (a soft wall at the rim). */
export function clampToArena(x, z, A = ARENA) {
  const d = Math.hypot(x, z);
  if (d <= A.radius) return [x, z];
  const k = A.radius / d; return [x * k, z * k];
}

// ---------------------------------------------------------------- the heroine in the fight
export const HERO = f({ hp: 100, stamina: 100, mana: 100, manaRegen: 6, staminaRegen: 18, dodgeCost: 25, dodgeTime: 0.45, dodgeSpeed: 15, speed: 6.5, hpPickup: 35, staminaPickup: 60, pickupRespawn: 22, pickupRadius: 1.6 });
export const freshHero = () => ({ hp: HERO.hp, stamina: HERO.stamina, mana: HERO.mana, dodge: 0, iframes: 0, cds: {} });

/** Pure: can she dodge now (stamina, not mid-dodge)? */
export const canDodge = (h) => h.dodge <= 0 && h.stamina >= HERO.dodgeCost;
/** Pure: start a dodge: stamina spent, invulnerable for the roll. */
export const startDodge = (h) => (canDodge(h) ? { ...h, stamina: h.stamina - HERO.dodgeCost, dodge: HERO.dodgeTime, iframes: HERO.dodgeTime } : h);
/** Pure: the hero's timers and regeneration for dt. */
export function heroTick(h, dt) {
  const cds = {}; for (const k in h.cds) { const v = h.cds[k] - dt; if (v > 0) cds[k] = v; }
  return { ...h, dodge: Math.max(0, h.dodge - dt), iframes: Math.max(0, h.iframes - dt), cds,
    stamina: Math.min(HERO.stamina, h.stamina + (h.dodge > 0 ? 0 : HERO.staminaRegen * dt)), mana: Math.min(HERO.mana, h.mana + HERO.manaRegen * dt) };
}
/** Pure: a hit on the hero. Ignored during the dodge's invulnerable frames. Returns {hero, taken, dodged}. */
export function hitHero(h, amount) {
  if (h.iframes > 0) return { hero: h, taken: 0, dodged: true };
  const taken = Math.max(0, Math.round(amount));
  return { hero: { ...h, hp: Math.max(0, h.hp - taken) }, taken, dodged: false };
}
/** Pure: use a skill (from rpg/shoal-skills.js): mana and its cooldown, or null when not ready. */
export function useSkill(h, skill) {
  if (!skill || (h.cds[skill.id] || 0) > 0 || h.mana < (skill.mana || 0)) return null;
  return { ...h, mana: h.mana - (skill.mana || 0), cds: { ...h.cds, [skill.id]: (skill.cooldownMs || 0) / 1000 } };
}
/** Pure: pick up an orb. */
export function pickUp(h, kind) {
  if (kind === 'hp') return { ...h, hp: Math.min(HERO.hp, h.hp + HERO.hpPickup) };
  if (kind === 'stamina') return { ...h, stamina: Math.min(HERO.stamina, h.stamina + HERO.staminaPickup), mana: Math.min(HERO.mana, h.mana + 30) };
  return h;
}

// ---------------------------------------------------------------- the Hollow Tide
/**
 * The boss's phases: from `above` of its HP down. Each phase has its attack rotation; the telegraph is the time the
 * ring or line glows before the hit lands (readable: never under 0.8 s). `checkpoint` = the HP a death resets it to.
 */
export const BOSS = f({
  hp: 3000,
  armor: 0.35,            // damage taken while the crest is closed
  exposedMult: 2.0,       // damage taken while the weak point is open
  exposedTime: 3.2,       // seconds the crest stays open after she dodges a blow
  contact: 6.5,           // the body's radius on the plain
  phases: f([
    f({ id: 1, above: 1.0, rotation: f(['slam', 'slam', 'sweep']), telegraph: 1.4, rest: 1.6, adds: 0 }),
    f({ id: 2, above: 0.66, rotation: f(['lunge', 'slam', 'adds', 'lunge', 'sweep']), telegraph: 1.15, rest: 1.3, adds: 3 }),
    f({ id: 3, above: 0.33, rotation: f(['lunge', 'slam', 'slam', 'sweep', 'lunge']), telegraph: 0.9, rest: 0.95, adds: 2 }),
  ]),
  attacks: f({
    slam: f({ damage: 30, radius: 6.5, active: 0.25 }),       // a ring on the ground under her
    sweep: f({ damage: 22, radius: 17, inner: 7, active: 0.35 }), // a wide ring around the body: step in or roll
    lunge: f({ damage: 38, width: 5, length: 34, active: 0.3 }), // a straight charge line at her
    adds: f({ damage: 0, active: 0.1 }),
  }),
  add: f({ hp: 120, damage: 10, speed: 3.6, reach: 1.6, cooldown: 1.6 }),
});

/** Pure: the phase index (0, 1, 2) for an HP fraction. */
export function phaseFor(hpFrac, B = BOSS) {
  let i = 0;
  for (let k = 0; k < B.phases.length; k++) if (hpFrac <= B.phases[k].above + 1e-9) i = k;
  return i;
}
/** Pure: the checkpoint HP for a phase (its top). */
export const checkpointHp = (phase, B = BOSS) => Math.round(B.phases[phase].above * B.hp);

/** A fresh boss (or one restored at a phase checkpoint). */
export function freshBoss(phase = 0, B = BOSS) {
  return { hp: checkpointHp(phase, B), phase, state: 'rest', t: 1.5, attack: null, target: null, idx: 0, exposed: 0, dead: false, adds: [], nextAddId: 1 };
}

/** Pure: damage on the boss. The weak point (after a dodge) takes more; the closed crest less. */
export function hitBoss(b, amount, B = BOSS) {
  if (b.dead || amount <= 0) return { boss: b, dealt: 0, phaseUp: false };
  const dealt = Math.round(amount * (b.exposed > 0 ? B.exposedMult : B.armor));
  const hp = Math.max(0, b.hp - dealt);
  const phase = phaseFor(hp / B.hp, B);
  const phaseUp = phase > b.phase && hp > 0;
  const nb = { ...b, hp, phase, dead: hp <= 0 };
  if (phaseUp) { nb.state = 'rest'; nb.t = 2.2; nb.attack = null; nb.idx = 0; nb.exposed = 0; } // it rears up: a breather between phases
  return { boss: nb, dealt, phaseUp };
}
/** Pure: she dodged through a blow: the crest opens. */
export const exposeBoss = (b, B = BOSS) => (b.dead ? b : { ...b, exposed: B.exposedTime });

/** Pure: is a point inside an attack's danger zone? `atk` carries its kind and geometry ({at, dir}). */
export function inDanger(atk, px, pz, B = BOSS) {
  const A = B.attacks[atk.kind];
  if (!A) return false;
  const dx = px - atk.at[0], dz = pz - atk.at[1];
  if (atk.kind === 'slam') return Math.hypot(dx, dz) <= A.radius;
  if (atk.kind === 'sweep') { const d = Math.hypot(dx, dz); return d <= A.radius && d >= A.inner; }
  if (atk.kind === 'lunge') {
    const along = dx * atk.dir[0] + dz * atk.dir[1], across = Math.abs(dx * atk.dir[1] - dz * atk.dir[0]);
    return along >= 0 && along <= A.length && across <= A.width / 2;
  }
  return false;
}

/**
 * Pure: one boss step. The boss rests, then telegraphs the next attack of its phase's rotation aimed at the player
 * (`player` = [x, z]), then the attack is active for a moment (the caller checks `inDanger` once, on the 'strike'
 * event), then it rests. Returns {boss, events}: events are {type: 'telegraph'|'strike'|'spawn'|'end', ...}.
 */
export function bossStep(b, dt, player, B = BOSS) {
  if (b.dead) return { boss: b, events: [] };
  const events = [];
  const P = B.phases[b.phase];
  let nb = { ...b, t: b.t - dt, exposed: Math.max(0, b.exposed - dt) };
  if (nb.t > 0) return { boss: nb, events };
  if (nb.state === 'rest') {
    const kind = P.rotation[nb.idx % P.rotation.length];
    let atk;
    if (kind === 'slam') atk = { kind, at: [player[0], player[1]] };
    else if (kind === 'sweep') atk = { kind, at: [...ARENA.boss] };
    else if (kind === 'lunge') {
      const o = ARENA.boss, dx = player[0] - o[0], dz = player[1] - o[1], d = Math.hypot(dx, dz) || 1;
      atk = { kind, at: [o[0], o[1]], dir: [dx / d, dz / d] };
    } else atk = { kind, at: [...ARENA.boss] };
    nb = { ...nb, state: 'telegraph', t: kind === 'adds' ? 0.6 : P.telegraph, attack: atk, idx: nb.idx + 1 };
    events.push({ type: 'telegraph', attack: atk, seconds: nb.t });
  } else if (nb.state === 'telegraph') {
    const A = B.attacks[nb.attack.kind];
    nb = { ...nb, state: 'active', t: A.active };
    if (nb.attack.kind === 'adds') {
      const adds = [...nb.adds]; let id = nb.nextAddId;
      for (let i = 0; i < P.adds; i++) { const a = (i / Math.max(1, P.adds)) * Math.PI * 2 + nb.idx; adds.push({ id: id++, hp: B.add.hp, x: ARENA.boss[0] + Math.cos(a) * 9, z: ARENA.boss[1] + Math.sin(a) * 9, cd: 1 }); }
      nb.adds = adds; nb.nextAddId = id;
      events.push({ type: 'spawn', count: P.adds });
    } else events.push({ type: 'strike', attack: nb.attack, damage: A.damage });
  } else {
    events.push({ type: 'end', attack: nb.attack });
    nb = { ...nb, state: 'rest', t: P.rest, attack: null };
  }
  return { boss: nb, events };
}

/** Pure: the adds walk at her and bite. Returns {adds, damage} (damage dealt to her this step). */
export function addsStep(adds, dt, player, B = BOSS) {
  let damage = 0;
  const out = adds.map((a) => {
    const dx = player[0] - a.x, dz = player[1] - a.z, d = Math.hypot(dx, dz) || 1;
    let { x, z } = a; const cd = Math.max(0, a.cd - dt);
    if (d > B.add.reach) { const s = Math.min(d - B.add.reach, B.add.speed * dt); x += (dx / d) * s; z += (dz / d) * s; return { ...a, x, z, cd }; }
    if (cd <= 0) { damage += B.add.damage; return { ...a, cd: B.add.cooldown }; }
    return { ...a, cd };
  });
  return { adds: out, damage };
}
/** Pure: damage on adds within `radius` of [x, z] (all of them, or only the nearest when `single`). */
export function hitAdds(adds, at, radius, amount, single = false) {
  let hits = adds.map((a, i) => ({ i, d: Math.hypot(a.x - at[0], a.z - at[1]) })).filter((h) => h.d <= radius);
  if (single && hits.length) hits = [hits.reduce((m, h) => (h.d < m.d ? h : m))];
  const ids = new Set(hits.map((h) => h.i));
  const out = adds.map((a, i) => (ids.has(i) ? { ...a, hp: a.hp - amount } : a)).filter((a) => a.hp > 0);
  return { adds: out, hit: ids.size, killed: adds.length - out.length };
}

/** Pure: a death in the fight: the boss resets to its phase checkpoint, the adds go, she is back at the landing. */
export function respawnAfterDeath(b, B = BOSS) {
  return { boss: freshBoss(b.phase, B), hero: freshHero(), at: [...ARENA.landing] };
}

/** Pure: pickup timers: {id: secondsLeft}; a taken orb comes back after HERO.pickupRespawn. */
export function pickupsTick(timers, dt) {
  const out = {}; for (const k in timers) { const v = timers[k] - dt; if (v > 0) out[k] = v; }
  return out;
}
/** Pure: the orb she stands on (available ones only), or null. */
export function pickupAt(timers, x, z, A = ARENA) {
  for (const p of A.pickups) if (!(p.id in timers) && Math.hypot(p.at[0] - x, p.at[1] - z) <= HERO.pickupRadius) return p;
  return null;
}
