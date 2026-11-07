// Accessibility checks that run in Node: palette contrast (WCAG AA ≥ 4.5:1 for text),
// colour-independent tells, reduced-motion handling, subtitle wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TELL_GLYPH, tensionLevel } from '../src/ui/hud.js';
import { MESSAGES } from '../src/ui/i18n/index.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const css = read('../src/ui/styles.css');
const tokens = Object.fromEntries([...css.matchAll(/--ftf-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2].toLowerCase()]));

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('palette tokens follow the art direction (spec §11)', () => {
  assert.equal(tokens.charcoal, '#111a19');
  assert.equal(tokens.stone, '#53645d');
  assert.equal(tokens.mist, '#b7c6bd');
  assert.equal(tokens.pearl, '#e9e9db');
  assert.equal(tokens.amber, '#d4a15f');
  assert.equal(tokens.iris, '#8f86a8');
});

test('every text/background pair used by the UI meets 4.5:1', () => {
  const text = ['pearl', 'mist', 'amber', 'amber-strong', 'iris-text', 'good', 'bad', 'key'];
  const backgrounds = ['charcoal', 'charcoal-deep', 'panel', 'panel-raised'];
  const fails = [];
  for (const fg of text) for (const bg of backgrounds) {
    const r = contrast(tokens[fg], tokens[bg]);
    if (r < 4.5) fails.push(`${fg} on ${bg}: ${r.toFixed(2)}`);
  }
  // Primary button: charcoal text on amber (and on the hover shade).
  for (const bg of ['amber', 'amber-strong']) { const r = contrast(tokens.charcoal, tokens[bg]); if (r < 4.5) fails.push(`charcoal on ${bg}: ${r.toFixed(2)}`); }
  assert.deepEqual(fails, []);
  // Focus ring is visible against the background (non-text contrast ≥ 3:1).
  assert.ok(contrast(tokens.amber, tokens.charcoal) >= 3);
  assert.match(css, /:focus-visible\s*\{\s*outline:\s*3px solid var\(--ftf-amber\)/);
});

test('form controls do not override component colours (regression: pearl text on the amber button)', () => {
  assert.ok(!/^\.ftf-root button/m.test(css), 'inherit rules must use :where() so .ftf-btn-primary wins');
  assert.match(css, /\.ftf-btn-primary \{[^}]*color: var\(--ftf-charcoal\)/);
});

test('tells never rely on colour alone', () => {
  for (const cls of ['good', 'bad', 'key', 'muted', 'tick', '']) {
    assert.ok(TELL_GLYPH[cls], `glyph for "${cls}"`);
    assert.ok(MESSAGES.en[`tell.${cls || 'plain'}`] && MESSAGES.ru[`tell.${cls || 'plain'}`], `screen-reader label for "${cls}"`);
  }
  assert.equal(new Set(Object.values(TELL_GLYPH)).size, Object.keys(TELL_GLYPH).length, 'glyphs are distinct');
  assert.deepEqual([0, 39, 40, 69, 70, 100].map(tensionLevel), ['calm', 'calm', 'strained', 'strained', 'critical', 'critical']);
  for (const lv of ['calm', 'strained', 'critical']) assert.match(css, new RegExp(`\\.ftf-level\\[data-level="${lv}"\\]::before \\{ content:`), `tension glyph for ${lv}`);
  assert.match(css, /\.ftf-meter\[data-level="critical"\] \.ftf-meter-fill \{ background: repeating-linear-gradient/, 'critical tension has a pattern, not just a colour');
  assert.match(css, /\.ftf-badge::before \{ content:/);
});

test('reduced motion: CSS disables animation and the canvases draw a still frame', () => {
  assert.match(css, /html\[data-motion="reduce"\][^{]*\{\s*animation: none !important; transition: none !important;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  for (const f of ['../src/ui/background.js', '../src/ui/hologram/preview.js']) {
    const src = read(f);
    assert.match(src, /if \(reduced\) draw\(/, `${f} draws a still frame`);
    assert.match(src, /if \(reduced \|\| document\.hidden\) return;/, `${f} schedules nothing when reduced or hidden`);
  }
  assert.match(read('../src/ui/background.js'), /pointer-events|aria-hidden/);
  assert.match(css, /\.ftf-bg \{[^}]*pointer-events: none/, 'the background can never block input');
});

test('subtitles: agent lines are announced politely and can be resized or hidden', () => {
  const hud = read('../src/ui/hud.js');
  assert.match(hud, /'aria-live': 'polite'/);
  assert.match(hud, /ftf-speaker/);
  assert.match(css, /html\[data-subtitle-size="l"\]/);
  assert.match(css, /html\[data-subtitles="off"\] \.ftf-subtitles \{ display: none; \}/);
});
