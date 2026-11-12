#!/usr/bin/env node
// Demo walkers against a LOCAL or TEST presence server, so the shared town can be seen without friends.
//   PER_IP=20 node presence/server.js &       # a local server; the default cap is 3 sockets per IP
//   node presence/tools/bots.mjs --url ws://127.0.0.1:8788/presence --count 3 [--minutes 10]
// Refuses the live server: only localhost / 127.0.0.1, or a host given with --test-host <name>. Each bot joins with a
// name, walks the jury route (game/src/net/bot-walk.js) at 10 Hz and says one short line now and then.
import { botAt, BOT_NAMES } from '../../game/src/net/bot-walk.js';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const url = opt('--url', 'ws://127.0.0.1:8788/presence');
const count = Math.max(1, Math.min(14, Number(opt('--count', 3)) || 3));
const minutes = Math.max(1, Math.min(60, Number(opt('--minutes', 10)) || 10));
const host = new URL(url).hostname;
const LIVE = ['159-195-130-113.sslip.io'];
if (LIVE.includes(host) || !(host === 'localhost' || host === '127.0.0.1' || host === opt('--test-host', null))) {
  console.error(`refusing ${host}: bots run only against localhost or a host named with --test-host (never the live room)`);
  process.exit(2);
}
const LINES = ['the altar is glowing', 'anyone hiring the courier?', 'good luck at the tournament', 'that fog again'];
const t0 = Date.now();
for (let k = 0; k < count; k++) {
  const ws = new WebSocket(url, { headers: { Origin: 'http://localhost:5173' } });
  ws.onopen = () => {
    ws.send(JSON.stringify({ t: 'hello', v: 1, name: 'bot' + BOT_NAMES[k % BOT_NAMES.length], skin: k % 2 ? 'elise' : 'iris' }));
    const move = setInterval(() => { const s = botAt(k, (Date.now() - t0) / 1000); ws.send(JSON.stringify({ t: 's', p: s.p.map((v) => Math.round(v * 100) / 100), h: Math.round(s.h * 1000) / 1000, a: s.a })); }, 100);
    const talk = setInterval(() => ws.send(JSON.stringify({ t: 'chat', text: LINES[(k + Math.floor(Date.now() / 45000)) % LINES.length] })), 45000 + k * 7000);
    setTimeout(() => { clearInterval(move); clearInterval(talk); ws.close(); }, minutes * 60000);
  };
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'welcome') console.log(`bot ${k} joined room ${m.room} as id ${m.id}`); if (m.t === 'sys' && m.key === 'kicked') console.log(`bot ${k} kicked: ${m.reason}`); };
  ws.onerror = () => console.error(`bot ${k}: connection failed`);
}
