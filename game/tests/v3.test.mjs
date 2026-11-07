/* Rules v3 (docs/rules-baseline.md §14): each approved proposal is pinned by a test, and each of the
 * six findings of docs/math/economy-report.md is replayed to show it is now rejected or neutralised.
 * baseline-2d-1 and v2 behaviour is covered by parity.test.mjs and v2.test.mjs and must not move. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/game/engine.js';
import { sha256 } from '../src/game/crypto.js';
import { applyToEngine } from './lib/engine-apply.mjs';
import { runSeason } from '../scripts/sim/lib/season.mjs';
import { STRATEGIES } from '../scripts/sim/lib/strategies.mjs';
import { makeRandomBytes } from '../scripts/sim/lib/rng.mjs';

const fresh = (seed, rules = 'v3') => E.newSeason(seed, { rules, randomBytes: makeRandomBytes(seed) });
const play = (it) => { const r = applyToEngine(it); assert.ok(r.ok, `${JSON.stringify(it)} rejected: ${r.reason}`); return r; };
const endTo = (tick) => { while (E.S.phase === 'play' && E.S.tick < tick) play({ type: 'end' }); };
const prev = (p) => JSON.parse(JSON.stringify(p));

/* ---------- P5: seed and RNG ---------- */
test('v3 P5: 128-bit CSPRNG seed, hash-based game RNG, numeric seed ignored, reproducible from the byte source', () => {
  const a = fresh(1), rootA = a.root, seedA = a.seed;
  assert.match(seedA, /^[0-9a-f]{32}$/);
  assert.equal('rs' in a, false);
  assert.deepEqual(Object.keys(a.rng).sort(), ['block', 'ctr', 'i']);
  assert.equal(fresh(1).root, rootA, 'same bytes -> same season');
  assert.equal(E.newSeason(999, { rules: 'v3', randomBytes: makeRandomBytes(1) }).seed, seedA, 'the numeric seed plays no role');
  assert.notEqual(fresh(2).root, rootA);
  const h = E.newSeason(0, { rules: 'v3', seedHex: 'a'.repeat(32), randomBytes: makeRandomBytes(5) });
  assert.equal(h.seed, 'a'.repeat(32));
  assert.throws(() => E.newSeason(0, { rules: 'v3', seedHex: 'xyz' }));
  assert.equal(h.seedCommit, sha256(`ftf:seed:v2|${h.seasonId}|${h.seed}|${h.seedSalt}`), 'commitment schema stays v2, the committed seed is the 128-bit one');
});

test('v3 P5: a snapshot replays the RNG exactly', () => {
  fresh(3); E.startGame('x'); endTo(6);
  const snap = prev(E.S);
  endTo(10); const a = JSON.stringify([E.S.silk, E.S.H, E.S.anchors]);
  E.loadState(prev(snap)); endTo(10);
  assert.equal(JSON.stringify([E.S.silk, E.S.H, E.S.anchors]), a);
});

test('v3 P5: the client projection carries no secrets (any rules)', () => {
  for (const rules of ['v3', 'v2']) {
    fresh(7, rules); E.startGame('my key'); endTo(5);
    const p = E.clientProjection();
    for (const k of ['seed', 'rs', 'rng', 'seedSalt', 'truthGift', 'keyHolder', 'aiSeen']) assert.equal(k in p, false, k);
    assert.deepEqual(p.V.slice(1), [null, null, null, null, null]);
    assert.deepEqual(p.tV.slice(1), [null, null, null, null, null]);
    assert.deepEqual(Object.keys(p.pepelKey), ['hash']);
    p.events.forEach((e, i) => {
      const src = E.S.events[i];
      if (src.t < E.S.tick) { assert.equal(e.place, src.place); return; }
      assert.equal('place' in e, false, `event ${i} meaning leaked`); assert.equal('salt' in e, false); assert.equal('t' in e, false);
      if (src.pub <= E.S.tick) { assert.deepEqual(e.forms, src.forms); } else assert.deepEqual(Object.keys(e), ['leaf']);
    });
    p.frag.forEach((f, i) => { if (i !== 0 && f.st === 'held') { assert.equal('m' in f, false); assert.equal('forms' in f, false); assert.equal('key' in f, false); } });
    p.offers.forEach((o) => assert.equal('honest' in o, false));
    p.shards.forEach((sh) => assert.equal('vals' in sh, false));
    assert.equal(p.pKey.phrase, 'my key', 'the player keeps their own phrase');
    assert.equal(JSON.stringify(p).includes(E.S.pepelKey.phrase), false);
  }
});

/* ---------- P1: prizes and finale ---------- */
test('v3 P1: prizes are scaled by 2/3, promised at tV, paid only when the message succeeds', () => {
  fresh(11);
  assert.deepEqual(E.S.V.map((v) => v % 1), [0, 0, 0, 0, 0, 0]);
  assert.equal(E.S.V[4], 53);
  assert.ok(E.S.V[0] >= 20 && E.S.V[0] <= 40);
  E.startGame('');
  endTo(E.S.tV[0] + 1);
  assert.equal(E.S.frag[0].st, 'dark');
  assert.equal(E.S.frag[0].prize, E.S.V[0]);
  const base = 60 + 3 * E.S.tick; // income is paid at the start of every tick, including tick 1
  assert.equal(E.S.silk[0], base, 'nothing paid at tV');
  endTo(17);
  E.S.truthGift = true; E.S.mast = E.S.mast.map(() => .95); E.S.rumor = false; // make the AI vote "gift" almost surely
  for (const f of E.S.frag) if (f.owner !== 0 && f.st === 'held') f.st = 'scroll';
  if (E.S.frag[E.S.keyHolder].st !== 'scroll') E.S.frag[E.S.keyHolder].st = 'scroll';
  E.S.anchors = []; // the tick-17 reveal inside the vote must not move silk here
  const before = E.S.silk.slice();
  play({ type: 'vote', v: true });
  assert.equal(E.S.outcome, 'gift');
  assert.equal(E.S.silk[0], before[0] + E.S.V[0], 'deferred prize paid on success');
  assert.equal(E.S.frag[0].prizePaid, true);
  const contributor = E.S.frag.find((f) => f.st === 'scroll' && f.owner !== 0).owner;
  assert.equal(E.S.silk[contributor], before[contributor] + 60, 'gift bonus is 60 in v3');
});

test('v3 P1: no prize when the message is lost; v2 still pays at tV', () => {
  fresh(12); E.startGame(''); endTo(17);
  E.S.truthGift = true;
  for (const f of E.S.frag) if (f.owner !== 0) { f.st = 'dark'; f.prize = 30; }
  E.S.frag[0].st = 'dark'; E.S.frag[0].prize = 40;
  E.S.mast = E.S.mast.map(() => 0); E.S.frag[E.S.keyHolder].st = 'scroll'; // key in: AI vote correct with p=.35 only; force reject via votes
  const before = E.S.silk.slice();
  play({ type: 'vote', v: false });
  if (E.S.outcome === 'lost') { assert.deepEqual(E.S.silk, before); assert.equal(E.S.frag[0].prizePaid, undefined); }
  else assert.equal(E.S.outcome, 'gift');
  E.newSeason(12, { rules: 'v2', randomBytes: makeRandomBytes(12) }); E.startGame(''); const V = E.S.V[0]; endTo(E.S.tV[0] + 1);
  assert.equal(E.S.silk[0], 60 + 3 * E.S.tick + V, 'v2 unchanged: prize at tV');
});

test('v3 P1 (finding 1): over 300 seeds, contributing beats holding for an honest Iris; it did not in v2', () => {
  const diff = (rules) => { let d = 0; for (let s = 1; s <= 300; s++) d += runSeason(s, STRATEGIES['hold-honest-none'], { rules }).final.silk[0] - runSeason(s, STRATEGIES['coop-honest-none'], { rules }).final.silk[0]; return d / 300; };
  const v2 = diff('v2'), v3 = diff('v3');
  assert.ok(v2 > 5, `v2 hold - coop = ${v2}`);
  assert.ok(v3 < -5, `v3 hold - coop = ${v3}`);
});

/* ---------- P3: exact Gift split ---------- */
test('v3 P3 (finding 2): shares always sum to the pot; the pot 40 / weights 3,3,3 case pays 40', () => {
  assert.deepEqual(E.apportion(40, [3, 3, 3]), [14, 13, 13]);
  assert.deepEqual(E.apportion(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(E.apportion(20, [1, 1, 1]), [7, 7, 6]);
  assert.deepEqual(E.apportion(80, [5, 1, 1, 1]), [50, 10, 10, 10]);
  for (const pot of [10, 20, 40, 80]) for (let k = 1; k <= 5; k++) for (let w = 1; w <= 9; w++) {
    const ws = Array.from({ length: k }, (_, i) => 1 + ((w * (i + 1)) % 9));
    const sh = E.apportion(pot, ws);
    assert.equal(sh.reduce((a, b) => a + b, 0), pot);
    assert.ok(sh.every((x, i) => Math.abs(x - pot * ws[i] / ws.reduce((a, b) => a + b, 0)) < 1));
  }
  let drift = 0, events = 0;
  for (let s = 1; s <= 100; s++) { const r = runSeason(s, STRATEGIES['coop-honest-anchor'], { rules: 'v3' }); drift += r.pool.drift; events += r.pool.claimedEvents; }
  assert.ok(events > 500);
  assert.equal(drift, 0, 'measured drift over all claimed Gift events');
});

/* ---------- P4: proof binding ---------- */
test('v3 P4 (finding 3): an edited event field or a tampered root voids the season before any payout', () => {
  fresh(21); E.startGame('');
  const e = E.S.events[0]; e.place = (e.place + 1) % 4;
  play({ type: 'anchor', p: e.place, t: 3 });
  endTo(3); const silk = E.S.silk[0];
  play({ type: 'end' });
  assert.equal(E.S.outcome, 'proof_failed');
  assert.equal(E.S.tick, 3, 'the tick does not advance after a void');
  assert.equal(E.S.phase, 'end');
  assert.equal(E.S.silk[0], silk, 'no payout on the tampered Shell');
  fresh(21); E.startGame(''); E.S.root = sha256('tampered'); endTo(4);
  assert.equal(E.S.outcome, 'proof_failed');
  fresh(21); E.startGame(''); endTo(17);
  assert.equal(E.S.phase, 'vote');
  E.S.events[14].power = (E.S.events[14].power + 1) % 4;
  play({ type: 'vote', v: true });
  assert.equal(E.S.outcome, 'proof_failed', 'the tick-17 reveal inside the vote is bound too');
  assert.equal(E.S.votes, null);
  E.newSeason(21, { rules: 'v2', randomBytes: makeRandomBytes(21) }); E.startGame(''); E.S.events[0].place = (E.S.events[0].place + 1) % 4; endTo(4);
  assert.equal(E.S.phase, 'play', 'v2 unchanged: it only logs');
});

/* ---------- P6: auctions ---------- */
test('v3 P6 (finding 5): an unfunded top bid falls back to the next funded bid; v2 burns the shard', () => {
  for (const rules of ['v3', 'v2']) {
    fresh(31, rules); E.startGame('');
    E.S.shards.push({ id: 900, from: 5, kind: 'insight', s: 0, f: 0, title: 't', exp: E.S.tick + 1, bids: [{ c: 4, amt: 7 }, { c: 1, amt: 12 }, { c: 3, amt: 9 }], vals: {} });
    E.S.silk[1] = 5; E.S.silk[3] = 50; E.S.silk[4] = 50;
    for (const e of E.S.events) for (let i = 1; i < 6; i++) E.S.aiSeen[i + '_' + e.t] = 1; // no AI anchors this tick, so silk moves only through the auction
    const moss = E.S.silk[3], frost = E.S.silk[5];
    play({ type: 'end' });
    const sh = E.S.shards.find((x) => x.id === 900);
    if (rules === 'v3') { assert.equal(sh.winner, 3); assert.equal(E.S.silk[3], moss + 3 - 9); assert.equal(E.S.silk[5], frost + 3 + 9); }
    else { assert.equal(sh.winner, undefined); assert.equal(E.S.silk[5], frost + 3); }
  }
});

test('v3 P6: the griefing trace (bid, then spend below it) no longer burns Frost\'s shard', () => {
  fresh(1); E.startGame(''); endTo(7);
  const sh = E.S.shards.find((x) => x.from === 5 && !x.done); assert.ok(sh, 'Frost shard at tick 7');
  const loan = E.S.offers.find((o) => o.kind === 'loan'); if (loan) play({ type: 'accept', id: loan.id });
  play({ type: 'bid', id: sh.id });
  while (E.topBid(sh).c !== 0 && E.S.silk[0] >= E.topBid(sh).amt + 3) play({ type: 'bid', id: sh.id });
  const my = sh.bids.find((b) => b.c === 0).amt;
  let k = 0;
  for (let t = 7; t <= 8; t++) { while (E.S.ap > 0 && E.S.silk[0] >= 10) { play({ type: 'anchor', p: k % 4, t: 17 - Math.floor(k / 4) }); k++; } if (t === 7) play({ type: 'end' }); }
  play({ type: 'end' });
  assert.ok(E.S.silk[0] < my || sh.winner === 0, 'Iris is below her bid at close');
  assert.ok(sh.done && sh.winner != null && sh.winner !== 0, `sold to a funded AI bidder, got ${sh.result}`);
});

/* ---------- P7: debts ---------- */
test('v3 P7 (finding 6): a debt due within two ticks cannot be forgotten; overdue claims settle', () => {
  fresh(41); E.startGame(''); endTo(3);
  const loan = E.S.offers.find((o) => o.kind === 'loan'); assert.ok(loan);
  play({ type: 'accept', id: loan.id });
  const debt = E.S.mem.find((m) => m.kind === 'debt'); assert.equal(debt.data.due, 7);
  endTo(6);
  const before = JSON.stringify([E.S.mem.length, E.S.ap, E.S.shards.length]);
  assert.deepEqual(E.forget(debt.id, 'vision'), { ok: false, reason: 'debt_due' });
  assert.equal(JSON.stringify([E.S.mem.length, E.S.ap, E.S.shards.length]), before, 'rejected without side effects');
  fresh(41); E.startGame(''); endTo(3); play({ type: 'accept', id: E.S.offers.find((o) => o.kind === 'loan').id }); endTo(5);
  assert.ok(E.forget(E.S.mem.find((m) => m.kind === 'debt').id, 'vision').ok, 'two ticks before due is allowed: the auction closes on the due tick');
  fresh(42); E.startGame(''); endTo(5);
  E.S.claims.push({ holder: 1, debtor: 3, amount: 25, due: 4 });
  E.S.silk[3] = 100; const salt = E.S.silk[1];
  let settled = false; for (let k = 0; k < 20 && !settled; k++) { play({ type: 'end' }); settled = !E.S.claims.some((c) => c.due === 4); }
  assert.ok(settled, 'an overdue claim is settled or dropped at the next tick, never kept forever');
  assert.ok(E.S.silk[1] === salt + 3 || E.S.silk[1] === salt + 3 + 25);
  E.newSeason(42, { rules: 'v2', randomBytes: makeRandomBytes(42) }); E.startGame(''); endTo(5); E.S.claims.push({ holder: 1, debtor: 3, amount: 25, due: 4 }); endTo(12);
  assert.ok(E.S.claims.some((c) => c.due === 4), 'v2 unchanged: the dead claim lingers');
});

/* ---------- P9: ties ---------- */
test('v3 P9: a 3:3 vote follows Iris; v2 keeps "tie = reject"', () => {
  fresh(51); assert.equal(E.tally([true, true, true, false, false, false]), true);
  assert.equal(E.tally([false, true, true, true, false, false]), false);
  assert.equal(E.tally([false, true, true, true, true, false]), true);
  assert.equal(E.tally([true, true, false, false, false, false]), false);
  E.newSeason(51, { rules: 'v2', randomBytes: makeRandomBytes(51) });
  assert.equal(E.tally([true, true, true, false, false, false]), false);
  let seen = 0;
  for (let s = 1; s <= 300 && seen < 5; s++) {
    const r = runSeason(s, STRATEGIES['coop-honest-none'], { rules: 'v3', trace: true });
    if (r.final.votes !== 3) continue;
    seen++;
    const iris = r.trace.find((x) => x.type === 'vote').v, accepted = r.final.outcome === 'gift' || r.final.outcome === 'weapon';
    assert.equal(accepted, iris, `seed ${s}: a 3:3 vote follows Iris (${iris})`);
  }
  assert.ok(seen >= 1, 'at least one 3:3 vote observed');
});

/* ---------- P2: learning is not a sink ---------- */
test('v3 P2: a "no" from the Guests refunds the question, a "yes" costs 5; v2 charges both', () => {
  for (const rules of ['v3', 'v2']) {
    fresh(61, rules); E.startGame('');
    const s = 0, f = 0, truth = E.S.perm[s][f], wrong = (truth + 1) % 4;
    const silk = E.S.silk[0], ap = E.S.ap;
    assert.ok(E.askGuests(s, f, wrong).ok);
    assert.equal(E.S.ap, ap - 1);
    assert.equal(E.S.silk[0], rules === 'v3' ? silk : silk - 5, rules + ': "no"');
    assert.ok(E.askGuests(s, f, truth).ok);
    assert.equal(E.S.silk[0], rules === 'v3' ? silk - 5 : silk - 10, rules + ': "yes"');
    assert.equal(E.S.pins[s + '_' + f].m, truth);
  }
});

test('v3 P2: mediation costs 10 and is a transfer (world silk conserved); v2 burns 15', () => {
  for (const rules of ['v3', 'v2']) {
    fresh(62, rules); E.startGame('');
    E.S.broken.push('1-3'); E.S.T[1][0] = 60; E.S.T[3][0] = 60; E.S.ap = 3; E.S.silk[0] = 40;
    const world = E.S.silk.reduce((a, b) => a + b, 0), iris = E.S.silk[0], salt = E.S.silk[1], moss = E.S.silk[3];
    assert.ok(E.mediate(1, 3).ok);
    if (rules === 'v3') { assert.equal(E.S.silk[0], iris - 10); assert.equal(E.S.silk[1], salt + 5); assert.equal(E.S.silk[3], moss + 5); assert.equal(E.S.silk.reduce((a, b) => a + b, 0), world, 'nothing burned'); }
    else { assert.equal(E.S.silk[0], iris - 15); assert.equal(E.S.silk.reduce((a, b) => a + b, 0), world - 15); }
    assert.equal(E.isBroken(1, 3), false);
  }
  fresh(62); E.startGame(''); E.S.broken.push('1-3'); E.S.T[1][0] = 60; E.S.T[3][0] = 60; E.S.silk[0] = 9;
  assert.deepEqual(E.mediate(1, 3), { ok: false, reason: 'no_silk' });
});

test("v3 P2: Frost's word costs 8 (v2: 12); Salt's and Amber's prices are unchanged", () => {
  const prices = (rules) => { const out = {}; for (let seed = 1; seed <= 40; seed++) { fresh(seed, rules); E.startGame(''); for (let guard = 0; guard < 16 && E.S.phase === 'play'; guard++) { for (const o of E.S.offers) if (o.kind === 'sell') out[o.from] = o.price; play({ type: 'end' }); } } return out; };
  assert.deepEqual(prices('v3'), { 1: 7, 4: 10, 5: 8 });
  assert.deepEqual(prices('v2'), { 1: 7, 4: 10, 5: 12 });
});

/* ---------- P8: the Shells leaving costs silk ---------- */
test('v3 P8: outcome gone leaves every clan with round(silk · goneKeep) = 0; v2 keeps everything', () => {
  assert.equal(E.V3.goneKeep, 0);
  for (const rules of ['v3', 'v2']) {
    fresh(71, rules); E.startGame(''); endTo(5);
    const before = E.S.silk.slice();
    E.S.H = 99; E.S.rule = 'top'; E.setRule('dots'); // a settle after a free action, as the 2D click handler did
    assert.equal(E.S.outcome, null);
    E.S.H = 100; E.setRule('top');
    assert.equal(E.S.outcome, 'gone');
    if (rules === 'v3') { assert.deepEqual(E.S.silk, [0, 0, 0, 0, 0, 0]); assert.deepEqual(E.S.goneLoss, before); }
    else { assert.deepEqual(E.S.silk, before); assert.equal(E.S.goneLoss, undefined); }
  }
  fresh(72); E.startGame(''); endTo(4); E.S.H = 98; // +15 at the crisis would do it too; here the tick change pushes it over
  E.S.H = 100; play({ type: 'end' });
  assert.equal(E.S.outcome, 'gone');
  assert.deepEqual(E.S.silk, [0, 0, 0, 0, 0, 0], 'gone reached inside endTick');
});

test('v3 P2+P8 (dominance, 300 seeds): late/hold defectors no longer beat an honest cooperator; passive is beaten too', () => {
  const mean = (name, rules) => { let t = 0; for (let s = 1; s <= 300; s++) t += runSeason(s, STRATEGIES[name], { rules }).final.silk[0]; return t / 300; };
  const honest3 = mean('coop-honest-none', 'v3'), passive3 = mean('passive', 'v3');
  assert.ok(honest3 > passive3, `v3 honest ${honest3} vs passive ${passive3}`);
  for (const d of ['late-defect-none', 'hold-defect-none', 'late-defect-anchor', 'hold-defect-anchor']) { const m = mean(d, 'v3'); assert.ok(m < honest3, `v3 ${d} ${m} vs honest ${honest3}`); }
  const honest2 = mean('coop-honest-none', 'v2');
  assert.ok(mean('late-defect-none', 'v2') > honest2 && mean('passive', 'v2') > honest2, 'v2 unchanged: defecting and passivity still pay');
});

/* ---------- harness under v3 ---------- */
test('v3: every scripted strategy plays 25 seeds with no rejected intent and a balanced ledger', () => {
  for (const s of Object.values(STRATEGIES)) for (let seed = 1; seed <= 25; seed++) {
    const r = runSeason(seed, s, { rules: 'v3' });
    assert.deepEqual(r.rejected, [], `${s.name} seed ${seed}`);
    assert.equal(r.in.other, 0, `${s.name} seed ${seed}`);
    assert.notEqual(r.final.outcome, 'proof_failed');
  }
});