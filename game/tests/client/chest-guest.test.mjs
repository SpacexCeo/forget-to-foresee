// The chest bag without a Day-1 guest (owner, 12.11): one line above the grid with the free-account button, the Open
// buttons greyed and no per-card text; once the guest exists the buttons enable and Open 5 / Open all appear. Five locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { createTownLedger } from '../../src/game/town-economy.js';
import { memoryStorage } from '../../src/ui/storage.js';
import { createChestBag } from '../../src/game/chests.js';
import { PLAY_MESSAGES, createPlayI18n } from '../../src/play/i18n.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const texts = (root, sel) => root.querySelectorAll(sel).map((e) => e.textContent);

test('chest bag: no guest -> one banner + create button, Open disabled; after create -> Open enabled, Open 5 / all', async () => {
  const { doc } = installDom();
  const { openGameMenu } = await import('../../src/play/game-menu.js');
  const storage = memoryStorage();
  const bag = createChestBag({ storage });
  for (let i = 0; i < 7; i++) bag.add({ tier: 'common' });
  const t = (k, a) => createPlayI18n('en').t(k, a);
  let calls = 0;
  const chestClient = { available: true, openMany: async () => ({}) };
  const m = openGameMenu({ doc, t, ledger: createTownLedger({ storage }), storage, chests: bag, chestClient, tab: 'inventory', manifest: Promise.resolve([]), onChain: Promise.resolve({ state: 'loaded', items: [] }), base: '/',
    createGuest: async () => { calls++; return { account: 'ann.guests.ftf-coordinator.testnet' }; } });
  await tick();
  const box = () => doc.querySelector('.gm-chests');
  assert.equal(box().querySelectorAll('.gm-guest').length, 1, 'one banner');
  assert.ok(texts(box(), '.gm-guest p')[0].includes('no wallet, no gas'));
  const opens = () => box().querySelectorAll('.gm-card button');
  assert.equal(opens().length, 7);
  assert.ok(opens().every((b) => b.disabled), 'Open greyed without a guest');
  assert.ok(!texts(box(), '.gm-card small').some((s) => /Day-1/.test(s)), 'no per-card guest text');
  assert.ok(!texts(box(), 'button').some((s) => /Open 5/.test(s)), 'no batch row yet');
  const create = box().querySelector('.gm-guest button');
  assert.equal(create.textContent, PLAY_MESSAGES.en['chest.guest.create']);
  create.click(); await tick(); await tick();
  assert.equal(calls, 1);
  assert.equal(m.tab, 'inventory');
  assert.equal(box().querySelectorAll('.gm-guest').length, 0, 'banner gone');
  assert.ok(opens().every((b) => !b.disabled), 'Open enabled');
  assert.ok(texts(box(), 'button').some((s) => s === t('chest.batch.open', { n: 5 })), 'Open 5');
  assert.ok(texts(box(), 'button').some((s) => s === t('chest.batch.all', { n: 7 })), 'Open all');
});

test('chest bag: a failed create keeps the banner and says so; not_configured says free accounts are off', async () => {
  for (const [error, key] of [['relayer_500', 'chest.guest.failed'], ['not_configured', 'chest.guest.off']]) {
    const { doc } = installDom();
    const { openGameMenu } = await import('../../src/play/game-menu.js');
    const storage = memoryStorage(); const bag = createChestBag({ storage }); bag.add({});
    const t = (k, a) => createPlayI18n('en').t(k, a);
    openGameMenu({ doc, t, ledger: createTownLedger({ storage }), storage, chests: bag, chestClient: { available: true }, tab: 'inventory', manifest: Promise.resolve([]), onChain: Promise.resolve({ state: 'loaded', items: [] }), base: '/', createGuest: async () => ({ error }) });
    await tick();
    doc.querySelector('.gm-guest button').click(); await tick(); await tick();
    assert.equal(doc.querySelectorAll('.gm-guest').length, 1);
    assert.ok(texts(doc, '.gm-guest small').includes(PLAY_MESSAGES.en[key]), error);
    assert.ok(doc.querySelector('.gm-card button').disabled);
  }
});

test('chest.guest.* copy: five locales, translated, the old per-card key is gone', () => {
  for (const k of ['line', 'create', 'making', 'failed', 'off']) for (const lang of ['en', 'ru', 'uk', 'it', 'zh']) {
    assert.ok(PLAY_MESSAGES[lang]['chest.guest.' + k], `${lang}:${k}`);
    if (lang !== 'en') assert.notEqual(PLAY_MESSAGES[lang]['chest.guest.' + k], PLAY_MESSAGES.en['chest.guest.' + k]);
  }
  for (const lang of ['en', 'ru', 'uk', 'it', 'zh']) assert.equal(PLAY_MESSAGES[lang]['chest.needGuest'], undefined);
});
