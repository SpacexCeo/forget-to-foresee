// The town's 20 scripted traders on ftf-town (docs/town-economy.md §2.9): the market daemon (market/daemon.js:
// schedule, own-key signing, cap, pause, state file, JSONL log, stats) with the town's policy. Each trade is one
// `trade({counterparty, silk, reference})` call: the buyer pays the maker of a good in silk, 0.12 % of it goes to the
// town treasury and, through the daily sweep, funds the works' rewards. Scripted rules, not an LLM.
// DRY RUN BY DEFAULT: nothing is signed or sent unless FTF_TOWN_SEND=1; keys only on the relayer's server.
import { ITEMS, START_BALANCE, traderKey } from '../market/catalog.js';
import { nextPrice } from '../market/behaviour.js';

export const TOWN_TARGET = 22_000; // ~1,100 trades per trader per day (the spec's 5-10 % margin over 20,000)
export const MICRO = 1_000_000;
export const MIN_TRADE = MICRO / 2; // the contract's min_trade
export const FEE_BPS = 12;
/** A good's price unit: a fifth of a silk (bread 0.6 silk, polished shard 8 silk), so the mean trade is ~2 silk. */
export const PRICE_UNIT = MICRO / 5;
const STAPLES = { bread: 2.5, stew: 1.6, cider: 1.4, candles: 1.6, lamp_oil: 1.4, salt: 1.3, charcoal: 1.2, ice_block: 1 };

export const townFee = (silk) => Math.floor((silk * FEE_BPS) / 10_000);

export const TOWN_POLICY = Object.freeze({
  init: (keys) => ({ balances: Object.fromEntries(keys.map((k) => [k, START_BALANCE * MICRO])), prices: Object.fromEntries(ITEMS.map((i) => [i.id, i.base])) }),
  /** Buyer `key` picks a good made by someone else (staples often, dear goods rarely), at a mean-reverting price. */
  pick(st, key, rand, keys) {
    const balance = st.balances[key] ?? 0;
    const options = ITEMS.filter((i) => i.maker !== key && keys.includes(i.maker));
    if (!options.length || balance < MIN_TRADE) return null;
    // quiet stalls draw buyers: a seller with less silk than the start is picked more often (keeps the town solvent)
    const S0 = START_BALANCE * MICRO;
    const w = options.map((i) => ((STAPLES[i.id] || 1) / Math.sqrt(i.base)) * Math.max(0.2, Math.min(5, (S0 / Math.max(1, st.balances[i.maker] ?? S0)) ** 1.5)));
    let r = rand() * w.reduce((a, b) => a + b, 0), k = 0;
    while (k < options.length - 1 && r >= w[k]) { r -= w[k]; k++; }
    const item = options[k];
    const price = nextPrice({ prices: st.prices, balances: Object.fromEntries(Object.entries(st.balances).map(([a, v]) => [a, v / MICRO])) }, item, item.maker, rand);
    // a richer buyer buys more at once, a poorer one less: silk flows back toward the middle
    const qty = 1 + Math.floor(rand() * 3.5 * Math.min(3, balance / (START_BALANCE * MICRO)));
    const silk = Math.max(MIN_TRADE, qty * price * PRICE_UNIT);
    if (silk > balance) return null;
    return { buyer: key, seller: item.maker, item: item.id, qty, price, silk };
  },
  apply(st, t) { st.balances[t.buyer] -= t.silk; st.balances[t.seller] = (st.balances[t.seller] ?? 0) + t.silk - townFee(t.silk); st.prices[t.item] = t.price; },
  args: (t, accountOf) => ({ counterparty: accountOf(t.seller), silk: String(t.silk), reference: t.item }),
  async sync(client, contractId, st, accountOf) {
    const keys = Object.keys(st.balances), accounts = keys.map(accountOf);
    const [rows, pulse] = await Promise.all([client.view(contractId, 'balances_of', { account_ids: accounts }), client.view(contractId, 'pulse')]);
    (rows || []).forEach((row, i) => { if (row && traderKey(accounts[i])) st.balances[keys[i]] = Number(row.silk); });
    return pulse && { day: pulse.day, today: null, total: pulse.counters && pulse.counters.trade };
  },
  row: (t) => ({ buyer: t.buyer, seller: t.seller, item: t.item, qty: t.qty, price: t.price, silk: t.silk }),
  refetch: /ERR_FUNDS/,
});

/** The town traders' environment: off unless FTF_TOWN=1; sends only with FTF_TOWN_SEND=1. */
export const townEnv = (env = process.env) => ({
  enabled: env.FTF_TOWN === '1',
  send: env.FTF_TOWN_SEND === '1',
  contract: env.FTF_TOWN_CONTRACT || 'ftf-town.testnet',
  target: Math.max(1, Math.min(100_000, Number(env.FTF_TOWN_TARGET) || TOWN_TARGET)),
});
