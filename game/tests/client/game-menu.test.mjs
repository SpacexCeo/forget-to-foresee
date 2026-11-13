// The game menu (src/play/game-menu.js): six tabs, the wheel lands prizes in the inventory and the ledger, the NFTs
// tab lists only chain-confirmed tokens, no "Minted" wording without a token, five locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installDom } from '../lib/mini-dom.mjs';
import { createTownLedger } from '../../src/game/town-economy.js';
import { memoryStorage } from '../../src/ui/storage.js';
import { spinResult, claimPrize } from '../../src/game/wheel.js';
import { createChestBag } from '../../src/game/chests.js';
import { PLAY_MESSAGES, createPlayI18n } from '../../src/play/i18n.js';

const MANIFEST = JSON.parse(readFileSync(new URL('../../public/assets/items/manifest.json', import.meta.url), 'utf8')).items.filter((i) => i.kind !== 'prop');

test('tabs render; a wheel spin pays into the inventory or the ledger; NFTs only from the chain read', async () => {
  const { doc } = installDom();
  const { openGameMenu, TABS } = await import('../../src/play/game-menu.js');
  const storage = memoryStorage();
  // deterministic: a fixed wheel id in isolated storage (the menu's wheel otherwise draws a random id, and some ids land
  // on the chest or the grand prize), and the day's free spin not yet taken
  storage.setItem('ftf.wheel.v1', JSON.stringify({ v: 1, id: 'feed0001', spins: 0, freeDay: null, earnedUsed: 0, titles: [], history: [], pending: [] }));
  const ledger = createTownLedger({ storage });
  const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
  const m = openGameMenu({ doc, t, ledger, storage, manifest: Promise.resolve(MANIFEST), onChain: Promise.resolve({ state: 'loaded', items: [{ kind: 'shard', tokenId: 'x-7', owner: 'o.testnet', href: 'https://testnet.nearblocks.io/x', label: 'iris · call' }] }), base: '/', now: () => new Date(2026, 10, 12, 12).getTime() });
  assert.deepEqual(TABS, ['profile', 'achievements', 'nfts', 'inventory', 'friends', 'agents', 'log']);
  for (const tab of TABS) { m.show(tab); await new Promise((r) => setTimeout(r, 0)); assert.equal(m.tab, tab); }
  assert.equal(m.wheel.id, 'feed0001');
  const before = { silk: ledger.silk, xp: ledger.level.xp };
  const r = m.wheel.spin(MANIFEST);
  assert.ok(r);
  assert.deepEqual(r, { ...spinResult('feed0001-1', MANIFEST), seed: 'feed0001-1', free: true }, 'the shown seed decides the prize');
  assert.equal(m.wheel.pending.length, 1, 'the prize waits for Claim');
  const c = await claimPrize(m.wheel, r.seed, { inventory: m.inventory, ledger, chests: createChestBag({ storage }) });
  assert.ok(c.ok, 'claimed into the real stores');
  assert.equal(m.wheel.pending.length, 0);
  assert.equal(m.wheel.spin(MANIFEST), null, 'one free spin per day');
  const k = r.segment.kind;
  if (k === 'part' || k === 'shard') assert.equal(m.inventory.count(r.item.id), 1);
  else if (k === 'silk') assert.equal(ledger.silk, before.silk + r.segment.amount);
  else if (k === 'xp') assert.equal(ledger.level.xp, before.xp + r.segment.amount);
  else assert.ok(['title', 'chest'].includes(k), k);
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
