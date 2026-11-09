// i18n: ICU formatting, locale completeness, no raw keys, and the engine adapter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as E from '../src/game/engine.js';
import {
  format, parse, argNames, createI18n, createGameI18n, MESSAGES, MISSING_TEXT, detectLocale,
  localizeFeedEntry, localizeMemoryText, localizeShardTitle, localizeShardResult, localizeFate, localizePinSource,
  parseLogText, renderEvent, fxToLine, renderLine, localizeOffer, effectEvent,
  ADAPTER_KEYS, LINE_KEYS, AGENT_IDS, PIN_SOURCES,
} from '../src/ui/i18n/index.js';
import { createPlayI18n, renderMsg } from '../src/play/i18n.js';
import { stateHash } from './lib/normalize.mjs';
import { playSeason } from './lib/play.mjs';

const en = MESSAGES.en, ru = MESSAGES.ru;
const CYR = /[а-яё]/i;

test('ICU: arguments, numbers, select, plural with # and exact matches', () => {
  assert.equal(format('Hi {name}!', { name: 'Iris' }), 'Hi Iris!');
  assert.equal(format('{n, number}', { n: 12345.5 }, 'en'), '12,345.5');
  assert.equal(format('{x, select, a {A} other {O}}', { x: 'a' }), 'A');
  assert.equal(format('{x, select, a {A} other {O}}', { x: 'zzz' }), 'O');
  const p = '{n, plural, =0 {none} one {# sign} other {# signs}}';
  assert.equal(format(p, { n: 0 }, 'en'), 'none');
  assert.equal(format(p, { n: 1 }, 'en'), '1 sign');
  assert.equal(format(p, { n: 7 }, 'en'), '7 signs');
  const r = '{n, plural, one {# знак} few {# знака} many {# знаков} other {# знака}}';
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25, 1.5].map((n) => format(r, { n }, 'ru')),
    ['1 знак', '2 знака', '5 знаков', '11 знаков', '21 знак', '22 знака', '25 знаков', '1,5 знака']);
  assert.equal(format('{o, select, gift {{n, plural, one {# gift} other {# gifts}}} other {-}}', { o: 'gift', n: 2 }, 'en'), '2 gifts');
});

test('ICU: apostrophes and quoting follow the ICU optional rule', () => {
  assert.equal(format("Iris's key"), "Iris's key");
  assert.equal(format("'{literal}' {x}", { x: 1 }), '{literal} 1');
  assert.equal(format("it''s"), "it's");
  assert.equal(format('#{n} outside plural', { n: 3 }), '#3 outside plural');
});

test('ICU: malformed messages throw instead of rendering garbage', () => {
  for (const bad of ['{', 'a } b', '{n, plural, one {x}}', '{n, bogus}', '{n, select, a {x}']) assert.throws(() => parse(bad), bad);
});

test('locales: all five locales have exactly the English keys and every message parses', () => {
  assert.deepEqual(Object.keys(MESSAGES), ['en', 'uk', 'ru', 'it', 'zh']);
  for (const [locale, messages] of Object.entries(MESSAGES)) {
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(en).sort(), locale);
    for (const key of Object.keys(en)) assert.deepEqual([...argNames(messages[key])].filter((a) => !argNames(en[key]).has(a)), [], `${locale}:${key}`);
  }
  const ek = Object.keys(en).sort(), rk = Object.keys(ru).sort();
  assert.deepEqual(rk.filter((k) => !en[k]), [], 'keys only in ru');
  assert.deepEqual(ek.filter((k) => !(k in ru)), [], 'keys missing in ru');
  for (const [loc, msgs] of Object.entries(MESSAGES)) for (const [k, v] of Object.entries(msgs)) {
    assert.equal(typeof v, 'string', `${loc}:${k}`);
    assert.doesNotThrow(() => parse(v), `${loc}:${k} does not parse`);
  }
});

test('locales: ru placeholders are a subset of en placeholders; en text has no Cyrillic', () => {
  for (const k of Object.keys(en)) {
    const extra = [...argNames(ru[k])].filter((a) => !argNames(en[k]).has(a));
    assert.deepEqual(extra, [], `ru:${k} uses arguments en does not pass`);
    if (!k.startsWith('lang.')) assert.ok(!CYR.test(en[k]), `en:${k} contains Cyrillic`);
  }
});

/** Every key-shaped string literal in src/ui must exist in the base locale. */
function walk(dir) { return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; }); }
const NS = ['app', 'common', 'lang', 'lobby', 'panel', 'settings', 'profile', 'flow', 'ent', 'tut', 'ctor', 'fc', 'tour', 'hud', 'tell', 'preview', 'outcome', 'reason', 'wh'];
test('no raw keys: every static key referenced from src/ui exists in en', () => {
  const dir = fileURLToPath(new URL('../src/ui/', import.meta.url));
  const re = new RegExp(`['"\`]((?:${NS.join('|')})\\.[A-Za-z0-9_.]+)['"\`]`, 'g');
  const missing = [];
  let count = 0;
  for (const file of walk(dir)) for (const m of readFileSync(file, 'utf8').matchAll(re)) {
    if (m[1].endsWith('.')) continue; // a prefix for a dynamic family, checked below
    count++;
    if (!(m[1] in en)) missing.push(`${m[1]} (${file.split(/[\\/]/).slice(-2).join('/')})`);
  }
  assert.deepEqual(missing, []);
  assert.ok(count > 50, `expected the scan to find UI keys, found ${count}`);
});

test('no raw keys: dynamic key families are complete', () => {
  const reasons = [...readFileSync(fileURLToPath(new URL('../src/game/engine.js', import.meta.url)), 'utf8').matchAll(/no\('(\w+)'\)/g)].map((m) => 'reason.' + m[1]);
  const fam = [
    ...ADAPTER_KEYS, ...LINE_KEYS, ...reasons,
    ...AGENT_IDS.map((a) => 'agent.' + a), 'agent.guests', 'agent.unknown',
    ...[0, 1, 2, 3].flatMap((i) => ['shell.' + i, 'slot.' + i, 'form.' + i, ...[0, 1, 2, 3].map((m) => `meaning.${i}.${m}`)]),
    ...['gift', 'weapon', 'survived', 'lost', 'gone', 'proof_failed'].map((o) => 'outcome.' + o),
    ...['sell', 'loan', 'gift', 'pact', 'escrow', 'unknown'].map((o) => 'offer.' + o),
    ...['first', 'call', 'gift', 'betrayal', 'debt', 'promise', 'unknown'].map((o) => 'effect.' + o),
  ];
  assert.ok(reasons.length >= 20, 'engine rejection reasons were found');
  assert.deepEqual(fam.filter((k) => !(k in en)), []);
});

test('runtime: a missing key never renders the raw key; ru falls back to en', () => {
  const warned = [];
  const i = createI18n({ messages: { en: { a: 'A {x}', only: 'EN only' }, ru: { a: 'Б {x}' } }, locale: 'ru', onMissing: (k, l) => warned.push(l + ':' + k) });
  assert.equal(i.t('a', { x: 1 }), 'Б 1');
  assert.equal(i.t('only'), 'EN only');
  const out = i.t('does.not.exist');
  assert.equal(out, MISSING_TEXT);
  assert.notEqual(out, 'does.not.exist');
  assert.deepEqual(warned, ['ru:only', 'ru:does.not.exist']);
  const broken = createI18n({ messages: { en: { b: '{n, plural, one {x}}' } } });
  assert.equal(broken.t('b', { n: 1 }), MISSING_TEXT);
});

test('runtime: language switches in place and notifies subscribers', () => {
  const i = createGameI18n('en', { onMissing: () => {} });
  const seen = [];
  const off = i.subscribe((l) => seen.push(l));
  assert.equal(i.t('lobby.enter'), 'ENTER THE WORLD');
  assert.equal(i.setLocale('ru'), true);
  assert.equal(i.t('lobby.enter'), 'ВОЙТИ В МИР');
  assert.equal(i.setLocale('ru'), false, 'same locale is a no-op');
  assert.equal(i.setLocale('xx'), false, 'unknown locale is ignored');
  off();
  i.setLocale('en');
  assert.deepEqual(seen, ['ru']);
  assert.equal(detectLocale(['de-DE', 'ru-RU']), 'ru');
  assert.equal(detectLocale(['fr']), 'en');
});

test('English is the release language: the browser language never picks the locale; a saved choice or ?lang= does', async () => {
  const { createUiContext } = await import('../src/ui/context.js');
  const { createPlayContext } = await import('../src/play/i18n.js');
  const { createSafeStorage, memoryStorage, STORAGE_KEYS } = await import('../src/ui/storage.js');
  const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['ru-RU', 'uk'], language: 'ru-RU' } });
  try {
    const quiet = { onMissing: () => {} };
    assert.equal(createGameI18n(undefined, quiet).locale, 'en', 'a Russian browser still opens in English');
    assert.equal(createPlayI18n(undefined, quiet).locale, 'en');
    const fresh = createSafeStorage(memoryStorage());
    assert.equal(createPlayContext({ storage: fresh }).i18n.locale, 'en', 'no saved choice → English');
    assert.equal(fresh.getJSON(STORAGE_KEYS.prefs), null, 'nothing is saved for a player who never chose');
    // the player's choice is saved and wins on the next start
    const ctx = createPlayContext({ storage: fresh });
    ctx.i18n.setLocale('uk');
    assert.equal(createPlayContext({ storage: fresh }).i18n.locale, 'uk', 'a saved choice survives a reload');
    assert.equal(createUiContext({ storage: fresh }).i18n.locale, 'uk');
    // ?lang= (main.js passes it as `locale`) overrides the saved choice without overwriting it
    const viaUrl = createPlayContext({ storage: fresh, locale: 'zh' });
    assert.equal(viaUrl.i18n.locale, 'zh');
    assert.equal(fresh.getJSON(STORAGE_KEYS.prefs).locale, 'uk', '?lang= is not stored');
  } finally {
    if (had) Object.defineProperty(globalThis, 'navigator', had); else delete globalThis.navigator;
  }
});

/** Plays many seasons once; the adapter tests below share the states. */
const seasons = [];
for (const rules of ['baseline-2d-1', 'v2']) for (const pol of ['coop', 'hold', 'breaks']) for (let s = 1; s <= 20; s++) {
  const fx = [];
  const S = playSeason(s * 97 + 13, pol, rules, (st) => { fx.push(...st.fx); st.fx = []; });
  seasons.push({ S, fx, rules, pol });
}

test('adapter: every engine chronicle line, memory, shard and fate maps to a key (120 seasons)', () => {
  const miss = [];
  for (const { S } of seasons) {
    for (const f of S.feed) if (!parseLogText(f.text)) miss.push('log: ' + f.text);
    const i = createGameI18n('en', { onMissing: (k) => miss.push('key: ' + k) });
    for (const m of S.mem) if (localizeMemoryText(m.text, i) !== m.text) miss.push('mem: ' + m.text);
    for (const f of S.forgot) { if (localizeMemoryText(f.text, i) !== f.text) miss.push('forgot: ' + f.text); if (localizeFate(f.fate, i) !== f.fate) miss.push('fate: ' + f.fate); }
    for (const sh of S.shards) {
      if (localizeShardTitle(sh.title, i) !== sh.title) miss.push('shard: ' + sh.title);
      if (localizeShardResult(sh.result, i) !== (sh.result || '')) miss.push('result: ' + sh.result);
    }
    for (const p of Object.values(S.pins)) if (!PIN_SOURCES[p.src] && !E.NAMES.includes(p.src)) miss.push('pin: ' + p.src);
    assert.equal(i.missing.size, 0, [...i.missing].join(', '));
  }
  assert.deepEqual(miss, []);
});

test('adapter: the English locale reproduces the engine text exactly; the Russian locale renders every line', () => {
  const iEn = createGameI18n('en'), iRu = createGameI18n('ru');
  let lines = 0;
  for (const { S } of seasons) for (const f of S.feed) {
    const e = localizeFeedEntry(f, iEn);
    // The one deliberate difference: a list of names is locale-formatted ("Salt and Moss", not "Salt, Moss").
    if (e.event.key === 'log.giftTaken' && e.event.args.who.$agents.length > 1) continue;
    assert.equal(e.text, f.text);
    let txt = e.text;
    if (typeof e.event.args.phrase === 'string') txt = txt.replace(e.event.args.phrase, ''); // Ash's phrases stay verbatim
    assert.ok(!CYR.test(txt), `en render leaks Cyrillic: ${e.text}`);
    const r = localizeFeedEntry(f, iRu);
    assert.ok(r.text !== MISSING_TEXT && r.text !== e.text && CYR.test(r.text), `ru render: ${r.text}`);
    lines++;
  }
  assert.equal(iEn.missing.size + iRu.missing.size, 0);
  assert.ok(lines > 1000, `expected many chronicle lines, got ${lines}`);
});

test('adapter: rare engine lines that scripted seasons do not reach', () => {
  const i = createGameI18n('en'), r = createGameI18n('ru');
  const lines = [
    'Salt paid 25 silk to the shard holder, Moss.',
    'Iris keeps her word to Ash and contributes the fragment.',
    'Frost contributes a fragment.',
    'The Key did not match the commitment.',
    'Shard “How Salt traded in words” burned.',
    'Shard “Salt sold a false word (“loop” in the Power slot)” is up for auction.',
    'Amber bought the memory of how Salt deceived Iris. Now Amber distrusts them too.',
    'Moss bought your debt: Salt now owes them.',
    'Vision: Iris sees Ash’s Key — “вода помнит камень”.',
    'Vision: Iris sees 1 future sign before anyone else.',
    'The Guests speak: 2 new signs.',
    'The Guests speak: a new sign.',
  ];
  for (const text of lines) assert.equal(localizeFeedEntry({ t: 1, text }, i).text, text);
  assert.equal(localizeFeedEntry({ t: 1, text: 'The gift went to Salt, Moss, Frost.' }, i).text, 'The gift went to Salt, Moss, and Frost.');
  assert.equal(localizeFeedEntry({ t: 1, text: 'Salt paid 25 silk to the shard holder, Moss.' }, r).text, 'Соль вернул 25 шёлка владельцу осколка: Мох.');
  assert.equal(localizeFeedEntry({ t: 1, text: 'Vision: Iris sees Ash’s Key — “вода помнит камень”.' }, r).text, 'Видение: Ирис видит Ключ Пепла — «вода помнит камень».');
  assert.equal(localizeFeedEntry({ t: 1, text: 'a brand new line' }, i).text, en['log.unknown']);
  assert.equal(localizePinSource('the Guests', i), 'the Guests');
  assert.equal(localizePinSource('Salt', i), 'Salt');
  assert.equal(localizePinSource('Salt', r), 'Соль');
  assert.equal(localizeFate('bought by Amber for 12', i), 'bought by Amber for 12');
});

test('adapter: every S.fx event becomes a localized agent line with a speaker', () => {
  const types = new Set();
  for (const loc of ['en', 'ru']) {
    const i = createGameI18n(loc);
    for (const { fx } of seasons) for (const f of fx) {
      types.add(f.type);
      const line = fxToLine(f);
      assert.ok(line, `no line for fx ${f.type}`);
      const r = renderLine(line, i);
      assert.ok(r.text && r.text !== MISSING_TEXT && r.speaker !== MISSING_TEXT, `${loc}: ${f.type}`);
    }
    assert.equal(i.missing.size, 0, [...i.missing].join(', '));
  }
  for (const t of ['voice', 'event', 'anchor', 'fragment', 'dark', 'break', 'walk', 'crisis', 'memory_burned', 'end']) assert.ok(types.has(t), `seasons emitted ${t}`);
});

test('adapter: offers and memory effects render from structured fields in both languages', () => {
  for (const loc of ['en', 'ru']) {
    const i = createGameI18n(loc);
    const offers = [
      { from: 1, kind: 'sell', s: 2, f: 1, m: 3, price: 7 }, { from: 3, kind: 'loan', n: 15, back: 25, due: 7 },
      { from: 5, kind: 'gift' }, { from: 2, kind: 'pact', by: 14 }, { from: 4, kind: 'escrow', price: 45 },
    ];
    for (const o of offers) { const r = localizeOffer(o, i); assert.ok(r.text.length > 10 && r.speaker !== MISSING_TEXT); }
    for (const m of [{ kind: 'first' }, { kind: 'call' }, { kind: 'gift', about: 3 }, { kind: 'betrayal', about: 1 }, { kind: 'debt', about: 3, data: { amount: 25, due: 7 } }, { kind: 'promise', about: 2, data: { by: 14 } }]) {
      assert.ok(renderEvent(effectEvent(m), i).length > 10);
    }
    assert.equal(i.missing.size, 0);
  }
  assert.equal(localizeOffer({ from: 1, kind: 'sell', s: 2, f: 1, m: 3, price: 7 }, createGameI18n('en')).text, '“I’ll sell a word. The “spike” sign in the Power slot means “great · 80”.” Price 7.');
});

test('language switch mid-season re-renders the chronicle and never touches game state', () => {
  E.newSeason(4242, { rules: 'v2' });
  E.startGame('');
  for (let k = 0; k < 6; k++) E.endTick();
  const before = stateHash(E.S);
  const i = createGameI18n('en');
  const enLines = E.S.feed.map((f) => localizeFeedEntry(f, i).text);
  i.setLocale('ru');
  const ruLines = E.S.feed.map((f) => localizeFeedEntry(f, i).text);
  assert.equal(stateHash(E.S), before);
  assert.equal(enLines.length, ruLines.length);
  assert.equal(enLines.filter((l, k) => l !== ruLines[k]).length, enLines.length, 'every line re-rendered');
  assert.ok(enLines.some((l) => l.startsWith('— Tick')) && ruLines.some((l) => l.startsWith('— Тик')));
});


test('all five languages remain available in the game context with English fallback', () => {
  const i = createPlayI18n('en', { onMissing: () => {} });
  assert.deepEqual(i.locales, ['en', 'uk', 'ru', 'it', 'zh']);
  for (const locale of i.locales) {
    i.setLocale(locale);
    assert.equal(i.locale, locale);
    assert.equal(i.t('lobby.enter'), MESSAGES[locale]['lobby.enter']);
    for (const key of Object.keys(MESSAGES.en)) assert.notEqual(i.t(key), key);
    assert.equal(i.t('not.a.real.key'), MISSING_TEXT);
  }
  for (const locale of ['uk', 'it', 'zh']) {
    i.setLocale(locale);
    assert.notEqual(i.t('settings.note'), MISSING_TEXT); // full translations are checked in ui-i18n-locales.test.mjs
  }
});

test('the Guests\' reveal line says "matches" for a verified reveal in every locale (QA-001)', () => {
  const fx = (verified) => ({ type: 'event', place: 1, action: 0, power: 1, verified });
  for (const locale of ['en', 'uk', 'ru', 'it', 'zh']) {
    const i = createPlayI18n(locale, { onMissing: () => {} });
    const ok = renderLine(fxToLine(fx(true)), i).text, bad = renderLine(fxToLine(fx(false)), i).text;
    assert.notEqual(ok, bad, locale);
    // the world HUD dialogue strip renders through renderMsg (play/i18n.js), the path QA-001 hit
    const line = (v) => { const l = fxToLine(fx(v)); return renderMsg(i, l.key, l.args); };
    assert.equal(line(true), ok, locale);
    assert.equal(line(false), bad, locale);
    assert.equal(renderMsg(i, 'line.event', { ...fxToLine(fx(true)).args, verified: true }), ok, locale + ' raw boolean');
    assert.equal(i.missing.size, 0, locale);
  }
  const en = createPlayI18n('en', { onMissing: () => {} });
  assert.match(renderLine(fxToLine(fx(true)), en).text, /The reveal matches the root\./);
  assert.match(renderLine(fxToLine(fx(false)), en).text, /does not match/);
});
