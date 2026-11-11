// Link preview and favicon (audit QW-4): the page carries Open Graph / Twitter tags with absolute image URLs, a short
// English description and a real favicon file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const meta = (attr, name) => { const m = new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`).exec(html); return m && m[1]; };

test('link preview tags and favicon', () => {
  const d = meta('name', 'description'); assert.ok(d && d.length <= 160, 'description ≤ 160 chars');
  for (const k of ['og:title', 'og:description', 'og:image', 'og:url']) assert.ok(meta('property', k), k);
  assert.match(meta('property', 'og:image'), /^https:\/\/spacexceo\.github\.io\/forget-to-foresee\/og\.jpg$/);
  assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
  assert.ok(!html.includes('href="data:,"'), 'no blank favicon');
  assert.match(html, /rel="icon"[^>]*href="%BASE_URL%favicon\.svg"/);
  for (const f of ['og.jpg', 'favicon.svg']) assert.ok(existsSync(new URL('../../public/' + f, import.meta.url)), f);
  assert.ok(statSync(new URL('../../public/og.jpg', import.meta.url)).size < 400_000);
});
