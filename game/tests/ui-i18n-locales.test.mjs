// Full translations: uk, it and zh carry every English key of both message sets (src/locales and
// src/play/locales) as their own property, every message parses, and placeholder names match English.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES, argNames, parse, format } from '../src/ui/i18n/index.js';
import { PLAY_MESSAGES, createPlayI18n } from '../src/play/i18n.js';

const FULL = ['uk', 'it', 'zh'];
const LATIN_WORD = /\b(?:the|and|of|with|your|you|is|are|not|tick|silk|Shell|sign|memory)\b/;
const CJK = /[一-鿿]/;
const UK_LETTERS = /[іїєґ]/i;

/** Own-property keys of a locale, without the `...en` fallback spread. */
function ownKeys(locale, source) {
  // The spread copies English values; an own translation differs unless the English text is a proper
  // name, a number template or a symbol. Those are listed below and checked by hand.
  return Object.keys(source[locale]);
}

// Italian words spelled like the English ones (not untranslated copies).
const SAME_IT = new Set(['set.acc.privacy', 'set.audio.title', 'set.ctl.pad', 'set.gfx.q.auto', 'set.key.chat', 'set.key.menu', 'set.pad.zoom', 'set.tab.account', 'set.tab.audio', 'day1.elise', 'panel.pill.hire', 'ach.elise', 'day1.skin.iris', 'day1.skin.elise', 'common.demo', 'lobby.nav.clan', 'panel.clan.title', 'settings.quality.auto', 'flow.step.tutorial',
  'ctor.palette', 'line.askNo', 'wh.trial.arena', 'wh.sign.seconds', 'wh.top.menu']);
const SAME_AS_EN = new Set([
  'hub.card.offer.body', // pure placeholder: '{offer}'
  'profile.xpOf', // numbers and the unit: '{into} / {need} XP'
  'chest.out.xp', // a number and the unit: '{n} XP'
  'mp.ai', // the AI badge: the owner asked for 'AI' in zh too (12.11)
  'app.title.line1', 'app.title.line2', 'app.title.full', 'lang.en', 'lang.ru', 'lang.uk', 'lang.it', 'lang.zh',
  'lang.short.en', 'lang.short.ru', 'lang.short.uk', 'lang.short.it', 'lang.short.zh',
  'shell.0', 'shell.1', 'shell.2', 'shell.3', 'tut.readLine', 'wh.raw', 'wh.trial.wordsValue', 'wh.sign.reading',
  'wh.trial.kv', 'wh.trial.attemptsValue', 'wh.trial.progressValue', 'wh.trial.percent', 'wh.sign.statLabel',
  'wh.sign.pct', 'wh.sign.range', 'wh.dialogue.speaker', 'wh.top.logo', 'opt.keyHint', 'dialogue.title', 'vision.slot',
  'agent.iris', 'ctor.preset.iris', 'onb.look.iris', 'agent.moss', 'wh.demo.arena', 'log.tickStart', 'chapter.list.sep',
]);

for (const [name, source, en] of [['game', MESSAGES, MESSAGES.en], ['play', PLAY_MESSAGES, PLAY_MESSAGES.en]]) {
  test(`${name} strings: uk, it and zh define every English key and no others`, () => {
    for (const locale of FULL) {
      const msgs = source[locale];
      assert.ok(msgs, `${name}:${locale} exists`);
      const keys = ownKeys(locale, source);
      assert.deepEqual(Object.keys(en).filter((k) => !Object.prototype.hasOwnProperty.call(msgs, k)), [], `${locale} misses keys`);
      assert.deepEqual(keys.filter((k) => !(k in en)), [], `${locale} has keys English lacks`);
    }
  });

  test(`${name} strings: every uk/it/zh message parses and uses exactly the English placeholders`, () => {
    for (const locale of FULL) for (const [k, enMsg] of Object.entries(en)) {
      const msg = source[locale][k];
      assert.equal(typeof msg, 'string', `${locale}:${k}`);
      assert.doesNotThrow(() => parse(msg), `${locale}:${k} does not parse`);
      const want = [...argNames(enMsg)].sort(), got = [...argNames(msg)].sort();
      assert.deepEqual(got, want, `${locale}:${k} placeholders`);
    }
  });

  test(`${name} strings: uk/it/zh texts are translated, not English copies`, () => {
    const copies = [];
    for (const locale of FULL) for (const [k, enMsg] of Object.entries(en)) {
      if (SAME_AS_EN.has(k) || (locale === 'it' && SAME_IT.has(k))) continue;
      const msg = source[locale][k];
      if (msg === enMsg) copies.push(`${locale}:${k}`);
      if (locale === 'zh' && !CJK.test(msg) && /[A-Za-z]{3,}/.test(msg.replace(/<[^>]+>|\{[^}]*\}/g, ''))) copies.push(`${locale}:${k} has no CJK`);
    }
    assert.deepEqual(copies, []);
  });
}

test('plural categories: uk uses one/few/many, it one/other, zh other only, and they render', () => {
  const uk = createPlayI18n('uk', { onMissing: () => {} }), it = createPlayI18n('it', { onMissing: () => {} }), zh = createPlayI18n('zh', { onMissing: () => {} });
  assert.deepEqual([1, 2, 5, 21].map((n) => uk.t('tour.entrants', { n })), ['1 учасник', '2 учасники', '5 учасників', '21 учасник']);
  assert.deepEqual([1, 2].map((n) => it.t('tour.entrants', { n })), ['1 partecipante', '2 partecipanti']);
  assert.deepEqual([1, 2].map((n) => zh.t('tour.entrants', { n })), ['1 位参赛者', '2 位参赛者']);
  for (const i18n of [uk, it, zh]) {
    for (const n of [0, 1, 2, 5]) assert.ok(i18n.t('insp.glass', { count: n }).length > 3);
    assert.equal(i18n.missing.size, 0, [...i18n.missing].join(', '));
  }
  // The ICU subset supports every category the three locales need.
  for (const [loc, cats] of [['uk', ['one', 'few', 'many', 'other']], ['it', ['one', 'other']], ['zh', ['other']]]) {
    const msg = '{n, plural, ' + cats.map((c) => `${c} {${c}}`).join(' ') + '}';
    assert.ok(cats.includes(format(msg, { n: 1 }, loc)), loc);
  }
});

test('never translated: hashes, proof bytes and secret phrases stay verbatim placeholders; the title stays', () => {
  for (const locale of FULL) {
    const m = MESSAGES[locale];
    assert.ok(m['log.keyCommitted'].includes('{hash}') && m['log.visionAshKey'].includes('{phrase}') && m['log.keySpoken'].includes('{phrase}'), locale);
    assert.equal(m['app.title.full'], 'Forget to Foresee');
    assert.equal(m['wh.top.logo'], 'Forget to Foresee');
  }
  assert.ok(UK_LETTERS.test(Object.values(MESSAGES.uk).join('')), 'Ukrainian uses its own letters');
  assert.ok(!LATIN_WORD.test(MESSAGES.uk['settings.note']) && !LATIN_WORD.test(MESSAGES.it['settings.note']), 'settings.note translated');
});

test('every locale renders every game key through the play context without a missing-key hit', () => {
  const args = { who: 'X', n: 1, total: 7, tick: 3, ticks: 17, shell: 'II', prize: 30, deadline: 16, confidence: 25, count: 2, outcome: 'gift', fragment: 'held', link: 'speaking', offer: 'o', price: 1, a: 'A', b: 'B', amount: 3, closes: 4, title: 't', inScroll: 1, revealed: 0, open: 1, have: 1, need: 8, tension: 50, slot: 's', meaning: 'm', list: 'l', reason: 'r', index: 1, name: 'N', mode: 'm', max: 3, hash: 'h', phrase: 'p', form: 'f', power: 20, leaf: 1, verified: 'yes', debtor: 'D', holder: 'H', victim: 'V', other: 'O', to: 'T', back: 5, time: 't', week: 1, year: 2026, id: 'i', letter: 'A', d: 1, h: 2, m: 3, phase: 'p', pct: 50, place: 'P', action: 'A', trial: 1, band: 'likely', label: 'L', value: 'V', done: 1, from: 1, tiers: 't', key: 'E', text: 'T', slots: 's', d2: 0 };
  for (const locale of FULL) {
    const missing = [];
    const i18n = createPlayI18n(locale, { onMissing: (k) => missing.push(k) });
    for (const k of [...Object.keys(MESSAGES.en), ...Object.keys(PLAY_MESSAGES.en)]) {
      const out = i18n.t(k, args);
      assert.ok(out !== '…' && out !== k, `${locale}:${k}`);
    }
    assert.deepEqual(missing, [], locale);
  }
});
