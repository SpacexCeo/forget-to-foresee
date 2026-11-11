// Foresight Exchange, Judge Echo (docs/agent-market-plan.md Scope A): a local foresight drill on a sealed snapshot of
// historical reference rates. Practice silk on its own ledger: nothing here touches the season (engine.js, S.silk,
// Merkle leaves). Pure and deterministic: the same snapshot window gives the same quotes, fills and board everywhere.
// Integer money: the ledger counts hundredths of a practice silk ("cents").
import { POLICIES } from './exchange-agents.js';

export const EXCHANGE_SPEC = 'ftf-exchange/1';
export const DISCLAIMER = 'Local foresight drill — no prizes, no real money, not financial advice.';
/** The three Echoes: lore name, outer-world series (muted in the UI) and the snapshot column. */
export const ECHOES = Object.freeze([
  Object.freeze({ id: 'salt', name: 'Echo of Salt', series: 'USD/EUR', quote: 'EUR' }),
  Object.freeze({ id: 'amber', name: 'Echo of Amber', series: 'USD/JPY', quote: 'JPY' }),
  Object.freeze({ id: 'frost', name: 'Echo of Frost', series: 'USD/CHF', quote: 'CHF' }),
]);
export const ECHO_IDS = ECHOES.map((e) => e.id);
/**
 * Rules. An Echo's price is `unit` practice silk at the snapshot's first day and moves `amplify` times the outer-world
 * rate's change since then (daily FX moves of a few tenths of a percent become a readable drill). Spread 0.4 %, fee
 * 1 % of notional floored to whole silk (at least 1), long only, at most 5 units per order, 3 orders per bar for the
 * human and 1 for each agent. At the end every position is closed at the last bid (no fee on that close).
 */
export const RULES = Object.freeze({ purse: 100, unit: 10, amplify: 25, spread: 0.004, feeRate: 0.01, maxQty: 5, humanOrdersPerBar: 3, agentOrdersPerBar: 1, defaultBars: 8, shortBars: 4 });
export const ACTORS = Object.freeze([
  Object.freeze({ id: 'iris', kind: 'human', name: 'You' }),
  Object.freeze({ id: 'salt', kind: 'agent', name: 'Salt' }),
  Object.freeze({ id: 'amber', kind: 'agent', name: 'Amber' }),
  Object.freeze({ id: 'frost', kind: 'agent', name: 'Frost' }),
]);

/** The hashed payload of a snapshot: the quotes and the bars, keys in a fixed order. */
export function canonicalSnapshotPayload(snap) {
  const quotes = snap.quotes.slice();
  return JSON.stringify({ quotes, bars: snap.bars.map((b) => [b.t, ...quotes.map((q) => b[q])]) });
}

/** Mid of an Echo at absolute snapshot bar `i`, in cents (integer, at least 1). */
export function midCents(snap, echoId, i) {
  const e = ECHOES.find((x) => x.id === echoId);
  const v0 = snap.bars[0][e.quote], v = snap.bars[i][e.quote];
  return Math.max(1, Math.round(100 * RULES.unit * (1 + RULES.amplify * (v / v0 - 1))));
}
export const bidOf = (mid) => Math.floor(mid * (1 - RULES.spread / 2));
export const askOf = (mid) => Math.ceil(mid * (1 + RULES.spread / 2));
/** Fee in cents for a notional in cents: 1 % floored to whole practice silk, at least 1 silk when notional >= 1 silk. */
export function feeCents(notional) {
  if (notional < 100) return 0;
  return Math.max(1, Math.floor((notional * RULES.feeRate) / 100)) * 100;
}

/**
 * Starts a drill on a window of the snapshot. Returns {ok, drill} or {ok: false, reason}.
 * @param {object} snap @param {{startIndex?: number, barCount?: number}} [w]
 */
export function startDrill(snap, { startIndex = 0, barCount = RULES.defaultBars } = {}) {
  if (!snap || snap.spec !== 'ftf-exchange-snapshot/1' || !Array.isArray(snap.bars) || snap.bars.length < 2) return { ok: false, reason: 'bad_snapshot' };
  if (!Number.isInteger(startIndex) || !Number.isInteger(barCount) || startIndex < 0 || barCount < 2 || barCount > 12 || startIndex + barCount > snap.bars.length) return { ok: false, reason: 'bad_window' };
  const accounts = {};
  for (const a of ACTORS) accounts[a.id] = { cash: RULES.purse * 100, pos: Object.fromEntries(ECHO_IDS.map((id) => [id, 0])), fills: 0, orders: 0 };
  const drill = { spec: EXCHANGE_SPEC, phase: 'open', snapshot: snap, snapshotId: snap.id, hash: snap.hash, startIndex, barCount, bar: 0, accounts, fills: [] };
  runAgents(drill);
  return { ok: true, drill };
}

const absBar = (d) => d.startIndex + d.bar;
const quote = (d, echoId) => { const mid = midCents(d.snapshot, echoId, absBar(d)); return { mid, bid: bidOf(mid), ask: askOf(mid) }; };

/** Mids already public (window bars 0..current), per Echo. Never a later bar. */
export function publicHistory(d, echoId) {
  const out = [];
  for (let b = 0; b <= d.bar; b++) out.push(midCents(d.snapshot, echoId, d.startIndex + b));
  return out;
}

/**
 * A market order. Fills at once and in full, or is rejected.
 * @returns {{ok: true, fill: object} | {ok: false, reason: string}}
 */
export function placeOrder(d, actorId, { echo, side, qty } = {}) {
  if (!d || d.phase !== 'open') return { ok: false, reason: 'phase' };
  const acc = d.accounts[actorId];
  const actor = ACTORS.find((a) => a.id === actorId);
  if (!acc || !actor) return { ok: false, reason: 'bad_actor' };
  if (!ECHO_IDS.includes(echo)) return { ok: false, reason: 'bad_echo' };
  if (side !== 'buy' && side !== 'sell') return { ok: false, reason: 'bad_side' };
  if (!Number.isInteger(qty) || qty < 1 || qty > RULES.maxQty) return { ok: false, reason: 'qty' };
  const limit = actor.kind === 'human' ? RULES.humanOrdersPerBar : RULES.agentOrdersPerBar;
  if (acc.orders >= limit) return { ok: false, reason: 'too_many_orders' };
  const q = quote(d, echo);
  let price, notional, fee;
  if (side === 'buy') {
    price = q.ask; notional = qty * price; fee = feeCents(notional);
    if (notional + fee > acc.cash) return { ok: false, reason: 'no_silk' };
    acc.cash -= notional + fee; acc.pos[echo] += qty;
  } else {
    if (acc.pos[echo] < qty) return { ok: false, reason: 'no_position' };
    price = q.bid; notional = qty * price; fee = Math.min(feeCents(notional), notional);
    acc.cash += notional - fee; acc.pos[echo] -= qty;
  }
  acc.orders++; acc.fills++;
  const fill = { bar: d.bar, actor: actorId, echo, side, qty, price, fee };
  d.fills.push(fill);
  return { ok: true, fill };
}

/** Publishes the next bar (agents act on it), or settles the drill after the last bar. */
export function advanceBar(d) {
  if (!d || d.phase !== 'open') return { ok: false, reason: 'phase' };
  if (d.bar + 1 >= d.barCount) { settle(d); return { ok: true, settled: true }; }
  d.bar++;
  for (const a of Object.values(d.accounts)) a.orders = 0;
  runAgents(d);
  return { ok: true, settled: false, bar: d.bar };
}

function settle(d) {
  for (const a of Object.values(d.accounts)) {
    for (const id of ECHO_IDS) if (a.pos[id] > 0) { a.cash += a.pos[id] * quote(d, id).bid; a.pos[id] = 0; }
  }
  d.phase = 'settled';
}

/** Scripted agents act once per bar, right after it is published, seeing only public mids and their own account. */
function runAgents(d) {
  for (const a of ACTORS) {
    if (a.kind !== 'agent') continue;
    const acc = d.accounts[a.id];
    const history = Object.fromEntries(ECHO_IDS.map((id) => [id, publicHistory(d, id)]));
    const order = POLICIES[a.id]({ history, positions: { ...acc.pos }, cash: acc.cash });
    if (order) placeOrder(d, a.id, order);
  }
}

/** Mark-to-market in cents: cash plus positions at the current bid. */
export function markCents(d, actorId) {
  const a = d.accounts[actorId];
  let m = a.cash;
  for (const id of ECHO_IDS) if (a.pos[id]) m += a.pos[id] * quote(d, id).bid;
  return m;
}

/** The board, best first: mark, then fewer fills, then name. */
export function board(d) {
  return ACTORS.map((a) => ({ id: a.id, kind: a.kind, name: a.name, mark: markCents(d, a.id), fills: d.accounts[a.id].fills }))
    .sort((x, y) => y.mark - x.mark || x.fills - y.fills || x.name.localeCompare(y.name));
}

/** What a player sees (the observation's `exchange`): public mids only, the board, their purse. */
export function exchangeView(d, actorId = 'iris') {
  if (!d) return { phase: 'idle', spec: EXCHANGE_SPEC, disclaimer: DISCLAIMER, simulation: true };
  const acc = d.accounts[actorId] || d.accounts.iris;
  return {
    phase: d.phase, spec: EXCHANGE_SPEC, simulation: true, disclaimer: DISCLAIMER,
    snapshotId: d.snapshotId, hash: d.hash, startIndex: d.startIndex, bar: d.bar + 1, barCount: d.barCount,
    date: d.snapshot.bars[absBar(d)].t,
    echoes: ECHOES.map((e) => { const q = quote(d, e.id); return { id: e.id, name: e.name, series: e.series, mid: q.mid, bid: q.bid, ask: q.ask, history: publicHistory(d, e.id) }; }),
    you: { practiceSilk: acc.cash, positions: { ...acc.pos }, ordersLeft: Math.max(0, RULES.humanOrdersPerBar - acc.orders) },
    board: board(d),
    fills: d.fills.slice(-12),
    units: 'cents of practice silk',
  };
}

/** The exportable result (copy / save): no personal data. */
export function drillResult(d, at = new Date().toISOString()) {
  return { spec: EXCHANGE_SPEC, simulation: true, disclaimer: DISCLAIMER, snapshotId: d.snapshotId, startIndex: d.startIndex, barCount: d.barCount, hash: d.hash, scores: board(d).map(({ id, kind, name, mark }) => ({ id, kind, name, practiceSilk: mark / 100 })), fills: d.fills.length, at };
}
