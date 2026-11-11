// Season replay links: the seed plus the player's accepted rules commands, packed into one URL parameter. Opening the
// link replays them in a fresh local room (the same room module as play and the agent API, salts derived from the
// seed) and shows where the season ended and its Merkle root. For the published judge season that root can be checked
// against the one committed on NEAR testnet; any other season was never committed, and the replay view says so.
// Pure: no DOM. The link carries only the seed, the rules version and the command list (no names, no ids).
import { createApi } from './api.js';
import { ACTIONS } from './catalog.js';
import { demoRandomBytes } from './near-season.js';
import { NEAR_DEPLOYMENT } from './near-deployment.js';

export const REPLAY_PREFIX = 'r1.';
export const REPLAY_MAX_COMMANDS = 400;
const RULES_TYPES = new Set(ACTIONS.filter((a) => a.kind === 'rules' && a.status === 'implemented').map((a) => a.type));
const RULES_OK = new Set(['v2', 'v3']);

const toB64url = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** The accepted rules commands of a room history, in order: [[type, args], ...]. */
export function replayCommands(history) {
  return (history || []).filter((h) => h.ok && h.kind === 'rules' && RULES_TYPES.has(h.type)).map((h) => [h.type, h.args || {}]);
}

/** Packs a replay into the URL parameter value. */
export function encodeReplay({ seedHex, rules = 'v3', commands }) {
  return REPLAY_PREFIX + toB64url(JSON.stringify({ s: seedHex, r: rules, c: commands }));
}

/** Unpacks and validates a replay parameter. Returns {seedHex, rules, commands} or null. */
export function decodeReplay(param) {
  if (typeof param !== 'string' || !param.startsWith(REPLAY_PREFIX) || param.length > 60000) return null;
  let o;
  try { o = JSON.parse(fromB64url(param.slice(REPLAY_PREFIX.length))); } catch { return null; }
  if (!o || typeof o.s !== 'string' || !/^[0-9a-f]{32}$/.test(o.s) || !RULES_OK.has(o.r) || !Array.isArray(o.c) || o.c.length > REPLAY_MAX_COMMANDS) return null;
  for (const c of o.c) if (!Array.isArray(c) || c.length !== 2 || !RULES_TYPES.has(c[0]) || !c[1] || typeof c[1] !== 'object' || Array.isArray(c[1])) return null;
  return { seedHex: o.s, rules: o.r, commands: o.c };
}

/** The full link for a page URL (its query is replaced). */
export function replayLink(pageUrl, replay) {
  const u = new URL(pageUrl);
  u.search = '?replay=' + encodeReplay(replay);
  u.hash = '';
  return u.toString();
}

/**
 * Replays the commands in a fresh room. Returns {ok, applied, results, obs, season: {seasonId, merkleRoot, tick,
 * phase, outcome}, committed} where `committed` is the deployment record for this season (judge season) or null.
 */
export function runReplay({ seedHex, rules = 'v3', commands }, { deployment = NEAR_DEPLOYMENT } = {}) {
  const api = createApi({ allowClientSeed: true, maxTimeScale: 1000, maxSessions: 2, seasonRandomBytes: () => demoRandomBytes(seedHex) });
  const created = api.createSession({ worldRules: 'free', timeScale: 1000, seedHex, rules, label: 'replay' });
  if (created.status !== 201) return { ok: false, applied: 0, results: [], obs: null, season: null, committed: null };
  const { sessionId, token } = created.body;
  const obs = () => api.observe(sessionId, token).body.observation;
  const results = [];
  let n = 0;
  for (const [type, args] of commands) {
    const r = api.command(sessionId, token, { actionId: `replay-${String(++n).padStart(4, '0')}`, expectedVersion: obs().version, type, args });
    results.push(r.status);
  }
  const o = obs();
  const season = { seasonId: o.season.seasonId, merkleRoot: o.season.merkleRoot, tick: o.season.tick, phase: o.season.phase, outcome: o.season.outcome || null, silk: o.iris ? o.iris.silk : null };
  const rec = deployment && deployment.seasons ? deployment.seasons[season.seasonId] || null : null;
  return { ok: results.every((s) => s === 200), applied: results.filter((s) => s === 200).length, results, obs: o, season, committed: rec ? { seasonId: season.seasonId, scheduleRoot: rec.scheduleRoot, commitTx: rec.commitTx, contractId: deployment.contractId, explorer: deployment.explorer } : null };
}

/** Whether the replayed root equals the committed root recorded for the season: 'match' | 'mismatch' | 'not-committed'. */
export function rootCheck(replay) {
  if (!replay || !replay.season) return 'not-committed';
  if (!replay.committed) return 'not-committed';
  return replay.committed.scheduleRoot === replay.season.merkleRoot ? 'match' : 'mismatch';
}
