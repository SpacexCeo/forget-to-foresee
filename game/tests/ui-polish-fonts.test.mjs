// QA-034: tokens.css is linked as a static asset (not processed by Vite), so it must not reference node_modules
// with a relative url(): the production build would request /node_modules/... and 404. Faces live in fonts.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('world HUD tokens.css has no node_modules url() (QA-034)', () => {
  const css = readFileSync(new URL('../src/ui/world-hud/tokens.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /url\([^)]*node_modules/);
  const fonts = readFileSync(new URL('../src/ui/world-hud/fonts.js', import.meta.url), 'utf8');
  assert.match(fonts, /old-standard-tt-cyrillic-400-normal\.woff2\?url/);
});
