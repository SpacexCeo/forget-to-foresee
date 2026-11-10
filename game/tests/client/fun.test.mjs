// The fun layer's logic (play/fun.js, docs/fun-layer.md) over real local seasons and hand-made observations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { understanding, askFor, dictionaryCells, newWords, readingResult, createStreak, caseFile, newLies, forgottenMemory, memoryMotif, chapterOneDue, chapterSummary, CHAPTER_ONE_TRIALS, INSIGHT_PER_HIT } from '../../src/play/fun.js';
import { createLocalTransport } from '../../src/play/transport-local.js';
import { PlaySession } from '../../src/play/session.js';

const JUDGE_SEED = 'cc161d308faa67539af44205b56b6d4f';
async function season() {
  const session = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE_SEED }) });
  await session.start();
  return session;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const report = (who, verdict) => ({ reading: who ? { who } : null, verdict });

test('dictionary: 16 cells; a word counts as new only when it becomes certain', async () => {
  const s = await season();
  const cells = dictionaryCells(s.obs);
  assert.equal(cells.length, 16);
  assert.deepEqual(cells.map((c) => c.slot * 4 + c.form), [...Array(16).keys()]);
  assert.deepEqual(newWords(s.obs, s.obs), []);
  const next = clone(s.obs);
  const cell = next.dictionary.cells.find((c) => c.known == null);
  cell.known = 2; cell.source = 'the Guests';
  assert.deepEqual(newWords(s.obs, next), [{ slot: cell.slot, form: cell.form, meaning: 2, source: 'guests' }]);
  assert.deepEqual(newWords(null, next), [], 'the first observation teaches nothing');
});

test('dictionary: words appear over a real season as trials pass', async () => {
  const s = await season();
  let prev = s.obs, learned = 0;
  for (let i = 0; i < 9 && s.obs.season.phase === 'play'; i++) {
    await s.send('end_tick', {});
    learned += newWords(prev, s.obs).length;
    prev = s.obs;
  }
  const sureNow = dictionaryCells(s.obs).filter((c) => c.kind === 'guests' || c.kind === 'outcome').length;
  assert.ok(sureNow >= learned, 'every counted word is in the dictionary');
});

test('streak: only a staked reading counts; Shell and trial right is a hit; insight grows with the streak', () => {
  assert.equal(readingResult(report('iris', [true, true, true, true])), null, "Iris's own reading is not the player's");
  assert.equal(readingResult(report(null, null)), null);
  assert.equal(readingResult(report('you', [true, false, false, true])), 'hit');
  assert.equal(readingResult(report('you', [true, true, true, false])), 'miss');
  const k = createStreak();
  assert.deepEqual(k.observe(report('you', [true, true, true, true])), { result: 'hit', streak: 1, gained: INSIGHT_PER_HIT, ended: 0 });
  assert.equal(k.observe(report('iris', [false, false, false, false])), null, 'no stake: the streak stands');
  assert.deepEqual(k.observe(report('you', [true, false, true, true])), { result: 'hit', streak: 2, gained: 2 * INSIGHT_PER_HIT, ended: 0 });
  assert.deepEqual(k.observe(report('you', [false, true, true, true])), { result: 'miss', streak: 0, gained: 0, ended: 2 });
  assert.deepEqual(k.state, { streak: 0, best: 2, insight: 3 * INSIGHT_PER_HIT, hits: 2, misses: 1 });
});

test('case file: a bought word is open, then true or a lie; a new lie is reported once', async () => {
  const s = await season();
  assert.deepEqual(caseFile(s.obs), []);
  const a = clone(s.obs);
  a.dictionary.boughtWords = [{ slot: 1, form: 2, meaning: 0, from: 'salt', exposedAsLie: false }];
  a.dictionary.cells.find((c) => c.slot === 1 && c.form === 2).known = null;
  assert.equal(caseFile(a)[0].status, 'open');
  const t = clone(a); t.dictionary.cells.find((c) => c.slot === 1 && c.form === 2).known = 0;
  assert.equal(caseFile(t)[0].status, 'true');
  const l = clone(a); l.dictionary.boughtWords[0].exposedAsLie = true;
  assert.equal(caseFile(l)[0].status, 'lie');
  const c = clone(a); c.dictionary.cells.find((x) => x.slot === 1 && x.form === 2).known = 3;
  assert.deepEqual(caseFile(c)[0], { from: 'salt', slot: 1, form: 2, meaning: 0, status: 'lie', truth: 3 });
  assert.equal(newLies(a, l).length, 1);
  assert.equal(newLies(l, l).length, 0);
  assert.equal(newLies(null, l).length, 0);
});

test('forgotten memory: the one that left when the forgotten count rose', async () => {
  const s = await season();
  assert.equal(forgottenMemory(s.obs, s.obs), null);
  const m = s.obs.memories[0];
  const next = clone(s.obs);
  next.memories = next.memories.filter((x) => x.id !== m.id);
  assert.equal(forgottenMemory(s.obs, next), null, 'a memory can leave without a burn (the count did not rise)');
  next.iris.forgotten = [...(next.iris.forgotten || []), { id: m.id }];
  assert.equal(forgottenMemory(s.obs, next).id, m.id);
  for (const kind of ['first', 'call', 'gift', 'betrayal', 'debt', 'promise', 'whatever']) assert.ok(memoryMotif(kind));
  assert.notEqual(memoryMotif('first'), memoryMotif('gift'));
});

test('chapter one: once, for a first-time player, when trial 8 begins; the summary reads the observation', async () => {
  const base = { phase: 'play', firstRun: true, shown: false };
  assert.equal(chapterOneDue({ ...base, tick: CHAPTER_ONE_TRIALS }), false);
  assert.equal(chapterOneDue({ ...base, tick: CHAPTER_ONE_TRIALS + 1 }), true);
  assert.equal(chapterOneDue({ ...base, tick: 9, shown: true }), false);
  assert.equal(chapterOneDue({ ...base, tick: 9, firstRun: false }), false);
  assert.equal(chapterOneDue({ ...base, tick: 9, phase: 'ended' }), false);
  const s = await season();
  for (let i = 0; i < CHAPTER_ONE_TRIALS; i++) await s.send('end_tick', {});
  assert.equal(s.obs.season.tick, CHAPTER_ONE_TRIALS + 1);
  const sum = chapterSummary(s.obs, { best: 2, insight: 30 });
  assert.equal(sum.left, 17 - CHAPTER_ONE_TRIALS);
  assert.equal(sum.silk, s.obs.iris.silk);
  assert.equal(sum.streak, 2);
  assert.ok(sum.words >= 0 && sum.words <= 16);
});

test('understanding: 0 on a blind dictionary, rises with revealed signs, a certain word counts in full', async () => {
  const s = await season();
  assert.equal(understanding(s.obs), 0);
  for (let i = 0; i < 6; i++) await s.send('end_tick', {});
  const mid = understanding(s.obs);
  assert.ok(mid > 0 && mid < 60, 'revealed signs move it: ' + mid);
  const next = clone(s.obs);
  for (const c of next.dictionary.cells) { c.known = c.guess.meaning; c.source = 'the Guests'; }
  assert.equal(understanding(next), 100);
});

test('askFor: the best guess first, never a ruled-out or taken meaning, nothing for a certain word', async () => {
  const s = await season();
  for (let i = 0; i < 4; i++) await s.send('end_tick', {});
  const cells = dictionaryCells(s.obs);
  const q = askFor(cells[0]);
  assert.equal(q.slot, 0); assert.equal(q.form, 0);
  assert.equal(q.options.length, 4);
  assert.equal(new Set(q.options).size, 4);
  assert.deepEqual(askFor({ slot: 1, form: 2, kind: 'guess', meaning: 3, excluded: [3, 0], taken: [1] }), { slot: 1, form: 2, meaning: 2, options: [2] });
  assert.equal(askFor({ slot: 1, form: 2, kind: 'guests', meaning: 3, excluded: [], taken: [] }), null);
  assert.equal(askFor(null), null);
});

test('asking the Guests through the room pins or rules out a word, and a pinned word is a new word', async () => {
  const s = await season();
  // the Guests answer inside a Shell (the room's precondition); the hub flies there the same way
  assert.equal((await s.send('ask_guests', { slot: 1, form: 1, meaning: 0 })).reason, 'wrong_zone');
  assert.ok((await s.bus.send('move', { to: 'anchor_zone:1' })).ok);
  assert.ok((await s.send('enter_shell', { shell: 1 })).ok);
  assert.equal((await s.send('ask_guests', { slot: 1, form: 1, meaning: 0 })).reason, 'not_near', 'and at the glass');
  assert.ok((await s.bus.send('move', { to: 'guest_glass' })).ok);
  const q = askFor(dictionaryCells(s.obs)[5]);
  let pinned = false;
  for (const m of q.options) {
    const prev = s.obs;
    const r = await s.send('ask_guests', { slot: q.slot, form: q.form, meaning: m });
    assert.ok(r.ok, JSON.stringify(r).slice(0, 200));
    if (newWords(prev, s.obs).length) { pinned = true; break; }
    if (s.obs.iris.attention < 1) break;
  }
  const cell = dictionaryCells(s.obs)[5];
  assert.ok(pinned || cell.excluded.length > 0, 'every answer leaves a mark in the dictionary');
});
