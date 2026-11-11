// Town economy (docs/agent-rental-plan.md): hired townsfolk agents, a player level and a profile, on a separate town
// ledger ("town silk", this browser only). Never the season: nothing here imports or touches engine.js or S.silk.
// Hire results are deterministic from a seed shown on the result card; each round returns the round's share of the
// hire price times a factor whose mean is exactly 0.98 (a 2 % guild fee is the sink), spread by temperament.
// Local, in-game currency only, no real money.
import { sha256 } from './crypto.js';

export const TOWN_KEY = 'ftf.town.v1';
export const EXPECTED_RETURN = 0.98;
export const GUILD_FEE = 0.02;
export const MAX_HIRES = 3;
export const START_SILK = 100;
/** Temperament changes the spread of a round's factor, never its mean. */
export const TEMPERAMENTS = Object.freeze({ cautious: 0.15, steady: 0.4, bold: 0.9 });
/** Hire terms: price in town silk, rounds, seconds each round takes in real time. */
export const HIRE = Object.freeze({ price: 10, rounds: 5, roundSeconds: 3 });
/** Each townsperson's temperament (keys of play/townsfolk-plan.js TOWNSFOLK). */
export const FOLK_TEMPERAMENT = Object.freeze({
  guard: 'cautious', shardkeeper: 'steady', scribe: 'cautious', innkeeper: 'steady', baker: 'steady', shrinekeeper: 'cautious', elder: 'cautious',
  musician: 'bold', sweeper: 'steady', lamplighter: 'bold', courier: 'bold', child_a: 'bold', child_b: 'bold',
});
/** XP per play action. Levels unlock cosmetic titles only. */
export const XP = Object.freeze({ signRead: 5, trialVerified: 20, memoryForgotten: 15, questStep: 10, hireFinished: 8 });
export const TITLES = Object.freeze(['newcomer', 'listener', 'reader', 'signwright', 'seer', 'foreseer']);

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

/**
 * The factor for one round: 0.98 × (1 + s × u), u uniform in [-1, 1), s the temperament spread. Mean 0.98 exactly,
 * standard deviation 0.98 × s / √3; never negative (s < 1).
 */
export function roundFactor(rand, temperament) {
  const s = TEMPERAMENTS[temperament] ?? TEMPERAMENTS.steady;
  return EXPECTED_RETURN * (1 + s * (2 * rand() - 1));
}

/**
 * A hire's result. Amounts in hundredths of town silk (integers), the total rounded once at the end.
 * @returns {{seed, temperament, price, rounds: Array<{n, stake, back}>, back: number, net: number}}
 */
export function hireResult({ seed, temperament = 'steady', price = HIRE.price, rounds = HIRE.rounds }) {
  const rand = seededRandom(seed);
  const stake = (price * 100) / rounds;
  const out = [];
  let back = 0;
  for (let n = 1; n <= rounds; n++) { const b = stake * roundFactor(rand, temperament); back += b; out.push({ n, stake: Math.round(stake), back: Math.round(b) }); }
  back = Math.round(back);
  return { seed, temperament, price: price * 100, rounds: out, back, net: back - price * 100 };
}

/** Level from total XP: level n needs 50·n·(n+1) XP (level 0 at 0). */
export function levelOf(xp) {
  let n = 0;
  while (50 * (n + 1) * (n + 2) <= xp) n++;
  const lo = 50 * n * (n + 1), hi = 50 * (n + 1) * (n + 2);
  return { level: n + 1, xp, into: xp - lo, need: hi - lo, title: TITLES[Math.min(n, TITLES.length - 1)] };
}

const fresh = () => ({ v: 1, silk: START_SILK * 100, xp: 0, hires: {}, counter: 0, stats: { signsRead: 0, trialsVerified: 0, memoriesForgotten: 0, agentsHired: 0, questSteps: 0, net: 0 }, results: [] });

/**
 * The town ledger, persisted under ftf.town.v1. `now` is injectable for tests.
 * @param {{storage?: {getItem, setItem}, now?: () => number}} [o]
 */
export function createTownLedger({ storage = null, now = () => Date.now() } = {}) {
  let st = fresh();
  try { const raw = storage && storage.getItem(TOWN_KEY); if (raw) { const p = JSON.parse(raw); if (p && p.v === 1) st = { ...fresh(), ...p, stats: { ...fresh().stats, ...(p.stats || {}) } }; } } catch { /* fresh */ }
  const listeners = new Set();
  const save = () => { try { if (storage) storage.setItem(TOWN_KEY, JSON.stringify(st)); } catch { /* memory only */ } for (const fn of [...listeners]) fn(api); };
  const api = {
    get silk() { return st.silk; },
    get xp() { return st.xp; },
    get level() { return levelOf(st.xp); },
    get stats() { return { ...st.stats }; },
    get results() { return st.results.slice(); },
    /** Active hires: [{npc, seed, temperament, endsAt, ready}] */
    hires() { const t = now(); return Object.entries(st.hires).map(([npc, h]) => ({ npc, ...h, ready: t >= h.endsAt })); },
    temperamentOf(npc) { return FOLK_TEMPERAMENT[npc] || null; },
    hireOf(npc) { const h = st.hires[npc]; return h ? { npc, ...h, ready: now() >= h.endsAt } : null; },
    /** Whether `npc` can be hired now, or the reason not. */
    canHire(npc) {
      if (!FOLK_TEMPERAMENT[npc]) return 'unknown';
      if (st.hires[npc]) return 'busy';
      if (Object.keys(st.hires).length >= MAX_HIRES) return 'max';
      if (st.silk < HIRE.price * 100) return 'no_silk';
      return null;
    },
    hire(npc) {
      const why = api.canHire(npc);
      if (why) return { ok: false, reason: why };
      st.counter++;
      const seed = `${npc}-${st.counter}`;
      st.silk -= HIRE.price * 100;
      st.hires[npc] = { seed, temperament: FOLK_TEMPERAMENT[npc], price: HIRE.price, rounds: HIRE.rounds, endsAt: now() + HIRE.rounds * HIRE.roundSeconds * 1000 };
      st.stats.agentsHired++;
      save();
      return { ok: true, seed };
    },
    /** Collects a finished hire: credits the result, XP and stats. */
    collect(npc) {
      const h = st.hires[npc];
      if (!h) return { ok: false, reason: 'none' };
      if (now() < h.endsAt) return { ok: false, reason: 'working' };
      const r = hireResult({ seed: h.seed, temperament: h.temperament, price: h.price, rounds: h.rounds });
      st.silk += r.back; st.stats.net += r.net;
      delete st.hires[npc];
      st.results = [{ npc, ...r }, ...st.results].slice(0, 10);
      api.addXp('hireFinished', false);
      save();
      return { ok: true, result: { npc, ...r } };
    },
    /** XP for a play action (XP keys); `stat` counts it in the profile too. */
    addXp(kind, persist = true) {
      st.xp += XP[kind] || 0;
      const statKey = { signRead: 'signsRead', trialVerified: 'trialsVerified', memoryForgotten: 'memoriesForgotten', questStep: 'questSteps' }[kind];
      if (statKey) st.stats[statKey]++;
      if (persist) save();
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return api;
}
