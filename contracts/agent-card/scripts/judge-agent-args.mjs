// Writes the agent-card arguments for the canonical judge playthrough and prints the owner's testnet commands.
// The playthrough is the one the memory shards came from (contracts/memory-shard/scripts/judge-shards-args.mjs): the
// fixed judge season (`?demo=judge`, seed cc161d308faa67539af44205b56b6d4f), start, trials 1-3, forget the Call for a
// vision at trial 4, then the season runs to its end (offers declined, vote to accept, the Heir left unchosen once the
// season is over). It goes through the same room code the browser runs (game/src/net), so the state below is exactly
// what a judge's browser recomputes at the end of that playthrough, and its hash is what the contract recomputes at mint.
// Deterministic: no clock, no randomness beyond the seed; `game/tests/client/agent-nft.test.mjs` checks the committed
// files are current. Public data only (account ids, the public seed): no key, nothing secret.
//
// Usage: node scripts/judge-agent-args.mjs [seedHex] [--receiver <id>] [--contract <id>] [--coordinator <id>] [--check]
//   -> judge/<seasonId>/{new.json, preview-agent.json, mint-agent.json, state.json, card.svg, summary.json, commands.sh}
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApi } from '../../../game/src/net/api.js';
import { demoRandomBytes } from '../../../game/src/net/near-season.js';
import { agentStateFromObservation, agentStateJson, agentStateHash, agentTokenId, agentSvg, agentMetadata, mintAgentArgs } from '../../../game/src/net/agent-nft.js';

export const JUDGE_SEED = 'cc161d308faa67539af44205b56b6d4f';
export const DEFAULTS = Object.freeze({
  contract: 'ftf-agents.testnet',
  owner: 'lambada_eth.testnet',
  coordinator: 'lambada_eth.testnet',
  receiver: 'lambada_eth.testnet',
  seasonContract: 'ftf-seasons.testnet',
  shardContract: 'ftf-shards.testnet',
});
const dir = fileURLToPath(new URL('..', import.meta.url));

/** Plays the canonical judge playthrough; returns the end observation and Iris's canonical state. */
export function judgeAgent(seedHex = JUDGE_SEED) {
  const api = createApi({ allowClientSeed: true, maxTimeScale: 1000, seasonRandomBytes: () => demoRandomBytes(seedHex) });
  const created = api.createSession({ worldRules: 'free', timeScale: 1000, seedHex, label: 'judge agent card' });
  if (created.status !== 201) throw new Error('session failed: ' + JSON.stringify(created.body.error));
  const { sessionId, token } = created.body;
  let n = 0;
  const observe = () => api.observe(sessionId, token).body.observation;
  const cmd = (type, args = {}) => {
    const o = observe();
    const r = api.command(sessionId, token, { actionId: `judge-agent-${type}-${++n}`, expectedVersion: o.version, type, args });
    if (r.status !== 200) throw new Error(`${type} rejected: ${JSON.stringify(r.body.error)}`);
  };
  cmd('start_season');
  for (let i = 0; i < 3; i++) cmd('end_tick');
  const call = observe().memories.find((m) => m.kind === 'call');
  cmd('sacrifice_memory', { memoryId: call.id });
  for (let guard = 0; guard < 80 && observe().season.phase !== 'end'; guard++) {
    const avail = observe().availableActions;
    const types = avail.map((a) => a.type);
    if (types.includes('end_tick')) cmd('end_tick');
    else if (types.includes('cast_vote')) cmd('cast_vote', { accept: true });
    else if (types.includes('set_heir')) cmd('set_heir', { heir: false });
    else { const d = avail.find((a) => a.type === 'decline_offer'); if (!d) throw new Error('stuck: ' + types.join(',')); cmd('decline_offer', d.args); }
  }
  const obs = observe();
  if (obs.season.phase !== 'end') throw new Error('the judge season did not end');
  return { seedHex, obs, state: agentStateFromObservation(obs) };
}

const q = (s) => `'${s}'`;

/** The owner's commands, in order (near-cli-rs and cargo-near syntax, as in contracts/season-commit/README.md). */
export function ownerCommands({ seasonId, tokenId, contract, owner, coordinator, seasonContract, shardContract }) {
  const net = 'network-config testnet';
  const init = JSON.stringify({ owner_id: owner, coordinators: [coordinator], season_contract: seasonContract, shard_contract: shardContract });
  const args = `judge/${seasonId}`;
  return [
    { step: 'create the contract account (faucet; skip if it exists)', cmd: `near account create-account sponsor-by-faucet-service ${contract} autogenerate-new-keypair save-to-keychain ${net} create` },
    { step: 'build, deploy and initialize (from contracts/agent-card)', cmd: `cargo near deploy build-non-reproducible-wasm --no-abi ${contract} with-init-call new json-args ${q(init)} prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' ${net} sign-with-keychain send` },
    { step: 'check the coordinators', cmd: `near contract call-function as-read-only ${contract} get_coordinators json-args '{}' ${net} now` },
    { step: 'free dry run: the contract validates the state and returns its hash (must equal summary.json stateHash)', cmd: `near contract call-function as-read-only ${contract} preview_agent file-args ${args}/preview-agent.json ${net} now` },
    { step: 'mint the card (storage deposit; the unused part is refunded)', cmd: `near contract call-function as-transaction ${contract} mint_agent file-args ${args}/mint-agent.json prepaid-gas '100.0 Tgas' attached-deposit '0.5 NEAR' sign-as ${coordinator} ${net} sign-with-keychain send` },
    { step: 'read the card back', cmd: `near contract call-function as-read-only ${contract} get_agent json-args ${q(JSON.stringify({ token_id: tokenId }))} ${net} now` },
    { step: 'compare its schedule_root with the committed season', cmd: `near contract call-function as-read-only ${seasonContract} get_season json-args ${q(JSON.stringify({ season_id: seasonId }))} ${net} now` },
  ];
}

/** Every file the script writes (name -> exact content) and the summary. Pure: same input, same bytes. */
export function buildJudgeArgs({ seedHex = JUDGE_SEED, ...opts } = {}) {
  const o = { ...DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v != null)) };
  for (const id of [o.contract, o.owner, o.coordinator, o.receiver, o.seasonContract, o.shardContract]) {
    if (!/\.testnet$/.test(id)) throw new Error(`refusing a non-testnet account: ${id}`);
  }
  const { obs, state } = judgeAgent(seedHex);
  const seasonId = state.season_id;
  const tokenId = agentTokenId(state);
  const stateHash = agentStateHash(state);
  const meta = agentMetadata(state);
  const commands = ownerCommands({ seasonId, tokenId, ...o });
  const init = { owner_id: o.owner, coordinators: [o.coordinator], season_contract: o.seasonContract, shard_contract: o.shardContract };
  const summary = {
    about: 'Generated by contracts/agent-card/scripts/judge-agent-args.mjs from the canonical judge playthrough. Do not edit by hand.',
    seedHex, seasonId, scheduleRoot: state.schedule_root, outcome: obs.season.outcome, tokenId, stateHash,
    contract: o.contract, owner: o.owner, coordinator: o.coordinator, receiver: o.receiver,
    seasonContract: o.seasonContract, shardContract: o.shardContract,
    title: meta.title, description: meta.description, mediaHash: meta.media_hash,
    stateBytes: agentStateJson(state).length, svgBytes: agentSvg(state).length,
    commands,
  };
  const json = (v) => JSON.stringify(v, null, 1) + '\n';
  const sh = ['#!/usr/bin/env bash', '# Testnet only. The owner runs these by hand, one at a time, from contracts/agent-card (generated; do not edit).', 'set -euo pipefail', 'cd "$(dirname "$0")/../.."']
    .concat(commands.flatMap((c) => [`# ${c.step}`, c.cmd])).join('\n') + '\n';
  return {
    seasonId, tokenId, stateHash, state, summary,
    files: {
      'new.json': json(init),
      'preview-agent.json': json({ state }),
      'mint-agent.json': json(mintAgentArgs(state, o.receiver)),
      'state.json': agentStateJson(state),
      'card.svg': agentSvg(state),
      'summary.json': json(summary),
      'commands.sh': sh,
    },
  };
}

export const outDir = (seasonId) => `${dir}judge/${seasonId}/`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const seedHex = argv.find((a) => /^[0-9a-f]{32}$/.test(a)) || JUDGE_SEED;
  const built = buildJudgeArgs({ seedHex, receiver: opt('--receiver'), contract: opt('--contract'), coordinator: opt('--coordinator'), owner: opt('--owner') });
  const out = outDir(built.seasonId);
  if (argv.includes('--check')) {
    const stale = Object.entries(built.files).filter(([name, body]) => !existsSync(out + name) || readFileSync(out + name, 'utf8') !== body).map(([name]) => name);
    if (stale.length) { console.error(`stale: ${stale.join(', ')} (run node scripts/judge-agent-args.mjs)`); process.exit(1); }
    console.log(`judge/${built.seasonId}/ is current`);
  } else {
    mkdirSync(out, { recursive: true });
    for (const [name, body] of Object.entries(built.files)) writeFileSync(out + name, body);
    console.log(`seed ${seedHex} -> season ${built.seasonId} (${built.summary.outcome}); token ${built.tokenId}`);
    console.log(`state hash ${built.stateHash} (${built.summary.stateBytes} bytes of canonical JSON)`);
    console.log(`arguments: ${out}`);
  }
  console.log('\nOwner commands (testnet; run from contracts/agent-card):');
  for (const c of built.summary.commands) console.log(`\n# ${c.step}\n${c.cmd}`);
}
