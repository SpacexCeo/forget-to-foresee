const { chromium } = require('playwright');
(async () => {
  const out = '/root/w/ingame5'; require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-watchdog'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  await p.goto('http://127.0.0.1:4181/?demo=judge&play=direct&mode=walk');
  await p.waitForTimeout(15000);
  console.log('renderer', await p.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c.getExtension('WEBGL_debug_renderer_info'); return c.getParameter(e.UNMASKED_RENDERER_WEBGL); }));
  await p.addStyleTag({ content: '#ui, .hub-host, .wh-host, .pl-badge { display: none !important; }' });
  for (const [n, d, pitch] of [['far', 18, null], ['mid', 9, 0.35], ['close', 4.5, 0.2]]) {
    await p.evaluate(([d, pitch]) => { const r = window.__ftf.rig; r.dist = d; if (pitch != null && 'pitch' in r) r.pitch = pitch; }, [d, pitch]);
    await p.waitForTimeout(4000);
    await p.screenshot({ path: `${out}/${n}.jpg`, quality: 88 });
    console.log(n, JSON.stringify(await p.evaluate(() => document.elementsFromPoint(300, 250).slice(0, 4).map((e) => e.tagName + '#' + e.id + '.' + String(e.className).slice(0, 40) + ' ' + getComputedStyle(e).backgroundColor))));
    const px = await p.evaluate(() => { const c = document.querySelector('canvas'); const g = c.getContext('webgl2'); return [c.width, c.height]; });
    console.log(n, 'canvas', px);
  }
  console.log('errors', logs.slice(0, 6).join(' | '));
  await b.close();
})();
