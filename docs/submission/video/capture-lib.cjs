// Shared harness for the v3 footage: one Chromium on the GPU box (real RTX rendering), the built game on
// 127.0.0.1:4193, frames through the CDP screencast (JPEG + compositor timestamps), assembled to a 60 fps clip.
const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:4193/forget-to-foresee/';
const OUT = process.env.OUT || '/root/ftf-video/clips';
const ARGS = ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--headless=new', '--autoplay-policy=no-user-gesture-required'];
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(2); }, Number(process.env.HARD || 420) * 1000).unref();

async function launch() { return chromium.launch({ args: ARGS }); }
async function newPage(browser, query, { seen = true, nick = 'Lambada', extra = {}, base = BASE } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(({ seen, nick, extra }) => {
    try {
      if (seen) {
        localStorage.setItem('ftf.npe.v1', JSON.stringify({ v: 1, prologueSeen: true, dialogueSeen: true, cardSeen: true, stipend: true }));
        localStorage.setItem('ftf.day1.v1', JSON.stringify({ claimed: true, nickname: nick }));
        localStorage.setItem('ftf.firstseen.v1', JSON.stringify({ all: true }));
      }
      localStorage.setItem('ftf.settings.v1', JSON.stringify({ mouseMode: 'classic' }));
      for (const k of Object.keys(extra)) localStorage.setItem(k, typeof extra[k] === 'string' ? extra[k] : JSON.stringify(extra[k]));
    } catch {}
  }, { seen, nick, extra });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  await page.goto(base + query, { timeout: 90000 });
  return { ctx, page, errs };
}
async function open(query, o) { const browser = await launch(); const r = await newPage(browser, query, o); return { browser, ...r }; }
async function booted(page, extra = 4000) {
  for (let i = 0; i < 200; i++) { await page.waitForTimeout(1000); if (await page.evaluate(() => !!(window.__ftfBootMarks && window.__ftfBootMarks.done))) break; }
  await page.waitForTimeout(extra);
}
async function gpu(page) { return page.evaluate(() => { try { const gl = window.__ftf.renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); const s = String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)); return /SwiftShader/.test(s) ? 'SwiftShader' : s.slice(0, 90); } catch (e) { return 'unknown'; } }); }
// Screencast recorder: recorder() starts, stop() writes <name>.mp4 (60 fps, near-lossless) and returns the stats.
async function recorder(page, name) {
  const dir = `${OUT}/${name}_f`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page); const times = []; const writes = []; let stopped = false;
  cdp.on('Page.screencastFrame', (f) => {
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    if (stopped) return; // a frame already on its way when the cast stopped
    const i = times.length; times.push(f.metadata.timestamp);
    writes.push(fs.promises.writeFile(`${dir}/f_${String(i).padStart(6, '0')}.jpg`, Buffer.from(f.data, 'base64')).catch(() => {}));
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 93, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const t0 = Date.now();
  return {
    t: () => (Date.now() - t0) / 1000,
    async stop() {
      stopped = true; await cdp.send('Page.stopScreencast').catch(() => {}); await Promise.all(writes);
      let list = 'ffconcat version 1.0\n';
      for (let i = 0; i < times.length; i++) list += `file 'f_${String(i).padStart(6, '0')}.jpg'\nduration ${Math.max(0.004, (times[i + 1] || times[i] + 0.0167) - times[i]).toFixed(4)}\n`;
      fs.writeFileSync(`${dir}/list.txt`, list);
      const r = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', 'fps=60,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '13', `${OUT}/${name}.mp4`], { encoding: 'utf8' });
      const secs = times.length ? times[times.length - 1] - times[0] : 0;
      if (!process.env.KEEP) fs.rmSync(dir, { recursive: true, force: true });
      return { name, frames: times.length, secs: +secs.toFixed(1), fps: +(times.length / (secs || 1)).toFixed(1), ffmpeg: (r.stderr || '').slice(0, 200) };
    },
  };
}
const held = new Set();
async function keys(page, want) { for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } }
async function walkTo(page, p, near = 0.8, maxMs = 8000, run = false) {
  const t = Date.now();
  while (Date.now() - t < maxMs) {
    const r = await page.evaluate((p) => { const f = window.__ftf, q = f.player.pos, dx = p[0] - q[0], dz = p[2] - q[2], d = Math.hypot(dx, dz); const { fwd, right } = f.rig.groundAxes(); const ux = dx / (d || 1), uz = dz / (d || 1); return { d, ay: ux * fwd.x + uz * fwd.y, ax: ux * right.x + uz * right.y }; }, p);
    if (r.d < near) break;
    const want = new Set(); if (r.ay > 0.38) want.add('KeyW'); if (r.ay < -0.38) want.add('KeyS'); if (r.ax > 0.38) want.add('KeyD'); if (r.ax < -0.38) want.add('KeyA'); if (run) want.add('ShiftLeft');
    await keys(page, want); await page.waitForTimeout(60);
  }
  await keys(page, new Set());
}
const ev = (page, name, detail) => page.evaluate(({ name, detail }) => window.dispatchEvent(new CustomEvent(name, { detail })), { name, detail });
module.exports = { launch, newPage, open, booted, gpu, recorder, keys, walkTo, ev, OUT, BASE, fs };
