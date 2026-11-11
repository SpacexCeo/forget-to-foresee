import puppeteer from 'puppeteer-core';
const url = process.argv[2], tag = process.argv[3], doWalk = process.argv[4]==='walk';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1280,800'], defaultViewport: {width:1280,height:800} });
const p = await b.newPage(); const logs = []; const t0 = Date.now(); const T=()=>((Date.now()-t0)/1000).toFixed(0)+'s';
const say = (...a)=>console.log(`[${T()}]`, ...a);
p.on('console', m => { if (['error','warning'].includes(m.type())) logs.push(`[${T()} ${m.type()}] ${m.text().slice(0,250)}`); });
p.on('pageerror', e => logs.push(`[pageerror ${T()}] ${String(e).slice(0,300)}`));
p.on('requestfailed', r => logs.push(`[reqfailed] ${r.url().slice(-80)}`));
p.on('response', r => { if (r.status()>=400) logs.push(`[HTTP ${r.status()}] ${r.url().slice(-90)}`); });
const shot = (n)=>p.screenshot({ path: `/workspace/ftf-audit/shots/${tag}-${n}.png`, timeout: 120000 }).catch(e=>say('shot fail', n));
await p.goto(url, { waitUntil: 'domcontentloaded' });
const w = (fn, to=240000)=>p.waitForFunction(fn, { timeout: to, polling: 500 }).then(()=>true).catch(()=>false);
say('town ready', await w(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready));
say('town status', JSON.stringify(await p.evaluate(()=>window.__ftf.town.status())).slice(0,300));
await shot('01-town');
say('prompt visible', await p.evaluate(()=>window.__ftf.town.promptVisible), 'phase', await p.evaluate(()=>window.__ftf.town.phase));
if (doWalk) {
  const pos0 = await p.evaluate(()=>window.__ftf.player.pos.slice());
  await p.evaluate(()=>window.__ftf.town.walkRoute());
  for (let i=0;i<12;i++){ await new Promise(r=>setTimeout(r,10000)); const pos = await p.evaluate(()=>({pos:window.__ftf.player.pos.map(x=>+x.toFixed(1)), prompt: window.__ftf.town.promptVisible, perf: window.__ftf.perf && window.__ftf.perf()})); say('walk', JSON.stringify(pos)); if (pos.prompt) break; }
  await shot('02-walk-end');
}
for (let i=0;i<30;i++){ const r=await p.evaluate(()=>window.__ftf.town.register()); say('register', r, await p.evaluate(()=>window.__ftf.town.phase)); if(r) break; await new Promise(r=>setTimeout(r,4000)); }
say('session', await w(() => window.__ftf.play && window.__ftf.play.session && window.__ftf.play.session.obs, 300000));
await new Promise(r=>setTimeout(r,8000));
const info = () => p.evaluate(() => { const s = window.__ftf.play.session, o = s.obs; return { tick: o.season.tick, silk: o.iris.silk, zone: o.you.zone, goal: s.goal && s.goal.key, options: (s.options||[]).map(x=>x.id), log: (o.log||[]).slice(0,2).map(e=>e.key), hud: [...document.querySelectorAll('.wh-root, .pl-goal')].map(e=>e.innerText.replace(/\s+/g,' ').slice(0,260)).join(' | ') }; });
say('after register', JSON.stringify(await info())); await shot('03-island');
const key = (c)=>p.evaluate((c)=>window.__ftf.play.handleKey(c), c);
const idle = ()=>w(()=>{const s=window.__ftf.play.session; return s.bus.pending===0 && !s.syncing;},120000);
for (const [name, seq] of [['G walk', ['KeyG']]]) { await key('KeyG'); }
// wait for arrival at pad (zone/option appear) up to 120s
for (let i=0;i<120;i++){ await new Promise(r=>setTimeout(r,1500)); const o=await info(); if (o.options.length>=3){ say('at pad', JSON.stringify(o)); break;} if(i==119) say('no pad reached', JSON.stringify(o)); }
say('defaultIndex', await p.evaluate(()=>{const s=window.__ftf.play.session; return JSON.stringify({d:s.defaultIndex, opts:(s.options||[]).map(x=>x.id), route:window.__ftf.play.routeActive});}));
await key('KeyE'); await idle(); await new Promise(r=>setTimeout(r,1500)); say('after E', JSON.stringify(await info()));
for (let n=0;n<3;n++){ await key('KeyT'); await new Promise(r=>setTimeout(r,800)); await key('KeyT'); await idle(); await new Promise(r=>setTimeout(r,1500)); say('after T,T', n, JSON.stringify(await info())); }
await shot('05-reveal');
await key('KeyM'); await new Promise(r=>setTimeout(r,3000));
say('memory rows', JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>/Forget it for a vision/.test(b.innerText)).map(b=>{let e=b; for(let i=0;i<4&&e.parentElement;i++){e=e.parentElement; if(e.innerText.length>30&&e.innerText.length<400) break;} return e.innerText.replace(/\s+/g,' ').slice(0,200);}))));
const clicked = await p.evaluate(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>/Forget it for a vision/.test(b.innerText)); let pick=null; for(const b of bs){let e=b; for(let i=0;i<4&&e.parentElement;i++){e=e.parentElement; if(e.innerText.length>30&&e.innerText.length<400) break;} if(/call/i.test(e.innerText)) pick=b;} (pick||bs[0]).click(); return !!pick;});
say('clicked call?', clicked); await new Promise(r=>setTimeout(r,2500)); await shot('07-confirm');
say('confirm', await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>/Forget this memory/.test(b.innerText)); if(b){b.click(); return 'ok';} return 'none';}));
await new Promise(r=>setTimeout(r,3000));
let found=null;
for (let n=0;n<16 && !found;n++){ await key('KeyT'); await new Promise(r=>setTimeout(r,700)); await key('KeyT'); await idle(); await new Promise(r=>setTimeout(r,2500)); const o=await info(); const txt=await p.evaluate(()=>document.body.innerText); const m=txt.match(/Minted on NEAR testnet|Unminted shard preview/); say('T,T', n, 'tick', o.tick, 'silk', o.silk, m?m[0]:''); if(m) found=m[0]; }
await new Promise(r=>setTimeout(r,8000)); await shot('08-shard-toast');
await new Promise(r=>setTimeout(r,20000)); await shot('09-shard-card');
say('texts', (await p.evaluate(()=>[...document.querySelectorAll('.shard-card, [class*=shard]')].map(e=>e.innerText.replace(/\s+/g,' ').slice(0,500)).filter(Boolean).slice(0,4))).join(' || '));
console.log(logs.slice(0,40).join('\n'));
await b.close();
