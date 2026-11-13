// The transparent HUD on a landscape phone and the minimised panels as thin lines beside the radar (owner 13.11).
import assert from 'node:assert/strict';
import test from 'node:test';
import { HUD_CSS } from '../../src/rpg/hud-style.js';

test('landscape phones (<= 500 px tall) share the portrait HUD and get their own tracker and Use pill rules', () => {
  const portrait = '(max-width: 599px), (max-width: 899px) and (orientation: portrait), (max-width: 899px) and (max-height: 500px)';
  assert.equal(HUD_CSS.split(portrait).length - 1, 2);
  assert.match(HUD_CSS, /@media \(max-width: 899px\) and \(max-height: 500px\) and \(orientation: landscape\) \{[^}]*\.ft \{/);
  assert.match(HUD_CSS, /html\.rpg-on \.ts-btn\.ts-use \{ bottom: 196px; \}/);
});

test('minimised panels are plain text beside the radar under the rpg HUD, not boxed pills', () => {
  assert.match(HUD_CSS, /html\.rpg-on \.ftf-pills \{ top: calc\(var\(--rpg-k\) \* 30\) !important; right: calc\(var\(--rpg-k\) \* 196/);
  const pill = HUD_CSS.match(/html\.rpg-on \.ftf-pill \{([^}]*)\}/)[1];
  for (const rule of ['background: none', 'border: 0', 'box-shadow: none', 'min-height: 0']) assert.ok(pill.includes(rule), rule);
});
