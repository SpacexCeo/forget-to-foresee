// The board season's score (TZ §8.2) and the snapshot tools (tools/leaderboard): hand-computed examples, caps, T0,
// the demo fee, scripted/human separation, golden fixtures with a fixed root, the verifier, the split-accounts property.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAccount, rankAccounts, BOARD } from '../../src/game/board-score.js';
import { makeEntry } from '../../src/game/expedition-log.js';
import { accountsFrom, buildSnapshot, verifySnapshot, verifyProof, leafHash, flagsFor } from '../../../tools/leaderboard/lib.mjs';

const DAY = 86_400_000, T0 = 20 * 365 * DAY; // a fixed UTC midnight
function logOf(events) { const log = []; for (const [t, kind, data, silkC = 0, trust = 'T2'] of events) log.push(makeEntry(log, { t, kind, data, silkC, trust })); return log; }
const turnIn = (t, questId, trust = 'T2') => [t, 'quest_turned_in', { questId }, 100_000, trust];
const kill = (t, silkC, trust = 'T1') => [t, 'kill_ticketed', { mob: 'skitter', killId: 'k' + t }, silkC, trust];
const bounty = (t) => [t, 'bounty_resolved', { questId: 'b_spiders' }, 30_000];

test('hand example: quests, T1 kills at a quarter, the portal; M from the classes', () => {
  const log = logOf([turnIn(T0 + 1, 'q_welcome'), turnIn(T0 + 2, 'q_spiders'), turnIn(T0 + 3, 'q_boss'), kill(T0 + 4, 40_000), kill(T0 + 5, 40_000),
    [T0 + 6, 'portal_paid', { feeC: 1_000_000, demo: false }, -1_000_000]]);
  const s = scoreAccount(log);
  // Q = 40 + 100 + 300 = 440; Sk = (400 + 400 silk) / 10 * 0.25 = 20; P = 200; classes quest+hunt → M 0.8
  assert.deepEqual(s.parts, { Q: 440, Sk: 20, Wl: 0, V: 0, P: 200, M: 0.8 });
  assert.equal(s.score, Math.round(0.8 * 660));
  assert.equal(s.quests, 3); assert.equal(s.killsT1, 2); assert.equal(s.reachedAt, T0 + 6);
});

test('hand example: all four classes (M 1.0), receipts capped at 50, wool capped at 1,000, T2 hunt at full value', () => {
  const log = logOf([turnIn(T0 + 1, 'q_welcome'), kill(T0 + 2, 50_000, 'T2')]);
  const s = scoreAccount(log, { extra: { receipts: ['a', 'b', 'c', 'd', 'e', 'f', 'a'], woolEarned: 5000, trades: 1 } });
  assert.deepEqual(s.parts, { Q: 40, Sk: 50, Wl: 1000, V: 50, P: 0, M: 1 });
  assert.equal(s.score, 1140);
  assert.deepEqual(s.classes, ['quest', 'hunt', 'trade', 'verify']);
});

test('caps: T1 kills at most 200 points per UTC day; bounties 30 for the first three a day, 3 after', () => {
  const big = logOf(Array.from({ length: 50 }, (_, i) => kill(T0 + i, 100_000)).concat([kill(T0 + DAY + 1, 100_000)]));
  assert.equal(scoreAccount(big).parts.Sk, 200 + 25); // day 1 capped at 200; day 2: 1000 silk / 10 * 0.25
  const b = logOf([bounty(T0 + 1), bounty(T0 + 2), bounty(T0 + 3), bounty(T0 + 4), bounty(T0 + 5), bounty(T0 + DAY + 1)]);
  assert.equal(scoreAccount(b).parts.Q, 30 * 3 + 3 * 2 + 30);
});

test('a quest counts once, a T1 turn-in (a part not from salvage) does not count, the demo fee never scores, the season window applies', () => {
  const log = logOf([turnIn(T0 + 1, 'q_welcome'), turnIn(T0 + 2, 'q_welcome'), turnIn(T0 + 3, 'q_part', 'T1'),
    [T0 + 4, 'portal_paid', { feeC: 1000, demo: true }, -1000], turnIn(T0 + 10 * DAY, 'q_boss')]);
  const s = scoreAccount(log, { window: { from: T0, to: T0 + DAY } });
  assert.deepEqual(s.parts, { Q: 40, Sk: 0, Wl: 0, V: 0, P: 0, M: 0.7 });
});

test('T0 never scores: an entry with any other trust level is ignored', () => {
  const log = logOf([turnIn(T0 + 1, 'q_welcome')]); log[0] = { ...log[0], trust: 'T0' };
  assert.equal(scoreAccount(log).score, 0);
});

// ---- golden fixtures: three humans, two scripted, one cheater
function fixtures() {
  const ann = { account: 'ann.guests.ftf-coordinator.testnet', log: logOf([turnIn(T0 + 10, 'q_welcome'), turnIn(T0 + 20, 'q_spiders'), turnIn(T0 + 30, 'q_boss'), kill(T0 + 40, 60_000), [T0 + 50, 'portal_paid', { feeC: 1_000_000, demo: false }, -1_000_000]]), extra: { receipts: ['r1'] } };
  const bo = { account: 'bo.guests.ftf-coordinator.testnet', log: logOf([turnIn(T0 + 11, 'q_welcome'), turnIn(T0 + 21, 'q_spiders'), bounty(T0 + 31), bounty(T0 + 41)]) };
  const cy = { account: 'cy.guests.ftf-coordinator.testnet', log: logOf([turnIn(T0 + 12, 'q_welcome'), kill(T0 + 22, 20_000)]) };
  const s1 = { account: 'salt.arena.testnet', log: logOf([turnIn(T0 + 13, 'q_welcome'), turnIn(T0 + 23, 'q_spiders'), turnIn(T0 + 33, 'q_boss'), kill(T0 + 43, 500_000, 'T2'), [T0 + 53, 'portal_paid', { feeC: 1_000_000, demo: false }, -1_000_000]]) };
  const s2 = { account: 'amber.arena.testnet', log: logOf([turnIn(T0 + 14, 'q_welcome')]) };
  const cheat = { account: 'mallory.guests.ftf-coordinator.testnet', log: logOf([turnIn(T0 + 15, 'q_welcome'), turnIn(T0 + 25, 'q_spiders')]) };
  cheat.log[1] = { ...cheat.log[1], data: { questId: 'q_boss' } }; // edited after the fact: the hash chain breaks
  return accountsFrom([ann, bo, cy, s1, s2, cheat], ['salt.arena.testnet', 'amber.arena.testnet']);
}

test('golden fixtures: fixed ranks, the cheater rejected, scripted accounts never in the human list, a fixed root', () => {
  const { accounts, rejected } = fixtures();
  assert.deepEqual(rejected.map((r) => [r.account, r.reason]), [['mallory.guests.ftf-coordinator.testnet', 'hash']]);
  const r = rankAccounts(accounts);
  assert.deepEqual(r.human.map((x) => [x.rank, x.account.split('.')[0], x.score]), [[1, 'ann', 599], [2, 'bo', 140], [3, 'cy', 36]]);
  assert.deepEqual(r.scripted.map((x) => [x.rank, x.account.split('.')[0], x.score]), [[1, 'salt', 912], [2, 'amber', 28]]);
  assert.equal(r.human.some((x) => x.actor === 'scripted' || /arena/.test(x.account)), false);
  const { snapshot, proofs } = buildSnapshot(accounts, { boardSeason: 1, epoch: 0, createdAt: T0 + DAY, rules: 'test-rules' });
  assert.equal(snapshot.root, GOLDEN_ROOT);
  snapshot.rows.forEach((row, i) => assert.equal(verifyProof(leafHash(1, 0, row), proofs[i].proof, snapshot.root), true));
});
const GOLDEN_ROOT = '4fe2e01c7d0c409bb78c1f63c73a1c6d35db451d21326f08059a797896db64ac';

test('verifier: the honest snapshot passes; an edited row, a wrong root or other rules fail', () => {
  const { accounts } = fixtures();
  const { snapshot } = buildSnapshot(accounts, { createdAt: T0 + DAY, rules: 'r' });
  assert.deepEqual(verifySnapshot(snapshot, accounts, { rules: 'r' }), { ok: true, problems: [] });
  const edited = structuredClone(snapshot); edited.rows[2].score += 100;
  assert.equal(verifySnapshot(edited, accounts, { rules: 'r' }).ok, false);
  const wrongRoot = { ...snapshot, root: '00'.repeat(32) };
  assert.match(verifySnapshot(wrongRoot, accounts, { rules: 'r' }).problems.join(), /root/);
  assert.match(verifySnapshot(snapshot, accounts, { rules: 'other' }).problems.join(), /rules/);
});

test('split accounts: splitting one account\'s events over two never raises the total beyond rounding and what the per-account caps cut', () => {
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let trial = 0; trial < 300; trial++) {
    const evs = [], quests = ['q_welcome', 'q_spiders', 'q_boss'].filter(() => rnd() < 0.5); // each quest at most once (the rules)
    for (const q of quests) evs.push(turnIn(0, q));
    const n = Math.floor(rnd() * 14);
    for (let i = 0; i < n; i++) { const k = rnd(); evs.push(k < 0.4 ? kill(0, 10_000 + Math.floor(rnd() * 400_000)) : k < 0.7 ? kill(0, 20_000, 'T2') : bounty(0)); }
    if (rnd() < 0.3) evs.push([0, 'portal_paid', { feeC: 1_000_000, demo: false }, -1_000_000]);
    evs.forEach((e, i) => { e[0] = T0 + i * 1000; });
    const whole = scoreAccount(logOf(evs));
    const a = [], b = []; for (const e of evs) (rnd() < 0.5 ? a : b).push(e);
    const split = scoreAccount(logOf(a)).score + scoreAccount(logOf(b)).score;
    const bounties = evs.filter((e) => e[1] === 'bounty_resolved').length;
    const t1 = evs.filter((e) => e[1] === 'kill_ticketed' && e[4] === 'T1').reduce((x, e) => x + e[3] / BOARD.silkPerPointC * BOARD.t1Factor, 0);
    const capCut = Math.max(0, bounties - BOARD.bountyFullPerDay) * (BOARD.bounty - BOARD.bountyAfter) + Math.max(0, t1 - BOARD.t1DayCap);
    assert.ok(split <= whole.score + 2 + capCut, `trial ${trial}: split ${split} > whole ${whole.score} + caps ${capCut}`);
    if (capCut === 0) assert.ok(split <= whole.score + 2, `trial ${trial}: no cap binds, yet split ${split} > ${whole.score}`);
  }
});

test('flags: a fixed-interval script and identical sequences are flagged; a human-paced log is not', () => {
  const bot = logOf(Array.from({ length: 12 }, (_, i) => kill(T0 + i * 5000, 10_000)));
  const twin = logOf(Array.from({ length: 12 }, (_, i) => kill(T0 + 7 + i * 5000 + (i % 3) * 900, 10_000)));
  const human = logOf([turnIn(T0 + 1000, 'q_welcome'), kill(T0 + 9000, 10_000), kill(T0 + 31000, 10_000), turnIn(T0 + 95000, 'q_spiders')]);
  const f = flagsFor([{ account: 'bot', log: bot }, { account: 'twin', log: twin }, { account: 'h', log: human }]);
  assert.ok(f.get('bot').includes('fixed_interval')); assert.ok(f.get('bot').includes('same_sequence')); assert.ok(f.get('twin').includes('same_sequence'));
  assert.deepEqual(f.get('h'), []);
});
