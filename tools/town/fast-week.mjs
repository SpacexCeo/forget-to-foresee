#!/usr/bin/env node
// Fast mode (roadmap item 7): a week of the town market, run through the traders' real policy and the price rules
// (relayer/lib/town-traders.js, relayer/market/prices.js) on the real day curve, snapshotted every 30 minutes into
// game/public/town-week.json for the Economy Lab page (/economy-lab.html), which plays it back in a minute.
// A model run, deterministic (seed below), not chain data; two labelled events show the price rules at work.
//   node tools/town/fast-week.mjs [seed=7]
import { writeFileSync } from 'node:fs';
import { TOWN_POLICY, TOWN_TARGET, townFee, PRICE_UNIT, MICRO } from '../../relayer/lib/town-traders.js';
import { TRADERS, CATALOG as ITEMS } from '../../relayer/market/catalog.js';
import { nextGapMs, DAY_MS } from '../../relayer/market/schedule.js';

let seed = Number(process.argv[2] || 7);
const rand = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
const T0 = Date.UTC(2026, 10, 16), DAYS = 7, STEP = 30 * 60_000, TARGET = TOWN_TARGET;
const EVENTS = [
  { at: T0 + 3 * DAY_MS + 1 * 3_600_000, text: 'Day 4, 01:00 UTC: a night caravan floods the market with 600 salt', run: (st) => { st.stock.salt += 600; } },
  { at: T0 + 5 * DAY_MS + 8 * 3_600_000, text: 'Day 6, 08:00 UTC: festival day, everyone wants bread', run: (st) => { st.demand.bread += 400; } },
];
const st = TOWN_POLICY.init(TRADERS);
// every trader's next attempt (the daemon's Poisson schedule), merged in time order
const next = TRADERS.map((k) => ({ k, at: T0 + nextGapMs(T0, rand, { target: TARGET, traders: 20 }) }));
const frames = []; let trades = 0, volume = 0, fees = 0, ev = 0, lastReason = {};
for (let t = T0; t < T0 + DAYS * DAY_MS; t += STEP) {
  const end = t + STEP;
  for (;;) {
    next.sort((a, b) => a.at - b.at);
    const n = next[0]; if (n.at >= end) break;
    while (ev < EVENTS.length && EVENTS[ev].at <= n.at) { EVENTS[ev].run(st); ev++; }
    st.now = n.at;
    const tr = TOWN_POLICY.pick(st, n.k, rand, TRADERS);
    if (tr) { TOWN_POLICY.apply(st, tr); trades++; volume += tr.silk; fees += townFee(tr.silk); lastReason[tr.item] = tr.reason; }
    n.at += nextGapMs(n.at, rand, { target: TARGET, traders: 20 });
  }
  frames.push({
    t: end - T0, trades, volume: Math.round(volume / MICRO), fees: +(fees / MICRO).toFixed(2),
    price: ITEMS.map((i) => st.prices[i.id]), stock: ITEMS.map((i) => st.stock[i.id]),
    closed: TRADERS.filter((k) => st.closed[k]), purses: TRADERS.map((k) => Math.round(st.balances[k] / MICRO)),
    why: ITEMS.map((i) => lastReason[i.id] || ''),
  });
}
const out = { note: 'A model run of the town market (tools/town/fast-week.mjs, deterministic), not chain data.', step_min: 30, days: DAYS, price_unit_silk: PRICE_UNIT / MICRO,
  items: ITEMS.map((i) => ({ id: i.id, base: i.base, maker: i.maker, kind: i.kind })), traders: TRADERS, events: EVENTS.map((e) => ({ t: e.at - T0, text: e.text })), frames };
writeFileSync(new URL('../../game/public/town-week.json', import.meta.url), JSON.stringify(out));
console.log(`week: ${trades} trades (${Math.round(trades / DAYS)}/day), ${Math.round(volume / MICRO)} silk traded, ${frames.length} frames`);
