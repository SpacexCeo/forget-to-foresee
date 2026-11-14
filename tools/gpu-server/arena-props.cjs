// In-game check of the Glass Shoal crystals (render/shoal-props.js): boots straight into the arena
// (?ff=glassShoal&shoal=arena), waits until the arena look has swapped the placeholders for the crystal models, and films
// seconds of a slow orbit round the arena (same frame capture as town-talk.cjs; the arena look's own render).
//   node tools/gpu-server/arena-props.cjs <url of the build's index> <out dir> [seconds, default 5]
// Needs Playwright and ffmpeg; take the browser lock first (mkdir /root/locks/browser).
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
(async () => {
  const [url, out, secs = '5'] = process.argv.slice(2); fs.mkdirSync(out + '/f', { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--headless=new'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); const logs = [];
  p.on('console', (m) => { if (m.type() === 'error' || /shoal props/.test(m.text())) logs.push(m.text()); });
  p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  await p.goto(url + '?ff=glassShoal&shoal=arena&intro=0&skip=intro');
  const t0 = Date.now(); let st = null;
  while (Date.now() - t0 < 300000) {
    st = await p.evaluate(() => { const F = window.__ftf, a = F && F.glassShoal && F.glassShoal.arena; if (!a) return null; let n = 0; a.root.traverse((o) => { if (/^shoal_crystal_/.test(o.name)) n++; });
      return { art: !!(F.shoalArt && F.shoalArt.active), props: n, monoliths: a.look.monoliths.filter((m) => m.visible).length, spires: a.look.spires.filter((m) => m.visible).length }; }).catch(() => null);
    if (st && st.art && st.props >= 12) break; await p.waitForTimeout(1500);
  }
  console.log('state', JSON.stringify(st), 'after', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await p.evaluate(() => { const F = window.__ftf, r = F.renderer, a = F.glassShoal.arena, art = F.shoalArt, cam = F.camera, c0 = a.root.position.clone();
    const c = window.__cap = { on: true, frames: [], t: 0, copy: document.createElement('canvas') }; const g = c.copy.getContext('2d');
    c.timer = setInterval(() => { if (!c.on) return; c.t += 0.066;
      const ang = 0.6 + c.t * 0.12; cam.position.set(c0.x + Math.cos(ang) * 46, c0.y + 7, c0.z + Math.sin(ang) * 46); cam.lookAt(c0.x, c0.y + 6, c0.z); cam.updateMatrixWorld();
      art.render(); const gl = r.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8ClampedArray(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const im = new ImageData(w, h); for (let y = 0; y < h; y++) im.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); if (c.copy.width !== w) { c.copy.width = w; c.copy.height = h; } g.putImageData(im, 0, 0);
      c.frames.push(c.copy.toDataURL('image/jpeg', 0.9)); }, 66); });
  const start = Date.now(); await p.waitForTimeout(Number(secs) * 1000 + 300); const took = (Date.now() - start) / 1000;
  const frames = await p.evaluate(() => { window.__cap.on = false; clearInterval(window.__cap.timer); return window.__cap.frames; });
  frames.forEach((d, i) => fs.writeFileSync(out + '/f/' + String(i).padStart(4, '0') + '.jpg', Buffer.from(d.split(',')[1], 'base64')));
  const fps = (frames.length / took).toFixed(2); console.log('frames', frames.length, 'fps', fps);
  if (frames.length) fs.copyFileSync(out + '/f/' + String(frames.length >> 1).padStart(4, '0') + '.jpg', out + '/arena.jpg');
  try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', fps, '-i', out + '/f/%04d.jpg', '-t', secs, '-r', '30', '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out + '/arena.mp4']); } catch (e) { console.log('ffmpeg', e.message); }
  console.log('logs', logs.slice(0, 8).join(' | '));
  await b.close();
})();
