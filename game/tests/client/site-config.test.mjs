// The owner's own domain is one switch (FTF_DOMAIN, build/site.js; .github/workflows/pages.yml): the build serves from
// "/" there and every public link follows; GitHub Pages stays the default. No game, relayer or presence code names the
// Pages site or its sub-path outside the two config spots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteConfig, PAGES_URL } from '../../build/site.js';
import { siteLink } from '../../src/ui/site-link.js';

test('site: Pages by default, the root and https://<domain>/ with FTF_DOMAIN, each part overridable', () => {
  assert.deepEqual(siteConfig({}), { base: '/', siteUrl: PAGES_URL }, 'local dev');
  assert.deepEqual(siteConfig({ FTF_BASE: '/forget-to-foresee/' }), { base: '/forget-to-foresee/', siteUrl: PAGES_URL }, 'the Pages build today');
  assert.deepEqual(siteConfig({ FTF_DOMAIN: 'play.example.com' }), { base: '/', siteUrl: 'https://play.example.com/' });
  assert.deepEqual(siteConfig({ FTF_DOMAIN: 'https://play.example.com/' }), { base: '/', siteUrl: 'https://play.example.com/' }, 'a pasted URL works too');
  assert.deepEqual(siteConfig({ FTF_DOMAIN: 'play.example.com', FTF_BASE: '/game', FTF_SITE_URL: 'https://x.example/game' }), { base: '/game/', siteUrl: 'https://x.example/game/' });
});

test('site: the share link is this page\'s origin plus the build base (wherever it is published)', () => {
  assert.equal(siteLink({ origin: 'https://play.example.com' }, '/'), 'https://play.example.com/');
  assert.equal(siteLink({ origin: 'https://spacexceo.github.io' }, '/forget-to-foresee/'), 'https://spacexceo.github.io/forget-to-foresee/');
  assert.equal(siteLink(undefined, '/', 'https://fallback.example/'), 'https://fallback.example/', 'no page: the configured site');
});

test('site: the Pages workflow builds with the variable, not a fixed sub-path', () => {
  const wf = readFileSync(new URL('../../../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(wf, /FTF_BASE: \$\{\{ vars\.FTF_BASE \|\| \(vars\.FTF_DOMAIN && '\/'\) \|\| '\/forget-to-foresee\/' \}\}/);
  assert.match(wf, /http:\/\/127\.0\.0\.1:4173\$\{FTF_BASE\}\?/);
  assert.match(wf, /echo "\$FTF_DOMAIN" > dist\/CNAME/);
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /<meta property="og:url" content="%VITE_FTF_SITE_URL%">/);
});

test('site: no code names the Pages host or its sub-path outside build/site.js and the two servers\' default origin', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const scan = ['game/src', 'game/index.html', 'game/public', 'relayer/lib', 'relayer/api', 'relayer/server.js', 'presence/server.js', 'presence/lib'];
  const allowed = new Set(['relayer/lib/core.js:origins: [\'https://spacexceo.github.io\'],', "presence/server.js:const DEFAULT_ORIGINS = ['https://spacexceo.github.io'];"]);
  const bad = [];
  const walk = (rel) => {
    const abs = join(root, rel); let st; try { st = statSync(abs); } catch { return; }
    if (st.isDirectory()) { for (const f of readdirSync(abs)) if (f !== 'node_modules' && f !== 'assets') walk(rel + '/' + f); return; }
    if (!/\.(m?js|cjs|html|json|css|webmanifest)$/.test(rel)) return;
    readFileSync(abs, 'utf8').split('\n').forEach((line, i) => {
      if (!/spacexceo\.github\.io|(?<!github\.com\/SpacexCeo)\/forget-to-foresee\//i.test(line)) return;
      if (allowed.has(rel + ':' + line.trim())) return;
      bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  };
  for (const s of scan) walk(s);
  assert.deepEqual(bad, []);
});
