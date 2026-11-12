// Measures entering and leaving a Shell in the BUILT page (docs/qa/shell-transitions.md). GPU-independent work per
// transition (what a seamless swap must not do): new shader programs, new textures and geometries, .glb fetches, and the
// streamer's release/attach/load events; plus frame times (meaningful on a real GPU only: software GL renders at ~2 fps).
// Two visits; Iris stays 15 s inside (past the streamer's 8 s release). Uses the play layer's own zone event.
//   npx vite preview --port 4173 &   node scripts/measure-shell.mjs [query] [label]
import { chromium } from 'playwright';
const query = process.argv[2] || '?play=direct&mode=walk&day1=0&quest=0&skip=intro';
const label = process.argv[3] || 'desktop';
const gpu = process.argv.includes('--gpu');
const b = await chromium.launch(gpu ? { args: ['--enable-gpu', '--ignore-gpu-blocklist'] } : { args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); p.setDefaultTimeout(180000);
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
let glbs = []; p.on('request', (r) => { if (/\.(glb|ktx2|webp|png|jpg)(\?|$)/.test(r.url())) glbs.push(r.url().split('/').pop().split('?')[0]); });
await p.goto('http://127.0.0.1:4173/' + query, { timeout: 180000 });
for (let i = 0; i < 600 && !(await p.evaluate(() => !!(window.__ftf && window.__ftf.play && window.__ftfBootMarks && window.__ftfBootMarks.done)).catch(() => false)); i++) await p.waitForTimeout(500);
// let the archipelago and the pinned Shell hall stream in (all loading done, or 120 s)
for (let i = 0; i < 120; i++) { const busy = await p.evaluate(() => { const s = window.__ftf.streamer.stats(); return s.loading + s.warming; }); if (!busy && i > 20) break; await p.waitForTimeout(1000); }
await p.evaluate(() => { window.__fr = []; const loop = (t) => { window.__fr.push(t); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
const gl = () => p.evaluate(() => { const i = window.__ftf.renderer.info; const s = window.__ftf.streamer; return { programs: i.programs ? i.programs.length : 0, textures: i.memory.textures, geometries: i.memory.geometries, events: s.events.length ? s.events[s.events.length - 1].t : 0, log: s.events.map((e) => ({ t: e.t, msg: e.msg })) }; });
const transition = async (what) => {
  const before = await gl(); glbs = [];
  const t0 = await p.evaluate((w) => {
    const pl = window.__ftf.play, t = performance.now();
    if (w === 'enter') pl.session.emit('zone', { zone: 'shell', shell: 1 });
    else pl.session.emit('zone', { zone: 'island', position: pl.session.obs.you.position });
    return t;
  }, what);
  await p.waitForTimeout(6000);
  const after = await gl();
  const frames = await p.evaluate((t0) => {
    const f = window.__fr.filter((x) => x >= t0);
    const long = []; for (let i = 1; i < f.length; i++) { const d = f[i] - f[i - 1]; if (d > 50) long.push(Math.round(d)); }
    return { firstFrameMs: f.length ? Math.round(f[0] - t0) : null, over50: long.length, worstMs: long.length ? Math.max(...long) : 0 };
  }, t0);
  return { newPrograms: after.programs - before.programs, newTextures: after.textures - before.textures, newGeometries: after.geometries - before.geometries,
    fetches: glbs.length, fetched: glbs.slice(0, 4), streamer: after.log.filter((e) => e.t >= t0).map((e) => e.msg).filter((m) => /released|loading|evicted|upgrading/.test(m)), ...frames };
};
const out = {};
for (const visit of [1, 2]) {
  out[`enter${visit}`] = await transition('enter');
  await p.waitForTimeout(15000);
  const inside = await gl(); out[`inside${visit}_releases`] = inside.log.filter((e) => /released/.test(e.msg)).map((e) => e.msg);
  out[`exit${visit}`] = await transition('exit');
  await p.waitForTimeout(4000);
}
out.prewarmed = await p.evaluate(() => window.__ftf.play.shell.prewarmed);
console.log(label, JSON.stringify(out));
console.log('errors', errs.slice(0, 3));
await b.close();
