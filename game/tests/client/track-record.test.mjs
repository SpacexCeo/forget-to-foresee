// Agent track records (src/game/track-record.js): a collected hire becomes a compact record that replays to the same
// trades and PnL; forged trades, PnL, params or another snapshot fail with the first mismatch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTownLedger } from '../../src/game/town-economy.js';
import { trackArgs, verifyTrack, parseTrades, POLICY_VERSION, SNAPSHOT_SHA256 } from '../../src/game/track-record.js';
import { sha256 } from '../../src/game/crypto.js';
import { memoryStorage } from '../../src/ui/storage.js';

function twoHires() {
  let t = 1_000_000;
  const L = createTownLedger({ storage: memoryStorage(), now: () => t });
  const out = [];
  for (let i = 0; i < 2; i++) { assert.equal(L.hire('innkeeper').ok, true); t += 60_000; const r = L.collect('innkeeper'); assert.equal(r.ok, true); out.push(r.result); }
  return out;
}

test('a collected hire becomes a record that replays exactly (also the second hire, after learning)', () => {
  for (const res of twoHires()) {
    const a = trackArgs('innkeeper', res);
    assert.equal(a.policy_version, POLICY_VERSION); assert.equal(a.snapshot_sha256, SNAPSHOT_SHA256);
    assert.equal(a.params_hash, sha256(a.params));
    assert.equal(parseTrades(a.trades_compact).length, 5);
    assert.ok(a.trades_compact.length < 200 && a.params.length < 400, 'small enough for the chain');
    const v = verifyTrack(a);
    assert.equal(v.ok, true, JSON.stringify(v).slice(0, 200)); assert.equal(v.trades, 5); assert.equal(v.pnlBp, a.pnl_bp);
  }
  const [first, second] = twoHires();
  assert.notEqual(JSON.parse(trackArgs('innkeeper', second).params).before.rounds, JSON.parse(trackArgs('innkeeper', first).params).before.rounds, 'the second epoch starts from what the first one learned');
});

test('forgeries fail with the reason and the first mismatch', () => {
  const a = trackArgs('innkeeper', twoHires()[0]);
  const parts = a.trades_compact.split(';'); const f = parts[2].split(','); f[4] = String(Number(f[4]) + 5); parts[2] = f.join(',');
  const forgedTrade = verifyTrack({ ...a, trades_compact: parts.join(';') });
  assert.equal(forgedTrade.ok, false); assert.equal(forgedTrade.reason, 'trades'); assert.equal(forgedTrade.at, 2);
  assert.equal(verifyTrack({ ...a, pnl_bp: a.pnl_bp + 100 }).reason, 'pnl');
  assert.equal(verifyTrack({ ...a, params: a.params.replace('"price":', '"price": ') }).reason, 'params-hash');
  const p = JSON.parse(a.params); p.price += 1; const pj = JSON.stringify(p);
  assert.equal(verifyTrack({ ...a, params: pj, params_hash: sha256(pj) }).reason, 'trades', 'other params give other trades');
  assert.equal(verifyTrack({ ...a, snapshot_sha256: '00'.repeat(32) }).reason, 'snapshot');
  assert.equal(verifyTrack({ ...a, policy_version: 'x' }).reason, 'policy');
  assert.equal(verifyTrack(null).reason, 'missing');
  assert.throws(() => trackArgs('innkeeper', { seed: 's', rounds: [] }), /no agent state/);
});
