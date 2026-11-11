// Town economy (src/game/town-economy.js, docs/agent-rental-plan.md): a separate town ledger, the 98 % expected return
// over 100 000 rounds for every temperament, seed reproducibility, one hire per townsperson and at most 3, levels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hireResult, roundFactor, seededRandom, createTownLedger, levelOf, TEMPERAMENTS, EXPECTED_RETURN, HIRE, MAX_HIRES, START_SILK, FOLK_TEMPERAMENT, TOWN_KEY } from '../../src/game/town-economy.js';
import { TOWNSFOLK } from '../../src/play/townsfolk-plan.js';
import { memoryStorage } from '../../src/ui/storage.js';

test('distribution: mean 0.98 within ±0.5 % over 100 000 rounds for each temperament; spread grows with boldness', () => {
  const sd = {};
  for (const temp of Object.keys(TEMPERAMENTS)) {
    const rand = seededRandom('dist-' + temp);
    let sum = 0, sq = 0;
    const N = 100000;
    for (let i = 0; i < N; i++) { const f = roundFactor(rand, temp); assert.ok(f > 0); sum += f; sq += f * f; }
    const mean = sum / N;
    sd[temp] = Math.sqrt(sq / N - mean * mean);
    assert.ok(Math.abs(mean / EXPECTED_RETURN - 1) < 0.005, `${temp}: mean ${mean}`);
  }
  assert.ok(sd.cautious < sd.steady && sd.steady < sd.bold);
  // whole hires too: the average net over many hires is about -2 % of the price
  let net = 0;
  for (let i = 0; i < 20000; i++) net += hireResult({ seed: 'h' + i, temperament: 'bold' }).net;
  assert.ok(Math.abs(net / 20000 / (HIRE.price * 100) + 0.02) < 0.005, 'mean net ' + net / 20000);
});

test('seed: the same seed gives the same result; amounts are integer hundredths', () => {
  const a = hireResult({ seed: 'baker-3', temperament: 'steady' }), b = hireResult({ seed: 'baker-3', temperament: 'steady' });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, hireResult({ seed: 'baker-4', temperament: 'steady' }));
  assert.equal(a.rounds.length, HIRE.rounds);
  for (const r of a.rounds) assert.ok(Number.isInteger(r.back) && Number.isInteger(r.stake));
  assert.equal(a.net, a.back - a.price);
});

test('ledger: one hire per townsperson, at most 3, price paid up front, results after the rounds, persisted', () => {
  let t = 1000;
  const storage = memoryStorage();
  const L = createTownLedger({ storage, now: () => t });
  assert.equal(L.silk, START_SILK * 100);
  assert.equal(L.hire('baker').ok, true);
  assert.equal(L.silk, (START_SILK - HIRE.price) * 100);
  assert.equal(L.hire('baker').reason, 'busy');
  L.hire('guard'); L.hire('elder');
  assert.equal(L.hire('musician').reason, 'max');
  assert.equal(L.hires().length, MAX_HIRES);
  assert.equal(L.collect('baker').reason, 'working');
  t += HIRE.rounds * HIRE.roundSeconds * 1000;
  const r = L.collect('baker');
  assert.equal(r.ok, true);
  assert.deepEqual(r.result.rounds, hireResult({ seed: r.result.seed, temperament: FOLK_TEMPERAMENT.baker }).rounds, 'the shown seed reproduces the result');
  assert.equal(L.silk, (START_SILK - 3 * HIRE.price) * 100 + r.result.back);
  assert.ok(L.xp > 0);
  const again = createTownLedger({ storage, now: () => t });
  assert.equal(again.silk, L.silk);
  assert.equal(again.hires().length, 2);
  assert.ok(JSON.parse(storage.getItem(TOWN_KEY)).v === 1);
  assert.equal(L.hire('nobody').reason, 'unknown');
});

test('every townsperson has a temperament; levels and titles; the ledger never imports the engine', () => {
  for (const p of TOWNSFOLK) assert.ok(TEMPERAMENTS[FOLK_TEMPERAMENT[p.key]], p.key);
  assert.deepEqual([levelOf(0).level, levelOf(99).level, levelOf(100).level, levelOf(300).level], [1, 1, 2, 3]);
  assert.equal(levelOf(0).title, 'newcomer');
  const src = readFileSync(new URL('../../src/game/town-economy.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /from '\.\/engine|net\/room|engine-host/);
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /\b(RTP|jackpot|gamble|bet)\b/i);
});

test('inventory: On-chain is empty when the RPC check fails, and lists only what the contract returns', async () => {
  const { readOnChain } = await import('../../src/play/profile.js');
  const { NEAR_DEPLOYMENT } = await import('../../src/net/near-deployment.js');
  const off = await readOnChain({ deployment: NEAR_DEPLOYMENT, fetch: async () => { throw new TypeError('fetch failed'); } });
  assert.deepEqual(off, { state: 'offline', items: [] });
  const enc = (v) => Array.from(new TextEncoder().encode(JSON.stringify(v)));
  const one = [{ token_id: '793f6c05e89839f2-7', owner_id: 'lambada_eth.testnet', data: { owner_clan: 'iris', kind: 'call' } }];
  const ok = await readOnChain({ deployment: NEAR_DEPLOYMENT, fetch: async () => ({ ok: true, json: async () => ({ result: { result: enc(one), block_height: 1 } }) }) });
  assert.equal(ok.state, 'loaded');
  assert.equal(ok.items.length, Object.keys(NEAR_DEPLOYMENT.shardMints).length, 'one confirmed token per season read');
  assert.match(ok.items[0].href, /nearblocks\.io\/nft-token\/ftf-shards\.testnet\/793f6c05e89839f2-7$/);
  assert.deepEqual(await readOnChain({ deployment: { ...NEAR_DEPLOYMENT, shardContractId: null } }), { state: 'disabled', items: [] });
});

test('rental, profile and inventory strings: five locales, the local label, the honest 98 %, no casino words', async () => {
  const { PLAY_MESSAGES } = await import('../../src/play/i18n.js');
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => /^(hire|profile|inv|folk)\./.test(k));
  assert.ok(keys.length >= 70);
  for (const loc of ['ru', 'uk', 'it', 'zh']) for (const k of keys) assert.ok(PLAY_MESSAGES[loc][k], `${loc}:${k}`);
  for (const p of TOWNSFOLK) assert.ok(PLAY_MESSAGES.en['folk.name.' + p.key], p.key);
  assert.equal(PLAY_MESSAGES.en['hire.local'], 'Local — in-game currency only, no real money.');
  assert.match(PLAY_MESSAGES.en['hire.card.returnLine'], /98 %.*2 % guild fee/);
  assert.equal(PLAY_MESSAGES.en['hire.hire'], 'Hire me as your agent');
  assert.doesNotMatch(keys.map((k) => PLAY_MESSAGES.en[k]).join(' '), /\b(RTP|bet|jackpot|gamble|casino)\b/i);
});
