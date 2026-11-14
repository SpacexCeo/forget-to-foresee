// Settings -> Controls: the control mode as two cards (owner 14.11), the chosen one outlined; a click picks the other;
// the owner's pictures per language when cut, English for Italian, a drawn mouse until then; five locales.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installDom } from '../lib/mini-dom.mjs';
import { controlModeCards, artLocale, CONTROL_MODES, CONTROL_ART, LINES } from '../../src/ui/control-mode-cards.js';

test('cards: two radio cards, the current mode checked, a click on the other picks it', () => {
  const { doc } = installDom();
  const picked = [];
  const [wrap, foot] = controlModeCards({ doc, t: (k) => k, mode: 'aim', onPick: (m) => picked.push(m) });
  const cards = wrap.querySelectorAll('.ftf-set-mode');
  assert.deepEqual(cards.map((c) => c.dataset.mode), ['aim', 'classic']);
  assert.deepEqual(cards.map((c) => c.getAttribute('aria-checked')), ['true', 'false']);
  assert.equal(wrap.getAttribute('role'), 'radiogroup');
  cards[0].dispatchEvent({ type: 'click' }); assert.deepEqual(picked, [], 'the chosen one stays');
  cards[1].dispatchEvent({ type: 'click' }); assert.deepEqual(picked, ['classic']);
  assert.equal(cards[0].querySelectorAll('li').length, 3); assert.equal(cards[1].querySelectorAll('li').length, 2);
  assert.equal(foot.textContent, 'set.ctl.mode.foot');
});

test('cards: the picture language falls back to English, and to the drawn mouse with none; every shipped picture exists', () => {
  assert.equal(artLocale('ru', ['ru', 'en']), 'ru');
  assert.equal(artLocale('it', ['ru', 'en', 'uk', 'zh']), 'en');
  assert.equal(artLocale('it', []), null);
  for (const l of CONTROL_ART) for (const m of CONTROL_MODES) assert.ok(existsSync(fileURLToPath(new URL(`../../public/assets/ui/control-modes/${l}-${m}.webp`, import.meta.url))), `${l}-${m}`);
  const { doc } = installDom();
  const [wrap] = controlModeCards({ doc, t: (k) => k, mode: 'classic', locale: 'uk', base: '/', onPick() {} });
  assert.deepEqual(wrap.querySelectorAll('img').map((i) => i.src), ['/assets/ui/control-modes/uk-aim.webp', '/assets/ui/control-modes/uk-classic.webp']);
});

test('cards: every locale has the titles, the lines and the footer; Settings uses the cards, not the dropdown', async () => {
  const keys = ['set.ctl.modes', 'set.ctl.mode.foot', ...CONTROL_MODES.map((m) => 'set.ctl.mode.' + m), ...Object.values(LINES).flat()];
  for (const l of ['en', 'ru', 'uk', 'it', 'zh']) {
    const m = (await import(`../../src/play/locales/${l}.js`)).default;
    for (const k of keys) assert.ok(typeof m[k] === 'string' && m[k].length, `${l}: ${k}`);
  }
  const pop = readFileSync(new URL('../../src/ui/settings-popup.js', import.meta.url), 'utf8');
  assert.match(pop, /\.\.\.controlModeCards\(\{ doc, t, mode: settings\.mouseMode/);
  assert.ok(!/row\('set\.ctl\.mouse', select\(/.test(pop), 'the dropdown is gone');
});
