// In-game check of the seated elder at the bench npc_bench_0 (town -9.6, 4.5, -12, sitter faces +X).
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '/root/w/art/ingame/out'; require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-watchdog'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const logs = [];
  p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 160)); });
  await p.goto('http://127.0.0.1:4190/?play=direct&town=1');
  await p.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 180000 });
  console.log('renderer', await p.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c.getExtension('WEBGL_debug_renderer_info'); return c.getParameter(e.UNMASKED_RENDERER_WEBGL); }));
  await p.addStyleTag({ content: '#ui, .hub-host, .wh-host, .pl-badge, .tf-host, [class^="d1-"], [class*=" d1-"], .d1-root, .d1-overlay { display: none !important; }' });
  const shots = [['elder_game_cam', [-6.0, 4.5, -13.5], Math.atan2(-3.6, 1.5), null], ['elder_close', [-7.6, 4.5, -12.9], Math.atan2(-2.0, 0.9), 3.4], ['elder_side', [-9.5, 4.5, -9.8], Math.PI, 3.6]];
  for (const [n, pos, hd, dist] of shots) {
    await p.evaluate(([pos, hd, dist]) => {
      const O = [0, 1200, 0]; const f = window.__ftf;
      f.player.teleport([pos[0] + O[0], pos[1] + O[1], pos[2] + O[2]], hd);
      f.rig.reset(hd + Math.PI);
      if (dist != null) f.rig.dist = dist;
    }, [pos, hd, dist]);
    await p.waitForTimeout(9000);
    await p.screenshot({ path: `${out}/${n}.jpg`, quality: 88 });
    console.log('shot', n);
  }
  console.log('errors', logs.slice(0, 8).join(' | '));
  await b.close();
})();
