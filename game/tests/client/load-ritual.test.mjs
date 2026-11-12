// The loading ritual (src/ui/load-ritual.js, a reference game teardown M4): the line rotation with the controls hint, the
// warmth mapping, five languages with an English fallback, and no number or value claim in the lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineAt, warmth, langOf, TIPS, HINTS, TIP_MS } from '../../src/ui/load-ritual.js';

test('ritual: a line every 4 s, the controls hint every fourth turn (touch or keys)', () => {
  assert.equal(lineAt(0), TIPS.en[0]);
  assert.equal(lineAt(TIP_MS - 1), TIPS.en[0]);
  assert.equal(lineAt(TIP_MS), TIPS.en[1]);
  assert.equal(lineAt(3 * TIP_MS), HINTS.en.keys);
  assert.equal(lineAt(3 * TIP_MS, { touch: true }), HINTS.en.touch);
  assert.equal(lineAt(4 * TIP_MS), TIPS.en[3]);
  const seen = new Set(); for (let i = 0; i < 40; i++) seen.add(lineAt(i * TIP_MS));
  for (const tip of TIPS.en) assert.ok(seen.has(tip), 'every line comes round: ' + tip);
});

test('ritual: warmth from dormant to lit', () => {
  assert.deepEqual(warmth(0), { opacity: 0.25, glow: 0 });
  assert.deepEqual(warmth(1), { opacity: 1, glow: 18 });
  assert.deepEqual(warmth(5), warmth(1)); assert.deepEqual(warmth(-1), warmth(0)); assert.deepEqual(warmth('x'), warmth(0));
});

test('ritual: five languages, the same number of lines, English fallback; no numbers, no value words', () => {
  for (const l of ['ru', 'uk', 'it', 'zh']) { assert.equal(TIPS[l].length, TIPS.en.length, l); assert.ok(HINTS[l].touch && HINTS[l].keys); }
  assert.equal(langOf('ru-RU'), 'ru'); assert.equal(langOf('de'), 'en'); assert.equal(langOf(undefined), 'en');
  const all = Object.values(TIPS).flat().join(' ');
  assert.doesNotMatch(all, /\d/, 'no counter is ever made up');
  assert.doesNotMatch(TIPS.en.join(' '), /\b(invest|yield|profit|return|guaranteed|price|airdrop|reward)\b/i);
});
