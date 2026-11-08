#!/usr/bin/env node
// World HUD parity check (docs/ui-world-hud.md §10). Starts Vite, renders hud-preview.html and
// compares it with the owner's mockup (git-ignored .scratch/ref/*.png) at the mockup's pixel size.
//
//   node scripts/wh-compare.mjs --layout desktop|mobile [--sheet] [--lang en|ru] [--out .scratch/cmp]
//
// Writes into --out: hud-<name>.png (HUD over the plain backdrop), ref-<name>.png (the mockup crop),
// overlay-<name>.png (HUD at 50 % over the mockup), diff-<name>.png (|hud - ref|, HUD-only pixels),
// side-<name>.png (ref | hud), and prints the box of every component with the mean difference inside it.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { createServer } = await import('vite');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const layout = arg('layout', 'desktop') === 'mobile' ? 'mobile' : 'desktop';
const sheet = argv.includes('--sheet');
const lang = arg('lang', 'en');
const out = resolve(ROOT, arg('out', '.scratch/cmp'));
const name = layout + (sheet ? '-sheet' : '') + (lang !== 'en' ? '-' + lang : '');
mkdirSync(out, { recursive: true });

// Desktop: 1811×868 at 1×. Mobile: 390×876 CSS px at the mockup's 1.4231× so pixels line up.
const VIEW = layout === 'mobile'
  ? { viewport: { width: 390, height: 876 }, deviceScaleFactor: 1.4231, isMobile: true, hasTouch: true }
  : { viewport: { width: 1811, height: 868 }, deviceScaleFactor: 1 };

const COMPONENTS = ['.wh-trial', '.wh-quest', '.wh-toast', '.wh-signs', '.wh-log', '.wh-prompt', '.wh-dialogue',
  '.wh-hotbar', '.wh-topbar', '.wh-quest--mobile', '.wh-trial--mobile', '.wh-tiles', '.wh-prompt--mobile',
  '.wh-dialogue--mobile', '.wh-sheet'];

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch();
try {
  const page = await browser.newPage(VIEW);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const url = (extra) => `${base}/hud-preview.html?layout=${layout}&lang=${lang}${sheet ? '&sheet=1' : ''}${extra}`;
  const shot = async (extra, file, css) => {
    await page.goto(url(extra));
    await page.waitForFunction(() => document.documentElement.dataset.whReady === '1');
    if (css) await page.addStyleTag({ content: css });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(out, file) });
  };
  await shot('', `hud-${name}.png`);
  const boxes = await page.evaluate((sels) => sels.flatMap((s) => [...document.querySelectorAll(s)]
    .filter((e) => e.getClientRects().length)
    .map((e) => { const r = e.getBoundingClientRect(); return { sel: s, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })), COMPONENTS);
  await shot('&ref=1', `ref-${name}.png`, '#hud{visibility:hidden}');
  await shot('&ref=1', `overlay-${name}.png`, '#hud{opacity:.5}');

  // Diff and side-by-side are computed in the page with canvas (no image dependency in Node).
  const fs = await import('node:fs');
  const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(resolve(out, f)).toString('base64');
  const res = await page.evaluate(async ({ hud, ref, boxes, dpr }) => {
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
    const [a, b] = await Promise.all([load(hud), load(ref)]);
    const W = a.width, H = a.height;
    const ctx = (w, hgt) => { const c = document.createElement('canvas'); c.width = w; c.height = hgt; return [c, c.getContext('2d')]; };
    const [ca, xa] = ctx(W, H); xa.drawImage(a, 0, 0); const da = xa.getImageData(0, 0, W, H).data;
    const [, xb] = ctx(W, H); xb.drawImage(b, 0, 0); const db = xb.getImageData(0, 0, W, H).data;
    const [cd, xd] = ctx(W, H); const dd = xd.createImageData(W, H);
    for (let i = 0; i < da.length; i += 4) {
      const v = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
      dd.data[i] = dd.data[i + 1] = dd.data[i + 2] = Math.min(255, v * 2); dd.data[i + 3] = 255;
    }
    xd.putImageData(dd, 0, 0);
    const mean = (bx) => {
      let s = 0, n = 0;
      const x0 = Math.max(0, Math.round(bx.x * dpr)), y0 = Math.max(0, Math.round(bx.y * dpr));
      const x1 = Math.min(W, Math.round((bx.x + bx.w) * dpr)), y1 = Math.min(H, Math.round((bx.y + bx.h) * dpr));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; s += dd.data[i] / 2; n++; }
      return n ? +(s / n).toFixed(1) : null;
    };
    const [cs, xs] = ctx(W * 2 + 8, H); xs.fillStyle = '#f0f'; xs.fillRect(0, 0, W * 2 + 8, H); xs.drawImage(b, 0, 0); xs.drawImage(a, W + 8, 0);
    return { diff: cd.toDataURL('image/png'), side: cs.toDataURL('image/png'), rows: boxes.map((bx) => ({ ...bx, meanDiff: mean(bx) })) };
  }, { hud: b64(`hud-${name}.png`), ref: b64(`ref-${name}.png`), boxes, dpr: VIEW.deviceScaleFactor });
  fs.writeFileSync(resolve(out, `diff-${name}.png`), Buffer.from(res.diff.split(',')[1], 'base64'));
  fs.writeFileSync(resolve(out, `side-${name}.png`), Buffer.from(res.side.split(',')[1], 'base64'));

  console.log(`World HUD parity: ${name}  (CSS px boxes; meanDiff 0–255 per channel, lower is closer)`);
  console.table(res.rows);
  if (errors.length) { console.log('Console errors:'); for (const e of errors) console.log('  ' + e); process.exitCode = 1; }
  console.log('Images in ' + out);
} finally {
  await browser.close();
  await server.close();
}
