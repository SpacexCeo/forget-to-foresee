// Start-of-game capture on real WebGL (docs/handoff/lighting-v2.md): the loading screen, the first town frame and
// the altar transition as a timed frame sequence, with what the page reports at each frame.
//
//   . /root/w/atmo/env.sh
//   node flow-cap.cjs --out shots/flow [--url http://127.0.0.1:4195] [--query "demo=judge"] [--profile phone]
//                     [--throttle 4000]   (download speed in kbit/s; omit for no limit) [--no-register]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] == null || all[i + 1].startsWith('--') ? true : all[i + 1]] : null)).filter(Boolean));
const URL_BASE = args.url || 'http://127.0.0.1:4195';
const OUT = path.resolve(args.out || 'shots/flow');
const PHONE = args.profile === 'phone';
const [W, H] = PHONE ? [390, 844] : [1280, 720];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-watchdog'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: PHONE ? 3 : 1, isMobile: PHONE, hasTouch: PHONE });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  if (args.throttle) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: Number(args.throttle) * 125, uploadThroughput: 1e6 });
  }
  const q = new URLSearchParams(typeof args.query === 'string' ? args.query : 'demo=judge');
  if (PHONE) q.set('profile', 'phone');
  const t0 = Date.now();
  let n = 0;
  const log = [];
  const state = () => page.evaluate(() => {
    const f = window.__ftf, boot = document.getElementById('boot');
    const bar = boot && (boot.querySelector('[role=progressbar]') || boot);
    const st = f && f.streamer ? f.streamer.stats() : null;
    return {
      boot: !!boot, progress: bar ? bar.getAttribute('aria-valuenow') : null, label: boot ? (boot.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) : null,
      town: f && f.town ? f.town.phase : null, ready: !!(f && f.town && f.town.ready), play: !!(f && f.play),
      loading: st ? st.loading : null, real: st ? st.list.filter((a) => a.state === 'real').length : null,
      cover: !!document.querySelector('.ftf-town-cover'), lobby: !!document.querySelector('#ui button'),
    };
  }).catch(() => ({}));
  const shot = async (tag) => {
    const s = await state();
    const file = `${String(n++).padStart(2, '0')}-${tag}.jpg`;
    await page.screenshot({ path: path.join(OUT, file), quality: 72, timeout: 60000 }).catch(() => {});
    log.push({ file, t: Date.now() - t0, ...s }); console.log(file, Date.now() - t0, JSON.stringify(s));
    return s;
  };
  page.goto(`${URL_BASE}/?${q}`, { waitUntil: 'commit' }).catch((e) => errors.push(String(e)));
  // 1. loading screen until it leaves (the lobby, or the town on a direct link / phone)
  for (let i = 0; i < 80; i++) { await page.waitForTimeout(350); const s = await shot('boot'); if (s.boot === false && (s.lobby || s.town === 'town')) break; }
  // 2. a guest clicks through the lobby; the cover may come back while the town streams
  for (let i = 0; i < 60; i++) {
    const s = await state();
    if (s.town === 'town' && s.ready && !s.boot) break;
    await page.evaluate(() => { const bs = [...document.querySelectorAll('#ui button')].filter((b) => !b.disabled && b.offsetParent); const pick = bs.find((b) => /enter the world|play as guest|skip tutorial|begin|step onto|continue|next/i.test(b.textContent)); if (pick) pick.click(); }).catch(() => {});
    await page.waitForTimeout(400); if (i % 2 === 0) await shot('enter');
  }
  // 3. the first town seconds, frame by frame (pop-in shows here)
  for (let i = 0; i < 8; i++) { await shot('town'); await page.waitForTimeout(i < 4 ? 120 : 600); }
  // 4. the altar: register and watch the cover until the season runs
  if (!args['no-register']) {
    await page.evaluate(() => { const f = window.__ftf, a = f.town.scene.altar.stand; f.player.pos = [a[0], a[1] + 0.05, a[2]]; f.player.prevPos = f.player.pos.slice(); f.player.lastSafe = f.player.pos.slice(); f.player.vy = 0; });
    await page.waitForFunction(() => window.__ftf.town.promptVisible, null, { timeout: 30000, polling: 200 }).catch(() => {});
    await page.waitForTimeout(1500); await shot('altar');
    page.evaluate(() => window.__ftf.town.register()).catch(() => {});
    for (let i = 0; i < 60; i++) { await page.waitForTimeout(450); const s = await shot('up'); if (s.play && !s.cover && s.town === 'done') break; }
    for (let i = 0; i < 4; i++) { await page.waitForTimeout(300); await shot('isle'); }
  }
  if (errors.length) console.log('errors:\n  ' + [...new Set(errors)].slice(0, 10).join('\n  '));
  fs.writeFileSync(path.join(OUT, 'flow.json'), JSON.stringify({ log, errors: [...new Set(errors)] }, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
