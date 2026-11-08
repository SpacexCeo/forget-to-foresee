// QA-022 (found by Task K, game/tests/e2e/engine-text.e2e.mjs on claude/qa): every engine log line of a rules-v3 season is translatable.
// Pure node: simulated seasons through the sim harness, the adapter's own parser. No browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSeason } from '../scripts/sim/lib/season.mjs';
import * as strat from '../scripts/sim/lib/strategies.mjs';
import { parseLogText, parseMemoryText, parseShardTitle } from '../src/ui/i18n/engine-adapter.js';
import * as E from '../src/game/engine.js';

test('QA-022 no v3 log line falls back to "Something happened that this build cannot describe yet."', () => {
  const unknown = new Map();
  const strategies = Object.entries(strat).filter(([, v]) => v && typeof v === 'object' && v.name);
  let seasons = 0;
  for (let seed = 1; seed <= 20; seed++) for (const [, s] of strategies) {
    try { runSeason(seed, s, { rules: 'v3' }); } catch { continue; }
    seasons++;
    for (const f of E.S.feed) if (!parseLogText(f.text)) { const k = f.text.replace(/\d+/g, '#'); unknown.set(k, (unknown.get(k) || 0) + 1); }
    for (const m of E.S.mem) if (!parseMemoryText(m.title || m.text || '')) unknown.set('memory: ' + (m.title || m.text), 1);
  }
  assert.ok(seasons > 50, 'seasons simulated: ' + seasons);
  assert.deepEqual([...unknown.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n}× ${k}`), []);
});
