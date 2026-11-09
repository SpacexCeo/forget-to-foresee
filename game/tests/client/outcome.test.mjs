// "See what changed" (readiness audit 09.11, P2 first guided stake): after a reveal the player sees the seal
// fact apart from the reading fact, their reading slot by slot, what the stake did and the word Iris learned;
// after a forget, what changed and who may buy the shard. Driven over the real judge season through the hub,
// the same room commands an agent sends. Presentation only: the season is never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalTransport } from '../../src/play/transport-local.js';
import { PlaySession } from '../../src/play/session.js';
import { ShellHub } from '../../src/play/hub.js';
import { currentGoal, hubGoal } from '../../src/play/objectives.js';
import { createPlayI18n, renderMsg } from '../../src/play/i18n.js';
import { createOutcomeTracker, stakeResult, slotVerdict, learnedFrom, truthSlots, forgetLines } from '../../src/play/outcome.js';
import { outcomeCard, forgetCard } from '../../src/play/outcome-ui.js';
import { outcomeLines, signsFromObs } from '../../src/ui/world-hud/from-obs.js';

const JUDGE = 'cc161d308faa67539af44205b56b6d4f';
const LOCALES = ['en', 'ru', 'uk', 'it', 'zh'];
const strict = (loc) => createPlayI18n(loc, { onMissing: (k) => { throw new Error(`${loc} missing ${k}`); } });
const T = (i18n, ref) => renderMsg(i18n, ref.key, typeof ref.args === 'function' ? ref.args() : ref.args);

/** The judge's first loop through the hub; `edit(hub)` may change the reading before the stake. */
async function firstLoop(edit = () => {}) {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  s.flags.hub = true; s.recompute();
  const tracker = createOutcomeTracker();
  const seen = [];
  s.on('obs', () => { const o = tracker.observe(s.obs); seen.push(...o.outcomes); });
  tracker.observe(s.obs);
  const hub = new ShellHub({ session: s, sleep: async () => {}, pauseMs: 0 });
  const goal = currentGoal(s.obs, s.flags);
  await hub.flyTo(Number(goal.target.slice(6)));
  edit(hub);
  const target = hub.target();
  assert.equal((await hub.stake()).ok, true);
  await hub.leave();
  let guard = 0;
  while (!s.obs.chronicle.length && guard++ < 8) { if (hub.card) await hub.resolve(hub.card.kind === 'offer' ? 'later' : 'give'); else await hub.advance({ max: 1 }); }
  return { s, hub, tracker, seen, target };
}

test('outcome: the judge path\'s first stake misses, and the feedback says why, what the stake did and what Iris learned', async () => {
  const { s, tracker, seen, target } = await firstLoop();
  assert.deepEqual(target, { shell: 1, tick: 3 }, 'the guided stake: Shell I, trial 3 (Iris\'s guess with the Delay pre-filled)');
  const c = s.obs.chronicle[0];
  assert.deepEqual(c.meaning, { place: 2, action: 'gift', power: 20, delay: 2 }, 'the sealed season is untouched: the Gift lands at Shell II');
  assert.equal(seen.length, 1);
  const r = seen[0];
  assert.equal(tracker.report(c.index), r);
  assert.equal(r.first, true);
  assert.equal(r.proof, 'ok', 'fact one: the event matched the commitment');
  assert.equal(r.reading.who, 'you');
  assert.deepEqual(r.reading.slots, [0, 0, 0, 1]);
  assert.deepEqual(r.verdict, [false, true, false, true], 'fact two: Place and Power misread, Action and Delay right');
  assert.deepEqual(r.stake, { result: 'returned', shell: 1, stake: 10 }, 'a stake on the wrong Shell comes back');
  assert.equal(r.learned.slot, 0, 'the word credited is in the misread slot');
  assert.equal(r.learned.meaning, 1, '… and now leans to Shell II');
  assert.ok(r.learned.to > r.learned.from);
  assert.equal(s.obs.iris.anchors.length, 0, 'the observation itself forgets the stake at the reveal (why the tracker keeps it)');

  const en = strict('en');
  const L = outcomeLines(c, r, en);
  assert.equal(T(en, L.sealed), 'Sealed before play ✓ — this event matches the season’s commitment');
  assert.equal(T(en, L.happened), 'What happened: Gift of 20 at Shell II, trial 3');
  assert.equal(T(en, L.reading), 'Your reading: Gift of 10 at Shell I, trial 3');
  assert.equal(T(en, L.slots), '2 of 4 right: Place ✗ · Action ✓ · Power ✗ · Delay ✓');
  assert.equal(T(en, L.stake), 'Stake returned: it landed at Shell II, not Shell I, so your 10 silk came back');
  assert.match(T(en, L.learned), /^Iris learned: \w+ in Place = Shell II \(from the outcome at Shell II, trial 3\) · 25% → \d+%$/);
  assert.match(T(en, L.tutorial), /^Tutorial · /, 'the miss is a labelled teaching moment');
  for (const loc of LOCALES) {
    const i18n = strict(loc);
    const card = outcomeCard(r, c, i18n);
    assert.deepEqual(card.lines.map((l) => l.id), ['sealed', 'reading', 'slots', 'stake', 'learned', 'tutorial'], loc);
    for (const l of [card.title, ...card.lines.map((x) => x.ref)]) assert.ok(T(i18n, l).length > 5 && !/\{|\}/.test(T(i18n, l)), `${loc}: ${T(i18n, l)}`);
  }
  s.dispose();
});

test('outcome: a reading changed to Shell II pays, and the revealed card remembers the stake', async () => {
  const { s, seen } = await firstLoop((hub) => { hub.cycleSlot(0, 1); hub.cycleSlot(2, 1); });
  const r = seen[0];
  assert.deepEqual(r.reading.slots.slice(0, 3), [1, 0, 1]);
  assert.deepEqual(r.verdict, [true, true, true, true], 'every slot right');
  assert.equal(r.stake.result, 'paid');
  assert.ok(r.stake.amount > 0, 'the share comes from the room log');
  assert.equal(r.first, true);
  const en = strict('en');
  const L = outcomeLines(s.obs.chronicle[0], r, en);
  assert.equal(T(en, L.stake), `Stake paid: +${r.stake.amount} silk from the Gift, and your 10 back`);
  assert.equal(L.tutorial, null, 'no teaching line when the reading was right');
  const map = new Map([[r.index, r]]);
  const card = signsFromObs(s.obs, { i18n: en, outcomes: map }).find((x) => x.id === 'sign-' + r.index);
  assert.equal(card.anchored, true, 'the stake pill stays lit after the observation dropped the anchor');
  assert.deepEqual(card.details.map((d) => d.id), ['sealed', 'reading', 'slots', 'stake', 'learned']);
  assert.equal(card.details.find((d) => d.id === 'stake').tone, 'ok');
  const bare = signsFromObs(s.obs, { i18n: en }).find((x) => x.id === card.id);
  assert.deepEqual(bare.details.map((d) => d.id), ['sealed'], 'without a report (page opened later) only the seal fact');
  s.dispose();
});

test('outcome: the first stake is framed as a test of Iris\'s guess, with her confidence', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  s.flags.hub = true; s.recompute();
  const hub = new ShellHub({ session: s, sleep: async () => {}, pauseMs: 0 });
  await hub.flyTo(Number(currentGoal(s.obs, s.flags).target.slice(6)));
  const g = hubGoal(s.obs, {});
  assert.equal(g.hintArgs.confidence, 25);
  const en = strict('en');
  assert.equal(renderMsg(en, g.key, g.args), 'Test Iris’s reading: stake 10 silk');
  assert.equal(renderMsg(en, g.hintKey, { ...g.args, ...g.hintArgs }), 'Iris is only 25% sure. Press F to test her on trial 3.');
  for (const loc of LOCALES) assert.ok(renderMsg(strict(loc), g.hintKey, { ...g.args, ...g.hintArgs }).includes('25'), loc);
  s.dispose();
});

test('outcome: stake rules, slot verdicts and the learned word (pure)', () => {
  const c = { tick: 5, index: 2, forms: [0, 1, 2, 3], meaning: { place: 3, action: 'storm', power: 40, delay: 2 } };
  assert.deepEqual(truthSlots(c.meaning), [2, 1, 2, 1]);
  assert.deepEqual(stakeResult(c, [{ shell: 3, tick: 5, stake: 10 }]), { result: 'burned', shell: 3, stake: 10 });
  assert.deepEqual(stakeResult(c, [{ shell: 1, tick: 5, stake: 10 }]), { result: 'returned', shell: 1, stake: 10 });
  assert.deepEqual(stakeResult({ ...c, meaning: { ...c.meaning, action: 'silence' } }, [{ shell: 3, tick: 5 }]), { result: 'calm', shell: 3, stake: 10, action: 'silence' });
  assert.deepEqual(stakeResult(c, [{ shell: 3, tick: 6 }]), { result: 'none' });
  assert.deepEqual(stakeResult(c, [], { staked: { tick: 7, shell: 3 } }), { result: 'other', tick: 7, shell: 3 });
  assert.deepEqual(slotVerdict({ slots: [2, 1, 0, 9], tick: 5 }, c), [true, true, false, true]);
  assert.equal(slotVerdict(null, c), null);
  const cell = (slot, form, meaning, confidence, known = null) => ({ slot, form, known, guess: { meaning, confidence } });
  const before = [cell(0, 1, 0, 0.25), cell(1, 2, 1, 0.4), cell(2, 3, 0, 0.25), cell(3, 0, 0, 0.6)];
  const after = [cell(0, 1, 2, 0.45), cell(1, 2, 1, 0.5), cell(2, 3, 2, 1, 2), cell(3, 0, 1, 0.5)];
  const l = learnedFrom(c, before, after, { verdict: [false, true, true, true] });
  assert.equal(l.slot, 0, 'the misread slot comes first');
  assert.deepEqual([l.from, l.to, l.was, l.more], [0.25, 0.45, null, 2], 'a 25 % tie rises; the Action cell rose and the Delay cell switched too');
  assert.equal(learnedFrom(c, before, after, { verdict: [true, true, true, true] }).slot, 3, 'then the biggest rise (a switched guess counts from zero)');
  const pinnedOnly = learnedFrom(c, [before[2]], [after[2]]);
  assert.equal(pinnedOnly, null, 'a word settled by someone else is not credited to the outcome');
  const switched = learnedFrom(c, [before[3]], [after[3]]);
  assert.deepEqual([switched.was, switched.from, switched.meaning], [0, null, 1], 'a switched guess says what it was');
});

test('outcome: a forget gets its consequence and the shard\'s likely buyer; the tracker resets with the session', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }), sleep: async () => {}, skipOnboarding: true });
  await s.start();
  const tracker = createOutcomeTracker();
  tracker.observe(s.obs);
  const m = s.obs.memories.find((x) => x.kind === 'call');
  assert.ok(m, 'the judge season starts with the Shells\' Call');
  let follow = null;
  s.on('obs', () => { const o = tracker.observe(s.obs); if (o.forgets.length) follow = o.forgets[0]; });
  assert.equal((await s.send('sacrifice_memory', { memoryId: m.id, purpose: 'vision' })).ok, true);
  assert.ok(follow, 'the forget is seen from the observation alone');
  assert.equal(follow.memory.kind, 'call');
  assert.equal(follow.purpose, 'vision');
  assert.ok(follow.visions >= 1);
  assert.ok(follow.auction && follow.auction.title === m.text);
  const en = strict('en');
  const card = forgetCard(follow);
  assert.equal(T(en, card.title), `Iris forgot “${m.text}”`);
  assert.equal(T(en, card.lines[0].ref), 'Now her thread to the Guests is gone; nothing else changes.');
  const shard = card.lines.find((l) => l.id === 'shard');
  if (follow.auction.buyer) assert.match(T(en, shard.ref), /^The shard goes to auction; if \w+ buys it, they read the Guests a little better\.$/);
  else assert.equal(T(en, shard.ref), 'The shard goes to auction; if nobody buys it, it burns.');
  for (const loc of LOCALES) for (const l of [card.title, ...card.lines.map((x) => x.ref)]) assert.ok(!/\{|\}/.test(T(strict(loc), l)), loc);
  // a new room (another season) starts the tracker over: no stale reading or stake leaks across sessions
  const other = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await other.start();
  assert.deepEqual(tracker.observe(other.obs), { outcomes: [], forgets: [] });
  assert.equal(tracker.reports().size, 0);
  s.dispose(); other.dispose();
});

test('outcome: the buyer line names what the buyer gains, per kind (pure)', () => {
  const en = strict('en');
  const f = (kind, about, buyer) => ({ memory: { kind, about, text: 'x', weight: 2 }, purpose: 'vision', visions: 2, auction: { buyer } });
  const shard = (x) => T(en, forgetLines(x).shard);
  assert.equal(shard(f('betrayal', 'salt', 'salt')), 'The shard goes to auction; if Salt buys it, the memory of their deceit is destroyed.');
  assert.equal(shard(f('betrayal', 'salt', 'moss')), 'The shard goes to auction; if Moss buys it, they learn how Salt deceived Iris and distrust Salt.');
  assert.equal(shard(f('debt', 'amber', 'frost')), 'The shard goes to auction; if Frost buys it, Amber owes them instead.');
  assert.equal(shard(f('promise', 'ash', 'moss')), 'The shard goes to auction; if Moss buys it, it changes nothing for them.');
  assert.equal(shard(f('first', null, 'salt')), 'The shard goes to auction; if Salt buys it, they learn your Key.');
  assert.equal(T(en, forgetLines(f('betrayal', 'salt', 'moss')).now), 'Now she trusts Salt again, and can be fooled again.');
  assert.equal(T(en, forgetLines({ ...f('first', null, null), purpose: 'key' }).gain), 'In return she heard Ash’s Key.');
  assert.equal(T(en, forgetLines(f('first', null, null)).shard), 'The shard goes to auction; if nobody buys it, it burns.');
});
