// Learning affordances of the Shell hub: the glossary on the glass and "Iris thinks this because…"
// (src/play/reasons.js), the Read → Choose → See guide (src/play/guide.js), and quiet Shells that never
// borrow another Shell's sign (src/play/hub.js signForShell). Interface only: public observation data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalTransport } from '../../src/play/transport-local.js';
import { PlaySession } from '../../src/play/session.js';
import { ShellHub, signsByShell, signForShell, waitingShells } from '../../src/play/hub.js';
import { meaningIndex, sightings, cellState, glossary, knownCount, slotReason, formForSlot, signCells } from '../../src/play/reasons.js';
import { guideStep, choseThisVisit, GUIDE_STEPS } from '../../src/play/guide.js';
import { createPlayI18n, renderMsg } from '../../src/play/i18n.js';

const JUDGE = 'cc161d308faa67539af44205b56b6d4f';
const noPause = async () => {};

async function setup(seedHex = JUDGE) {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex }) });
  await s.start();
  s.flags.hub = true; s.recompute();
  return { s, hub: new ShellHub({ session: s, sleep: noPause, pauseMs: 0 }) };
}

/** A synthetic observation: every cell an evidence-free guess unless overridden. */
function fakeObs({ cells = {}, chronicle = [], rule = 'unknown', bought = [] } = {}) {
  const list = [];
  for (let s = 0; s < 4; s++) for (let f = 0; f < 4; f++) {
    list.push({ slot: s, form: f, known: null, source: null, excluded: [], guess: { meaning: 0, confidence: 0.25 }, ...(cells[s + '_' + f] || {}) });
  }
  return { dictionary: { readingRule: rule, confidentCells: 0, cells: list, boughtWords: bought }, chronicle };
}

const chron = (forms, dots, meaning) => ({ tick: 3, index: 0, forms, dots, meaning, irisReadSlots: [] });

test('reasons: a chronicle meaning maps back to slot indices', () => {
  assert.deepEqual(meaningIndex({ place: 2, action: 'storm', power: 40, delay: 1 }), [1, 1, 2, 0]);
  assert.equal(meaningIndex({ place: 9, action: 'storm', power: 40, delay: 1 }), null);
  assert.equal(meaningIndex(null), null);
});

test('reasons: sightings follow the reading rule (top: exact slot; unknown: any rotation)', () => {
  const c = [chron([1, 0, 2, 3], 0, { place: 1, action: 'storm', power: 10, delay: 1 })];
  // rule top: the Action slot reads forms[1] = 0 (arc), so a spike (1) is not in the Action slot
  assert.deepEqual(sightings(fakeObs({ chronicle: c, rule: 'top' }), 1, 1), { counts: [0, 0, 0, 0], total: 0 });
  assert.deepEqual(sightings(fakeObs({ chronicle: c, rule: 'top' }), 1, 0), { counts: [0, 1, 0, 0], total: 1 });
  // rule unknown: any rotation may put the spike in the Action slot
  assert.deepEqual(sightings(fakeObs({ chronicle: c }), 1, 1), { counts: [0, 1, 0, 0], total: 1 });
  // rule dots: rotation = dots
  const d = [chron([1, 0, 2, 3], 1, { place: 1, action: 'call', power: 10, delay: 1 })];
  assert.equal(sightings(fakeObs({ chronicle: d, rule: 'dots' }), 1, 2).counts[3], 1, 'dots 1: Action reads forms[2]');
});

test('reasons: cell kinds: silver = the Guests, gold = a true word, plain = a guess, empty = no evidence', () => {
  const obs = fakeObs({
    cells: {
      '0_0': { known: 2, source: 'the Guests', excluded: [0] },
      '0_1': { known: 1, source: 'the Guests', excluded: [0, 2, 3] },
      '1_0': { known: 3, source: 'Frost' },
      '1_1': { known: 0, source: 'a shard' },
      '2_2': { excluded: [1], guess: { meaning: 3, confidence: 0.33 } },
    },
  });
  assert.equal(cellState(obs, 0, 0).kind, 'guests');
  assert.equal(cellState(obs, 0, 0).lastLeft, false);
  assert.equal(cellState(obs, 0, 1).lastLeft, true, 'three "no"s leave one meaning');
  assert.deepEqual([cellState(obs, 1, 0).kind, cellState(obs, 1, 0).source], ['outcome', 'frost']);
  assert.deepEqual([cellState(obs, 1, 1).kind, cellState(obs, 1, 1).source], ['outcome', 'shard']);
  assert.equal(cellState(obs, 2, 2).kind, 'guess');
  assert.equal(cellState(obs, 3, 3).kind, 'unknown');
  // other strokes' known words are evidence too: in the Place slot two meanings are taken
  assert.equal(cellState(obs, 0, 2).kind, 'guess');
  assert.deepEqual(cellState(obs, 0, 2).taken, [1, 2]);
  const g = glossary(obs);
  assert.equal(g.length, 4); assert.ok(g.every((r) => r.length === 4));
  assert.deepEqual([g[1][0].slot, g[1][0].form], [1, 0], 'rows are slots, columns are strokes');
  assert.equal(knownCount(obs), 4);
});

test('reasons: one plain line per slot, from the cell the reading uses', () => {
  const p = { forms: [1, 0, 2, 3], dots: 0, publishedAt: 1, reading: { offset: 1, slots: [] } };
  assert.equal(formForSlot(p, 0), 0); assert.equal(formForSlot(p, 1), 2); assert.equal(formForSlot(p, 3), 1);
  assert.deepEqual([...signCells(p)].sort(), ['0_0', '1_2', '2_3', '3_1']);
  const obs = fakeObs({
    cells: {
      '0_0': { known: 1, source: 'the Guests' },
      '1_2': { guess: { meaning: 1, confidence: 0.6 } },
      '2_3': { known: 2, source: 'Frost' },
      '3_1': { guess: { meaning: 2, confidence: 0.3 } },
    },
    chronicle: [chron([2, 2, 2, 2], 0, { place: 1, action: 'storm', power: 10, delay: 1 }), chron([2, 0, 1, 3], 0, { place: 1, action: 'storm', power: 10, delay: 1 })],
  });
  assert.equal(slotReason(obs, p, 0).key, 'hub.why.guests');
  const seen = slotReason(obs, p, 1);
  assert.equal(seen.key, 'hub.why.seen');
  assert.deepEqual([seen.args.count, seen.args.total], [2, 2]);
  assert.equal(seen.args.form.key, 'form.2');
  assert.equal(seen.args.meaning.key, 'meaning.1.1');
  assert.equal(slotReason(obs, p, 2).key, 'hub.why.frost');
  // the delay cell (spike, slot 3): one revealed sign could put a spike there, and it never meant Iris's guess
  assert.equal(slotReason(obs, p, 3).key, 'hub.why.unseen');
  assert.equal(slotReason(fakeObs(), p, 3).key, 'hub.why.none');
  // the player changed a slot: the line compares the choice with the dictionary
  assert.equal(slotReason(obs, p, 0, 3).key, 'hub.why.yoursKnown');
  assert.equal(slotReason(obs, p, 1, 0).key, 'hub.why.yours');
  assert.equal(slotReason(obs, p, 1, 1).key, 'hub.why.seen', 'choosing Iris\'s own meaning keeps her reason');
  const ruled = fakeObs({ cells: { '1_2': { excluded: [0], guess: { meaning: 1, confidence: 0.33 } } } });
  assert.equal(slotReason(ruled, p, 1, 0).key, 'hub.why.yoursRuledOut');
  assert.equal(slotReason(ruled, p, 1).key, 'hub.why.narrowed');
  assert.equal(slotReason(ruled, p, 1).args.count, 3);
  const sold = fakeObs({ cells: { '1_2': { guess: { meaning: 2, confidence: 0.7 } } }, bought: [{ slot: 1, form: 2, meaning: 2, from: 'salt', exposedAsLie: false }] });
  assert.deepEqual(slotReason(sold, p, 1).args.who, { $agentId: 'salt' });
  assert.equal(slotReason(obs, { forms: [0, 1, 2, 3] }, 0), null, 'no reading, no line');
});

test('guide: Read → Choose → See from hub state', () => {
  assert.deepEqual(GUIDE_STEPS, ['read', 'choose', 'see']);
  assert.equal(guideStep({ inShell: false }), 'read');
  assert.equal(guideStep({ inShell: true }), 'read');
  assert.equal(guideStep({ inShell: true, chose: true }), 'choose');
  assert.equal(guideStep({ inShell: false, afterLeave: true }), 'see');
  const obs = { iris: { anchors: [{ shell: 2, tick: 3 }], forgotten: [{}] } };
  assert.equal(choseThisVisit(obs, { staked: false, forgotten: 1 }, { shell: 1, tick: 3 }), false);
  assert.equal(choseThisVisit(obs, { staked: false, forgotten: 0 }, { shell: 1, tick: 3 }), true, 'a memory forgotten during the visit');
  assert.equal(choseThisVisit(obs, { staked: false, forgotten: 1 }, { shell: 2, tick: 3 }), true, 'the reading is already staked');
  assert.equal(choseThisVisit(obs, { staked: true, forgotten: 1 }, null), true);
});

test('hub: a quiet Shell stays quiet; it never draws another Shell\'s sign', async () => {
  const { s } = await setup();
  const by = signsByShell(s.obs);
  const quiet = [1, 2, 3, 4].filter((n) => !by.get(n).length);
  assert.ok(quiet.length > 0, 'the judge season starts with a quiet Shell');
  for (const n of quiet) assert.equal(signForShell(s.obs, n), null, `Shell ${n}`);
  for (const n of [1, 2, 3, 4]) if (by.get(n).length) assert.equal(signForShell(s.obs, n).impliedAnchor.shell, n);
  assert.deepEqual(waitingShells(s.obs, quiet[0]), [1, 2, 3, 4].filter((n) => n !== quiet[0] && by.get(n).length));
  s.dispose();
});

test('hub: from a quiet Shell a hop to the waiting Shell keeps the trial', async () => {
  const { s, hub } = await setup();
  const by = signsByShell(s.obs);
  const quiet = [1, 2, 3, 4].find((n) => !by.get(n).length);
  const other = waitingShells(s.obs, quiet)[0];
  await hub.flyTo(quiet);
  assert.equal(hub.currentSign(), null);
  assert.equal(hub.draft, null);
  const tick = s.obs.season.tick;
  assert.equal((await hub.flyTo(other)).ok, true);
  assert.equal(s.obs.you.shell, other);
  assert.equal(s.obs.season.tick, tick, 'flying between Shells does not end the trial');
  assert.ok(hub.currentSign());
  s.dispose();
});

test('hub: the guide follows a visit: read on landing, choose after the stake, see after leaving', async () => {
  const { s, hub } = await setup();
  assert.equal(hub.guide(), 'read');
  const n = [...signsByShell(s.obs)].find(([, v]) => v.length)[0];
  await hub.flyTo(n);
  assert.equal(hub.guide(), 'read');
  assert.equal((await hub.stake()).ok, true);
  assert.equal(hub.guide(), 'choose');
  await hub.leave();
  assert.equal(hub.guide(), 'see');
  await hub.flyTo(n);
  const t = hub.target();
  const staked = !!t && s.obs.iris.anchors.some((a) => a.shell === t.shell && a.tick === t.tick);
  assert.equal(hub.guide(), staked ? 'choose' : 'read', 'a new visit starts at Read unless this reading is already staked');
  assert.equal(hub.afterLeave, false);
  s.dispose();
});

test('reasons: every visible sign of a real season explains every slot in all five languages', async () => {
  const { s, hub } = await setup();
  for (let round = 0; round < 3; round++) {
    const obs = s.obs;
    const g = glossary(obs).flat();
    for (const c of obs.dictionary.cells) {
      const k = g.find((x) => x.slot === c.slot && x.form === c.form).kind;
      assert.equal(c.known != null, k === 'guests' || k === 'outcome', `cell ${c.slot}_${c.form}`);
    }
    for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) {
      const missing = [];
      const i18n = createPlayI18n(loc, { onMissing: (key) => missing.push(key) });
      for (const p of obs.prophecies) for (let k = 0; k < 4; k++) {
        const why = slotReason(obs, p, k);
        assert.ok(why, `sign #${p.index} slot ${k}`);
        const text = renderMsg(i18n, why.key, why.args);
        assert.ok(text && !/[{}]/.test(text), `${loc}:${why.key} → ${text}`);
      }
      for (const kind of ['guests', 'outcome', 'guess', 'unknown']) {
        const text = i18n.t('hub.gloss.cell.' + kind, { form: 'f', slot: 's', meaning: 'm', confidence: 40 });
        assert.ok(!/[{}]/.test(text), `${loc}:${kind}`);
      }
      assert.deepEqual(missing, [], loc);
    }
    for (let i = 0; i < 3; i++) await hub.advance();
  }
  assert.ok(s.obs.chronicle.length > 0, 'later rounds read with a chronicle');
  s.dispose();
});
