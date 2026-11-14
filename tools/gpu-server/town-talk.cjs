// In-game check of the townsfolk pack (assets/anim/townsfolk_pack.glb): boots the town, waits until the scribe and the
// shardkeeper have their pack clips, puts both at the chat points on the square in the middle of their talk (QA: the
// plans are set directly) with Iris a few metres away, and records a 5-second clip.
//   node tools/gpu-server/town-talk.cjs <url of the build's index> <out dir> [talk time s, default 21.5: talk_b vs laugh]
// Needs Playwright (Chromium) and ffmpeg. Take the browser lock first (mkdir /root/locks/browser).
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
(async () => {
  const [url, out, at = '21.5'] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--headless=new'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage(); const logs = [];
  p.on('console', (m) => { if (m.type() === 'error' || /townsfolk|anim/i.test(m.text())) logs.push(m.type() + ' ' + m.text()); });
  p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  const t0 = Date.now();
  await p.goto(url + '?intro=0&skip=intro');
  const folk = async () => p.evaluate(() => { const tf = window.__ftf && window.__ftf.town && window.__ftf.town.scene.townsfolk; if (!tf) return null;
    return ['scribe', 'shardkeeper'].map((k) => { const q = tf.byKey.get(k); return { k, state: q.state, file: q.file, pack: q.packFile, has: q.names.filter((n) => /laugh|greet|scratch/.test(n)) }; }); }).catch(() => null);
  let st = null;
  while (Date.now() - t0 < 300000) { st = await folk(); if (st && st.every((x) => x.pack && x.pack === x.file && !/_m$/.test(x.file))) break; await p.waitForTimeout(2000); }
  console.log('pack', JSON.stringify(st), 'after', ((Date.now() - t0) / 1000).toFixed(1), 's');
  // hide the first-visit name card (nothing is submitted)
  await p.evaluate(() => { for (const el of document.querySelectorAll('body *')) if (/What should the town call you/.test(el.textContent || '') && el.children.length < 8) { let n = el; while (n.parentElement && getComputedStyle(n).position !== 'fixed' && n.parentElement !== document.body) n = n.parentElement; n.style.display = 'none'; } });
  const place = (t) => p.evaluate((t) => {
    const F = window.__ftf, tf = F.town.scene.townsfolk, O = [0, 1200, 0];
    for (const [k, other] of [['scribe', 'shardkeeper'], ['shardkeeper', 'scribe']]) {
      const plan = tf.byKey.get(k).plan, steps = plan.program.steps, i = steps.findIndex((s) => s.meet === other);
      plan.index = i - 1; plan.next(); const pt = steps[i - 1].walk[steps[i - 1].walk.length - 1];
      plan.x = plan.px = pt[0]; plan.y = pt[1]; plan.z = plan.pz = pt[2]; plan.ox = plan.oz = 0; plan.meeting = true; plan.t = t;
    }
    F.player.pos[0] = -3.9 + O[0]; F.player.pos[1] = 4.5 + O[1]; F.player.pos[2] = -15.9 + O[2];
    return true;
  }, t);
  await place(Number(at) - 3);
  await p.waitForTimeout(3000); // the camera settles behind Iris
    // frames from the game camera, 15 per second for 5 s, then ffmpeg (the page screencast lags and drops frames here)
  await p.evaluate(() => { const F = window.__ftf, r = F.renderer;
    const c = window.__cap = { on: true, frames: [], copy: document.createElement('canvas') };
    c.copy.width = r.domElement.width; c.copy.height = r.domElement.height; const g = c.copy.getContext('2d');
    // the game's own screen passes are not one picture on this box (passes from other views land on the canvas too):
    // between two game frames, render the town scene once more with the game camera straight to the canvas and keep that
    c.timer = setInterval(() => { if (!c.on) return; const t = r.getRenderTarget(); r.setRenderTarget(null); r.render(F.scene, F.camera); const gl = r.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8ClampedArray(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); r.setRenderTarget(t); const im = new ImageData(w, h); for (let y = 0; y < h; y++) im.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); if (c.copy.width !== w) { c.copy.width = w; c.copy.height = h; } g.putImageData(im, 0, 0); c.frames.push(c.copy.toDataURL('image/jpeg', 0.9)); }, 66); });
  const start = Date.now();
  for (let i = 0; i < 11; i++) {
    console.log('t', i * 0.5, JSON.stringify(await p.evaluate(() => { const tf = window.__ftf.town.scene.townsfolk; return ['scribe', 'shardkeeper'].map((k) => { const q = tf.byKey.get(k); return [+q.plan.t.toFixed(1), q.plan.clip, q.current, +q.plan.x.toFixed(2), +q.plan.z.toFixed(2)]; }); })));
    await p.waitForTimeout(500);
  }
  const secs = (Date.now() - start) / 1000;
  const frames = await p.evaluate(() => { window.__cap.on = false; clearInterval(window.__cap.timer); return window.__cap.frames; });
  fs.mkdirSync(out + '/f', { recursive: true });
  frames.forEach((d, i) => fs.writeFileSync(out + '/f/' + String(i).padStart(4, '0') + '.jpg', Buffer.from(d.split(',')[1], 'base64')));
  const fps = (frames.length / secs).toFixed(2); console.log('frames', frames.length, 'fps', fps);
  fs.copyFileSync(out + '/f/' + String(frames.length >> 1).padStart(4, '0') + '.jpg', out + '/talk.jpg');
  await ctx.close();
  try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', fps, '-i', out + '/f/%04d.jpg', '-t', '5', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out + '/talk.mp4']); } catch (e) { console.log('ffmpeg', e.message); }
  console.log('logs', logs.slice(0, 12).join(' | '));
  await b.close();
})();
