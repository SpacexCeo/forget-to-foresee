// Records the data panels (panels.html + data.json, served on 127.0.0.1:4195) as 770x1080 clips for the split screen.
//   node panels.cjs [seconds]
const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const OUT = '/root/ftf-video/clips', SECS = Number(process.argv[2] || 16);
setTimeout(() => { console.log('HARD TIMEOUT'); process.exit(2); }, 300000).unref();
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist', '--headless=new'] });
  try {
    for (const p of ['trades', 'ai', 'nft', 'fair']) {
      const ctx = await browser.newContext({ viewport: { width: 770, height: 1080 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
      const dir = `${OUT}/panel_${p}_f`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      const times = []; const writes = []; let stopped = false;
      cdp.on('Page.screencastFrame', (f) => { cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); if (stopped) return; const i = times.length; times.push(f.metadata.timestamp); writes.push(fs.promises.writeFile(`${dir}/f_${String(i).padStart(6, '0')}.jpg`, Buffer.from(f.data, 'base64')).catch(() => {})); });
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 770, maxHeight: 1080, everyNthFrame: 1 });
      await page.goto('http://127.0.0.1:4195/panels.html?p=' + p);
      await page.waitForTimeout(SECS * 1000);
      await page.screenshot({ path: `${OUT}/sheets/panel_${p}.png` });
      stopped = true; await cdp.send('Page.stopScreencast').catch(() => {}); await Promise.all(writes);
      let list = 'ffconcat version 1.0\n';
      for (let i = 0; i < times.length; i++) list += `file 'f_${String(i).padStart(6, '0')}.jpg'\nduration ${Math.max(0.004, (times[i + 1] || times[i] + 0.5) - times[i]).toFixed(4)}\n`;
      fs.writeFileSync(`${dir}/list.txt`, list);
      const r = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', 'fps=60,scale=770:1080,format=yuv420p', '-t', String(SECS), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', `${OUT}/panel_${p}.mp4`], { encoding: 'utf8' });
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(p, times.length, 'frames', (r.stderr || '').slice(0, 200));
      await ctx.close();
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
