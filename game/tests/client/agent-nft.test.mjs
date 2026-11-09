// The agent card NFT (src/net/agent-nft.js, contracts/agent-card): the canonical state from the room's end observation,
// the vectors the Rust contract reproduces, the judge playthrough's mint arguments (stable, committed), the read-only
// card model against a stubbed RPC (minted / not-minted / offline / mismatch; never a fake success), and the DOM card
// in all five locales. No network: every fetch is a fake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  agentState, agentStateJson, agentStateHash, agentTokenId, agentSvg, agentMetadata, agentStateFromObservation, mintAgentArgs,
  loadAgentCard, createAgentNftClient, agentContractOf, DEFAULT_AGENT_CONTRACT, AGENT_SPEC,
} from '../../src/net/agent-nft.js';
import { buildVectors, serialize, OUT } from '../../scripts/gen-agent-vectors.mjs';
import { buildJudgeArgs, judgeAgent, outDir, DEFAULTS } from '../../../contracts/agent-card/scripts/judge-agent-args.mjs';
import { NEAR_DEPLOYMENT } from '../../src/net/near-deployment.js';
import { sha256 } from '../../src/game/crypto.js';
import { PLAY_MESSAGES, createPlayI18n } from '../../src/play/i18n.js';
import { installDom } from '../lib/mini-dom.mjs';

const SEASON = '793f6c05e89839f2';
const ROOT = '03dbd4587b5d54fc3a6d4befe19920ba66236de11e786baa0a8678305075769a';
const TOKEN = `${SEASON}-agent-iris`;
// The judge playthrough's state hash. If a rules or engine change moves it, the card has to be minted again.
const JUDGE_HASH = '16d0ed44a990fb5d36ebbfc79d44c4d597b50a2a27bdd7aba6cc125e9c85754d';

const JUDGE = judgeAgent();

test('agent vectors are up to date with agent-nft.js (the Rust contract reproduces them)', () => {
  assert.equal(readFileSync(OUT, 'utf8'), serialize(buildVectors()));
});

test('the judge playthrough gives a stable canonical state, and the committed mint arguments are current', () => {
  const built = buildJudgeArgs();
  assert.equal(built.seasonId, SEASON);
  assert.equal(built.tokenId, TOKEN);
  assert.equal(built.stateHash, JUDGE_HASH);
  for (const [name, body] of Object.entries(built.files)) {
    const file = outDir(SEASON) + name;
    assert.ok(existsSync(file), `${name} is committed (node contracts/agent-card/scripts/judge-agent-args.mjs)`);
    assert.equal(readFileSync(file, 'utf8'), body, `${name} is current`);
  }
  const s = built.state;
  assert.equal(s.schedule_root, ROOT);
  assert.equal(s.schedule_root, NEAR_DEPLOYMENT.seasons[SEASON].scheduleRoot, 'the root committed on ftf-seasons.testnet');
  assert.deepEqual([s.agent, s.rules, s.final_tick, s.outcome, s.vote, s.heir], ['iris', 'v3', 17, 'weapon', true, null]);
  assert.deepEqual(s.biography.remembered.map((m) => m.kind), ['first', 'gift']);
  assert.deepEqual(s.biography.forgotten, [{ shard_id: 7, shard_token: `${SEASON}-7`, kind: 'call', weight: 2, forgotten_at_tick: 4, fate: 'bought', buyer: 'frost', price: 13, unlocked_index: 3 }]);
  assert.ok(NEAR_DEPLOYMENT.shardMints[SEASON]['7'], 'the forgotten Call is the shard minted on ftf-shards.testnet');
  const json = built.files['state.json'];
  assert.equal(sha256(json), JUDGE_HASH);
  assert.ok(!json.includes('remember what has not happened'), 'the owner’s secret Key phrase never enters the state');
  assert.ok(!/phrase|"salt":|commitment/.test(json), 'no key material');
  const mint = JSON.parse(built.files['mint-agent.json']);
  assert.equal(mint.receiver_id, 'lambada_eth.testnet');
  assert.equal(mint.state_hash, JUDGE_HASH);
  assert.deepEqual(JSON.parse(built.files['new.json']), { owner_id: 'lambada_eth.testnet', coordinators: ['lambada_eth.testnet'], season_contract: 'ftf-seasons.testnet', shard_contract: 'ftf-shards.testnet' });
  // the owner's commands: testnet accounts only, the mint signed by the coordinator
  const cmds = built.summary.commands.map((c) => c.cmd).join('\n');
  assert.ok(!/mainnet|\.near\b/.test(cmds));
  assert.match(cmds, /mint_agent file-args judge\/793f6c05e89839f2\/mint-agent\.json .* sign-as lambada_eth\.testnet network-config testnet/);
  assert.match(cmds, /create-account sponsor-by-faucet-service ftf-agents\.testnet/);
  assert.equal(DEFAULTS.contract, DEFAULT_AGENT_CONTRACT);
  assert.throws(() => buildJudgeArgs({ receiver: 'someone.near' }), /non-testnet/);
});

test('agentState validates and normalises; json, hash, token id, image and metadata are deterministic', () => {
  const s = JUDGE.state;
  assert.deepEqual(Object.keys(s), ['spec', 'season_id', 'agent', 'rules', 'schedule_root', 'version', 'final_tick', 'outcome', 'vote', 'heir', 'traits', 'biography']);
  assert.equal(agentStateJson({ ...s, extraneous: 1 }), agentStateJson(s), 'unknown fields are dropped, as serde does');
  assert.equal(agentTokenId(s), TOKEN);
  assert.equal(agentStateHash(s), JUDGE_HASH);
  const svg = agentSvg(s);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 420"'));
  assert.ok(svg.includes(`STATE ${JUDGE_HASH.slice(0, 16)}`) && svg.includes('WEAPON · TICK 17 · OBEDIENT'));
  assert.ok(!/\d\.\d/.test(svg.replace(/opacity="0\.\d+"/g, '')), 'integer coordinates only');
  const m = agentMetadata(s);
  assert.equal(m.title, 'Iris · agent card · season 793f6c05e89839f2');
  assert.equal(m.extra, agentStateJson(s));
  assert.equal(Buffer.from(m.media_hash, 'base64').toString('hex'), sha256(svg));
  assert.match(m.description, /Forgotten: call \(weight 2\) bought by Frost for 13 silk, shard 793f6c05e89839f2-7\./);
  assert.deepEqual(mintAgentArgs(s, 'x.testnet'), { receiver_id: 'x.testnet', state: s, state_hash: JUDGE_HASH });
  assert.throws(() => agentState({ ...s, spec: 'x' }), (e) => e.code === 'ERR_BAD_SPEC');
  assert.throws(() => agentStateFromObservation({ ...JUDGE.obs, season: { ...JUDGE.obs.season, phase: 'play' } }), (e) => e.code === 'ERR_NOT_ENDED');
  assert.equal(AGENT_SPEC, 'ftf-agent/1');
});

/* ---------- stubbed RPC ---------- */
const enc = (v) => Array.from(new TextEncoder().encode(JSON.stringify(v)));
const ok = (v) => ({ ok: true, json: async () => ({ result: { result: enc(v), block_height: 1, block_hash: 'h' } }) });
const rpcError = (name) => ({ ok: true, json: async () => ({ error: { name: 'HANDLER_ERROR', cause: { name } } }) });
/** routes[account][method] = (args) => value | Response-like */
function fakeRpc(routes, log = []) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    const p = body.params;
    const args = JSON.parse(Buffer.from(p.args_base64, 'base64').toString('utf8'));
    log.push({ account: p.account_id, method: p.method_name, args });
    const acc = routes[p.account_id];
    if (!acc) return rpcError('UNKNOWN_ACCOUNT');
    const fn = acc[p.method_name];
    if (!fn) return { ok: true, json: async () => ({ result: { error: 'wasm execution failed with error: MethodResolveError(MethodNotFound)' } }) };
    const v = fn(args);
    return v && typeof v.json === 'function' ? v : ok(v);
  };
}
const DEPLOY = { ...NEAR_DEPLOYMENT, rpcUrls: ['https://a.example'], agentMints: { [SEASON]: 'MintTxAgent' } };
const onChainCard = (state = JUDGE.state, patch = {}) => {
  const s = agentState(state);
  return { token_id: TOKEN, owner_id: 'lambada_eth.testnet', state: s, state_hash: agentStateHash(s), minted_at_ns: '1', minted_at_block: '2', minted_by: 'lambada_eth.testnet', metadata: { ...agentMetadata(s), issued_at: '1' }, ...patch };
};
const seasons = (root = ROOT) => ({ get_season: (a) => (a.season_id === SEASON ? { season_id: SEASON, schedule_root: root, leaf_count: 15 } : null) });

test('before the owner deploys: not-minted (a preview of this season’s card), never a fake success', async () => {
  const log = [];
  const m = await loadAgentCard({ obs: JUDGE.obs, deployment: DEPLOY, fetch: fakeRpc({ 'ftf-seasons.testnet': seasons() }, log) });
  assert.equal(agentContractOf(DEPLOY), 'ftf-agents.testnet');
  assert.equal(m.state, 'not-minted');
  assert.equal(m.judgeOnly, false);
  assert.equal(m.tokenId, TOKEN);
  assert.equal(m.contractId, 'ftf-agents.testnet');
  assert.equal(m.stateHash, null, 'nothing on-chain, no on-chain hash');
  assert.equal(m.localHash, JUDGE_HASH);
  assert.equal(m.svg, agentSvg(JUDGE.state));
  assert.equal(m.svgVerified, false);
  assert.equal(m.traits.words_known, 0);
  assert.equal(m.biography.forgotten[0].shardMinted, true);
  assert.equal(m.biography.forgotten[0].shardHref, `https://testnet.nearblocks.io/nft-token/ftf-shards.testnet/${SEASON}-7`);
  assert.deepEqual(log.map((x) => [x.account, x.method]), [['ftf-agents.testnet', 'get_agent']]);
  // a deployed contract without the token: not-minted too
  const empty = await loadAgentCard({ obs: JUDGE.obs, deployment: DEPLOY, fetch: fakeRpc({ 'ftf-agents.testnet': { get_agent: () => null } }) });
  assert.equal(empty.state, 'not-minted');
});

test('minted: the token exists, sha256(extra) = state hash, root = committed root = local root, and this playthrough hashes the same', async () => {
  const log = [];
  const m = await loadAgentCard({ obs: JUDGE.obs, deployment: DEPLOY, fetch: fakeRpc({ 'ftf-agents.testnet': { get_agent: (a) => (a.token_id === TOKEN ? onChainCard() : null) }, 'ftf-seasons.testnet': seasons() }, log) });
  assert.equal(m.state, 'minted');
  assert.equal(m.reason, null);
  assert.equal(m.owner, 'lambada_eth.testnet');
  assert.equal(m.ownerHref, 'https://testnet.nearblocks.io/address/lambada_eth.testnet');
  assert.equal(m.stateHash, JUDGE_HASH);
  assert.equal(m.committedRoot, ROOT);
  assert.equal(m.svgVerified, true);
  assert.equal(m.links.token, `https://testnet.nearblocks.io/nft-token/ftf-agents.testnet/${TOKEN}`);
  assert.equal(m.links.mintTx, 'https://testnet.nearblocks.io/txns/MintTxAgent');
  assert.equal(m.links.seasonCommit, `https://testnet.nearblocks.io/txns/${NEAR_DEPLOYMENT.seasons[SEASON].commitTx}`);
  assert.deepEqual(m.traits.trust.map((e) => e.clan), ['salt', 'ash', 'moss', 'amber', 'frost']);
  assert.deepEqual(log.map((x) => x.method), ['get_agent', 'get_season']);
  // a configurable account id
  const other = await loadAgentCard({ obs: JUDGE.obs, deployment: { ...DEPLOY, agentContractId: 'ftf-agents.lambada_eth.testnet' }, fetch: fakeRpc({ 'ftf-agents.lambada_eth.testnet': { get_agent: () => onChainCard() }, 'ftf-seasons.testnet': seasons() }) });
  assert.equal(other.state, 'minted');
  assert.equal(other.contractId, 'ftf-agents.lambada_eth.testnet');
  const client = createAgentNftClient({ contractId: 'ftf-agents.testnet', rpcUrls: ['https://a.example'], fetch: fakeRpc({ 'ftf-agents.testnet': { agent_of_season: () => onChainCard(), nft_token: () => ({ token_id: TOKEN }), nft_metadata: () => ({ symbol: 'FTFAGENT' }) } }) });
  assert.equal((await client.agentOfSeason(SEASON)).token_id, TOKEN);
  assert.equal((await client.nftMetadata()).symbol, 'FTFAGENT');
});

test('mismatch: another playthrough, a forged hash, a wrong root, invalid data; offline and live seasons stay honest', async () => {
  const routes = (card, root) => ({ 'ftf-agents.testnet': { get_agent: () => card }, 'ftf-seasons.testnet': seasons(root) });
  // the judge played differently: the token is real and checked, but it is not this browser's agent
  const otherObs = { ...JUDGE.obs, iris: { ...JUDGE.obs.iris, silk: 41 } };
  const diff = await loadAgentCard({ obs: otherObs, deployment: DEPLOY, fetch: fakeRpc(routes(onChainCard(), ROOT)) });
  assert.equal(diff.state, 'mismatch'); assert.equal(diff.reason, 'playthrough');
  assert.equal(diff.stateHash, JUDGE_HASH); assert.notEqual(diff.localHash, JUDGE_HASH);
  assert.equal(diff.traits.silk, 0, 'the card shows the on-chain agent, not the local one');
  const forged = await loadAgentCard({ obs: JUDGE.obs, deployment: DEPLOY, fetch: fakeRpc(routes(onChainCard(JUDGE.state, { state_hash: '00'.repeat(32) }), ROOT)) });
  assert.equal(forged.state, 'mismatch'); assert.equal(forged.reason, 'state-hash');
  const badExtra = onChainCard(); badExtra.metadata.extra = badExtra.metadata.extra.replace('"silk":0', '"silk":1');
  assert.equal((await loadAgentCard({ obs: JUDGE.obs, deployment: DEPLOY, fetch: fakeRpc(routes(badExtra, ROOT)) })).reason, 'state-hash');
  const wrongRoot = await loadAgentCard({ obs: JUDGE.obs, deployment: DEPLOY, fetch: fakeRpc(routes(onChainCard(), sha256('another root'))) });
  assert.equal(wrongRoot.state, 'mismatch'); assert.equal(wrongRoot.reason, 'root');
  const uncommitted = await loadAgentCard({ obs: JUDGE.obs, deployment: DEPLOY, fetch: fakeRpc({ 'ftf-agents.testnet': { get_agent: () => onChainCard() }, 'ftf-seasons.testnet': { get_season: () => null } }) });
  assert.equal(uncommitted.reason, 'root');
  const invalid = await loadAgentCard({ obs: JUDGE.obs, deployment: DEPLOY, fetch: fakeRpc(routes({ ...onChainCard(), state: { ...JUDGE.state, outcome: 'won' } }, ROOT)) });
  assert.equal(invalid.state, 'mismatch'); assert.equal(invalid.reason, 'invalid');
  // offline: the RPC does not answer (or the season record cannot be read)
  const dead = await loadAgentCard({ obs: JUDGE.obs, deployment: DEPLOY, fetch: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(dead.state, 'offline'); assert.equal(dead.stateHash, null);
  const halfDead = await loadAgentCard({ obs: JUDGE.obs, deployment: DEPLOY, fetch: async (url, init) => (JSON.parse(init.body).params.method_name === 'get_season' ? { ok: false, status: 502 } : fakeRpc(routes(onChainCard(), ROOT))(url, init)) });
  assert.equal(halfDead.state, 'offline', 'a token whose root could not be checked is not verified');
  // live seasons and a disabled deployment: no RPC at all
  const log = [];
  const live = await loadAgentCard({ obs: { ...JUDGE.obs, season: { ...JUDGE.obs.season, seasonId: '0000000000000000' } }, deployment: DEPLOY, fetch: fakeRpc({}, log) });
  assert.equal(live.state, 'not-minted'); assert.equal(live.judgeOnly, true);
  const off = await loadAgentCard({ obs: JUDGE.obs, deployment: { ...DEPLOY, agentContractId: null }, fetch: fakeRpc({}, log) });
  assert.equal(off.state, 'not-minted'); assert.equal(off.judgeOnly, true);
  assert.equal(log.length, 0);
  // a season still running: nothing to show yet
  assert.equal(await loadAgentCard({ obs: { ...JUDGE.obs, season: { ...JUDGE.obs.season, phase: 'play' } }, deployment: DEPLOY, fetch: fakeRpc({}, log) }), null);
});

test('agent card strings: present in all five locales, every one formats; the DOM card says what was verified', async () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('agentcard.'));
  assert.ok(keys.length >= 40);
  const args = { agent: 'Iris', rule: 'r', known: 1, confident: 2, attention: 3, silk: 4, clan: 'Moss', trust: 65, clans: 'Ash', kind: 'call', weight: 2, price: 13, token: TOKEN, outcome: 'o', tick: 17 };
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) {
    const i18n = createPlayI18n(loc, { onMissing: (k) => assert.fail(`${loc} misses ${k}`) });
    for (const k of keys) {
      assert.ok(PLAY_MESSAGES[loc][k], `${loc} has ${k}`);
      const s = i18n.t(k, args);
      assert.ok(s && !s.includes('{'), `${loc} ${k} formats: ${s}`);
      if (loc !== 'en' && !/^(Token|Owner)$/.test(PLAY_MESSAGES.en[k])) assert.notEqual(PLAY_MESSAGES[loc][k], PLAY_MESSAGES.en[k], `${loc} ${k} is translated`);
    }
  }
  assert.equal(createPlayI18n('zh').t('agentcard.title', { agent: createPlayI18n('zh').t('agent.iris') }), '伊里斯 · 智能体卡片');

  const { doc } = installDom();
  const { renderAgentCard, agentCardLines, agentCardStatusKey } = await import('../../src/ui/world-hud/agent-card.js');
  const i18n = createPlayI18n('en');
  const t = (k, a) => i18n.t(k, a);
  const text = (n) => (n.childNodes || []).map((c) => (c.data != null ? c.data : text(c))).join(' ');
  assert.equal(renderAgentCard(null, { t, doc }), null);
  const minted = await loadAgentCard({ obs: JUDGE.obs, deployment: DEPLOY, fetch: fakeRpc({ 'ftf-agents.testnet': { get_agent: () => onChainCard() }, 'ftf-seasons.testnet': seasons() }) });
  const node = renderAgentCard(minted, { t, doc });
  assert.equal(node.getAttribute('data-state'), 'minted');
  const s = text(node);
  for (const want of ['Iris · agent card', 'Minted on NEAR testnet · verified', TOKEN, 'lambada_eth.testnet', 'Reading rule: try all starts', 'Words known: 0 of 16', 'Obedient', 'Trusts Moss most (65)', 'Broken links: Ash', 'first word · weight 4', 'gift (Moss) · weight 1', 'call · weight 2: bought by Frost for 13 silk', `shard ${SEASON}-7`, 'the message was a weapon', 'no Heir chosen', 'View on nearblocks', 'not owned by the player yet']) {
    assert.ok(s.includes(want), `card shows "${want}"`);
  }
  const pre = await loadAgentCard({ obs: JUDGE.obs, deployment: DEPLOY, fetch: fakeRpc({}) });
  const preText = text(renderAgentCard(pre, { t, doc }));
  assert.ok(preText.includes('Not minted yet') && preText.includes('A preview of the card'));
  assert.ok(!preText.includes('View on nearblocks') && !preText.includes('verified'), 'no link, no "verified" before a mint');
  assert.equal(agentCardStatusKey({ state: 'mismatch', reason: 'playthrough' }), 'agentcard.state.recorded');
  assert.equal(agentCardStatusKey({ state: 'not-minted', judgeOnly: true }), 'agentcard.state.judgeOnly');
  assert.match(agentCardLines({ ...minted, state: 'mismatch', reason: 'root' }, t).reason, /schedule root/);
  for (const loc of ['ru', 'uk', 'it', 'zh']) {
    const li = createPlayI18n(loc);
    const lines = agentCardLines(minted, (k, a) => li.t(k, a));
    assert.ok(lines.title.startsWith(li.t('agent.iris')));
    assert.ok(lines.forgotten[0].text.includes('13'));
  }
});
