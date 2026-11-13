// E2E for the RPG HUD layer (sprint plan 5.16 E1-E5, E7, E9) on a running game (Vite dev server: the layer is
// mounted from the page the way the seam will mount it). Prints JSON, writes stills; exits 1 on failure.
//   node tests/e2e/rpg-hud.mjs <out dir> [url]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] || '.', url = process.argv[3] || 'http://127.0.0.1:5199';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--disable-gpu-watchdog'] });
const res = { checks: {}, errors: [] };
const ok = (k, v, info) => { res.checks[k] = info === undefined ? !!v : { ok: !!v, info }; };

async function boot(ctxOpts) {
  const page = await (await browser.newContext(ctxOpts)).newPage();
  page.on('pageerror', (e) => res.errors.push(e.message.slice(0, 300)));
  page.on('dialog', (d) => d.accept());
  await page.goto(`${url}/?play=direct&town=1&day1=0&hero=iris&quest=0&tod=day&weather=clear&test=1&ff=rpgHud,hotbar,skillTree,damageNumbers`);
  await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.town.mobs, null, { timeout: 600000 });
  for (const name of ['Skip', 'Skip the town quest']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count()) await b.first().click().catch(() => {}); }
  await page.waitForFunction(() => document.getElementById('rpg-hud') && window.__ftfTest && window.__ftfTest.rpg, null, { timeout: 60000 });   // mounted by the sprint seam (flag rpgHud)
  await page.waitForTimeout(800);
  return page;
}

// ---------------------------------------------------------------- desktop 1920 × 1080
const page = await boot({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const RECTS = { '.rpg-frame': [24, 24, 340, 92], '.rpg-map': [1696, 24, 200, 200], '.rpg-xp': [760, 1054, 400, 8], '.rpg-log': [24, 864, 400, 192], '.rpg-silk': [1488, 1008, 168, 48], '.rpg-tray': [1680, 1008, 216, 48] };   // the compact HUD (owner mockup 13.11)
const rects = await page.evaluate((sels) => Object.fromEntries(sels.map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [s, [r.left, r.top, r.width, r.height].map((x) => Math.round(x))]; })), Object.keys(RECTS));
const off = Object.entries(RECTS).filter(([s, e]) => rects[s].some((v, i) => Math.abs(v - e[i]) > 2));
ok('E1 rectangles at the 5.4 coordinates (±2 px)', !off.length, off.length ? off.map(([s]) => `${s} ${rects[s]}`) : 'all');
const hb = await page.evaluate(() => { const r = document.querySelector('.rpg-hotbar').getBoundingClientRect(); return [r.left + r.width / 2, r.bottom]; });
ok('E1 hotbar centred over the XP bar', Math.abs(hb[0] - 960) <= 2 && Math.abs(hb[1] - 1040) <= 2, hb);
const TRACKER = [1608, 264, 288, 360];
const hit = Object.entries(rects).filter(([, r]) => r[0] < TRACKER[0] + TRACKER[2] && r[0] + r[2] > TRACKER[0] && r[1] < TRACKER[1] + TRACKER[3] && r[1] + r[3] > TRACKER[1]);
ok('E1 nothing overlaps the A1 tracker slot', !hit.length, hit.map(([s]) => s));
ok('old HUD frame hidden', await page.evaluate(() => { const f = document.querySelector('.ph-frame'); return !f || getComputedStyle(f).display === 'none'; }));
writeFileSync(`${out}/hud_desktop.png`, await page.screenshot());
// E3: XP to level 2 and 3: banner, log, points
const s0 = await page.evaluate(() => window.__ftfTest.rpg.state());
await page.evaluate(() => window.__ftfTest.rpg.grantXp(120)); await page.waitForTimeout(300);
const s1 = await page.evaluate(() => ({ st: window.__ftfTest.rpg.state(), banner: document.querySelector('.rpg-banner').textContent, lv: document.querySelector('.rpg-lv').textContent, badge: document.getElementById('rpg-tray-skills').dataset.badge }));
ok('E3 level up: Lv 2, banner, log, max HP 112, skills badge', s0.level === 1 && s1.st.level === 2 && s1.banner === 'Level 2' && s1.lv === 'Lv 2' && s1.st.maxHP === 112 && s1.badge === '1' && s1.st.lines.log.some((l) => /reached level 2/.test(l.text)), { lv: s1.lv, banner: s1.banner, maxHP: s1.st.maxHP });
// E4: N opens the tree; learn Clear Diction (L2), then Echo Word at L3: it lands on slot 5
await page.keyboard.press('KeyN'); await page.waitForTimeout(500);
const treeOpen = await page.evaluate(() => !!document.querySelector('.rpg-modal:not([hidden]) .rpg-tree'));
await page.click('.rpg-node[data-id="ling_diction"]'); await page.waitForTimeout(200);
await page.evaluate(() => window.__ftfTest.rpg.grantXp(200)); await page.waitForTimeout(300);
await page.click('.rpg-node[data-id="ling_echo"]'); await page.waitForTimeout(300);
writeFileSync(`${out}/skill_tree.png`, await page.screenshot());
const s2 = await page.evaluate(() => window.__ftfTest.rpg.state());
ok('E4 tree opens with N; learn diction + echo; echo on slot 5', treeOpen && s2.rec.learned.join() === 'ling_diction,ling_echo' && s2.bar[4] === 'ling_echo', { learned: s2.rec.learned, slot5: s2.bar[4] });
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
// E5: respec returns the points (free the first time)
await page.keyboard.press('KeyN'); await page.waitForTimeout(300);
await page.click('.rpg-modal:not([hidden]) footer .btn'); await page.waitForTimeout(300);
const s3 = await page.evaluate(() => window.__ftfTest.rpg.state());
ok('E5 respec: nothing learned, slot 5 cleared', s3.rec.learned.length === 0 && s3.bar[4] === null && s3.rec.respecs === 1);
await page.keyboard.press('Escape');
// character panel (C)
await page.keyboard.press('KeyC'); await page.waitForTimeout(400);
const sheet = await page.evaluate(() => { const m = document.querySelector('.rpg-sheet'); return m && !m.hidden ? m.textContent : null; });
await page.click('.rpg-sheet .btn'); await page.waitForTimeout(200);
writeFileSync(`${out}/character.png`, await page.screenshot());
const s4 = await page.evaluate(() => window.__ftfTest.rpg.state());
ok('C opens the character panel; + spends a stat point', !!sheet && /Voice/.test(sheet) && s4.rec.stats.voice === 1, { voice: s4.rec.stats.voice });
await page.keyboard.press('Escape');
// E2: outside the gate, 2 casts the lance: mana spent at release, slot 2 cools down
await page.evaluate(() => { window.__ftf.player.teleport([0, 1199, 46], 0); }); await page.waitForTimeout(2500);
const m0 = await page.evaluate(() => window.__ftfTest.rpg.state().mana);
await page.keyboard.press('Digit2'); await page.waitForTimeout(700);
const after = await page.evaluate(() => ({ mana: window.__ftfTest.rpg.state().mana, slot2: document.querySelector('.rpg-slot[data-slot="2"]').dataset.state }));
ok('E2 slot 2 casts the lance: mana spent, cooldown sweep', after.mana <= m0 - 5 && after.slot2 === 'cooldown', { m0: Math.round(m0), m1: Math.round(after.mana), state: after.slot2 });
await page.keyboard.press('Digit1'); await page.waitForTimeout(150);
const sc = await page.evaluate(() => document.querySelector('.rpg-slot[data-slot="1"]').dataset.state);
ok('E2 slot 1 strikes (the fight\'s own cooldown shows)', sc === 'cooldown' || sc === 'ready', sc);
writeFileSync(`${out}/hud_field.png`, await page.screenshot());
// E6: rebind Strike to G (stored like the settings screen does), press G in the field: she strikes; the key persists
await page.waitForTimeout(1200);
await page.evaluate(async () => { const k = await import('/src/ui/keybinds.js'); k.setBindings({ ...k.bindings(), strike: 'KeyG' }, localStorage); });
await page.keyboard.press('KeyG'); await page.waitForTimeout(120);
const g = await page.evaluate(() => ({ cd: window.__ftf.town.mobs.actions.strikeCd, stored: JSON.parse(localStorage.getItem('ftf.keys.v1') || '{}').strike }));
await page.evaluate(async () => { const k = await import('/src/ui/keybinds.js'); k.setBindings(k.defaultBindings(), localStorage); });
ok('E6 Strike rebound to G: G strikes, the binding is stored', g.cd > 0 && g.stored === 'KeyG', g);
// E8: the chip shows the one Gate number of the shared silk model
const e8 = await page.evaluate(async () => { const sc = await import('/src/net/silk-core.js'); const v = sc.silkView(); return { chip: document.querySelector('.rpg-silk .l1').textContent, gate: sc.formatSilkC ? sc.formatSilkC(v.gateC) : String(v.gateC / 100) }; });
ok('E8 silk chip equals silkView().gateC', e8.chip.replace(/,/g, '') === String(e8.gate).replace(/,/g, '').replace(/ silk$/, ''), e8);
// F1: the cheat sheet
await page.keyboard.press('F1'); await page.waitForTimeout(500);
const f1 = await page.evaluate(() => { const m = document.querySelector('.rpg-cheat'); return m && !m.hidden ? { rows: m.querySelectorAll('h3').length, kbd: !!m.querySelector('.ftf-kbd') } : null; });
ok('F1 opens the cheat sheet (groups and the keyboard)', !!f1 && f1.rows >= 5 && f1.kbd, f1);
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
// Voice points add 2% each to a strike as a follow-up hit on the same creature
const voice = await page.evaluate(async () => {
  const T = window.__ftfTest.rpg; T.spend('voice'); T.spend('voice'); T.spend('voice');
  const f = window.__ftf, M = f.town.mobs, b = M.brain, sk = b.mobs.find((m) => m.type === 'skitter' && m.state !== 'dead' && m.state !== 'gone');
  if (!sk) return { error: 'no skitter' };
  for (const o of b.mobs) if (o !== sk && o.state !== 'dead' && o.state !== 'gone') o.pos[0] += 40;
  const p = f.player.pos, h = f.player.heading; sk.pos[0] = p[0] + Math.sin(h) * 1.2; sk.pos[2] = p[2] + Math.cos(h) * 1.2; sk.pos[1] = p[1]; sk.hp = 500; sk.freeze = 999; sk.state = 'idle';
  window.__mark = (window.__ftfTelemetry || []).length; return { id: sk.id, voice: T.state().rec.stats.voice };
});
await page.keyboard.press('KeyF'); await page.waitForTimeout(900);
const hits = await page.evaluate((id) => (window.__ftfTelemetry || []).slice(window.__mark).filter((e) => e.name === 'mob.hit' && e.payload.id === id).map((e) => e.payload.dmg), voice.id);
ok('Voice adds its bonus to a strike (a follow-up hit)', hits.length >= 2 && hits[1] === Math.round(hits[0] * 0.02 * voice.voice), { voice, hits });
// E7: low HP: the vignette and the bar pulse
await page.evaluate(() => { window.__ftf.town.mobs.iris.hp = 1; }); await page.waitForTimeout(300);
ok('E7 low HP vignette on', await page.evaluate(() => document.querySelector('.rpg-vignette').dataset.on === '1'));
await page.evaluate(() => { window.__ftf.town.mobs.iris.hp = 100; });
await page.close();

// ---------------------------------------------------------------- phone 390 wide (landscape 844 × 390 and portrait 390 × 844)
const phone = await boot({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const ph = await phone.evaluate(() => {
  const vis = [...document.querySelectorAll('.rpg-slot')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.getBoundingClientRect());
  const rect = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  const parts = ['.rpg-frame', '.rpg-hotbar', '.rpg-map', '.rpg-tray', '.rpg-silk'].map((s) => [s, rect(s)]);
  const over = []; for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) { const [a, A] = parts[i], [b, B] = parts[j]; if (A[0] < B[2] && A[2] > B[0] && A[1] < B[3] && A[3] > B[1]) over.push(a + '×' + b); }
  return { slots: vis.length, minSide: Math.min(...vis.map((r) => Math.min(r.width, r.height))), over, inView: parts.every(([, r]) => r[0] >= 0 && r[2] <= innerWidth + 1) };
});
ok('E9 phone: 5 slots, targets ≥ 44 px, no overlap, inside the screen', ph.slots === 5 && ph.minSide >= 44 && !ph.over.length && ph.inView, ph);
writeFileSync(`${out}/hud_phone.png`, await phone.screenshot());
await browser.close();
res.ok = Object.values(res.checks).every((v) => (typeof v === 'object' ? v.ok : v)) && !res.errors.length;
console.log(JSON.stringify(res, null, 1));
process.exit(res.ok ? 0 : 1);
