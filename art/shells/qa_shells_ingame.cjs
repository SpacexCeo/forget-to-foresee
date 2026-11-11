// The four Shells v3 in the game: the archipelago from the balcony (far, mid) and close to one Shell.
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2]; require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-watchdog'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const logs = [];
  p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 160)); });
  await p.goto('http://127.0.0.1:4190/?demo=judge&play=direct&mode=walk');
  await p.waitForTimeout(25000);
  await p.addStyleTag({ content: '#ui, .hub-host, .wh-host, .pl-badge { display: none !important; }' });
  for (const [n, d, yaw] of [['shells_a', 60, 0.6], ['shells_b', 60, 2.2], ['shells_c', 60, 3.75], ['shells_d', 60, 5.3]]) {
    await p.evaluate(([d, yaw]) => { const r = window.__ftf.rig; if (yaw != null) r.reset(yaw); r.maxDist = Math.max(r.maxDist, d); r.dist = d; r.tilt(-3); }, [d, yaw]);
    await p.waitForTimeout(5000);
    await p.screenshot({ path: `${out}/${n}.jpg`, quality: 88 });
  }
  console.log('errors', logs.slice(0, 6).join(' | '));
  await b.close();
})();
