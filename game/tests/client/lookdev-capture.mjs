// Look-dev reference captures (docs/lookdev.md). Not a test and not part of `npm test`: a manual tool
// that renders the same six reference cameras from a running dev server, so before/after frames of a
// look change are comparable pixel for pixel. Deterministic: reduced motion freezes the clouds, the
// wind and the Shell hover, the season is the fixed judge seed, and every shot waits for the asset
// streamer to settle before the frame is read back.
//
//   cd game && npx vite build --outDir .scratch/dist && npx vite preview --outDir .scratch/dist --port 4173 &
//   (a production build, so that editing the sources while a capture runs does not reload its pages)
//   node tests/client/lookdev-capture.mjs --out ../docs/lookdev/after --tier ultra,low --size 1280x800
//   node tests/client/lookdev-capture.mjs --shots overview,plaza --size 390x844 --profile phone
//
// Options: --url (default http://localhost:5173), --out (default .scratch/lookdev), --tier (comma list),
// --size WxH (comma list), --shots (comma list of the names below), --profile phone|desktop,
// --motion (do not freeze motion), --settle <frames> (frames rendered after the camera is placed).
// Chromium here renders through SwiftShader: a frame takes 0.1–0.5 s, so a full set is a few minutes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

// Playwright is not a dependency of the game: use the one on the machine (a global install, or the
// cloud container's /opt/node-tools) through require, which honours NODE_PATH.
const req = createRequire(import.meta.url);
const { chromium } = (() => { try { return req('playwright'); } catch { return req('/opt/node-tools/node_modules/playwright'); } })();

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] == null ? true : all[i + 1]] : null).filter(Boolean));
const URL_BASE = args.url || 'http://localhost:4173';
const OUT = resolve(args.out || '.scratch/lookdev');
const TIERS = String(args.tier || 'ultra,low').split(',');
const SIZES = String(args.size || '1280x800').split(',').map((s) => s.split('x').map(Number));
const SETTLE = Number(args.settle || 12);
const PROFILE = args.profile || 'desktop';

/**
 * Reference cameras. `player` = Iris's feet (m), `heading` = her yaw, `dist`/`yaw`/`pitch` = camera rig
 * values (pitch in degrees overrides the zoom-tied pitch; null keeps it), `shell` = fly into that Shell first.
 */
export const SHOTS = {
  overview: { player: [0, 0, 7.5], heading: Math.PI, dist: 90, yaw: 0.15, pitch: null },
  plaza: { player: [0.8, 0, 4.2], heading: Math.PI, dist: 13, yaw: 0.25, pitch: null },
  bridge: { player: [0.4, 0, -16.5], heading: Math.PI, dist: 8.5, yaw: 0.9, pitch: 16 },
  camp: { player: [0, 0, -26.5], heading: Math.PI, dist: 11, yaw: 0.35, pitch: null },
  // From the Moss camp across the plaza toward Shell III (78 m away, 17-35 m up): the whole Shell in frame with the archipelago in front.
  shell: { player: [0, 0, 25], heading: Math.PI, dist: 10, yaw: 0.51, pitch: 4 },
  inside: { shell: 1, dist: 9, yaw: 0, pitch: null },
};
const SHOT_NAMES = args.shots ? String(args.shots).split(',') : Object.keys(SHOTS);

async function waitFrames(page, n) {
  await page.evaluate((n) => new Promise((done) => { let k = 0; const tick = () => (++k >= n ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);
}

async function waitSettled(page, maxMs = 90000) {
  const t0 = Date.now();
  for (;;) {
    const s = await page.evaluate(() => { const f = window.__ftf; if (!f || !f.play) return null; const st = f.streamer.stats(); return { loading: st.loading, idle: st.idle, cover: !!document.querySelector('.hub-fade.on, .pl-fade.on') }; });
    if (s && s.loading === 0 && !s.cover) return s;
    if (Date.now() - t0 > maxMs) return s;
    await waitFrames(page, 6);
  }
}

async function placeCamera(page, shot) {
  await page.evaluate((shot) => {
    const f = window.__ftf;
    if (shot.player) {
      f.player.pos = shot.player.slice(); f.player.prevPos = shot.player.slice(); f.player.lastSafe = shot.player.slice();
      f.player.vel = [0, 0]; f.player.vy = 0;
      if (shot.heading != null) f.player.heading = shot.heading;
    }
    f.rig.exitInspect(); f.rig.dist = shot.dist; f.rig.yaw = shot.yaw; f.rig.pitchOffset = 0;
    f.rig.pitchOverride = shot.pitch == null ? null : shot.pitch * Math.PI / 180;
    f.rig.smoothFocus.set(0, 0, 0); // snap the focus to the new position on the next update
    f.rig.actualDist = shot.dist;
  }, shot);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const report = [];
  for (const [w, h] of SIZES) for (const tier of TIERS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: args.motion ? 'no-preference' : 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
    const q = new URLSearchParams({ play: 'direct', demo: 'judge', tier, profile: PROFILE, hints: 'reset' });
    if (!args.motion) q.set('motion', 'reduce');
    await page.goto(`${URL_BASE}/?${q}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__ftf && window.__ftf.play, null, { timeout: 120000 });
    await page.evaluate(() => { document.getElementById('hud')?.setAttribute('hidden', ''); });
    for (const name of SHOT_NAMES) {
      const shot = SHOTS[name];
      if (!shot) continue;
      if (shot.shell) {
        const z = await page.evaluate(() => window.__ftf.play.zone);
        if (z !== 'shell') { await page.evaluate((n) => window.__ftf.play.fly(n), shot.shell); await waitFrames(page, 4); await waitSettled(page); }
      } else {
        const z = await page.evaluate(() => window.__ftf.play.zone);
        if (z === 'shell') { await page.evaluate(() => window.__ftf.play.handleKey('KeyT')); await waitFrames(page, 4); await waitSettled(page); }
      }
      await placeCamera(page, shot);
      await waitFrames(page, 6);
      await waitSettled(page);
      // The world HUD and prompts are UI, not look: hide them for the frame, restore after.
      await page.addStyleTag({ content: '#ui, #prompt, #toast, #hud, #scene-controls, .ftf-run-toggle { visibility: hidden !important; }' });
      await waitFrames(page, SETTLE);
      const info = await page.evaluate(() => { const f = window.__ftf; const p = f.perf(); return { calls: p.drawCalls, tris: p.triangles, pr: p.pixelRatio, size: p.size, stats: f.lookdev.stats(), cam: f.rig.camera.position.toArray().map((v) => +v.toFixed(2)) }; });
      const file = `${name}-${tier}-${w}x${h}${PROFILE === 'phone' ? '-phone' : ''}.png`;
      await page.screenshot({ path: resolve(OUT, file), fullPage: false, timeout: 600000, animations: 'disabled', caret: 'hide' });
      report.push({ file, tier, size: `${w}x${h}`, shot: name, ...info });
      console.log(file, JSON.stringify(info));
    }
    if (errors.length) console.log(`console (${tier} ${w}x${h}):\n  ` + [...new Set(errors)].join('\n  '));
    report.push({ tier, size: `${w}x${h}`, console: [...new Set(errors)] });
    await ctx.close();
  }
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
