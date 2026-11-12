// A sheet of the two story objects on the town square from the real game: the Gate-Loom (dormant, ready, spent) and
// the Shell monument, each from the front and three-quarter.
//   node art/tools/props_sheet.mjs <out.jpg> [--url http://127.0.0.1:5211] [--gpu] [--tod dusk]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2];
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const url = arg('url', 'http://127.0.0.1:5211'), tod = arg('tod', 'dusk');
const gpu = ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'];
const browser = await chromium.launch({ args: process.argv.includes('--gpu') ? gpu : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
await page.goto(`${url}/?play=direct&town=1&day1=0&quest=0&tex=full&cycle=off&mobs=0&tod=${tod}`);
await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.iris && window.__ftf.iris.irisModel, null, { timeout: 900000 });
for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
await page.addStyleTag({ content: '#ui, .hub-host, .wh-host, .pl-badge, .ftf-town-prompt, .ftf-cast-hint, .ph, .ftf-objective { display: none !important; }' });
await page.waitForFunction(() => window.__ftf.scene.getObjectByName('story_portal') && window.__ftf.scene.getObjectByName('story_shell_board'), null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(3000);
await page.evaluate(() => {
  const f = window.__ftf, orig = f.rig.update.bind(f.rig); window.__view = null;
  f.rig.update = (...a) => { orig(...a); const v = window.__view; if (!v) return; const cam = f.rig.camera; cam.position.set(v.from[0], v.from[1], v.from[2]); cam.lookAt(v.to[0], v.to[1], v.to[2]); cam.updateMatrixWorld(true); };
});
const cells = [];
const shoot = async (name, yaw, dist, h, look) => {
  const ok = await page.evaluate(([name, yaw, dist, h, look]) => {
    const f = window.__ftf, o = f.scene.getObjectByName(name); if (!o) return false;
    if (look !== undefined && f.storyProps && f.storyProps.portal && f.storyProps.portal.debugLook) f.storyProps.portal.debugLook(look);
    const p = o.position, a = o.rotation.y + yaw; window.__view = { from: [p.x + Math.sin(a) * dist, p.y + h + 0.5, p.z + Math.cos(a) * dist], to: [p.x, p.y + h, p.z] }; return true;
  }, [name, yaw, dist, h, look]);
  if (!ok) return; await page.waitForTimeout(1300); cells.push((await page.screenshot({ type: 'jpeg', quality: 90 })).toString('base64'));
};
await shoot('story_portal', 0, 6.5, 1.5, 'dormant'); await shoot('story_portal', 0.6, 6.5, 1.5, 'dormant');
await shoot('story_portal', 0, 6.5, 1.5, 'ready'); await shoot('story_portal', 0, 6.5, 1.5, 'spent');
await shoot('story_shell_board', 0, 4.2, 1.0); await shoot('story_shell_board', 0.8, 4.2, 1.0); await shoot('story_shell_board', -0.9, 3.0, 1.1);
const sheet = await page.evaluate(async (cells) => {
  const c = document.createElement('canvas'); c.width = 400 * cells.length; c.height = 300; const g = c.getContext('2d');
  for (let i = 0; i < cells.length; i++) { const im = new Image(); im.src = 'data:image/jpeg;base64,' + cells[i]; await im.decode(); g.drawImage(im, i * 400, 0, 400, 300); }
  return c.toDataURL('image/jpeg', 0.88).split(',')[1];
}, cells);
writeFileSync(out, Buffer.from(sheet, 'base64'));
console.log(JSON.stringify({ out, cells: cells.length, errors: errors.slice(0, 3) }));
await browser.close();
