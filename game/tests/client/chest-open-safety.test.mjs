// Chest Open 1-10 safety (owner 14.11, docs/chests.md "Batch opening"): one opening at a time in the page, so a double
// click or Open during a batch never sends a second chain opening; a chest is settled the moment the service answers
// (before any animation), never on a failure; Open 10 and Open all (batches of ten, one after another, stopping at a cut
// or an error); the chests a failed request asked for all stay sealed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { memoryStorage } from '../../src/ui/storage.js';
import { createChestBag, beginChestOpen, endChestOpen, chestOpenBusy, openChoices, CHEST_LOCK_MS } from '../../src/game/chests.js';
import { createTownLedger } from '../../src/game/town-economy.js';
import { createPlayI18n } from '../../src/play/i18n.js';

const tick = (n = 2) => new Promise((r) => { let k = n; const go = () => (--k <= 0 ? r() : setTimeout(go, 0)); setTimeout(go, 0); });
const opening = (i) => ({ index: i, position: 500 + i, outcome: { kind: 'silk', id: null, amount: 5, rarity: 'common' }, verification: { verified: true }, tx: 'TX' + i, nft: null, proof: null });

test('the lock: one opening at a time; released by the answer; a lost request frees it after CHEST_LOCK_MS', () => {
  endChestOpen();
  assert.equal(beginChestOpen(1000), true); assert.equal(chestOpenBusy(1000), true);
  assert.equal(beginChestOpen(1001), false, 'a second click while the first runs');
  endChestOpen(); assert.equal(chestOpenBusy(), false); assert.equal(beginChestOpen(2000), true);
  assert.equal(beginChestOpen(2000 + CHEST_LOCK_MS + 1), true, 'never stuck for good');
  endChestOpen();
});

test('the batch buttons: none for one chest, Open n up to ten, Open all only above ten', () => {
  assert.deepEqual(openChoices(1), []);
  assert.deepEqual(openChoices(7), [{ key: 'chest.batch.open', n: 7, all: false }]);
  assert.deepEqual(openChoices(10), [{ key: 'chest.batch.open', n: 10, all: false }]);
  assert.deepEqual(openChoices(23), [{ key: 'chest.batch.open', n: 10, all: false }, { key: 'chest.batch.all', n: 23, all: true }]);
});

function menuWith({ sealed = 3, client }) {
  const { doc } = installDom();
  const storage = memoryStorage(); const bag = createChestBag({ storage });
  for (let i = 0; i < sealed; i++) bag.add({ tier: 'common' });
  const t = (k, a) => createPlayI18n('en').t(k, a);
  return import('../../src/play/game-menu.js').then(({ openGameMenu }) => {
    const m = openGameMenu({ doc, t, ledger: createTownLedger({ storage }), storage, chests: bag, chestClient: client, owner: 'ann.guests.ftf-coordinator.testnet', tab: 'inventory', manifest: Promise.resolve([]), onChain: Promise.resolve({ state: 'loaded', items: [] }), base: '/' });
    return { doc, m, bag, t };
  });
}

test('a double click on Open sends one request; the chest is paid and settled at the answer, before the reveal ends', async () => {
  endChestOpen();
  let calls = 0, answer;
  const client = { available: true, open: () => { calls++; return new Promise((r) => { answer = r; }); }, openMany: async () => ({ ok: false, error: 'off' }) };
  const { doc, m, bag } = await menuWith({ sealed: 2, client });
  await tick();
  const first = doc.querySelector('.gm-card button');
  first.click(); first.click(); await tick(4);
  assert.equal(calls, 1, 'one request for two clicks');
  doc.querySelectorAll('.gm-card button')[1] && doc.querySelectorAll('.gm-card button')[1].click(); await tick(3);
  assert.equal(calls, 1, 'another chest waits while one opens');
  answer({ ok: true, opening: opening(1) }); await tick(4);
  assert.equal(bag.sealed().length, 1, 'settled at the answer, the reveal still running');
  assert.equal(bag.opened()[0].opening.tx, 'TX1');
  assert.equal(chestOpenBusy(), false, 'the lock is released by the answer');
  m.close();
});

test('a failed request leaves every chest it asked for sealed and frees the lock', async () => {
  endChestOpen();
  const client = { available: true, open: async () => ({ ok: false, error: 'network' }), openMany: async () => ({ ok: false, error: 'tx_failed' }) };
  const { doc, m, bag, t } = await menuWith({ sealed: 4, client });
  await tick();
  doc.querySelector('.gm-card button').click(); await tick(5);
  assert.equal(bag.sealed().length, 4); assert.equal(chestOpenBusy(), false);
  const batch = [...doc.querySelectorAll('.gm-chests button')].find((b) => b.textContent === t('chest.batch.open', { n: 4 }));
  batch.click(); await tick(5);
  assert.equal(bag.sealed().length, 4, 'a refused batch opens nothing'); assert.equal(chestOpenBusy(), false);
  for (const b of doc.querySelectorAll('.cb button, .co button')) b.click();
  m.close();
});

test('Open all: batches of ten, one after another as each is claimed; a cut stops it; nothing is opened twice', async () => {
  endChestOpen();
  const asked = [];
  let n = 0;
  const client = { available: true, open: async () => ({ ok: false, error: 'off' }),
    openMany: async (k) => { asked.push(k); const ops = Array.from({ length: k }, () => opening(++n)); return { ok: true, openings: ops, cut: null, batch: true }; } };
  const { doc, m, bag, t } = await menuWith({ sealed: 23, client });
  await tick();
  const all = [...doc.querySelectorAll('.gm-chests button')].find((b) => b.textContent === t('chest.batch.all', { n: 23 }));
  assert.ok(all, 'Open all (23)');
  all.click(); await tick(6);
  assert.deepEqual(asked, [10]); assert.equal(bag.sealed().length, 13);
  const claim = () => { const b = [...doc.querySelectorAll('.cb button')].find((x) => x.textContent === t('chest.batch.claim') || x.textContent === t('chest.batch.skipBtn')); if (b) b.click(); };
  claim(); await tick(2); claim(); await tick(6);
  assert.deepEqual(asked, [10, 10]); assert.equal(bag.sealed().length, 3);
  claim(); await tick(2); claim(); await tick(6);
  assert.deepEqual(asked, [10, 10, 3]); assert.equal(bag.sealed().length, 0);
  assert.equal(new Set(bag.opened().map((c) => c.opening.tx)).size, 23, 'each chest settled once, by its own opening');
  claim(); await tick(2); claim(); await tick(2);
  m.close();
});
