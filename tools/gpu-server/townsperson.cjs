// In-game check of one townsperson (e.g. the owner's Tripo girl, child_a): boots the town, waits until that person has
// the full model and the shared pack's clips, then films seconds of her from a camera above and beside her that follows her
// (Iris is kept 4.5 m south of her so the game draws and animates her; same frame capture as town-talk.cjs: rendered from the game scene, pixels read back).
//   node tools/gpu-server/townsperson.cjs <url of the build's index> <out dir> <key> [seconds, default 5]
// Needs Playwright and ffmpeg; take the browser lock first (mkdir /root/locks/browser).
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
(async () => {
  const [url, out, key = 'child_a', secs = '5'] = process.argv.slice(2); fs.mkdirSync(out + '/f', { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--headless=new'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage(); const logs = [];
  p.on('console', (m) => { if (m.type() === 'error' || /townsfolk/.test(m.text())) logs.push(m.text()); });
  p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  await p.goto(url + '?intro=0&skip=intro');
  const t0 = Date.now(); let st = null;
  while (Date.now() - t0 < 300000) {
    st = await p.evaluate((k) => { const tf = window.__ftf && window.__ftf.town && window.__ftf.town.scene.townsfolk; const q = tf && tf.byKey.get(k);
      return q && { state: q.state, file: q.file, pack: q.packFile, clips: q.names.length, clip: q.current }; }, key).catch(() => null);
    if (st && st.pack && st.pack === st.file && !/_m$/.test(st.file)) break; await p.waitForTimeout(2000);
  }
  // MOVING=1: wait (up to 60 s more) until she walks or runs, so the clip shows her moving
  if (process.env.MOVING) for (let i = 0; i < 120; i++) { const v = await p.evaluate((k) => window.__ftf.town.scene.townsfolk.byKey.get(k).plan.speed, key).catch(() => 0); if (v > 0.5) break; await p.waitForTimeout(500); }
  console.log('state', JSON.stringify(st), 'after', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await p.evaluate(() => { for (const el of document.querySelectorAll('body *')) if (/What should the town call you/.test(el.textContent || '') && el.children.length < 8) { let n = el; while (n.parentElement && getComputedStyle(n).position !== 'fixed' && n.parentElement !== document.body) n = n.parentElement; n.style.display = 'none'; } });
  await p.evaluate((k) => { const F = window.__ftf, r = F.renderer, q = F.town.scene.townsfolk.byKey.get(k), cam = F.camera.clone(), at = q.root.position.clone();
    const c = window.__cap = { on: true, frames: [], log: [], copy: document.createElement('canvas') }; const g = c.copy.getContext('2d');
    c.timer = setInterval(() => { if (!c.on) return;
      q.root.getWorldPosition(at); // from above and to one side (clear of the lanes' walls), looking down at her
      F.player.pos[0] = at.x; F.player.pos[1] = at.y; F.player.pos[2] = at.z + 4.5; // Iris 4.5 m behind her: the game camera sees her, so she is drawn and animated
      cam.position.set(at.x + 1.5, at.y + 1.9, at.z + 1.5); cam.lookAt(at.x, at.y + 0.6, at.z); cam.updateMatrixWorld();
      const t = r.getRenderTarget(), shown = q.root.visible; q.root.visible = true; r.setRenderTarget(null); r.render(F.scene, cam); q.root.visible = shown; /* the game culls her with its own lagging camera */ const gl = r.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8ClampedArray(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); r.setRenderTarget(t);
      const im = new ImageData(w, h); for (let yy = 0; yy < h; yy++) im.data.set(px.subarray((h - 1 - yy) * w * 4, (h - yy) * w * 4), yy * w * 4); if (c.copy.width !== w) { c.copy.width = w; c.copy.height = h; } g.putImageData(im, 0, 0);
      c.frames.push(c.copy.toDataURL('image/jpeg', 0.9)); c.log.push(q.current + ' ' + q.plan.speed.toFixed(2)); }, 66); }, key);
  const start = Date.now(); await p.waitForTimeout(Number(secs) * 1000 + 300); const took = (Date.now() - start) / 1000;
  const { frames, log } = await p.evaluate(() => { window.__cap.on = false; clearInterval(window.__cap.timer); return { frames: window.__cap.frames, log: window.__cap.log }; });
  frames.forEach((d, i) => fs.writeFileSync(out + '/f/' + String(i).padStart(4, '0') + '.jpg', Buffer.from(d.split(',')[1], 'base64')));
  const fps = (frames.length / took).toFixed(2); console.log('frames', frames.length, 'fps', fps, 'clips', [...new Set(log.map((x) => x.split(' ')[0]))].join(','));
  if (frames.length) fs.copyFileSync(out + '/f/' + String(frames.length >> 1).padStart(4, '0') + '.jpg', out + '/person.jpg');
  await ctx.close();
  try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', fps, '-i', out + '/f/%04d.jpg', '-t', secs, '-r', '30', '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out + '/person.mp4']); } catch (e) { console.log('ffmpeg', e.message); }
  console.log('logs', logs.slice(0, 8).join(' | '));
  await b.close();
})();
