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

test('portal prompt: wants the fee with the balance, pays at the fee, marks a demo fee, quiet when spent', () => {
  assert.deepEqual(portalPrompt('dormant', { balanceC: 123_456, feeC: 1_000_000 }), { key: 'story.portal.wants', args: { fee: '10,000', n: '1,234' } });
  assert.deepEqual(portalPrompt('ready', { balanceC: 1_000_000, feeC: 1_000_000 }), { key: 'story.portal.pay', args: { fee: '10,000' } });
  assert.equal(portalPrompt('ready', { feeC: 10_000, demo: true }).key, 'story.portal.payDemo');
  assert.equal(portalPrompt('dormant', { feeC: 10_000, demo: true }).key, 'story.portal.wantsDemo');
  assert.equal(portalPrompt('spent').key, 'story.portal.quiet');
});

test('portal object: E in reach confirms first, pays only on the button, follows the story look and hides away', () => {
  const scene = new THREE.Scene(), doc = fakeDoc();
  let facts = { phase: 'gathering', balanceC: 0, feeC: 1_000_000, demo: false }, paid = 0;
  const p = createTownPortal({ scene, position: [4, 0, 22.5], i18n: fakeI18n(), read: () => facts, onPay: () => { paid++; }, doc, reducedMotion: true });
  assert.equal(scene.children.includes(p.root), true);
  assert.deepEqual(PORTAL_TOWN, [6.4, 0, 23.4]);      // clear of the standing mirror
  p.update(0.016, 1);
  assert.equal(p.state, 'dormant');
  assert.equal(p.spot.near([5, 0, 23]), true);
  assert.equal(p.spot.near([10, 0, 23]), false);
  assert.match(p.spot.prompt(), /^story\.portal\.wants/);
  p.spot.onInteract(); assert.equal(p.panelOpen, false, 'dormant: no confirmation');
  facts = { ...facts, phase: 'gate_open', balanceC: 1_000_000 }; p.update(0.016, 2);
  assert.equal(p.state, 'ready');
  p.spot.onInteract(); assert.equal(p.panelOpen, true); assert.equal(paid, 0, 'E alone never pays');
  const [pay, notYet] = doc.find('ftf-portal-panel')[0].querySelectorAll('button');
  assert.equal(pay.textContent, 'story.portal.payButton'); assert.equal(notYet.textContent, 'story.portal.notYet');
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
