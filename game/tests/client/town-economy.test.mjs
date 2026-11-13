// Town economy (src/game/town-economy.js, docs/agent-rental-plan.md): a separate town ledger, the 98 % expected return
// over 100 000 rounds for every temperament, seed reproducibility, one hire per townsperson and at most 3, levels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hireResult, seededRandom, createTownLedger, levelOf, measuredReturn, publishedView, priceFor, freshAgent, TEMPERAMENTS, EXPECTED_RETURN, CLAMP, HIRE, MAX_HIRES, START_SILK, FOLK_TEMPERAMENT, TOWN_KEY } from '../../src/game/town-economy.js';
import { TOWNSFOLK } from '../../src/play/townsfolk-plan.js';
import { memoryStorage } from '../../src/ui/storage.js';

test('novices start near 98 %: mean round factor over 20 000 fresh hires per temperament, every round inside the 90-110 % cap', () => {
  for (const temp of Object.keys(TEMPERAMENTS)) {
    let sum = 0, n = 0;
    for (let i = 0; i < 20000; i++) for (const r of hireResult({ seed: 'nv-' + temp + i, temperament: temp }).rounds) { assert.ok(r.factor >= CLAMP[0] - 1e-12 && r.factor <= CLAMP[1] + 1e-12); sum += r.factor; n++; }
    const mean = sum / n;
    assert.ok(Math.abs(mean - EXPECTED_RETURN) < 0.01, `${temp}: ${mean}`);
  }
});

test('agents learn: on a series with a learnable pattern the measured return rises well above 98 %', () => {
  const zigzag = (echo, i) => 1000 + (i % 2 ? 30 : -30); // every change reverses: fading it always pays
  let ag = null;
  const early = [], late = [];
  for (let h = 0; h < 120; h++) {
    const r = hireResult({ seed: 'zz' + h, temperament: 'steady', agent: ag, series: zigzag, bars: 40 });
    ag = r.agent;
    for (const x of r.rounds) (h < 4 ? early : h >= 100 ? late : []).push(x.factor);
  }
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  assert.ok(avg(late) >= avg(early), `early ${avg(early)} late ${avg(late)}`);
  assert.ok(avg(late) > EXPECTED_RETURN + 0.05, 'well above the novice 98 %');
  const sd = (a) => Math.sqrt(avg(a.map((x) => x * x)) - avg(a) ** 2);
  assert.ok(sd(late) <= sd(early) + 1e-9, 'it settles: fewer exploring rounds late');
  assert.equal(ag.arms.indexOf(ag.arms.reduce((m, x) => (x.mean > m.mean ? x : m))), 1, 'fade is the learned arm');
  assert.ok(measuredReturn(ag) > EXPECTED_RETURN);
});

test('decisions read published bars only: the policy view asks for t and t-1, never t+1', () => {
  const asked = [];
  const series = (echo, i) => { asked.push(i); return 1000 + i; };
  const v = publishedView(series, 'salt', 7);
  assert.deepEqual(asked.sort(), [6, 7]);
  assert.deepEqual(Object.keys(v).sort(), ['echo', 'lastChange', 't']);
  const src = readFileSync(new URL('../../src/game/town-economy.js', import.meta.url), 'utf8');
  const choose = src.slice(src.indexOf('export function chooseArm'), src.indexOf('/** Position for an arm'));
  assert.doesNotMatch(choose, /series|bars|t \+ 1/);
});

test('seed: the same seed and the same agent history give the same result; amounts are integer hundredths', () => {
  const hist = hireResult({ seed: 'warm-up', temperament: 'steady' }).agent;
  const a = hireResult({ seed: 'baker-3', temperament: 'steady', agent: hist }), b = hireResult({ seed: 'baker-3', temperament: 'steady', agent: JSON.parse(JSON.stringify(hist)) });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.agent.arms, hireResult({ seed: 'baker-3', temperament: 'steady', agent: freshAgent() }).agent.arms, 'history matters');
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
  t += HIRE.roundSeconds * 1000 * 2;
  assert.equal(L.hireOf('baker').done, 2, 'rounds are revealed as time passes (open trades)');
  t += HIRE.rounds * HIRE.roundSeconds * 1000;
  const r = L.collect('baker');
  assert.equal(r.ok, true);
  assert.deepEqual(r.result.rounds, hireResult({ seed: r.result.seed, temperament: FOLK_TEMPERAMENT.baker, npc: 'baker' }).rounds, 'the shown seed (a novice) reproduces the result');
  assert.equal(L.log('baker').length, HIRE.rounds, 'one log line per round');
  assert.equal(L.closed.length, 1);
  assert.equal(L.agent('baker').experience, HIRE.rounds, 'the agent keeps what it learned');
  assert.equal(L.equity.length, 2);
  assert.equal(L.silk, (START_SILK - 3 * HIRE.price) * 100 + r.result.back);
  assert.ok(L.xp > 0);
  const again = createTownLedger({ storage, now: () => t });
  assert.equal(again.silk, L.silk);
  assert.equal(again.hires().length, 2);
  assert.ok(JSON.parse(storage.getItem(TOWN_KEY)).v === 1);
  assert.equal(L.hire('nobody').reason, 'unknown');
});

test('price grows with experience: +1 per 25 rounds, capped at 20', () => {
  assert.deepEqual([priceFor(0), priceFor(24), priceFor(25), priceFor(1000)], [10, 10, 11, 20]);
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
  assert.equal(PLAY_MESSAGES.en['hire.local'], 'Local — in-game currency only, no real money. The agent is a scripted learning program (Thompson sampling), not an AI model.');
  assert.match(PLAY_MESSAGES.en['hire.card.returnLine'], /98 %.*2 % guild fee.*learns/);
  assert.equal(PLAY_MESSAGES.en['hire.hire'], 'Hire me as your agent');
  assert.doesNotMatch(keys.map((k) => PLAY_MESSAGES.en[k]).join(' '), /\b(RTP|bet|jackpot|gamble|casino)\b/i);
});

test('Judge Echo board: a learning agent is scored by the drill rules on published bars only, deterministically', async () => {
  const { echoDrillScore } = await import('../../src/game/town-economy.js');
  const rules = await import('../../src/game/exchange.js');
  const { JUDGE_WINDOW } = await import('../../src/net/exchange-deployment.js');
  let ag = null;
  for (let h = 0; h < 40; h++) ag = hireResult({ seed: 'echo' + h, temperament: 'steady', agent: ag }).agent;
  const a = echoDrillScore(ag, JUDGE_WINDOW, rules), b = echoDrillScore(JSON.parse(JSON.stringify(ag)), JUDGE_WINDOW, rules);
  assert.equal(a, b);
  assert.ok(Number.isInteger(a));
  assert.equal(echoDrillScore(freshAgent(), JUDGE_WINDOW, rules), 10000, 'a novice (no learned edge) stands aside: 100 practice silk');
  const src = readFileSync(new URL('../../src/game/town-economy.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export function echoDrillScore'), src.indexOf('/** Measured return'));
  assert.match(fn, /publishedView\(snapshotSeries, echo, i\)/, 'the decision reads the published view of bar i');
});
