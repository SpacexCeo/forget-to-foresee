// Every line a character says is translated (owner 14.11: the Elder's wake-up line showed in English in Ukrainian): the
// wake-up dialogue, crowd and town barks, quest-giver talk, tales, and the rest of the play strings exist in ru, uk, it
// and zh, and no spoken line is a copy of the English. English stays primary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

const LOCALES = ['ru', 'uk', 'it', 'zh'];
const SPOKEN = /^(npe\.w\d+|npe\.bark\.|npc\.talk\.|bark\.|tale\.|quest\.talk\.|folk\.line\.|day1\.trailer\.)/;

test('every English play string has its ru, uk, it and zh version', () => {
  const en = PLAY_MESSAGES.en;
  for (const loc of LOCALES) {
    const missing = Object.keys(en).filter((k) => !(k in PLAY_MESSAGES[loc]));
    assert.deepEqual(missing, [], `${loc} misses ${missing.length}: ${missing.slice(0, 8).join(', ')}`);
  }
});

test('no spoken line is left in English, and the placeholders survive the translation', () => {
  const en = PLAY_MESSAGES.en;
  const spoken = Object.keys(en).filter((k) => SPOKEN.test(k) && typeof en[k] === 'string' && /[a-z]{3,}/i.test(en[k]));
  assert.ok(spoken.length > 60, 'the dialogue keys are found');
  for (const loc of LOCALES) for (const k of spoken) {
    const v = PLAY_MESSAGES[loc][k];
    assert.notEqual(v, en[k], `${loc} ${k} is still English`);
    for (const ph of en[k].match(/\{(fee|n|of|name|score|model|end|total)\}/g) || []) assert.ok(v.includes(ph), `${loc} ${k} keeps ${ph}`);
  }
});
