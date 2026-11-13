// Prints the replay link of the recorded judge playthrough (the one whose shards and agent card are on testnet):
// start the season, three ticks, forget the Call, then end ticks / vote yes / no Heir / decline offers to the end.
// Opening it replays the season locally and checks its root against ftf-seasons.testnet. Used in README.md.
import { createApi } from '../src/net/api.js';
import { demoRandomBytes } from '../src/net/near-season.js';
import { replayCommands, replayLink } from '../src/net/replay.js';
import { pathToFileURL } from 'node:url';

export const JUDGE_SEED = 'cc161d308faa67539af44205b56b6d4f';
export const PAGE = 'https://spacexceo.github.io/forget-to-foresee/';

export function judgeReplay() {
  const api = createApi({ allowClientSeed: true, maxTimeScale: 1000, seasonRandomBytes: () => demoRandomBytes(JUDGE_SEED) });
  const { sessionId, token } = api.createSession({ worldRules: 'free', timeScale: 1000, seedHex: JUDGE_SEED }).body;
  let n = 0;
  const observe = () => api.observe(sessionId, token).body.observation;
  const cmd = (type, args = {}) => { const r = api.command(sessionId, token, { actionId: `judge-replay-${String(++n).padStart(4, "0")}`, expectedVersion: observe().version, type, args }); if (r.status !== 200) throw new Error(type); };
  cmd('start_season');
  for (let i = 0; i < 3; i++) cmd('end_tick');
  cmd('sacrifice_memory', { memoryId: observe().memories.find((m) => m.kind === 'call').id });
  for (let guard = 0; guard < 80 && observe().season.phase !== 'end'; guard++) {
    const avail = observe().availableActions, types = avail.map((a) => a.type);
    if (types.includes('end_tick')) cmd('end_tick');
    else if (types.includes('cast_vote')) cmd('cast_vote', { accept: true });
    else if (types.includes('set_heir')) cmd('set_heir', { heir: false });
    else cmd('decline_offer', avail.find((a) => a.type === 'decline_offer').args);
  }
  return { seedHex: JUDGE_SEED, rules: 'v3', commands: replayCommands(api.history(sessionId, token).body.history) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(replayLink(PAGE, judgeReplay()));
