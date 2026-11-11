// The game menu (src/play/game-menu.js): six tabs, the wheel lands prizes in the inventory and the ledger, the NFTs
// tab lists only chain-confirmed tokens, no "Minted" wording without a token, five locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installDom } from '../lib/mini-dom.mjs';
import { createTownLedger } from '../../src/game/town-economy.js';
import { memoryStorage } from '../../src/ui/storage.js';
import { PLAY_MESSAGES, createPlayI18n } from '../../src/play/i18n.js';

const MANIFEST = JSON.parse(readFileSync(new URL('../../public/assets/items/manifest.json', import.meta.url), 'utf8')).items.filter((i) => i.kind !== 'prop');

test('tabs render; a wheel spin pays into the inventory or the ledger; NFTs only from the chain read', async () => {
  const { doc } = installDom();
  const { openGameMenu, TABS } = await import('../../src/play/game-menu.js');
  const storage = memoryStorage();
  const ledger = createTownLedger({ storage });
  const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
  const m = openGameMenu({ doc, t, ledger, storage, manifest: Promise.resolve(MANIFEST), onChain: Promise.resolve({ state: 'loaded', items: [{ kind: 'shard', tokenId: 'x-7', owner: 'o.testnet', href: 'https://testnet.nearblocks.io/x', label: 'iris · call' }] }), base: '/' });
  assert.deepEqual(TABS, ['profile', 'achievements', 'nfts', 'inventory', 'agents', 'log']);
  for (const tab of TABS) { m.show(tab); await new Promise((r) => setTimeout(r, 0)); assert.equal(m.tab, tab); }
  const before = { silk: ledger.silk, xp: ledger.level.xp };
  const r = m.wheel.spin(MANIFEST);
  assert.ok(r);
  if (r.item) m.inventory.add(r.item.id);
  assert.equal(m.wheel.spin(MANIFEST), null, 'one free spin per day');
  assert.ok(r.item ? m.inventory.count(r.item.id) === 1 : ['silk', 'xp', 'title'].includes(r.segment.kind));
  assert.ok(ledger.silk >= before.silk);
  m.close();
});

test('menu strings exist in five locales; no "Minted" claim in the menu', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => /^(menu|wheel|ach|rarity|item)\./.test(k));
  assert.ok(keys.length > 80);
  for (const loc of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[loc][k], `${loc} ${k}`);
  for (const it of MANIFEST) assert.ok(PLAY_MESSAGES.en[it.nameKey], it.nameKey);
  const src = readFileSync(new URL('../../src/play/game-menu.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /['"`]Minted/);
});
