const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const c = await b.newContext({ ...devices['iPhone 13'] }); const p = await c.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await p.goto('http://localhost:5199/?play=direct&lang=ru&films=cheap');
  await p.waitForFunction(() => window.__ftf && window.__ftf.play, null, { timeout: 120000 });
  await p.waitForFunction(() => { const r = document.getElementById('ch-film'); return r && !r.hidden; }, null, { timeout: 60000 });
  const state = () => p.evaluate(() => { const r = document.getElementById('ch-film'); const dots = [...r.querySelectorAll('.ch-dots i.now')].length ? [...r.querySelectorAll('.ch-dots i')].findIndex((d) => d.classList.contains('now')) : -1; return { open: !r.hidden, shot: dots, sub: (r.querySelector('.ch-sub span') || {}).textContent?.slice(0, 50), hint: r.querySelector('.ch-hint').textContent, hintOp: r.querySelector('.ch-hint').style.opacity }; });
  await p.waitForTimeout(2600); console.log('start', JSON.stringify(await state()));
  await p.screenshot({ path: process.argv[2] });
  await p.touchscreen.tap(195, 420); await p.waitForTimeout(700); console.log('hintRect', JSON.stringify(await p.evaluate(() => { const r = document.querySelector('#ch-film .ch-hint').getBoundingClientRect(); const h = document.querySelector('#ch-film .ch-hint'); const cs = getComputedStyle(h); const q = document.querySelector('#ch-film .ch-sub').getBoundingClientRect(); return { op: h.style.opacity, z: cs.zIndex, col: cs.color, tr: h.style.transform, subB: Math.round(q.bottom), l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), vw: innerWidth }; }))); await p.screenshot({ path: process.argv[2] });
  for (let i = 0; i < 7; i++) { await p.touchscreen.tap(195, 420); await p.waitForTimeout(500); const s = await state(); console.log('tap', i + 1, JSON.stringify(s)); if (!s.open) break; }
  console.log('errors:', errors.length ? errors : 'none'); await b.close();
})();
