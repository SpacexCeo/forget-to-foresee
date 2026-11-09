// Cross-implementation vectors for the agent-card NFT contract (contracts/agent-card): agent states in, and the token
// id, canonical state JSON, state hash, NEP-177 metadata (title, description, media data URI, media hash, extra) and
// SVG the game's JavaScript twin (src/net/agent-nft.js) produces. The Rust contract must reproduce every byte
// (src/vector_tests.rs). Every invalid case carries the error code both implementations raise.
// Usage: npm run agent-vectors   (writes contracts/agent-card/tests/vectors.json)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { agentState, agentStateJson, agentStateHash, agentTokenId, agentSvg, agentMetadata, AGENT_SPEC } from '../src/net/agent-nft.js';
import { sha256 } from '../src/game/crypto.js';

export const OUT = fileURLToPath(new URL('../../contracts/agent-card/tests/vectors.json', import.meta.url));
const ROOT = '03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a';
const SID = '793f6c05e89839f2';
const N = null;
const trust5 = (agent, base = 50) => ['iris', 'salt', 'ash', 'moss', 'amber', 'frost'].filter((c) => c !== agent).map((clan, i) => ({ clan, trust: (base + 13 * i) % 101, trusted_by: (base + 29 * i) % 101, link_broken: i === 1, remembers_betrayal: i === 3 }));

// The judge playthrough's Iris (contracts/agent-card/judge/: the real state, kept here as a literal so the vectors do
// not depend on the engine).
const JUDGE = {
  spec: AGENT_SPEC, season_id: SID, agent: 'iris', rules: 'v3', schedule_root: ROOT, version: 1, final_tick: 17, outcome: 'weapon', vote: true, heir: N,
  traits: { reading_rule: 'unknown', words_known: 0, confident_cells: 0, bought_words: 0, cells: Array(16).fill(N), wild: false, attention: 3, silk: 0, fragment: 'dark',
    trust: [{ clan: 'salt', trust: 50, trusted_by: 50, link_broken: false, remembers_betrayal: false }, { clan: 'ash', trust: 50, trusted_by: 50, link_broken: true, remembers_betrayal: false }, { clan: 'moss', trust: 65, trusted_by: 50, link_broken: false, remembers_betrayal: false }, { clan: 'amber', trust: 50, trusted_by: 50, link_broken: false, remembers_betrayal: false }, { clan: 'frost', trust: 50, trusted_by: 50, link_broken: false, remembers_betrayal: false }] },
  biography: { remembered: [{ id: 1, kind: 'first', weight: 4, about: N }, { id: 3, kind: 'gift', weight: 1, about: 'moss' }],
    forgotten: [{ shard_id: 7, shard_token: `${SID}-7`, kind: 'call', weight: 2, forgotten_at_tick: 4, fate: 'bought', buyer: 'frost', price: 13, unlocked_index: 3 }] },
};
const CELLS = [0, N, 2, N, N, 1, N, 3, 3, N, N, N, N, 0, 1, 2];
const many = (n, from = 1) => Array.from({ length: n }, (_, i) => ({ id: from + i, kind: ['first', 'call', 'gift', 'betrayal', 'debt', 'promise'][i % 6], weight: i % 5, about: i % 3 ? ['salt', 'ash', 'moss', 'amber', 'frost'][i % 5] : N }));

const CASES = [
  JUDGE,
  // A wild Iris (forgot her owner) who learned the dots rule and eight words; a gift season, she chose an Heir.
  { ...JUDGE, outcome: 'gift', heir: true, final_tick: 17, traits: { ...JUDGE.traits, reading_rule: 'dots', cells: CELLS, words_known: 8, confident_cells: 9, bought_words: 2, wild: true, attention: 2, silk: 148, fragment: 'scroll', trust: trust5('iris', 7) },
    biography: { remembered: [{ id: 3, kind: 'gift', weight: 1, about: 'moss' }, { id: 12, kind: 'promise', weight: 3, about: 'amber' }],
      forgotten: [{ shard_id: 4, shard_token: `${SID}-4`, kind: 'first', weight: 4, forgotten_at_tick: 2, fate: 'bought', buyer: 'salt', price: 27, unlocked_index: 0 },
        { shard_id: 9, shard_token: `${SID}-9`, kind: 'betrayal', weight: 3, forgotten_at_tick: 8, fate: 'burned', buyer: N, price: N, unlocked_index: 5 },
        { shard_id: 21, shard_token: `${SID}-21`, kind: 'debt', weight: 1, forgotten_at_tick: 17, fate: 'open', buyer: N, price: N, unlocked_index: N }] } },
  // The top rule, no vote (the Shells left early), every memory kept, nothing forgotten, a price-0 edge elsewhere.
  { ...JUDGE, outcome: 'gone', vote: N, heir: false, final_tick: 11, traits: { ...JUDGE.traits, reading_rule: 'top', cells: [1, N, N, N, N, N, N, N, N, N, N, N, N, N, N, 3], words_known: 2, confident_cells: 16, silk: 1000000, fragment: 'held', trust: [] },
    biography: { remembered: many(6), forgotten: [] } },
  // Another clan's card (Salt), a 64-character season id, rules v2, version 7, the season voided, a bought-for-0 shard.
  { ...JUDGE, season_id: sha256('long-season-id'), agent: 'salt', rules: 'v2', version: 7, schedule_root: sha256('root-2'), outcome: 'proof_failed', vote: false, final_tick: 19,
    traits: { ...JUDGE.traits, attention: 1, trust: trust5('salt', 99) },
    biography: { remembered: [], forgotten: [{ shard_id: 4294967295, shard_token: `${sha256('long-season-id')}-4294967295`, kind: 'promise', weight: 0, forgotten_at_tick: 1, fate: 'bought', buyer: 'iris', price: 0, unlocked_index: 1023 }] } },
  // Twenty-four kept and five forgotten memories: the image draws the first twelve; an 8-character season id; rules v1.
  { ...JUDGE, season_id: '00ff00ff', rules: 'v1', outcome: 'survived', schedule_root: sha256('root-3'),
    biography: { remembered: many(24, 100), forgotten: [1, 2, 3, 4, 5].map((k) => ({ shard_id: k, shard_token: `00ff00ff-${k}`, kind: 'gift', weight: k % 5, forgotten_at_tick: k, fate: k % 2 ? 'bought' : 'burned', buyer: k % 2 ? 'ash' : N, price: k % 2 ? 4294967295 : N, unlocked_index: N })) } },
  // A lost season, every trust bar full or empty.
  { ...JUDGE, outcome: 'lost', traits: { ...JUDGE.traits, trust: [{ clan: 'salt', trust: 100, trusted_by: 0, link_broken: false, remembers_betrayal: true }, { clan: 'frost', trust: 0, trusted_by: 100, link_broken: true, remembers_betrayal: false }] } },
];

const bio = (b) => ({ ...JUDGE, biography: { ...JUDGE.biography, ...b } });
const tr = (t) => ({ ...JUDGE, traits: { ...JUDGE.traits, ...t } });
const f0 = JUDGE.biography.forgotten[0];
const INVALID = [
  { why: 'wrong spec', code: 'ERR_BAD_SPEC', data: { ...JUDGE, spec: 'ftf-agent/2' } },
  { why: 'uppercase season id', code: 'ERR_BAD_SEASON_ID', data: { ...JUDGE, season_id: '793F6C05E89839F2' } },
  { why: 'short season id', code: 'ERR_BAD_SEASON_ID', data: { ...JUDGE, season_id: 'abc' } },
  { why: 'unknown agent', code: 'ERR_BAD_AGENT', data: { ...JUDGE, agent: 'guests' } },
  { why: 'unknown rules', code: 'ERR_BAD_RULES', data: { ...JUDGE, rules: 'v9' } },
  { why: 'short root', code: 'ERR_BAD_HASH', data: { ...JUDGE, schedule_root: 'abcd' } },
  { why: 'version 0', code: 'ERR_BAD_VERSION', data: { ...JUDGE, version: 0 } },
  { why: 'tick 0', code: 'ERR_BAD_TICK', data: { ...JUDGE, final_tick: 0 } },
  { why: 'tick 20', code: 'ERR_BAD_TICK', data: { ...JUDGE, final_tick: 20 } },
  { why: 'unknown outcome', code: 'ERR_BAD_OUTCOME', data: { ...JUDGE, outcome: 'won' } },
  { why: 'unknown reading rule', code: 'ERR_BAD_TRAITS', data: tr({ reading_rule: 'left' }) },
  { why: '15 cells', code: 'ERR_BAD_TRAITS', data: tr({ cells: Array(15).fill(N) }) },
  { why: 'meaning 4', code: 'ERR_BAD_TRAITS', data: tr({ cells: [4, ...Array(15).fill(N)], words_known: 1 }) },
  { why: 'words_known does not count the cells', code: 'ERR_BAD_TRAITS', data: tr({ words_known: 3 }) },
  { why: 'confident cells 17', code: 'ERR_BAD_TRAITS', data: tr({ confident_cells: 17 }) },
  { why: 'attention 0', code: 'ERR_BAD_TRAITS', data: tr({ attention: 0 }) },
  { why: 'silk above the cap', code: 'ERR_BAD_TRAITS', data: tr({ silk: 1000001 }) },
  { why: 'unknown fragment', code: 'ERR_BAD_TRAITS', data: tr({ fragment: 'lost' }) },
  { why: 'trust in itself', code: 'ERR_BAD_TRUST', data: tr({ trust: [{ clan: 'iris', trust: 50, trusted_by: 50, link_broken: false, remembers_betrayal: false }] }) },
  { why: 'a clan twice', code: 'ERR_BAD_TRUST', data: tr({ trust: [JUDGE.traits.trust[0], JUDGE.traits.trust[0]] }) },
  { why: 'trust 101', code: 'ERR_BAD_TRUST', data: tr({ trust: [{ ...JUDGE.traits.trust[0], trust: 101 }] }) },
  { why: 'memory id 0', code: 'ERR_BAD_MEMORY', data: bio({ remembered: [{ id: 0, kind: 'gift', weight: 1, about: N }] }) },
  { why: 'unknown memory kind', code: 'ERR_BAD_MEMORY', data: bio({ remembered: [{ id: 1, kind: 'insight', weight: 0, about: N }] }) },
  { why: 'weight 5', code: 'ERR_BAD_MEMORY', data: bio({ remembered: [{ id: 1, kind: 'first', weight: 5, about: N }] }) },
  { why: '25 memories', code: 'ERR_BAD_MEMORY', data: bio({ remembered: many(25) }) },
  { why: 'shard token of another season', code: 'ERR_BAD_SHARD', data: bio({ forgotten: [{ ...f0, shard_token: '00ff00ff-7' }] }) },
  { why: 'shard id 0', code: 'ERR_BAD_SHARD', data: bio({ forgotten: [{ ...f0, shard_id: 0, shard_token: `${SID}-0` }] }) },
  { why: 'unlocked index 1024', code: 'ERR_BAD_SHARD', data: bio({ forgotten: [{ ...f0, unlocked_index: 1024 }] }) },
  { why: 'forgotten at tick 18', code: 'ERR_BAD_TICK', data: bio({ forgotten: [{ ...f0, forgotten_at_tick: 18 }] }) },
  { why: 'unknown fate', code: 'ERR_BAD_FATE', data: bio({ forgotten: [{ ...f0, fate: 'stolen' }] }) },
  { why: 'bought without a buyer', code: 'ERR_BAD_FATE', data: bio({ forgotten: [{ ...f0, buyer: N }] }) },
  { why: 'burned with a price', code: 'ERR_BAD_FATE', data: bio({ forgotten: [{ ...f0, fate: 'burned', buyer: N }] }) },
  { why: 'unknown buyer', code: 'ERR_BAD_FATE', data: bio({ forgotten: [{ ...f0, buyer: 'guests' }] }) },
];

export function buildVectors() {
  const agents = CASES.map((input) => {
    const state = agentState(input);
    const svg = agentSvg(state);
    return { input, tokenId: agentTokenId(state), stateJson: agentStateJson(state), stateHash: agentStateHash(state), svg, svgSha256: sha256(svg), metadata: agentMetadata(state) };
  });
  for (const bad of INVALID) {
    let code = null;
    try { agentState(bad.data); } catch (e) { code = e.code; }
    if (code !== bad.code) throw new Error(`invalid case "${bad.why}": expected ${bad.code}, got ${code}`);
  }
  return {
    about: 'Generated by game/scripts/gen-agent-vectors.mjs from src/net/agent-nft.js. Do not edit by hand.',
    spec: AGENT_SPEC,
    image: 'agent card 320x420: the 16-cell dictionary (gold = known), reading rule and counts, up to 12 memories (full = kept, hollow = forgotten, a dot when bought; radius 4 + 2 x weight), trust bars (red = broken link), outcome, the first 16 hex digits of the state hash; integer math only',
    agents,
    invalid: INVALID,
  };
}
export const serialize = (v) => JSON.stringify(v, null, 1) + '\n';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const v = buildVectors();
  writeFileSync(OUT, serialize(v));
  console.log(`wrote ${OUT}: ${v.agents.length} agents, ${v.invalid.length} invalid cases`);
}
