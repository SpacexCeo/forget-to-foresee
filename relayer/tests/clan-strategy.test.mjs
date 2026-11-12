import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStrategy, scriptedStrategy, decideStrategy, clanState, createStrategyBook, runStrategyRound, strategyRequest, llmLabel, SCRIPTED_LABEL, labelFor } from '../lib/clan-strategy.js';
import { TOWN_POLICY } from '../lib/town-traders.js';
import { TRADERS, CLAN_AGENTS, ITEMS } from '../market/catalog.js';

const seeded = (s = 1) => () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
const st0 = () => TOWN_POLICY.init(TRADERS);

test('strategy: the model\'s answer is parsed and bounded; garbage and self-favour are refused', () => {
  assert.deepEqual(parseStrategy('<think>x</think> {"risk": 9, "buy": "DEAR", "favour": "baker", "reason": "rich <b>now</b>"}', 'salt'), { risk: 1.5, buy: 'dear', favour: 'baker', reason: 'rich bnowb' });
  assert.equal(parseStrategy('{"risk": 1, "buy": "gold"}', 'salt'), null);
  assert.equal(parseStrategy('no json', 'salt'), null);
  assert.equal(parseStrategy('{"risk": 0.1, "buy": "staples", "favour": "salt"}', 'salt').favour, null);
  assert.equal(parseStrategy('{"risk": 0.1, "buy": "staples"}', 'salt').risk, 0.5);
});

test('strategy: a state prompt is deterministic (same state, same prompt hash) and holds no secrets', () => {
  const s = clanState('amber', st0(), 12);
  assert.deepEqual([s.clan, s.silk, s.of, s.goods[0].id], ['amber', 1000, 20, 'amber_resin']);
  const a = JSON.stringify(strategyRequest(s)), b = JSON.stringify(strategyRequest(clanState('amber', st0(), 12)));
  assert.equal(a, b); assert.ok(!/sk-|ed25519:/.test(a));
});

test('strategy: LLM when NEAR AI answers (truthful label, audit fields); scripted on no key, 402 or junk', async () => {
  const state = clanState('frost', st0());
  const ok = async () => ({ status: 200, body: { text: '{"risk":1.2,"buy":"staples","favour":"baker","reason":"cold days ahead"}', tee: { model: 'Qwen/Qwen3-VL-30B-A3B-Instruct', chat_id: 'chatcmpl-1', verified: true, request_hash: 'aa', response_hash: 'bb', signature_check: { signature_ok: true } } } });
  const r = await decideStrategy(state, { apiKey: 'proxy-injected', chat: ok, now: () => 5 });
  assert.equal(r.source, 'llm');
  assert.equal(r.label, 'LLM-chosen strategy (Qwen/Qwen3-VL-30B-A3B-Instruct via NEAR AI Cloud, attestation chatcmpl-1), moves by the rules engine');
  assert.deepEqual(r.params, { risk: 1.2, buy: 'staples', favour: 'baker', reason: 'cold days ahead' });
  assert.ok(r.chat_id && r.prompt_hash.length === 64 && r.response.includes('staples') && r.verified);
  const no = await decideStrategy(state, { apiKey: '' });
  assert.deepEqual([no.source, no.label, no.fallback_reason, no.model], ['scripted', 'Scripted (model unavailable: no_key)', 'no_key', null]);
  const pay = await decideStrategy(state, { apiKey: 'k', chat: async () => ({ status: 502, body: { error: 'tee_upstream', upstream_status: 402 } }) });
  assert.deepEqual([pay.source, pay.fallback_reason], ['scripted', 'upstream_402']);
  const junk = await decideStrategy(state, { apiKey: 'k', chat: async () => ({ status: 200, body: { text: 'I think buy bread', tee: { model: 'm' } } }) });
  assert.deepEqual([junk.source, junk.fallback_reason], ['scripted', 'unparseable']);
  assert.deepEqual(scriptedStrategy({ silk: 500, start: 1000 }).buy, 'staples');
  assert.ok(!/\bAI\b/.test(SCRIPTED_LABEL) && llmLabel('m').startsWith('LLM-chosen strategy (m via NEAR AI Cloud)'));
});

test('strategy book: a round asks every clan, journals each decision and reports the LLM share', async () => {
  const logs = []; const book = createStrategyBook({ log: (r) => logs.push(r) });
  let n = 0;
  const chat = async () => (++n % 2 ? { status: 200, body: { text: '{"risk":1,"buy":"balanced"}', tee: { model: 'm', chat_id: 'c' + n, verified: true } } } : { status: 502, body: { error: 'tee_upstream', upstream_status: 402 } });
  await runStrategyRound({ book, st: st0(), opts: { apiKey: 'k', chat } });
  assert.equal(logs.length, CLAN_AGENTS.length);
  const s = book.stats();
  assert.deepEqual([s.decisions_today, s.llm_today, s.scripted_today], [7, 4, 3]);
  assert.equal(s.llm_share_today, 0.571);
  assert.equal(s.clans.length, 7);
  assert.ok(book.get('iris'));
});

test('strategy: the rules engine follows it (staples vs dear goods, risk scales the size), nothing else changes', () => {
  const run = (strat) => {
    const st = st0(), rand = seeded(5); let staples = 0, silk = 0, n = 0;
    for (let i = 0; i < 4_000; i++) { const t = TOWN_POLICY.pick(st, 'salt', rand, TRADERS, strat); if (!t) continue; n++; silk += t.silk; if (['bread', 'stew', 'cider', 'candles', 'lamp_oil', 'charcoal', 'ice_block'].includes(t.item)) staples++; assert.notEqual(t.seller, 'salt'); }
    return { staples: staples / n, mean: silk / n };
  };
  const sta = run({ risk: 1, buy: 'staples', favour: null }), dear = run({ risk: 1, buy: 'dear', favour: null });
  assert.ok(sta.staples > dear.staples + 0.15, JSON.stringify({ sta, dear }));
  const bold = run({ risk: 1.5, buy: 'balanced', favour: null }), shy = run({ risk: 0.5, buy: 'balanced', favour: null });
  assert.ok(bold.mean > shy.mean * 1.3);
  const fav = (() => { const st = st0(), rand = seeded(9); let b = 0; for (let i = 0; i < 2_000; i++) { const t = TOWN_POLICY.pick(st, 'salt', rand, TRADERS, { risk: 1, buy: 'balanced', favour: 'scribe' }); if (t && t.seller === 'scribe') b++; } return b / 2_000; })();
  assert.ok(fav > 0.1, String(fav));
  assert.ok(ITEMS.length === 25);
});

test('labelFor (C11): an LLM label needs an attestation id; the fallback names its reason; scripted labels never say AI or LLM', async () => {
  assert.throws(() => labelFor({ source: 'llm', model: 'm' }), /attestation/);
  assert.equal(labelFor({ source: 'llm', model: 'm', attestationId: 'chat-9' }), 'LLM-chosen strategy (m via NEAR AI Cloud, attestation chat-9), moves by the rules engine');
  for (const reason of [null, 'no_key', 'upstream_402', 'unparseable', 'unattested']) assert.ok(!/\bAI\b|LLM/.test(labelFor({ source: 'scripted', reason })), String(reason));
  const unsigned = await decideStrategy(clanState('frost', st0()), { apiKey: 'k', chat: async () => ({ status: 200, body: { text: '{"risk":1,"buy":"staples","favour":null,"reason":"x"}', tee: { model: 'm', chat_id: 'c', verified: false } } }) });
  assert.deepEqual([unsigned.source, unsigned.fallback_reason, unsigned.label], ['scripted', 'unattested', 'Scripted (model unavailable: unattested)']);
});
