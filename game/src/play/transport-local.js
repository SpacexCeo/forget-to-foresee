// Local transport: the browser runs the SAME authoritative room code the agent API serves over HTTP
// (src/net/api.js → sessions.js → room.js → engine.js). The UI talks to it only through the API's
// transport-independent operations ({status, body}), so a human in the browser and an agent over
// HTTP go through one command bus with the same validation, proximity checks, idempotency keys,
// versions and per-viewer observations. Nothing here knows a game rule.
//
// Walking: the player walks in real time in the 3D client under the same kinematic capsule and
// colliders the room uses; the client then replays the walked path to the room (`move` with
// waypoints), which re-simulates it. The local session runs its simulated clock at `timeScale`
// (default 1000x) so that replay completes almost at once instead of making the player wait for
// the same walk twice. The session is labeled "local demo" and is never a server session.
import { createApi } from '../net/api.js';

/**
 * @param {object} [o]
 * @param {string} [o.rules]      engine rules mode (default: the API default, v3)
 * @param {number} [o.timeScale]  simulated seconds per real second for walk replays
 * @param {string} [o.seedHex]    test/dev only: fixes the season (marked clientChoseSeed)
 * @param {string} [o.name]
 * @param {() => number} [o.clock] milliseconds (tests)
 */
export function createLocalTransport({ rules, timeScale = 1000, seedHex, name = 'Iris', clock } = {}) {
  const api = createApi({ clock, maxSessions: 4, allowClientSeed: true, maxTimeScale: 1000 });
  const opts = { worldRules: 'proximity', timeScale, label: 'local demo', name };
  if (rules) opts.rules = rules;
  if (seedHex) opts.seedHex = seedHex;
  const created = api.createSession(opts);
  if (created.status !== 201) throw new Error('local session failed: ' + JSON.stringify(created.body.error));
  const { sessionId, token, playerId, inviteCode } = created.body;
  // The token never leaves this closure: UI code only gets the bound operations below.
  return {
    kind: 'local',
    sessionId, playerId, inviteCode, timeScale,
    session: created.body.session,
    catalog: () => api.catalog(),
    observe: () => api.observe(sessionId, token),
    actions: () => api.actions(sessionId, token),
    command: (envelope) => api.command(sessionId, token, envelope),
    events: (after = 0, limit = 500) => api.events(sessionId, token, after, limit),
    history: () => api.history(sessionId, token),
    proof: (index) => api.proof(sessionId, token, index),
    /** fn(viewEvent) for every new event this player may see. Returns an unsubscribe function. */
    subscribe: (fn) => api.subscribe(sessionId, token, fn),
    /** Real milliseconds a simulated walk of `seconds` takes in this session. */
    realDelayMs: (seconds) => Math.ceil((Math.max(0, seconds) / timeScale) * 1000),
  };
}
