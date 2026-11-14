// In-game settings: key rebinding (remap, conflicts, labels, storage), graphics/control settings, render overrides, strings.
import { test } from 'node:test';
import { SPRINT_KEYS } from '../../src/play/locales/sprint-keys.js';
import assert from 'node:assert/strict';
import { KEY_ACTIONS, defaultBindings, cleanBindings, conflicts, remapTable, setBindings, remapKey, isAction, keyLabel, actionKey, loadBindings, bindings } from '../../src/ui/keybinds.js';
import { cleanSettings, lookFactors, frameDue, renderOverrides, SETTINGS_DEFAULTS } from '../../src/ui/settings-store.js';
import { applyOverrides, qualityFor, tierForPreference } from '../../src/render/quality.js';
import { PREF_OPTIONS } from '../../src/ui/prefs.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };

test('defaults pass every key through; a rebinding maps the new key to the default code and silences the old one', () => {
  setBindings(defaultBindings());
  assert.equal(remapKey('KeyE'), 'KeyE'); assert.equal(remapKey('ArrowUp'), 'ArrowUp'); assert.equal(remapKey('Digit3'), 'Digit3');
  const st = mem();
  setBindings({ ...defaultBindings(), interact: 'KeyX', run: 'KeyC' }, st);
  assert.equal(remapKey('KeyX'), 'KeyE', 'X now does what E did');
  assert.equal(remapKey('KeyE'), null, 'E no longer interacts');
  assert.equal(remapKey('KeyC'), 'ShiftLeft'); assert.equal(remapKey('ShiftLeft'), null); assert.equal(remapKey('ShiftRight'), null);
  assert.equal(actionKey('interact'), 'X'); assert.ok(isAction('KeyC', 'run'));
  assert.equal(loadBindings(st).interact, 'KeyX', 'stored on the device');
  setBindings(defaultBindings());
  assert.equal(actionKey('interact'), 'E'); assert.equal(actionKey('menu'), 'Esc');
});

test('swapping two keys works both ways; a conflict is reported', () => {
  const swap = remapTable({ ...defaultBindings(), strike: 'Space', dash: 'KeyF' });
  assert.equal(swap.get('Space'), 'KeyF'); assert.equal(swap.get('KeyF'), 'Space');
  assert.deepEqual(conflicts({ ...defaultBindings(), interact: 'KeyF' }), { KeyF: ['interact', 'strike'] });
  assert.deepEqual(conflicts(defaultBindings()), {});
});

test('bad stored bindings fall back; reserved keys never bind; labels', () => {
  const b = cleanBindings({ interact: 'Escape', strike: 'F12', dash: '<x>', lance: 'KeyZ' });
  assert.equal(b.interact, 'KeyE'); assert.equal(b.strike, 'KeyF'); assert.equal(b.dash, 'Space'); assert.equal(b.lance, 'KeyZ');
  assert.equal(keyLabel('KeyQ'), 'Q'); assert.equal(keyLabel('Digit2'), '2'); assert.equal(keyLabel('ShiftLeft'), 'Shift'); assert.equal(keyLabel('ArrowLeft'), '←');
  assert.equal(new Set(KEY_ACTIONS.map((a) => a.code)).size, KEY_ACTIONS.length, 'defaults do not collide');
  assert.equal(bindings().interact, 'KeyE');
});

test('settings store, look factors, FPS cap', () => {
  assert.deepEqual(cleanSettings({ resScale: 0.3, fpsCap: 45, sensitivity: 2, invertY: 'yes', shadows: false }), { ...SETTINGS_DEFAULTS, sensitivity: 2, shadows: false });
  assert.deepEqual(lookFactors({ sensitivity: 2, invertY: true }), { x: 0.01, y: -0.01 });
  assert.equal(frameDue(0, 1), true); assert.equal(frameDue(30, 20), false); assert.equal(frameDue(30, 33), true);
});

test('render overrides only remove what the tier has; the medium preference maps to the middle tier', () => {
  const ultra = qualityFor('ultra');
  const o = applyOverrides(ultra, renderOverrides({ shadows: false, bloom: false, weather: false }));
  assert.equal(o.shadowMap, 0); assert.equal(o.shadowFarMap, 0); assert.equal(o.bloom, false); assert.equal(o.rain, 0);
  assert.deepEqual(applyOverrides(ultra, renderOverrides(SETTINGS_DEFAULTS)), ultra);
  assert.equal(applyOverrides(qualityFor('low'), { bloom: true }).bloom, false, 'a switch never adds bloom to a tier without it');
  assert.equal(tierForPreference('medium', 'ultra'), 'high'); assert.equal(tierForPreference('high', 'ultra'), 'ultra'); assert.equal(tierForPreference('low', 'ultra'), 'low');
  assert.deepEqual(PREF_OPTIONS.quality, ['auto', 'low', 'medium', 'high']);
});

test('set.* strings: five locales, same placeholders; every key label exists', async () => {
  const load = async (l) => (await import(`../../src/play/locales/${l}.js`)).default;
  const en = await load('en'); const keys = Object.keys(en).filter((k) => k.startsWith('set.') && !SPRINT_KEYS.has(k)); // sprint en-*.js keys fall back to English
  assert.ok(keys.length >= 100);
  const hud = (await import('../../src/play/locales/en-hud.js')).default;   // sprint keys: English in en-hud.js (other locales fall back)
  for (const a of KEY_ACTIONS) assert.ok(en[a.label] || hud[a.label], a.label);
  const args = (s) => [...new Set([...String(s).matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]))].sort().join(',');
  for (const l of ['ru', 'uk', 'it', 'zh']) { const m = await load(l); for (const k of keys) { assert.ok(m[k], `${l} ${k}`); assert.equal(args(m[k]), args(en[k]), `${l} ${k}`); } }
  for (const l of ['en', 'ru', 'uk', 'it', 'zh']) assert.ok((await import(`../../src/locales/${l}.js`)).default['settings.quality.medium'], l);
});

test('Tournament warning: skipped after "don\'t show again"; strings in five locales; the judge link never asks', async () => {
  const { tourneyWarnSkipped, TOURNEY_WARN_KEY } = await import('../../src/ui/tourney-warn.js');
  const st = mem(); assert.equal(tourneyWarnSkipped(st), false); st.setItem(TOURNEY_WARN_KEY, 'off'); assert.equal(tourneyWarnSkipped(st), true);
  for (const l of ['en', 'ru', 'uk', 'it', 'zh']) { const m = (await import(`../../src/play/locales/${l}.js`)).default; for (const k of ['tw.title', 'tw.body', 'tw.enter', 'tw.stay', 'tw.dontShow', 'set.endTourney', 'set.endTourneyConfirm']) assert.ok(m[k], `${l} ${k}`); }
  const { readFileSync } = await import('node:fs');
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(boot, /confirmRegister: judge \? null :/);
  const flow = readFileSync(new URL('../../src/scenes/town-flow.js', import.meta.url), 'utf8');
  assert.match(flow, /yes \? run\(\) : \(state\.registering = null, false\)/, '"Stay in town" frees the altar for a later Register');
});

test('mouse mode: aim is the default, Classic mouse is the fallback, in all five locales', async () => {
  assert.equal(SETTINGS_DEFAULTS.mouseMode, 'aim');
  assert.equal(cleanSettings({ mouseMode: 'classic' }).mouseMode, 'classic');
  assert.equal(cleanSettings({ mouseMode: 'orbit' }).mouseMode, 'aim');
  assert.equal(cleanSettings({}).mouseMode, 'aim');
  for (const l of ['en', 'ru', 'uk', 'it', 'zh']) {
    const m = await import(`../../src/play/locales/${l}.js`), dict = m.default || Object.values(m)[0];
    for (const k of ['set.ctl.mouse', 'set.ctl.mouse.aim', 'set.ctl.mouse.classic', 'set.ctl.mouseNote']) assert.ok(typeof dict[k] === 'string' && dict[k], `${l}: ${k}`);
  }
});
