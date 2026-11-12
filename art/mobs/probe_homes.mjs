// QA: every collision surface on the vertical line through each pack's home (town world), top to bottom.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:5199';
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.goto(`${url}/?play=direct&town=1&day1=0&mobs=1`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.town.mobs, null, { timeout: 600000 });
const r = await page.evaluate(async () => {
  const col = await import('/src/physics/collision.js'), W = window.__ftf.town.scene.world, out = {};
  for (const p of window.__ftf.town.mobs.brain.packs) {
    const hits = []; let y = 1320;
    for (let i = 0; i < 12; i++) { const h = col.rayCast(W, [p.home[0], y, p.home[2]], [0, -1, 0], 400, col.MASK_PLAYER); if (!h) break; hits.push([+h.point[1].toFixed(2), +h.normal[1].toFixed(2)]); y = h.point[1] - 0.05; }
    out[p.type + p.index] = { home: p.home.map((x) => +x.toFixed(1)), hits };
  }
  return out;
});
console.log(JSON.stringify(r));
await browser.close();
