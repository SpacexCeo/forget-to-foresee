#!/usr/bin/env node
// Example Foresight Exchange agent (docs/agent-market-plan.md Scope A): plays one local practice-silk drill through the
// public HTTP API only (no imports from the game). Policy, Salt-like: when an Echo's last three published changes
// all rise, buy 1; when they all fall and it holds that Echo, sell. It advances the bars itself (it is the controller).
// Local drill: no prizes, no real money, not financial advice.
//
//   node server/src/main.js &
//   node server/examples/exchange-agent.mjs [--url http://127.0.0.1:8787] [--start 12] [--bars 4]

export async function playDrill({ url = 'http://127.0.0.1:8787', startIndex = 12, barCount = 4, log = () => {}, fetchImpl = fetch } = {}) {
  const base = url.replace(/\/$/, '') + '/v1';
  let token = null, n = 0, commands = 0, rejected = 0, peekedFuture = false;
  const call = async (method, path, body) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
      if (res.status === 429 && attempt < 5) { await new Promise((r) => setTimeout(r, 1000 * Number(res.headers.get('retry-after') || 1))); continue; }
      return { status: res.status, body: await res.json() };
    }
  };
  const created = await call('POST', '/sessions', { rules: 'v3', timeScale: 1000, name: 'exchange-agent' });
  if (created.status !== 201) throw new Error('create failed: ' + JSON.stringify(created.body));
  token = created.body.token;
  const id = created.body.sessionId;
  const observe = async () => (await call('GET', `/sessions/${id}/observation`)).body.observation;
  const act = async (type, args = {}) => {
    for (let tries = 0; tries < 3; tries++) {
      const o = await observe();
      const r = await call('POST', `/sessions/${id}/commands`, { actionId: `xagent-${id}-${++n}`, expectedVersion: o.version, type, args });
      commands++;
      if (r.status === 409 && r.body.error.code === 'version_conflict') continue;
      if (r.status !== 200) { rejected++; log(`${type} rejected: ${JSON.stringify(r.body.error)}`); }
      return r;
    }
    return null;
  };
  await act('start_exchange', { startIndex, barCount });
  let x = (await observe()).exchange;
  while (x.phase === 'open') {
    for (const e of x.echoes) {
      if (e.history.length !== x.bar) peekedFuture = true; // the observation must never show more than the published bars
      const h = e.history;
      if (h.length < 4) continue;
      const d = [h.at(-3) - h.at(-4), h.at(-2) - h.at(-3), h.at(-1) - h.at(-2)];
      const held = x.you.positions[e.id];
      if (d.every((v) => v > 0) && held === 0) { log(`bar ${x.bar}: buy 1 ${e.name}`); await act('place_order', { echo: e.id, side: 'buy', qty: 1 }); break; }
      if (d.every((v) => v < 0) && held > 0) { log(`bar ${x.bar}: sell ${held} ${e.name}`); await act('place_order', { echo: e.id, side: 'sell', qty: held }); break; }
    }
    await act('advance_exchange_bar');
    x = (await observe()).exchange;
  }
  return { snapshotId: x.snapshotId, hash: x.hash, scores: x.board.map((b) => ({ id: b.id, kind: b.kind, practiceSilk: b.mark / 100 })), commands, rejected, peekedFuture, disclaimer: x.disclaimer };
}

if (process.argv[1]?.endsWith('exchange-agent.mjs')) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
  playDrill({ url: opt('url', 'http://127.0.0.1:8787'), startIndex: Number(opt('start', 12)), barCount: Number(opt('bars', 4)), log: (s) => console.log(s) })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
