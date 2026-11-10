// In-game QA of the townsfolk on real WebGL (the GPU server's headless Chromium, see tools/gpu-server/README.md):
//   NODE_PATH=/root/pw/node_modules node art/townsfolk/qa_ingame.cjs <out_dir> [port=4191] [phone]
// Needs `npx vite preview --port <port>` of a built game. Walks Iris to each person's place, waits for the lazy
// loading, takes a screenshot per stop, prints the townsfolk status, the frame time and every console error.
const { chromium } = require('playwright');

const STOPS = [ // [name, town-local position, heading, camera distance]
  ['01_gate_guard', [1.5, 0, 28.0], 0.9, 9],
  ['02_children', [-26.0, 0, 20.5], -1.6, 12],
  ['03_inn_door', [-7.0, 2.5, 10.4], -2.4, 9],
  ['04_lane_sweeper', [-24.0, 2.5, 10.4], 1.57, 12],
  ['05_shrine_keeper', [1.6, 4.5, -5.4], 0.6, 8],
  ['06_square_baker_exchange', [9.6, 4.5, -6.6], 1.2, 10],
  ['07_square_scribe', [-9.0, 4.5, -7.6], -1.2, 9],
  ['08_bench_elder', [-7.6, 4.5, -11.0], -2.0, 8],
  ['09_musician', [4.6, 4.5, -17.4], 2.4, 8],
  ['10_square_wide', [0.0, 4.5, -3.4], 3.14, 22],
];

(async () => {
  const out = process.argv[2] || '/root/w/chars/townsfolk/ingame';
  const port = process.argv[3] || '4191';
  const phone = process.argv[4] === 'phone';
  require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const p = await b.newPage(phone ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1920, height: 1080 } });
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /townsfolk|anim/.test(m.text()))) logs.push(m.type() + ' ' + m.text()); });
  p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  await p.goto(`http://127.0.0.1:${port}/?play=direct&town=gate${phone ? '&quality=low' : ''}`);
  await p.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready, null, { timeout: 120000 });
  await p.waitForTimeout(4000);
  const folk = () => p.evaluate(() => { const t = window.__ftf.town.scene.townsfolk; return t ? t.status() : null; });
  await p.waitForFunction(() => { const t = window.__ftf.town.scene.townsfolk; return t && t.loaded >= 13; }, null, { timeout: 180000 }).catch(() => logs.push('timeout: not all 13 loaded'));
  console.log('status', JSON.stringify(await folk()));
  await p.addStyleTag({ content: '#ui, .hub-host, .wh-host, .pl-badge, .wh-prompt { display: none !important; }' });
  const tag = phone ? 'phone_' : '';
  for (const [name, pos, heading, dist] of STOPS) {
    await p.evaluate(([pos, heading, dist]) => {
      const f = window.__ftf, o = f.town.scene.origin;
      f.player.teleport([pos[0] + o[0], pos[1] + o[1] + 0.3, pos[2] + o[2]], heading);
      f.rig.dist = dist; if ('distTarget' in f.rig) f.rig.distTarget = null;
    }, [pos, heading, dist]);
    await p.waitForTimeout(3500);
    await p.screenshot({ path: `${out}/${tag}${name}.jpg`, quality: 88 });
    console.log(name, 'perf', JSON.stringify(await p.evaluate(() => { const q = window.__ftf.perf(); return q && { tier: q.tier, fps: +q.fps.toFixed(1), avgMs: +q.avgMs.toFixed(2), p95Ms: +q.p95Ms.toFixed(2), calls: q.drawCalls, tris: q.triangles }; })));
  }
  console.log('status', JSON.stringify((await folk()).map((s) => [s.key, s.state, s.file, s.clip, s.walk])));
  console.log('errors', logs.length, logs.slice(0, 12).join(' | '));
  await b.close();
})();
