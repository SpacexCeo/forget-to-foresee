// In-game screenshots of Iris for the look audit: the town and the archipelago, from the game camera and closer.
//   node art/agents/iris_hero/qa_ingame.cjs <base url of a running build> <out dir> [prefix]
// Uses headless Chromium on whatever GL the machine has (SwiftShader in a cloud container), so frame rates
// are not representative; the pictures are. UI is hidden for the shots. Console errors are printed at the end.
const { chromium } = require('playwright');
const fs = require('fs');
const [base, out, prefix = 'ingame'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const GPU = process.env.QA_GPU ? ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const HIDE = '#ui, .hub-host, .wh-host, .wh-root, .pl-badge, .ftf-town-objective, .ftf-town-prompt, [class*="ftf-town"], [class*="loading"] { display: none !important; }';
const VIEWS = [ // name, distance, yaw offset, pitch (rad) or null for the game's own
  ['game_far', 18, 0, null], ['game_mid', 9, 0, null], ['back_close', 4.5, 0, 0.16], ['front_close', 4.5, Math.PI, 0.12],
  ['front_near', 2.4, Math.PI * 0.94, 0.06], ['side_near', 2.6, Math.PI / 2, 0.08], ['back_near', 2.6, 0.12, 0.08],
];
(async () => {
  const b = await chromium.launch({ args: GPU });
  const errors = [];
  for (const [scene, query, ready] of [
    ['town', '?play=direct&town=1', () => window.__ftf && window.__ftf.town && window.__ftf.town.ready],
    ['isles', '?demo=judge&play=direct&mode=walk', () => window.__ftf && window.__ftf.play && window.__ftf.play.session && window.__ftf.play.session.obs],
  ]) {
    const p = await b.newPage({ viewport: { width: Number(process.env.QA_W || 1920), height: Number(process.env.QA_H || 1080) }, deviceScaleFactor: 1 });
    p.setDefaultTimeout(600000);
    p.on('console', (m) => { if (m.type() === 'error') errors.push(scene + ': ' + m.text()); });
    p.on('pageerror', (e) => errors.push(scene + ': pageerror ' + e.message));
    await p.goto(base + query);
    await p.waitForFunction(ready, null, { polling: 500 });
    await p.waitForTimeout(Number(process.env.QA_SETTLE || 20000));
    await p.addStyleTag({ content: HIDE });
    const yaw0 = await p.evaluate(() => window.__ftf.rig.yaw);
    for (const [name, dist, dyaw, pitch] of VIEWS) {
      await p.evaluate(([dist, yaw, pitch]) => {
        const r = window.__ftf.rig; r.minDist = Math.min(r.minDist, 2); r.yawLimit = Infinity; r.distTarget = null;
        r.dist = dist; r.yaw = yaw; r.pitchOverride = pitch;
      }, [dist, yaw0 + dyaw, pitch]);
      // wait in rendered frames, not seconds: software GL runs at a few frames per second and the rig eases
      await p.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), Number(process.env.QA_FRAMES || 45));
      console.log('rig', name, await p.evaluate(() => { const r = window.__ftf.rig, c = r.camera.position, q = window.__ftf.player.pos; return JSON.stringify({ dist: r.dist, actual: r.actualDist, yaw: r.yaw, fov: r.camera.fov, cam: [c.x, c.y, c.z].map((v) => +v.toFixed(2)), player: Array.from(q).map((v) => +v.toFixed(2)) }); }));
      await p.screenshot({ path: `${out}/${prefix}_${scene}_${name}.jpg`, quality: 90, timeout: 300000 });
      console.log('shot', scene, name);
    }
    await p.close();
  }
  console.log('console errors:', errors.length, errors.slice(0, 8).join(' | '));
  await b.close();
})();
