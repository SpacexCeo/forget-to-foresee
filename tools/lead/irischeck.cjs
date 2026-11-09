const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; p.on('pageerror', (e) => errors.push(String(e).slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error' && !/GL Driver|GPU stall/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  const glb = []; p.on('response', (r) => { if (/agent_iris/.test(r.url())) glb.push(r.status() + ' ' + r.url().split('/').pop()); });
  await p.goto('http://localhost:5199/?demo=judge&mode=walk&play=direct');
  await p.waitForFunction(() => window.__ftf && window.__ftf.play, null, { timeout: 120000 });
  await p.waitForTimeout(15000);
  await p.screenshot({ path: process.argv[2] });
  console.log('iris glb:', glb, 'errors:', errors.length ? errors : 'none'); await b.close();
})();
