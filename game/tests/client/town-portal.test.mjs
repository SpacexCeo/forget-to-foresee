// The Gate-Loom (story P1/P5): its state and prompt from the story phase and the balance; the confirmation before paying.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { portalState, portalPrompt, createTownPortal, PORTAL_TOWN } from '../../src/scenes/town-portal.js';
import { fakeDoc, fakeI18n } from './story-fakes.mjs';

test('portal state: off without the flag, dormant below the fee, ready at the fee, spent after the twist', () => {
  assert.equal(portalState({ on: false, phase: 'gathering', balanceC: 2e6 }), 'off');
  assert.equal(portalState({ on: true, phase: 'off' }), 'off');
  assert.equal(portalState({ on: true, phase: 'gathering', balanceC: 999_999, feeC: 1_000_000 }), 'dormant');
  assert.equal(portalState({ on: true, phase: 'gate_open', balanceC: 1_000_000, feeC: 1_000_000 }), 'ready');
  assert.equal(portalState({ on: true, phase: 'twist', balanceC: 5e6 }), 'spent');
  assert.equal(portalState({ on: true, phase: 'onward', balanceC: 5e6 }), 'spent');
});

test('portal prompt (sprint §4.12): every state; the fee comes in as an argument, never a literal', () => {
  const f = { feeC: 20_000 };
  assert.deepEqual(portalPrompt('dormant', { ...f, onChainC: 3_800, totalC: 5_000 }), { key: 'story.portal.wants', args: { fee: '200', gate: '38', n: '38' } });
  assert.deepEqual(portalPrompt('dormant', { ...f, onChainC: 3_800, totalC: 21_000 }), { key: 'story.portal.syncable', args: { total: '210', gate: '38', n: '38', fee: '200' } });
  assert.equal(portalPrompt('dormant', { ...f, syncing: true }).key, 'story.portal.syncing');
  assert.deepEqual(portalPrompt('ready', { ...f, onChainC: 20_000 }), { key: 'story.portal.pay', args: { fee: '200' } });
  assert.equal(portalPrompt('ready', { ...f, paying: true }).key, 'story.portal.paying');
  assert.equal(portalPrompt('ready', { ...f, payError: 'tx_failed' }).key, 'story.portal.failed');
  assert.equal(portalPrompt('dormant', { ...f, blocker: 'need_guest' }).key, 'story.portal.needGuest');
  assert.equal(portalPrompt('dormant', { ...f, blocker: 'network' }).key, 'story.portal.offline');
  assert.equal(portalPrompt('spent', f).key, 'story.portal.quiet');
  assert.deepEqual(portalPrompt('ready', { feeC: 25_000, onChainC: 25_000 }).args, { fee: '250' }, 'the owner can move gate_price: the copy follows');
  assert.equal(portalState({ on: true, phase: 'gate_open', balanceC: 30_000, onChainC: 10_000, feeC: 20_000 }), 'dormant', 'ready only when the silk on chain covers it');
  assert.equal(portalPrompt('dormant', { balanceC: 6000, heldC: 3800, feeC: 20_000 }).args.gate, '38', '"you hold" is the silk on NEAR (the HUD chip), not the payable balance');
  assert.equal(portalPrompt('dormant', { heldC: 123_456, feeC: 1_000_000 }).args.fee, '10,000', 'one formatter (net/silk-core.js formatSilkC)');
});

test('portal object: E in reach confirms first, pays only on the button, follows the story look and hides away', () => {
  const scene = new THREE.Scene(), doc = fakeDoc();
  let facts = { phase: 'gathering', balanceC: 0, feeC: 1_000_000, demo: false }, paid = 0;
  const p = createTownPortal({ scene, position: [4, 0, 22.5], i18n: fakeI18n(), read: () => facts, onPay: () => { paid++; }, doc, reducedMotion: true });
  assert.equal(scene.children.includes(p.root), true);
  assert.deepEqual(PORTAL_TOWN, [4.4, 0, 24.8]);      // clear of the standing mirror
  p.update(0.016, 1);
  assert.equal(p.state, 'dormant');
  assert.equal(p.spot.near([5, 0, 23]), true);
  assert.equal(p.spot.near([10, 0, 23]), false);
  assert.match(p.spot.prompt(), /^The Gate-Loom needs [0-9,]+ silk on chain. 0 of it counts so far.$/); // en-quests copy
  p.spot.onInteract(); assert.equal(p.panelOpen, false, 'dormant: no confirmation');
  facts = { ...facts, phase: 'gate_open', balanceC: 1_000_000 }; p.update(0.016, 2);
  assert.equal(p.state, 'ready');
  p.spot.onInteract(); assert.equal(p.panelOpen, true); assert.equal(paid, 0, 'E alone never pays');
  const [pay, notYet] = doc.find('ftf-portal-panel')[0].querySelectorAll('button');
  assert.equal(pay.textContent, 'Pay and go home'); assert.equal(notYet.textContent, 'Not yet'); // en-quests copy (sprint §4.12)
  notYet.click(); assert.equal(p.panelOpen, false); assert.equal(paid, 0);
  p.spot.onInteract(); doc.find('ftf-portal-panel')[0].querySelectorAll('button')[0].click();
  assert.equal(paid, 1); assert.equal(p.panelOpen, false);
  facts = { ...facts, phase: 'onward', balanceC: 50_000 }; p.update(0.016, 3); assert.equal(p.state, 'spent');
  p.setActive(false); assert.equal(p.root.visible, false);
  p.dispose(); assert.equal(scene.children.includes(p.root), false);
});

test('portal: boot-world imports it lazily with the Expedition (on by default), never with ?story=0', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^import .*town-(portal|quests)/m);
  assert.match(src, /params\.get\('story'\) !== '0'[^\n]*\n[^\n]*import\('\.\/scenes\/town-quests\.js'\)/);
});
