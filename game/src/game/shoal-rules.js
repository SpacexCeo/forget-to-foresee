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

/**
 * Pure: a dev jump (`?ff=glassShoal&shoal=<param>`). A quest step jumps the save to it; 'ride' boots straight onto
 * the dragon and 'arena' straight into the fight (the quest at its matching step, the blade held). Returns
 * {save, jump}: `jump` is 'ride', 'arena' or null; an unknown param leaves the save unchanged (the same object).
 */
export function debugJump(save, param) {
  if (param === 'arena') return { save: { ...save, step: 'defeat', blade: true }, jump: 'arena' };
  if (param === 'ride') return { save: { ...save, step: 'ride', blade: true }, jump: 'ride' };
  if (QUEST_STEPS.includes(param)) return { save: { ...save, step: param, blade: param !== 'find_blade' }, jump: null };
  return { save, jump: null };
}

/** Pure: does the cliff stone call the dragon for this save? Before the fight, and again after leaving it unbeaten
 *  (a reload or "Leave the Shoal" mid-fight left the quest at 'defeat' with no way back: live review 14.11). */
export const stoneOpen = (save) => save.step === 'reach_stone' || save.step === 'ride' || save.step === 'defeat';
/** Pure: the boss is down but the flight home never ran (the page closed on the Shoal): finish the quest in town. */
export const homeDue = (save) => save.step === 'return';

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
export const freshHero = () => ({ hp: HERO.hp, stamina: HERO.stamina, mana: HERO.mana, dodge: 0, iframes: 0, cds: {}, ult: 0 });

/** Pure: can she dodge now (stamina, not mid-dodge)? */
export const canDodge = (h) => h.dodge <= 0 && h.stamina >= HERO.dodgeCost;
/** Pure: start a dodge: stamina spent, invulnerable for the roll. */
export const startDodge = (h) => (canDodge(h) ? { ...h, stamina: h.stamina - HERO.dodgeCost, dodge: HERO.dodgeTime, iframes: HERO.dodgeTime } : h);
/**
 * Pure: the hero's timers and regeneration for dt. `o.drain` (stamina per second) is what flight costs this step
 * (flightStep); `o.air` is true while she is off the ground. Stamina refills only on the ground and not mid-dodge.
 */
export function heroTick(h, dt, o = {}) {
  const cds = {}; for (const k in h.cds) { const v = h.cds[k] - dt; if (v > 0) cds[k] = v; }
  const drain = Math.max(0, Number(o.drain) || 0);
  const stamina = drain > 0 ? Math.max(0, h.stamina - drain * dt) : Math.min(HERO.stamina, h.stamina + (h.dodge > 0 || o.air ? 0 : HERO.staminaRegen * dt));
  return { ...h, dodge: Math.max(0, h.dodge - dt), iframes: Math.max(0, h.iframes - dt), cds, stamina, mana: Math.min(HERO.mana, h.mana + HERO.manaRegen * dt) };
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

// ---------------------------------------------------------------- Elise's flight
/**
 * Elise remembers her gift (glass-shoal-boss.md, "Elise's kit"): she takes off, hovers and flies. Air control is
 * slower than running and carries momentum; the climb eases out under a soft ceiling. Flight drains stamina (hover
 * slow, moving faster, climbing fastest); at zero she glides down and lands. Heights are metres above the mirror.
 */
export const FLIGHT = f({
  ceiling: 6, softBand: 1.5,          // the climb fades over the last softBand metres under the ceiling
  airSpeed: 4.6, accel: 2.6,          // run speed is HERO.speed (6.5); accel = how fast velocity follows the wish (1/s)
  climb: 3.4, descend: 3.8, release: 1.4, takeoff: 0.45, // m/s up, m/s down, the slow sink when Lift is released; auto-climb seconds after take-off
  glide: 1.6, glideSpeed: 3.2,        // stamina gone: the slow sink and the air speed while gliding down
  minStamina: 15,                     // the stamina she needs to take off
  drainHover: 4, drainMove: 6, drainClimb: 9, // stamina per second: always, at full air speed, at full climb
  bank: 0.4, bankRate: 4,             // the gentle bank (radians) toward the turn and how fast it follows
  doubleTap: 0.32,                    // seconds between two jump presses that take off
});
/** A fresh flight state: on the ground. mode = 'ground' | 'fly' | 'glide'. */
export const freshFlight = () => ({ mode: 'ground', y: 0, vx: 0, vz: 0, vy: 0, bank: 0, up: 0 });
export const airborne = (fl) => fl.mode !== 'ground';
/** Pure: can she take off (on the ground, enough stamina)? */
export const canTakeOff = (fl, h, F = FLIGHT) => fl.mode === 'ground' && h.stamina >= F.minStamina;
/** Pure: take off from height `y` (a hop already under way keeps its height). Unchanged when she cannot. */
export const takeOff = (fl, h, y = 0, F = FLIGHT) => (canTakeOff(fl, h, F) ? { ...fl, mode: 'fly', y: Math.max(0, y), vy: F.climb, up: F.takeoff } : fl);
/** The `vert` of a released Lift button (touch): the slow sink. */
export const releaseVert = (F = FLIGHT) => -F.release / F.descend;
/** Pure: land at once (the Lift key pressed in the air): she glides down without stamina cost. */
export const startGlide = (fl) => (fl.mode === 'fly' ? { ...fl, mode: 'glide' } : fl);

/**
 * Pure: one flight step. `wish` = [x, z] world direction, length 0..1 (the keys or the stick); `vert` = -1..1 (Space
 * rises, the descend key or a released Lift sinks, 0 holds the height); `stamina` = what she has now.
 * Returns {flight, drain, landed}: `drain` = stamina per second to charge (heroTick), `landed` true on touch-down.
 */
export function flightStep(fl, wish, vert, stamina, dt, F = FLIGHT) {
  if (fl.mode === 'ground') return { flight: fl, drain: 0, landed: false };
  const mode = fl.mode === 'fly' && stamina <= 0 ? 'glide' : fl.mode;
  const wx = Number(wish && wish[0]) || 0, wz = Number(wish && wish[1]) || 0, wl = Math.hypot(wx, wz);
  const k = wl > 1 ? 1 / wl : 1;
  const speed = mode === 'glide' ? F.glideSpeed : F.airSpeed;
  const a = Math.min(1, F.accel * dt);
  const vx = fl.vx + (wx * k * speed - fl.vx) * a, vz = fl.vz + (wz * k * speed - fl.vz) * a;
  const up = Math.max(0, fl.up - dt);
  let v = Math.max(-1, Math.min(1, Number(vert) || 0));
  if (fl.up > 0) v = Math.max(v, 1);
  let vy;
  if (mode === 'glide') vy = -F.glide;
  else if (v > 0) vy = F.climb * v * Math.max(0, Math.min(1, (F.ceiling - fl.y) / F.softBand));
  else vy = v * F.descend; // 0 holds the height; a released Lift passes releaseVert() for the slow sink
  const y = Math.max(0, Math.min(F.ceiling, fl.y + vy * dt));
  // the bank leans into the turn: the side of the wish relative to her velocity
  const sp = Math.hypot(vx, vz);
  const turn = sp > 0.2 && wl > 0.05 ? (vx * wz - vz * wx) / (sp * wl) : 0;
  const bank = fl.bank + (-turn * F.bank - fl.bank) * Math.min(1, F.bankRate * dt);
  if (y <= 0 && (vy < 0 || mode === 'glide') && up <= 0) return { flight: { ...freshFlight() }, drain: 0, landed: true };
  const drain = mode === 'glide' ? 0 : F.drainHover + F.drainMove * Math.min(1, sp / F.airSpeed) + (vy > 0 ? F.drainClimb * vy / F.climb : 0);
  return { flight: { mode, y, vx, vz, vy, bank, up }, drain, landed: false };
}

// ---------------------------------------------------------------- Elise's ultimate: Tempest of Embers
/**
 * The charge meter fills from damage dealt (after armour) and taken; full, one key releases ~3 s of a spiral of fire
 * orbs and wind blades around her: `pulses` blows over `duration`, each hitting the boss (through the crest: it
 * pierces the armour) and every add within `radius`. She is untouchable while it spins.
 */
export const ULT = f({ max: 100, perDealt: 0.028, perTaken: 0.45, duration: 3, rise: 2.2, pulses: 6, radius: 12, damage: 85, hitStop: 0.08, shake: 0.35 });
/** Pure: the meter after dealing `dealt` and taking `taken` damage. */
export const chargeUlt = (u, dealt = 0, taken = 0, U = ULT) => Math.min(U.max, (Number(u) || 0) + Math.max(0, dealt) * U.perDealt + Math.max(0, taken) * U.perTaken);
export const ultReady = (h, U = ULT) => (h.ult || 0) >= U.max;
/** Pure: release it: the meter empties, she is untouchable for its length. Unchanged when not full. */
export const startUlt = (h, U = ULT) => (ultReady(h, U) ? { ...h, ult: 0, iframes: Math.max(h.iframes, U.duration) } : h);
/** Pure: how many of its blows land between `t0` and `t1` seconds into it (blow i lands at (i + 0.5) of its slice). */
export function ultPulses(t0, t1, U = ULT) {
  const at = (i) => ((i + 0.5) / U.pulses) * U.duration;
  let n = 0; for (let i = 0; i < U.pulses; i++) if (at(i) > t0 && at(i) <= t1) n++;
  return n;
}
/** Pure: is a point within reach of the tempest around her ([x, z] both)? The boss counts by the edge of its body. */
export const inTempest = (me, at, extra = 0, U = ULT) => Math.hypot(me[0] - at[0], me[1] - at[1]) <= U.radius + extra;

// ---------------------------------------------------------------- the Hollow Tide
/**
 * The boss's phases: from `above` of its HP down. Each phase has its attack rotation; the telegraph is the time the
 * ring or line glows before the hit lands (readable: never under 0.8 s). `checkpoint` = the HP a death resets it to.
 */
export const BOSS = f({
  // tuned on the scripted run (tests/client/shoal-sim.mjs): an average Elise wins in about 3 minutes standing
  // still, more with the walking and aiming of a real fight; a weak one dies a few times but gets there
  hp: 10000,
  armor: 0.2,             // damage taken while the crest is closed
  exposedMult: 1.5,       // damage taken while the weak point is open
  exposedTime: 2.0,       // seconds the crest stays open after she dodges a blow
  contact: 6.5,           // the body's radius on the plain
  phases: f([
    f({ id: 1, above: 1.0, rotation: f(['slam', 'slam', 'sweep']), telegraph: 1.4, rest: 1.6, adds: 0 }),
    f({ id: 2, above: 0.66, rotation: f(['lunge', 'slam', 'adds', 'lunge', 'sweep']), telegraph: 1.15, rest: 1.3, adds: 3 }),
    f({ id: 3, above: 0.33, rotation: f(['lunge', 'slam', 'slam', 'sweep', 'lunge']), telegraph: 0.9, rest: 0.95, adds: 2 }),
  ]),
  attacks: f({
    // `reach` = how high above the mirror the blow still lands (metres): flying over a sweep works, over a slam not
    slam: f({ damage: 20, radius: 6.5, active: 0.25, reach: 9 }),          // a ring under her: a geyser column
    sweep: f({ damage: 18, radius: 17, inner: 7, active: 0.35, reach: 2.6 }), // a wide ring around the body: step in, roll or rise
    lunge: f({ damage: 32, width: 5, length: 34, active: 0.3, reach: 4 }),  // a straight charge line at her
    adds: f({ damage: 0, active: 0.1 }),
  }),
  add: f({ hp: 120, damage: 8, speed: 3.6, reach: 1.6, cooldown: 1.6, jump: 2.2 }), // jump: the highest they can bite
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
  return { hp: checkpointHp(phase, B), phase, state: 'rest', t: 3, attack: null, target: null, idx: 0, exposed: 0, dead: false, adds: [], nextAddId: 1 };
}

/**
 * Pure: damage on the boss. The weak point (after a dodge) takes more; the closed crest less, unless the blow
 * `pierce`s it (the ultimate), which then lands at full strength.
 */
export function hitBoss(b, amount, B = BOSS, o = {}) {
  if (b.dead || amount <= 0) return { boss: b, dealt: 0, phaseUp: false };
  const dealt = Math.round(amount * (b.exposed > 0 ? B.exposedMult : o.pierce ? 1 : B.armor));
  const hp = Math.max(0, b.hp - dealt);
  const phase = phaseFor(hp / B.hp, B);
  const phaseUp = phase > b.phase && hp > 0;
  const nb = { ...b, hp, phase, dead: hp <= 0 };
  if (nb.dead) { nb.state = 'dead'; nb.attack = null; nb.t = 0; nb.exposed = 0; } // it falls: no blow, no telegraph left glowing on the mirror (bench run 14.11)
  if (phaseUp) { nb.state = 'rest'; nb.t = 2.2; nb.attack = null; nb.idx = 0; nb.exposed = 0; } // it rears up: a breather between phases
  return { boss: nb, dealt, phaseUp };
}
/** Pure: she dodged through a blow: the crest opens. */
export const exposeBoss = (b, B = BOSS) => (b.dead ? b : { ...b, exposed: B.exposedTime });

/**
 * Pure: is a point inside an attack's danger zone? `atk` carries its kind and geometry ({at, dir}); `py` = her
 * height above the mirror (flying above an attack's `reach` is safe).
 */
export function inDanger(atk, px, pz, B = BOSS, py = 0) {
  const A = B.attacks[atk.kind];
  if (!A) return false;
  if (A.reach != null && py > A.reach) return false;
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

/**
 * Pure: the adds walk at her and bite. Returns {adds, damage} (damage dealt to her this step). `py` = her height:
 * above `add.jump` they circle under her and cannot bite.
 */
export function addsStep(adds, dt, player, B = BOSS, py = 0) {
  let damage = 0;
  const out = adds.map((a) => {
    const dx = player[0] - a.x, dz = player[1] - a.z, d = Math.hypot(dx, dz) || 1;
    let { x, z } = a; const cd = Math.max(0, a.cd - dt);
    if (d > B.add.reach) { const s = Math.min(d - B.add.reach, B.add.speed * dt); x += (dx / d) * s; z += (dz / d) * s; return { ...a, x, z, cd }; }
    if (py > B.add.jump) return { ...a, cd };
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

/** Pure: the touch aim (no cursor): the nearest add within `range` of her, else the boss. Returns [x, z]. */
export function autoAim(me, adds, range = 16, A = ARENA) {
  let best = null, bd = range;
  for (const a of adds || []) { const d = Math.hypot(a.x - me[0], a.z - me[1]); if (d <= bd) { bd = d; best = [a.x, a.z]; } }
  return best || [A.boss[0], A.boss[1]];
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
