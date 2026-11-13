// The Gate-Loom fee is 200 silk (EXPEDITION.PORTAL_FEE_C = ftf-town gate_price). The old 10,000 silk figure must never
// come back into player-visible text: the five play locales and the README. Other 10,000 figures (the chest deck) are fine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXPEDITION } from '../../src/game/expedition-config.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

const ROOT = new URL('../../../', import.meta.url);
const STALE = /10[,.   ]?000\s*(town\s+)?(silk|seta|шёлка|шелка|шовку|丝)/i;

test('gate fee copy: no "10,000 silk" in any play locale or the README', () => {
  assert.equal(EXPEDITION.PORTAL_FEE_C, 20_000);
  for (const [loc, msgs] of Object.entries(PLAY_MESSAGES)) {
    for (const [k, v] of Object.entries(msgs)) assert.doesNotMatch(String(v), STALE, `${loc} ${k}`);
  }
  const readme = readFileSync(new URL('README.md', ROOT), 'utf8');
  assert.doesNotMatch(readme, STALE, 'README.md');
});

test('gate fee copy: pass.err.eligible takes the fee from a {fee} placeholder in all five locales', () => {
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) {
    const s = PLAY_MESSAGES[loc] && PLAY_MESSAGES[loc]['pass.err.eligible'];
    assert.ok(s && s.includes('{fee}') && s.includes('{earned}'), loc);
  }
});
