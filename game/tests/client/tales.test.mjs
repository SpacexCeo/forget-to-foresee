// Town tales (owner 14.11 night): "The Ink That Remembers" (src/game/tales.js rules, src/scenes/town-tales.js scene).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { INK, INK_KEYS, INK_STAGES, freshTales, cleanTales, inkDo, inkTalk, inkMarkers, isDark } from '../../src/game/tales.js';

const run = (s, ...acts) => acts.reduce((acc, a) => inkDo(acc, a).state, s);

test('the whole tale: offer, three veilbells, the Sweeper after dark, the jar, a choice', () => {
  let s = freshTales();
  assert.equal(inkTalk(s, 'scribe', { level: 1 }), null, 'below level 2 the Scribe has no tale yet');
  assert.deepEqual(inkMarkers(s, { level: 1 }), []);
  assert.deepEqual(inkMarkers(s, { level: 2 }), [{ giver: 'scribe', sym: '!' }]);
  assert.deepEqual(inkTalk(s, 'scribe', { level: 2 }).choices.map((c) => c.act), ['accept', 'close']);
  let r = inkDo(s, { type: 'ACCEPT', level: 1 }); assert.equal(r.events.length, 0, 'no accept below level 2');
  r = inkDo(s, { type: 'ACCEPT', level: 2 }); s = r.state; assert.equal(s.ink.stage, 'bells'); assert.deepEqual(r.events, [{ e: 'accepted' }]);
  r = inkDo(s, { type: 'KILL', mob: 'skitter' }); assert.equal(r.events.length, 0, 'only veilbells count');
  s = run(s, { type: 'KILL', mob: 'veilbell' }, { type: 'KILL', mob: 'veilbell' });
  assert.equal(s.ink.bells, 2); assert.equal(inkTalk(s, 'scribe').args.n, 2);
  r = inkDo(s, { type: 'KILL', mob: 'veilbell' }); s = r.state;
  assert.deepEqual(r.events.map((e) => e.e), ['bell', 'quiet']); assert.equal(s.ink.stage, 'heard');
  assert.deepEqual(inkMarkers(s), [{ giver: 'scribe', sym: '?' }]);
  assert.equal(inkDo(s, { type: 'KILL', mob: 'veilbell' }).events.length, 0, 'more bells change nothing');
  s = run(s, { type: 'ASK_SWEEPER' }); assert.equal(s.ink.stage, 'sweeper');
  assert.deepEqual(inkTalk(s, 'sweeper', { dark: false }).lines, ['tale.ink.sweeper.day'], 'by day she only sweeps dust');
  assert.deepEqual(inkMarkers(s, { dark: false }), []);
  assert.deepEqual(inkMarkers(s, { dark: true }), [{ giver: 'sweeper', sym: '!' }]);
  assert.equal(inkDo(s, { type: 'TAKE_JAR', dark: false }).events.length, 0, 'no jar in daylight');
  assert.deepEqual(inkTalk(s, 'sweeper', { dark: true }).choices.map((c) => c.act), ['jar']);
  s = run(s, { type: 'TAKE_JAR', dark: true }); assert.equal(s.ink.stage, 'jar');
  assert.deepEqual(inkTalk(s, 'scribe').choices.map((c) => c.act), ['return', 'keep']);
  r = inkDo(s, { type: 'CHOOSE', choice: 'return' }); s = r.state;
  assert.deepEqual(r.events, [{ e: 'reward', choice: 'return' }]); assert.equal(s.ink.stage, 'done');
  assert.deepEqual(inkTalk(s, 'scribe').lines, ['tale.ink.after.return']);
  assert.deepEqual(inkTalk(s, 'sweeper').lines, ['tale.ink.sweeper.return']);
  assert.equal(inkDo(s, { type: 'CHOOSE', choice: 'keep' }).events.length, 0, 'the reward is paid once');
  assert.deepEqual(inkMarkers(s), []);
});

test('the other ending; townsfolk outside the tale have nothing to say about it', () => {
  const s = run(freshTales(), { type: 'ACCEPT', level: 3 }, ...Array(INK.bells).fill({ type: 'KILL', mob: 'veilbell' }), { type: 'ASK_SWEEPER' }, { type: 'TAKE_JAR' }, { type: 'CHOOSE', choice: 'keep' });
  assert.equal(s.ink.choice, 'keep');
  assert.deepEqual(inkTalk(s, 'scribe').lines, ['tale.ink.after.keep']);
  assert.equal(inkTalk(s, 'baker'), null);
  assert.equal(inkTalk(freshTales(), 'sweeper'), null, 'the Sweeper keeps her secret until she is asked');
});

test('stored state is cleaned; the dark keys', () => {
  assert.deepEqual(cleanTales(null), freshTales());
  assert.deepEqual(cleanTales({ ink: { stage: 'what', bells: -2 } }), freshTales());
  assert.equal(cleanTales({ ink: { stage: 'bells', bells: 99 } }).ink.bells, INK.bells);
  assert.equal(cleanTales({ ink: { stage: 'done' } }).ink.choice, 'keep');
  assert.ok(INK_STAGES.includes('jar'));
  assert.equal(isDark('night'), true); assert.equal(isDark('dusk'), true); assert.equal(isDark('dawn'), false); assert.equal(isDark(null), true);
});

test('every tale line in five locales, short, same placeholders as English', async () => {
  const dicts = {};
  for (const l of ['en', 'ru', 'uk', 'it', 'zh']) { const m = await import(`../../src/play/locales/${l}.js`); dicts[l] = m.default || Object.values(m)[0]; }
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of INK_KEYS) {
    for (const l of Object.keys(dicts)) {
      const v = dicts[l][k];
      assert.ok(typeof v === 'string' && v.length, `${l}: ${k}`);
      assert.ok(v.length <= 140, `${l}: ${k} is ${v.length} chars`);
      assert.equal(ph(v), ph(dicts.en[k]), `${l}: ${k} placeholders`);
    }
  }
  for (const st of INK_STAGES) for (const npc of ['scribe', 'sweeper']) for (const dark of [true, false]) {
    const tk = inkTalk({ v: 1, ink: { stage: st, bells: 1, choice: 'return' } }, npc, { level: 5, dark });
    if (!tk) continue;
    for (const k of [...tk.lines, ...tk.choices.map((c) => c.key)]) assert.ok(INK_KEYS.includes(k), k);
  }
});

test('the scene is wired: flag on, spots, markers, the day cycle', () => {
  const read = (f) => readFileSync(new URL('../../src/' + f, import.meta.url), 'utf8');
  const boot = read('boot-world.js');
  assert.match(boot, /featureFlags\.on\('tales'\)/);
  assert.match(boot, /spots\.push\(\.\.\.townTales\.spots\)/);
  assert.match(boot, /\.\.\.\(townTales \? townTales\.markers\(\) : \[\]\)/);
  assert.match(boot, /function afterDark\(\)/);
  assert.match(read('features.js'), /tales: false,/);
  assert.equal(JSON.parse(readFileSync(new URL('../../public/features.json', import.meta.url), 'utf8')).flags.tales, true);
  assert.match(read('scenes/town-tales.js'), /win\.addEventListener\('ftf:mob-killed', onKill\)/);
});

// ---- The Lost Tourist (flag wayfarers): a Wayfarer from Kallima walked to the Gate-Loom
test('the Lost Tourist: offer, the walk, the gate, a postcard; a walk cut by a reload starts again', async () => {
  const { LOST, lostDo, lostTalk, lostMarkers, wayLine, cleanLost } = await import('../../src/game/tales.js');
  let l = { stage: 'none' };
  assert.deepEqual(lostMarkers(l), [{ giver: 'wayfarer', sym: '!' }]);
  assert.deepEqual(lostTalk(l).choices.map((c) => c.act), ['accept', 'close']);
  assert.equal(lostDo(l, { type: 'ARRIVE' }).events.length, 0, 'no arrival before the walk');
  let r = lostDo(l, { type: 'ACCEPT' }); l = r.lost; assert.equal(l.stage, 'escort'); assert.deepEqual(lostMarkers(l), []);
  assert.deepEqual(lostTalk(l).lines, ['tale.lost.walking']);
  assert.deepEqual(cleanLost({ lost: l }), { stage: 'none' }, 'a reload mid-walk offers the walk again');
  r = lostDo(l, { type: 'ARRIVE' }); l = r.lost; assert.equal(l.stage, 'arrived'); assert.deepEqual(lostMarkers(l), [{ giver: 'wayfarer', sym: '?' }]);
  assert.deepEqual(lostTalk(l).choices.map((c) => c.act), ['postcard']);
  r = lostDo(l, { type: 'POSTCARD' }); l = r.lost; assert.deepEqual(r.events, [{ e: 'postcard' }]);
  assert.equal(lostDo(l, { type: 'POSTCARD' }).events.length, 0, 'one postcard');
  assert.notDeepEqual(lostTalk(l, 0).lines, lostTalk(l, 1).lines, 'two after-lines in turn');
  assert.deepEqual([0, 5.9, 6, 12, 18, 24, 60].map((s) => wayLine(s)), ['tale.lost.way.1', 'tale.lost.way.1', 'tale.lost.way.2', 'tale.lost.way.3', 'tale.lost.way.4', null, null]);
  assert.ok(LOST.reward.xp > 0 && !('silk' in LOST.reward), 'no silk: the pacing stays as tested');
  const { freshTales, cleanTales, inkDo } = await import('../../src/game/tales.js');
  assert.deepEqual(freshTales().lost, { stage: 'none' });
  assert.equal(inkDo(cleanTales({ lost: { stage: 'done' } }), { type: 'ACCEPT', level: 2 }).state.lost.stage, 'done', 'the ink tale keeps the tourist part');
});

test('the Wayfarer: a visitor apart from the town\'s thirteen, a placeholder body at 1.9 m, eight bubble lines', async () => {
  const { TOWNSFOLK, PROGRAMS, WAYFARERS, WAYFARER_TO_GATE, walkProgram } = await import('../../src/play/townsfolk-plan.js');
  assert.equal(TOWNSFOLK.length, 13); assert.equal(Object.keys(PROGRAMS).length, 13);
  const w = WAYFARERS.find((x) => x.key === 'wayfarer');
  assert.ok(w.visitor && w.program && w.program.steps.length);
  assert.ok(Math.abs(w.height - 1.9) < 1e-9);
  assert.ok(readFileSync(new URL('../../public/assets/models/' + w.asset + '.glb', import.meta.url)).length > 1000, 'the placeholder body file exists');
  const prog = walkProgram([1, 2.5, 6], WAYFARER_TO_GATE);
  assert.equal(prog.steps.length, 2); assert.ok(prog.steps[0].walk.length >= WAYFARER_TO_GATE.length + 1); assert.equal(prog.steps[1].clip, 'idle');
  const end = prog.steps[0].walk.at(-1); assert.ok(Math.hypot(end[0] - 4.4, end[2] - 24.8) < 3, 'the walk ends in front of the Gate-Loom');
  const { barkCandidates, WAYFARER_BARKS } = await import('../../src/scenes/barks.js');
  assert.equal(WAYFARER_BARKS.length, 8);
  assert.deepEqual(barkCandidates({ key: 'wayfarer', hour: 'night', rain: 1 }), WAYFARER_BARKS.slice());
  const { LOST_KEYS } = await import('../../src/game/tales.js');
  for (const l of ['en', 'ru', 'uk', 'it', 'zh']) {
    const m = await import(`../../src/play/locales/${l}.js`), d = m.default || Object.values(m)[0];
    for (const k of LOST_KEYS) { assert.ok(typeof d[k] === 'string' && d[k].length && d[k].length <= 140, `${l}: ${k}`); assert.equal((d[k].match(/\{\w+\}/g) || []).join(), ((m.default ? (await import('../../src/play/locales/en.js')).default : d)[k].match(/\{\w+\}/g) || []).join(), `${l}: ${k} placeholders`); }
  }
});

test('the Wayfarer is wired: hidden without the flag, no hire talk, walked by the tale, flag on', () => {
  const read = (f) => readFileSync(new URL('../../src/' + f, import.meta.url), 'utf8');
  const tf = read('play/townsfolk.js'), boot = read('boot-world.js');
  assert.match(tf, /visitors = \(\) => features\.on\('wayfarers'\)/);
  assert.match(tf, /!\(p\.def\.visitor && \(p\.gone \|\| !visitors\(\)\)\)/);
  assert.match(tf, /walkAlong\(key, path\)/);
  assert.equal((boot.match(/p\.def\.visitor\) continue;/g) || []).length, 2, 'no hire talk with a visitor');
  assert.match(boot, /lostOn: \(\) => featureFlags\.on\('wayfarers'\)/);
  assert.equal(JSON.parse(readFileSync(new URL('../../public/features.json', import.meta.url), 'utf8')).flags.wayfarers, true);
});
