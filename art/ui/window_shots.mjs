// Design pass shots of the windows that landed after the first pass (owner review 13.11): the market (B), the journal
// (J), the player card, the account panel and the tracker, desktop 1920 × 1080 and phone 390 × 844, on the Vite dev
// server (the panels are opened through their modules). Also checks that a tap outside closes each one.
//   node art/ui/window_shots.mjs <out dir> <tag> [url]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [out, tag, url = 'http://127.0.0.1:5299/'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const report = { errors: [], outside: {} };
for (const [dev, opts] of [['desk', { viewport: { width: 1920, height: 1080 } }], ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }]]) {
  const page = await (await browser.newContext(opts)).newPage();
  const name = (k) => `${tag}_${dev}_${k}`;
  page.on('pageerror', (e) => report.errors.push(`${dev} ${e.message.slice(0, 200)}`));
  await page.goto(`${url}?ff=all&play=direct&town=1&day1=0&intro=0&quest=0`);
  await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 300000 });
  for (const n of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name: n, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
  await page.waitForTimeout(3000);
  writeFileSync(`${out}/${name('0hud')}.png`, await page.screenshot());
  const tapOutside = async (sel) => { await page.mouse.click(6, Math.round((opts.viewport.height) / 2)); await page.waitForTimeout(500); return !(await page.locator(sel).count()); };
  // the market
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ftf:market-open', { detail: {} })));
  await page.waitForTimeout(2500); writeFileSync(`${out}/${name('1market')}.png`, await page.screenshot());
  report.outside[name('market')] = await tapOutside('.mk2-wrap');
  // the journal
  if (dev === 'desk') { await page.keyboard.press('KeyJ'); } else { await page.locator('.ftf-quest-log-btn, #rpg-tray-journal').first().click().catch(() => {}); }
  await page.waitForTimeout(1200); writeFileSync(`${out}/${name('2journal')}.png`, await page.screenshot());
  report.outside[name('journal')] = await tapOutside('.fj-back');
  // the player card (the demo player's record) and the account panel, through their modules
  await page.evaluate(async () => {
    const [{ createPlayI18n }, pc] = await Promise.all([import('/src/play/i18n.js'), import('/src/play/player-card.js')]);
    const i18n = createPlayI18n('en'); window.__t = (k, a) => i18n.t(k, a);
    window.__pc = pc.createPlayerCard({ t: window.__t, storage: localStorage, read: async () => ({ silkC: 4200, nfts: [] }) });
    window.__pc.open({ id: 'demo-1', name: 'Mira', account: 'mira.guests.ftf-coordinator.testnet', skin: 'elise' });
  });
  await page.waitForTimeout(1500); writeFileSync(`${out}/${name('3card')}.png`, await page.screenshot());
  report.outside[name('card')] = await tapOutside('.pc-wrap');
  await page.evaluate(async () => { const a = await import('/src/play/account-panel.js'); a.openAccountPanel({ t: window.__t, makeLogin: () => Promise.resolve({ state: 'guest', subscribe: () => () => {} }), nickname: 'Cy' }); });
  await page.waitForTimeout(1200); writeFileSync(`${out}/${name('4account')}.png`, await page.screenshot());
  report.outside[name('account')] = await tapOutside('.acct');
  await page.close();
}
await browser.close();
writeFileSync(`${out}/${tag}_windows.json`, JSON.stringify(report, null, 1)); console.log(JSON.stringify(report));
