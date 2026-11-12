// A contact sheet of every weather state at three hours, from the real game outside the town walls:
//   node art/tools/weather_sheet.mjs <out.jpg> [--url http://127.0.0.1:5211] [--tier high|low] [--gpu] [--hours afternoon,dusk,night]
// Rows are the hours, columns the weather states (clear, haze, fog, overcast, drizzle, rain, storm). Each cell is the
// game's own third-person view of the heroine on the field. Needs a running dev server, Playwright and Pillow-free:
// the sheet is composed in the page (canvas) and saved as one JPEG.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2];
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:5211'), tier = arg('tier', 'high'), hours = arg('hours', 'afternoon,dusk,night').split(',');
const STATES = ['clear', 'haze', 'fog', 'overcast', 'drizzle', 'rain', 'storm'], CW = 480, CH = 270;
const gpu = ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'];
const browser = await chromium.launch({ args: process.argv.includes('--gpu') ? gpu : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
await page.goto(`${url}/?play=direct&town=1&day1=0&quest=0&tex=full&cycle=off&mobs=0&tier=${tier}`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 900000 });
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
await page.addStyleTag({ content: '#ui, .hub-host, .wh-host, .pl-badge, .ftf-town-prompt, .ftf-cast-hint, .ph { display: none !important; }' });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const f = window.__ftf, col = await import('/src/physics/collision.js');
  let y = 1300; for (let i = 0; i < 8; i++) { const h = col.rayCast(f.town.scene.world, [-35, y, 59.5], [0, -1, 0], 500, col.MASK_PLAYER); if (!h) break; if (h.normal[1] > 0.7) { y = h.point[1]; break; } y = h.point[1] - 0.05; }
  f.player.teleport([-35, y + 0.1, 59.5], Math.PI / 2);
});
// the camera: behind her and low, looking across the field to the horizon (the game's own rig, then placed)
await page.evaluate(() => {
  const f = window.__ftf, orig = f.rig.update.bind(f.rig);
  f.rig.update = (...a) => { orig(...a); const p = f.player.renderPos ? f.player.renderPos(1) : f.player.pos, cam = f.rig.camera; cam.position.set(p[0] - 5.2, p[1] + 1.9, p[2] + 1.6); cam.lookAt(p[0] + 30, p[1] + 2.2, p[2] - 4); cam.updateMatrixWorld(true); };
});
await page.waitForTimeout(2500);
const cells = [];
for (const hour of hours) for (const st of STATES) {
  await page.evaluate(([hour, st]) => { const L = window.__ftf.lookdev; L.setPreset(hour); L.setWeather(st, { immediate: true }); }, [hour, st]);
  await page.waitForTimeout(1400);
  cells.push((await page.screenshot({ type: 'jpeg', quality: 90 })).toString('base64'));
}
const sheet = await page.evaluate(async ([cells, cols, CW, CH, hours, STATES]) => {
  const c = document.createElement('canvas'); c.width = CW * cols; c.height = CH * (cells.length / cols); const g = c.getContext('2d');
  for (let i = 0; i < cells.length; i++) { const im = new Image(); im.src = 'data:image/jpeg;base64,' + cells[i]; await im.decode(); g.drawImage(im, (i % cols) * CW, Math.floor(i / cols) * CH, CW, CH);
    g.font = '14px sans-serif'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect((i % cols) * CW, Math.floor(i / cols) * CH, 150, 20); g.fillStyle = '#fff'; g.fillText(hours[Math.floor(i / cols)] + ' / ' + STATES[i % cols], (i % cols) * CW + 5, Math.floor(i / cols) * CH + 15); }
  return c.toDataURL('image/jpeg', 0.86).split(',')[1];
}, [cells, STATES.length, CW, CH, hours, STATES]);
writeFileSync(out, Buffer.from(sheet, 'base64'));
console.log(JSON.stringify({ out, cells: cells.length, tier, errors: errors.slice(0, 3) }));
await browser.close();
