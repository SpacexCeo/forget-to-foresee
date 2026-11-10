// Atmosphere captures on real WebGL (docs/atmosphere.md): fixed cameras in the town and on the archipelago,
// one JPEG per shot plus frame-time numbers, from a running `vite preview` of a production build.
//
//   . /root/w/atmo/env.sh   (NVIDIA GL libraries + NODE_PATH for playwright; see nvlocal.sh)
//   node atmo-cap.cjs --out /root/w/atmo/shots/before --loc town,isle --tier ultra --query "tod=golden"
//
// Options: --url (default http://127.0.0.1:4191), --out, --loc town|isle (comma list), --tier (comma list),
// --profile desktop|phone, --size WxH, --shots (comma list of names), --query (extra URL parameters),
// --tag (file name suffix), --motion (leave motion on: animated frames), --perf (measure frame times with the
// frame-rate limit off; implies --motion), --swiftshader (software renderer, for a machine without a GPU).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] == null || all[i + 1].startsWith('--') ? true : all[i + 1]] : null)).filter(Boolean));
const URL_BASE = args.url || 'http://127.0.0.1:4191';
const OUT = path.resolve(args.out || 'shots');
const LOCS = String(args.loc || 'town,isle').split(',');
const TIERS = String(args.tier || 'ultra').split(',');
const PROFILE = args.profile || 'desktop';
const [W, H] = String(args.size || (PROFILE === 'phone' ? '390x844' : '1920x1080')).split('x').map(Number);
const TAG = args.tag ? '-' + args.tag : '';
const PERF = !!args.perf;
const MOTION = PERF || !!args.motion;

// Town cameras: `at` is a town-local ground point [x, z] (the height comes from the collision world), `heading`
// Iris's yaw, `dist`/`yaw`/`pitch` camera rig values (pitch in degrees; null keeps the town's zoom-tied pitch).
const TOWN_SHOTS = {
  gate: { at: [0, 30], heading: Math.PI, dist: 13, yaw: null, pitch: null },
  spawn: { at: [0, 20.5], heading: Math.PI, dist: 6.5, yaw: 0, pitch: 9 },
  street: { at: [0, 8], heading: Math.PI, dist: 9, yaw: 0.35, pitch: 12 },
  stairs: { at: [0, 15], heading: Math.PI, dist: 7, yaw: -0.5, pitch: 18 },
  altar: { at: [0, -6.8], heading: Math.PI, dist: 8, yaw: 0.2, pitch: 8 },
  square: { at: [3, -4], heading: Math.PI, dist: 16, yaw: 2.2, pitch: 22 },
  high: { at: [0, 6], heading: Math.PI, dist: 26, yaw: 0.6, pitch: 38 },
  sky: { at: [0, -3], heading: Math.PI, dist: 7, yaw: -0.7, pitch: -14 },
};
// Archipelago cameras (the same as tests/client/lookdev-capture.mjs).
const ISLE_SHOTS = {
  overview: { player: [0, 0, 7.5], heading: Math.PI, dist: 90, yaw: 0.15, pitch: null },
  plaza: { player: [0.8, 0, 4.2], heading: Math.PI, dist: 13, yaw: 0.25, pitch: null },
  bridge: { player: [0.4, 0, -16.5], heading: Math.PI, dist: 8.5, yaw: 0.9, pitch: 16 },
  camp: { player: [0, 0, -26.5], heading: Math.PI, dist: 11, yaw: 0.35, pitch: null },
  shell: { player: [0, 0, 25], heading: Math.PI, dist: 10, yaw: 0.51, pitch: 4 },
};
const ONLY = args.shots ? String(args.shots).split(',') : null;

const frames = (page, n) => page.evaluate((n) => new Promise((done) => { let k = 0; const tick = () => (++k >= n ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }), n);

async function settled(page, maxMs = 90000) {
  const t0 = Date.now();
  for (;;) {
    const s = await page.evaluate(() => { const f = window.__ftf; if (!f) return null; const st = f.streamer.stats(); return { loading: st.loading, warming: st.warming || 0, cover: !!document.querySelector('.hub-fade.on, .pl-fade.on') }; });
    if (s && s.loading === 0 && !s.warming && !s.cover) return s;
    if (Date.now() - t0 > maxMs) return s;
    await page.waitForTimeout(250);
  }
}

async function place(page, loc, shot) {
  await page.evaluate(([loc, shot]) => {
    const f = window.__ftf;
    let pos = shot.player;
    if (loc === 'town') {
      const o = f.town.scene.origin, x = shot.at[0] + o[0], z = shot.at[1] + o[2];
      pos = [x, (f.town.scene.groundAt(x, z) ?? o[1]) + 0.02, z];
    }
    f.player.pos = pos.slice(); f.player.prevPos = pos.slice(); f.player.lastSafe = pos.slice();
    f.player.vel = [0, 0]; f.player.vy = 0;
    if (shot.heading != null) f.player.heading = shot.heading;
    f.rig.exitInspect && f.rig.exitInspect();
    f.rig.dist = shot.dist; f.rig.actualDist = shot.dist;
    if (shot.yaw != null) f.rig.yaw = shot.yaw;
    f.rig.pitchOverride = shot.pitch == null ? null : shot.pitch * Math.PI / 180;
    f.rig.smoothFocus.set(0, 0, 0);
  }, [loc, shot]);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const gpuArgs = args.swiftshader
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    : ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-watchdog'];
  if (PERF) gpuArgs.push('--disable-frame-rate-limit', '--disable-gpu-vsync');
  const browser = await chromium.launch({ args: gpuArgs });
  const report = [];
  for (const loc of LOCS) for (const tier of TIERS) {
    const phone = PROFILE === 'phone';
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: phone ? 3 : 1, isMobile: phone, hasTouch: phone, reducedMotion: MOTION ? 'no-preference' : 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
    page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
    const q = new URLSearchParams({ play: 'direct', demo: 'judge', tier, profile: PROFILE, hints: 'reset' });
    if (loc === 'town') q.set('town', '1');
    if (!MOTION) q.set('motion', 'reduce');
    for (const [k, v] of new URLSearchParams(typeof args.query === 'string' ? args.query : '')) q.set(k, v);
    await page.goto(`${URL_BASE}/?${q}`, { waitUntil: 'load' });
    if (loc === 'town') await page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.town.phase === 'town', null, { timeout: 180000, polling: 250 });
    else await page.waitForFunction(() => window.__ftf && window.__ftf.play, null, { timeout: 180000, polling: 250 });
    const gpu = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c && c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
    await settled(page);
    // --look '{"town":{"elevation":40,"fog":{"density":0.01}},"isle":{...}}': look overrides for tuning without a rebuild
    if (args.look) await page.evaluate((o) => { if (!o) return; const L = window.__ftf.lookdev; L.look = { ...L.look, ...o, fog: { ...L.look.fog, ...(o.fog || {}) } }; L.applyAtmosphere(L.look); }, JSON.parse(args.look)[loc] || null);
    await page.addStyleTag({ content: '#ui, #prompt, #toast, #hud, #scene-controls, .ftf-run-toggle, .ftf-town-objective, .ftf-town-prompt, .hub-host, .wh-host, .wh-root, .pl-badge { visibility: hidden !important; }' });
    const shots = loc === 'town' ? TOWN_SHOTS : ISLE_SHOTS;
    for (const [name, shot] of Object.entries(shots)) {
      if (ONLY && !ONLY.includes(name)) continue;
      await place(page, loc, shot);
      await frames(page, 8);
      await settled(page);
      await page.waitForTimeout(PERF ? 6000 : 1200); // lamps and exposure ease in; perf: a full rolling window of frames
      const info = await page.evaluate(() => { const f = window.__ftf; const p = f.perf() || {}; return { fps: p.fps && +p.fps.toFixed(1), avgMs: p.avgMs && +p.avgMs.toFixed(2), p95Ms: p.p95Ms && +p.p95Ms.toFixed(2), calls: p.drawCalls, tris: p.triangles, pr: p.pixelRatio, size: p.size, look: f.lookdev.stats() }; });
      const file = `${loc}-${name}-${PROFILE === 'phone' ? 'phone-' : ''}${tier}${TAG}.jpg`;
      await page.screenshot({ path: path.join(OUT, file), quality: 90, timeout: 120000 });
      report.push({ file, loc, shot: name, tier, profile: PROFILE, gpu, ...info });
      console.log(file, JSON.stringify(info));
    }
    if (errors.length) console.log(`console (${loc} ${tier}):\n  ` + [...new Set(errors)].slice(0, 12).join('\n  '));
    report.push({ loc, tier, console: [...new Set(errors)] });
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, `report${TAG}-${PROFILE}-${TIERS.join('_')}.json`), JSON.stringify(report, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
