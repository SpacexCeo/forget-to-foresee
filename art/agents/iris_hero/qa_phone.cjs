// Iris on a phone and in motion, in the real game:
//   node art/agents/iris_hero/qa_phone.cjs <base url of a running build> <out dir> [prefix]
// 1. phone: a phone viewport, touch and user agent; prints every agent_iris*.glb the page requests (it must be
//    agent_iris_m.glb only) and saves one screenshot of the town.
// 2. motion: desktop, the town; W is held and she is shot from the side and from behind while she walks and
//    runs (Shift), so the ponytail's spring chain and the collar can be judged with the shipped clips.
// Console errors are printed at the end. QA_GPU=1 uses the machine's GPU through ANGLE/Vulkan.
const { chromium } = require('playwright');
const fs = require('fs');
const [base, out, prefix = 'phone'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const GPU = process.env.QA_GPU ? ['--use-angle=vulkan', '--use-vulkan=native', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--ignore-gpu-blocklist']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const HIDE = '#ui, .hub-host, .wh-host, .wh-root, .pl-badge, [class*="ftf-town"], [class*="loading"], [class*="controls"] { display: none !important; }';
const frames = (p, n) => p.evaluate((n) => new Promise((res) => { let i = 0; const f = () => (++i >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const townReady = () => window.__ftf && window.__ftf.town && window.__ftf.town.ready;
const irisIn = () => { let ok = false; window.__ftf.scene.traverse((o) => { if (o.isSkinnedMesh && o.name === 'hair') ok = true; }); return ok; };
// The QA camera follows her: azimuth from her front (deg), target height, distance, field of view.
const follow = (p, az, h, dist, fov) => p.evaluate(([az, h, dist, fov]) => {
  const f = window.__ftf;
  f.rig.update = () => {
    let hair = null;
    f.scene.traverse((o) => { if (o.isSkinnedMesh && o.name === 'hair') hair = o; });
    let root = hair; while (root.parent && root.parent !== f.scene && !root.parent.isScene) root = root.parent;
    root.updateWorldMatrix(true, false);
    const V = root.position.constructor;
    const feet = new V().setFromMatrixPosition(root.matrixWorld);
    const fwd = new V(0, 0, 1).transformDirection(root.matrixWorld); fwd.y = 0; fwd.normalize();
    const a = az * Math.PI / 180, dir = new V(fwd.x * Math.cos(a) + fwd.z * Math.sin(a), 0, fwd.z * Math.cos(a) - fwd.x * Math.sin(a));
    const tgt = feet.clone(); tgt.y += h;
    const cam = f.rig.camera;
    cam.position.copy(tgt).addScaledVector(dir, dist); cam.position.y += 0.15; cam.lookAt(tgt);
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  };
}, [az, h, dist, fov]);
(async () => {
  const b = await chromium.launch({ args: GPU });
  const errors = [];
  const watch = (p, tag, files) => {
    p.setDefaultTimeout(600000);
    p.on('console', (m) => { if (m.type() === 'error') errors.push(tag + ': ' + m.text()); });
    p.on('pageerror', (e) => errors.push(tag + ': pageerror ' + e.message));
    p.on('request', (r) => { const m = /agent_iris[^/?]*\.glb/.exec(r.url()); if (m) files.push(m[0]); });
  };
  if (!process.env.QA_ONLY || process.env.QA_ONLY === 'phone') {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    const p = await ctx.newPage(); const files = [];
    watch(p, 'phone', files);
    await p.goto(base + '?play=direct&town=1');
    await p.waitForFunction(townReady, null, { polling: 500 });
    await p.waitForFunction(irisIn, null, { polling: 500 });
    await frames(p, 60);
    await p.screenshot({ path: `${out}/${prefix}_town_game.jpg`, quality: 88 });
    await p.addStyleTag({ content: HIDE });
    await follow(p, 20, 1.15, 3.4, 30);
    await frames(p, 6);
    await p.screenshot({ path: `${out}/${prefix}_town_iris.jpg`, quality: 88 });
    const tris = await p.evaluate(() => { let n = 0, names = []; window.__ftf.scene.traverse((o) => { if (o.isSkinnedMesh && o.name === 'hair') { let r = o; while (r.parent && !r.parent.isScene && r.parent !== window.__ftf.scene) r = r.parent; r.traverse((m) => { if (m.isMesh && m.visible && m.geometry.index) n += m.geometry.index.count / 3; if (m.isMesh && m.material && m.material.name) names.push(m.material.name); }); } }); return { n, mats: [...new Set(names)] }; });
    console.log('phone: requested', JSON.stringify([...new Set(files)]), 'triangles', tris.n, 'materials', tris.mats.join(','));
    await ctx.close();
  }
  if (!process.env.QA_ONLY || process.env.QA_ONLY === 'motion') {
    const p = await b.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 }); const files = [];
    watch(p, 'motion', files);
    await p.goto(base + '?play=direct&town=1');
    await p.waitForFunction(townReady, null, { polling: 500 });
    await p.waitForFunction(irisIn, null, { polling: 500 });
    await frames(p, 60);
    await p.addStyleTag({ content: HIDE });
    await p.mouse.click(640, 480);
    for (const [gait, keys] of [['idle', []], ['walk', ['KeyW']], ['run', ['KeyW', 'ShiftLeft']]]) {
      for (const k of keys) await p.keyboard.down(k);
      for (const [view, az, h, dist, fov] of [['side', 90, 1.0, 4.2, 28], ['back', 180, 1.35, 1.9, 30], ['q3', 35, 1.35, 1.9, 30]]) {
        await follow(p, az, h, dist, fov);
        await frames(p, gait === 'idle' ? 20 : 37);
        await p.screenshot({ path: `${out}/${prefix}_motion_${gait}_${view}.jpg`, quality: 88 });
      }
      for (const k of keys) await p.keyboard.up(k);
      await frames(p, 20);
    }
    console.log('motion: requested', JSON.stringify([...new Set(files)]));
    await p.close();
  }
  console.log('console errors:', errors.length, errors.slice(0, 8).join(' | '));
  await b.close();
})();
