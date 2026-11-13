// The one silk number (sprint 6.2): the HUD chip and the portal once showed 128.64 and 38 for the same word.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { computeSilkView, formatSilkC, createSilkModel, installSilkModel, silkView, subscribeSilk } from '../../src/net/silk-balance.js';
import { generateKeyPair } from '../../src/net/near-tx.js';

test('silk view: the table of the sprint spec', () => {
  const a = computeSilkView({ localTotalC: 12864, onChainC: 3800, creditableC: 6000, feeC: 20000, chainOk: true });
  assert.deepEqual([a.gateC, a.pendingC, a.playC, a.totalC], [3800, 2200, 6864, 12864]); // (a)
  const b = computeSilkView({ localTotalC: 12864, onChainC: 12864, creditableC: 12864, chainOk: true });
  assert.deepEqual([b.pendingC, b.playC], [0, 0]); // (b)
  assert.equal(computeSilkView({ onChainC: 25000, feeC: 20000, chainOk: true }).enoughForGate, true); // (c)
  const d = computeSilkView({ onChainC: 15000, creditableC: 21000, feeC: 20000, chainOk: true });
  assert.equal(d.pendingC, 6000); assert.equal(d.canSyncToEnough, true); assert.equal(d.enoughForGate, false); // (d)
  assert.equal(computeSilkView({ onChainC: 25000, feeC: 20000, chainOk: false }).enoughForGate, false); // never "enough" before a read
  // after the gate burned 200 silk, credited (not the chain number) keeps pending honest
  const paid = computeSilkView({ localTotalC: 30000, onChainC: 1000, creditableC: 21000, creditedC: 21000, chainOk: true });
  assert.equal(paid.pendingC, 0);
});

test('silk view: one formatter for every silk number', () => { // (h)
  assert.deepEqual([0, 50, 3800, 3801, 123450, 12864].map(formatSilkC), ['0', '0.5', '38', '38.01', '1,234.5', '128.64']);
});

function fakeRelayer(answers) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init }); const a = answers.shift();
    if (a instanceof Error) throw a;
    return { ok: a.status === 200, status: a.status, headers: { get: (k) => (a.headers || {})[k] }, json: async () => a.body };
  };
  return { fetch, calls };
}
const timers = { setInterval: () => 0, clearInterval: () => {} };
async function guestStorage() {
  const kp = await generateKeyPair(); const m = new Map();
  m.set('ftf.day1.v1', JSON.stringify({ minted: true, guest: { account_id: 'ann-1.guests.testnet', token_id: 'elise-ann-1' }, playerKey: { secretKey: kp.secretKey } }));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
}

test('silk model: reads the chain; a failed read keeps the last good number, stale, never 0; the first failure says chainOk false', async () => {
  const storage = await guestStorage(); const ledger = { silk: 12864, subscribe: () => () => {} };
  let t = 0; const now = () => (t += 10_000);
  const { fetch } = fakeRelayer([{ status: 200, body: { silk: '38000000', gate_price: '200000000', creditable: '60000000', credited: '38000000', day_room: '262000000' } }, new Error('offline')]);
  const m = createSilkModel({ ledger, storage, base: 'https://r.example', fetch, now, timers, win: null, doc: null });
  const v1 = await m.refresh(true);
  assert.deepEqual([v1.gateC, v1.pendingC, v1.playC, v1.feeC, v1.chainOk, v1.stale], [3800, 2200, 6864, 20000, true, false]);
  const v2 = await m.refresh(true);
  assert.equal(v2.gateC, 3800); assert.equal(v2.stale, true); // (e)
  const first = createSilkModel({ ledger, storage, base: 'https://r.example', fetch: fakeRelayer([new Error('x')]).fetch, now, timers, win: null, doc: null });
  const f = await first.refresh(true);
  assert.equal(f.chainOk, false); assert.equal(f.gateC, 0); assert.equal(f.stale, false); // (f)
  const g = createSilkModel({ ledger, storage, base: 'https://r.example', fetch: fakeRelayer([{ status: 200, body: { silk: '0', gate_price: '250000000' } }]).fetch, now, timers, win: null, doc: null });
  assert.equal((await g.refresh(true)).feeC, 25000); // (g) the chain's price wins over the config
});

test('silk model: Sync flushes the log, signs credit_only and maps 429, no_verified_log and the network', async () => { // (j)
  const storage = await guestStorage(); const ledger = { silk: 12864, subscribe: () => () => {} };
  let flushed = 0; const now = () => 1_000;
  const ok = fakeRelayer([{ status: 200, body: { silk: '60000000', credited_now: '22000000', credited_total: '60000000', creditable: '60000000' } }]);
  const m = createSilkModel({ ledger, storage, flush: async () => { flushed++; }, base: 'https://r.example', fetch: ok.fetch, now, timers, win: null, doc: null });
  const r = await m.syncNow();
  assert.deepEqual(r, { ok: true, creditedC: 2200 }); assert.equal(flushed, 1);
  const body = JSON.parse(ok.calls[0].init.body);
  assert.equal(body.credit_only, true); assert.equal(body.account_id, 'ann-1.guests.testnet'); assert.equal(body.at, 1_000);
  assert.equal(m.view().gateC, 6000); assert.equal(m.view().pendingC, 0); assert.equal(m.view().syncing, false);
  const lim = createSilkModel({ ledger, storage, base: 'https://r.example', fetch: fakeRelayer([{ status: 429, headers: { 'Retry-After': '30' }, body: { error: 'rate_limited' } }]).fetch, now, timers, win: null, doc: null });
  assert.deepEqual(await lim.syncNow(), { ok: false, reason: 'rate_limited', retryAfterS: 30 });
  const nolog = createSilkModel({ ledger, storage, base: 'https://r.example', fetch: fakeRelayer([{ status: 409, body: { error: 'no_verified_log' } }]).fetch, now, timers, win: null, doc: null });
  assert.deepEqual(await nolog.syncNow(), { ok: false, reason: 'no_verified_log' });
  const off = createSilkModel({ ledger, storage, base: 'https://r.example', fetch: fakeRelayer([new Error('x')]).fetch, now, timers, win: null, doc: null });
  assert.deepEqual(await off.syncNow(), { ok: false, reason: 'network' });
  const none = createSilkModel({ ledger, storage: { getItem: () => null }, base: 'https://r.example', fetch: ok.fetch, now, timers, win: null, doc: null });
  assert.deepEqual(await none.syncNow(), { ok: false, reason: 'need_guest' });
  assert.equal((await none.refresh(true)).noAccount, true); // no account: the chip shows this device's silk, labelled "This device"
});

test('silk model: the shared instance is what every surface reads; before boot it says "checking" (chainOk false)', async () => {
  assert.equal(silkView().chainOk, false);
  const seen = []; const un = subscribeSilk((v) => seen.push(v.gateC));
  installSilkModel({ view: () => computeSilkView({ onChainC: 3800, chainOk: true }), subscribe: () => () => {}, syncNow: async () => ({ ok: true }), refresh: async () => {} });
  assert.equal(silkView().gateC, 3800); assert.deepEqual(seen, [3800]);
  installSilkModel(null); un();
});

test('silk: no surface formats a silk balance by itself (one formatter, formatSilkC)', () => { // (i)
  const root = new URL('../../src/', import.meta.url).pathname;
  const files = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk(root);
  const bad = [];
  for (const f of files) {
    if (f.endsWith('net/silk-balance.js')) continue;
    const src = readFileSync(f, 'utf8');
    for (const line of src.split('\n')) {
      if (/silk/i.test(line) && /balanceC\(\)\s*\/\s*100/.test(line)) bad.push(f + ': ' + line.trim().slice(0, 100));
      if (/silk/i.test(line) && /Math\.floor\([^)]*[bB]alance[^)]*\/\s*100\)/.test(line)) bad.push(f + ': ' + line.trim().slice(0, 100));
    }
  }
  assert.deepEqual(bad, []);
});
