// The three walk-in shops at the game camera: from the door (spawn) and at the counter.
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2]; require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-watchdog'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const logs = [];
  p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 160)); });
  await p.goto('http://127.0.0.1:4190/?play=direct&town=1');
  await p.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 180000 });
  await p.addStyleTag({ content: '#ui, .hub-host, .wh-host, .pl-badge, [class^="d1-"], [class*=" d1-"] { display: none !important; }' });
  const D = { exchange: 11, scribe: 11, inn: 13 };
  for (const id of ['exchange', 'scribe', 'inn']) {
    const ok = await p.evaluate((id) => window.__ftf.town.shops.enter(id), id);
    await p.waitForTimeout(6000);
    await p.screenshot({ path: `${out}/${id}_door.jpg`, quality: 88 });
    await p.evaluate(([d]) => { const f = window.__ftf; const s = f.player.pos.slice(); const o = [s[0], s[1], s[2] - (d / 2 - 1.2)];
      const r = f.rig; const keep = { dist: r.dist, minDist: r.minDist, maxDist: r.maxDist, minPitch: r.minPitch, pitchOffset: r.pitchOffset }; f.player.teleport([o[0], o[1], o[2] - d / 2 + 4.6], Math.PI); r.reset(0); Object.assign(r, keep); }, [D[id]]);
    await p.waitForTimeout(3500);
    await p.screenshot({ path: `${out}/${id}_counter.jpg`, quality: 88 });
    console.log(id, ok);
    await p.evaluate(() => window.__ftf.town.shops.leave());
    await p.waitForTimeout(4000);
  }
  console.log('errors', logs.slice(0, 6).join(' | '));
  await b.close();
})();
