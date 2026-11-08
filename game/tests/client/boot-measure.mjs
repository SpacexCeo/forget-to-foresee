// Boot measurement: cold cache, throttled network, time to first paint / lobby / first playable frame, bytes.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('/opt/node-tools/node_modules/playwright/index.js');
import { spawn } from 'node:child_process';
const [,, label, baseUrl, outFile] = process.argv;
const THROTTLES = {
  fast4g: { downloadThroughput: 4 * 1024 * 1024 / 8, uploadThroughput: 3 * 1024 * 1024 / 8, latency: 20 },   // Chrome DevTools "Fast 4G": 4 Mbps down, 20 ms
  slow4g: { downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8, latency: 150 },     // "Slow 4G": 1.6 Mbps, 150 ms
};
const CAP_MS = 240000;
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const out = { label, baseUrl, runs: {} };
for (const [tname, t] of Object.entries(THROTTLES)) {
  for (const [pname, path, waitFor] of [['lobby', '/', () => !!document.querySelector('.ftf-lobby')], ['play', '/?play=direct&mode=walk&demo=judge', () => !!(window.__ftf && window.__ftf.play)]]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable'); await cdp.send('Network.clearBrowserCache'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...t });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    const t0 = Date.now();
    let navMs = null;
    try { await page.goto(baseUrl + path, { waitUntil: 'commit', timeout: CAP_MS }); navMs = Date.now() - t0; } catch (e) { errors.push('goto: ' + String(e).slice(0, 120)); }
    let reached = null;
    try { await page.waitForFunction(waitFor, null, { timeout: CAP_MS - (Date.now() - t0) }); reached = Date.now() - t0; } catch { reached = null; }
    const perf = await page.evaluate(() => {
      const paint = performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]);
      const nav = performance.getEntriesByType('navigation')[0];
      const res = performance.getEntriesByType('resource').map((r) => ({ name: r.name.split('/').pop().split('?')[0], type: r.initiatorType, bytes: r.transferSize || r.encodedBodySize || 0, end: Math.round(r.responseEnd) }));
      const total = res.reduce((a, r) => a + r.bytes, 0) + (nav ? nav.transferSize || 0 : 0);
      const byType = {}; for (const r of res) { const k = /\.glb/.test(r.name) ? 'models' : /\.(js)$/.test(r.name) ? 'js' : /\.(css)$/.test(r.name) ? 'css' : /\.(woff2?|ttf)$/.test(r.name) ? 'fonts' : /\.(jpg|png|webp|ktx2)$/.test(r.name) ? 'images' : /\.(wasm)$/.test(r.name) ? 'wasm' : /\.(ogg|mp3|wav)$/.test(r.name) ? 'audio' : 'other'; byType[k] = (byType[k] || 0) + r.bytes; }
      const biggest = [...res].sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((r) => [r.name, Math.round(r.bytes / 1024), r.end]);
      const streamer = window.__ftf && window.__ftf.streamer ? window.__ftf.streamer.stats() : null;
      return { paint, domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null, loadEvent: nav ? Math.round(nav.loadEventEnd) : null, totalKB: Math.round(total / 1024), byTypeKB: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, Math.round(v / 1024)])), resources: res.length, biggest, models: streamer ? { loaded: streamer.loaded, loading: streamer.loading, idle: streamer.idle } : null };
    }).catch((e) => ({ error: String(e).slice(0, 120) }));
    out.runs[`${tname}/${pname}`] = { navMs, reachedMs: reached, ...perf, errors };
    await context.close();
    console.error(label, tname, pname, 'reached', reached, 'KB', perf.totalKB);
  }
}
await browser.close();
import { writeFileSync } from 'node:fs';
writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log('wrote', outFile);
