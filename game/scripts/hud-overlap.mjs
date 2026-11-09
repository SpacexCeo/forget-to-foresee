#!/usr/bin/env node
// HUD overlap check (docs/ui-polish.md §2.4): walks the main play states in headless Chromium and fails
// when the bounding boxes of two visible HUD elements intersect. No HUD element may overlap or partly
// cover another at any viewport in any locale (owner, 08.11).
//
//   cd game && npm run dev -- --host 127.0.0.1 --port 5173 &
//   npm run hud:overlap -- [--viewports 1280x800,1920x1080,390x844,390x664,390x560,375x500,360x480,667x300] [--langs en,uk,ru,it,zh]
//                          [--states island,signs,memories,help,map,shell,shell-memories,card,walk,scroll,agent,walk-memories]
//                          [--out .scratch/overlap] [--base http://127.0.0.1:5173] [--shots all|fail|none]
//
// SwiftShader renders at a few FPS, so states are driven through window.__ftf.play.handleKey(...) and
// teleports (player.pos), never through page.click. Exit code 1 when any overlap was found.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true'] : null)).filter(Boolean));
const BASE = args.base || 'http://127.0.0.1:5173';
const VIEWPORTS = (args.viewports || '1280x800,1920x1080,390x844,390x664,390x560,375x500,360x480,667x300').split(',').map((s) => s.split('x').map(Number));
const LANGS = (args.langs || 'en,uk,ru,it,zh').split(',');
const ALL_STATES = ['island', 'signs', 'memories', 'help', 'map', 'shell', 'shell-memories', 'card', 'walk', 'scroll', 'agent', 'walk-memories'];
const STATES = (args.states || ALL_STATES.join(',')).split(',');
const OUT = args.out || '.scratch/overlap';
const SHOTS = args.shots || 'fail';
fs.mkdirSync(OUT, { recursive: true });

const require = createRequire(import.meta.url);
let chromium;
for (const p of ['playwright', '/opt/node-tools/node_modules/playwright/index.js']) { try { ({ chromium } = require(p)); break; } catch { /* next */ } }
if (!chromium) { console.error('playwright not found'); process.exit(2); }

/** Leaf HUD components whose boxes must not intersect. Ancestors/descendants are never compared. */
const SELECTORS = [
  // world HUD, desktop
  '.wh-trial', '.wh-quest', '.wh-toast', '.wh-signs', '.wh-log__tabs', '.wh-log__body', '.wh-prompt', '.wh-dialogue__line', '.wh-dialogue__reply', '.wh-hotbar',
  // world HUD, phone (docs/ui-mobile-hud.md): top bar, Shell selector, prompt, objective, Iris line, navigation, sheets
  '.wh-m-menu', '.wh-m-status', '.wh-m-shells', '.wh-m-prompt', '.wh-m-objective', '.wh-m-iris', '.wh-m-nav', '.wh-m-sheet', '.wh-sheet',
  // world HUD, the earlier phone stack (status/log/actions packages mounted with layout: 'mobile'; the preview page)
  '.wh-topbar__btn', '.wh-topbar__logo', '.wh-quest--mobile', '.wh-quest__dots', '.wh-trial--mobile', '.wh-tiles', '.wh-prompt--mobile', '.wh-dialogue--mobile',
  // play layer, hub, greybox leftovers, scene controls, nameplates
  '.pl-panel', '.pl-context', '.pl-help', '.pl-info', '.pl-badge', '#prompt', '#toast', '.ftf-scene-cue', '.ftf-scene-tools', '.ftf-run-toggle', '.ftf-hud-toast',
  '.hub-dock', '.hub-read', '.hub-card', '.hub-status', '.pl-plate',
  // island map (task H)
  '.ftf-map', '.ftf-map-fab',
  // round fabs: the Chronicle (chapters) and the recap "?" (QA-035: they sat over the phone tiles and the map button)
  '.ch-fab', '.a11y-recap-btn',
];

const READY = () => window.__ftf && window.__ftf.play && window.__ftf.play.session && window.__ftf.play.session.obs;

/** Runs in the page: visible boxes of the selectors and every intersecting pair. */
function measure(selectors) {
  const vw = innerWidth, vh = innerHeight;
  const seen = new Set();
  const boxes = [];
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      if (seen.has(el)) continue;
      seen.add(el);
      let e = el, ok = true;
      while (e && e !== document.body) {
        const cs = getComputedStyle(e);
        // data-open="false" / inert: a closing panel whose 160 ms visibility transition SwiftShader stretches to seconds
        if (e.hidden || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05 || e.dataset.open === 'false' || e.hasAttribute('inert') || e.getAttribute('aria-hidden') === 'true' && e !== el) { ok = false; break; }
        e = e.parentElement;
      }
      if (!ok) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
      const label = sel + (el.className && typeof el.className === 'string' ? '' : '') + (el.textContent ? ' "' + el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40) + '"' : '');
      boxes.push({ el, sel, label, rect: [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v)) });
    }
  }
  const pairs = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ix = Math.min(a.rect[2], b.rect[2]) - Math.max(a.rect[0], b.rect[0]);
    const iy = Math.min(a.rect[3], b.rect[3]) - Math.max(a.rect[1], b.rect[1]);
    if (ix > 1 && iy > 1) pairs.push({ a: a.label, b: b.label, ra: a.rect, rb: b.rect, overlap: [ix, iy] });
  }
  return { boxes: boxes.map(({ label, rect }) => ({ label, rect })), pairs, body: document.body.className };
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = [];
let failures = 0;

for (const [w, h] of VIEWPORTS) for (const lang of LANGS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  let page = await ctx.newPage();
  const consoleIssues = [];
  const hook = (p) => {
    p.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message/.test(m.text())) consoleIssues.push(m.type() + ': ' + m.text().slice(0, 160)); }); // driver chatter (SwiftShader ReadPixels stalls) is not the game's
    p.on('pageerror', (e) => consoleIssues.push('pageerror: ' + e.message));
    p.on('crash', () => consoleIssues.push('crash'));
  };
  hook(page);
  const tag = `${w}x${h}-${lang}`;
  const alive = () => page.evaluate(READY).catch(() => false);
  async function load(mode) {
    if (page.isClosed()) { page = await ctx.newPage(); hook(page); }
    await page.goto(`${BASE}/?demo=judge&play=direct&lang=${lang}${mode ? '&mode=' + mode : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(READY, null, { timeout: 180000 });
    await page.waitForTimeout(mode ? 3500 : 5000);
  }
  const key = async (k, ms = 2000) => { await page.evaluate((k) => window.__ftf.play.handleKey(k), k); await page.waitForTimeout(ms); };
  const teleport = async (x, z, ms = 2500) => {
    await page.evaluate(([x, z]) => { const p = window.__ftf.player; p.pos[0] = x; p.pos[2] = z; p.pos[1] = 0; const s = window.__ftf.play.session; if (s && s.trail) s.trail.reset(p.pos); }, [x, z]);
    await page.waitForTimeout(ms);
  };
  async function check(state) {
    const m = await page.evaluate(measure, SELECTORS);
    const shotPath = path.join(OUT, `${tag}-${state}.jpg`);
    if (SHOTS === 'all' || (SHOTS === 'fail' && m.pairs.length)) await page.screenshot({ path: shotPath, type: 'jpeg', quality: 70, timeout: 240000 }).catch(() => {});
    report.push({ viewport: `${w}x${h}`, lang, state, boxes: m.boxes.length, overlaps: m.pairs, body: m.body });
    failures += m.pairs.length;
    const line = `${tag} ${state.padEnd(15)} boxes ${String(m.boxes.length).padStart(2)}  overlaps ${m.pairs.length}`;
    console.log(line);
    for (const p of m.pairs) console.log(`    ${p.a}  ×  ${p.b}  (${p.overlap[0]}×${p.overlap[1]} px)  ${JSON.stringify(p.ra)} ${JSON.stringify(p.rb)}`);
  }
  let mode = null, loaded = false;
  const ensure = async (want) => { if (!loaded || mode !== want || !(await alive())) { await load(want); mode = want; loaded = true; } };
  const reset = async () => { await key('Escape', 400); await key('Escape', 400); };

  for (const st of STATES) for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (['island', 'signs', 'memories', 'help', 'map', 'shell', 'shell-memories', 'card'].includes(st)) {
        await ensure(null);
        if (st === 'island') { await reset(); await check(st); }
        if (st === 'signs') { await reset(); await key('KeyV', 1500); await check(st); }
        if (st === 'memories') { await reset(); await key('KeyM'); await check(st); }
        if (st === 'help') { await reset(); await key('KeyH'); await check(st); }
        if (st === 'map') { await reset(); await key('KeyN'); await check(st); await key('KeyN', 800); }
        if (st === 'shell' || st === 'shell-memories') {
          await reset();
          const inShell = await page.evaluate(() => window.__ftf.play.zone === 'shell');
          if (!inShell) { await key('KeyF', 500); await page.waitForFunction(() => window.__ftf.play.zone === 'shell' && document.querySelector('.hub-read'), null, { timeout: 60000 }); await page.waitForTimeout(2500); }
          if (st === 'shell-memories') await key('KeyM');
          await check(st);
        }
        if (st === 'card') {
          await reset();
          // a synthetic decision card (the real ones depend on the trial); same renderer, same box
          await page.evaluate(() => { const hub = window.__ftf.play.hub; if (!hub) return; hub.card = { id: 'qa-card', kind: 'offer', offer: { from: 'moss', kind: 'loan', price: 5, args: {} } }; hub.changed(); });
          await page.waitForTimeout(1000);
          await check(st);
          await page.evaluate(() => { const hub = window.__ftf.play.hub; if (hub) { hub.card = null; hub.changed(); } });
        }
      } else {
        await ensure('walk');
        if (st === 'walk') { await reset(); await check(st); }
        if (st === 'scroll') { await reset(); await teleport(1.6, 0.4); await check(st); }
        if (st === 'agent') {
          await reset();
          await page.evaluate(() => { const play = window.__ftf.play, p = window.__ftf.player; const a = play.agents.agents.get('frost'); const y = a.root.rotation.y; p.pos[0] = a.root.position.x + Math.sin(y) * 2.2; p.pos[2] = a.root.position.z + Math.cos(y) * 2.2; p.pos[1] = a.root.position.y; });
          await page.waitForTimeout(2500);
          await check(st);
        }
        if (st === 'walk-memories') { await reset(); await key('KeyM'); await check(st); }
      }
      break;
    } catch (e) {
      // a Vite reload (an edit while the run is on) or a lost tab: load again and replay the state once
      loaded = false;
      if (attempt === 0) { console.log(`${tag} ${st}: retry (${e.message.split('\n')[0].slice(0, 80)})`); continue; }
      console.log(`${tag} ${st}: ERROR ${e.message.split('\n')[0]}`);
      report.push({ viewport: `${w}x${h}`, lang, state: st, error: e.message.split('\n')[0] });
      failures++;
    }
  }
  const issues = consoleIssues.filter((s, i, a) => a.indexOf(s) === i);
  console.log(`${tag} console errors/warnings: ${issues.length}${issues.length ? '\n    ' + issues.slice(0, 6).join('\n    ') : ''}`);
  report.push({ viewport: `${w}x${h}`, lang, console: issues });
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(`\n${failures ? 'FAIL' : 'OK'}: ${failures} overlap(s)/error(s); report ${path.join(OUT, 'report.json')}`);
process.exit(failures ? 1 : 0);
