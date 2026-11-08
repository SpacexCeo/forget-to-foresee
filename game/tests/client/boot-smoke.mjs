// Headless smoke of the production build's two ways into the world (docs/first-seconds.md). Not part of
// `npm test` (needs a build and Chromium): `npm run build && node tests/client/boot-smoke.mjs [port]`.
//   lobby:  /?demo=judge (the README judge link) → ENTER THE WORLD → Play as guest → Skip tutorial → Begin →
//           Step onto the island; expects one lobby, then the lobby gone, body.in-world, window.__ftf.play and
//           no UI-preview controls (the preview entry once leaked into the shared ui chunk and mounted its own lobby).
//   direct: /?play=direct&mode=walk&demo=judge; expects the loading screen gone and window.__ftf.play.
// Exits 1 on any failure or console error. Under SwiftShader the game clock runs at about a third of wall time.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require('playwright'); } catch { return require('/opt/node-tools/node_modules/playwright/index.js'); } })();
const GAME = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.argv[2]) || 4196;
const NOISE = /GPU stall due to ReadPixels/;
const STEPS = ['Play as guest', 'Skip tutorial', 'Begin', 'Step onto the island'];

const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: GAME, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 4000));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const out = {};
let failed = false;

async function run(name, fn) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !NOISE.test(m.text())) errors.push(m.type() + ': ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)));
  const t0 = Date.now();
  try { out[name] = await fn(page); } catch (e) { out[name] = { ok: false, error: String(e).slice(0, 400) }; }
  out[name].ms = Date.now() - t0; out[name].errors = errors;
  if (errors.length) out[name].ok = false;
  if (!out[name].ok) failed = true;
  await context.close();
}

const snapshot = (page) => page.evaluate(() => ({
  lobbies: document.querySelectorAll('.ftf-lobby').length,
  enterButtons: document.querySelectorAll('#ftf-enter').length,
  boot: !!document.getElementById('boot'),
  inWorld: document.body.classList.contains('in-world'),
  previewControls: !!document.querySelector('[data-i18n^="preview."]') || !!document.querySelector('#app .ftf-root'),
  play: !!(window.__ftf && window.__ftf.play),
  marks: window.__ftfBootMarks || null,
}));

await run('lobby', async (page) => {
  await page.goto(`http://localhost:${port}/?demo=judge`, { waitUntil: 'commit' });
  await page.waitForSelector('#ftf-enter', { timeout: 60000 });
  await page.waitForTimeout(800);
  const atLobby = await snapshot(page);
  await page.click('#ftf-enter', { timeout: 15000 });
  for (const name of STEPS) await page.getByRole('button', { name, exact: true }).first().click({ timeout: 30000 });
  await page.waitForFunction(() => window.__ftf && window.__ftf.play && document.body.classList.contains('in-world'), null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  const atIsland = await snapshot(page);
  const ok = atLobby.lobbies === 1 && atLobby.enterButtons === 1 && atIsland.lobbies === 0 && atIsland.inWorld && atIsland.play && !atIsland.previewControls && !atIsland.boot;
  return { ok, atLobby, atIsland };
});

await run('direct', async (page) => {
  await page.goto(`http://localhost:${port}/?play=direct&mode=walk&demo=judge`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__ftf && window.__ftf.play && !document.getElementById('boot'), null, { timeout: 180000 });
  const s = await snapshot(page);
  return { ok: s.play && s.inWorld && !s.boot && s.lobbies === 0 && !s.previewControls, ...s };
});

console.log(JSON.stringify(out, null, 1));
await browser.close();
server.kill();
process.exit(failed ? 1 : 0);
