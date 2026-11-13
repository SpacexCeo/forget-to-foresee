// The player market's rules (sprint 6.4; docs/market.md), pure and shared: this file is copied byte for byte to
// relayer/lib/market-rules.js (a test checks it), so the screen and the server can never disagree. Amounts in cents
// (1 silk = 100). A seller lists monster resources for silk; a buyer takes some or all; 2 % of each sale is burned.
export const MARKET = Object.freeze({
  feeBps: 200,                 // 2 % of the total, paid by the seller, removed forever (burned)
  minTotalC: 10,               // 0.10 silk
  bandLow: 0.5, bandHigh: 2,   // unit price between half and double the reference (the stall's price)
  qtyMin: 1, qtyMax: 99,
  maxActive: 10,               // active listings per account
  durationMs: 24 * 60 * 60 * 1000,
  dailyCapC: 50_000,           // 500 silk a day per account, counted for buyer and seller (blocks wash trading)
  reserveMs: 20_000,           // a buy locks its quantity this long while it settles
});
export const TRADABLE = Object.freeze(['spider_silk_thread', 'chitin_plate', 'veil_dust', 'ash_ore', 'crown_shard']);

/** The fee of a sale: 2 % rounded UP to a whole cent. */
export const feeOf = (totalC) => Math.ceil((Math.max(0, Math.round(totalC)) * MARKET.feeBps) / 10_000);
/** The fair range of a unit price around the reference: {minC, maxC}. */
export const bandOf = (refUnitC) => ({ minC: Math.max(1, Math.ceil(refUnitC * MARKET.bandLow)), maxC: Math.floor(refUnitC * MARKET.bandHigh) });
/** The UTC day of a time (the daily cap resets at 00:00 UTC). */
export const dayOf = (ms) => Math.floor(ms / 86_400_000);

/** A new listing: {ok} | {ok: false, error, ...}. `active` = the seller's active listings, `held` = how many it holds. */
export function checkListing({ item, qty, unitC, refUnitC, active = 0, held = Infinity }) {
  if (!TRADABLE.includes(item)) return { ok: false, error: 'not_tradable' };
  if (!Number.isInteger(qty) || qty < MARKET.qtyMin || qty > MARKET.qtyMax) return { ok: false, error: 'bad_qty' };
  if (!Number.isInteger(unitC) || unitC < 1) return { ok: false, error: 'bad_price' };
  const band = bandOf(refUnitC);
  if (unitC < band.minC || unitC > band.maxC) return { ok: false, error: 'outside_band', ...band };
  if (qty * unitC < MARKET.minTotalC) return { ok: false, error: 'too_small', minC: MARKET.minTotalC };
  if (active >= MARKET.maxActive) return { ok: false, error: 'limit_listings', max: MARKET.maxActive };
  if (held < qty) return { ok: false, error: 'not_enough_items', have: held };
  return { ok: true, band };
}

/** Whether a listing can still be bought from now. */
export const isOpen = (l, now) => (l.status === 'active' || l.status === 'partial') && now < l.expiresAt && l.qtyLeft > 0;

/**
 * A buy of `qty` from a listing: {ok, fill: {qty, totalC, feeC, sellerGetsC}} | {ok: false, error, ...}.
 * `spentToday` = {buyer, seller} volumes in cents today; `silkC` = what the buyer can spend.
 */
export function checkBuy({ listing, buyer, qty, now, silkC = Infinity, spentToday = { buyer: 0, seller: 0 } }) {
  if (!listing || !isOpen(listing, now)) return { ok: false, error: 'listing_gone' };
  if (buyer === listing.seller) return { ok: false, error: 'self_trade' };
  if (!Number.isInteger(qty) || qty < 1) return { ok: false, error: 'bad_qty' };
  if (qty > listing.qtyLeft) return { ok: false, error: 'listing_gone', left: listing.qtyLeft };
  const totalC = qty * listing.unitPriceC;
  if (totalC < MARKET.minTotalC) return { ok: false, error: 'too_small', minC: MARKET.minTotalC };
  if (spentToday.buyer + totalC > MARKET.dailyCapC || spentToday.seller + totalC > MARKET.dailyCapC) return { ok: false, error: 'daily_cap', capC: MARKET.dailyCapC };
  if (silkC < totalC) return { ok: false, error: 'not_enough_silk', needC: totalC, haveC: silkC };
  const feeC = feeOf(totalC);
  return { ok: true, fill: { qty, totalC, feeC, sellerGetsC: totalC - feeC } };
}

/** The listing after a fill (pure): quantity, status and the fill appended. */
export function applyFill(listing, fill) {
  const qtyLeft = listing.qtyLeft - fill.qty;
  return { ...listing, qtyLeft, status: qtyLeft === 0 ? 'filled' : 'partial', fills: [...(listing.fills || []), fill] };
}
