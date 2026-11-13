// Scripted agent policies for the Season Cup exhibition (sprint 7.9): the same simple, honest policy as the agent
// API's reference client (server/examples/agent.mjs), run in-process against the browser's own room (net/api.js),
// so an agents-only cup really plays its seasons. No model, no network: "Scripted agent: a program with fixed rules".
import { createApi } from '../net/api.js';
import { createTournament } from '../ui/tournament-cup.js';

export const POLICIES = Object.freeze({
  explorer: { label: 'Scripted explorer', maxAnchors: 3 },
  cautious: { label: 'Cautious', maxAnchors: 1 },
  greedy: { label: 'Greedy', maxAnchors: 5 },
});
const PLACE = {
  near_scroll: () => 'scroll', near_shard_pedestal: () => 'shard_pedestal', near_camp: (a) => 'camp:' + a.clan,
  near_mediation_camp: (a) => 'camp:' + a.clanA, near_anchor_zone: (a) => (a.shell ? 'anchor_zone:' + a.shell : null),
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A seeded byte source (xorshift) so an exhibition with the same seed plays the same seasons. */
export const seededBytes = (seed) => () => { let x = seed >>> 0 || 1; return (n) => { const o = new Uint8Array(n); for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; o[i] = x & 255; } return o; }; };

/**
 * Plays one season in `api` for an existing session with a policy. Returns {outcome, silk, commands}.
 * @param {object} api net/api.js instance @param {{sessionId: string, token: string}} s @param {{maxAnchors: number}} policy
 */
export async function playScripted(api, s, policy, { maxSteps = 600 } = {}) {
  const { sessionId: id, token } = s; let n = 0, commands = 0, anchors = 0, contributed = false;
  const act = (type, args = {}) => { for (let k = 0; k < 3; k++) { const v = api.observe(id, token).body.observation.version; const r = api.command(id, token, { actionId: `ex-${id}-${++n}`, expectedVersion: v, type, args }); commands++; if (r.status === 409 && r.body.error && r.body.error.code === 'version_conflict') continue; return r; } return null; };
  const travel = (a) => { if (!a.failed.length || !a.failed.every((f) => f.source === 'precondition')) return null; const p = a.failed.map((f) => PLACE[f.id]).find(Boolean); return p ? p(a.args) : null; };
  let obs;
  for (let step = 0; step < maxSteps; step++) {
    obs = api.observe(id, token).body.observation;
    if (obs.season.outcome) break;
    if (obs.you.walking) { await sleep(20); continue; }
    const actions = api.actions(id, token).body.actions;
    const ready = (t) => actions.find((a) => a.type === t && a.available); const any = (t) => actions.filter((a) => a.type === t);
    if (ready('start_season')) { act('start_season'); continue; }
    const vote = actions.find((a) => a.type === 'cast_vote' && a.args.accept === true);
    if (vote && vote.available) { act('cast_vote', { accept: true }); continue; }
    if (vote && travel(vote)) { act('move', { to: travel(vote) }); continue; }
    const c = any('contribute_fragment')[0];
    if (!contributed && c) { if (c.available) { const r = act('contribute_fragment'); if (r && r.status === 200) contributed = true; continue; } const p = travel(c); if (p) { act('move', { to: p }); continue; } }
    if (anchors < policy.maxAnchors) {
      const as = any('place_anchor').filter((a) => a.args.shell && a.args.tick > obs.season.tick);
      const now = as.find((a) => a.available);
      if (now) { const r = act('place_anchor', now.args); if (r && r.status === 200) { anchors++; continue; } }
      const reach = as.find((a) => travel(a)); if (reach && !now) { act('move', { to: travel(reach) }); continue; }
    }
    if (ready('end_tick')) { act('end_tick'); continue; }
    const fb = actions.find((a) => a.available && a.type !== 'move'); if (!fb) break;
    act(fb.type, fb.args);
  }
  return { outcome: obs && obs.season.outcome, silk: obs && obs.iris ? obs.iris.silk : null, commands };
}

/**
 * An agents-only exhibition: N scripted agents enter a fresh cup and play their seasons with a fixed seed.
 * Nothing is recorded on chain. Returns the cup view {season, entrants, leaderboard, sealedAt}.
 */
export async function runExhibition({ agents = [['Scribe-1', 'cautious'], ['Scribe-3', 'explorer'], ['Scribe-5', 'greedy'], ['Scribe-2', 'explorer']], seed = 5, onProgress = () => {}, clock = () => Date.now() } = {}) {
  const api = createApi({ maxSessions: agents.length + 1, maxTimeScale: 1000, allowClientSeed: true, seasonRandomBytes: seededBytes(seed) });
  const cup = createTournament({ seasonId: 'exhibition', clock });
  const runs = agents.map(([name, policy], i) => {
    const c = api.createSession({ rules: 'v3', timeScale: 1000, worldRules: 'proximity', name, label: 'exhibition' });
    const s = c.body;
    cup.enter({ sessionId: s.sessionId, playerId: s.playerId }, { season_id: 'exhibition', name, driver: 'scripted', model: null }, `ex-enter-${i}-0001`);
    return playScripted(api, s, POLICIES[policy] || POLICIES.explorer).then((r) => { onProgress(name, r); return r; });
  });
  await Promise.all(runs);
  const scoreOf = (e) => { const s = api.registry.sessions.get(e.sessionId); if (!s) return null; const o = s.room.observe(e.playerId); return o && o.season && o.season.outcome ? Number((o.iris && o.iris.silk) || 0) : null; };
  return cup.view(scoreOf);
}
