// The Glass Shoal made ready to switch on (14 Nov review): no dead end in the quest. Leaving the fight unbeaten (the
// "Leave the Shoal" button, a reload, a closed tab) brings the dragon back to the cliff stone; a boss beaten before the
// flight home still finishes the quest in town; the arena always shows its way out (touch has no E key).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../../src/game/shoal-rules.js';
import { SHOAL_TEXT } from '../../src/locales/shoal.js';
import { installDom } from '../lib/mini-dom.mjs';

test('the cliff stone calls the dragon before the fight and again after leaving it unbeaten', () => {
  const at = (step) => ({ ...R.freshShoal(), step, blade: true });
  assert.deepEqual(['find_blade', 'reach_stone', 'ride', 'defeat', 'return', 'done'].map((s) => R.stoneOpen(at(s))), [false, true, true, true, false, false]);
  assert.equal(R.stoneOpen(R.freshShoal()), false, 'not before the quest is taken');
  // left mid-fight: mount and land keep the quest at 'defeat', the fight starts again
  let s = at('defeat');
  assert.equal(R.questEvent(s, 'mount'), s); assert.equal(R.questEvent(s, 'landed'), s); assert.equal(R.questEvent(s, 'home'), s, 'leaving unbeaten finishes nothing');
  s = R.questEvent(s, 'boss_down'); assert.equal(s.step, 'return');
  assert.equal(R.homeDue(s), true); assert.equal(R.questEvent(s, 'home').step, 'done');
  assert.equal(R.homeDue(at('defeat')), false); assert.equal(R.homeDue(at('done')), false);
});

test('every step has its tracker line and the way-out labels exist, in all five locales', () => {
  const keys = ['shoal.leave', 'shoal.prompt.chest', 'shoal.prompt.home', 'shoal.home', 'shoal.track.offer', ...R.QUEST_STEPS.filter((s) => s !== 'done').map((s) => 'shoal.track.' + s)];
  for (const lang of ['en', 'ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(SHOAL_TEXT[lang] && SHOAL_TEXT[lang][k], `${lang}:${k}`);
});

test('the arena shows its way out: Leave the Shoal mid-fight, then Open the chest and Fly home after the win', async () => {
  const { doc } = installDom();
  globalThis.document = doc;
  const THREE = await import('three');
  const { createShoalArena } = await import('../../src/scenes/shoal-arena.js');
  let home = 0, wins = 0;
  const say = (k, a) => (SHOAL_TEXT.en[k] || k).replace(/\{(\w+)\}/g, (_, n) => (a && a[n] != null ? a[n] : ''));
  const a = createShoalArena({
    THREE, scene: new THREE.Scene(), camera: null, center: new THREE.Vector3(0, 0, 0), say, toast: () => {}, reduced: () => true, mobile: false,
    hero: () => 'iris', clip: () => {}, axes: () => [0, 0], rig: { groundAxes: () => ({ fwd: { x: 0, y: 1 }, right: { x: 1, y: 0 } }) },
    onWin: () => { wins++; }, onDeath: () => {}, onHome: () => { home++; a.leave(); }, allies: () => [],
  });
  const exit = () => doc.querySelectorAll('button').find((b) => b.className.split(' ').includes('sa-exit'));
  a.enter({ ...R.freshShoal(), step: 'defeat', blade: true });
  a.update(0.016, 0.016);
  assert.equal(exit().textContent, 'Leave the Shoal');
  exit().click(); assert.equal(home, 1, 'mid-fight the button flies her home');
  a.enter({ ...R.freshShoal(), step: 'defeat', blade: true });
  a.debugWin(); a.update(0.016, 0.032);
  assert.equal(wins, 1);
  a.enter({ ...R.freshShoal(), step: 'return', blade: true }); // after a win the arena opens on the chest
  a.update(0.016, 0.048);
  assert.equal(exit().textContent, 'Open the chest');
  exit().click(); a.update(0.016, 0.064);
  assert.equal(exit().textContent, 'Fly home'); assert.equal(home, 1, 'opening the chest does not leave');
  exit().click(); assert.equal(home, 2);
  a.dispose();
});
