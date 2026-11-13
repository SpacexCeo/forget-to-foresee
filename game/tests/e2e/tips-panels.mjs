// E2E for the panels' first-open tips (sprint 7.8) in headless Chromium on a Vite dev server: on a fresh profile,
// every panel registered in window.__ftfTest.panels shows its tip once; a second open shows none; the "?" handle
// shows it again. The panels load as modules (no 3D boot), the way the sprint seam mounts them. Prints JSON; exit 1
// on failure.
//   npx vite --port 5199 &   node tests/e2e/tips-panels.mjs [url]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:5199';
const browser = await chromium.launch();
const res = { checks: {}, errors: [] };
const ok = (k, v, info) => { res.checks[k] = info === undefined ? !!v : { ok: !!v, info }; };
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => res.errors.push(e.message.slice(0, 300)));
  await page.goto(url + '/src/sprint/bus.js');
  const out = await page.evaluate(async () => {
    document.open(); document.write('<!doctype html><body style="margin:0;background:#222"></body>'); document.close();
    localStorage.clear();
    const fs = await import('/src/sprint/first-seen.js');
    fs._configure({ storage: localStorage, doc: document, touch: false });
    const npe = await import('/src/npe/index.js');
    npe.mount({ doc: document, storage: localStorage, t: null, search: '?intro=0', flags: { on: (k) => k === 'firstSeenTips' } });
    const cup = await import('/src/play/season-cup.js');
    cup.createSeasonCup({ doc: document }); // registers __ftfTest.panels.tournament
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const report = {};
    for (const [name, p] of Object.entries(window.__ftfTest.panels || {})) {
      const tips = () => document.querySelectorAll('.ftf-tip').length;
      await p.open(); await wait(150);
      const first = tips(); const text = first ? document.querySelector('.ftf-tip').textContent : '';
      const got = [...document.querySelectorAll('.ftf-tip button')].find((b) => b.textContent === 'Got it'); if (got) got.click();
      p.close(); await wait(50);
      await p.open(); await wait(150);
      const second = tips();
      const q = document.querySelector(`${p.selector} .ftf-tip-again[data-tip="${p.tip}"]`);
      if (q) q.click(); await wait(100);
      const again = tips();
      p.close();
      report[name] = { first, second, again, hasHandle: !!q, text };
    }
    return report;
  });
  for (const [name, r] of Object.entries(out)) {
    ok(`${name}: the tip shows on the first open`, r.first === 1, r.text.slice(0, 80));
    ok(`${name}: no tip on the second open`, r.second === 0);
    ok(`${name}: the "?" handle shows it again`, r.hasHandle && r.again === 1);
  }
  ok('at least one panel registered', Object.keys(out).length >= 1, Object.keys(out));
  ok('no page errors', !res.errors.length, res.errors);
} catch (e) { res.errors.push(String(e && e.message || e)); ok('ran', false); }
await browser.close();
console.log(JSON.stringify(res, null, 2));
process.exit(Object.values(res.checks).every((c) => (typeof c === 'object' ? c.ok : c)) && !res.errors.length ? 0 : 1);
