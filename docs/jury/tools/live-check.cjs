// Juror live-site check (rubric C1/C7, notes/live-site-load-and-devices.md).
// Usage: node docs/jury/tools/live-check.cjs <url>
// Prints cold-load timings, transfer size and console errors for desktop and an emulated phone.
const { chromium, devices } = require('playwright');

async function run(url, label, contextOptions) {
  const browser = await chromium.launch();
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  let bytes = 0;
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', async (r) => {
    try { const z = await r.request().sizes(); bytes += z.responseBodySize + z.responseHeadersSize; } catch (_) {}
  });
  const t0 = Date.now();
  let status = 'ok';
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  } catch (e) { status = 'load failed: ' + e.message.split('\n')[0]; }
  const loadMs = Date.now() - t0;
  let firstControlMs = null;
  try {
    await page.waitForSelector('button, a[href], [role=button], canvas', { timeout: 30000 });
    firstControlMs = Date.now() - t0;
  } catch (_) { /* none found */ }
  const lcp = await page.evaluate(() => new Promise((res) => {
    let v = null;
    try {
      new PerformanceObserver((l) => { const e = l.getEntries(); v = e[e.length - 1].startTime; })
        .observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (_) {}
    setTimeout(() => res(v), 500);
  })).catch(() => null);
  console.log(JSON.stringify({ label, url, status, loadMs, firstControlMs,
    lcpMs: lcp && Math.round(lcp), transferBytes: bytes, consoleErrors: errors.slice(0, 10) }));
  await browser.close();
}

(async () => {
  const url = process.argv[2];
  if (!url) { console.error('usage: live-check.cjs <url>'); process.exit(2); }
  await run(url, 'desktop-1920', { viewport: { width: 1920, height: 1080 } });
  await run(url, 'phone-pixel7', { ...devices['Pixel 7'] });
})();
