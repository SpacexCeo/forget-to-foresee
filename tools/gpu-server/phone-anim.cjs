// Phone check of the heroine's animation (owner 14.11: on phones the new Tripo heroines stopped animating): boots the
// build as a phone (Playwright's Pixel 7: touch, mobile UA, small viewport; the game picks the `_m` models) with
// ?hero=<id>, then reports what the avatar loaded (model file, clip count, actions playing) and whether her bones
// actually move between two moments, plus the page's errors. `desktop` as the 3rd arg runs the same on a desktop.
//   node tools/gpu-server/phone-anim.cjs <url of the build's index> <hero> [phone|desktop]
// Needs Playwright; take the box's browser lock first (mkdir /root/locks/browser).
const { chromium, devices } = require('playwright');
(async () => {
  const [url, hero = 'iris', kind = 'phone'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--headless=new'] });
  const ctx = await b.newContext(kind === 'phone' ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage(); const logs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ' ' + m.text().slice(0, 200)); });
  p.on('pageerror', (e) => logs.push('pageerror ' + e.message.slice(0, 300)));
  await p.goto(url + `?intro=0&skip=intro&hero=${hero}` + (process.env.QS || '')); // QS='&tier=low' etc.
  const t0 = Date.now(); let st = null;
  const probe = () => p.evaluate(() => { const F = window.__ftf, a = F && F.iris, m = a && a.irisModel; if (!m) return { loaded: false, attaching: !!(a && a.attaching) };
    let hip = null; m.model.traverse((o) => { if (!hip && o.isBone && /(hips?|pelvis)$/i.test(o.name)) hip = o; });
    const arm = m.model.getObjectByName('R_Upperarm') || m.model.getObjectByName('mixamorigRightArm') || m.model.getObjectByName('upperarm_R');
    const acts = m.mixer ? m.mixer._actions.filter((x) => x.isRunning() && x.getEffectiveWeight() > 0.01).map((x) => x.getClip().name + ':' + x.getEffectiveWeight().toFixed(2)) : null;
    let file = null; for (const [k, v] of Object.entries(a)) if (k === 'file') file = v;
    return { loaded: true, hero: a.hero && a.hero.id, clips: m.clips.length, names: m.clips.slice(0, 6).map((c) => c.name), mixer: !!m.mixer, acts, gait: !!m.gait,
      hip: hip && hip.quaternion.toArray().map((x) => +x.toFixed(4)), arm: arm && arm.quaternion.toArray().map((x) => +x.toFixed(4)), variant: window.__ftf.features ? undefined : undefined }; }).catch((e) => ({ err: String(e) }));
  while (Date.now() - t0 < 240000) { st = await probe(); if (st && st.loaded) break; await p.waitForTimeout(2000); }
  await p.waitForTimeout(2500); const s1 = await probe(); await p.waitForTimeout(1200); const s2 = await probe();
  const moved = s1.arm && s2.arm ? s1.arm.some((x, i) => Math.abs(x - s2.arm[i]) > 1e-4) : null;
  console.log(kind, hero, 'after', ((Date.now() - t0) / 1000).toFixed(1), 's', JSON.stringify({ ...s2, armMoved: moved }));
  const net = await p.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /assets\/(anim|models)\/(agent_|iris|elise)/.test(n)).map((n) => n.replace(/^.*assets\//, '').replace(/\?.*$/, '')));
  console.log('files', net.join(' '));
  console.log('logs', logs.slice(0, 12).join(' | '));
  await b.close();
})();
