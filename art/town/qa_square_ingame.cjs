// The jury's first views at the game camera, per hour: the square from the spawn, the altar close-up and the three
// shop doors. Usage: node qa_square_ingame.cjs <outdir> [hours=dusk,night] (a built dist served on :4190).
const { chromium } = require('playwright');
const SHOPS = { exchange: [12.8, 1204.5, -9.4, 4.7126], scribe: [-12.8, 1204.5, -9, 1.5706], inn: [-9.6, 1202.5, 8.6, 0] }; // door + street heading (town-layout.js TOWN_SHOPS)
(async () => {
  const out = process.argv[2]; require('fs').mkdirSync(out, { recursive: true });
  const hours = (process.argv[3] || 'dusk,night').split(',');
  const b = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-watchdog'] });
  const logs = [];
  for (const tod of hours) {
    const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
    p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text().slice(0, 160)); });
    await p.goto(`http://127.0.0.1:4190/?play=direct&town=1&tod=${tod}&tier=high`);
    await p.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 180000 });
    await p.addStyleTag({ content: '#ui, .hub-host, .wh-host, .pl-badge, .ftf-town-prompt, [class^="d1-"], [class*=" d1-"] { display: none !important; }' });
    await p.waitForTimeout(5000);
    await p.screenshot({ path: `${out}/${tod}_spawn.jpg`, quality: 88 });
    const shot = async (name, pos, hd, dist) => {
      await p.evaluate(([pos, hd, dist]) => { const f = window.__ftf; f.player.teleport(pos, hd); f.rig.reset(hd + Math.PI); if (dist) f.rig.dist = dist; }, [pos, hd, dist]);
      await p.waitForTimeout(3500);
      await p.screenshot({ path: `${out}/${tod}_${name}.jpg`, quality: 88 });
    };
    await shot('square', [0, 1200, 20.5], Math.PI, 13);
    await shot('altar', [0, 1204.98, -5.5], Math.PI, 4.5);
    for (const [id, [x, y, z, h]] of Object.entries(SHOPS)) {
      const dx = Math.sin(h), dz = Math.cos(h); // street heading points away from the door
      await shot(`door_${id}`, [x + dx * (id === 'inn' ? 1.6 : 3.5), y + 0.3, z + dz * (id === 'inn' ? 1.6 : 3.5)], h + Math.PI, id === 'inn' ? 3.2 : 5);
    }
    await p.close();
  }
  console.log('errors', logs.slice(0, 6).join(' | '));
  await b.close();
})();
