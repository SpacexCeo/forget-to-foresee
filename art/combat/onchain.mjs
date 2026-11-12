// The on-chain beats for the jury trailer, from the real game (GPU server); every one of them only reads NEAR testnet
// (no wallet, no signature, no guest account). Frames f_0000.jpg.. (page screenshots, UI included) + report.json.
//   node art/combat/onchain.mjs shard  <out dir> [url]   judge path: forget the memory at trial 4, end trials to 6 ->
//                                                       the "Minted on NEAR testnet" toast and the shard #7 card
//   node art/combat/onchain.mjs replay <out dir> [url]   the recorded judge replay: root matches ftf-seasons.testnet
//   node art/combat/onchain.mjs holder <out dir> [url]   Profile -> NFTs -> Holder access -> Try the judge account
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [mode, out, url = 'http://127.0.0.1:5199'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
const errors = [], log = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 300)));
const wait = (ms) => page.waitForTimeout(ms);
let capturing = false, n = 0, t0 = 0;
const marks = [];
const mark = (what) => { marks.push({ what, frame: n, s: +((Date.now() - t0) / 1000).toFixed(2) }); log.push(what); };
let loop = null;
const start = () => { capturing = true; t0 = Date.now(); loop = (async () => { while (capturing) writeFileSync(`${out}/f_${String(n++).padStart(4, '0')}.jpg`, await page.screenshot({ type: 'jpeg', quality: 88 })); })(); };
const still = async (name) => writeFileSync(`${out}/${name}.png`, await page.screenshot());
const click = async (name, opts = {}) => { const b = page.getByRole('button', { name, ...opts }); if (!(await b.count())) { log.push('no button ' + name); return false; } await b.first().scrollIntoViewIfNeeded().catch(() => {}); await b.first().click().catch((e) => log.push('click ' + name + ' ' + e.message.slice(0, 80))); return true; };
const tick = async () => { await page.keyboard.press('KeyT'); await wait(500); await page.keyboard.press('KeyT'); await wait(1600); };
const hud = () => page.evaluate(() => (document.body.innerText.match(/Trial \d+ of \d+/) || [''])[0]);

if (mode === 'replay') {
  const link = readFileSync(new URL('../../README.md', import.meta.url), 'utf8').match(/\?replay=(r1\.[A-Za-z0-9_-]+)/)[1];
  await page.goto(`${url}/?replay=${link}`);
  start();
  await page.getByText(/equals the root committed on NEAR testnet|does NOT equal|never committed/).first().waitFor({ timeout: 180000 }).catch(() => log.push('no check line'));
  mark('check');
  const line = page.getByText(/equals the root committed on NEAR testnet/).first();
  if (await line.count()) { await line.scrollIntoViewIfNeeded().catch(() => {}); await line.evaluate((el) => { el.style.outline = 'none'; }); }
  await wait(5000); await still('replay');
} else if (mode === 'holder') {
  await page.goto(`${url}/?play=direct&town=1&day1=0&tex=full&hero=iris&mobs=0&tod=dusk`);
  await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 600000 });
  for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
  await wait(2500);
  start(); await wait(800);
  await page.locator('.ftf-town-profile').first().click().catch(() => log.push('no profile button')); await wait(1200); mark('profile');
  const tab = page.getByRole('tab', { name: 'NFTs' }).or(page.getByRole('button', { name: 'NFTs', exact: true })); if (await tab.count()) await tab.first().click(); await wait(1200); mark('nfts');
  await click(/Try the judge account/); mark('try');
  await page.getByText(/holds these tokens|holds no Forget/).first().waitFor({ timeout: 60000 }).catch(() => log.push('no holder answer'));
  mark('answer');
  await page.getByText(/holds these tokens/).first().scrollIntoViewIfNeeded().catch(() => {});
  await wait(3500); await still('holder_nfts');
  const ptab = page.getByRole('tab', { name: 'Profile' }).or(page.getByRole('button', { name: 'Profile', exact: true })); if (await ptab.count()) await ptab.last().click(); await wait(2500); mark('profile tab'); await still('holder_profile');
} else if (mode === 'shard') {
  await page.goto(`${url}/?demo=judge&mode=walk&day1=0&tex=full&mobs=0`);
  await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 600000 });
  for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
  await page.evaluate(async () => { const L = await import('/src/scenes/town-layout.js'); window.__ftf.player.teleport(L.TOWN_ALTAR_SPAWN.position.slice(), L.TOWN_ALTAR_SPAWN.heading); });
  await wait(2500);
  log.push('register ' + await page.evaluate(() => window.__ftf.town.register()));
  await page.waitForFunction(() => window.__ftf.play && !window.__ftf.town.active, null, { timeout: 180000 }).catch(() => errors.push('never reached the archipelago'));
  await page.getByText(/Trial 1 of \d+/).first().waitFor({ timeout: 90000 }).catch(() => log.push('no trial HUD'));
  await wait(2500);                                     // the arrival cinematic settles
  log.push(await hud());
  for (let i = 0; i < 3; i++) { await tick(); log.push(await hud()); }
  await page.keyboard.press('KeyM'); await wait(1500); await still('dbg_memories');
  const card = page.locator('*:has(> * button)').filter({ hasText: /Shells.{0,3} Call on the night of arrival/ }).last();
  const forget = card.getByRole('button', { name: /Forget it for a vision/ });
  if (await forget.count()) { await forget.first().scrollIntoViewIfNeeded(); await forget.first().click(); } else log.push('no forget button on the card');
  await wait(1200); await click(/Forget this memory/); await wait(2500); mark('forgot');
  await page.keyboard.press('Escape'); await wait(1200);
  await tick(); log.push(await hud());
  start();                                              // trial 5 -> 6 on camera: the toast
  await wait(600); await page.keyboard.press('KeyT'); await wait(500); await page.keyboard.press('KeyT'); mark('end trial 5');
  await page.getByText(/Minted on NEAR testnet/).first().waitFor({ timeout: 30000 }).then(() => mark('toast')).catch(() => log.push('no toast'));
  await wait(2500); log.push(await hud());
  // the toast's own "Open card", then the card in Memories (M only if the panel is not already open)
  if (await click(/^Open card$/)) { mark('open card'); await wait(4000); await still('shard_open'); await page.keyboard.press('Escape'); await wait(800); }
  const shardsOpen = async () => (await page.getByText(/Memory shards on NEAR/).count()) && (await page.getByText(/Memory shards on NEAR/).first().isVisible());
  if (!(await shardsOpen())) { await page.keyboard.press('KeyM'); await wait(1200); }
  mark('memories ' + (await shardsOpen()));
  const nft = page.getByText(/Shard #7/).last();
  if (await nft.count()) { await nft.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {}); mark('shard card'); } else log.push('no shard card');
  await wait(4500); await still('shard_card');
}
capturing = false; if (loop) await loop;
const secs = (Date.now() - t0) / 1000;
const res = { mode, frames: n, seconds: +secs.toFixed(1), fps: +(n / secs).toFixed(2), marks, log, errors };
writeFileSync(`${out}/report.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res));
await browser.close();
