// The HUD tray's menu button (owner 14.11: a mouse click did not open the menu). The tray used to send a synthetic Esc,
// and Esc first stops a click-to-walk route and closes any open window (the chat, the market): while Iris walked to a
// clicked point, or with the chat open, the click only did that. The tray now opens the menu itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL('../../src/' + p, import.meta.url), 'utf8');

test('tray menu: the world hands the HUD its menu opener, and the tray calls it directly', () => {
  assert.match(src('boot-world.js'), /mountSprint\(\{[^\n]*openMenu: \(\) => openMenu\(\)/);
  assert.match(src('rpg/index.js'), /if \(id === 'menu'\) \{ if \(ctx\.openMenu\) ctx\.openMenu\(\);/);
});

test('tray menu: Esc keeps its order (cast, talk panel, top window, route, then the menu); the tray skips it', () => {
  const bw = src('boot-world.js');
  const esc = bw.indexOf("if (input.hit('Escape') || pad.hit(PAD.cancel)) {");
  assert.ok(esc > 0);
  const block = bw.slice(esc, esc + 900);
  assert.ok(block.indexOf('closeTopWindow()') < block.indexOf('stopSteering()') && block.indexOf('stopSteering()') < block.indexOf('openMenu()'));
});
