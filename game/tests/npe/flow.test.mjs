// The intro flow (sprint 7.4, 7.11 tests 2, 3, 7, 8): every transition including skip at each state, ?intro=0/1,
// flag off, the A6 module missing or failing (title-card fallback), no silk granted by the intro (one stipend: the story's), the card's seven
// rows, persistence round trip and reset; the dialogue box types at 40 cps and is instant under reduced motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { memoryStorage } from '../../src/ui/storage.js';
import NPE from '../../src/play/locales/en-npe.js';
import { loadNpe, saveNpe, clearNpe, shouldRun, initial, reduce, NPE_KEY } from '../../src/npe/flow.js';

const tick = (n = 1) => new Promise((r) => { let k = n; const go = () => (--k <= 0 ? r() : setTimeout(go, 0)); setTimeout(go, 0); });
const dom = () => { const { doc } = installDom(); doc.getElementById = doc.getElementById || (() => null); doc.addEventListener = doc.addEventListener || (() => {}); doc.removeEventListener = doc.removeEventListener || (() => {}); return doc; };

test('flow: shouldRun honours ?intro=0, ?intro=1, the flag and the saved state', () => {
  const fresh = loadNpe(memoryStorage());
  assert.equal(shouldRun({ flag: true, search: '', rec: fresh }), true);
  assert.equal(shouldRun({ flag: false, search: '', rec: fresh }), false, 'flag off: old path');
  assert.equal(shouldRun({ flag: true, search: '?intro=0', rec: fresh }), false);
  assert.equal(shouldRun({ flag: false, search: '?intro=1', rec: { ...fresh, dialogueSeen: true } }), true, '?intro=1 ignores the flag and the saved state');
  assert.equal(shouldRun({ flag: true, search: '', rec: { ...fresh, dialogueSeen: true } }), false, 'second load: no intro');
});

test('flow: the reducer walks every state; skip works at each; the intro never grants silk', () => {
  const walk = (events, rec = loadNpe(null)) => { let s = initial(rec); let paid = 0; for (const e of events) { s = reduce(s, e); if (s.award) paid++; } return { s, paid }; };
  const lines = Array.from({ length: 19 }, (_, i) => ({ type: 'line_done', last: i === 18, award: i === 16 }));
  let r = walk([{ type: 'start' }, { type: 'prologue_done' }, { type: 'wakeup_done' }, ...lines, { type: 'start_card' }, { type: 'handoff_done' }]);
  assert.equal(r.s.phase, 'done'); assert.equal(r.paid, 0, 'no silk: the welcome is TWIST_DONE');
  assert.deepEqual([r.s.rec.prologueSeen, r.s.rec.dialogueSeen, r.s.rec.cardSeen, r.s.rec.stipend], [true, true, true, false]);
  r = walk([{ type: 'start' }, { type: 'prologue_skip' }, { type: 'wakeup_done' }, { type: 'skip_all' }, { type: 'later' }, { type: 'handoff_done' }]);
  assert.equal(r.s.phase, 'done'); assert.equal(r.paid, 0, 'skipping grants nothing either'); assert.equal(r.s.rec.cardSeen, false, 'Show me later'); assert.equal(r.s.skipped, true);
  r = walk([{ type: 'start' }, { type: 'prologue_skip' }, { type: 'prologue_skip' }, { type: 'skip_all' }]);
  assert.equal(r.s.phase, 'card', 'Esc in the prologue and again in the wake-up reaches the dialogue, Skip all the card');
  r = walk([{ type: 'start' }, { type: 'prologue_done' }, { type: 'wakeup_done' }, { type: 'skip_all' }], { ...loadNpe(null), stipend: true });
  assert.equal(r.paid, 0, 'a replay grants nothing');
  assert.equal(reduce(initial(loadNpe(null)), { type: 'skip_all' }).phase, 'idle', 'unknown events are ignored');
});

test('flow: persistence round trip and reset', () => {
  const st = memoryStorage();
  saveNpe(st, { prologueSeen: true, dialogueSeen: true, cardSeen: false, stipend: true });
  assert.deepEqual(loadNpe(st), { v: 1, prologueSeen: true, dialogueSeen: true, cardSeen: false, stipend: true });
  clearNpe(st); assert.equal(st.getItem(NPE_KEY), null); assert.equal(loadNpe(st).dialogueSeen, false);
});

test('dialogue box: 40 cps typing, a click completes a line, reduced motion is instant, Esc skips all', async () => {
  const doc = dom();
  const { playDialogue } = await import('../../src/npe/dialogue-ui.js');
  let clock = 0; const frames = [];
  const lines = [{ speaker: 'elder', text: 'a'.repeat(80) }, { speaker: 'iris', text: 'Where am I?' }];
  const done = [];
  const d = playDialogue({ doc, lines, reduced: () => false, name: (s) => NPE['npe.speaker.' + s], hint: 'h', count: (n, of) => `${n} / ${of}`, skipLabel: 'Skip ›', now: () => clock, raf: (f) => frames.push(f), onDone: (i) => done.push(i) });
  const text = () => doc.querySelector('.npe-text').textContent;
  assert.equal(text(), '', 'typing starts empty');
  clock = 1000; frames.shift()();
  assert.equal(text().length, 40, '40 characters after one second');
  assert.equal(doc.querySelector('.npe-name').textContent, 'Elder');
  assert.equal(doc.querySelector('.npe-foot').textContent.includes('1 / 2'), true);
  d.advance(); assert.equal(text().length, 80, 'a click completes the line'); assert.deepEqual(done, []);
  d.advance(); assert.deepEqual(done, [0]); assert.equal(doc.querySelector('.npe-name').textContent, 'Iris');
  d.skip(); assert.equal(await d.done, 'skipped'); assert.equal(doc.querySelectorAll('.npe-box').length, 0);
  const r = playDialogue({ doc, lines, reduced: () => true, name: (s) => s, hint: 'h', count: () => '', skipLabel: 'Skip', now: () => 0, raf: () => assert.fail('no animation frames under reduced motion') });
  assert.equal(doc.querySelector('.npe-text').textContent.length, 80, 'instant under reduced motion');
  r.advance(); r.advance(); assert.equal(await r.done, 'finished');
});

test('roadmap card (design review 13.11): three rows (Quests J, Trade B, the way home with the fee), one Start button', async () => {
  const doc = dom();
  const { openRoadmapCard, ROWS } = await import('../../src/npe/roadmap-card.js');
  const { withNpe } = await import('../../src/npe/index.js');
  const t = withNpe((k) => k);
  assert.deepEqual(ROWS.map((r) => [r.id, r.key]), [['quests', 'J'], ['trade', 'B'], ['home', null]]);
  assert.ok(ROWS.every((r) => r.glyph.startsWith('<svg') && !/[\u{1F300}-\u{1FAFF}]/u.test(r.glyph)), 'line glyphs, no emoji');
  const c = openRoadmapCard({ doc, t, vars: { fee: '200' } });
  const rows = doc.querySelectorAll('.npe-card li');
  assert.equal(rows.length, 3);
  assert.ok(rows[0].querySelector('b').textContent.startsWith('Quests')); assert.ok(rows[2].querySelector('b').textContent.startsWith('The way home'));
  assert.equal(rows[2].querySelector('.txt').textContent, 'Gather 200 silk and step into the Gate-Loom to go home.');
  const buttons = doc.querySelectorAll('.npe-card button'); assert.equal(buttons.length, 1); assert.equal(buttons[0].textContent, 'Start');
  buttons[0].click();
  assert.equal(await c.result, 'start');
  const c2 = openRoadmapCard({ doc, t, vars: {} }); c2.close();
  assert.equal(await c2.result, 'later');
});

test('intro end to end (DOM): fallback without A6, 19 lines in order, no silk granted, the card, control back', async () => {
  const doc = dom();
  const { runIntro } = await import('../../src/npe/index.js');
  const storage = memoryStorage(); const grants = []; const toasts = []; const events = []; const locks = [];
  const bus = { emit: (n, p) => events.push(n), on: () => () => {} };
  const ctx = { doc, t: (k) => k, storage, toast: (s) => toasts.push(s), ledger: { grant: (g) => grants.push(g) }, bus, reduced: () => true, search: '', lockControls: (on) => locks.push(on),
    prologue: { playLabPrologue: async () => 'done', playWakeUp: async () => {} } };
  const run = runIntro(ctx);
  await tick(3);
  const names = [];
  for (let i = 0; i < 19; i++) { names.push(doc.querySelector('.npe-name').textContent); doc.querySelector('.npe-box').click(); await tick(); }
  assert.deepEqual(names.slice(0, 7), ['Townsfolk', 'Child', 'Guard', 'Lamplighter', 'Weaver', 'Elder', 'Iris']);
  await tick(2);
  assert.equal(doc.querySelectorAll('.npe-card li').length, 3, 'the card opens after W19');
  assert.deepEqual(grants, [], 'the intro grants no silk'); assert.deepEqual(toasts, []);
  doc.querySelectorAll('.npe-card button').find((b) => b.textContent === 'Start').click();
  const s = await run.state;
  assert.equal(s.phase, 'done'); assert.deepEqual(locks, [true, false]);
  assert.ok(events.includes('npe.started') && events.includes('npe.completed') && events.includes('prologue.completed'));
  assert.equal(loadNpe(storage).dialogueSeen, true);
  // second load: the module does nothing
  const { mount } = await import('../../src/npe/index.js');
  assert.equal(mount({ ...ctx, flags: { newPlayerIntro: true } }).intro, null);
});

test('intro: a failing A6 module falls back to the title card; Skip all says how to replay', async () => {
  const doc = dom();
  const { runIntro } = await import('../../src/npe/index.js');
  const storage = memoryStorage(); const grants = []; const toasts = [];
  const run = runIntro({ doc, t: (k) => k, storage, toast: (s) => toasts.push(s), ledger: { grant: (g) => grants.push(g) }, reduced: () => true, search: '', prologue: { playLabPrologue: async () => { throw new Error('chunk failed'); } } });
  await tick(2);
  assert.ok(doc.querySelector('.npe-title'), 'the title card stands in');
  assert.ok(doc.querySelector('.npe-title').textContent.includes('Year 2048.'));
  run.skip(); await tick(3);
  assert.ok(doc.querySelector('.npe-box'), 'Esc on the title card reaches the dialogue');
  run.skip(); await tick(3);
  assert.equal(doc.querySelectorAll('.npe-card li').length, 3);
  assert.deepEqual(grants, []); assert.ok(toasts.includes(NPE['npe.skipped']));
  run.skip(); const s = await run.state; assert.equal(s.rec.cardSeen, false);
});

test('intro: Iris speaks her prologue lines with their subtitles, only with the sound on; speech stands in only with narration (QA 14.11)', async () => {
  const { CUES } = await import('../../src/cinematic/prologue/shots.js');
  const run = async (storage) => {
    const doc = dom(); const played = []; let onCue = null;
    const { runIntro } = await import('../../src/npe/index.js');
    const bus = { emit: () => {}, on: (n, f) => { if (n === 'prologue.cue') onCue = f; return () => { onCue = null; }; } };
    const voice = { play: async (id, o) => { played.push([id, o.speech]); return 'file'; } };
    const r = runIntro({ doc, t: (k) => k, storage, bus, voice, reduced: () => true, search: '', noQueueWait: true,
      prologue: { playLabPrologue: async () => { for (const c of CUES) onCue({ ...c }); return 'done'; }, playWakeUp: async () => {} } });
    await tick(3); r.skip(); await tick(2); r.skip(); await tick(2); r.skip(); await r.state;
    return played;
  };
  const on = memoryStorage();
  assert.deepEqual(await run(on), [['iris_hmm', false], ['iris_oh_no', false], ['iris_gasp', false]], 'each voiced cue once, no speech without narration');
  const narr = memoryStorage(); narr.setItem('ftf.prefs.v1', JSON.stringify({ narration: true }));
  assert.deepEqual((await run(narr)).map((x) => x[1]), [true, true, true], 'narration on: the speech may stand in');
  const mute = memoryStorage(); mute.setItem('ftf.audio.v2', JSON.stringify({ master: 0 }));
  assert.deepEqual(await run(mute), [], 'master at 0: silence');
});
