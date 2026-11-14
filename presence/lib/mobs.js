// Shared monsters (owner 14.11: "one mob state per area on the server: HP, death, respawn, aggro, loot rights"). The
// town-hill stone spiders live here once per room: every player of the room sees the same spider at the same spot
// with the same health. Pure: plain objects, an injected clock and random source, no sockets (hub.js wires it).
//
// Coordinates are town-local metres (x, z), the frame the presence positions already use; the clients put the spider
// on their own ground. Ids match the game's MobBrain ids (`${type}${packIndex}_${k}`, game/src/play/mobs.js PACKS) so a
// client maps a server spider onto the one it would have drawn anyway. Numbers mirror game/src/play/mobs.js
// MOB_TYPES.skitter; tests/mobs.test.mjs checks the hub's side, game/tests/client/shared-mobs.test.mjs the client's.
//
// What the server decides: where each spider is, its health, whom it chases and bites, when it dies and comes back,
// and who has the right to loot it (every player who dealt at least LOOT_SHARE of its health). What stays on each
// client: the loot itself, quests, the inventory and the player's own health (a bite is told to the bitten player).

export const SPIDER = Object.freeze({ hp: 55, walk: 0.9, run: 1.8, radius: 0.42, aggro: 9, attack: 1.0, damage: 3, windup: 0.44, cooldown: 1.6, leash: 16, pursuit: 42, lose: 6, wander: 4.5 });
/** The town-hill spider packs (game/src/play/mobs.js PACKS indexes 0, 1 and 4): home in town-local metres, respawn seconds. */
export const SHARED_PACKS = Object.freeze([
  Object.freeze({ index: 0, type: 'skitter', count: 4, home: Object.freeze([-12, 52]), respawn: 30 }),
  Object.freeze({ index: 1, type: 'skitter', count: 4, home: Object.freeze([-30, 66]), respawn: 35 }),
  Object.freeze({ index: 4, type: 'skitter', count: 3, home: Object.freeze([-16, 87]), respawn: 35 }),
]);
/** The most one blow can take (the game's own numbers: the combo 14 / 14 / 26, the super strike up to 80, the casts). */
export const HIT_MAX = Object.freeze({ strike: 14, strike3: 26, super: 80, lance: 40, snare: 25 });
/** How far from the player's server position a blow of each kind may land (m; the game's reach plus latency slack). */
export const HIT_RANGE = Object.freeze({ strike: 5, strike3: 5, super: 6.5, lance: 26, snare: 26 });
export const HITS_PER_SEC = 8;
/** A player who dealt at least this share of a spider's health may loot it. */
export const LOOT_SHARE = 0.15;
const STATES = Object.freeze(['idle', 'chase', 'windup', 'dead']);

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * One room's spiders. `rand` is a seeded random source in tests.
 * @param {{now?: () => number, rand?: () => number, packs?: object[]}} o
 */
export function createMobWorld({ now = () => Date.now(), rand = Math.random, packs = SHARED_PACKS } = {}) {
  const mobs = [];
  const spawn = (pack, k, n) => {
    const a = (k / Math.max(1, n)) * Math.PI * 2 + rand() * 0.8, r = n > 1 ? 1.2 + rand() * 1.5 : 0;
    return { x: pack.home[0] + Math.cos(a) * r, z: pack.home[1] + Math.sin(a) * r, h: rand() * Math.PI * 2, hp: SPIDER.hp, state: 'idle', t: 0, cd: 0,
      target: null, provoked: false, lost: 0, goal: null, dmg: new Map(), deadT: 0, sent: null };
  };
  for (const pack of packs) for (let k = 0; k < pack.count; k++) mobs.push({ id: `${pack.type}${pack.index}_${k}`, pack, ...spawn(pack, k, pack.count) });
  const byId = new Map(mobs.map((m) => [m.id, m]));

  /** The nearest player (town-local [x, y, z]) a spider can see; null when none. */
  function nearestSeen(m, players, range) {
    let best = null, bd = range;
    for (const pl of players) { const d = dist([pl.p[0], pl.p[2]], [m.x, m.z]); if (d < bd && dist([pl.p[0], pl.p[2]], m.pack.home) < SPIDER.leash + SPIDER.attack) { bd = d; best = pl; } }
    return best;
  }
  function move(m, toward, speed, dt) {
    const dx = toward[0] - m.x, dz = toward[1] - m.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return;
    m.h = Math.atan2(dx, dz);
    const step = Math.min(d, speed * dt), nx = m.x + (dx / d) * step, nz = m.z + (dz / d) * step;
    const limit = m.provoked ? SPIDER.pursuit : SPIDER.leash, dh = dist([nx, nz], m.pack.home);
    if (dh > limit && dh >= dist([m.x, m.z], m.pack.home)) return; // the leash; back home is always allowed
    m.x = nx; m.z = nz;
  }

  /**
   * One step of `dt` seconds with the room's players [{id, p: [x, y, z]}]. Returns events:
   * {k: 'bite', mob, target, dmg} (tell the target), {k: 'death', mob, loot: [player ids]}, {k: 'respawn', mob}.
   */
  function step(dt, players) {
    const ev = [];
    for (const m of mobs) {
      m.t += dt; m.cd = Math.max(0, m.cd - dt);
      if (m.state === 'dead') {
        if ((m.deadT -= dt) <= 0) {
          const near = players.some((pl) => dist([pl.p[0], pl.p[2]], m.pack.home) < 12); // never under a player's nose
          if (!near) { Object.assign(m, spawn(m.pack, Number(m.id.split('_')[1]) || 0, m.pack.count)); ev.push({ k: 'respawn', mob: m.id }); }
        }
        continue;
      }
      let target = m.target != null ? players.find((pl) => pl.id === m.target) || null : null;
      if (target && m.provoked) {
        const reach = dist([target.p[0], target.p[2]], m.pack.home) < SPIDER.pursuit;
        m.lost = reach ? 0 : m.lost + dt;
        if (m.lost >= SPIDER.lose) { target = null; m.provoked = false; m.lost = 0; }
      } else if (target && dist([target.p[0], target.p[2]], [m.x, m.z]) > SPIDER.aggro * 1.4) target = null;
      if (!target) target = nearestSeen(m, players, SPIDER.aggro);
      m.target = target ? target.id : null;
      if (!target) {
        if (m.state !== 'idle') { m.state = 'idle'; m.t = 0; m.goal = null; }
        if (!m.goal || (m.t > 3 && rand() < dt * 0.5)) { const a = rand() * Math.PI * 2, r = rand() * SPIDER.wander; m.goal = [m.pack.home[0] + Math.cos(a) * r, m.pack.home[1] + Math.sin(a) * r]; m.t = 0; }
        if (dist(m.goal, [m.x, m.z]) > 0.4) move(m, m.goal, SPIDER.walk, dt);
        continue;
      }
      const tp = [target.p[0], target.p[2]], d = dist(tp, [m.x, m.z]);
      if (m.state === 'windup') {
        m.h = Math.atan2(tp[0] - m.x, tp[1] - m.z);
        if (m.t >= SPIDER.windup) {
          if (d < SPIDER.attack + SPIDER.radius + 0.6) ev.push({ k: 'bite', mob: m.id, target: target.id, dmg: SPIDER.damage });
          m.state = 'chase'; m.t = 0; m.cd = SPIDER.cooldown;
        }
        continue;
      }
      if (m.state !== 'chase') { m.state = 'chase'; m.t = 0; }
      if (d <= SPIDER.attack + SPIDER.radius && m.cd <= 0) { m.state = 'windup'; m.t = 0; continue; }
      if (d > SPIDER.attack * 0.85) move(m, tp, SPIDER.run, dt);
    }
    return ev;
  }

  /**
   * A blow from player `pid` standing at `p` (its server position): checked (kind, the spider alive, range) and
   * applied. Returns {ok, reason?, death?: {mob, loot}}. The amount is the client's, never above HIT_MAX for the kind.
   */
  function hit(pid, p, mobId, kind, amount) {
    const m = byId.get(mobId);
    if (!m) return { ok: false, reason: 'no_mob' };
    if (!Object.hasOwn(HIT_MAX, kind)) return { ok: false, reason: 'kind' };
    if (m.state === 'dead') return { ok: false, reason: 'dead' };
    if (!p || dist([p[0], p[2]], [m.x, m.z]) > HIT_RANGE[kind] + SPIDER.radius) return { ok: false, reason: 'range' };
    const dmg = Math.max(0, Math.min(HIT_MAX[kind], Number(amount) || 0, m.hp));
    if (!dmg) return { ok: false, reason: 'amount' };
    m.hp -= dmg; m.dmg.set(pid, (m.dmg.get(pid) || 0) + dmg);
    m.provoked = true; m.lost = 0; if (m.target == null) m.target = pid;
    if (m.state === 'idle') { m.state = 'chase'; m.t = 0; }
    if (m.hp > 0) return { ok: true };
    m.hp = 0; m.state = 'dead'; m.deadT = m.pack.respawn; m.target = null;
    const loot = [...m.dmg].filter(([, v]) => v >= SPIDER.hp * LOOT_SHARE).map(([id]) => id);
    m.dmg = new Map();
    return { ok: true, death: { mob: m.id, loot } };
  }

  /** A player left: no spider chases them; their share of damage no longer counts. */
  function forget(pid) { for (const m of mobs) { if (m.target === pid) { m.target = null; m.provoked = false; } m.dmg.delete(pid); } }

  const row = (m) => [m.id, r2(m.x), r2(m.z), r2(m.h), Math.round(m.hp), STATES.indexOf(m.state)];
  return {
    step, hit, forget,
    /** Every spider, for a newcomer: [[id, x, z, heading, hp, state index], ...]. */
    all: () => mobs.map(row),
    /** The spiders that changed since the last call (moved 5 cm, turned, other health or state). */
    changed() {
      const out = [];
      for (const m of mobs) {
        const r = row(m), s = m.sent;
        if (!s || Math.hypot(r[1] - s[1], r[2] - s[2]) > 0.05 || Math.abs(r[3] - s[3]) > 0.05 || r[4] !== s[4] || r[5] !== s[5]) { out.push(r); m.sent = r; }
      }
      return out;
    },
    get: (id) => byId.get(id) || null,
  };
}
export { STATES as MOB_STATES };
