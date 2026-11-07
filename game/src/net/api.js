// Transport-independent API operations: each returns {status, body}. The HTTP server maps routes
// onto these and the in-browser local transport calls them directly, so both report identical
// results for identical requests.
import { SessionRegistry } from './sessions.js';
import { catalogDocument } from './catalog.js';
import { RULES_VERSIONS, DEFAULT_RULES } from './engine-host.js';

const unauthorized = () => ({ status: 401, body: { ok: false, error: { code: 'unauthorized', message: 'missing or invalid bearer token for this session' } } });
const ok = (body) => ({ status: 200, body: { ok: true, ...body } });

export function createApi(registryOptions = {}) {
  const registry = registryOptions instanceof SessionRegistry ? registryOptions : new SessionRegistry(registryOptions);
  const withAuth = (id, token, fn) => { const a = registry.auth(id, token); if (!a) return unauthorized(); a.room.lastActivityMs = registry.clock(); return fn(a); };
  return {
    registry,
    catalog: () => ok({ ...catalogDocument(RULES_VERSIONS), defaultRules: DEFAULT_RULES }),
    createSession: (body) => registry.create(body || {}),
    join: (id, body) => registry.join(id, body || {}),
    leave: (id, token) => registry.leave(id, token),
    session: (id, token) => withAuth(id, token, ({ room, member }) => ok({ session: room.sessionInfo(), you: { playerId: member.playerId, role: member.role }, version: room.version })),
    observe: (id, token) => withAuth(id, token, ({ room, member }) => ok({ observation: room.observe(member.playerId) })),
    actions: (id, token) => withAuth(id, token, ({ room, member }) => ok({ version: room.version, actions: room.availableActions(member.playerId) })),
    command: (id, token, envelope) => withAuth(id, token, ({ room, member }) => room.command(member.playerId, envelope)),
    events: (id, token, after = 0, limit = 500) => withAuth(id, token, ({ room, member }) => { const evs = room.eventsFor(member.playerId, after, limit); return ok({ events: evs, lastSeq: evs.length ? evs[evs.length - 1].seq : after }); }),
    history: (id, token) => withAuth(id, token, ({ room, member }) => ok({ history: room.historyFor(member.playerId) })),
    proof: (id, token, index) => withAuth(id, token, ({ room }) => {
      const p = Number.isInteger(index) ? room.proof(index) : null;
      return p ? ok({ proof: p }) : { status: 403, body: { ok: false, error: { code: 'not_revealed', message: 'proofs are published only for revealed events' } } };
    }),
    /** Live events for one viewer: fn(viewEvent) for every new event the viewer may see. */
    subscribe: (id, token, fn) => {
      const a = registry.auth(id, token);
      if (!a) return null;
      const { room } = a, playerId = a.member.playerId;
      return room.subscribe((ev) => { const m = room.members.get(playerId); if (m && room.canSee(ev, m)) fn(room.constructor.viewEvent(ev)); });
    },
  };
}
