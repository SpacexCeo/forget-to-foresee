// The agent card (contracts/agent-card): one NEP-171 token per (season, agent) that records the agent's end-of-season
// state. This module is the JavaScript twin of the contract's data rules, metadata and image (byte for byte, pinned by
// contracts/agent-card/tests/vectors.json), the builder of the canonical state from the room's observation, and the
// read-only client that checks a minted card against this browser's own season.
//
// What the card proves: the state hash is sha256 of the canonical state JSON (the token's NEP-177 `extra`), recomputed
// by the contract at mint time; the schedule root equals the root committed on the season-commit contract (anyone can
// compare `get_agent` with `get_season`). What it does not: the card is minted by the season coordinator for the judge
// season; it is not player-owned yet, and the dictionary in it is valid for this season's seed only (the stroke-to-
// meaning permutation is per seed), so nothing here claims a dictionary carried across seasons.
//
// Rules of the client part (same as near.js): read-only JSON-RPC views, no wallet, no key, no transaction; never a fake
// success: before the owner deploys and mints, the model says 'not-minted'.
// Integer arithmetic and ASCII enums only, so the two languages cannot drift.
import { sha256 } from '../game/crypto.js';
import { NEAR_DEPLOYMENT } from './near-deployment.js';
import { createNearClient } from './near.js';
import { CLANS, KIND_COLOR } from './shard-nft.js';

export const AGENT_SPEC = 'ftf-agent/1';
/** The agent's state version: 1 = the first season card. */
export const AGENT_STATE_VERSION = 1;
/** Where the owner deploys the contract (docs/agent-nft.md); `NEAR_DEPLOYMENT.agentContractId` overrides it. */
export const DEFAULT_AGENT_CONTRACT = 'ftf-agents.testnet';
export const MEMORY_KINDS = ['first', 'call', 'gift', 'betrayal', 'debt', 'promise'];
export const OUTCOMES = ['gift', 'weapon', 'survived', 'lost', 'gone', 'proof_failed'];
export const READING_RULES = ['unknown', 'top', 'dots'];
export const RULES = ['v1', 'v2', 'v3'];
export const FRAGMENTS = ['held', 'dark', 'scroll'];
export const FATES = ['bought', 'burned', 'open'];
export const MAX_MEMORIES = 24;
/** The English outcome phrases in the token description (the same words as the game's `outcome.*` strings). */
export const OUTCOME_TEXT = Object.freeze({
  gift: 'the message was a gift', weapon: 'the message was a weapon', survived: 'the weapon was refused',
  lost: 'a gift was refused', gone: 'the Shells left', proof_failed: 'the season was voided',
});

const HEX = /^[0-9a-f]+$/;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

class AgentDataError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.name = 'AgentDataError'; this.code = code; }
}
const fail = (code, message) => { throw new AgentDataError(code, message); };
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isHash = (v) => typeof v === 'string' && v.length === 64 && HEX.test(v);
const optBool = (v, code, name) => { if (v === null || v === undefined) return null; if (typeof v !== 'boolean') fail(code, `${name} must be true, false or null`); return v; };
const oneOf = (v, list, code, name) => { if (typeof v !== 'string' || !list.includes(v)) fail(code, `${name} must be one of ${list.join(', ')}`); return v; };

/**
 * Validates and normalises an agent state (the token's `extra`). Field order is canonical; the error codes are the
 * contract's (ERR_BAD_*). Same rules as `AgentState::validate` in contracts/agent-card/src/state.rs.
 */
export function agentState(d) {
  if (!d || typeof d !== 'object') fail('ERR_BAD_SPEC', 'state must be an object');
  if (d.spec !== AGENT_SPEC) fail('ERR_BAD_SPEC', `spec must be ${AGENT_SPEC}`);
  const season_id = d.season_id;
  if (typeof season_id !== 'string' || season_id.length < 8 || season_id.length > 64 || !HEX.test(season_id)) fail('ERR_BAD_SEASON_ID', 'season_id must be 8-64 lowercase hex characters');
  const agent = oneOf(d.agent, CLANS, 'ERR_BAD_AGENT', 'agent');
  const rules = oneOf(d.rules, RULES, 'ERR_BAD_RULES', 'rules');
  if (!isHash(d.schedule_root)) fail('ERR_BAD_HASH', 'schedule_root must be 64 lowercase hex characters');
  if (!isInt(d.version, 1, 1000)) fail('ERR_BAD_VERSION', 'version must be 1-1000');
  if (!isInt(d.final_tick, 1, 19)) fail('ERR_BAD_TICK', 'final_tick must be 1-19');
  const outcome = oneOf(d.outcome, OUTCOMES, 'ERR_BAD_OUTCOME', 'outcome');
  const vote = optBool(d.vote, 'ERR_BAD_OUTCOME', 'vote');
  const heir = optBool(d.heir, 'ERR_BAD_OUTCOME', 'heir');

  const t = d.traits;
  if (!t || typeof t !== 'object') fail('ERR_BAD_TRAITS', 'traits must be an object');
  const reading_rule = oneOf(t.reading_rule, READING_RULES, 'ERR_BAD_TRAITS', 'reading_rule');
  if (!Array.isArray(t.cells) || t.cells.length !== 16) fail('ERR_BAD_TRAITS', 'cells must list the 16 dictionary cells');
  const cells = t.cells.map((c) => { if (c === null || c === undefined) return null; if (!isInt(c, 0, 3)) fail('ERR_BAD_TRAITS', 'a known cell is a meaning 0-3'); return c; });
  if (!isInt(t.words_known, 0, 16) || t.words_known !== cells.filter((c) => c !== null).length) fail('ERR_BAD_TRAITS', 'words_known must count the known cells');
  if (!isInt(t.confident_cells, 0, 16)) fail('ERR_BAD_TRAITS', 'confident_cells must be 0-16');
  if (!isInt(t.bought_words, 0, 16)) fail('ERR_BAD_TRAITS', 'bought_words must be 0-16');
  if (typeof t.wild !== 'boolean') fail('ERR_BAD_TRAITS', 'wild must be a boolean');
  if (!isInt(t.attention, 1, 3)) fail('ERR_BAD_TRAITS', 'attention must be 1-3');
  if (!isInt(t.silk, 0, 1000000)) fail('ERR_BAD_TRAITS', 'silk must be 0-1000000');
  const fragment = oneOf(t.fragment, FRAGMENTS, 'ERR_BAD_TRAITS', 'fragment');
  if (!Array.isArray(t.trust) || t.trust.length > 5) fail('ERR_BAD_TRUST', 'trust lists at most the five other clans');
  const seen = new Set();
  const trust = t.trust.map((e) => {
    const clan = oneOf(e && e.clan, CLANS, 'ERR_BAD_TRUST', 'trust clan');
    if (clan === agent || seen.has(clan)) fail('ERR_BAD_TRUST', 'trust clans are the other clans, once each');
    seen.add(clan);
    if (!isInt(e.trust, 0, 100) || !isInt(e.trusted_by, 0, 100)) fail('ERR_BAD_TRUST', 'trust values are 0-100');
    if (typeof e.link_broken !== 'boolean' || typeof e.remembers_betrayal !== 'boolean') fail('ERR_BAD_TRUST', 'link_broken and remembers_betrayal are booleans');
    return { clan, trust: e.trust, trusted_by: e.trusted_by, link_broken: e.link_broken, remembers_betrayal: e.remembers_betrayal };
  });

  const b = d.biography;
  if (!b || typeof b !== 'object' || !Array.isArray(b.remembered) || !Array.isArray(b.forgotten)) fail('ERR_BAD_MEMORY', 'biography lists remembered and forgotten memories');
  if (b.remembered.length > MAX_MEMORIES || b.forgotten.length > MAX_MEMORIES) fail('ERR_BAD_MEMORY', `at most ${MAX_MEMORIES} memories per list`);
  const remembered = b.remembered.map((m) => {
    if (!m || !isInt(m.id, 1, 4294967295)) fail('ERR_BAD_MEMORY', 'memory id must be 1 or more');
    const kind = oneOf(m.kind, MEMORY_KINDS, 'ERR_BAD_MEMORY', 'memory kind');
    if (!isInt(m.weight, 0, 4)) fail('ERR_BAD_MEMORY', 'memory weight must be 0-4');
    const about = m.about === null || m.about === undefined ? null : oneOf(m.about, CLANS, 'ERR_BAD_MEMORY', 'about');
    return { id: m.id, kind, weight: m.weight, about };
  });
  const forgotten = b.forgotten.map((m) => {
    if (!m || !isInt(m.shard_id, 1, 4294967295)) fail('ERR_BAD_SHARD', 'shard_id must be 1 or more');
    if (m.shard_token !== `${season_id}-${m.shard_id}`) fail('ERR_BAD_SHARD', 'shard_token must be <season_id>-<shard_id>');
    const kind = oneOf(m.kind, MEMORY_KINDS, 'ERR_BAD_MEMORY', 'memory kind');
    if (!isInt(m.weight, 0, 4)) fail('ERR_BAD_MEMORY', 'memory weight must be 0-4');
    if (!isInt(m.forgotten_at_tick, 1, 17)) fail('ERR_BAD_TICK', 'forgotten_at_tick must be 1-17');
    const fate = oneOf(m.fate, FATES, 'ERR_BAD_FATE', 'fate');
    const buyer = m.buyer === null || m.buyer === undefined ? null : oneOf(m.buyer, CLANS, 'ERR_BAD_FATE', 'buyer');
    const price = m.price === null || m.price === undefined ? null : m.price;
    if (price !== null && !isInt(price, 0, 4294967295)) fail('ERR_BAD_FATE', 'price must be a whole number of silk');
    if ((fate === 'bought') !== (buyer !== null) || (buyer !== null) !== (price !== null)) fail('ERR_BAD_FATE', 'a bought shard has a buyer and a price, and only a bought one');
    const unlocked_index = m.unlocked_index === null || m.unlocked_index === undefined ? null : m.unlocked_index;
    if (unlocked_index !== null && !isInt(unlocked_index, 0, 1023)) fail('ERR_BAD_SHARD', 'unlocked_index must be 0-1023');
    return { shard_id: m.shard_id, shard_token: m.shard_token, kind, weight: m.weight, forgotten_at_tick: m.forgotten_at_tick, fate, buyer, price, unlocked_index };
  });
  return {
    spec: AGENT_SPEC, season_id, agent, rules, schedule_root: d.schedule_root, version: d.version, final_tick: d.final_tick, outcome, vote, heir,
    traits: { reading_rule, words_known: t.words_known, confident_cells: t.confident_cells, bought_words: t.bought_words, cells, wild: t.wild, attention: t.attention, silk: t.silk, fragment, trust },
    biography: { remembered, forgotten },
  };
}

/** The canonical state JSON: normalised, canonical field order, no spaces. This is the token's `extra`. */
export const agentStateJson = (s) => JSON.stringify(agentState(s));
/** sha256 (hex) of the canonical state JSON: the state hash the contract recomputes at mint. */
export const agentStateHash = (s) => sha256(agentStateJson(s));
export const agentTokenId = (s) => `${s.season_id}-agent-${s.agent}`;

/**
 * The agent's canonical end-of-season state from the room's observation (obs.season.phase must be 'end').
 * Iris only for now: the observation carries the controller's agent. Secret phrases (the owner's Key) never enter it.
 */
export function agentStateFromObservation(obs, { agent = 'iris', version = AGENT_STATE_VERSION } = {}) {
  const s = obs && obs.season;
  if (!s || s.phase !== 'end') throw new AgentDataError('ERR_NOT_ENDED', 'the season has not ended');
  if (agent !== 'iris') throw new AgentDataError('ERR_BAD_AGENT', 'only the controller agent (Iris) is observable');
  const dict = obs.dictionary || { cells: [], boughtWords: [] };
  const cells = Array(16).fill(null);
  for (const c of dict.cells || []) cells[c.slot * 4 + c.form] = c.known ?? null;
  const vote = (s.votes || []).find((v) => v.clan === agent);
  const iris = obs.iris || {};
  const rel = (obs.relationships && obs.relationships.clans) || [];
  return agentState({
    spec: AGENT_SPEC, season_id: s.seasonId, agent, rules: s.rules, schedule_root: s.merkleRoot, version,
    final_tick: s.tick, outcome: s.outcome, vote: vote ? !!vote.accept : null, heir: s.heir ?? null,
    traits: {
      reading_rule: dict.readingRule, words_known: cells.filter((c) => c !== null).length, confident_cells: dict.confidentCells,
      bought_words: (dict.boughtWords || []).length, cells, wild: !!iris.firstWordForgotten, attention: iris.maxAttention, silk: iris.silk,
      fragment: iris.fragment ? iris.fragment.status : 'dark',
      trust: rel.map((c) => ({ clan: c.clan, trust: Math.round(c.irisTrust), trusted_by: Math.round(c.trustInIris), link_broken: !!c.linkBroken, remembers_betrayal: !!c.remembersBetrayal })),
    },
    biography: {
      remembered: (obs.memories || []).map((m) => ({ id: m.id, kind: m.kind, weight: m.weight, about: m.about ?? null })),
      forgotten: (obs.shards || []).filter((sh) => sh.from === agent && sh.memory).sort((a, b) => a.id - b.id).map((sh) => ({
        shard_id: sh.id, shard_token: `${s.seasonId}-${sh.id}`, kind: sh.memory.kind, weight: sh.memory.weight, forgotten_at_tick: sh.forgottenAtTick,
        fate: sh.open ? 'open' : sh.winner ? 'bought' : 'burned', buyer: !sh.open && sh.winner ? sh.winner : null,
        price: !sh.open && sh.winner ? sh.price : null, unlocked_index: sh.unlocked ? sh.unlocked.index : null,
      })),
    },
  });
}

/* ---------- the on-chain image ---------- */

/** The card image, 320×420, deterministic from the state (and its hash). Must equal `svg()` in src/image.rs. */
export function agentSvg(input) {
  const s = agentState(input);
  const hash = agentStateHash(s);
  const t = s.traits;
  const mono = 'font-family="monospace"';
  const p = [];
  p.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 420" width="320" height="420">');
  p.push('<rect width="320" height="420" fill="#141a1f"/>');
  p.push('<rect x="8" y="8" width="304" height="404" rx="14" fill="none" stroke="#e4c272" stroke-width="2" opacity="0.8"/>');
  p.push(`<text x="160" y="38" text-anchor="middle" font-family="serif" font-size="22" fill="#f6df9b">${s.agent.toUpperCase()}</text>`);
  p.push(`<text x="160" y="58" text-anchor="middle" ${mono} font-size="11" fill="#cfd8dc">AGENT CARD · SEASON ${s.season_id.slice(0, 16)}</text>`);
  // The season's dictionary, 4 slots × 4 strokes: gold = a word Iris knows.
  for (let i = 0; i < 16; i++) {
    const x = 102 + 30 * (i % 4), y = 72 + 30 * Math.trunc(i / 4);
    if (t.cells[i] !== null) p.push(`<rect x="${x}" y="${y}" width="26" height="26" rx="4" fill="#e4c272"/>`);
    else p.push(`<rect x="${x}" y="${y}" width="26" height="26" rx="4" fill="none" stroke="#cfd8dc" stroke-width="1" opacity="0.35"/>`);
  }
  p.push(`<text x="160" y="208" text-anchor="middle" ${mono} font-size="11" fill="#cfd8dc">RULE ${t.reading_rule.toUpperCase()} · ${t.words_known}/16 WORDS · ${t.confident_cells} SURE</text>`);
  // Memories: kept ones full, forgotten ones hollow (a dot when a clan bought the shard); size by weight.
  const items = s.biography.remembered.map((m) => ({ kind: m.kind, weight: m.weight, kept: true, bought: false }))
    .concat(s.biography.forgotten.map((m) => ({ kind: m.kind, weight: m.weight, kept: false, bought: m.fate === 'bought' }))).slice(0, 12);
  items.forEach((m, k) => {
    const cx = 160 - 12 * (items.length - 1) + 24 * k, r = 4 + 2 * m.weight, color = KIND_COLOR[m.kind];
    if (m.kept) p.push(`<circle cx="${cx}" cy="236" r="${r}" fill="${color}"/>`);
    else {
      p.push(`<circle cx="${cx}" cy="236" r="${r}" fill="none" stroke="${color}" stroke-width="2"/>`);
      if (m.bought) p.push(`<circle cx="${cx}" cy="236" r="2" fill="${color}"/>`);
    }
  });
  // Trust in the other clans (red bar: the link is broken).
  t.trust.forEach((e, i) => {
    const y = 270 + 18 * i;
    p.push(`<text x="24" y="${y}" ${mono} font-size="10" fill="#cfd8dc">${e.clan.toUpperCase()}</text>`);
    p.push(`<rect x="80" y="${y - 8}" width="180" height="8" rx="2" fill="#26323a"/>`);
    p.push(`<rect x="80" y="${y - 8}" width="${Math.trunc(e.trust * 180 / 100)}" height="8" rx="2" fill="${e.link_broken ? '#c0504d' : '#8fcf8f'}"/>`);
    p.push(`<text x="296" y="${y}" text-anchor="end" ${mono} font-size="10" fill="#cfd8dc">${e.trust}</text>`);
  });
  p.push(`<text x="160" y="368" text-anchor="middle" ${mono} font-size="11" fill="#cfd8dc">${s.outcome.toUpperCase()} · TICK ${s.final_tick} · ${t.wild ? 'WILD' : 'OBEDIENT'}</text>`);
  p.push(`<text x="160" y="388" text-anchor="middle" ${mono} font-size="11" fill="#e4c272">STATE ${hash.slice(0, 16)}</text>`);
  p.push(`<text x="160" y="404" text-anchor="middle" ${mono} font-size="9" fill="#cfd8dc" opacity="0.6">FORGET TO FORESEE · NEAR TESTNET</text>`);
  p.push('</svg>');
  return p.join('');
}

const b64 = (s) => (typeof Buffer !== 'undefined' ? Buffer.from(s, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(s))));
const hexToB64 = (hex) => (typeof Buffer !== 'undefined' ? Buffer.from(hex, 'hex').toString('base64') : btoa(String.fromCharCode(...hex.match(/../g).map((h) => parseInt(h, 16)))));

function memoryPhrase(m) {
  return `${m.kind} (weight ${m.weight}${m.about ? `, ${cap(m.about)}` : ''})`;
}
function fatePhrase(m) {
  const fate = m.fate === 'bought' ? `bought by ${cap(m.buyer)} for ${m.price} silk` : m.fate === 'burned' ? 'burned unsold' : 'unsold when the season ended';
  return `${m.kind} (weight ${m.weight}) ${fate}, shard ${m.shard_token}`;
}

/** NEP-177 token metadata as the contract builds it (without `issued_at`, which is block time). */
export function agentMetadata(input) {
  const s = agentState(input);
  const json = JSON.stringify(s);
  const hash = sha256(json);
  const svg = agentSvg(s);
  const t = s.traits, b = s.biography;
  const rem = b.remembered.length ? b.remembered.map(memoryPhrase).join(', ') : 'nothing';
  const forg = b.forgotten.length ? b.forgotten.map(fatePhrase).join('; ') : 'nothing';
  const vote = s.vote === null ? 'no vote' : s.vote ? 'voted to accept' : 'voted to refuse';
  const heir = s.heir === null ? 'no heir choice' : s.heir ? 'forgot everything for an heir' : 'kept the memory';
  return {
    title: `${cap(s.agent)} · agent card · season ${s.season_id}`,
    description: `${cap(s.agent)} at the end of season ${s.season_id} (rules ${s.rules}, tick ${s.final_tick}): ${OUTCOME_TEXT[s.outcome]}; ${vote}; ${heir}. `
      + `Remembered: ${rem}. Forgotten: ${forg}. `
      + `Reading rule ${t.reading_rule}, ${t.words_known} of 16 words known, ${t.confident_cells} confident cells, ${t.wild ? 'wild' : 'obedient'} (${t.attention} attention), ${t.silk} silk. `
      + `State hash ${hash} = sha256 of this token's extra (${s.spec}, version ${s.version}). `
      + `The season's schedule root is ${s.schedule_root} (contracts/season-commit). Minted by the season coordinator; Forget to Foresee, NEAR testnet.`,
    media: `data:image/svg+xml;base64,${b64(svg)}`,
    media_hash: hexToB64(sha256(svg)),
    copies: 1,
    extra: json,
  };
}

/** The `mint_agent` arguments the coordinator sends. */
export function mintAgentArgs(state, receiverId) {
  const s = agentState(state);
  return { receiver_id: receiverId, state: s, state_hash: agentStateHash(s) };
}

/* ---------- read-only client and the card model ---------- */

export function createAgentNftClient({ contractId = DEFAULT_AGENT_CONTRACT, rpcUrls, fetch, timeoutMs } = {}) {
  const near = createNearClient({ contractId, rpcUrls, fetch, timeoutMs });
  return {
    contractId,
    getAgent: async (tokenId) => (await near.view('get_agent', { token_id: tokenId })).value,
    agentOfSeason: async (seasonId, agent = 'iris') => (await near.view('agent_of_season', { season_id: seasonId, agent })).value,
    nftToken: async (tokenId) => (await near.view('nft_token', { token_id: tokenId })).value,
    nftMetadata: async () => (await near.view('nft_metadata', {})).value,
  };
}

/** The account id of the agent-card contract for a deployment (an explicit `agentContractId: null` disables it). */
export function agentContractOf(deployment = NEAR_DEPLOYMENT) {
  if (!deployment) return null;
  return deployment.agentContractId === undefined ? DEFAULT_AGENT_CONTRACT : deployment.agentContractId;
}

// RPC answers that mean "there is no such contract or token yet" (the owner has not deployed or minted): not-minted.
const ABSENT = new Set(['UNKNOWN_ACCOUNT', 'NO_CONTRACT_CODE', 'CONTRACT_EXECUTION_ERROR', 'MethodNotFound']);

function linksFor(deployment, contractId, tokenId, owner, seasonId) {
  const explorer = ((deployment && deployment.explorer) || 'https://testnet.nearblocks.io').replace(/\/$/, '');
  const season = deployment && deployment.seasons ? deployment.seasons[seasonId] : null;
  const mintTx = deployment && deployment.agentMints ? deployment.agentMints[seasonId] || null : null;
  return {
    token: contractId ? `${explorer}/nft-token/${contractId}/${tokenId}` : null,
    contract: contractId ? `${explorer}/address/${contractId}` : null,
    owner: owner ? `${explorer}/address/${owner}` : null,
    mintTx: mintTx ? `${explorer}/txns/${mintTx}` : null,
    seasonCommit: season && season.commitTx ? `${explorer}/txns/${season.commitTx}` : deployment && deployment.contractId ? `${explorer}/address/${deployment.contractId}` : null,
    shard: (token) => (deployment && deployment.shardContractId ? `${explorer}/nft-token/${deployment.shardContractId}/${token}` : null),
  };
}

function cardFrom(state, { deployment, contractId, tokenId, owner, links }) {
  const shardMints = deployment && deployment.shardMints ? deployment.shardMints[state.season_id] || {} : {};
  return {
    tokenId, contractId, standard: 'NEP-171', seasonId: state.season_id, agent: state.agent, owner, ownerHref: links.owner,
    outcome: state.outcome, finalTick: state.final_tick, vote: state.vote, heir: state.heir, version: state.version, rules: state.rules,
    scheduleRoot: state.schedule_root,
    traits: { ...state.traits, cells: state.traits.cells.slice(), trust: state.traits.trust.map((e) => ({ ...e })) },
    biography: {
      remembered: state.biography.remembered.map((m) => ({ ...m })),
      forgotten: state.biography.forgotten.map((m) => ({ ...m, shardHref: links.shard(m.shard_token), shardMinted: !!shardMints[String(m.shard_id)] })),
    },
    links: { token: links.token, contract: links.contract, owner: links.owner, mintTx: links.mintTx, seasonCommit: links.seasonCommit },
  };
}

/**
 * Loads the agent card of this season and checks it. `obs` is the season's end observation.
 * @returns {Promise<null|object>} null while the season is still running; otherwise a model with
 *   state: 'minted'     the token exists, its state hash is sha256 of its data, its root equals the committed season,
 *                       and this browser's own end-of-season state hashes to the same value (a card minted
 *                       before the Heir choice, heir null, is compared with the local state's heir set to null);
 *          'not-minted' no deployment for this season (judgeOnly), no contract yet, or no token yet; traits and
 *                       biography are this browser's own state (a preview of what would be minted);
 *          'offline'    the RPC did not answer (or the season record could not be read): nothing verified;
 *          'mismatch'   a token exists but a check failed; `reason`: 'invalid' | 'state-hash' | 'root' | 'playthrough'.
 */
export async function loadAgentCard({ obs, deployment = NEAR_DEPLOYMENT, contractId, fetch = globalThis.fetch, agent = 'iris', timeoutMs } = {}) {
  const season = obs && obs.season;
  if (!season || season.phase !== 'end' || !season.seasonId) return null;
  let local = null;
  try { local = agentStateFromObservation(obs, { agent }); } catch { local = null; }
  const id = contractId === undefined ? agentContractOf(deployment) : contractId;
  const tokenId = `${season.seasonId}-agent-${agent}`;
  const localHash = local ? agentStateHash(local) : null;
  const base = (state, extra = {}, chainState = null, owner = null) => {
    const links = linksFor(deployment, id, tokenId, owner, season.seasonId);
    const src = chainState || local;
    return {
      state, reason: null, judgeOnly: false, localHash, stateHash: null, committedRoot: null, svg: null, svgVerified: false,
      ...(src ? cardFrom(src, { deployment, contractId: id, tokenId, owner, links }) : { tokenId, contractId: id, standard: 'NEP-171', seasonId: season.seasonId, agent, owner, links: { token: links.token, contract: links.contract, owner: links.owner, mintTx: links.mintTx, seasonCommit: links.seasonCommit } }),
      ...extra,
    };
  };
  const committed = deployment && deployment.seasons ? deployment.seasons[season.seasonId] : null;
  if (!id || !committed) return base('not-minted', { judgeOnly: true, svg: local ? agentSvg(local) : null });
  const preview = () => (local ? agentSvg(local) : null);

  let rec;
  try {
    rec = await createAgentNftClient({ contractId: id, rpcUrls: deployment.rpcUrls, fetch, timeoutMs }).getAgent(tokenId);
  } catch (e) {
    if (ABSENT.has(e && e.code)) return base('not-minted', { svg: preview() });
    return base('offline', { svg: preview() });
  }
  if (!rec || !rec.state) return base('not-minted', { svg: preview() });

  let chain;
  try { chain = agentState(rec.state); } catch { return base('mismatch', { reason: 'invalid' }, null, rec.owner_id || null); }
  const chainJson = JSON.stringify(chain);
  const chainHash = sha256(chainJson);
  const owner = rec.owner_id || null;
  const metaExtra = rec.metadata && typeof rec.metadata.extra === 'string' ? rec.metadata.extra : chainJson;
  const svg = agentSvg(chain);
  const media = rec.metadata && rec.metadata.media;
  const svgVerified = media === `data:image/svg+xml;base64,${b64(svg)}`;
  const common = { stateHash: chainHash, svg, svgVerified };
  if (rec.state_hash !== chainHash || metaExtra !== chainJson) return base('mismatch', { ...common, reason: 'state-hash' }, chain, owner);

  // The root: the card's root must equal the root committed on the season-commit contract and this browser's season.
  let onChainSeason;
  try {
    onChainSeason = await createNearClient({ contractId: deployment.contractId, rpcUrls: deployment.rpcUrls, fetch, timeoutMs }).getSeason(season.seasonId);
  } catch {
    return base('offline', common, chain, owner);
  }
  const committedRoot = onChainSeason ? onChainSeason.schedule_root : null;
  if (!committedRoot || committedRoot !== chain.schedule_root || chain.schedule_root !== season.merkleRoot) return base('mismatch', { ...common, committedRoot, reason: 'root' }, chain, owner);
  // A card minted before the Heir choice records `heir: null`; the choice comes after the season, so it does not make
  // this browser's season a different one.
  const compareHash = local && chain.heir === null && local.heir !== null ? agentStateHash({ ...local, heir: null }) : localHash;
  if (compareHash !== chainHash) return base('mismatch', { ...common, committedRoot, reason: 'playthrough' }, chain, owner);
  return base('minted', { ...common, committedRoot }, chain, owner);
}
