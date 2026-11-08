// Readability layer (src/ui/a11y.css, src/ui/a11y.js, prefs, settings): the accessibility prefs are
// validated and mirrored onto <html>; the high-contrast theme meets WCAG AAA (7:1) for text; the
// colour-blind-safe palette keeps good / bad / key apart under protan, deutan and tritan simulation
// and ≥ 4.5:1 on every dark surface; hold-to-confirm never fires on a tap; the settings form builds
// with the Accessibility section in every locale and its targets are ≥ 48 px by stylesheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { installDom } from './lib/mini-dom.mjs';
import { createPrefs, applyPrefsToDocument, PREF_DEFAULTS, PREF_OPTIONS } from '../src/ui/prefs.js';
import { createSafeStorage, memoryStorage, STORAGE_KEYS } from '../src/ui/storage.js';
import { contrast, simulateCvd, deltaE, holdToConfirm, hexToRgb } from '../src/ui/a11y.js';
import { MESSAGES } from '../src/ui/i18n/index.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
/** The mini DOM has no CSSStyleDeclaration: a map with the two methods the code uses. */
const fakeStyle = () => { const m = new Map(); return { setProperty: (k, v) => m.set(k, v), getPropertyValue: (k) => m.get(k) || '' }; };
const css = read('../src/ui/a11y.css');
const baseCss = read('../src/ui/styles.css');

/** Custom properties declared inside the first rule whose selector contains `sel`. */
function tokens(source, sel) {
  const i = source.indexOf(sel);
  assert.ok(i >= 0, 'rule ' + sel);
  const body = source.slice(source.indexOf('{', i) + 1, source.indexOf('}', i));
  return Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2].toLowerCase()]));
}

test('prefs: accessibility keys validate, persist and fall back; the document mirrors them as tokens', () => {
  const backend = memoryStorage();
  const prefs = createPrefs(createSafeStorage(backend));
  assert.deepEqual(prefs.get(), { ...PREF_DEFAULTS });
  prefs.set({ uiScale: 200, contrast: 'high', font: 'readable', palette: 'safe', narration: true, narrationRate: 1.3, hudMode: 'simple' });
  const p = prefs.get();
  assert.equal(p.uiScale, 200); assert.equal(p.contrast, 'high'); assert.equal(p.hudMode, 'simple'); assert.equal(p.narrationRate, 1.3);
  // garbage never sticks: an invalid value falls back to its default (the contract of tests/wh-shared.test.mjs)
  prefs.set({ uiScale: 999, contrast: 'neon', font: 'comic', palette: 7, narrationRate: 9, hudMode: 'god' });
  assert.deepEqual([prefs.get().uiScale, prefs.get().contrast, prefs.get().font, prefs.get().palette, prefs.get().narrationRate, prefs.get().hudMode], [100, 'normal', 'default', 'default', 1, 'novice']);
  prefs.set({ uiScale: 200, contrast: 'high', font: 'readable', palette: 'safe', narration: true, narrationRate: 1.3, hudMode: 'simple' });
  // a stored string number is accepted (older builds stored strings)
  backend.setItem(STORAGE_KEYS.prefs, JSON.stringify({ uiScale: '150', narrationRate: '0.9' }));
  const again = createPrefs(createSafeStorage(backend));
  assert.equal(again.get().uiScale, 150); assert.equal(again.get().narrationRate, 0.9);
  assert.deepEqual(PREF_OPTIONS.hudMode, ['simple', 'novice', 'pro']);
  assert.deepEqual(PREF_OPTIONS.uiScale, [100, 125, 150, 175, 200]);
  // <html> mirror
  const el = { dataset: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } } };
  applyPrefsToDocument(prefs, { documentElement: el });
  assert.equal(el.dataset.contrast, 'high'); assert.equal(el.dataset.font, 'readable'); assert.equal(el.dataset.palette, 'safe');
  assert.equal(el.dataset.uiScale, '200'); assert.equal(el.dataset.hudMode, 'simple'); assert.equal(el.dataset.narration, 'on');
  assert.equal(el.style.props['--ftf-ui-scale'], '2');
  assert.equal(el.style.props['--wh-user-scale'], String(1 * 2), 'the HUD unit multiplies hudScale by uiScale');
  // storage that throws still works in memory
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  const mem = createPrefs(createSafeStorage(throwing));
  mem.set({ uiScale: 175 });
  assert.equal(mem.get().uiScale, 175);
});

test('a11y.css: the stylesheet reacts to every pref attribute and defines the shared tokens', () => {
  for (const attr of ['data-ui-scale', 'data-contrast="high"', 'data-font="readable"', 'data-palette="safe"']) assert.ok(css.includes(`html[${attr}`) || css.includes(`html:not([${attr}`), attr);
  for (const tok of ['--ftf-ui-scale', '--ftf-body-min: 16px', '--ftf-target-min: 48px', '--a11y-good', '--a11y-bad', '--a11y-key', '--a11y-info']) assert.ok(css.includes(tok), tok);
  assert.match(css, /zoom: var\(--ftf-ui-scale\)/, 'panels outside the world HUD zoom by the scale');
  assert.match(css, /font-family: "Atkinson Hyperlegible"/);
  assert.match(css, /--wh-stroke-title: 0px/, 'the readable font drops the serif stroke');
  assert.match(css, /backdrop-filter: none !important/, 'high contrast removes translucency');
  assert.match(css, /min-height: var\(--ftf-target-min\); min-width: var\(--ftf-target-min\)/, 'own buttons are ≥ 48 px');
  assert.match(css, /font: var\(--wh-font-body-weight, 500\) max\(var\(--ftf-body-min\), 16px\)/, 'own body text is ≥ 16 px');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('high contrast: every text colour on every surface is ≥ 7:1 (AAA), gold accents ≥ 4.5:1', () => {
  const ftf = tokens(css, 'html[data-contrast="high"] {');
  const wh = tokens(css, 'html[data-contrast="high"] .wh-root');
  const surfaces = [ftf['--ftf-panel'], ftf['--ftf-charcoal'], ftf['--ftf-panel-raised'], ftf['--panel'], wh['--wh-panel-bg'], wh['--wh-card-bg'], wh['--wh-btn-bg'], wh['--wh-chip-active-bg'], wh['--wh-tab-active-bg']];
  const texts = [ftf['--ftf-pearl'], ftf['--ftf-mist'], ftf['--ink'], ftf['--muted'], wh['--wh-text'], wh['--wh-text-2'], wh['--wh-text-muted'], wh['--wh-text-on-gold'], wh['--wh-text-kbd']];
  const accents = [ftf['--ftf-amber'], ftf['--ftf-good'], ftf['--ftf-bad'], ftf['--ftf-key'], wh['--wh-gold'], wh['--wh-gold-text'], wh['--wh-notify']];
  const fails = [];
  for (const bg of surfaces) {
    assert.ok(bg, 'surface token present');
    for (const fg of texts) if (contrast(fg, bg) < 7) fails.push(`${fg} on ${bg}: ${contrast(fg, bg).toFixed(2)}`);
    for (const fg of accents) if (contrast(fg, bg) < 4.5) fails.push(`accent ${fg} on ${bg}: ${contrast(fg, bg).toFixed(2)}`);
  }
  assert.deepEqual(fails, []);
  assert.ok(contrast(wh['--wh-frame'], wh['--wh-panel-bg']) >= 3, 'frames are visible (non-text 3:1)');
});

test('colour-blind-safe palette: good / bad / key stay apart for protan, deutan and tritan viewers, and read on dark panels', () => {
  const safe = tokens(css, 'html[data-palette="safe"] {');
  const good = safe['--a11y-good'], bad = safe['--a11y-bad'], key = safe['--a11y-key'], info = safe['--a11y-info'];
  const base = tokens(baseCss, ':root {');
  const defaults = { good: base['--ftf-good'], bad: base['--ftf-bad'] };
  // the default palette is the reason the option exists: green vs salmon collapses for a deutan viewer
  const dDefault = Math.min(...['protan', 'deutan'].map((k) => deltaE(simulateCvd(defaults.good, k), simulateCvd(defaults.bad, k))));
  const dSafe = Math.min(...['protan', 'deutan', 'tritan'].map((k) => deltaE(simulateCvd(good, k), simulateCvd(bad, k))));
  assert.ok(dSafe > 25, `safe good/bad distance under CVD: ${dSafe.toFixed(1)}`);
  assert.ok(dSafe > dDefault, `safe (${dSafe.toFixed(1)}) beats default (${dDefault.toFixed(1)})`);
  for (const k of ['protan', 'deutan', 'tritan']) {
    const pairs = [[good, bad], [good, key], [bad, key]]; // info is a voice colour, not a state signal
    for (const [a, b] of pairs) assert.ok(deltaE(simulateCvd(a, k), simulateCvd(b, k)) > 14, `${k}: ${a} vs ${b}`);
  }
  for (const bg of ['#111a19', '#18231f', '#0b1517', '#000000']) for (const fg of [good, bad, key, info]) assert.ok(contrast(fg, bg) >= 4.5, `${fg} on ${bg}`);
  assert.deepEqual(hexToRgb('#fff'), [255, 255, 255]);
  // never colour alone: the base stylesheet keeps glyphs for tells and a pattern for critical tension
  assert.match(baseCss, /\.ftf-badge::before \{ content:/);
  assert.match(baseCss, /repeating-linear-gradient/);
});

test('hold-to-confirm: fires only after the hold time, never on a click; release cancels; keyboard works', () => {
  const { doc } = installDom();
  const btn = doc.createElement('button');
  btn.style = fakeStyle();
  let now = 0, fired = 0;
  const frames = [];
  const detach = holdToConfirm(btn, { ms: 700, onConfirm: () => fired++, now: () => now, raf: (fn) => frames.push(fn) });
  const run = () => { for (const f of frames.splice(0)) f(); }; // one animation frame per call
  btn.dispatchEvent({ type: 'click' });
  run();
  assert.equal(fired, 0, 'a click does nothing');
  btn.dispatchEvent({ type: 'pointerdown', button: 0 });
  now = 300; run();
  assert.equal(btn.dataset.holding, 'true');
  assert.equal(btn.style.getPropertyValue('--hold'), '43%');
  btn.dispatchEvent({ type: 'pointerup' });
  now = 1000; run();
  assert.equal(fired, 0, 'releasing early cancels');
  assert.equal(btn.style.getPropertyValue('--hold'), '0%');
  btn.dispatchEvent({ type: 'pointerdown', button: 0 });
  now = 1000; run(); now = 1750; run();
  assert.equal(fired, 1, 'held long enough');
  assert.equal(btn.dataset.holding, 'false');
  // keyboard: hold Enter
  let prevented = 0;
  btn.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault: () => prevented++ });
  now = 1800; run(); now = 2600; run();
  assert.equal(fired, 2);
  assert.ok(prevented >= 1);
  btn.dispatchEvent({ type: 'keyup', key: 'Enter', preventDefault: () => {} });
  detach();
  btn.dispatchEvent({ type: 'pointerdown', button: 0 });
  now = 5000; run();
  assert.equal(fired, 2, 'detached');
});

test('settings: the form carries the Accessibility section in every locale, with the three interface modes', async () => {
  const { doc } = installDom();
  doc.documentElement.style = fakeStyle();
  const { createPlayContext } = await import('../src/play/i18n.js');
  const { buildSettings } = await import('../src/ui/settings.js');
  const { fakeSynth, createNarration } = await import('../src/play/narration.js');
  for (const loc of PREF_OPTIONS.locale) {
    const ctx = createPlayContext({ storage: createSafeStorage(memoryStorage()), locale: loc });
    const { synth, Utterance } = fakeSynth();
    ctx.narration = createNarration({ prefs: ctx.prefs, i18n: ctx.i18n, synth, Utterance });
    const form = buildSettings(ctx);
    const section = form.querySelector('[data-a11y="section"]');
    assert.ok(section, loc + ': section');
    assert.equal(section.querySelector('legend').textContent, MESSAGES[loc]['settings.a11y']);
    const modes = form.querySelectorAll('input[type="radio"][value="simple"], input[type="radio"][value="novice"], input[type="radio"][value="pro"]');
    assert.equal(modes.length, 3, loc + ': three interface modes');
    assert.equal(section.querySelectorAll('input[type="checkbox"]').length, 4, 'contrast, font, palette, narration');
    assert.equal(section.querySelectorAll('select').length, 2, 'size and pace');
    // "hear a sample" speaks even while narration is off, in the current language
    section.querySelector('[data-a11y="try"]').click();
    assert.equal(synth.spoken.length, 1, loc + ': sample spoken');
    assert.equal(synth.spoken[0].text, MESSAGES[loc]['a11y.narration.sample'].replace(/’/g, '’'));
    assert.equal(synth.spoken[0].lang, { en: 'en-US', uk: 'uk-UA', ru: 'ru-RU', it: 'it-IT', zh: 'zh-CN' }[loc]);
    synth.finish();
    await Promise.resolve();
    assert.equal(ctx.prefs.get().narration, false, 'the sample did not switch narration on');
    // a change through the form lands in prefs
    const contrastBox = section.querySelectorAll('input[type="checkbox"]')[0];
    contrastBox.checked = true;
    contrastBox.dispatchEvent({ type: 'change', target: contrastBox });
    assert.equal(ctx.prefs.get().contrast, 'high');
    assert.equal(ctx.i18n.missing.size, 0, loc + ': ' + [...ctx.i18n.missing].join(', '));
  }
});
