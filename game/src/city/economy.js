// The city's closed economy (pure, node-tested): goods and their daily prices, meals, friendship levels.
// Silk here is the same closed in-game resource as in a season (docs/spec.md 4): never NEAR, never real money,
// nothing on-chain. Prices are a deterministic function of the city day, so every device sees the same market.

/** One city day lasts 15 real minutes; the day index comes from the wall clock, so the market moves while away. */
export const DAY_MS = 15 * 60 * 1000;
export const cityDay = (nowMs) => Math.floor(nowMs / DAY_MS);
export const msToNextDay = (nowMs) => DAY_MS - (nowMs % DAY_MS);

export const GOODS = Object.freeze([
  { id: 'bread', base: 4, stall: 'stall1', food: 15 },
  { id: 'tea', base: 6, stall: 'stall1', food: 8 },
  { id: 'oil', base: 9, stall: 'stall2' },
  { id: 'ink', base: 12, stall: 'stall3' },
  { id: 'nacre', base: 20, stall: 'stall3' },
  { id: 'amber', base: 28, stall: 'stall4' },
]);
export const GOOD_IDS = Object.freeze(GOODS.map((g) => g.id));
export const goodById = (id) => GOODS.find((g) => g.id === id) || null;
export const BAG_SIZE = 12;
export const SELL_RATE = 0.85;

export const MEALS = Object.freeze([
  { id: 'stew', price: 5, food: 40 },
  { id: 'plate', price: 9, food: 70 },
  { id: 'feast', price: 16, food: 100 },
]);
export const mealById = (id) => MEALS.find((m) => m.id === id) || null;

/** Satiety 0-100: a full belly lasts 30 minutes of time in the city. */
export const SATIETY = Object.freeze({ max: 100, perMinute: 100 / 30, fed: 60, hungry: 20, fedBonus: 0.25 });

/** Friendship points → level 0-4 (stranger, acquaintance, friend, close friend, sworn friend). */
export const FRIEND_LEVELS = Object.freeze([0, 3, 8, 16, 28]);
export function friendLevel(points) {
  let l = 0;
  for (let i = 0; i < FRIEND_LEVELS.length; i++) if (points >= FRIEND_LEVELS[i]) l = i;
  return l;
}
/** Points still missing for the next level; 0 at the top. */
export const toNextLevel = (points) => { const l = friendLevel(points); return l >= FRIEND_LEVELS.length - 1 ? 0 : FRIEND_LEVELS[l + 1] - points; };

/** Each envoy's favourite gift (+3 instead of +1) and the perk a friend (level 2) earns. */
export const RESIDENT_TASTE = Object.freeze({
  moss: { loves: 'tea', perk: 'meal' },      // one free stew a day
  amber: { loves: 'amber', perk: 'discount' }, // 10 % off at the market
  frost: { loves: 'ink', perk: 'forecast' },  // tomorrow's prices on the market panel
  salt: { loves: 'nacre', perk: 'rumour' },   // her rumours are always true
  ash: { loves: 'oil', perk: 'purse' },       // +10 % tournament purse
});

/** 32-bit string hash (FNV-1a) → 0..1. */
export function hash01(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * Price multiplier of a good on a day: smooth value noise over the days (a knot every 3 days), 0.7 to 1.4.
 * Smooth on purpose: a rising price keeps rising for a day or two, so reading the market pays off.
 */
export function priceFactor(goodId, day) {
  const span = 3, k = Math.floor(day / span), f = (day - k * span) / span;
  const a = hash01(goodId + ':' + k), b = hash01(goodId + ':' + (k + 1));
  const s = f * f * (3 - 2 * f);
  return 0.7 + 0.7 * (a + (b - a) * s);
}

/** What a stall asks for one unit today (whole silk, at least 1). `discount` 0..1 from a friend's perk. */
export function buyPrice(goodId, day, discount = 0) {
  const g = goodById(goodId);
  if (!g) return null;
  return Math.max(1, Math.round(g.base * priceFactor(goodId, day) * (1 - discount)));
}
/** What a stall pays for one unit today: always below today's asking price, so a same-day round trip loses. */
export function sellPrice(goodId, day) {
  const g = goodById(goodId);
  if (!g) return null;
  return Math.max(1, Math.min(buyPrice(goodId, day) - 1, Math.floor(g.base * priceFactor(goodId, day) * SELL_RATE)));
}
/** -1 falling, 0 flat, 1 rising: tomorrow's asking price against today's. */
export function trend(goodId, day) { return Math.sign(buyPrice(goodId, day + 1) - buyPrice(goodId, day)); }

/** The market table for a day: [{id, buy, sell, trend, stall}]. */
export function marketTable(day, discount = 0) {
  return GOODS.map((g) => ({ id: g.id, stall: g.stall, buy: buyPrice(g.id, day, discount), sell: sellPrice(g.id, day), trend: trend(g.id, day) }));
}

/** Silk the city pays for a finished tournament season: a fifth of the season's silk plus a bonus for a good ending. */
export function tournamentPurse({ silk = 0, outcome = '' } = {}, bonusRate = 0) {
  const base = Math.floor(Math.max(0, silk) / 5) + (outcome === 'gift' || outcome === 'survived' ? 10 : outcome === 'gone' || outcome === 'proof_failed' ? 0 : 4);
  return Math.round(base * (1 + bonusRate));
}
