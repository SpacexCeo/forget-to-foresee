// Before/after shots for the design pass (owner review 13.11, ?ff=all), desktop 1920 × 1080 and phone 390 × 844:
//   1 the first screen, 2 after Esc skips the prologue (what the onboarding shows), 3 the HUD once the name is given and
//   the card closed, 4 J (journal), 5 C (character). Lists page errors and the large fixed overlays on each step.
//   node art/ui/design_shots.mjs <out dir> <tag> [url]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [out, tag, url = 'http://127.0.0.1:4319/forget-to-foresee/'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const report = { errors: [], overlays: {} };
const overlays = (page) => page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => { const s = getComputedStyle(e); return s.position === 'fixed' && s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && e.offsetWidth > 160 && e.offsetHeight > 80; })
  .map((e) => (String(e.className || e.tagName).slice(0, 32)) + ' z' + getComputedStyle(e).zIndex));
for (const [dev, opts] of [['desk', { viewport: { width: 1920, height: 1080 } }], ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }]]) {
  for (const ff of ['?ff=all&', '?']) {
    const page = await (await browser.newContext(opts)).newPage();
    const name = `${tag}_${dev}${ff === '?' ? '_noff' : ''}`;
    page.on('pageerror', (e) => report.errors.push(`${name} ${e.message.slice(0, 200)}`));
    await page.goto(`${url}${ff}play=direct&town=1`);
    await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 300000 }).catch(() => report.errors.push(name + ' never ready'));
    const shot = async (k) => { writeFileSync(`${out}/${name}_${k}.png`, await page.screenshot()); report.overlays[`${name}_${k}`] = await overlays(page); };
    await page.waitForTimeout(4000); await shot('1first');
    if (ff === '?') { await page.close(); continue; }
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(1200); }
    await page.waitForTimeout(1500); await shot('2onboard');
    // finish the onboarding the way a player would: the name, then the card
    for (let i = 0; i < 10; i++) {
      const input = page.locator('.d1-panel input'); if (await input.count()) { await input.fill('Cy'); await page.locator('.d1-panel button[type=submit]').click().catch(() => {}); }
      const card = page.locator('.d1-card:not(.is-flipped)'); if ((await card.count()) === 2) await card.first().click().catch(() => {});
      const start = page.locator('.npe-card button.primary'); if (await start.count()) await start.first().click().catch(() => {});
      const claim = page.locator('.d1-panel .d1-btn'); if (await claim.count()) await claim.first().click().catch(() => {});
      await page.keyboard.press('Escape'); await page.waitForTimeout(2000);
    }
    await shot('3hud');
    if (dev === 'desk') { await page.keyboard.press('KeyJ'); await page.waitForTimeout(900); await shot('4journal'); await page.keyboard.press('Escape'); await page.waitForTimeout(500); await page.keyboard.press('KeyC'); await page.waitForTimeout(900); await shot('5char'); }
    await page.close();
  }
}
await browser.close();
writeFileSync(`${out}/${tag}_report.json`, JSON.stringify(report, null, 1)); console.log(JSON.stringify(report));
