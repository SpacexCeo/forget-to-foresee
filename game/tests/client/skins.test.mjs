// The skins a player may wear (play/skins.js): Iris always, Elise after Day 1, the wheel's skin only for its owners.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextSkin, ownsWheelSkin } from '../../src/play/skins.js';
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
