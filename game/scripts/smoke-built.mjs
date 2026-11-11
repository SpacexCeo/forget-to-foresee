// Smoke of the BUILT page (owner, 11.11: a bundling init-order bug passed every unit test and broke the live site).
// Opens the URL in headless Chromium and fails on any page error, or when the loading screen has not finished
// (window.__ftfBootMarks.done) within the time limit.
//   cd game && npm run build && npx vite preview --port 4173 &  then: node scripts/smoke-built.mjs [url] [seconds]
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:4173/?day1=0&quest=0';
const limit = (Number(process.argv[3]) || 240) * 1000;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url, { waitUntil: 'domcontentloaded' });
const t0 = Date.now();
let marks = null;
while (Date.now() - t0 < limit && !errors.length) {
  marks = await page.evaluate(() => window.__ftfBootMarks || null).catch(() => null);
  if (marks && marks.done) break;
  await page.waitForTimeout(1000);
}
const pct = await page.evaluate(() => { const b = document.querySelector('#boot .boot-pct'); return b ? b.textContent : null; }).catch(() => null);
await browser.close();
if (errors.length) { console.error('FAIL page errors:\n' + errors.join('\n')); process.exit(1); }
if (!marks || !marks.done) { console.error(`FAIL the loading screen did not finish in ${limit / 1000} s (at ${pct})`); process.exit(1); }
console.log(`OK loaded in ${marks.done} ms, no page errors`);
