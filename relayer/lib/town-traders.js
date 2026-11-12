// The town's 20 scripted traders on ftf-town (docs/town-economy.md §2.9): the market daemon (market/daemon.js:
// schedule, own-key signing, cap, pause, state file, JSONL log, stats) with the town's policy. Each trade is one
// `trade({counterparty, silk, reference})` call: the buyer pays the maker of a good in silk, 0.12 % of it goes to the
// town treasury and, through the daily sweep, funds the works' rewards. Scripted rules, not an LLM.
// DRY RUN BY DEFAULT: nothing is signed or sent unless FTF_TOWN_SEND=1; keys only on the relayer's server.
import { ITEMS, START_BALANCE, traderKey } from '../market/catalog.js';
import { priceOf, nextDemand, stallClosed, choiceWeight, STOCK_START, STOCK_CAP, RESTOCK_PER_HOUR, CLOSED_MAKES } from '../market/prices.js';

export const TOWN_TARGET = 22_000; // attempts a day: ~1,100 per trader (the spec's margin over 20,000); a stock-out skips an attempt
export const MICRO = 1_000_000;
export const MIN_TRADE = MICRO / 2; // the contract's min_trade
export const FEE_BPS = 12;
/** A good's price unit: a fifth of a silk (bread 0.6 silk, polished shard 8 silk), so the mean trade is ~2 silk. */
export const PRICE_UNIT = MICRO / 5;
const STAPLES = { bread: 2.5, stew: 1.6, cider: 1.4, candles: 1.6, lamp_oil: 1.4, salt: 1.3, charcoal: 1.2, ice_block: 1 };

export const townFee = (silk) => Math.floor((silk * FEE_BPS) / 10_000);

/** Production and demand decay since the last look (the daemon sets st.now; a simulation advances 4 s a pick). */
function tick(st) {
  if (!st.stock) return;
  const now = st.now ?? (st.at ?? 0) + 4_000;
  if (st.at == null) { st.at = now; return; }
  const minutes = (now - st.at) / 60_000;
  if (minutes <= 0) return;
  st.at = now;
  const makerOf = Object.fromEntries(ITEMS.map((i) => [i.id, i.maker])), baseOf = Object.fromEntries(ITEMS.map((i) => [i.id, i.base]));
  for (const id of Object.keys(st.stock)) {
    // supply answers price (a good selling dear is made faster, up to 2x; a cheap one slower), a poor stall works
    // harder (up to 3x), a closed stall at CLOSED_MAKES of its pace; fractional production carries over
    const maker = makerOf[id];
    const ratio = Math.max(0.5, Math.min(2, (st.prices[id] ?? baseOf[id]) / baseOf[id]));
    const need = Math.max(1, Math.min(3, (START_BALANCE * MICRO) / Math.max(1, st.balances[maker] ?? 1)));
    const rate = RESTOCK_PER_HOUR * ratio * need * (st.closed && st.closed[maker] ? CLOSED_MAKES : 1);
    const made = (st.prod[id] ?? 0) + (minutes / 60) * rate;
    const whole = Math.floor(made); st.prod[id] = made - whole;
    if (st.stock[id] < STOCK_CAP) st.stock[id] = Math.min(STOCK_CAP, st.stock[id] + whole); // a flood above the cap stays until it sells
    st.demand[id] = nextDemand(st.demand[id] ?? 0, minutes);
  }
}
/** Bankruptcy with hysteresis (market/prices.js stallClosed), remembered per trader. */
function closedNow(st, key) {
  if (!st.closed) return false;
  st.closed[key] = stallClosed((st.balances[key] ?? 0) / MICRO, !!st.closed[key]);
  return st.closed[key];
}

export const TOWN_POLICY = Object.freeze({
  init: (keys) => ({
    balances: Object.fromEntries(keys.map((k) => [k, START_BALANCE * MICRO])), prices: Object.fromEntries(ITEMS.map((i) => [i.id, i.base])),
    stock: Object.fromEntries(ITEMS.map((i) => [i.id, STOCK_START])), demand: Object.fromEntries(ITEMS.map((i) => [i.id, 0])), closed: {}, at: null, prod: {},
  }),
  /**
   * Buyer `key` picks a good made by someone else (staples often, dear goods rarely) from an open stall with stock,
   * at the price the town's price rules give (market/prices.js: stock and demand), with the trader's reason.
   */
  pick(st, key, rand, keys, strat = null) {
    tick(st);
    const balance = st.balances[key] ?? 0;
    if (closedNow(st, key)) return null; // a closed (bankrupt) stall buys nothing; it keeps selling and makes goods at half pace
    const options = ITEMS.filter((i) => i.maker !== key && keys.includes(i.maker) && (st.stock[i.id] ?? 0) > 0);
    if (!options.length || balance < MIN_TRADE) return null;
    // quiet stalls draw buyers: a seller with less silk than the start is picked more often (keeps the town solvent)
    const S0 = START_BALANCE * MICRO;
    // a clan's strategy (lib/clan-strategy.js, bounded) only reweights the same choice: staples or dear goods, a favoured stall
    const style = (i) => (!strat ? 1 : strat.buy === 'staples' ? (STAPLES[i.id] ? 1.8 : 0.7) : strat.buy === 'dear' ? Math.sqrt(i.base) / 2 : 1) * (strat && strat.favour === i.maker ? 2.5 : 1);
    // price elasticity (market/prices.js choiceWeight): a dear good is bought less, a cheap one more — the loop that
    // lets flooded goods clear and empties shelves refill
    const w = options.map((i) => ((STAPLES[i.id] || 1) / Math.sqrt(i.base)) * Math.max(0.2, Math.min(5, (S0 / Math.max(1, st.balances[i.maker] ?? S0)) ** 1.5)) * style(i)
      * choiceWeight(i, priceOf(i, st.stock[i.id] ?? 0, st.demand[i.id] ?? 0).price));
    let r = rand() * w.reduce((a, b) => a + b, 0), k = 0;
    while (k < options.length - 1 && r >= w[k]) { r -= w[k]; k++; }
    const item = options[k];
    const stock = st.stock[item.id] ?? 0;
    const { price, reason } = priceOf(item, stock, st.demand[item.id] ?? 0);
    // a richer buyer buys more at once, a poorer one less: silk flows back toward the middle
    const risk = strat ? Math.max(0.5, Math.min(1.5, Number(strat.risk) || 1)) : 1;
    const qty = Math.min(stock, 1 + Math.floor(rand() * 3 * risk * Math.min(8, (balance / (START_BALANCE * MICRO)) ** 1.5)));
    const silk = Math.max(MIN_TRADE, qty * price * PRICE_UNIT);
    if (silk > balance) return null;
    return { buyer: key, seller: item.maker, item: item.id, qty, price, silk, reason, stock: stock - qty };
  },
  apply(st, t) {
    st.balances[t.buyer] -= t.silk; st.balances[t.seller] = (st.balances[t.seller] ?? 0) + t.silk - townFee(t.silk); st.prices[t.item] = t.price;
    if (st.stock) { st.stock[t.item] = Math.max(0, (st.stock[t.item] ?? 0) - t.qty); st.demand[t.item] = (st.demand[t.item] ?? 0) + t.qty; }
  },
  args: (t, accountOf) => ({ counterparty: accountOf(t.seller), silk: String(t.silk), reference: t.item }),
  async sync(client, contractId, st, accountOf) {
    const keys = Object.keys(st.balances), accounts = keys.map(accountOf);
    const [rows, pulse] = await Promise.all([client.view(contractId, 'balances_of', { account_ids: accounts }), client.view(contractId, 'pulse')]);
    (rows || []).forEach((row, i) => { if (row && traderKey(accounts[i])) st.balances[keys[i]] = Number(row.silk); });
    return pulse && { day: pulse.day, today: null, total: pulse.counters && pulse.counters.trade };
  },
  row: (t) => ({ buyer: t.buyer, seller: t.seller, item: t.item, qty: t.qty, price: t.price, silk: t.silk, reason: t.reason, stock: t.stock }),
  refetch: /ERR_FUNDS/,
});

/** The town traders' environment: off unless FTF_TOWN=1; sends only with FTF_TOWN_SEND=1. */
export const townEnv = (env = process.env) => ({
  enabled: env.FTF_TOWN === '1',
  send: env.FTF_TOWN_SEND === '1',
  contract: env.FTF_TOWN_CONTRACT || 'ftf-town.testnet',
  target: Math.max(1, Math.min(100_000, Number(env.FTF_TOWN_TARGET) || TOWN_TARGET)),
});
