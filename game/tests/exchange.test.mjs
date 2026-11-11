// Foresight Exchange, Judge Echo (docs/agent-market-plan.md Scope A): the sealed snapshot, deterministic windows,
// integer fills and fees, long only, no overspending, the forced close at the last bid, agents that never see a future
// bar, the per-bar order limits, and the room command bus (kind 'exchange', season untouched).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sha256 } from '../src/game/crypto.js';
import { canonicalSnapshotPayload, startDrill, placeOrder, advanceBar, exchangeView, drillResult, board, publicHistory, midCents, bidOf, askOf, feeCents, RULES, ECHO_IDS, DISCLAIMER } from '../src/game/exchange.js';
import { POLICIES } from '../src/game/exchange-agents.js';
import { SNAPSHOT, JUDGE_WINDOW } from '../src/net/exchange-deployment.js';
import { createApi } from '../src/net/api.js';

test('snapshot: the committed hash matches its bars; the public JSON equals the module; attribution is present', () => {
  assert.equal(SNAPSHOT.spec, 'ftf-exchange-snapshot/1');
  assert.equal(sha256(canonicalSnapshotPayload(SNAPSHOT)), SNAPSHOT.hash);
  const pub = JSON.parse(readFileSync(new URL('../public/data/exchange-snapshot-v1.json', import.meta.url), 'utf8'));
  assert.deepEqual(pub, JSON.parse(JSON.stringify(SNAPSHOT)));
  assert.ok(SNAPSHOT.bars.length >= 40);
  assert.match(SNAPSHOT.attribution, /European Central Bank/);
  // one changed digit changes the hash
  const bad = { ...SNAPSHOT, bars: SNAPSHOT.bars.map((b, i) => (i === 5 ? { ...b, EUR: b.EUR + 0.0001 } : b)) };
  assert.notEqual(sha256(canonicalSnapshotPayload(bad)), SNAPSHOT.hash);
});

test('replay: the same window gives the same quotes, fills and board; integer cents everywhere', () => {
  const play = () => {
    const d = startDrill(SNAPSHOT, { startIndex: 3, barCount: 8 }).drill;
    placeOrder(d, 'iris', { echo: 'salt', side: 'buy', qty: 2 });
    while (d.phase === 'open') advanceBar(d);
    return { fills: d.fills, board: board(d) };
  };
  const a = play(), b = play();
  assert.deepEqual(a, b);
  for (const f of a.fills) { assert.ok(Number.isInteger(f.price) && Number.isInteger(f.fee)); }
  for (const r of a.board) assert.ok(Number.isInteger(r.mark));
  assert.equal(midCents(SNAPSHOT, 'salt', 0), RULES.unit * 100, 'an Echo starts at 10 practice silk');
});

test('buy, sell, fee and spread: ask above bid, fee 1 % floored to whole silk (min 1), cash exact', () => {
  const d = startDrill(SNAPSHOT, { startIndex: 0, barCount: 4 }).drill;
  const mid = midCents(SNAPSHOT, 'amber', 0), ask = askOf(mid), bid = bidOf(mid);
  assert.ok(ask > mid && bid < mid);
  assert.equal(feeCents(5000), 100, '50 silk -> 0.5 floored, minimum 1 silk');
  assert.equal(feeCents(25000), 200, '250 silk -> 2 silk');
  assert.equal(feeCents(50), 0);
  const cash0 = d.accounts.iris.cash;
  const r = placeOrder(d, 'iris', { echo: 'amber', side: 'buy', qty: 3 });
  assert.equal(r.ok, true);
  assert.equal(d.accounts.iris.cash, cash0 - 3 * ask - feeCents(3 * ask));
  const s = placeOrder(d, 'iris', { echo: 'amber', side: 'sell', qty: 3 });
  assert.equal(s.ok, true);
  assert.equal(d.accounts.iris.cash, cash0 - 3 * ask - feeCents(3 * ask) + 3 * bid - feeCents(3 * bid));
  assert.ok(d.accounts.iris.cash < cash0, 'a round trip in the same bar always costs the spread and two fees');
});

test('long only, no overspending, quantity and phase guards, 3 orders per bar for the human', () => {
  const d = startDrill(SNAPSHOT, { startIndex: 0, barCount: 4 }).drill;
  assert.equal(placeOrder(d, 'iris', { echo: 'frost', side: 'sell', qty: 1 }).reason, 'no_position');
  assert.equal(placeOrder(d, 'iris', { echo: 'frost', side: 'buy', qty: 6 }).reason, 'qty');
  assert.equal(placeOrder(d, 'iris', { echo: 'gold', side: 'buy', qty: 1 }).reason, 'bad_echo');
  for (let i = 0; i < 3; i++) placeOrder(d, 'iris', { echo: 'salt', side: 'buy', qty: 1 });
  assert.equal(placeOrder(d, 'iris', { echo: 'salt', side: 'buy', qty: 1 }).reason, 'too_many_orders');
  advanceBar(d);
  // 100 silk cannot buy 50 units: at most 9 units of ~10 silk with fees
  let r;
  for (let i = 0; i < 3; i++) r = placeOrder(d, 'iris', { echo: 'frost', side: 'buy', qty: 5 });
  assert.equal(r.reason, 'no_silk');
  assert.ok(d.accounts.iris.cash >= 0);
  while (d.phase === 'open') advanceBar(d);
  assert.equal(placeOrder(d, 'iris', { echo: 'salt', side: 'buy', qty: 1 }).reason, 'phase');
  assert.equal(advanceBar(d).reason, 'phase');
});

test('settlement: every position closes at the last bid, no units remain, the board is sorted by mark', () => {
  const d = startDrill(SNAPSHOT, { startIndex: 5, barCount: 3 }).drill;
  placeOrder(d, 'iris', { echo: 'salt', side: 'buy', qty: 2 });
  advanceBar(d); advanceBar(d);
  const cashBefore = d.accounts.iris.cash, lastBid = bidOf(midCents(SNAPSHOT, 'salt', 7));
  assert.equal(advanceBar(d).settled, true);
  assert.equal(d.phase, 'settled');
  assert.equal(d.accounts.iris.cash, cashBefore + 2 * lastBid, 'closed at the last bid, no fee on the forced close');
  for (const a of Object.values(d.accounts)) for (const id of ECHO_IDS) assert.equal(a.pos[id], 0);
  const b = board(d);
  for (let i = 1; i < b.length; i++) assert.ok(b[i - 1].mark >= b[i].mark);
  assert.deepEqual(b.map((x) => x.id).sort(), ['amber', 'frost', 'iris', 'salt']);
});

test('agents see only published bars: each policy is called with histories exactly bar+1 long, one order per bar', () => {
  const seen = [];
  assert.ok(Object.isFrozen(POLICIES));
  const d = startDrill(SNAPSHOT, { startIndex: 0, barCount: 8 }).drill;
  while (d.phase === 'open') {
    for (const id of ECHO_IDS) assert.equal(publicHistory(d, id).length, d.bar + 1);
    seen.push(d.fills.filter((f) => f.bar === d.bar && f.actor !== 'iris').length);
    advanceBar(d);
  }
  for (const f of d.fills) {
    const mid = midCents(SNAPSHOT, f.echo, d.startIndex + f.bar);
    assert.equal(f.price, f.side === 'buy' ? askOf(mid) : bidOf(mid), 'filled at the quote of the bar it was placed in');
  }
  for (const n of seen) assert.ok(n <= 3, 'at most one order per agent per bar');
  assert.ok(d.fills.some((f) => f.actor !== 'iris'), 'the agents trade');
  // the policies' own source never indexes ahead of the history they are given
  const src = readFileSync(new URL('../src/game/exchange-agents.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /snapshot|bars\[|import /);
});

test('views: disclaimer on every phase, history only up to the current bar, the result is honest and exportable', () => {
  const idle = exchangeView(null);
  assert.equal(idle.disclaimer, DISCLAIMER);
  const d = startDrill(SNAPSHOT, JUDGE_WINDOW).drill;
  assert.equal(d.barCount, RULES.shortBars, 'the judge drill is the 4-bar short drill');
  const v = exchangeView(d);
  assert.equal(v.simulation, true);
  assert.equal(v.disclaimer, DISCLAIMER);
  for (const e of v.echoes) assert.equal(e.history.length, 1);
  while (d.phase === 'open') advanceBar(d);
  const res = drillResult(d, '2026-11-12T00:00:00Z');
  assert.deepEqual(Object.keys(res).sort(), ['at', 'barCount', 'disclaimer', 'fills', 'hash', 'scores', 'simulation', 'snapshotId', 'spec', 'startIndex']);
  assert.equal(res.hash, SNAPSHOT.hash);
  assert.equal(res.scores.length, 4);
  assert.doesNotMatch(JSON.stringify(res), /wallet|invest|profit|APY|withdraw|mainnet/i);
});

test('room bus: exchange commands run through the same envelope, never touch the season, and the observation hides future bars', () => {
  const api = createApi({ allowClientSeed: true, maxTimeScale: 1000 });
  const { sessionId, token } = api.createSession({ worldRules: 'free', timeScale: 1000, seedHex: 'cc161d308faa67539af44205b56b6d4f' }).body;
  let n = 0;
  const obs = () => api.observe(sessionId, token).body.observation;
  const cmd = (type, args = {}) => api.command(sessionId, token, { actionId: `exch-test-${++n}`, expectedVersion: obs().version, type, args });
  assert.equal(obs().exchange.phase, 'idle');
  const before = JSON.stringify({ silk: obs().iris.silk, tick: obs().season.tick, root: obs().season.merkleRoot });
  assert.equal(cmd('start_exchange', { startIndex: 10, barCount: 4 }).status, 200);
  assert.equal(cmd('start_exchange', {}).body.error.reason, 'already_open');
  assert.equal(cmd('place_order', { echo: 'salt', side: 'sell', qty: 1 }).status, 422);
  assert.equal(cmd('place_order', { echo: 'salt', side: 'buy', qty: 2 }).status, 200);
  assert.equal(cmd('place_order', { echo: 'salt', side: 'buy', qty: 9 }).status, 400, 'schema caps qty at 5');
  const o = obs();
  assert.equal(o.exchange.bar, 1);
  for (const e of o.exchange.echoes) assert.equal(e.history.length, 1, 'no future mid in the observation');
  assert.equal(JSON.stringify({ silk: o.iris.silk, tick: o.season.tick, root: o.season.merkleRoot }), before, 'season untouched');
  for (let i = 0; i < 4; i++) cmd('advance_exchange_bar');
  assert.equal(obs().exchange.phase, 'settled');
  assert.equal(cmd('cancel_order', {}).status, 501);
  const hist = api.history(sessionId, token).body.history;
  assert.ok(hist.some((h) => h.kind === 'exchange' && h.type === 'place_order'));
});
