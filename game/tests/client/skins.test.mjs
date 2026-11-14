// The skins a player may wear (play/skins.js): Iris always, Elise after Day 1, the wheel's skin only for its owners.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextSkin, ownsWheelSkin, wearPlan, wardrobe, TRY_ON_SECONDS } from '../../src/play/skins.js';
import { heroById } from '../../src/render/asset-catalog.js';

test('K cycles only through the skins the player has', () => {
  assert.equal(nextSkin('iris', {}), 'iris');
  assert.equal(nextSkin('iris', { elise: true }), 'elise');
  assert.equal(nextSkin('elise', { elise: true }), 'iris');
  assert.equal(nextSkin('elise', { elise: true, sheriffchenko: true }), 'sheriffchenko');
  assert.equal(nextSkin('sheriffchenko', { elise: true, sheriffchenko: true }), 'iris');
  assert.equal(nextSkin('iris', { sheriffchenko: true }), 'sheriffchenko');
  assert.equal(nextSkin('sheriffchenko', {}), 'iris'); // lost or never owned: back to Iris
});

test('the skin NFT is read for the guest account; no guest, no token or a dead network means no skin', async () => {
  const guestFrom = (s) => s.guest || null;
  assert.equal(await ownsWheelSkin({ storage: {}, guestFrom, skinOf: async () => 'skin-1' }), false);
  assert.equal(await ownsWheelSkin({ storage: { guest: { accountId: 'a.testnet' } }, guestFrom, skinOf: async (id) => (id === 'a.testnet' ? 'skin-7' : null) }), true);
  assert.equal(await ownsWheelSkin({ storage: { guest: { accountId: 'b.testnet' } }, guestFrom, skinOf: async () => null }), false);
  assert.equal(await ownsWheelSkin({ storage: { guest: { accountId: 'b.testnet' } }, guestFrom, skinOf: async () => { throw new Error('rpc'); } }), false);
});

test('the skin is a hero of the shared rig that borrows the heroine\'s clips', () => {
  const h = heroById('sheriffchenko');
  assert.deepEqual([h.model, h.sidecar, h.retarget, h.toon, h.gate], ['agent_sheriffchenko', 'iris', true, true, 'skin']);
});

test('wearing from the menu: owned skins are worn and remembered, the rest are tried on for a while and put back', () => {
  assert.deepEqual(wearPlan('elise', 'iris'), { wear: 'iris', remember: true, revertTo: null, seconds: 0 });
  assert.deepEqual(wearPlan('iris', 'sheriffchenko', { sheriffchenko: true }), { wear: 'sheriffchenko', remember: true, revertTo: null, seconds: 0 });
  assert.deepEqual(wearPlan('elise', 'sheriffchenko', { elise: true }), { wear: 'sheriffchenko', remember: false, revertTo: 'elise', seconds: TRY_ON_SECONDS });
  assert.equal(wearPlan('sheriffchenko', 'sheriffchenko').revertTo, 'iris', 'a try-on during a try-on still goes back to Iris');
  assert.equal(wearPlan('iris', 'dragon'), null);
  assert.deepEqual(wardrobe('elise', { elise: true }), [{ id: 'iris', owned: true, worn: false }, { id: 'elise', owned: true, worn: true }, { id: 'sheriffchenko', owned: false, worn: false }]);
});

test('the wardrobe and try-on lines exist in all five locales; the painted skin is on disk', async () => {
  const { PLAY_MESSAGES } = await import('../../src/play/i18n.js');
  const { existsSync } = await import('node:fs');
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) for (const k of ['inv.wardrobe', 'skin.wear', 'skin.worn', 'skin.try', 'skin.trying', 'skin.tryOver', 'skin.locked', 'skin.lockedElise', 'wheel.grand']) assert.ok(PLAY_MESSAGES[loc][k], `${loc} ${k}`);
  for (const f of ['sheriffchenko.webp', 'sheriffchenko_m.webp']) assert.ok(existsSync(new URL('../../public/assets/cards/' + f, import.meta.url)), f);
});
