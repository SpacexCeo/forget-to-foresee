// Foresight Exchange UI (docs/agent-market-plan.md §8.3): the disclaimer in every locale, no forbidden words, the
// judge window is the 4-bar short drill, opening the terminal never starts a drill by itself, ?demo=judge without
// exchange=1 never opens it, and Memories keeps its own content with the drill as an extra button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { i18n as uiI18n } from '../../src/ui/index.js';
const { MESSAGES } = uiI18n;
import { JUDGE_WINDOW, DEFAULT_WINDOW } from '../../src/net/exchange-deployment.js';
import { BAR_SECONDS, EXCHANGE_STORAGE_KEY } from '../../src/ui/exchange-terminal.js';

const src = (f) => readFileSync(new URL('../../src/' + f, import.meta.url), 'utf8');

test('copy: every exch.* key in all five locales; the disclaimer says no real money, no prizes, not financial advice', () => {
  const keys = Object.keys(MESSAGES.en).filter((k) => k.startsWith('exch.'));
  assert.ok(keys.length >= 30);
  for (const loc of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(MESSAGES[loc][k], `${loc}:${k}`);
  assert.match(MESSAGES.en['exch.disclaimer'], /No real money/);
  assert.match(MESSAGES.en['exch.disclaimer'], /Not financial advice/);
  assert.match(MESSAGES.en['exch.disclaimer'], /no prizes/);
  const en = keys.map((k) => MESSAGES.en[k]).join(' ');
  assert.doesNotMatch(en, /\b(wallet|invest|profit|APY|brokerage|withdraw(?!n)|mainnet|minted)\b/i);
});

test('windows: the judge drill is 4 bars (~40 s), the full drill 8 bars (~90 s), results stored under ftf.exchange.v1', () => {
  assert.equal(JUDGE_WINDOW.barCount, 4);
  assert.equal(DEFAULT_WINDOW.barCount, 8);
  assert.ok(Math.abs(JUDGE_WINDOW.barCount * BAR_SECONDS.short - 40) <= 5);
  assert.ok(Math.abs(DEFAULT_WINDOW.barCount * BAR_SECONDS.full - 90) <= 5);
  assert.equal(EXCHANGE_STORAGE_KEY, 'ftf.exchange.v1');
});

test('no auto-start: opening the terminal sends no command; only the Start buttons send start_exchange', () => {
  const s = src('ui/exchange-terminal.js');
  const startCalls = s.match(/send\('start_exchange'/g) || [];
  assert.equal(startCalls.length, 1, 'one place starts a drill');
  assert.match(s, /function start\(\)/);
  assert.match(s, /btn\(t\('exch\.startShort'\), \(\) => \{ mode = 'short'; start\(\); \}/);
  assert.doesNotMatch(s.slice(s.lastIndexOf('render();')), /start\(\)/, 'opening only renders');
  assert.doesNotMatch(s, /fetch\(/, 'no network in the drill');
});

test('judge path: the terminal opens after the shard beat only with exchange=1; Memories keeps its content plus one button', () => {
  const w = src('play/world-hud.js');
  assert.match(w, /exchangeShort = \/\[\?&\]exchange=1/);
  assert.match(w, /if \(exchangeShort\) setTimeout\(openExchange/);
  const ui = src('play/ui.js');
  assert.match(ui, /list, forgotten, shardSection\(obs\),\n\s+exchangeOpener \?/, 'the memory list, the forgotten list and the shard cards stay first');
});
