// Town economy (docs/agent-rental-plan.md): hired townsfolk agents, a player level and a profile, on a separate town
// ledger ("town silk", this browser only). Never the season: nothing here imports or touches engine.js or S.silk.
// Each townsperson-agent learns (owner update, 11.11): a small Thompson-sampling policy over three ways to trade the
// Echoes of the sealed snapshot (follow the last change, fade it, stand aside), deciding from published bars only and
// updating from its own results; it persists per agent in this browser. A round returns its stake times
// 0.98 x (1 + size x the Echo's next change), clamped to 90-110 %: a novice is near 98 % (the 2 % guild fee), and
// experience can lift or lower the measured return. Results are deterministic from the seed on the result card plus
// the agent's state before the hire. Local, in-game currency only, no real money.
import { sha256 } from './crypto.js';
import SNAPSHOT from './exchange/snapshot-v1.js';
import { midCents, ECHO_IDS } from './exchange.js';

export const TOWN_KEY = 'ftf.town.v1';
export const EXPECTED_RETURN = 0.98;
export const GUILD_FEE = 0.02;
export const MAX_HIRES = 3;
export const START_SILK = 100;
/** Temperament: position size (risk), exploration (prior spread) and learning rate. */
export const TEMPERAMENTS = Object.freeze({
  cautious: Object.freeze({ size: 0.5, explore: 0.5, learn: 0.5 }),
  steady: Object.freeze({ size: 1, explore: 1, learn: 1 }),
  bold: Object.freeze({ size: 1.6, explore: 1.6, learn: 1.5 }),
});
/** The policy's choices: follow the last published change, fade it, or stand aside. */
export const ARMS = Object.freeze(['follow', 'fade', 'aside']);
/** Each round's factor is clamped to this band (a soft cap that keeps the town economy sane). */
export const CLAMP = Object.freeze([0.9, 1.1]);
/** Hire terms: base price in town silk (it grows with experience), rounds, seconds each round takes in real time. */
export const HIRE = Object.freeze({ price: 10, rounds: 5, roundSeconds: 3, maxPrice: 20 });
/** Hire price for an agent with `experience` rounds: +1 town silk per 25 rounds, at most 20. */
export const priceFor = (experience = 0) => Math.min(HIRE.maxPrice, HIRE.price + Math.floor(experience / 25));
/** Each townsperson's temperament (keys of play/townsfolk-plan.js TOWNSFOLK). */
export const FOLK_TEMPERAMENT = Object.freeze({
  guard: 'cautious', shardkeeper: 'steady', scribe: 'cautious', innkeeper: 'steady', baker: 'steady', shrinekeeper: 'cautious', elder: 'cautious',
  musician: 'bold', sweeper: 'steady', lamplighter: 'bold', courier: 'bold', child_a: 'bold', child_b: 'bold',
});
/** XP per play action. Levels unlock cosmetic titles only. */
export const XP = Object.freeze({ signRead: 5, trialVerified: 20, memoryForgotten: 15, questStep: 10, hireFinished: 8 });
export const TITLES = Object.freeze(['newcomer', 'listener', 'reader', 'signwright', 'seer', 'foreseer']);

/**
 * XP per monster felled beyond the walls (play/mobs.js 'ftf:mob-killed'; the moss critters of scenes/town-monsters.js
 * when the packs are off). Tuned on the packs of play/mobs.js: the first fight (4 skitters, 3 on a phone) plus the
 * one-time FIRST_KILL_XP reaches level 2 (100 XP); about 15 minutes of hunting (~4 kills a minute, mostly skitters,
 * the terrace veilbells and the hulker as they come back) reaches level 5 (1000 XP).
 */
export const MOB_XP = Object.freeze({ skitter: 20, veilbell: 40, hulker: 90, crownrift: 250, critter: 15 });
export const FIRST_KILL_XP = 40;
/** XP a kill is worth: the type's value (unknown types count as a skitter; an elite at least the crownrift's). */
export const xpForKill = (type, elite = false) => Math.max(MOB_XP[type] ?? MOB_XP.skitter, elite ? MOB_XP.crownrift : 0);

/** Deterministic uniform numbers in [0, 1) from a seed string (sha256-derived mulberry32). */
export function seededRandom(seed) {
  let a = parseInt(sha256('ftf-town:' + seed).slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh agent: one posterior per arm (mean reward, pseudo-count), no rounds yet. */
export const freshAgent = () => ({ arms: ARMS.map(() => ({ mean: 0, n: 1 })), rounds: 0, recent: [] });

/** Standard normal from two uniforms (Box-Muller). */
const gauss = (rand) => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

/**
 * The policy's view of one round: only the bars up to `t` (published), never `t + 1`.
 * @returns {{echo: string, t: number, lastChange: number}}
 */
export function publishedView(series, echo, t) {
  const h = series(echo, t), p = series(echo, t - 1);
  return { echo, t, lastChange: (h - p) / p };
}

/** Thompson sampling: draw a mean per arm from N(mean, explore / sqrt(n)), take the best. */
export function chooseArm(agent, temperament, rand) {
  const tp = TEMPERAMENTS[temperament] || TEMPERAMENTS.steady;
  let best = 0, bv = -Infinity;
  agent.arms.forEach((a, i) => { const v = a.mean + gauss(rand) * (0.04 * tp.explore) / Math.sqrt(a.n); if (v > bv) { bv = v; best = i; } });
  return best;
}

/** Position for an arm given the published view: +size follows the last change, -size fades it, 0 stands aside. */
export function positionFor(arm, view, temperament) {
  const size = (TEMPERAMENTS[temperament] || TEMPERAMENTS.steady).size;
  const dir = Math.sign(view.lastChange) || 1;
  return ARMS[arm] === 'follow' ? size * dir : ARMS[arm] === 'fade' ? -size * dir : 0;
}

/** The default market: the Echo prices of the sealed snapshot, in cents. */
export const snapshotSeries = (echo, i) => midCents(SNAPSHOT, echo, i);
export const SNAPSHOT_BARS = SNAPSHOT.bars.length;

/**
 * Plays one hire: `rounds` rounds on random published points of the series; the agent learns after each one.
 * Returns the result and the agent's new state (the input agent is not mutated).
 * @param {{seed: string, temperament?: string, price?: number, rounds?: number, agent?: object, series?: Function, bars?: number, npc?: string}} o
 */
export function hireResult({ seed, temperament = 'steady', price = HIRE.price, rounds = HIRE.rounds, agent = null, series = snapshotSeries, bars = SNAPSHOT_BARS, npc = '' }) {
  const rand = seededRandom(seed);
  const tp = TEMPERAMENTS[temperament] || TEMPERAMENTS.steady;
  const ag = JSON.parse(JSON.stringify(agent || freshAgent()));
  const stake = (price * 100) / rounds;
  const out = [];
  let back = 0;
  for (let n = 1; n <= rounds; n++) {
    const echo = ECHO_IDS[Math.floor(rand() * ECHO_IDS.length)];
    const t = 1 + Math.floor(rand() * (bars - 2)); // decide at t (published), the market moves to t + 1
    const view = publishedView(series, echo, t);
    const arm = chooseArm(ag, temperament, rand);
    const pos = positionFor(arm, view, temperament);
    const entry = series(echo, t), exit = series(echo, t + 1);
    const change = (exit - entry) / entry;
    const factor = Math.min(CLAMP[1], Math.max(CLAMP[0], EXPECTED_RETURN * (1 + pos * change)));
    const b = stake * factor;
    back += b;
    // learn: incremental mean of the reward (factor - 0.98), weighted by the learning rate
    const a = ag.arms[arm]; a.n += tp.learn; a.mean += ((factor - EXPECTED_RETURN) - a.mean) * (tp.learn / a.n);
    ag.rounds++; ag.recent = [...ag.recent, factor].slice(-50);
    out.push({ n, echo, t, arm: ARMS[arm], side: pos > 0 ? 'buy' : pos < 0 ? 'sell' : 'aside', size: Math.abs(pos), entry, exit, stake: Math.round(stake), back: Math.round(b), factor, npc });
  }
  back = Math.round(back);
  return { seed, temperament, price: price * 100, rounds: out, back, net: back - price * 100, agent: ag };
}

/**
 * A learning agent's score on an Echo drill window (Judge Echo board), by the drill's own rules: 100 practice silk,
 * long only, buy 1 unit at the ask when its best learned arm says "up" on the last published change, sell at the next
 * bar's bid, the drill fee on each fill. It decides from bars up to the current one only. Integer cents.
 */
export function echoDrillScore(agent, { startIndex, barCount }, { feeCents, askOf, bidOf } = {}) {
  const a = agent || freshAgent();
  let best = ARMS.indexOf('aside'); a.arms.forEach((x, i) => { if (x.mean > 0 && x.mean > (a.arms[best].mean > 0 ? a.arms[best].mean : 0)) best = i; }); // no learned edge: stand aside
  let cash = 10000;
  for (let b = 0; b < barCount - 1; b++) {
    const i = startIndex + b;
    if (i < 1) continue;
    let pick = null;
    for (const echo of ECHO_IDS) {
      const v = publishedView(snapshotSeries, echo, i);
      const up = ARMS[best] === 'follow' ? v.lastChange > 0 : ARMS[best] === 'fade' ? v.lastChange < 0 : false;
      if (up && (!pick || Math.abs(v.lastChange) > Math.abs(pick.v.lastChange))) pick = { echo, v };
    }
    if (!pick) continue;
    const buy = askOf(snapshotSeries(pick.echo, i)), sell = bidOf(snapshotSeries(pick.echo, i + 1));
    cash += sell - buy - feeCents(buy) - feeCents(sell);
  }
  return cash;
}

/** Measured return over an agent's recent rounds (null before any). */
export const measuredReturn = (agent) => (agent && agent.recent && agent.recent.length ? agent.recent.reduce((s, x) => s + x, 0) / agent.recent.length : null);

/** Level from total XP: level n needs 50·n·(n+1) XP (level 0 at 0). */
export function levelOf(xp) {
  let n = 0;
  while (50 * (n + 1) * (n + 2) <= xp) n++;
  const lo = 50 * n * (n + 1), hi = 50 * (n + 1) * (n + 2);
  return { level: n + 1, xp, into: xp - lo, need: hi - lo, title: TITLES[Math.min(n, TITLES.length - 1)] };
}

const fresh = () => ({ v: 1, silk: START_SILK * 100, xp: 0, hires: {}, counter: 0, agents: {}, log: [], equity: [START_SILK * 100], stats: { signsRead: 0, trialsVerified: 0, memoriesForgotten: 0, agentsHired: 0, questSteps: 0, net: 0, rounds: 0, wins: 0, mobsKilled: 0 }, results: [] });

/**
 * The town ledger, persisted under ftf.town.v1. `now` is injectable for tests.
 * @param {{storage?: {getItem, setItem}, now?: () => number}} [o]
 */
export function createTownLedger({ storage = null, now = () => Date.now() } = {}) {
  let st = fresh();
  try { const raw = storage && storage.getItem(TOWN_KEY); if (raw) { const p = JSON.parse(raw); if (p && p.v === 1) st = { ...fresh(), ...p, stats: { ...fresh().stats, ...(p.stats || {}) } }; } } catch { /* fresh */ }
  const closedThisSession = [];
  const listeners = new Set();
  const save = () => { try { if (storage) storage.setItem(TOWN_KEY, JSON.stringify(st)); } catch { /* memory only */ } for (const fn of [...listeners]) fn(api); };
  const agentOf = (npc) => st.agents[npc] || freshAgent();
  /** Rounds of an active hire already played (revealed as real time passes). */
  const revealed = (h) => Math.max(0, Math.min(h.plan.rounds.length, Math.floor((now() - h.startedAt) / (HIRE.roundSeconds * 1000))));
  const api = {
    get silk() { return st.silk; },
    get xp() { return st.xp; },
    get level() { return levelOf(st.xp); },
    get stats() { return { ...st.stats }; },
    get results() { return st.results.slice(); },
    get equity() { return st.equity.slice(); },
    /** The raw learning state of an agent (for the Judge Echo board). */
    agentState(npc) { return st.agents[npc] ? JSON.parse(JSON.stringify(st.agents[npc])) : null; },
    temperamentOf(npc) { return FOLK_TEMPERAMENT[npc] || null; },
    /** An agent's learning state, experience, measured return and current hire price. */
    agent(npc) { const a = agentOf(npc); return { experience: a.rounds, measured: measuredReturn(a), price: priceFor(a.rounds), arms: a.arms.map((x, i) => ({ arm: ARMS[i], mean: x.mean, n: x.n })), recent: a.recent.slice() }; },
    /** Active hires: [{npc, seed, temperament, endsAt, ready, done, open}] with the rounds played so far. */
    hires() { return Object.keys(st.hires).map((npc) => api.hireOf(npc)); },
    hireOf(npc) {
      const h = st.hires[npc];
      if (!h) return null;
      const k = revealed(h), played = h.plan.rounds.slice(0, k);
      return { npc, seed: h.seed, temperament: h.temperament, price: h.price, rounds: h.plan.rounds.length, endsAt: h.endsAt, ready: now() >= h.endsAt, done: k, played, unrealised: played.reduce((s, r) => s + r.back - r.stake, 0), next: h.plan.rounds[k] || null };
    },
    canHire(npc) {
      if (!FOLK_TEMPERAMENT[npc]) return 'unknown';
      if (st.hires[npc]) return 'busy';
      if (Object.keys(st.hires).length >= MAX_HIRES) return 'max';
      if (st.silk < priceFor(agentOf(npc).rounds) * 100) return 'no_silk';
      return null;
    },
    hire(npc) {
      const why = api.canHire(npc);
      if (why) return { ok: false, reason: why };
      st.counter++;
      const seed = `${npc}-${st.counter}`;
      const price = priceFor(agentOf(npc).rounds);
      const temperament = FOLK_TEMPERAMENT[npc];
      const plan = hireResult({ seed, temperament, price, rounds: HIRE.rounds, agent: agentOf(npc), npc });
      st.silk -= price * 100;
      st.hires[npc] = { seed, epoch: st.counter, temperament, price, before: agentOf(npc), startedAt: now(), endsAt: now() + HIRE.rounds * HIRE.roundSeconds * 1000, plan: { rounds: plan.rounds, back: plan.back, net: plan.net, agent: plan.agent } };
      st.stats.agentsHired++;
      save();
      return { ok: true, seed, price };
    },
    /** Collects a finished hire: credits the result, the agent keeps what it learned, XP, stats, log. */
    collect(npc) {
      const h = st.hires[npc];
      if (!h) return { ok: false, reason: 'none' };
      if (now() < h.endsAt) return { ok: false, reason: 'working' };
      // `before` and `epoch` let the hire be recorded on-chain and replayed by anyone (game/track-record.js)
      const r = { seed: h.seed, epoch: h.epoch || 0, temperament: h.temperament, price: h.price * 100, rounds: h.plan.rounds, back: h.plan.back, net: h.plan.net, before: h.before || null };
      st.silk += r.back; st.stats.net += r.net;
      st.agents[npc] = h.plan.agent;
      for (const x of r.rounds) { st.stats.rounds++; if (x.back > x.stake) st.stats.wins++; }
      const at = now();
      st.log = [...r.rounds.map((x) => ({ at, npc, echo: x.echo, side: x.side, size: x.size, entry: x.entry, exit: x.exit, result: x.back - x.stake, reason: x.arm })), ...st.log].slice(0, 200);
      st.equity = [...st.equity, st.silk].slice(-60);
      delete st.hires[npc];
      st.results = [{ npc, ...r }, ...st.results].slice(0, 10);
      closedThisSession.unshift({ npc, net: r.net, rounds: r.rounds.length, seed: r.seed });
      api.addXp('hireFinished', false);
      save();
      return { ok: true, result: { npc, ...r } };
    },
    /** Collected hire results, newest first (the last 10); `npc` filters. */
    results(npc = null) { return (st.results || []).filter((r) => !npc || r.npc === npc); },
    /** Every agent action, newest first; `npc` filters. */
    log(npc = null) { return st.log.filter((l) => !npc || l.npc === npc); },
    /** Hires closed in this session (open ones: hires()). */
    get closed() { return closedThisSession.slice(); },
    /** The best agent by measured return (at least 5 rounds), or null. */
    bestAgent() { let best = null; for (const [npc, a] of Object.entries(st.agents)) { const m = measuredReturn(a); if (a.rounds >= 5 && m != null && (!best || m > best.measured)) best = { npc, measured: m, experience: a.rounds }; } return best; },
    agentsKnown() { return Object.keys(st.agents); },
    /** A wheel prize (game/wheel.js): town silk in cents and/or XP. Never the season's silk. */
    grant({ silk = 0, xp = 0 } = {}) {
      st.silk += Math.max(0, Math.round(silk)); st.xp += Math.max(0, Math.round(xp));
      save();
      return { silk: st.silk, xp: st.xp };
    },
    /**
     * Spends town silk (hundredths) for a reason (the story's Gate-Loom fee, docs/plans/story): all or nothing, never
     * below zero. Returns {ok, silk} or {ok: false, reason: 'no_silk' | 'bad_amount'}.
     */
    spend({ silkC = 0, reason = '' } = {}) {
      const c = Math.round(Number(silkC));
      if (!Number.isFinite(c) || c <= 0) return { ok: false, reason: 'bad_amount' };
      if (st.silk < c) return { ok: false, reason: 'no_silk' };
      st.silk -= c; save();
      return { ok: true, silk: st.silk, reason };
    },
    /** XP for a play action (XP keys); counted in the profile stats too. */
    addXp(kind, persist = true) {
      st.xp += XP[kind] || 0;
      const statKey = { signRead: 'signsRead', trialVerified: 'trialsVerified', memoryForgotten: 'memoriesForgotten', questStep: 'questSteps' }[kind];
      if (statKey) st.stats[statKey]++;
      if (persist) save();
    },
    /**
     * A monster fell: its XP (plus FIRST_KILL_XP the very first time), counted in the stats, saved.
     * Returns {gained, level, levelUp}: levelUp is the new level number when this kill crossed a threshold, else 0.
     */
    killMob(type, elite = false) {
      const before = levelOf(st.xp).level;
      const gained = xpForKill(type, elite) + (st.stats.mobsKilled ? 0 : FIRST_KILL_XP);
      st.xp += gained; st.stats.mobsKilled++;
      save();
      const after = levelOf(st.xp).level;
      return { gained, level: after, levelUp: after > before ? after : 0 };
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return api;
}
