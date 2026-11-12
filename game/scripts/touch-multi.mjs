// Two-finger check on a built page (owner bug 12.11: run with the left stick and orbit the camera at the same time).
// CDP touch events with two points: finger 1 holds the stick, finger 2 drags on the right; prints the camera yaw change
// and how far Iris moved; both must be non-zero. Usage: node scripts/touch-multi.mjs [url]
import pw from 'playwright';
const b = await pw.chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...pw.devices['iPhone 13'] }); const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(process.argv[2] || 'http://127.0.0.1:4173/?day1=0');
while (!(await p.evaluate(() => !!(window.__ftfBootMarks||{}).done).catch(()=>false))) await p.waitForTimeout(1000);
await p.waitForTimeout(12000);
const yaw = () => p.evaluate(() => window.__ftf.town.rigYaw);
const pos = () => p.evaluate(() => { const m = window.__ftf.town.mobs; return m ? m.iris.pos.slice() : null; });
const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: q[2] ?? i, radiusX: 5, radiusY: 5, force: 1 })) });
const W = await p.evaluate(() => [innerWidth, innerHeight]);
const s0 = [90, W[1] - 120, 1], c0 = [W[0] * 0.6, W[1] * 0.45, 2];
const y0 = await yaw(), p0 = await pos();
await T('touchStart', [s0]);
await T('touchMove', [[s0[0], s0[1] - 50, 1]]);
await p.waitForTimeout(400);
await T('touchStart', [[s0[0], s0[1] - 50, 1], c0]);
for (let i = 1; i <= 12; i++) { await T('touchMove', [[s0[0], s0[1] - 50, 1], [c0[0] - i * 12, c0[1], 2]]); await p.waitForTimeout(120); }
await p.waitForTimeout(800);
const y1 = await yaw(), p1 = await pos();
await T('touchEnd', [[s0[0], s0[1] - 50, 1]]); await T('touchEnd', []);
console.log(JSON.stringify({ yawDelta: +(y1 - y0).toFixed(3), moved: p0 && p1 ? +Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(2) : null, errs }));
await b.close();
if (!(Math.abs(y1 - y0) > 0.05 && p0 && p1 && Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 0.5)) process.exit(1);
