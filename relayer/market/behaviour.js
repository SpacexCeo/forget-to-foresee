// What a trader buys, from whom and at what price (docs/market.md). Pure: everything comes from the state and rand().
// Each trader makes and sells its own goods (catalog.js `maker`) and buys what others make: cheap everyday goods
// often, dear ones rarely, food and light most of all. It spends a small share of its silk per trade, so a poor trader
// buys little and a rich one more, which keeps the balances spread but positive (silk is conserved; it only moves).
// Prices are mean-reverting: each trade pulls the item's price back toward its base, with noise and a nudge from the
// seller's purse (a rich seller cuts the price, a poor one asks more), always inside the contract's half-to-twice band.
import { ITEMS, START_BALANCE } from './catalog.js';

/** Goods everyone keeps buying get this extra weight. */
const STAPLES = { bread: 2.5, stew: 1.6, cider: 1.4, candles: 1.6, lamp_oil: 1.4, salt: 1.3, charcoal: 1.2, ice_block: 1 };
export const SPEND_SHARE = 0.04;
export const MAX_QTY = 20;
export const REVERSION = 0.2;

export const priceBand = (base) => [Math.max(1, Math.floor(base / 2)), base * 2];
const clampPrice = (p, base) => { const [lo, hi] = priceBand(base); return Math.max(lo, Math.min(hi, Math.round(p))); };

/** A fresh state: start balances and base prices. */
export function initialState(traders) {
  return { balances: Object.fromEntries(traders.map((k) => [k, START_BALANCE])), prices: Object.fromEntries(ITEMS.map((i) => [i.id, i.base])) };
}

/** The next price of `item` sold by `seller` (mean reversion + noise + the seller's purse). */
export function nextPrice(state, item, seller, rand) {
  const p = state.prices[item.id] ?? item.base, b = state.balances[seller] ?? START_BALANCE;
  const purse = b > 1.6 * START_BALANCE ? -0.04 : b < 0.5 * START_BALANCE ? 0.04 : 0;
  const noise = (rand() + rand() - 1) * 0.08;
  return clampPrice(p + REVERSION * (item.base - p) + (noise + purse) * item.base, item.base);
}

/**
 * The trade `buyer` makes now, or null when it cannot afford anything it wants.
 * @returns {{buyer: string, seller: string, item: string, qty: number, price: number}|null}
 */
export function pickTrade(state, buyer, rand, traders) {
  const balance = state.balances[buyer] ?? 0;
  const options = ITEMS.filter((i) => i.maker !== buyer && traders.includes(i.maker) && (state.prices[i.id] ?? i.base) <= balance);
  if (!options.length) return null;
  const w = options.map((i) => (STAPLES[i.id] || 1) / Math.sqrt(i.base));
  let r = rand() * w.reduce((a, b) => a + b, 0), k = 0;
  while (k < options.length - 1 && r >= w[k]) { r -= w[k]; k++; }
  const item = options[k];
  const price = nextPrice(state, item, item.maker, rand);
  if (price > balance) return null;
  const budget = Math.max(price, balance * SPEND_SHARE * (0.5 + rand()));
  const qty = Math.max(1, Math.min(MAX_QTY, Math.floor(budget / price), Math.floor(balance / price)));
  return { buyer, seller: item.maker, item: item.id, qty, price };
}

/** Applies a trade that went through to the local state. */
export function applyTrade(state, t) {
  const cost = t.qty * t.price;
  state.balances[t.buyer] -= cost;
  state.balances[t.seller] = (state.balances[t.seller] ?? 0) + cost;
  state.prices[t.item] = t.price;
}
