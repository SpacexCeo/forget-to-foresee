// The lookout clearing on the hillside below the gate (town_outside.py CLEARINGS, the crownrift's home) at the
// game camera, from the road and from the far edge. Usage: node qa_lookout_ingame.cjs <outdir> [tag] (dist on :4190).
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2]; const tag = process.argv[3] || 'lookout'; const fogBase = process.argv[4] ? Number(process.argv[4]) : null; // optional: town fog base, metres below the streets (experiment) require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-watchdog'] });
  const logs = [];
  for (const tod of ['', 'dusk']) {
    const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
    p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
    await p.goto(`http://127.0.0.1:4190/?play=direct&town=1&tier=high${tod ? '&tod=' + tod : ''}`);
    await p.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 180000 });
    if (fogBase != null) await p.evaluate((d) => { const l = window.__ftf.lookdev; l.setAtmosphereFloor({ fogBaseY: 1200 - d, mistLevel: 1200 - 32 }); }, fogBase);
    const shot = async (name, pos, hd, dist) => {
      await p.evaluate(([pos, hd, dist]) => { const f = window.__ftf; f.player.teleport(pos, hd); f.rig.reset(hd + Math.PI); if (dist) f.rig.dist = dist; }, [pos, hd, dist]);
      await p.waitForTimeout(6000);
      await p.screenshot({ path: `${out}/${tag}_${tod || 'day'}_${name}.jpg`, quality: 86 });
    };
    // from the road's last bend (it arrives from the west), then from the bench side out over the parapet to the clouds
    await shot('road', [2, 1182, 100.8], Math.atan2(11, 2.2), 8);
    await shot('edge', [11, 1181, 99.5], 0.35, 7);
    await p.close();
  }
  console.log('errors', logs.slice(0, 6).join(' | '));
  await b.close();
})();
