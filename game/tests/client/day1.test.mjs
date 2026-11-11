// Day 1 flow (src/play/day1.js, boot-world wiring): every string in five locales; first visit only, never on the
// judge link unless &day1=1; K switches the skin and the choice persists; the altar timer reads "Open now".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');

test('every Day 1 string exists in all five locales; the mint states never claim a mint they did not see', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('day1.'));
  assert.ok(keys.length >= 40);
  for (const loc of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[loc][k], `${loc}:${k}`);
  assert.match(PLAY_MESSAGES.en['day1.mint.failed'], /^Unminted preview/);
  assert.match(PLAY_MESSAGES.en['day1.mint.unavailable'], /^Unminted preview/);
  assert.match(PLAY_MESSAGES.en['day1.mint.minted'], /✓$/);
  const ui = readFileSync(new URL('../../src/play/day1.js', import.meta.url), 'utf8');
  assert.match(ui, /if \(ph === 'minted'\) \{\n\s+status\.append\(doc\.createTextNode\(t\('day1\.mint\.minted'\)/, 'the checkmark only in the minted phase');
});

test('plan and wiring: first visit, not on ?demo=judge unless &day1=1, ?day1=0 skips; K toggles a persisted skin; the altar timer', () => {
  assert.match(boot, /if \(q === '0'\) return false;\n\s+if \(q === '1'\) return true;\n\s+return !judge && !loadDay1\(ctx\.storage\)\.claimed;/);
  assert.match(boot, /if \(input\.hit\('KeyK'\) && \(townOn \|\| playOn\)\) toggleSkin\(\);/);
  assert.match(boot, /day1Mint\.setRecord\(\{ skin: next \}\)/);
  assert.match(boot, /if \(loadDay1\(ctx\.storage\)\.skin === 'elise'\) applySkin\('elise'\);/, 'the skin is restored on the next visit');
  assert.match(boot, /ctx\.i18n\.t\('day1\.altar\.timer'\) \+ ' · ' \+ ctx\.i18n\.t\('day1\.altar\.open'\)/);
  assert.match(readFileSync(new URL('../../src/ui/input.js', import.meta.url), 'utf8'), /'KeyK'/);
  // the hints come in the owner's order
  const order = ['day1.hint.skin', 'day1.hint.quest', 'day1.hint.trailers', 'day1.hint.tournament'].map((k) => boot.indexOf(`key: '${k}'`));
  assert.ok(order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), order.join(','));
});
