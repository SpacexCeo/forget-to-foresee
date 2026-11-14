// The Tournament opens after ten stone spiders (owner 14.11): the gate counts the town ledger's spider kills, the altar
// prompt shows "Tournament: stone spiders 3/10" until then, registering and the Tournament window are refused with the
// same progress, the judge path is never gated; five locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tourneyGate, TOURNEY_SPIDERS } from '../../src/game/tourney-gate.js';
import { createTownLedger } from '../../src/game/town-economy.js';
import { memoryStorage } from '../../src/ui/storage.js';
import { PLAY_MESSAGES, createPlayI18n } from '../../src/play/i18n.js';

test('the gate: closed with the progress until ten stone spiders; the judge path is open; other monsters do not count', () => {
  assert.equal(TOURNEY_SPIDERS, 10);
  assert.deepEqual(tourneyGate({}), { open: false, n: 0, need: 10 });
  assert.deepEqual(tourneyGate({ spidersKilled: 3 }), { open: false, n: 3, need: 10 });
  assert.deepEqual(tourneyGate({ spidersKilled: 14 }), { open: true, n: 10, need: 10 });
  assert.equal(tourneyGate({ spidersKilled: 0 }, { judge: true }).open, true);
  const ledger = createTownLedger({ storage: memoryStorage() });
  for (let i = 0; i < 9; i++) ledger.killMob('skitter');
  ledger.killMob('hulker'); ledger.killMob('veilbell');
  assert.deepEqual(tourneyGate(ledger.stats), { open: false, n: 9, need: 10 }, 'only stone spiders count');
  ledger.killMob('skitter');
  assert.equal(tourneyGate(ledger.stats).open, true);
});

test('wiring: the altar prompt shows the progress, registering and the Tournament window wait for the spiders; five locales', () => {
  const flow = readFileSync(new URL('../../src/scenes/town-flow.js', import.meta.url), 'utf8');
  assert.match(flow, /i18n\.t\('town\.altar\.locked', \{ n: g\.n, need: g\.need \}\)/);
  assert.match(flow, /if \(g && !g\.open\) \{ if \(onTourneyLocked\) onTourneyLocked\(g\); return Promise\.resolve\(false\); \}/);
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(boot, /tourney: \(\) => tourneyGate\(townLedger\.stats/);
  const open = boot.slice(boot.indexOf("window.addEventListener('ftf:tournament-open'"), boot.indexOf("window.addEventListener('ftf:tournament-open'") + 400);
  assert.match(open, /tourneyGate\(townLedger\.stats, \{ judge: judge \|\| params\.get\('judge'\) === '1' \}\); if \(!g\.open\)/);
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) {
    const i18n = createPlayI18n(loc, { onMissing: () => assert.fail(loc) });
    assert.match(i18n.t('town.altar.locked', { n: 3, need: 10 }), /3\/10/, loc);
    assert.match(i18n.t('town.altar.lockedToast', { n: 3, need: 10 }), /3\/10/, loc);
    assert.ok(PLAY_MESSAGES[loc]['town.altar.locked']);
  }
});
