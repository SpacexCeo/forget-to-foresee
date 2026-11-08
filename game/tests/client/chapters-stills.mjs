// Still frames of every chapter film for review (docs/chapters.md). Not a test: run it by hand.
//   node tests/client/chapters-stills.mjs            # all films at 1280x800, plus 1920x1080 and 390x844 samples
//   node tests/client/chapters-stills.mjs crisis     # one film
//   FTF_URL=http://localhost:5179 …                  # an already running dev server (else one is started)
// It opens the game with ?play=direct&seed=<judge seed>&film=<id>&stills=1 (cinematic/chapters/index.js
// advances the local season to that chapter and starts the film paused), seeks the film to the title,
// the middle of every shot and the final card, waits for the streamed models, and saves JPEGs under
// docs/chapters/. Chromium renders through SwiftShader here, so a frame takes a while; the film clock
// is seeked, never waited for.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../../../docs/chapters');
const JUDGE = 'cc161d308faa67539af44205b56b6d4f';
const FILMS = ['arrival', 'language', 'trust', 'crisis', 'vote', 'ending'];
const PORT = 5179;
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ids = only.length ? only : FILMS;
/** Extra viewports: one shot of a film at desktop 1080p and on a phone (the quality bar asks for all three sizes). */
const EXTRA = { arrival: [[1920, 1080, 1], [390, 844, 1], [390, 844, 'card']], crisis: [[1920, 1080, 2], [390, 844, 2]], ending: [[1920, 1080, 1], [390, 844, 'card']] };

async function ensureServer() {
  const url = process.env.FTF_URL || `http://localhost:${PORT}`;
  try { const r = await fetch(url); if (r.ok) return { url, child: null }; } catch { /* start one */ }
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: resolve(HERE, '../..'), stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 500)); try { const r = await fetch(url); if (r.ok) return { url, child }; } catch { /* wait */ } }
  throw new Error('vite did not start');
}

async function settle(page, maxMs = 30000) {
  const start = Date.now();
  for (;;) {
    const s = await page.evaluate(() => {
      const g = window.__ftf;
      for (const a of g.play.agents.agents.values()) if (a.state === 'absent') a.load();
      g.streamer.timer = 0;
      const st = g.streamer.stats();
      const agentsBusy = g.play.agents.stats().some((a) => a.state === 'loading');
      return { loading: st.loading, idle: st.idle, agentsBusy };
    });
    if (s.loading === 0 && s.idle === 0 && !s.agentsBusy) return true;
    if (Date.now() - start > maxMs) return false;
    await page.waitForTimeout(400);
  }
}

const frames = (page, n = 2) => page.evaluate((k) => new Promise((r) => { const step = (i) => (i <= 0 ? r() : requestAnimationFrame(() => step(i - 1))); step(k); }), n);

async function capture(browser, url, id, width, height, which, tag) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const cdp = await page.context().newCDPSession(page);
  const shot = async (path) => { const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }); writeFileSync(path, Buffer.from(r.data, 'base64')); };
  // desktop frames force the high tier (SwiftShader detects 'low', which would play the cheap films); phone frames keep the phone profile and its cheap films
  await page.goto(`${url}/?play=direct&seed=${JUDGE}&lang=en&film=${id}&stills=1${width < height ? '&profile=phone' : '&tier=high'}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ftf && window.__ftf.play && window.__ftf.play.chapters && window.__ftf.play.chapters.playing, null, { timeout: 180000 });
  const info = await page.evaluate(() => { const p = window.__ftf.play.chapters.player; const tl = p.timeline(); return { film: p.film.id, title: document.querySelector('#ch-film .ch-title').textContent, shots: p.film.shots.map((s, i) => ({ id: s.id, mid: (tl.shots[i].start + tl.shots[i].end) / 2 + (i === 0 ? 1.0 : 0) })), titleT: 1.3, cardT: tl.cardStart + 1.6, seconds: p.film.seconds, profile: p.film.profile }; });
  const list = which === 'all' ? [['title', info.titleT], ...info.shots.map((s, i) => [`${i + 1}-${s.id}`, s.mid]), ['card', info.cardT]]
    : which === 'card' ? [['card', info.cardT]] : [[`${which}-${info.shots[which - 1].id}`, info.shots[which - 1].mid]];
  const out = [];
  for (const [name, t] of list) {
    await page.evaluate((x) => window.__ftf.play.chapters.player.seek(x), t);
    await frames(page, 2);
    const loaded = await settle(page, out.length ? 40000 : 150000); // the first shot waits for the big models to decode
    await frames(page, 2);
    const sub = await page.evaluate(() => ({ sub: document.querySelector('#ch-film .ch-sub').textContent, card: document.querySelector('#ch-film .ch-matters').textContent, shot: window.__ftf.play.chapters.player.shotIndex }));
    const file = `${id}-${name}${tag ? '-' + tag : ''}.jpg`;
    await shot(resolve(OUT, file));
    out.push({ file, t: +t.toFixed(2), loaded, ...sub });
    console.log(`  ${file.padEnd(34)} t=${t.toFixed(1)}s loaded=${loaded} ${name === 'card' ? sub.card : sub.sub}`);
  }
  if (errors.length) console.log('  console errors:', errors.slice(0, 5));
  await page.close();
  return { info, out, errors };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { url, child } = await ensureServer();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const report = {};
  try {
    for (const id of ids) {
      console.log(`${id} @ 1280x800`);
      report[id] = await capture(browser, url, id, 1280, 800, 'all', '');
      for (const [w, h, which] of EXTRA[id] || []) {
        console.log(`${id} @ ${w}x${h} shot ${which}`);
        const r = await capture(browser, url, id, w, h, which, `${w}x${h}`);
        report[id].extra = (report[id].extra || []).concat(r.out);
        report[id].errors.push(...r.errors);
      }
    }
  } finally {
    await browser.close();
    if (child) child.kill();
  }
  writeFileSync(resolve(OUT, 'stills.json'), JSON.stringify(report, null, 1));
  console.log('written', resolve(OUT, 'stills.json'));
}

main().catch((e) => { console.error(e); process.exit(1); });
