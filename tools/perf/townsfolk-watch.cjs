// Watches the town's townsfolk frame by frame on a real GPU and reports what a player would see as broken: teleports,
// jitter (back-and-forth or heading flips), vertical pops, feet off the ground, bodies inside each other, walkers stuck
// in place, and the frame time while they move. Run on the GPU box against a served build (one browser at a time):
//
//   PERF_URL=http://127.0.0.1:4291/forget-to-foresee/ node tools/perf/townsfolk-watch.cjs > watch.json
//
// Env: PERF_URL (required), WATCH_SECS (default 40), PERF_W/PERF_H (1920x1080), WATCH_VIEW ('square' | 'spawn'),
// WATCH_QUERY (extra query string), PERF_ANGLE (default 'vulkan': real GPU via ANGLE; 'swiftshader' for a CPU box).
const { execSync } = require('node:child_process');
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');

const BASE = process.env.PERF_URL;
if (!BASE) { console.error('PERF_URL is required'); process.exit(1); }
const W = Number(process.env.PERF_W || 1920), H = Number(process.env.PERF_H || 1080), SECS = Number(process.env.WATCH_SECS || 40);
const Q = `?play=direct&town=1&day1=0&hero=elise&quest=0&tod=day&weather=clear${process.env.WATCH_QUERY || ''}`;
const ANGLE = process.env.PERF_ANGLE || 'vulkan';
const args = ANGLE === 'swiftshader' ? ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] : [`--use-angle=${ANGLE}`, '--enable-gpu', '--ignore-gpu-blocklist', '--headless=new'];

(async () => {
  setTimeout(() => { console.error('WATCH HARD TIMEOUT'); process.exit(2); }, 12 * 60 * 1000).unref();
  const browser = await chromium.launch({ args, headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('ftf.npe.v1', JSON.stringify({ v: 1, prologueSeen: true, dialogueSeen: true, cardSeen: true, stipend: true })); localStorage.setItem('ftf.day1.v1', JSON.stringify({ claimed: true, nickname: 'Watch' })); } catch {} });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(('[' + m.type() + '] ' + m.text()).slice(0, 200)); });
    const t0 = Date.now();
    await page.goto(BASE + Q);
    let done = false;
    for (let i = 0; i < 300; i++) { await page.waitForTimeout(1000); if (await page.evaluate(() => !!(window.__ftfBootMarks && window.__ftfBootMarks.done))) { done = true; break; } }
    const bootSecs = Math.round((Date.now() - t0) / 1000);
    const gpu = await page.evaluate(() => { const gl = window.__ftf.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
    // everyone in: wait until every townsperson with a model is loaded (at most 60 s)
    for (let i = 0; i < 60; i++) { const n = await page.evaluate(() => { const tf = window.__ftf.town && window.__ftf.town.scene.townsfolk; return tf ? tf.people.filter((p) => p.state === 'loaded').length + '/' + tf.people.filter((p) => p.state !== 'absent' || true).length : 'none'; }); if (/^(\d+)\/\1$/.test(n) || i === 59) break; await page.waitForTimeout(1000); }
    if ((process.env.WATCH_VIEW || 'square') === 'square') {
      await page.evaluate(() => { const F = window.__ftf, T = F.town.scene, o = T.origin; const x = o[0], z = o[2] + 4; const y = T.groundAt(x, z, o[1] + 6) ?? o[1]; F.player.teleport([x, y, z], F.player.heading); F.rig.yaw = Math.PI; F.rig.dist = 26; F.rig.distTarget = null; });
      await page.waitForTimeout(4000);
    }
    const report = await page.evaluate(async (secs) => {
      const F = window.__ftf, T = F.town.scene, tf = T.townsfolk, r = F.renderer;
      const people = tf.people;
      const prev = new Map(), stats = new Map(), frames = [];
      for (const p of people) stats.set(p.def.key, { teleports: 0, reversals: 0, yawFlips: 0, vPops: 0, offGround: 0, stuckSecs: 0, overlapFrames: 0, samples: 0, worst: {} });
      const bump = (s, k, v, at) => { s[k]++; if (!s.worst[k] || v > s.worst[k][0]) s.worst[k] = [+v.toFixed(3), at]; };
      let last = performance.now(); const end = last + secs * 1000; let calls = 0, tris = 0, n = 0;
      await new Promise((res) => {
        const tick = () => {
          const now = performance.now(), dt = (now - last) / 1000; last = now; frames.push(dt * 1000);
          calls += r.info.render.calls; tris += r.info.render.triangles; n++;
          const live = people.filter((p) => p.state === 'loaded' && p.root.visible);
          for (const p of people) {
            if (p.state !== 'loaded' || !p.root.visible) { prev.delete(p); continue; }
            const s = stats.get(p.def.key), pos = p.root.position, at = [+(pos.x - T.origin[0]).toFixed(2), +(pos.z - T.origin[2]).toFixed(2)];
            s.samples++;
            const q = prev.get(p);
            if (q && dt > 0 && dt < 0.2) {
              const dx = pos.x - q.x, dz = pos.z - q.z, d = Math.hypot(dx, dz), dy = pos.y - q.y;
              const limit = Math.max(0.35, 6 * dt); // faster than a sprint (6 m/s) is a jump
              if (d > limit) bump(s, 'teleports', d, at);
              if (Math.abs(dy) > 0.12 && !p.plan.sit && !q.sit) bump(s, 'vPops', Math.abs(dy), at);
              if (q.vx !== undefined) { const v1 = Math.hypot(q.vx, q.vz), v2 = d / dt; if (v1 > 0.15 && v2 > 0.15 && (q.vx * dx / dt + q.vz * dz / dt) < -0.3 * v1 * v2) bump(s, 'reversals', v2, at); }
              let dyaw = p.root.rotation.y - q.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
              if (Math.abs(dyaw) > Math.max(0.35, 8 * dt)) bump(s, 'yawFlips', Math.abs(dyaw), at);
              if (p.plan.speed > 0.2 && d / dt < 0.05) { s.stuckSecs += dt; if (s.stuckSecs > (s.worst.stuck ? s.worst.stuck[0] : 0)) s.worst.stuck = [+s.stuckSecs.toFixed(2), at]; } else s.stuckSecs = Math.max(0, s.stuckSecs - dt);
              q.vx = dx / dt; q.vz = dz / dt;
            }
            if (!p.plan.sit && n % 10 === 0) { const g = T.groundAt(pos.x, pos.z, pos.y + 1.0); if (g != null && Math.abs(g - pos.y) > 0.2) bump(s, 'offGround', Math.abs(g - pos.y), at); }
            for (const o of live) if (o !== p && !p.plan.sit && !o.plan.sit && Math.hypot(o.root.position.x - pos.x, o.root.position.z - pos.z) < 0.45) { bump(s, 'overlapFrames', 0.45 - Math.hypot(o.root.position.x - pos.x, o.root.position.z - pos.z), at.concat(o.def.key)); break; }
            prev.set(p, Object.assign(q || {}, { x: pos.x, y: pos.y, z: pos.z, yaw: p.root.rotation.y, sit: !!p.plan.sit }));
          }
          if (now < end) requestAnimationFrame(tick); else res();
        };
        requestAnimationFrame(tick);
      });
      frames.sort((a, b) => a - b);
      const pct = (k) => +frames[Math.floor(frames.length * k)].toFixed(2);
      const bad = {}; for (const [k, s] of stats) { const issues = Object.fromEntries(['teleports', 'reversals', 'yawFlips', 'vPops', 'offGround', 'overlapFrames'].filter((m) => s[m]).map((m) => [m, s[m]])); if (Object.keys(issues).length || s.worst.stuck) bad[k] = { ...issues, worst: s.worst, samples: s.samples }; }
      return {
        frames: frames.length, avgMs: +(frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(2), p50Ms: pct(0.5), p95Ms: pct(0.95), p99Ms: pct(0.99), maxMs: pct(0.999),
        drawCalls: Math.round(calls / n), triangles: Math.round(tris / n), pixelRatio: r.getPixelRatio(), size: [r.domElement.width, r.domElement.height], tier: F.lookdev.tier,
        loaded: people.filter((p) => p.state === 'loaded').length, visible: people.filter((p) => p.root.visible).length, people: people.length,
        status: people.map((p) => [p.def.key, p.state, p.current, p.plan.clip, +p.plan.speed.toFixed(2)]),
        issues: bad,
      };
    }, SECS);
    console.log(JSON.stringify({ q: Q, gpu, done, bootSecs, errs: errs.slice(0, 30), ...report }));
  } finally { await browser.close().catch(() => {}); }
})().catch((e) => { console.error(String(e && e.stack || e).slice(0, 600)); process.exit(1); });
