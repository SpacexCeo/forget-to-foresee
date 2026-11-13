// The inventory's Refresh button (owner 13.11): the open bag re-reads what the rest of the game saved since.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createInventory } from '../../src/game/inventory.js';
import { createChestBag, CHEST_TIERS } from '../../src/game/chests.js';
import { memoryStorage } from '../../src/ui/storage.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

test('reload picks up items and chests another instance saved', () => {
  const storage = memoryStorage();
  const menuInv = createInventory({ storage }), menuBag = createChestBag({ storage });
  createInventory({ storage }).add('part_gear', 2, 'chest');
  createChestBag({ storage }).add({ tier: CHEST_TIERS[0] });
  assert.equal(menuInv.count('part_gear'), 0); assert.equal(menuBag.list().length, 0);   // stale until refreshed
  menuInv.reload(); menuBag.reload();
  assert.equal(menuInv.count('part_gear'), 2); assert.equal(menuBag.list().length, 1);
});

test('the inventory tab has a Refresh button with strings in all five locales', () => {
  const src = readFileSync(new URL('../../src/play/game-menu.js', import.meta.url), 'utf8');
  assert.match(src, /gm-refresh/); assert.match(src, /function refreshInventory\(\)/);
  for (const l of ['en', 'ru', 'uk', 'it', 'zh']) { assert.ok(PLAY_MESSAGES[l]['menu.refresh'], l); assert.ok(PLAY_MESSAGES[l]['menu.refresh.tip'], l); }
});
