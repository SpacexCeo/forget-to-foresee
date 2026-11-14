// In-game check of the Hollow Tide's adds (the shoal_tideling model) on a real GPU: boots the build into the fight
// (?ff=glassShoal&shoal=arena), brings the boss under 66 % so phase 2 spawns its adds, then records a 5-second clip.
//   node tools/gpu-server/shoal-adds.cjs <url of the build's index> <out dir>
// Needs Playwright (Chromium) and ffmpeg. Take the browser lock first (mkdir /root/locks/browser).
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
(async () => {
  const [url, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--headless=new'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
  const p = await ctx.newPage(); const logs = [];
  p.on('console', (m) => { if (m.type() === 'error' || /shoal|tideling/i.test(m.text())) logs.push(m.type() + ' ' + m.text()); });
  p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  await p.goto(url + '?play=direct&ff=glassShoal&shoal=arena&intro=0&skip=intro');
  const t0 = Date.now(); let arena = null;
  while (Date.now() - t0 < 240000) {
    arena = await p.evaluate(() => !!(window.__ftf && window.__ftf.glassShoal && window.__ftf.glassShoal.arena));
    if (arena) break; await p.waitForTimeout(1000);
  }
  console.log('arena', arena, 'after', ((Date.now() - t0) / 1000).toFixed(1), 's');
  console.log('renderer', await p.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; }));
  await p.waitForTimeout(6000);
  // phase 2: hit the boss until its HP is under 66 %; the rules spawn the adds on their next 'adds' attack
  // debugHit returns the damage dealt (armour applied): stop once 35 % of the boss's 10,000 HP is gone (phase 2 starts
  // under 66 %), never kill it
  let dealt = 0; for (let i = 0; i < 2000 && dealt < 3450; i++) dealt += await p.evaluate(() => window.__ftf.glassShoal.arena.debugHit(150)) || 0;
  console.log('damage dealt', dealt);
  let mark = Date.now(); let seen = 0;
  while (Date.now() - mark < 60000) {
    seen = await p.evaluate(() => { let n = 0; const s = window.__ftf.scene; if (s) s.traverse((o) => { if (o.isSkinnedMesh && /tideling/.test(o.name + (o.parent && o.parent.name))) n++; }); return n; }).catch(() => -1);
    if (seen > 0) break; await p.waitForTimeout(1000);
  }
  console.log('tideling meshes in the scene', seen);
  const start = Date.now(); await p.waitForTimeout(6000);
  await p.screenshot({ path: out + '/adds.jpg', quality: 88 });
  const video = p.video(); await ctx.close(); const raw = await video.path();
  const from = Math.max(0, (start - t0) / 1000 + 0.5);
  try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(from), '-i', raw, '-t', '5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out + '/adds.mp4']); } catch (e) { console.log('ffmpeg', e.message); }
  console.log('logs', logs.slice(0, 12).join(' | '));
  await b.close();
})();
