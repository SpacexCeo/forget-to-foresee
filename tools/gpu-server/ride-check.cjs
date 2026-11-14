// In-game check of the rider (owner 14.11: the new Iris stood on the dragon's back): boots the build straight onto the
// dragon (?ff=glassShoal&shoal=ride) with a heroine (?hero=iris|elise|sheriffchenko), waits until her model and her
// `ride` clip are in, and records seconds of the flight from the game camera (same frame capture as town-talk.cjs).
//   node tools/gpu-server/ride-check.cjs <url of the build's index> <out dir> <hero> [seconds, default 5]
// CLOSE=1 films her from a camera beside the saddle instead of the game camera. Prints the hip joint and the saddle socket in the world (they should be about 0.1 m apart). Needs Playwright and
// ffmpeg; take the browser lock first (mkdir /root/locks/browser).
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
(async () => {
  const [url, out, hero = 'iris', secs = '5'] = process.argv.slice(2); fs.mkdirSync(out + '/f', { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--headless=new'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage(); const logs = [];
  p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  await p.goto(url + `?ff=glassShoal&shoal=ride&intro=0&skip=intro&hero=${hero}`);
  const t0 = Date.now(); let st = null;
  while (Date.now() - t0 < 300000) {
    st = await p.evaluate(() => { const F = window.__ftf, gs = F && F.glassShoal, m = F && F.iris && F.iris.irisModel;
      return { riding: !!(gs && gs.riding && gs.riding()), model: !!m, ride: !!(m && m.clips.some((c) => c.name === 'ride')), react: !!(m && m.react && m.react.getClip().name === 'ride') }; }).catch(() => null);
    if (st && st.riding && st.react) break; await p.waitForTimeout(1500);
  }
  console.log('state', JSON.stringify(st), 'after', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await p.evaluate(() => { for (const el of document.querySelectorAll('body *')) if (/What should the town call you/.test(el.textContent || '') && el.children.length < 8) { let n = el; while (n.parentElement && getComputedStyle(n).position !== 'fixed' && n.parentElement !== document.body) n = n.parentElement; n.style.display = 'none'; } });
  await p.waitForTimeout(1500);
  console.log('seat', JSON.stringify(await p.evaluate(() => { const F = window.__ftf, m = F.iris.irisModel.model, v = (o) => o.getWorldPosition(o.position.clone()).toArray().map((x) => +x.toFixed(2));
    let hip = null; m.traverse((o) => { if (!hip && o.isBone && /(^|[^a-z])(hips?|pelvis)$/i.test(o.name)) hip = o; });
    let sock = null; F.scene.traverse((o) => { if (!sock && o.name === 'saddle') sock = o; });
    return { hip: hip && [hip.name, v(hip)], saddle: sock && v(sock) }; })));
  await p.evaluate((close) => { const F = window.__ftf, r = F.renderer;
    // CLOSE=1: a camera 2.6 m off her left side and a little ahead, at the height of her hips (the pose itself)
    const m = F.iris.irisModel.model; let hip = null; m.traverse((o) => { if (!hip && o.isBone && /(hips?|pelvis)$/i.test(o.name)) hip = o; });
    const cam = close ? F.camera.clone() : F.camera, at = hip ? hip.position.clone() : null;
    const aim = () => { if (!close || !hip) return; hip.getWorldPosition(at); cam.position.set(at.x - 2.4, at.y + 0.5, at.z - 1.0); cam.lookAt(at.x, at.y + 0.2, at.z); cam.updateMatrixWorld(); };
    const c = window.__cap = { on: true, frames: [], copy: document.createElement('canvas') }; const g = c.copy.getContext('2d');
    c.timer = setInterval(() => { if (!c.on) return; const t = r.getRenderTarget(); r.setRenderTarget(null); aim(); r.render(F.scene, cam); const gl = r.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8ClampedArray(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); r.setRenderTarget(t); const im = new ImageData(w, h); for (let y = 0; y < h; y++) im.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); if (c.copy.width !== w) { c.copy.width = w; c.copy.height = h; } g.putImageData(im, 0, 0); c.frames.push(c.copy.toDataURL('image/jpeg', 0.9)); }, 66); }, !!process.env.CLOSE);
  const start = Date.now(); await p.waitForTimeout(Number(secs) * 1000 + 300);
  const took = (Date.now() - start) / 1000;
  const frames = await p.evaluate(() => { window.__cap.on = false; clearInterval(window.__cap.timer); return window.__cap.frames; });
  frames.forEach((d, i) => fs.writeFileSync(out + '/f/' + String(i).padStart(4, '0') + '.jpg', Buffer.from(d.split(',')[1], 'base64')));
  const fps = (frames.length / took).toFixed(2); console.log('frames', frames.length, 'fps', fps);
  if (frames.length) fs.copyFileSync(out + '/f/' + String(frames.length >> 1).padStart(4, '0') + '.jpg', out + '/ride.jpg');
  await ctx.close();
  try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', fps, '-i', out + '/f/%04d.jpg', '-t', secs, '-r', '30', '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out + '/ride.mp4']); } catch (e) { console.log('ffmpeg', e.message); }
  console.log('logs', logs.slice(0, 8).join(' | '));
  await b.close();
})();
