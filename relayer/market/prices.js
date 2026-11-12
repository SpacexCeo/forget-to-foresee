// THE TOWN'S PRICE RULES — the one file that decides what goods cost (owner's roadmap, items 1, 2 and 6).
// Plain numbers, no randomness, no clock of its own: given a good's stock and recent demand it returns a price and
// the trader's reason in words ("dear: only 3 iron left, demand rose"). The relayer's traders (lib/town-traders.js)
// use it for every trade, the stats carry the reason, and the game shows it as the trader's tooltip.
//
// 1. Every trader keeps an inventory of the goods it makes. It produces RESTOCK_PER_HOUR units of each good an hour,
//    up to STOCK_CAP; every sale takes units out of it. A good with no stock cannot be bought.
// 2. Demand is the number of units bought in the last hour or so (an exponential moving average, DEMAND_HALF_LIFE).
// 3. price = base × scarcity × demand, kept between half and twice the base:
//      scarcity = (STOCK_REF / max(stock, 1)) ^ SCARCITY_POWER     fewer units on the shelf → dearer
//      demand   = 1 + DEMAND_WEIGHT × (demand / DEMAND_REF − 1)    more buyers than usual → dearer
//    Flood the market (big stock) and the price falls; buy a stall empty and it rises.
// 4. Buyers answer prices: the chance of picking a good is weighted by (base / price) ^ ELASTICITY, so a dear good is
//    bought less and a flooded, cheap one more. This is what clears gluts and lets empty shelves refill.
// 5. A trader whose silk falls below BANKRUPT_SILK closes its stall: it stops buying and makes goods at CLOSED_MAKES
//    of its pace, selling its way back, until its purse is above REOPEN_SILK again (from sales, wages, or an
//    investor's pledge into the stall: ftf-town invest_stall).
// Prices are in fifths of a silk (PRICE_UNIT in lib/town-traders.js): bread's base 3 = 0.6 silk.

export const STOCK_CAP = 240;
export const STOCK_START = 120;
export const STOCK_REF = 120;
export const RESTOCK_PER_HOUR = 80; // ~22,000 trades x ~2 units a day over 25 goods
export const SCARCITY_POWER = 0.4;
export const DEMAND_REF = 80; // the moving average of a good bought at the average pace
export const DEMAND_WEIGHT = 0.5;
export const DEMAND_HALF_LIFE_MIN = 45;
export const PRICE_BAND = Object.freeze([0.5, 2]);
export const BANKRUPT_SILK = 40;
export const REOPEN_SILK = 120;
export const ELASTICITY = 2;
export const CLOSED_MAKES = 0.5;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** The price of one unit and the trader's reason. */
export function priceOf({ id, base }, stock, demand) {
  const scarcity = Math.pow(STOCK_REF / Math.max(stock, 1), SCARCITY_POWER);
  const pull = 1 + DEMAND_WEIGHT * (demand / DEMAND_REF - 1);
  const factor = clamp(scarcity * pull, PRICE_BAND[0], PRICE_BAND[1]);
  const price = Math.max(1, Math.round(base * factor));
  return { price, reason: reasonFor(id, stock, demand, factor) };
}

/** How much a price draws or repels buyers: (base / price) ^ ELASTICITY. */
export const choiceWeight = ({ base }, price) => Math.pow(base / Math.max(1, price), ELASTICITY);

/** The trader's words for a price ("dear: only 3 iron left, demand rose"). */
export function reasonFor(id, stock, demand, factor) {
  const name = id.replace(/_/g, ' ');
  const parts = [];
  if (stock <= STOCK_REF / 4) parts.push(`only ${stock} ${name} left`);
  else if (stock >= STOCK_CAP * 0.85) parts.push(`${stock} ${name} on the shelf`);
  if (demand >= DEMAND_REF * 1.5) parts.push('demand rose');
  else if (demand <= DEMAND_REF * 0.5) parts.push('few buyers');
  const mood = factor >= 1.15 ? 'dear' : factor <= 0.87 ? 'cheap' : 'fair';
  return parts.length ? `${mood}: ${parts.join(', ')}` : `${mood} price`;
}

/** Production since the last look: +RESTOCK_PER_HOUR an hour, up to STOCK_CAP. */
export const restocked = (stock, hours) => Math.min(STOCK_CAP, stock + Math.floor(Math.max(0, hours) * RESTOCK_PER_HOUR));

/** Demand after `minutes` of decay and `bought` new units. */
export const nextDemand = (demand, minutes, bought = 0) => demand * Math.pow(0.5, Math.max(0, minutes) / DEMAND_HALF_LIFE_MIN) + bought;

/** Whether a stall is closed (bankrupt) given its silk (whole silk) and whether it was closed before. */
export const stallClosed = (silk, wasClosed) => (wasClosed ? silk < REOPEN_SILK : silk < BANKRUPT_SILK);
