// World HUD shared layer: every glyph lives in icons.js, package CSS takes colours from tokens,
// and the HUD prefs (mode, scale) default and validate correctly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { icon, ICON_NAMES, ringSigil, keyArt, iconUrl } from '../src/ui/world-hud/icons.js';
import { createPrefs, PREF_DEFAULTS, HUD_SCALE } from '../src/ui/prefs.js';

const dir = new URL('../src/ui/world-hud/', import.meta.url);
const read = (f) => readFileSync(new URL(f, dir), 'utf8');

test('wh shared: packages define no SVG of their own (icons.js is the only art source)', () => {
  for (const f of ['status.js', 'signs.js', 'log.js', 'actions.js']) {
    assert.ok(!/viewBox/.test(read(f)), f + ' defines its own SVG');
  }
  for (const n of ['menu-wide', 'info-i', 'chevron-slim', 'connector', 'bubble', 'braid', 'crosshair']) assert.ok(ICON_NAMES.includes(n), n);
  for (const n of ICON_NAMES) assert.match(icon(n), /^<svg [^>]*data-icon="/);
  assert.match(ringSigil(), /data-icon="ring-sigil"/);
  assert.match(iconUrl('braid'), /^url\("data:image\/svg\+xml,/);
});

test('wh shared: the quest key art is a soft glow (no sigil orbits or sparks)', () => {
  const k = keyArt();
  assert.ok(!/stroke-dasharray/.test(k), 'no dashed orbit');
  assert.ok(!/#ffe9b0/.test(k), 'no sparks');
});

test('wh shared: package CSS uses tokens for colours (no hex literals outside tokens.css)', () => {
  for (const f of ['status.css', 'log.css', 'actions.css']) {
    const hex = read(f).replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    // #000 only appears as the opaque half of mask gradients
    hex.splice(0, hex.length, ...hex.filter((x) => x !== '#000'));
    assert.deepEqual(hex, [], f + ' has hex colour literals');
  }
});

test('wh shared: tokens gate blur on the low tier and keep a 24 px target floor', () => {
  const t = read('tokens.css');
  assert.match(t, /html\[data-tier="low"\] \.wh-root, html\[data-fx="low"\] \.wh-root \{ --wh-panel-blur: 0px; --wh-blur-sm: 0px; \}/);
  assert.match(t, /min-height: 24px/);
  assert.match(t, /var\(--wh-user-scale, 1\)/);
});

test('prefs: Novice is the default HUD mode, scale validates', () => {
  const mem = new Map();
  const storage = { getJSON: (k) => mem.get(k) ?? null, setJSON: (k, v) => mem.set(k, v) };
  const p = createPrefs(storage, { systemReducedMotion: () => false, systemLowTier: () => false });
  assert.equal(PREF_DEFAULTS.hudMode, 'novice');
  assert.equal(p.get().hudMode, 'novice');
  p.set({ hudMode: 'pro', hudScale: 'xl' });
  assert.equal(p.get().hudMode, 'pro');
  assert.equal(HUD_SCALE[p.get().hudScale], 1.3);
  p.set({ hudMode: 'expert', hudScale: 'huge' });
  assert.equal(p.get().hudMode, 'novice', 'invalid values fall back to the default');
  assert.equal(p.get().hudScale, 'm');
});
