const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '/root/w/cap';
  require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=gl-egl', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
  await p.goto('http://127.0.0.1:4173/?demo=judge&play=direct&tex=full');
  await p.waitForTimeout(15000);
  console.log('perf', JSON.stringify(await p.evaluate(() => window.__ftf.perf && window.__ftf.perf())));
  await p.screenshot({ path: out + '/01_island.jpg', quality: 90 });
  await p.evaluate(async () => { await window.__ftf.play.fly(2); });
  await p.waitForTimeout(12000);
  await p.screenshot({ path: out + '/02_shell_inside.jpg', quality: 90 });
  // look at the glass and the Guests behind it: pull the camera back and low
  await p.evaluate(() => { const r = window.__ftf.rig; r.dist = Math.max(r.dist, 14); if ('pitch' in r) r.pitch = 0.12; });
  await p.waitForTimeout(6000);
  await p.screenshot({ path: out + '/03_shell_glass.jpg', quality: 90 });
  // hide the HUD for a clean frame
  await p.addStyleTag({ content: '#ui, .hub-host, .wh-host, .pl-badge { display: none !important; }' });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: out + '/04_shell_clean.jpg', quality: 90 });
  console.log('perf', JSON.stringify(await p.evaluate(() => window.__ftf.perf && window.__ftf.perf())));
  console.log('errors', logs.slice(0, 8).join(' | '));
  await b.close();
})();
