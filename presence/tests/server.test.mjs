// The real server over TCP: origin allowlist, per-IP cap, the 1 KB frame cap, a join and a chat between two sockets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { createPresence } from '../server.js';

/** A raw WebSocket client: resolves {status, send(text), raw(buf), next(type), closed} after the handshake response. */
function connect(port, { origin = 'https://spacexceo.github.io', path = '/presence' } = {}) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    let head = '', upgraded = false, buf = Buffer.alloc(0); const msgs = [], waiters = [];
    const api = {
      status: 0, closed: false,
      send(text, len) { const p = Buffer.from(text); const mask = randomBytes(4); const n = len ?? p.length;
        const h = n < 126 ? Buffer.from([0x81, 0x80 | n]) : Buffer.from([0x81, 0x80 | 126, n >> 8, n & 255]);
        const d = Buffer.from(p); for (let i = 0; i < d.length; i++) d[i] ^= mask[i & 3]; s.write(Buffer.concat([h, mask, d])); },
      next(type) { const i = msgs.findIndex((m) => m.t === type); if (i >= 0) return Promise.resolve(msgs.splice(i, 1)[0]); return new Promise((r) => waiters.push({ type, r })); },
      end() { s.destroy(); },
    };
    s.on('data', (c) => {
      if (!upgraded) { head += c.toString('latin1'); const i = head.indexOf('\r\n\r\n'); if (i < 0) return; api.status = Number(head.split(' ')[1]); upgraded = true; resolve(api); c = Buffer.from(head.slice(i + 4), 'latin1'); }
      buf = Buffer.concat([buf, c]);
      while (buf.length >= 2) {
        let len = buf[1] & 0x7f, off = 2; if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        if (buf.length < off + len) return;
        const op = buf[0] & 0x0f, data = buf.subarray(off, off + len); buf = buf.subarray(off + len);
        if (op === 0x8) { api.closed = data.length >= 2 ? data.readUInt16BE(0) : 1000; continue; }
        if (op !== 0x1) continue;
        const m = JSON.parse(data.toString()); const w = waiters.findIndex((x) => x.type === m.t);
        if (w >= 0) waiters.splice(w, 1)[0].r(m); else msgs.push(m);
      }
    });
    s.on('close', () => { api.closed ||= 1006; if (!upgraded) resolve(api); });
    s.write(`GET ${path} HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n${origin ? 'Origin: ' + origin + '\r\n' : ''}\r\n`);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('server: origin, per-IP cap, frame cap, join + chat, health', async () => {
  const { server } = createPresence({ env: {}, log: () => {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    assert.equal((await connect(port, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await connect(port, { origin: null })).status, 403);
    const a = await connect(port), b = await connect(port, { origin: 'http://localhost:5173' });
    assert.equal(a.status, 101); assert.equal(b.status, 101);
    a.send(JSON.stringify({ t: 'hello', name: 'Ann', skin: 'iris' })); const wa = await a.next('welcome'); assert.equal(wa.room, 1);
    b.send(JSON.stringify({ t: 'hello', name: 'Bob', skin: 'elise' })); await b.next('welcome');
    assert.equal((await a.next('join')).player.name, 'bob');
    a.send(JSON.stringify({ t: 'chat', text: 'hi bob' })); assert.equal((await b.next('chat')).text, 'hi bob');
    a.send(JSON.stringify({ t: 's', p: [1, 2, 3], h: 0.5, a: 'walk' })); assert.deepEqual((await b.next('snap')).s[0].slice(1), [1, 2, 3, 0.5, 'walk']);
    const c = await connect(port); assert.equal(c.status, 101);
    assert.equal((await connect(port)).status, 429, 'a fourth socket from one IP is refused');
    c.send('x'.repeat(2000)); await wait(100); assert.equal(c.closed, 1009, 'frames over 1 KB close the socket');
    const h = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(h.players, 2); assert.equal(h.roomSize, 15); assert.ok(h.rejected.origin >= 2);
    a.end(); await wait(100);
    assert.equal((await b.next('leave')).id, wa.id);
    b.end();
  } finally { server.close(); }
});

test('server: PRESENCE_DATA_DIR keeps the room history across a restart; a newcomer reads it over the socket', async () => {
  const { mkdtempSync, rmSync, existsSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'ftf-presence-srv-'));
  const run = async (fn) => {
    const { server, history } = createPresence({ env: { PRESENCE_DATA_DIR: dir }, log: () => {} });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try { await fn(server.address().port); } finally { history.save(); server.close(); server.closeAllConnections(); }
  };
  try {
    await run(async (port) => {
      const a = await connect(port); a.send(JSON.stringify({ t: 'hello', name: 'Ann' }));
      assert.deepEqual(await a.next('hist'), { t: 'hist', chat: [], acts: [] });
      a.send(JSON.stringify({ t: 'chat', text: 'still here tomorrow' })); await a.next('chat');
      a.send(JSON.stringify({ t: 'act', k: 'level', v: 3 })); assert.equal((await a.next('act')).k, 'level');
      a.end();
    });
    assert.ok(existsSync(join(dir, 'chat-history.json')));
    await run(async (port) => {
      const b = await connect(port); b.send(JSON.stringify({ t: 'hello', name: 'Bob' }));
      const h = await b.next('hist');
      assert.deepEqual(h.chat.map((m) => [m.name, m.text]), [['ann', 'still here tomorrow']]); assert.deepEqual(h.acts.map((m) => [m.name, m.k, m.v]), [['ann', 'level', 3]]);
      const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
      assert.equal(health.historyFile, true); assert.equal(health.historyLines, 2);
      b.end();
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
