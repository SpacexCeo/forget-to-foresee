// Session registry shared by the HTTP server and the in-browser local transport: creates rooms,
// issues per-session dev tokens and invite codes, and authenticates requests. Tokens are random
// 256-bit values; only their SHA-256 is stored, and nothing here ever logs them. They identify a
// player inside one test session and authorize game actions only: there are no wallet, signing or
// transfer capabilities anywhere in this API.
import { sha256 } from '../game/crypto.js';
import { Room, WORLD_RULES } from './room.js';
import { RULES_VERSIONS, DEFAULT_RULES } from './engine-host.js';
import { validate } from './schema.js';

const hex = (n) => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');

export const CREATE_SCHEMA = {
  type: 'object',
  properties: {
    rules: { type: 'string', description: 'Engine rules mode (one of rulesVersions in GET /v1/actions). Default v3.' },
    worldRules: { type: 'string', enum: WORLD_RULES, description: '"proximity" (default): rules actions need the avatar at the right place. "free": no proximity checks.' },
    timeScale: { type: 'number', minimum: 0.1, maximum: 1000, description: 'Simulated seconds per real second for walking. Default 1.' },
    name: { type: 'string', maxLength: 32 },
    label: { type: 'string', maxLength: 64 },
    seed: { type: 'integer', minimum: 0, maximum: 4294967295, description: 'Test sessions only (legacy modes): fixes the season. Marked clientChoseSeed in the observation.' },
    seedHex: { type: 'string', pattern: '^[0-9a-f]{32}$', description: 'Test sessions only (v3): 128-bit seed. Marked clientChoseSeed.' },
    scriptedKey: { type: 'string', minLength: 16, maxLength: 128, description: 'A scripted actor\'s key from the server\'s scripted registry (the arena accounts). Marks the session scripted: it may hunt, and its expedition log is ranked in the Scripted NPC list, never the human one.' },
  },
  additionalProperties: false,
};
export const JOIN_SCHEMA = { type: 'object', required: ['inviteCode'], properties: { inviteCode: { type: 'string', pattern: '^[0-9a-f]{16}$' }, name: { type: 'string', maxLength: 32 } }, additionalProperties: false };

const fail = (status, code, message, extra = {}) => ({ status, body: { ok: false, error: { code, message, ...extra } } });

export class SessionRegistry {
  /**
   * @param {object} [o]
   * @param {() => number} [o.clock]
   * @param {number} [o.maxSessions] @param {number} [o.maxTimeScale] @param {number} [o.idleMs]
   * @param {boolean} [o.allowClientSeed]   dev/test servers only
   * @param {() => ((n:number) => Uint8Array)} [o.seasonRandomBytes]  test harness only: deterministic commitments
   */
  constructor({ clock = () => Date.now(), maxSessions = 200, maxTimeScale = 1000, idleMs = 2 * 3600 * 1000, allowClientSeed = true, seasonRandomBytes = null, scripted = {} } = {}) {
    Object.assign(this, { clock, maxSessions, maxTimeScale, idleMs, allowClientSeed, seasonRandomBytes });
    this.scripted = new Map(Object.entries(scripted || {}).map(([key, account]) => [sha256('scripted:' + key), String(account)])); // key -> account, stored hashed
    this.sessions = new Map(); // id -> {room, tokens: Map(hash -> playerId), inviteHash}
  }

  create(opts = {}) {
    const errs = validate(CREATE_SCHEMA, opts);
    if (errs.length) return fail(400, 'invalid_params', 'session options do not match the schema', { errors: errs });
    const rules = opts.rules || DEFAULT_RULES;
    if (!RULES_VERSIONS.includes(rules)) return fail(400, 'unknown_rules', `rules must be one of ${RULES_VERSIONS.join(', ')}`);
    if ((opts.seed != null || opts.seedHex != null) && !this.allowClientSeed) return fail(403, 'forbidden', 'this server does not accept client-chosen seeds');
    if (opts.timeScale != null && opts.timeScale > this.maxTimeScale) return fail(400, 'invalid_params', `timeScale must be <= ${this.maxTimeScale} on this server`);
    const actor = opts.scriptedKey != null ? this.scripted.get(sha256('scripted:' + opts.scriptedKey)) : null;
    if (opts.scriptedKey != null && !actor) return fail(403, 'forbidden', 'unknown scriptedKey: not in this server\'s scripted registry');
    this.sweep();
    if (this.sessions.size >= this.maxSessions) return fail(503, 'capacity', 'too many sessions; try later');
    const id = 's-' + hex(8);
    let room;
    try {
      room = new Room({ id, rules, worldRules: opts.worldRules || 'proximity', timeScale: opts.timeScale || 1, clock: this.clock, seed: opts.seed, seedHex: opts.seedHex, randomBytes: this.seasonRandomBytes ? this.seasonRandomBytes() : undefined, label: opts.label || 'test session', actor: actor ? { kind: 'scripted', account: actor } : null });
    } catch (e) { return fail(400, e.code || 'invalid_params', e.message); }
    const invite = hex(8);
    const entry = { room, tokens: new Map(), inviteHash: sha256('invite:' + invite) };
    this.sessions.set(id, entry);
    const m = room.addMember({ role: 'controller', name: opts.name });
    const token = this.issue(entry, m.playerId);
    return { status: 201, body: { ok: true, sessionId: id, playerId: m.playerId, role: m.role, token, inviteCode: invite, session: room.sessionInfo(), version: room.version } };
  }

  issue(entry, playerId) { const token = 'ftf_' + hex(32); entry.tokens.set(sha256('token:' + token), playerId); return token; }

  join(sessionId, body = {}) {
    const entry = this.sessions.get(sessionId);
    if (!entry) return fail(404, 'not_found', 'unknown session');
    const errs = validate(JOIN_SCHEMA, body);
    if (errs.length) return fail(400, 'invalid_params', 'join body does not match the schema', { errors: errs });
    if (sha256('invite:' + body.inviteCode) !== entry.inviteHash) return fail(403, 'forbidden', 'wrong invite code');
    let m;
    try { m = entry.room.addMember({ role: 'helper', name: body.name }); } catch (e) { return fail(e.code === 'session_full' ? 409 : 403, e.code || 'forbidden', e.message); }
    const token = this.issue(entry, m.playerId);
    return { status: 201, body: { ok: true, sessionId, playerId: m.playerId, role: m.role, token, session: entry.room.sessionInfo(), version: entry.room.version } };
  }

  /** {room, member, entry, tokenHash} for a valid token of this session, else null. Constant work per call. */
  auth(sessionId, token) {
    const entry = this.sessions.get(sessionId);
    if (!entry || typeof token !== 'string' || token.length > 200) return null;
    const h = sha256('token:' + token);
    const playerId = entry.tokens.get(h);
    if (!playerId) return null;
    const member = entry.room.members.get(playerId);
    if (!member) return null;
    return { room: entry.room, member, entry, tokenHash: h };
  }

  leave(sessionId, token) {
    const a = this.auth(sessionId, token);
    if (!a) return fail(401, 'unauthorized', 'missing or invalid token');
    a.entry.tokens.delete(a.tokenHash);
    a.room.removeMember(a.member.playerId);
    return { status: 200, body: { ok: true, left: a.member.playerId } };
  }

  /** Drops sessions idle for longer than idleMs. */
  sweep() {
    const now = this.clock();
    for (const [id, e] of this.sessions) if (now - e.room.lastActivityMs > this.idleMs) this.sessions.delete(id);
  }
}
