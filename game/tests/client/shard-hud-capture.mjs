// Headless check of the shard NFT HUD on the production build (not part of `npm test`: needs a build, Chromium and
// testnet RPC). `npm run build && node tests/client/shard-hud-capture.mjs [outDir] [port]`.
// Judge path (?demo=judge&mode=walk): plays the canonical judge moves through the play session (forget Iris's
// "call" memory at trial 4, let the trials pass), waits for the "Minted on NEAR testnet" toast when Frost buys the
// shard, then opens the Memories panel and captures the NFT cards. Desktop 1280×800 and iPhone 13. Exits 1 on any
// console error or a missing toast/card.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = (() => { try { return require('playwright'); } catch { return require('/opt/node-tools/node_modules/playwright/index.js'); } })();
const GAME = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(process.argv[2] || resolve(GAME, '../docs/screens/shard-nft'));
const port = Number(process.argv[3]) || 4197;
const NOISE = /GPU stall due to ReadPixels|WebGL|swiftshader|Automatic fallback to software/i;
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: GAME, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 4000));
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = false;

async function run(name, ctxOpts) {
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)));
  const res = { name };
  try {
    await page.goto(`http://localhost:${port}/?demo=judge&mode=walk&play=direct`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__ftf && window.__ftf.play && window.__ftf.play.session.obs, null, { timeout: 180000 });
    await page.waitForTimeout(1500);
    const sendAll = (moves) => page.evaluate(async (moves) => {
      const s = window.__ftf.play.session;
      const log = [];
      for (const m of moves) {
        if (m === 'forget') { const c = s.obs.memories.find((x) => x.kind === 'call'); log.push(['forget', (await s.send('sacrifice_memory', { memoryId: c.id, purpose: 'vision' })).ok]); continue; }
        const types = s.obs.availableActions.map((a) => a.type);
        if (types.includes('start_season') && s.obs.season.phase !== 'play') { log.push(['start', (await s.send('start_season', {})).ok]); continue; }
        const r = await s.send(m, {});
        log.push([m, r.ok, r.ok ? s.obs.season.tick : r.reason]);
      }
      return { log, tick: s.obs.season.tick, shards: s.obs.shards.map((x) => [x.id, x.open, x.winner]) };
    }, moves);
    res.a = await sendAll(['end_tick', 'end_tick', 'end_tick']);
    res.b = await sendAll(['forget']);
    // SwiftShader frames take seconds, longer than the toast lives between Playwright calls: hold it from inside the
    // page the moment it appears, as a pointer resting on it would (released after the capture).
    await page.evaluate(() => {
      window.__shToastSeenAt = null;
      new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList && n.classList.contains('sh-toast')) { window.__shToastSeenAt = { tick: window.__ftf.play.session.obs.season.tick }; n.dispatchEvent(new PointerEvent('pointerenter')); } })
        .observe(document.body, { childList: true, subtree: true });
    });
    // let the trials pass until the shard's auction closes (trial 6)
    for (let i = 0; i < 6; i++) {
      const r = await sendAll(['end_tick']);
      const sh = r.shards.find((x) => x[0] === 7);
      if (sh && !sh[1]) break;
    }
    res.c = await page.evaluate(() => ({ tick: window.__ftf.play.session.obs.season.tick, shards: window.__ftf.play.session.obs.shards.map((x) => [x.id, x.open, x.winner]) }));
    await page.waitForSelector('.sh-toast', { timeout: 30000 });
    // SwiftShader screenshots take longer than the toast lives: hold it as a pointer over it would
    res.toastAt = await page.evaluate(() => window.__shToastSeenAt);
    res.toast = await page.$eval('.sh-toast', (e) => e.innerText);
    res.toastBox = await page.$eval('.sh-toast', (e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: `${OUT}/${name}-toast.png` });
    await page.$eval('.sh-toast', (e) => e.dispatchEvent(new PointerEvent('pointerleave')));
    await page.evaluate(() => window.__ftf.play.ui.open('memory'));
    await page.waitForSelector('.sh-card', { timeout: 15000 });
    await page.waitForTimeout(2200);
    await page.evaluate(() => { const c = document.querySelector('.sh-card'); c.scrollIntoView({ block: 'start' }); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${name}-card.png` });
    res.cards = await page.$$eval('.sh-card', (cs) => cs.map((c) => c.dataset.token));
    res.card0 = await page.$eval('.sh-card', (e) => e.innerText);
    res.links = await page.$$eval('.sh-card:first-child a', (as) => as.map((a) => a.href));
    res.overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  } catch (e) { res.error = String(e).slice(0, 400); failed = true; }
  res.errors = errors;
  if (errors.length || !res.cards || !res.cards.length) failed = true;
  console.log(JSON.stringify(res, null, 1));
  await context.close();
}

await run('desktop', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await run('iphone13', { ...devices['iPhone 13'] });
await browser.close();
server.kill();
process.exit(failed ? 1 : 0);
