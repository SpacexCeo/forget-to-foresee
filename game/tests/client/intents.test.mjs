// Scripted townsfolk dialogue (src/game/intents.js): typed phrases in the five languages map to intents, replies use
// the agent's real state, every key exists in all locales. No language model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchIntent, replyFor, normalize, INTENTS, TOPICS, PLACES } from '../../src/game/intents.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

const lexFor = (loc) => (k) => (PLAY_MESSAGES[loc][k] || '') + '|' + (PLAY_MESSAGES.en[k] || '');

test('phrases map to intents in each language (and English words always work)', () => {
  const cases = {
    en: [['Hello there!', 'greet'], ['Can I hire you?', 'hire'], ['How are your results?', 'status'], ['What was your last trade?', 'trade'], ['What is silk?', 'explain'], ['Where is the inn?', 'where'], ['bye', 'bye'], ['zzz qqq', 'unknown']],
    ru: [['Привет!', 'greet'], ['Хочу нанять тебя', 'hire'], ['Как дела?', 'status'], ['Где алтарь?', 'where'], ['Что такое шёлк?', 'explain'], ['пока', 'bye']],
    uk: [['Привіт', 'greet'], ['Де шинок?', 'where'], ['Що таке осколок?', 'explain']],
    it: [['Ciao!', 'greet'], ['Dove si trova la locanda?', 'where'], ['Cosè la seta?', 'explain']],
    zh: [['你好', 'greet'], ['旅店在哪', 'where'], ['什么是碎片', 'explain'], ['hire', 'hire']],
  };
  for (const [loc, list] of Object.entries(cases)) for (const [text, intent] of list) assert.equal(matchIntent(text, lexFor(loc)).intent, intent, `${loc}: ${text}`);
  assert.equal(matchIntent('Where is the inn?', lexFor('en')).topic, 'inn');
  assert.equal(matchIntent('Что такое шёлк?', lexFor('ru')).topic, 'silk');
  assert.equal(normalize('  Ёлка, ЁЖ!! '), 'елка еж');
});

test('replies use the agent state: novice vs measured return, the last trade, the price', () => {
  assert.equal(replyFor({ intent: 'status' }, { agent: { measured: null, recent: [], experience: 0, price: 10 } }).key, 'chat.status.novice');
  const good = replyFor({ intent: 'status' }, { agent: { measured: 1.012, recent: [1, 1], experience: 20, price: 10 } });
  assert.equal(good.key, 'chat.status.good'); assert.equal(good.args.pct, '101.2');
  assert.equal(replyFor({ intent: 'status' }, { agent: { measured: 0.95, recent: [1], experience: 5, price: 10 } }).key, 'chat.status.bad');
  assert.equal(replyFor({ intent: 'trade' }, {}).key, 'chat.trade.none');
  assert.equal(replyFor({ intent: 'trade' }, { lastTrade: { echo: 'salt', side: 'buy', result: 12, reason: 'fade' } }).args.result, '+0.12');
  assert.equal(replyFor({ intent: 'hire' }, { agent: { price: 12 } }).args.price, 12);
  assert.equal(replyFor({ intent: 'explain', topic: 'seal' }).key, 'gloss.seal.def');
});

test('every reply and lexicon key exists in all five locales', () => {
  const keys = [...INTENTS.map((i) => 'chat.lex.' + i), ...TOPICS.map((t) => 'chat.lex.topic.' + t), ...PLACES.map((p) => 'chat.lex.place.' + p), ...PLACES.map((p) => 'chat.where.' + p), ...TOPICS.map((t) => 'gloss.' + t + '.def'),
    'chat.greet', 'chat.hire', 'chat.status.good', 'chat.status.bad', 'chat.status.novice', 'chat.trade', 'chat.trade.none', 'chat.bye', 'chat.help', 'chat.unknown', 'chat.placeholder', 'chat.send'];
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[loc][k], `${loc}:${k}`);
});
