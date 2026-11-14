// In-game check of a heroine's run (owner 14.11: the run looked terribly fast and did not match the footsteps): boots
// the town with ?hero=<id>, holds W (and Shift for the run) so she runs straight, films seconds of her from a camera
// beside her that follows, and logs every 'ftf:foot' event (the footstep sounds fire on them) with her speed.
//   node tools/gpu-server/hero-run.cjs <url of the build's index> <out dir> <hero> [seconds, default 5] [walk]
// Needs Playwright and ffmpeg; take the browser lock first (mkdir /root/locks/browser).
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
(async () => {
  const [url, out, hero = 'iris', secs = '5', mode = 'run'] = process.argv.slice(2); fs.mkdirSync(out + '/f', { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--headless=new'] });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage(); const logs = [];
  p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  await p.goto(url + `?intro=0&skip=intro&day1=0&hero=${hero}`); // day1=0: no name card holding the keys
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) { const ok = await p.evaluate(() => { const m = window.__ftf && window.__ftf.iris && window.__ftf.iris.irisModel; return !!(m && m.gait && window.__ftf.town && window.__ftf.town.ready); }).catch(() => false); if (ok) break; await p.waitForTimeout(1500); }
  await p.evaluate(() => { for (const el of document.querySelectorAll('body *')) if (/What should the town call you/.test(el.textContent || '') && el.children.length < 8) { let n = el; while (n.parentElement && getComputedStyle(n).position !== 'fixed' && n.parentElement !== document.body) n = n.parentElement; n.style.display = 'none'; } });
  // on the square's open ground (town-local -8, 4.5, -16), running east along it (D)
  await p.evaluate(() => { const F = window.__ftf; F.player.pos[0] = -8; F.player.pos[1] = 1204.5; F.player.pos[2] = -16; window.__steps = []; addEventListener('ftf:foot', (e) => window.__steps.push([performance.now(), e.detail.foot, +(F.iris.irisModel.speedNow || 0).toFixed(2)])); });
  await p.mouse.click(640, 400).catch(() => {});
  console.log('ui', JSON.stringify(await p.evaluate(() => ({ dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.id || d.className).slice(0, 4), active: document.activeElement && (document.activeElement.id || document.activeElement.tagName), overlays: [...document.querySelectorAll('[class*=overlay],[class*=modal],[class*=card]')].filter((e) => e.offsetParent).map((e) => e.className).slice(0, 6) }))));
  for (let i = 0; i < 3; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(200); }
  await p.keyboard.down('KeyD'); if (mode === 'run') await p.keyboard.down('ShiftLeft');
  // keys may be held by a first-time overlay: the QA route steers her (town.walkRoute) and the run flag is held on
  await p.evaluate((run) => { const F = window.__ftf; try { F.town.walkRoute(); } catch { /* */ } if (run) setInterval(() => { F.player.run = true; }, 50); }, mode === 'run');
  await p.waitForTimeout(1500);
  console.log('move', JSON.stringify(await p.evaluate(() => { const F = window.__ftf; return { pos: F.player.pos.map((v) => +v.toFixed(2)), speed: F.player.speed, run: F.player.run, town: !!F.town, active: F.town && F.town.active, phase: F.town && F.town.phase, registered: F.town && F.town.registered, busy: F.town && F.town.flow && F.town.flow.busy, prologue: !!document.querySelector('[class*=prologue],[class*=lab]'), body: document.body.className.slice(0, 120) }; })));
  await p.evaluate(() => { const F = window.__ftf, r = F.renderer, m = F.iris.irisModel.model, cam = F.camera.clone(), at = m.position.clone();
    const c = window.__cap = { on: true, frames: [], copy: document.createElement('canvas') }; const g = c.copy.getContext('2d');
    c.timer = setInterval(() => { if (!c.on) return; m.getWorldPosition(at);
      cam.position.set(at.x + 0.6, at.y + 1.2, at.z + 3.4); cam.lookAt(at.x, at.y + 0.9, at.z); cam.updateMatrixWorld();
      const t = r.getRenderTarget(); r.setRenderTarget(null); r.render(F.scene, cam); const gl = r.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8ClampedArray(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); r.setRenderTarget(t);
      const im = new ImageData(w, h); for (let y = 0; y < h; y++) im.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); if (c.copy.width !== w) { c.copy.width = w; c.copy.height = h; } g.putImageData(im, 0, 0);
      c.frames.push(c.copy.toDataURL('image/jpeg', 0.9)); }, 66); window.__steps.length = 0; });
  const start = Date.now(); await p.waitForTimeout(Number(secs) * 1000 + 300); const took = (Date.now() - start) / 1000;
  const { frames, steps } = await p.evaluate(() => { window.__cap.on = false; clearInterval(window.__cap.timer); return { frames: window.__cap.frames, steps: window.__steps }; });
  await p.keyboard.up('KeyD'); await p.keyboard.up('ShiftLeft');
  const gaps = steps.slice(1).map((s, i) => +((s[0] - steps[i][0]) / 1000).toFixed(2));
  console.log('steps', steps.length, 'in', took.toFixed(1), 's; feet', steps.map((s) => s[1]).join(''), '; speed', steps.map((s) => s[2]).join(','), '; gaps', gaps.join(','));
  frames.forEach((d, i) => fs.writeFileSync(out + '/f/' + String(i).padStart(4, '0') + '.jpg', Buffer.from(d.split(',')[1], 'base64')));
  const fps = (frames.length / took).toFixed(2); console.log('frames', frames.length, 'fps', fps);
  if (frames.length) fs.copyFileSync(out + '/f/' + String(frames.length >> 1).padStart(4, '0') + '.jpg', out + '/run.jpg');
  try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', fps, '-i', out + '/f/%04d.jpg', '-t', secs, '-r', '30', '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out + '/run.mp4']); } catch (e) { console.log('ffmpeg', e.message); }
  console.log('logs', logs.slice(0, 6).join(' | '));
  await b.close();
})();
