// The Profile tab to the owner's reference (src/play/profile-view.js): real data from the town ledger, honest empty
// states when there is none, the trade tabs switch, all labels in five locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { createTownLedger } from '../../src/game/town-economy.js';
import { memoryStorage } from '../../src/ui/storage.js';
import { PLAY_MESSAGES, createPlayI18n } from '../../src/play/i18n.js';
import { profileModel } from '../../src/play/profile-view.js';

const texts = (n, out = []) => { if (!n) return out; if (n.textContent && !(n.childNodes && n.childNodes.length)) out.push(n.textContent); for (const c of n.childNodes || n.children || []) texts(c, out); return out; };

test('a new player: level 1, starting silk, every empty state', async () => {
  const { doc } = installDom();
  const { renderProfileView } = await import('../../src/play/profile-view.js');
  const ledger = createTownLedger({ storage: memoryStorage() });
  const m = profileModel(ledger);
  assert.equal(m.level, 1); assert.equal(m.hasHistory, false); assert.equal(m.best, null); assert.equal(m.open.length, 0);
  const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
  const [root] = renderProfileView({ doc, t, ledger, base: '/' });
  const all = texts(root).join(' | ');
  for (const s of ['Your story begins', 'Level 1', 'Newcomer', 'Titles are cosmetic only', 'Stored in this browser', 'No real money', (ledger.silk / 100).toFixed(2),
    'Your history starts here', 'No activity', 'No rounds yet', 'No open trades', 'Best agent']) assert.ok(all.includes(s), s);
  assert.doesNotMatch(all, /profile\.|\{|\}/, 'no raw keys or placeholders');
});

test('with an agent run: the chart, the tiles and the trade log fill in', async () => {
  const { doc } = installDom();
  const { renderProfileView } = await import('../../src/play/profile-view.js');
  const ledger = createTownLedger({ storage: memoryStorage() });
  const fake = Object.create(ledger);
  Object.defineProperties(fake, {
    equity: { get: () => [10000, 10120, 10080, 10300] },
    stats: { get: () => ({ ...ledger.stats, net: 300, rounds: 6, wins: 4, agentsHired: 1 }) },
  });
  fake.agentsKnown = () => ['baker'];
  fake.results = () => [{ net: 300 }];
  fake.hires = () => [];
  fake.log = () => [{ at: 0, npc: 'baker', echo: 'calm', side: 'buy', size: 1, entry: 100, exit: 103, result: 300, reason: 'rule' }];
  const m = profileModel(fake);
  assert.equal(m.hasHistory, true); assert.deepEqual(m.best, { npc: 'baker', net: 300 });
  const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
  const [root] = renderProfileView({ doc, t, ledger: fake, base: '/' });
  const all = texts(root).join(' | ');
  assert.ok(all.includes('+3.00')); assert.ok(all.includes('6 rounds')); assert.ok(all.includes('4 points'));
  const logBtn = root.querySelector('[data-pv-tab="log"]');
  logBtn.click();
  assert.ok(texts(root).join(' | ').includes('Baker'), 'the trade log lists the trade');
});

test('profile labels in five locales', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => /^profile\.(story|level|progressTo|xpOf|silk\.|tile\.|chart\.|trades\.)/.test(k));
  assert.ok(keys.length >= 20);
  for (const loc of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[loc][k], `${loc} ${k}`);
});
