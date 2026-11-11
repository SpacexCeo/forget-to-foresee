// Share postcard (src/ui/postcard.js): 1200×630, text wrapping, the X text carries the hackathon tags and no claims,
// drawn on demand only (no frame loop, no WebGL read-back), strings in five locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POSTCARD_W, POSTCARD_H, wrapLines, postcardText } from '../../src/ui/postcard.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

test('size and wrapping: 1200×630 (the X/OG card), lines fit the width, overflow ends with an ellipsis', () => {
  assert.deepEqual([POSTCARD_W, POSTCARD_H], [1200, 630]);
  const measure = (s) => s.length * 10;
  const lines = wrapLines('Iris forgot a call memory of weight 2 at trial 4. Frost bought the shard for 13 silk at the trial-6 auction.', 300, measure);
  assert.ok(lines.length > 1 && lines.every((l) => measure(l) <= 300));
  const capped = wrapLines('word '.repeat(200), 100, measure, 3);
  assert.equal(capped.length, 3);
  assert.match(capped[2], /…$/);
});

test('X text: the line, the link, built at NEAR HACKATHON, @NEARProtocol, #NEARHackathon; no wallet or prize claims', () => {
  const s = postcardText({ line: 'Iris forgot a call memory.', link: 'https://spacexceo.github.io/forget-to-foresee/' });
  for (const must of ['Iris forgot a call memory.', 'https://spacexceo.github.io/forget-to-foresee/', 'built at NEAR HACKATHON', '@NEARProtocol', '#NEARHackathon']) assert.ok(s.toLowerCase().includes(must.toLowerCase()), must);
  assert.doesNotMatch(s, /wallet|prize|invest|player-owned|minted/i);
});

test('on demand only: no frame loop and no WebGL read-back in the postcard module', () => {
  const src = readFileSync(new URL('../../src/ui/postcard.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /requestAnimationFrame|readPixels|getContext\('webgl|preserveDrawingBuffer/);
  assert.match(src, /getContext\('2d'\)/);
});

test('postcard strings exist in all five locales', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('postcard.'));
  assert.ok(keys.length >= 10);
  for (const loc of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[loc][k], `${loc}:${k}`);
});
