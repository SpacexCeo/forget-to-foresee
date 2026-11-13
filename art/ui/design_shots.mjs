// Before/after shots for the design pass (owner review 13.11, ?ff=all): the first screen (prompts and cards as they
// come), then J (journal), C (character) and the HUD after the onboarding, desktop and phone. Page errors are listed.
//   node art/ui/design_shots.mjs <out dir> <tag> [url]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [out, tag, url = 'http://127.0.0.1:4319/forget-to-foresee/'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const report = { errors: [], shots: [] };
for (const [dev, opts] of [['desk', { viewport: { width: 1920, height: 1080 } }], ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }]]) {
  for (const ff of ['?ff=all&', '?']) {
    const page = await (await browser.newContext(opts)).newPage();
    page.on('pageerror', (e) => report.errors.push(`${dev}${ff} ${e.message.slice(0, 200)}`));
    await page.goto(`${url}${ff}play=direct&town=1`);
    await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 600000 }).catch(() => report.errors.push(dev + ' never ready'));
    await page.waitForTimeout(6000);
    const name = `${tag}_${dev}${ff === '?' ? '_noff' : ''}`;
    writeFileSync(`${out}/${name}_1first.png`, await page.screenshot()); report.shots.push(name + '_1first');
    if (ff !== '?') {
      if (dev === 'desk') { await page.keyboard.press('KeyJ'); await page.waitForTimeout(900); writeFileSync(`${out}/${name}_2journal.png`, await page.screenshot()); await page.keyboard.press('Escape'); await page.waitForTimeout(400); await page.keyboard.press('KeyC'); await page.waitForTimeout(900); writeFileSync(`${out}/${name}_3char.png`, await page.screenshot()); }
      report.overlays = report.overlays || {}; report.overlays[name] = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => { const s = getComputedStyle(e); return (s.position === 'fixed') && s.display !== 'none' && s.visibility !== 'hidden' && +s.zIndex >= 20 && e.offsetWidth > 120 && e.offsetHeight > 60; }).map((e) => (e.className && String(e.className).slice(0, 40)) + ' z' + getComputedStyle(e).zIndex));
    }
    await page.close();
  }
}
await browser.close();
writeFileSync(`${out}/${tag}_report.json`, JSON.stringify(report, null, 1)); console.log(JSON.stringify(report));
