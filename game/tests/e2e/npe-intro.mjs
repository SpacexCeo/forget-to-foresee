// E2E for the new-player intro (sprint 7.11 E1-E4, E7) in headless Chromium on a Vite dev server. The intro module is
// mounted the way the sprint seam mounts it (no 3D boot; without A6's prologue the title card stands in).
//   E1 ?intro=1 on a fresh profile: title card, 19 lines in order with the right speakers, the card, Start, controls back
//   E2 Esc on the title card and Esc in the dialogue both reach the card
//   E3 a second load shows no intro
//   E4 reduced motion: no typewriter (a line is complete at once)
//   E7 a first-seen tip never shows over the dialogue
// Prints JSON; exit 1 on failure.   npx vite --port 5199 &   node tests/e2e/npe-intro.mjs [url]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:5199';
const SPEAKERS = ['Townsfolk', 'Child', 'Guard', 'Lamplighter', 'Weaver', 'Elder', 'Iris', 'Elder', 'Elder', 'Elder', 'Iris', 'Elder', 'Elder', 'Guard', 'Lamplighter', 'Weaver', 'Elder', 'Elder', 'Iris'];
const browser = await chromium.launch();
const res = { checks: {}, errors: [] };
const ok = (k, v, info) => { res.checks[k] = info === undefined ? !!v : { ok: !!v, info }; };

async function fresh(reduced = false) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: reduced ? 'reduce' : 'no-preference' })).newPage();
  page.on('pageerror', (e) => res.errors.push(e.message.slice(0, 300)));
  await page.goto(url + '/src/sprint/bus.js');
  await page.evaluate(async (red) => {
    document.open(); document.write('<!doctype html><body style="margin:0;background:#222"></body>'); document.close();
    localStorage.clear();
    window.__locks = []; window.__toasts = [];
    const fs = await import('/src/sprint/first-seen.js'); fs._configure({ storage: localStorage, doc: document, touch: false });
    window.__fs = fs;
    window.__mountIntro = async (search) => {
      const npe = await import('/src/npe/index.js');
      return npe.mount({ doc: document, storage: localStorage, t: null, search, toast: (s) => window.__toasts.push(s), lockControls: (on) => window.__locks.push(on), reduced: () => red, flags: { on: (k) => k === 'newPlayerIntro' || k === 'firstSeenTips' } });
    };
  }, reduced);
  return page;
}
const has = (page, sel) => page.evaluate((s) => !!document.querySelector(s), sel);

try {
  // E1 + E7
  let page = await fresh(false);
  await page.evaluate(async () => { window.__run = (await window.__mountIntro('?intro=1')).intro; });
  ok('E1 the title card stands in for the prologue', await has(page, '.npe-title'), await page.evaluate(() => document.querySelector('.npe-title') && document.querySelector('.npe-title').textContent));
  await page.waitForSelector('.npe-box', { timeout: 6000 });
  const names = [];
  for (let i = 0; i < 19; i++) {
    names.push(await page.evaluate(() => document.querySelector('.npe-name').textContent));
    if (i === 3) { // E7: a tip asked for during the dialogue waits
      await page.evaluate(() => { window.__fs.registerTip({ id: 'tip.e7', trigger: null, anchor: null, title: 'T', body: 'B' }); window.__fs.showTip('tip.e7'); });
      ok('E7 no coach mark over the dialogue', !(await has(page, '.ftf-tip')));
    }
    await page.evaluate(() => { const b = document.querySelector('.npe-box'); b.click(); b.click(); }); // complete the line, then advance
    await page.waitForTimeout(30);
  }
  ok('E1 19 lines in order with the right speakers', JSON.stringify(names) === JSON.stringify(SPEAKERS), names.join(', '));
  await page.waitForSelector('.npe-card', { timeout: 3000 });
  ok('E1 the card has seven rows', (await page.evaluate(() => document.querySelectorAll('.npe-card li').length)) === 7);
  await page.evaluate(() => [...document.querySelectorAll('.npe-card button')].find((b) => b.textContent === 'Start').click());
  const end = await page.evaluate(async () => { const s = await window.__run.state; return { phase: s.phase, locks: window.__locks, saved: JSON.parse(localStorage.getItem('ftf.npe.v1')) }; });
  ok('E1 Start hands control back and saves the intro as seen', end.phase === 'done' && JSON.stringify(end.locks) === '[true,false]' && end.saved.dialogueSeen && end.saved.cardSeen, end);
  ok('E1 the intro grants no silk', !(await page.evaluate(() => window.__toasts.some((t) => /silk/.test(t)))));
  // E3
  ok('E3 a second load shows no intro', await page.evaluate(async () => (await window.__mountIntro('')).intro === null && !document.querySelector('.npe-box, .npe-title')));
  // E2
  page = await fresh(false);
  await page.evaluate(async () => { window.__run = (await window.__mountIntro('?intro=1')).intro; });
  await page.waitForSelector('.npe-title'); await page.keyboard.press('Escape');
  await page.waitForSelector('.npe-box', { timeout: 3000 });
  ok('E2 Esc on the title card reaches the dialogue', true);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.npe-card', { timeout: 3000 });
  ok('E2 Esc in the dialogue reaches the card, with the replay hint', await page.evaluate(() => window.__toasts.some((t) => /Replay it any time in Settings/.test(t))));
  // E4
  page = await fresh(true);
  await page.evaluate(async () => { window.__run = (await window.__mountIntro('?intro=1')).intro; });
  await page.waitForSelector('.npe-title'); await page.keyboard.press('Escape');
  await page.waitForSelector('.npe-box');
  const full = await page.evaluate(() => document.querySelector('.npe-text').textContent);
  ok('E4 reduced motion: the line is complete at once', full === 'She is awake! Stand back, give her air.', full);
  ok('no page errors', !res.errors.length, res.errors);
} catch (e) { res.errors.push(String((e && e.message) || e)); ok('ran', false); }
await browser.close();
console.log(JSON.stringify(res, null, 2));
process.exit(Object.values(res.checks).every((c) => (typeof c === 'object' ? c.ok : c)) && !res.errors.length ? 0 : 1);
