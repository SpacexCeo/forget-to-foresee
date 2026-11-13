// The Season Cup for agents (sprint 7.9): an AI or scripted agent enters through the agent API, with no human
// required, and shows on the board with an Agent badge. One cup per server, across sessions. Entries are recorded in
// the simulation ("settlement": "simulation"): this server holds no keys and sends nothing on chain. An entrant's
// score is its own session's Iris silk once that season has an outcome; the cup seals when every entrant's season has
// ended (agents-only cups seal too).
export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{0,19}$/;
export const DRIVERS = Object.freeze(['scripted', 'llm']);
export const ENTRY_LIMIT = 4; // agent entries per session

export const ENTER_ACTION = Object.freeze({
  type: 'enter_tournament', status: 'live', kind: 'tournament', roles: ['controller', 'helper'],
  summary: 'Enter this session\'s agent in the Season Cup. The entry is recorded in the simulation (no chain, no silk taken); the score is this session\'s Iris silk when its season ends. At most 4 agent entries per session.',
  params: {
    type: 'object', additionalProperties: false, required: ['season_id', 'name', 'driver'],
    properties: {
      season_id: { type: 'string', maxLength: 32, description: 'the open cup, from GET /v1/tournament' },
      name: { type: 'string', pattern: NAME_RE.source, description: '1 to 20 characters: letters, digits, space, dash' },
      driver: { type: 'string', enum: DRIVERS, description: 'scripted: fixed rules, no model; llm: driven by a language model' },
      model: { type: ['string', 'null'], maxLength: 80, description: 'the model id when driver is llm' },
    },
  },
});

const fail = (status, code, message) => ({ status, body: { ok: false, error: { code, message } } });

/**
 * @param {{clock?: () => number, seasonId?: string, opensAt?: number, closesAt?: number}} o
 */
export function createTournament({ clock = () => Date.now(), seasonId = 's1', opensAt = null, closesAt = null } = {}) {
  const season = { id: seasonId, opensAt: opensAt ?? clock(), closesAt: closesAt ?? clock() + 7 * 86_400_000, sealedAt: null };
  const entrants = []; const idem = new Map(); let seq = 0;

  /**
   * Validates and records one entry. `who` = {sessionId, playerId, account?, owner?}; `conflict()` returns the
   * session's current version when the envelope's expectedVersion is stale (checked after an idempotent replay).
   */
  function enter(who, args, actionId, conflict = () => null) {
    const key = who.sessionId + '\u0000' + who.playerId + '\u0000' + actionId;
    const fp = JSON.stringify(args);
    const prior = idem.get(key);
    if (prior) return prior.fp === fp ? { status: prior.status, body: { ...prior.body, replayed: true } } : fail(409, 'idempotency_key_reused', 'this actionId was already used for a different command');
    const cur = conflict();
    if (cur != null) return { status: 409, body: { ok: false, error: { code: 'version_conflict', message: 'the session changed; re-read the observation', currentVersion: cur } } };
    const done = (r) => { idem.set(key, { fp, status: r.status, body: r.body }); return r; };
    const a = args && typeof args === 'object' ? args : {};
    if (a.season_id !== season.id || season.sealedAt || clock() > season.closesAt || clock() < season.opensAt) return done(fail(404, 'no_open_season', 'that cup is not open for entries; see GET /v1/tournament'));
    if (typeof a.name !== 'string' || !NAME_RE.test(a.name)) return done(fail(400, 'bad_name', 'name: 1 to 20 characters of letters, digits, space and dash'));
    if (!DRIVERS.includes(a.driver)) return done(fail(400, 'bad_driver', 'driver must be "scripted" or "llm"'));
    if (a.driver === 'llm' && !(typeof a.model === 'string' && a.model.length >= 1 && a.model.length <= 80)) return done(fail(400, 'bad_driver', 'an llm agent names its model'));
    const mine = entrants.filter((e) => e.sessionId === who.sessionId);
    if (mine.some((e) => e.name.toLowerCase() === a.name.toLowerCase())) return done(fail(409, 'already_entered', 'this session already entered an agent with that name'));
    if (mine.length >= ENTRY_LIMIT) return done(fail(429, 'entry_limit', `at most ${ENTRY_LIMIT} agent entries per session`));
    const e = { id: 'ent_' + String(++seq).padStart(2, '0'), account: who.account || null, name: a.name, kind: 'agent', driver: a.driver, model: a.driver === 'llm' ? a.model : null, owner: who.owner || null, enteredAt: clock(), score: null, sessionId: who.sessionId, playerId: who.playerId };
    entrants.push(e);
    return done({ status: 200, body: { ok: true, actionId, type: 'enter_tournament', settlement: 'simulation', result: { entrant: publicEntrant(e) }, events: [{ type: 'tournament_entered', entrant: publicEntrant(e) }] } });
  }

  /** Refreshes scores from the sessions (scoreOf(entrant) -> number | null) and seals when every season has ended. */
  function refresh(scoreOf) {
    for (const e of entrants) { if (e.score == null) { const s = scoreOf(e); if (Number.isFinite(s)) e.score = s; } }
    if (!season.sealedAt && entrants.length && entrants.every((e) => e.score != null)) season.sealedAt = clock();
  }
  function view(scoreOf = () => null) {
    refresh(scoreOf);
    const status = season.sealedAt ? 'sealed' : entrants.some((e) => e.score != null) ? 'running' : 'enrolling';
    const ranked = entrants.filter((e) => e.score != null).sort((p, q) => q.score - p.score || p.enteredAt - q.enteredAt);
    return {
      season: { id: season.id, status, opensAt: season.opensAt, closesAt: season.closesAt },
      entrants: entrants.map(publicEntrant),
      leaderboard: ranked.map((e, i) => ({ rank: i + 1, name: e.name, kind: e.kind, driver: e.driver, score: e.score })),
      sealedAt: season.sealedAt,
    };
  }
  return { enter, view, get season() { return { ...season }; }, get entrants() { return entrants.map(publicEntrant); } };
}

const publicEntrant = (e) => ({ id: e.id, account: e.account, name: e.name, kind: e.kind, driver: e.driver, model: e.model, owner: e.owner, enteredAt: e.enteredAt, score: e.score });
