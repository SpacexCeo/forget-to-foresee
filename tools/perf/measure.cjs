// Performance probe for the town (night brief 2): boot marks, bytes fetched before the town is playable, draw calls,
// triangles, GPU memory counts and frame time at the spawn and at a few fixed views. Run by the merge lead on the
// server against a built `dist` (one browser at a time):
//
//   cd game && FTF_BASE=/forget-to-foresee/ npx vite build
//   mkdir -p /tmp/perf-serve && ln -sfn "$PWD/dist" /tmp/perf-serve/forget-to-foresee
//   (cd /tmp/perf-serve && python3 -m http.server 4290 &)
//   PERF_URL=http://127.0.0.1:4290/forget-to-foresee/ timeout -k 5 900 node ../tools/perf/measure.cjs > perf.json
//
// Env: PERF_URL (required), PERF_RUNS ('|'-separated query strings, default: plain town and ?ff=all), PERF_W / PERF_H
// (default 1920x1080), PERF_TIER (forces ?tier=<ultra|high|low> when set), PERF_SECS (seconds sampled per view, default 6),
// PERF_GL (chromium --use-gl value, default swiftshader; 'egl' or 'angle' on a machine with a GPU).
// Prints one JSON object per run. Frame times under swiftshader are only good for before/after comparisons on the
// same machine; draw calls, triangles, bytes and memory counts are exact anywhere.
const { execSync } = require('node:child_process');
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');

const BASE = process.env.PERF_URL;
if (!BASE) { console.error('PERF_URL is required (the served forget-to-foresee/ folder)'); process.exit(1); }
const W = Number(process.env.PERF_W || 1920), H = Number(process.env.PERF_H || 1080);
const SECS = Number(process.env.PERF_SECS || 6);
const COMMON = 'play=direct&town=1&day1=0&hero=elise&quest=0&tod=day&weather=clear';
const runs = (process.env.PERF_RUNS || `?${COMMON}|?ff=all&${COMMON}`).split('|')
  .map((q) => (process.env.PERF_TIER ? `${q}&tier=${process.env.PERF_TIER}` : q));
// Views in town-local metres (the town origin is added in the page): the spawn, the square, a street between houses.
const VIEWS = [
  { name: 'spawn', at: null, yaw: null, dist: null },
  { name: 'square-overview', at: [0, 2.5, 6], yaw: Math.PI, dist: 30 },
  { name: 'street-close', at: [-22, 0, 4.6], yaw: 0, dist: 8 },
];

(async () => {
  setTimeout(() => { console.error('PERF HARD TIMEOUT'); process.exit(2); }, 14 * 60 * 1000).unref();
  const browser = await chromium.launch({ args: [`--use-gl=${process.env.PERF_GL || 'swiftshader'}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    for (const q of runs) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      await ctx.addInitScript(() => { try { localStorage.setItem('ftf.npe.v1', JSON.stringify({ v: 1, prologueSeen: true, dialogueSeen: true, cardSeen: true, stipend: true })); localStorage.setItem('ftf.day1.v1', JSON.stringify({ claimed: true, nickname: 'Perf' })); } catch {} });
      const page = await ctx.newPage();
      const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
      const net = []; let doneAt = null;
      page.on('response', async (r) => {
        const t = Date.now();
        let bytes = Number(r.headers()['content-length'] || 0);
        if (!bytes) { try { bytes = (await r.body()).length; } catch { bytes = 0; } }
        net.push({ url: r.url().replace(BASE, ''), bytes, t, type: r.request().resourceType() });
      });
      const t0 = Date.now();
      await page.goto(BASE + q);
      let done = false;
      for (let i = 0; i < 600; i++) { await page.waitForTimeout(1000); if (await page.evaluate(() => !!(window.__ftfBootMarks && window.__ftfBootMarks.done))) { done = true; break; } }
      doneAt = Date.now();
      const marks = await page.evaluate(() => window.__ftfBootMarks || null);
      const sample = async () => page.evaluate(async (secs) => {
        const F = window.__ftf; const r = F.renderer;
        await new Promise((res) => setTimeout(res, 1500)); // settle: streaming and shader warm-up
        const t = []; let last = performance.now();
        await new Promise((res) => { const end = last + secs * 1000; const tick = () => { const n = performance.now(); t.push(n - last); last = n; if (n < end) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
        t.sort((a, b) => a - b);
        const avg = t.reduce((a, b) => a + b, 0) / t.length;
        let shadowMaps = 0; F.scene.traverse((o) => { if (o.isLight && o.castShadow && o.shadow && o.shadow.map) shadowMaps += o.shadow.mapSize.x * o.shadow.mapSize.y; });
        let meshes = 0, visibleMeshes = 0, instanced = 0, materials = new Set();
        F.scene.traverse((o) => { if (!o.isMesh) return; meshes++; if (o.visible) visibleMeshes++; if (o.isInstancedMesh) instanced++; for (const m of [].concat(o.material)) if (m) materials.add(m.uuid); });
        return {
          frames: t.length, avgMs: +avg.toFixed(2), p50Ms: +t[Math.floor(t.length * 0.5)].toFixed(2), p95Ms: +t[Math.floor(t.length * 0.95)].toFixed(2), maxMs: +t[t.length - 1].toFixed(2),
          drawCalls: r.info.render.calls, triangles: r.info.render.triangles, geometries: r.info.memory.geometries, textures: r.info.memory.textures,
          programs: r.info.programs ? r.info.programs.length : null, pixelRatio: r.getPixelRatio(), size: [r.domElement.width, r.domElement.height],
          tier: F.lookdev && F.lookdev.tier, meshes, visibleMeshes, instanced, materials: materials.size, shadowMapTexels: shadowMaps,
          jsHeapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
        };
      }, SECS);
      const views = {};
      for (const v of VIEWS) {
        if (v.at) {
          await page.evaluate((v) => {
            const F = window.__ftf, T = F.town && F.town.scene; if (!T) return;
            const o = T.origin; const x = o[0] + v.at[0], z = o[2] + v.at[2];
            const y = T.groundAt(x, z, o[1] + v.at[1] + 3) ?? (o[1] + v.at[1]);
            F.player.teleport([x, y, z], F.player.heading); F.rig.yaw = v.yaw; F.rig.dist = v.dist; F.rig.distTarget = null;
          }, v);
        }
        try { views[v.name] = await sample(); } catch (e) { views[v.name] = { error: String(e).slice(0, 200) }; }
      }
      // Bytes: everything fetched before boot finished, by type, and the twenty largest files.
      const before = net.filter((n) => n.t <= doneAt), after = net.filter((n) => n.t > doneAt);
      const byType = {}; for (const n of before) byType[n.type] = (byType[n.type] || 0) + n.bytes;
      const mb = (b) => +(b / 1048576).toFixed(2);
      console.log(JSON.stringify({
        q, size: [W, H], done, bootSecs: Math.round((doneAt - t0) / 1000), marks, errs,
        bytesBeforeDoneMB: mb(before.reduce((a, n) => a + n.bytes, 0)), requestsBeforeDone: before.length,
        bytesAfterDoneMB: mb(after.reduce((a, n) => a + n.bytes, 0)), requestsAfterDone: after.length,
        byTypeMB: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, mb(v)])),
        largest: [...before].sort((a, b) => b.bytes - a.bytes).slice(0, 20).map((n) => [n.url.slice(0, 90), mb(n.bytes)]),
        views,
      }));
      await ctx.close();
    }
  } finally { await browser.close().catch(() => {}); }
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
