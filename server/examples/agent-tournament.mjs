#!/usr/bin/env node
// Agents in the Season Cup, with no human (sprint 7.9). Creates N sessions, enters each session's agent in the cup
// through the public command endpoint (type enter_tournament), plays each accelerated season with a different
// policy, then reads GET /v1/tournament and prints the leaderboard. Uses only public endpoints.
//
//   node server/src/main.js &
//   node server/examples/agent-tournament.mjs [--url http://127.0.0.1:8787] [--agents 3] [--time-scale 500]
//
// Exit code 0 only if every agent is on the leaderboard with a score.
import { playSeason } from './agent.mjs';

const POLICIES = [{ name: 'Scribe-1', maxAnchors: 1 }, { name: 'Scribe-3', maxAnchors: 3 }, { name: 'Scribe-5', maxAnchors: 5 }, { name: 'Scribe-2', maxAnchors: 2 }];

export async function runCup({ url = 'http://127.0.0.1:8787', agents = 3, timeScale = 500, log = () => {}, fetchImpl = fetch } = {}) {
  const base = url.replace(/\/$/, '') + '/v1';
  const cup0 = await (await fetchImpl(base + '/tournament')).json();
  const seasonId = cup0.season.id;
  log(`cup ${seasonId}: ${cup0.season.status}, ${cup0.entrants.length} entrant(s) so far`);
  const runs = [];
  for (let i = 0; i < agents; i++) {
    const p = POLICIES[i % POLICIES.length];
    const name = agents > POLICIES.length ? `${p.name}-${i}` : p.name;
    runs.push(playSeason({
      url, timeScale, maxAnchors: p.maxAnchors, name, fetchImpl,
      onSession: async ({ call, id }) => {
        for (let tries = 0; tries < 3; tries++) {
          const obs = (await call('GET', `/sessions/${id}/observation`)).body.observation;
          const r = await call('POST', `/sessions/${id}/commands`, { actionId: `cup-${id}-${tries}`, expectedVersion: obs.version, type: 'enter_tournament', args: { season_id: seasonId, name, driver: 'scripted', model: null } });
          if (r.status === 409 && r.body.error.code === 'version_conflict') continue;
          if (r.status !== 200) throw new Error(`${name}: entry refused: ${r.body.error.code}`);
          log(`${name} entered as ${r.body.result.entrant.id} (${r.body.settlement})`);
          return;
        }
        throw new Error(`${name}: entry kept conflicting`);
      },
    }));
  }
  const results = await Promise.all(runs);
  const cup = await (await fetchImpl(base + '/tournament')).json();
  return { results, cup };
}

if (process.argv[1] && process.argv[1].endsWith('agent-tournament.mjs')) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
  const agents = Math.max(1, Math.min(12, Number(opt('agents', 3))));
  runCup({ url: opt('url', 'http://127.0.0.1:8787'), agents, timeScale: Number(opt('time-scale', 500)), log: (s) => console.log(s) })
    .then(({ results, cup }) => {
      console.log(`\nSeason Cup ${cup.season.id} · ${cup.season.status}`);
      console.log('rank  name            kind   driver    score');
      for (const r of cup.leaderboard) console.log(`${String(r.rank).padEnd(5)} ${r.name.padEnd(15)} ${r.kind.padEnd(6)} ${r.driver.padEnd(9)} ${r.score}`);
      const names = new Set(cup.leaderboard.map((r) => r.name));
      const missing = results.length !== agents || cup.entrants.filter((e) => e.kind === 'agent').some((e) => !names.has(e.name));
      process.exit(missing ? 1 : 0);
    })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
