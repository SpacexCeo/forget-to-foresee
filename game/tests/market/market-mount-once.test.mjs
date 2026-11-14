// Playtest 14.11 regression: with the `marketplace` flag on, the sprint registry and boot-world's lazy loader both
// mounted src/market/index.js, so every 'ftf:market-open' stacked two identical windows. The close button removed only
// the top one, B and Esc talked to the other handle, and the market looked impossible to close. One window per page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { createPlayI18n } from '../../src/play/i18n.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

test('market: a second mount shares the first, so one window opens and the close button, B and Esc all close it', async () => {
  const { doc } = installDom();
  const i18n = createPlayI18n('en'); const t = (k, a) => i18n.t(k, a);
  const mem = new Map(); const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const win = new EventTarget();
  const { mount } = await import('../../src/market/index.js');
  const { pressWindow, closeTopWindow, resetWindows } = await import('../../src/ui/window-toggle.js');
  resetWindows();
  const a = mount({ t, storage, doc, win }); // the sprint registry
  const b = mount({ t, storage, doc, win }); // boot-world's lazy loader
  const wraps = () => doc.body.querySelectorAll('.mk2-wrap').length;
  const openEvent = () => win.dispatchEvent(new CustomEvent('ftf:market-open', { detail: { tab: 'buy' } }));

  openEvent(); b.open('buy'); await tick();
  assert.equal(wraps(), 1, 'one market window, not two stacked');
  doc.body.querySelector('.mk2-x').click();
  assert.equal(wraps(), 0, 'the close button closes it at once, whatever the network does');

  openEvent(); await tick(); assert.equal(wraps(), 1);
  assert.equal(pressWindow('market'), false); // B on an open market closes it
  assert.equal(wraps(), 0);

  openEvent(); await tick(); assert.equal(wraps(), 1);
  assert.equal(closeTopWindow(), 'market'); // Esc closes the market before any menu
  assert.equal(wraps(), 0);

  a.dispose(); openEvent(); await tick();
  assert.equal(wraps(), 1, 'the other mount still owns the window');
  b.dispose();
  assert.equal(wraps(), 0);
  openEvent(); await tick();
  assert.equal(wraps(), 0, 'after the last dispose nothing listens');
  resetWindows();
});
