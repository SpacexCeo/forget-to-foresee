// Authoritative room: one session = one season of the engine + the world layer (avatars, zones,
// discoveries, dialogue, logogram drafts) + an append-only event log with per-viewer redaction +
// idempotent, version-checked command processing. The same code runs on the Node server (agent API)
// and in the browser (local guest demo via transport-local.js), so humans and agents go through one
// command bus. Rules outcomes come only from the engine (engine-host.js).
import { createSeason, withState, dryRun, RULES_VERSIONS, DEFAULT_RULES } from './engine-host.js';
import { ACTIONS, ACTIONS_BY_TYPE, PRECONDITIONS, MEANING_NAMES } from './catalog.js';
import { validate } from './schema.js';
import { project, meaningObj } from './projection.js';
import { deriveSeed, entropyCommitment, hexOf, SEED_PROTOCOL } from './near-season.js';
import * as W from './world-map.js';
import * as T from './text.js';

const CLAN_INDEX = Object.fromEntries(W.CLAN_IDS.map((c, i) => [c, i]));
const PUBLIC_FX = new Set(['voice', 'crisis', 'event', 'fragment', 'dark', 'break', 'mend', 'end']);
const PUBLIC_WORLD_TYPES = new Set(['move', 'enter_shell', 'exit_shell']);
export const MAX_MEMBERS = 4;
export const WORLD_RULES = ['proximity', 'free'];
const ACTION_ID_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const IDEM_LIMIT = 5000;
const EVENT_LIMIT = 20000;

let islandWorld = null, shellWorld = null;
const worldFor = (zone) => (zone === 'shell' ? (shellWorld ||= W.buildShellWorld()) : (islandWorld ||= W.buildIslandWorld()));

const r3 = (v) => Math.round(v * 1000) / 1000;
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);

/** Engine call for each rules action. Returns the engine's {ok, reason}. */
const ENGINE_CALLS = {
  start_season: (E, a) => { E.startGame(a.phrase || ''); return { ok: true }; },
  set_reading_rule: (E, a) => E.setRule(a.rule),
  place_anchor: (E, a) => E.placeAnchor(a.shell - 1, a.tick),
  ask_guests: (E, a) => E.askGuests(a.slot, a.form, a.meaning),
  sacrifice_memory: (E, a) => E.forget(a.memoryId, a.purpose || 'vision'),
  speak_key: (E) => E.speakKey(),
  mend: (E, a) => E.mend(CLAN_INDEX[a.clan]),
  mediate: (E, a) => E.mediate(CLAN_INDEX[a.clanA], CLAN_INDEX[a.clanB]),
  accept_offer: (E, a) => E.acceptOffer(a.offerId),
  decline_offer: (E, a) => E.declineOffer(a.offerId),
  bid_shard: (E, a) => E.bid(a.auctionId),
  contribute_fragment: (E) => E.contributeMine(),
  end_tick: (E) => (E.endTick() ? { ok: true } : { ok: false, reason: 'phase' }),
  cast_vote: (E, a) => E.castVote(!!a.accept),
  set_heir: (E, a) => E.setHeir(!!a.heir),
};

/** Snapshot of the fields the event deriver compares before and after an engine call. */
function digest(S) {
  return {
    tick: S.tick, phase: S.phase, H: S.H, outcome: S.outcome, frag: S.frag.map((f) => f.st), chron: S.chron.length,
    broken: new Set(S.broken), feedTop: S.feed[0] || null, mem: new Map(S.mem.map((m) => [m.id, m])), offers: new Set(S.offers.map((o) => o.id)),
    shards: new Map(S.shards.map((s) => [s.id, !!s.done])), silk: S.silk[0], ap: S.ap,
  };
}

export class Room {
  /**
   * @param {object} o
   * @param {string} o.id
   * @param {string} [o.rules]       engine rules mode (session parameter; default v3)
   * @param {'proximity'|'free'} [o.worldRules]  proximity: rules actions need the avatar at the right place
   * @param {number} [o.timeScale]   simulated seconds per real second (test sessions may accelerate)
   * @param {() => number} [o.clock] milliseconds; injectable for tests
   * @param {number} [o.seed] @param {string} [o.seedHex] @param {(n:number)=>Uint8Array} [o.randomBytes]  test sessions only
   */
  constructor({ id, rules = DEFAULT_RULES, worldRules = 'proximity', timeScale = 1, clock = () => Date.now(), seed, seedHex, randomBytes, label = 'test session' } = {}) {
    if (!RULES_VERSIONS.includes(rules)) throw Object.assign(new Error(`unknown rules "${rules}"`), { code: 'unknown_rules' });
    if (!WORLD_RULES.includes(worldRules)) throw Object.assign(new Error(`unknown worldRules "${worldRules}"`), { code: 'invalid_params' });
    this.id = id;
    this.rules = rules;
    this.worldRules = worldRules;
    this.timeScale = timeScale;
    this.clock = clock;
    this.createdAtMs = clock();
    this.clientSeed = seed != null || seedHex != null;
    this.label = label;
    this.randomBytes = randomBytes || ((n) => globalThis.crypto.getRandomValues(new Uint8Array(n)));
    // Season entropy (docs/verify.md, protocol ftf-seed/1): for a live v3 season the room draws 32 random bytes now and
    // publishes only their commitment; the player's nonce arrives with start_season, and the seed that generates the
    // season is derived from both (plus an optional public beacon). Until then the season is provisional (nonce "").
    // A client-chosen seed (test and demo sessions) or a legacy rules mode has no nonce protocol.
    if (!this.clientSeed && rules === 'v3') {
      const roomEntropy = hexOf(this.randomBytes(32));
      this.entropy = { protocol: SEED_PROTOCOL, roomEntropy, commitment: entropyCommitment(roomEntropy), nonce: null, beacon: null, seedHex: deriveSeed(roomEntropy, '', null), sealed: false };
      seedHex = this.entropy.seedHex;
    } else {
      this.entropy = this.clientSeed ? { protocol: 'fixed-seed', seedHex: seedHex ?? null, seed: seed ?? null, sealed: true } : { protocol: 'none', sealed: true };
    }
    const { state, fx } = createSeason({ rules, seed, seedHex, randomBytes: this.randomBytes });
    this.state = state;
    this.version = 1;
    this.members = new Map();
    this.memberSeq = 0;
    this.events = [];
    this.seq = 0;
    this.listeners = new Set();
    this.idem = new Map();
    this.history = [];
    // Shards: the engine keeps a shard only until the tick after its auction; the room remembers every shard of the
    // season (last snapshot) and, for Iris's shards, which future sign the vision opened (docs/shard-nft.md).
    this.shardLog = new Map();
    this.shardMeta = new Map();
    this.emit('season.created', 'all', { rules, worldRules, timeScale, merkleRoot: this.entropy.sealed ? state.root : null, entropyProtocol: this.entropy.protocol, entropyCommitment: this.entropy.commitment ?? null });
    this.emitFx(fx);
    this.lastActivityMs = this.createdAtMs;
  }

  /* ---------- time and members ---------- */

  simNow() { return r3(((this.clock() - this.createdAtMs) / 1000) * this.timeScale); }

  addMember({ role = 'helper', name } = {}) {
    if (this.members.size >= MAX_MEMBERS) throw Object.assign(new Error('session is full'), { code: 'session_full' });
    if (role === 'controller' && [...this.members.values()].some((m) => m.role === 'controller')) throw Object.assign(new Error('session already has a controller'), { code: 'forbidden' });
    const playerId = 'p' + ++this.memberSeq;
    const m = { playerId, role, name: String(name || (role === 'controller' ? 'Iris' : 'Helper ' + this.memberSeq)).slice(0, 32), avatar: { zone: 'island', shell: null, pos: W.SPAWN.slice(), transit: null }, clues: new Map(), logograms: new Map(), logoSeq: 0 };
    this.members.set(playerId, m);
    this.emit('member.joined', 'all', { playerId, role: m.role, name: m.name });
    return m;
  }

  removeMember(playerId) {
    const m = this.members.get(playerId);
    if (!m) return false;
    this.members.delete(playerId);
    this.emit('member.left', 'all', { playerId });
    return true;
  }

  /** Completes walks whose simulated arrival time has passed. Called before every read and command. */
  advance() {
    const now = this.simNow();
    for (const m of this.members.values()) {
      const tr = m.avatar.transit;
      if (tr && now >= tr.start + tr.seconds) {
        m.avatar.pos = [tr.end[0], 0, tr.end[2]];
        m.avatar.transit = null;
        this.emit('world.arrived', 'all', { playerId: m.playerId, zone: m.avatar.zone, shell: m.avatar.shell, position: m.avatar.pos, place: tr.to, at: r3(tr.start + tr.seconds) });
      }
    }
  }

  avatarPos(m, now = this.simNow()) {
    const tr = m.avatar.transit;
    return tr ? W.trailPosition(tr.trail, now - tr.start) : m.avatar.pos;
  }

  /* ---------- events ---------- */

  emit(type, audience, data) {
    const ev = { seq: ++this.seq, type, simTime: this.simNow(), tick: this.state.tick, audience, data };
    this.events.push(ev);
    if (this.events.length > EVENT_LIMIT) this.events.splice(0, this.events.length - EVENT_LIMIT);
    for (const fn of [...this.listeners]) { try { fn(ev); } catch { /* a broken listener never breaks the room */ } }
    return ev;
  }

  emitFx(list) {
    for (const f of list || []) {
      const line = T.fxLine(f);
      this.emit('fx', PUBLIC_FX.has(f.type) ? 'all' : 'controller', { fx: { ...f }, line });
    }
  }

  canSee(ev, viewer) {
    if (ev.audience === 'all') return true;
    if (ev.audience === 'controller') return viewer.role === 'controller';
    return ev.audience === viewer.playerId;
  }

  static viewEvent(ev) { return { seq: ev.seq, type: ev.type, simTime: ev.simTime, tick: ev.tick, visibility: ev.audience === 'all' ? 'public' : 'private', data: ev.data }; }

  eventsFor(playerId, after = 0, limit = 500) {
    const viewer = this.members.get(playerId);
    if (!viewer) return [];
    this.advance();
    const out = [];
    for (const ev of this.events) { if (ev.seq <= after || !this.canSee(ev, viewer)) continue; out.push(Room.viewEvent(ev)); if (out.length >= limit) break; }
    return out;
  }

  /** Raw subscription (transports filter per viewer with canSee). Returns an unsubscribe function. */
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Engine changes → domain events with an audience (public or controller-only). */
  deriveEvents(pre, post, S) {
    if (post.feedTop !== pre.feedTop) {
      const idx = pre.feedTop ? S.feed.indexOf(pre.feedTop) : S.feed.length;
      const fresh = S.feed.slice(0, idx < 0 ? S.feed.length : idx).reverse();
      for (const f of fresh) this.emit('iris.log', 'controller', T.logEntry(f));
    }
    if (pre.H !== post.H) this.emit('season.tension_changed', 'all', { from: pre.H, to: post.H });
    for (let i = pre.chron; i < post.chron; i++) {
      const c = S.chron[i], pr = S.proofs.find((x) => x.idx === c.idx);
      this.emit('season.event_revealed', 'all', { tick: c.t, index: c.idx, forms: c.forms, dots: c.dots, meaning: meaningObj(c.m), proofVerified: pr ? !!pr.ok : null });
    }
    post.frag.forEach((st, i) => { if (st !== pre.frag[i]) this.emit('scroll.fragment_changed', 'all', { clan: W.CLAN_IDS[i], from: pre.frag[i], to: st }); });
    for (const k of post.broken) if (!pre.broken.has(k)) { const [a, b] = k.split('-').map(Number); this.emit('relationships.link_changed', 'all', { a: W.CLAN_IDS[a], b: W.CLAN_IDS[b], broken: true }); }
    for (const k of pre.broken) if (!post.broken.has(k)) { const [a, b] = k.split('-').map(Number); this.emit('relationships.link_changed', 'all', { a: W.CLAN_IDS[a], b: W.CLAN_IDS[b], broken: false }); }
    for (const [id, m] of post.mem) if (!pre.mem.has(id)) this.emit('iris.memory_added', 'controller', { id, kind: m.kind, about: m.about != null ? W.CLAN_IDS[m.about] : null, text: T.memoryText(m.text) });
    for (const [id, m] of pre.mem) if (!post.mem.has(id)) this.emit('iris.memory_removed', 'controller', { id, kind: m.kind });
    for (const o of S.offers) if (!pre.offers.has(o.id)) { const txt = T.offerText(o); this.emit('dialogue.offer', 'controller', { offerId: o.id, from: W.CLAN_IDS[o.from], kind: o.kind, speaker: W.CLAN_NAMES[o.from], ...txt }); }
    for (const sh of S.shards) {
      if (!pre.shards.has(sh.id)) this.emit('auction.opened', 'controller', { auctionId: sh.id, from: W.CLAN_IDS[sh.from], title: T.shardTitle(sh.title), closesAtTick: sh.exp });
      else if (sh.done && !pre.shards.get(sh.id)) this.emit('auction.closed', 'controller', { auctionId: sh.id, winner: sh.winner != null ? W.CLAN_IDS[sh.winner] : null, result: T.shardResult(sh.result) });
    }
    if (pre.silk !== post.silk || pre.ap !== post.ap) this.emit('iris.resources_changed', 'controller', { silk: post.silk, attention: post.ap });
    if (pre.tick !== post.tick) this.emit('season.tick_started', 'all', { tick: post.tick });
    if (pre.phase !== post.phase) this.emit('season.phase_changed', 'all', { from: pre.phase, to: post.phase });
    if (!pre.outcome && post.outcome) this.emit('season.ended', 'all', { outcome: post.outcome, text: T.t('outcome.' + post.outcome) });
  }

  /* ---------- preconditions ---------- */

  resolveArgs(def, args, m) {
    if (def.type === 'place_anchor' && args.logogram) {
      const d = m.logograms.get(args.logogram);
      return d ? { shell: d.impliedAnchor.shell, tick: d.impliedAnchor.tick } : null;
    }
    return args;
  }

  /** Failing preconditions (world, role, phase) as [{id, source, reason, message}]. Engine guards are separate. */
  preconditionFailures(m, def, args, now = this.simNow()) {
    const out = [];
    const fail = (id, reason) => out.push({ id, source: id === 'role_controller' ? 'permission' : 'precondition', reason: reason || id, message: PRECONDITIONS[id].description });
    const proximity = this.worldRules === 'proximity';
    const av = m.avatar, pos = this.avatarPos(m, now);
    for (const id of def.preconditions) {
      const pc = PRECONDITIONS[id];
      if (pc.mode === 'proximity' && !proximity) continue;
      switch (id) {
        case 'role_controller': if (m.role !== 'controller') fail(id, 'not_controller'); break;
        case 'phase_intro': if (this.state.phase !== 'intro') fail(id, 'phase'); break;
        case 'not_in_transit': if (av.transit) fail(id, 'in_transit'); break;
        case 'on_island': if (av.zone !== 'island') fail(id, 'wrong_zone'); break;
        case 'in_shell': if (av.zone !== 'shell') fail(id, 'wrong_zone'); break;
        case 'near_anchor_zone': {
          const a = this.resolveArgs(def, args, m);
          if (a && (av.zone !== 'island' || !W.nearAnchorZone(pos, a.shell))) fail(id, 'not_near');
          break;
        }
        case 'near_camp': { const c = (def.fixedArgs && def.fixedArgs.clan) || args.clan; if (av.zone !== 'island' || !W.nearCamp(pos, c)) fail(id, 'not_near'); break; }
        case 'near_offer_camp': { const o = this.state.offers.find((x) => x.id === args.offerId); if (o && (av.zone !== 'island' || !W.nearCamp(pos, W.CLAN_IDS[o.from]))) fail(id, 'not_near'); break; }
        case 'near_mediation_camp': if (av.zone !== 'island' || !(W.nearCamp(pos, args.clanA) || W.nearCamp(pos, args.clanB))) fail(id, 'not_near'); break;
        case 'near_scroll': if (av.zone !== 'island' || !W.nearScroll(pos)) fail(id, 'not_near'); break;
        case 'near_shard_pedestal': if (av.zone !== 'island' || !W.nearShardPedestal(pos)) fail(id, 'not_near'); break;
        case 'near_glass': if (av.zone !== 'shell' || !W.nearGlass(pos)) fail(id, 'not_near'); break;
        case 'near_target': if (!this.nearTarget(m, args.target, pos)) fail(id, 'not_near'); break;
        case 'prophecy_visible': if (!this.visibleProphecy(m, args.prophecy)) fail(id, 'not_visible'); break;
        case 'logogram_exists': if (args.logogram && !m.logograms.has(args.logogram)) fail(id, 'unknown_logogram'); break;
        case 'engine_guards': break;
        default: break;
      }
    }
    return out;
  }

  nearTarget(m, target, pos) {
    const av = m.avatar;
    if (target === 'guest_glass') return av.zone === 'shell' && W.nearGlass(pos);
    if (av.zone !== 'island') return false;
    if (target === 'scroll_table') return W.nearScroll(pos);
    if (target === 'shard_pedestal') return W.nearShardPedestal(pos);
    if (target.startsWith('anchor_zone:')) return W.nearAnchorZone(pos, Number(target.slice(12)));
    if (target.startsWith('camp:')) return W.nearCamp(pos, target.slice(5));
    return false;
  }

  /** A prophecy visible to this member: published (anyone) or a vision (controller only). */
  visibleProphecy(m, index) {
    const S = this.state, e = S.events[index];
    if (!e || e.t < S.tick || S.chron.some((c) => c.idx === index)) return null;
    if (e.pub <= S.tick) return { e, vision: false };
    if (m.role === 'controller' && S.visions.includes(index)) return { e, vision: true };
    return null;
  }

  /* ---------- commands ---------- */

  /**
   * Processes one command envelope {actionId, expectedVersion, type, args} for a member.
   * Returns {status, body}: an HTTP-like status so every transport reports identical results.
   */
  command(playerId, envelope) {
    const m = this.members.get(playerId);
    if (!m) return { status: 401, body: err('unauthorized', 'not a member of this session') };
    this.advance();
    this.lastActivityMs = this.clock();
    const env = envelope && typeof envelope === 'object' ? envelope : {};
    const { actionId, expectedVersion, type } = env;
    const args = env.args == null ? {} : env.args;
    if (typeof actionId !== 'string' || !ACTION_ID_RE.test(actionId)) return { status: 400, body: err('invalid_request', 'actionId must be 8-128 characters of [A-Za-z0-9._:-] (an idempotency key, unique per command)') };
    if (typeof type !== 'string') return { status: 400, body: err('invalid_request', 'type is required') };
    const key = playerId + '\u0000' + actionId;
    const fingerprint = JSON.stringify(canon({ type, args }));
    const prior = this.idem.get(key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) return { status: 409, body: err('idempotency_key_reused', 'this actionId was already used for a different command') };
      return { status: prior.status, body: { ...prior.body, replayed: true } };
    }
    const def = ACTIONS_BY_TYPE.get(type);
    if (!def) return { status: 400, body: err('unknown_action', `no action "${type}"; see GET /v1/actions`) };
    if (def.status === 'planned') return { status: 501, body: err('not_implemented', `"${type}" is planned: ${def.summary}`) };
    if (!Number.isInteger(expectedVersion)) return { status: 400, body: err('invalid_request', 'expectedVersion (integer) is required; use observation.version') };
    if (!args || typeof args !== 'object' || Array.isArray(args)) return { status: 400, body: err('invalid_params', 'args must be an object') };
    const verrs = validate(def.params, args);
    if (verrs.length) return { status: 400, body: err('invalid_params', 'args do not match the schema', { errors: verrs }) };
    if (!def.roles.includes(m.role)) return { status: 403, body: err('forbidden', `role "${m.role}" may not run "${type}"`) };
    if (expectedVersion !== this.version) return { status: 409, body: err('version_conflict', 'the session changed; re-read the observation', { currentVersion: this.version }) };

    const finish = (status, body, ok, reason) => {
      this.history.push({ n: this.history.length + 1, simTime: this.simNow(), tick: this.state.tick, playerId, role: m.role, kind: def.kind, type, actionId, ok, reason: reason || null, args, versionAfter: this.version });
      this.emit('action.result', playerId, { actionId, type, ok, reason: reason || null });
      body.events = this.eventsFor(playerId, startSeq);
      this.idem.set(key, { fingerprint, status, body });
      if (this.idem.size > IDEM_LIMIT) this.idem.delete(this.idem.keys().next().value);
      return { status, body };
    };
    const startSeq = this.seq;
    const failed = this.preconditionFailures(m, def, args);
    if (failed.length) {
      const perm = failed.find((f) => f.source === 'permission');
      if (perm) return { status: 403, body: err('forbidden', perm.message) };
      return finish(422, rejected(type, actionId, this.version, failed[0].reason, failed[0].source, failed), false, failed[0].reason);
    }
    if (type === 'start_season') this.sealSeason(args);
    const res = def.kind === 'rules' ? this.runRules(def, args, m) : this.runWorld(def, args, m);
    if (!res.ok) return finish(422, rejected(type, actionId, this.version, res.reason, res.source, [{ id: res.source === 'rules' ? 'engine_guards' : 'world', source: res.source, reason: res.reason, message: res.message || T.reasonText(res.reason) }]), false, res.reason);
    if (def.mutates !== false) this.version++;
    return finish(200, { ok: true, actionId, type, version: this.version, result: res.result || {} }, true);
  }

  /**
   * Protocol ftf-seed/1: fixes the season from the room's committed entropy and the player's nonce (and beacon).
   * Runs once, right before start_season is applied; the provisional season generated at creation is replaced when
   * the nonce changes the seed. Fixed-seed and legacy sessions ignore the nonce.
   */
  sealSeason(args = {}) {
    const e = this.entropy;
    if (e.protocol !== SEED_PROTOCOL || e.sealed || this.state.phase !== 'intro') return;
    const nonce = args.nonce == null ? '' : String(args.nonce);
    const beacon = args.beacon == null ? null : String(args.beacon);
    const seedHex = deriveSeed(e.roomEntropy, nonce, beacon);
    if (seedHex !== e.seedHex) {
      const { state, fx } = createSeason({ rules: this.rules, seedHex, randomBytes: this.randomBytes });
      this.state = state;
      this.emitFx(fx);
    }
    Object.assign(e, { nonce, beacon, seedHex, sealed: true, sealedAtSim: this.simNow() });
    this.emit('season.sealed', 'all', { merkleRoot: this.state.root, seasonId: this.state.seasonId, entropyCommitment: e.commitment, nonce, beacon });
  }

  /** What viewers learn about the season entropy: the commitment always, the room's bytes only once the season has ended. */
  entropyView() {
    const e = this.entropy;
    if (e.protocol !== SEED_PROTOCOL) return e.protocol === 'fixed-seed' ? { protocol: 'fixed-seed', seedHex: e.seedHex, sealed: true } : { protocol: 'none', sealed: true };
    const ended = this.state.phase === 'end';
    return { protocol: e.protocol, commitment: e.commitment, nonce: e.nonce, beacon: e.beacon, sealed: e.sealed, seedHex: ended ? e.seedHex : null, roomEntropy: ended ? e.roomEntropy : null };
  }

  /** Remembers every shard (last snapshot) and, for a shard Iris just created, the first sign its vision opened. */
  recordShards(S, visionsBefore = S.visions, shardsBefore = new Set()) {
    for (const sh of S.shards) {
      if (sh.from === 0 && !shardsBefore.has(sh.id) && !this.shardMeta.has(sh.id)) {
        const opened = S.visions.filter((i) => !visionsBefore.includes(i)).sort((a, b) => S.events[a].pub - S.events[b].pub || a - b);
        this.shardMeta.set(sh.id, opened.length ? { index: opened[0], leaf: S.events[opened[0]].leaf, opened } : null);
      }
      this.shardLog.set(sh.id, { ...sh, bids: sh.bids.map((b) => ({ ...b })), mem: sh.mem ? { kind: sh.mem.kind, w: sh.mem.w, text: sh.mem.text, about: sh.mem.about ?? null } : null, vals: undefined });
    }
  }

  runRules(def, args, m) {
    const a = this.resolveArgs(def, args, m);
    if (!a) return { ok: false, source: 'world', reason: 'unknown_logogram' };
    const S = this.state;
    const pre = digest(S);
    const visionsBefore = S.visions.slice(), shardsBefore = new Set(S.shards.map((x) => x.id));
    const { r, fx } = withState(S, (E) => { const r = ENGINE_CALLS[def.type](E, a); return { r, fx: E.takeFx() }; });
    if (!r || !r.ok) return { ok: false, source: 'rules', reason: (r && r.reason) || 'rejected' };
    this.recordShards(S, visionsBefore, shardsBefore);
    this.deriveEvents(pre, digest(S), S);
    this.emitFx(fx);
    return { ok: true, result: { engine: def.engine, tick: S.tick, phase: S.phase } };
  }

  runWorld(def, args, m) {
    switch (def.type) {
      case 'move': return this.doMove(m, args);
      case 'inspect': return this.doInspect(m, args.target);
      case 'talk': return this.doTalk(m, args.clan);
      case 'enter_shell': {
        m.avatar.zone = 'shell'; m.avatar.shell = args.shell; m.avatar.pos = W.SHELL_ENTRANCE.slice();
        this.emit('world.zone_changed', 'all', { playerId: m.playerId, zone: 'shell', shell: args.shell, position: m.avatar.pos });
        return { ok: true, result: { zone: 'shell', shell: args.shell, position: m.avatar.pos } };
      }
      case 'exit_shell': {
        const shell = m.avatar.shell; const spot = W.placePosition('anchor_zone:' + shell).position;
        m.avatar.zone = 'island'; m.avatar.shell = null; m.avatar.pos = spot;
        this.emit('world.zone_changed', 'all', { playerId: m.playerId, zone: 'island', shell: null, position: spot, from: shell });
        return { ok: true, result: { zone: 'island', position: spot } };
      }
      case 'assemble_logogram': return this.doAssemble(m, args);
      default: return { ok: false, source: 'world', reason: 'unknown_action' };
    }
  }

  doMove(m, args) {
    const av = m.avatar, zone = av.zone;
    let waypoints, to = null;
    if (args.to) {
      const place = W.placePosition(args.to);
      if (!place) return { ok: false, source: 'world', reason: 'unknown_place' };
      if (place.zone !== zone) return { ok: false, source: 'world', reason: 'wrong_zone', message: zone === 'shell' ? 'leave the Shell first (exit_shell)' : 'enter a Shell first (enter_shell)' };
      to = args.to;
      waypoints = zone === 'island' ? W.planRoute(av.pos, args.to) : [[place.position[0], place.position[2]]];
      if (!waypoints) return { ok: false, source: 'world', reason: 'path_blocked' };
    } else waypoints = args.path;
    const sim = W.simulateWalk(worldFor(zone), av.pos, waypoints);
    if (!sim.ok) return { ok: false, source: 'world', reason: sim.code, message: `walk rejected (${sim.code})${sim.at ? ' near ' + JSON.stringify(sim.at) : ''}` };
    const start = this.simNow();
    av.transit = { start, seconds: sim.seconds, trail: sim.trail, end: sim.end, to: to || 'waypoints' };
    this.emit('world.move_started', 'all', { playerId: m.playerId, zone, from: av.pos, to: to || 'waypoints', arriveAt: r3(start + sim.seconds), seconds: sim.seconds, length: sim.length });
    if (sim.seconds === 0) this.advance();
    return { ok: true, result: { to: to || 'waypoints', waypoints, seconds: sim.seconds, length: sim.length, arriveAt: r3(start + sim.seconds), destination: sim.end } };
  }

  discover(m, clue) {
    if (m.clues.has(clue.id)) return null;
    m.clues.set(clue.id, clue);
    this.emit('world.discovery', m.playerId, clue);
    return clue;
  }

  doInspect(m, target) {
    const S = this.state, isC = m.role === 'controller';
    const fresh = [];
    let description, details = {};
    if (target === 'scroll_table') {
      const inScroll = S.frag.filter((f) => f.st === 'scroll').length;
      description = T.t('inspect.scroll', { inScroll, revealed: S.chron.length });
      details = { fragments: S.frag.map((f) => ({ clan: W.CLAN_IDS[f.owner], status: f.st })) };
      for (const c of S.chron) {
        const mo = meaningObj(c.m);
        const clue = this.discover(m, { id: 'chronicle:' + c.t, kind: 'chronicle', tick: c.t, index: c.idx, forms: c.forms, dots: c.dots, meaning: mo, text: T.t('clue.chronicle', { tick: c.t, place: ['I', 'II', 'III', 'IV'][c.m[0]], action: MEANING_NAMES[1][c.m[1]], power: mo.power, delay: mo.delay }) });
        if (clue) fresh.push(clue);
      }
    } else if (target === 'guest_glass') {
      const vis = S.events.map((e, i) => this.visibleProphecy(m, i) && { i, ...this.visibleProphecy(m, i) }).filter(Boolean);
      description = T.t('inspect.glass', { count: vis.length });
      for (const v of vis) {
        const clue = this.discover(m, { id: 'prophecy:' + v.i, kind: 'prophecy', index: v.i, publishedAt: v.e.pub, forms: v.e.forms, dots: v.e.dots, vision: v.vision, text: T.t(v.vision ? 'clue.vision' : 'clue.prophecy', { index: v.i, pub: v.e.pub }) });
        if (clue) fresh.push(clue);
      }
      details = { shell: m.avatar.shell, signs: vis.map((v) => ({ index: v.i, publishedAt: v.e.pub, forms: v.e.forms, dots: v.e.dots, vision: v.vision })) };
    } else if (target === 'shard_pedestal') {
      const open = S.shards.filter((s) => !s.done);
      description = T.t('inspect.pedestal', { open: open.length });
      details = isC ? { auctions: open.map((s) => ({ auctionId: s.id, from: W.CLAN_IDS[s.from], title: T.shardTitle(s.title), closesAtTick: s.exp })) } : { openAuctions: open.length };
    } else if (target.startsWith('anchor_zone:')) {
      const shell = Number(target.slice(12));
      const mine = isC ? S.anchors.filter((a) => a.c === 0 && a.place === shell - 1).map((a) => ({ shell, tick: a.t, placedAt: a.at })) : [];
      description = T.t('inspect.anchorZone', { shell: ['I', 'II', 'III', 'IV'][shell - 1], count: mine.length });
      details = { shell, yourAnchors: mine };
    } else if (target.startsWith('camp:')) {
      const id = target.slice(5), i = CLAN_INDEX[id];
      const linked = i === 0 ? 'self' : (withState(S, (E) => E.isBroken(0, i)) ? 'broken' : 'speaking');
      description = T.t('inspect.camp', { who: W.CLAN_NAMES[i], fragment: S.frag[i].st, link: linked });
      details = { clan: id, fragment: S.frag[i].st, link: linked, isolated: !!S.isolated[i], ...(isC && i !== 0 ? { trustInIris: Math.round(S.T[i][0]) } : {}) };
    }
    return { ok: true, result: { target, description, details, newClues: fresh } };
  }

  doTalk(m, clanId) {
    const S = this.state, i = CLAN_INDEX[clanId], who = W.CLAN_NAMES[i];
    const lines = [];
    const say = (key, args = {}, extra = {}) => lines.push({ speakerId: clanId, speaker: who, key, args, text: T.t(key, { who, ...args }), ...extra });
    const broken = withState(S, (E) => E.isBroken(0, i));
    if (m.role !== 'controller') say('dialogue.helper');
    else if (broken) say('dialogue.refuse');
    else if (S.isolated[i]) say('dialogue.isolated');
    else {
      const tr = S.T[i][0];
      say(tr >= 60 ? 'dialogue.greet.warm' : tr < 35 ? 'dialogue.greet.cold' : 'dialogue.greet.neutral');
      const pm = S.mem.find((x) => x.kind === 'promise' && x.about === i);
      if (pm) say('dialogue.promise', { tick: pm.data.by });
      const mine = S.offers.filter((o) => o.from === i);
      if (!mine.length) say('dialogue.noOffers');
      for (const o of mine) { const txt = T.offerText(o); lines.push({ speakerId: clanId, speaker: who, key: txt.key, args: txt.args, text: txt.text, offerId: o.id, respondWith: [{ type: 'accept_offer', args: { offerId: o.id } }, { type: 'decline_offer', args: { offerId: o.id } }] }); }
    }
    this.emit('world.dialogue', m.playerId, { clan: clanId, lines });
    return { ok: true, result: { clan: clanId, lines } };
  }

  doAssemble(m, args) {
    const v = this.visibleProphecy(m, args.prophecy);
    if (!v) return { ok: false, source: 'world', reason: 'not_visible' };
    const S = this.state;
    const out = withState(S, (E) => {
      const V = E.dictVotes();
      const offset = args.offset ?? E.readGlyph(v.e.forms, v.e.dots, V).r;
      const slots = args.slots.map((meaning, s) => {
        const form = v.e.forms[(offset + s) % 4], k = s + '_' + form, pin = S.pins[k], g = E.guess(s, form, V);
        const contradiction = pin ? pin.m !== meaning : (S.no[k] || []).includes(meaning);
        return { slot: s, form, meaning, meaningName: MEANING_NAMES[s][meaning], dictionary: { known: pin ? pin.m : null, guess: g.m, confidence: Math.round(g.conf * 100) / 100 }, contradiction };
      });
      return { offset, slots };
    });
    const tick = v.e.pub + args.slots[3] + 1;
    const id = 'logo-' + ++m.logoSeq;
    const draft = { id, prophecy: args.prophecy, offset: out.offset, slots: out.slots, impliedAnchor: { shell: args.slots[0] + 1, tick }, anchorable: tick >= S.tick && tick <= 17, contradictions: out.slots.filter((x) => x.contradiction).length };
    m.logograms.set(id, draft);
    if (m.logograms.size > 20) m.logograms.delete(m.logograms.keys().next().value);
    this.emit('world.logogram_assembled', m.playerId, draft);
    return { ok: true, result: draft };
  }

  /* ---------- reads ---------- */

  memberView(m, now) {
    const tr = m.avatar.transit;
    return { playerId: m.playerId, name: m.name, role: m.role, zone: m.avatar.zone, shell: m.avatar.shell, position: this.avatarPos(m, now), walking: tr ? { to: tr.to, arriveAt: r3(tr.start + tr.seconds) } : null };
  }

  sessionInfo() { return { id: this.id, label: this.label, rules: this.rules, worldRules: this.worldRules, timeScale: this.timeScale, clientChoseSeed: this.clientSeed, testSession: true, realMoney: false }; }

  observe(playerId) {
    const m = this.members.get(playerId);
    if (!m) return null;
    this.advance();
    this.lastActivityMs = this.clock();
    const now = this.simNow();
    const you = { ...this.memberView(m, now), place: W.campAt(this.avatarPos(m, now)) ? 'camp:' + W.campAt(this.avatarPos(m, now)) : null };
    return project(this.state, m, {
      session: this.sessionInfo(),
      entropy: this.entropyView(),
      shardLog: [...this.shardLog.values()],
      shardMeta: this.shardMeta,
      version: this.version,
      simTime: now,
      you,
      members: [...this.members.values()].map((x) => this.memberView(x, now)),
      clues: [...m.clues.values()],
      logograms: [...m.logograms.values()],
      availableActions: this.availableActions(playerId, { onlyAvailable: true }),
    });
  }

  /** Candidate argument sets per action type for this member, from what the member can see. */
  candidates(m, def) {
    const S = this.state, isC = m.role === 'controller';
    const visible = S.events.map((_, i) => (this.visibleProphecy(m, i) ? i : -1)).filter((i) => i >= 0);
    switch (def.type) {
      case 'start_season': case 'speak_key': case 'contribute_fragment': case 'end_tick': case 'exit_shell': return [{}];
      case 'set_reading_rule': return ['unknown', 'top', 'dots'].filter((r) => r !== S.rule).map((rule) => ({ rule }));
      case 'place_anchor': {
        if (!isC) return [];
        const seen = new Set(), out = [];
        withState(S, (E) => { const V = E.dictVotes(); for (const i of visible) { const e = S.events[i], rd = E.readGlyph(e.forms, e.dots, V); const a = { shell: rd.sl[0].m + 1, tick: Math.min(17, e.pub + rd.sl[3].m + 1) }; const k = a.shell + ':' + a.tick; if (!seen.has(k)) { seen.add(k); out.push(a); } } });
        for (const d of m.logograms.values()) out.push({ logogram: d.id });
        return out;
      }
      case 'ask_guests': {
        const out = [];
        for (let s = 0; s < 4; s++) for (let f = 0; f < 4; f++) { const k = s + '_' + f; if (S.pins[k]) continue; const no = S.no[k] || []; const meaning = [0, 1, 2, 3].find((x) => !no.includes(x)); out.push({ slot: s, form: f, meaning }); }
        return out;
      }
      case 'sacrifice_memory': {
        const out = S.mem.map((x) => ({ memoryId: x.id, purpose: 'vision' }));
        if (S.isolated[2] && !S.pepelKeyKnown) for (const x of S.mem) if (x.w >= 3) out.push({ memoryId: x.id, purpose: 'key' });
        return out;
      }
      case 'mend': return withState(S, (E) => [1, 2, 3, 4, 5].filter((j) => E.isBroken(0, j)).map((j) => ({ clan: W.CLAN_IDS[j] })));
      case 'mediate': return S.broken.map((k) => k.split('-').map(Number)).filter(([a, b]) => a !== 0 && b !== 0).map(([a, b]) => ({ clanA: W.CLAN_IDS[a], clanB: W.CLAN_IDS[b] }));
      case 'accept_offer': case 'decline_offer': return S.offers.map((o) => ({ offerId: o.id }));
      case 'bid_shard': return S.shards.filter((s) => !s.done && s.from !== 0).map((s) => ({ auctionId: s.id }));
      case 'cast_vote': return [{ accept: true }, { accept: false }];
      case 'set_heir': return [{ heir: true }, { heir: false }];
      case 'move': return (m.avatar.zone === 'shell' ? ['shell_entrance', 'guest_glass'] : W.placeNames().filter((p) => W.placePosition(p).zone === 'island' && p !== 'plaza')).map((to) => ({ to }));
      case 'inspect': return (m.avatar.zone === 'shell' ? ['guest_glass'] : ['scroll_table', 'shard_pedestal', 'anchor_zone:1', 'anchor_zone:2', 'anchor_zone:3', 'anchor_zone:4', ...W.CLAN_IDS.map((c) => 'camp:' + c)]).map((target) => ({ target }));
      case 'talk': return W.CLAN_IDS.slice(1).map((clan) => ({ clan }));
      case 'enter_shell': return [1, 2, 3, 4].map((shell) => ({ shell }));
      case 'assemble_logogram': {
        if (!isC) return [];
        return withState(S, (E) => { const V = E.dictVotes(); return visible.map((i) => { const e = S.events[i], rd = E.readGlyph(e.forms, e.dots, V); return { prophecy: i, slots: rd.sl.map((x) => x.m) }; }); });
      }
      default: return [];
    }
  }

  /**
   * Every action this member could try now, with the preconditions and engine guards that fail.
   * Engine guards are evaluated by a dry run of the real engine action on a copy of the state.
   */
  availableActions(playerId, { onlyAvailable = false } = {}) {
    const m = this.members.get(playerId);
    if (!m) return [];
    this.advance();
    const now = this.simNow();
    const out = [];
    for (const def of ACTIONS) {
      if (def.status !== 'implemented' || !def.roles.includes(m.role)) continue;
      const cands = this.candidates(m, def);
      for (const args of cands) {
        const failed = this.preconditionFailures(m, def, args, now);
        if (def.kind === 'rules' && def.type !== 'start_season') {
          const a = this.resolveArgs(def, args, m);
          if (a) { const r = dryRun(this.state, (E) => ENGINE_CALLS[def.type](E, a)); if (!r.ok) failed.push({ id: 'engine_guards', source: 'rules', reason: r.reason, message: T.reasonText(r.reason) }); }
        }
        const available = failed.length === 0;
        if (onlyAvailable && !available) continue;
        out.push(onlyAvailable ? { type: def.type, args } : { type: def.type, args, available, failed });
      }
    }
    return out;
  }

  /** Auditable history: own commands in full; other players' commands without private details. */
  historyFor(playerId) {
    const viewer = this.members.get(playerId);
    if (!viewer) return [];
    return this.history.map((h) => {
      if (h.playerId === playerId) return { ...h };
      const pub = PUBLIC_WORLD_TYPES.has(h.type);
      return { n: h.n, simTime: h.simTime, tick: h.tick, playerId: h.playerId, role: h.role, kind: h.kind, type: pub ? h.type : null, ok: h.ok, args: pub && h.type === 'move' && h.args.to ? { to: h.args.to } : null };
    });
  }

  /** Merkle proof for a revealed event (public after its reveal). Null if not revealed. */
  proof(index) {
    const S = this.state;
    if (!S.chron.some((c) => c.idx === index)) return null;
    const e = S.events[index];
    return withState(S, (E) => ({
      index, tick: e.t, seasonId: S.seasonId ?? null, schema: S.seasonId ? 'ftf:leaf:v2|seasonId|index|canonicalEvent|salt' : 'baseline: sha256(canonicalEvent + salt)',
      canonicalEvent: JSON.stringify({ t: e.t, place: e.place, action: e.action, power: e.power, delay: e.delay, dots: e.dots }),
      salt: e.salt, leaf: e.leaf, path: E.proofFor(S.levels, index), root: S.root, verified: E.verifyProof(e.leaf, E.proofFor(S.levels, index), S.root),
    }));
  }
}

function err(code, message, extra = {}) { return { ok: false, error: { code, message, ...extra } }; }
function rejected(type, actionId, version, reason, source, failed) {
  return { ok: false, actionId, type, version, error: { code: 'action_rejected', reason, source, message: failed[0].message || T.reasonText(reason), failed } };
}

export { RULES_VERSIONS, DEFAULT_RULES };
