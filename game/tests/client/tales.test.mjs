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
