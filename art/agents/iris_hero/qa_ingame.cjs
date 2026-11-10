// In-game screenshots of Iris for the look audit: the town and the archipelago.
//   node art/agents/iris_hero/qa_ingame.cjs <base url of a running build> <out dir> [prefix]
// Per scene: one shot with the game's own camera, untouched (the framing a player gets), then portrait shots
// with a QA camera placed around Iris (the game's lights, materials and post-processing; only the camera moves).
// Headless Chromium on whatever GL the machine has (SwiftShader in a cloud container: frame rates are not
// representative, the pictures are). UI is hidden for the shots. Console errors are printed at the end.
const { chromium } = require('playwright');
const fs = require('fs');
const [base, out, prefix = 'ingame'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const GPU = process.env.QA_GPU ? ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const HIDE = '#ui, .hub-host, .wh-host, .wh-root, .pl-badge, [class*="ftf-town"], [class*="loading"], [class*="controls"] { display: none !important; }';
// name, azimuth from her front (deg), target height above the feet (m), distance (m), field of view (deg), camera lift (m)
const VIEWS = [
  ['front_full', 0, 0.90, 4.6, 26, 0.2], ['q3_full', 40, 0.90, 4.6, 26, 0.2], ['side_full', 90, 0.90, 4.6, 26, 0.2],
  ['back_full', 180, 0.90, 4.6, 26, 0.2], ['q3back_full', 140, 0.90, 4.6, 26, 0.3], ['face', 12, 1.60, 1.5, 22, 0.02],
  ['face_q3', 40, 1.60, 1.5, 22, 0.02], ['bust', 15, 1.30, 2.4, 26, 0.1], ['game_height', 180, 1.2, 9, 40, 3.2],
];
const frames = (p, n) => p.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
(async () => {
  const b = await chromium.launch({ args: GPU });
  const errors = [];
  const W = Number(process.env.QA_W || 1920), H = Number(process.env.QA_H || 1080);
  for (const [scene, query, ready] of [
    ['town', '?play=direct&town=1', () => window.__ftf && window.__ftf.town && window.__ftf.town.ready],
    ['isles', '?demo=judge&play=direct&mode=walk', () => window.__ftf && window.__ftf.play && window.__ftf.play.session && window.__ftf.play.session.obs],
  ]) {
    if (process.env.QA_SCENE && process.env.QA_SCENE !== scene) continue;
    const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    p.setDefaultTimeout(900000);
    p.on('console', (m) => { if (m.type() === 'error') errors.push(scene + ': ' + m.text()); });
    p.on('pageerror', (e) => errors.push(scene + ': pageerror ' + e.message));
    await p.goto(base + query);
    await p.waitForFunction(ready, null, { polling: 500 });
    await p.waitForFunction(() => { let ok = false; window.__ftf.scene.traverse((o) => { if (o.isSkinnedMesh && o.name === 'hair') ok = true; }); return ok; }, null, { polling: 500 });
    await frames(p, Number(process.env.QA_FRAMES || 40));
    await p.screenshot({ path: `${out}/${prefix}_${scene}_game_camera_with_ui.jpg`, quality: 90, timeout: 300000 });
    await p.addStyleTag({ content: HIDE });
    await frames(p, 3);
    await p.screenshot({ path: `${out}/${prefix}_${scene}_game_camera.jpg`, quality: 90, timeout: 300000 });
    console.log('shot', scene, 'game_camera', await p.evaluate(() => { const r = window.__ftf.rig, c = r.camera.position; return JSON.stringify({ dist: r.dist, fov: r.camera.fov, cam: [c.x, c.y, c.z].map((v) => +v.toFixed(2)), player: Array.from(window.__ftf.player.pos).map((v) => +v.toFixed(2)) }); }));
    for (const [name, az, h, dist, fov, lift] of VIEWS) {
      await p.evaluate(([az, h, dist, fov, lift]) => {
        const f = window.__ftf; let hair = null;
        f.scene.traverse((o) => { if (o.isSkinnedMesh && o.name === 'hair') hair = o; });
        let root = hair; while (root.parent && root.parent !== f.scene && !root.parent.isScene) root = root.parent;   // the avatar group
        root.updateWorldMatrix(true, false);
        const V = root.position.constructor;
        const feet = new V().setFromMatrixPosition(root.matrixWorld);
        const fwd = new V(0, 0, 1).transformDirection(root.matrixWorld); fwd.y = 0; fwd.normalize();
        const a = az * Math.PI / 180, dir = new V(fwd.x * Math.cos(a) + fwd.z * Math.sin(a), 0, fwd.z * Math.cos(a) - fwd.x * Math.sin(a));
        const tgt = feet.clone(); tgt.y += h;
        const pos = tgt.clone().addScaledVector(dir, dist); pos.y += lift;
        const cam = f.rig.camera;
        f.rig.update = () => { cam.position.copy(pos); cam.lookAt(tgt); if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); } };
      }, [az, h, dist, fov, lift]);
      await frames(p, 4);
      await p.screenshot({ path: `${out}/${prefix}_${scene}_${name}.jpg`, quality: 90, timeout: 300000 });
      console.log('shot', scene, name);
    }
    await p.close();
  }
  console.log('console errors:', errors.length, errors.slice(0, 8).join(' | '));
  await b.close();
})();
