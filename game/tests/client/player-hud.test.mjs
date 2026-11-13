// The town player HUD (src/scenes/player-hud.js): silk formatting and deltas, the frame model, town-only visibility,
// the wallet follows the ledger, the chest badge, the toast stack keeps three.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { formatSilk, walletDelta, frameModel } from '../../src/scenes/player-hud.js';
import { createTownLedger } from '../../src/game/town-economy.js';
import { memoryStorage } from '../../src/ui/storage.js';
import { createPlayI18n, PLAY_MESSAGES } from '../../src/play/i18n.js';

test('silk text, deltas and the frame model', () => {
  assert.equal(formatSilk(10000), '100.00'); assert.equal(formatSilk(1234.4), '12.34');
  assert.deepEqual(walletDelta(10000, 10250), { text: '+2.50', sign: 'plus' });
  assert.deepEqual(walletDelta(10000, 9000), { text: '−10.00', sign: 'minus' });
  assert.equal(walletDelta(5, 5), null); assert.equal(walletDelta(null, 5), null);
  const m = frameModel({ level: { level: 2, into: 25, need: 200, title: 'apprentice' }, hp: 20, maxHp: 100 });
  assert.equal(m.level, 2); assert.equal(m.progress, 0.125); assert.equal(m.hp, 0.2); assert.equal(m.low, true); assert.equal(m.xp, '25 / 200 XP');
  assert.equal(frameModel({ level: null }).hp, 1);
});

test('town only; the wallet follows the ledger; chest badge; three toasts at most; five locales', async () => {
  const { doc } = installDom();
  globalThis.requestAnimationFrame = (f) => setTimeout(() => f(performance.now() + 1000), 0); globalThis.cancelAnimationFrame = clearTimeout;
  const { createPlayerHud } = await import('../../src/scenes/player-hud.js');
  const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
  const ledger = createTownLedger({ storage: memoryStorage() });
  let sealed = 2; const subs = new Set();
  const chests = { sealed: () => Array.from({ length: sealed }), subscribe: (f) => { subs.add(f); return () => subs.delete(f); } };
  let opened = 0;
  const hud = createPlayerHud({ doc, t, ledger, chests, onProfile: () => opened++, reducedMotion: () => true });
  assert.equal(hud.root.hidden, true, 'hidden until the town phase');
  hud.update({ visible: true, hp: 40, maxHp: 100 });
  assert.equal(hud.root.hidden, false);
  // the ONE silk number (net/silk-core.js): before the chain answers, 0 on NEAR and "Checking…" (never a guess)
  assert.match(hud.root.textContent, /Checking…/);
  const { installSilkModel, computeSilkView } = await import('../../src/net/silk-core.js');
  installSilkModel({ view: () => computeSilkView({ localTotalC: 12864, onChainC: 3800, creditableC: 6000, chainOk: true }), subscribe: () => () => {}, syncNow: async () => ({ ok: true }), refresh: async () => {} });
  assert.match(hud.root.querySelector('.ph-coin b').textContent, /^38$/); // the portal's number, not the 128.64 kept in this browser
  assert.match(hud.root.textContent, /\+22 waiting/);
  assert.match(hud.root.querySelector('.ph-coin').title, /Recorded on NEAR: 38[\s\S]*Waiting to be recorded: 22[\s\S]*Play silk \(saved on this device only\): 68\.64[\s\S]*All silk you hold: 128\.64/);
  installSilkModel(null);
  assert.match(hud.root.textContent, /▣ 2/);
  sealed = 0; for (const f of subs) f();
  assert.doesNotMatch(hud.root.textContent, /▣/);
  hud.root.querySelectorAll('button')[0].click(); assert.equal(opened, 1, 'the frame opens the profile');
  for (let i = 0; i < 5; i++) hud.toast('n' + i);
  assert.equal(hud.root.querySelectorAll('.ph-toast').length, 3);
  hud.update({ visible: false }); assert.equal(hud.root.hidden, true, 'the archipelago keeps its own HUD');
  for (const loc of Object.keys(PLAY_MESSAGES)) for (const k of ['town.silk', 'chest.badge', 'hud.health', 'silk.waiting', 'silk.offline', 'silk.checking', 'silk.sync', 'silk.tip.gate', 'silk.tip.chain', 'silk.tip.pending', 'silk.tip.play', 'silk.tip.total', 'silk.tip.fee']) assert.ok(PLAY_MESSAGES[loc][k], loc + ' ' + k);
  hud.dispose();
});
