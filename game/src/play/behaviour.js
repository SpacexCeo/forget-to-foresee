// Clan minds made legible. Each clan has a temperament (how it moves when nothing happens) and
// reacts to what the room's observation says about it: trust in Iris, a broken link, isolation,
// an open offer, world tension, its fragment, and recent public events. The result is a cue for
// the 3D agent: which animation clip, where to stand on the plateau, where to face, how fast to
// move and which mind-glyph to show above it. Pure data in, pure data out; never a rule.

/** API clan id ↔ layout/asset id (src/scenes/layout.js CLANS, agent_<asset>.glb). */
export const CLAN_ASSET = Object.freeze({ iris: 'iris', salt: 'sol', ash: 'pepel', moss: 'moh', amber: 'yantar', frost: 'iney' });
export const CLAN_ORDER = Object.freeze(['iris', 'salt', 'ash', 'moss', 'amber', 'frost']);

/** The animation contract's clip names (docs/art/animation-contract.md). */
export const CLIPS = Object.freeze(['idle', 'walk', 'talk', 'think', 'gesture_offer', 'celebrate', 'defeat']);

/**
 * Temperaments (docs/decisions.md §2): Salt lies about words, Ash is paranoid, Moss is honest,
 * Amber is greedy, Frost is a scholar. `restClip` is what the clan does when nothing happens;
 * `fidget` drives the procedural layer (glances, pacing, sway); `approach` scales how far a
 * trusting clan steps toward its bridge.
 */
export const TEMPERAMENT = Object.freeze({
  salt: { restClip: 'idle', fidget: 'glance', tempo: 1.15, approach: 1.2, lean: 0.06 },
  ash: { restClip: 'idle', fidget: 'pace', tempo: 1.25, approach: 0.5, lean: -0.04 },
  moss: { restClip: 'idle', fidget: 'breathe', tempo: 0.8, approach: 1.0, lean: 0.0 },
  amber: { restClip: 'gesture_offer', fidget: 'count', tempo: 1.0, approach: 1.4, lean: 0.05 },
  frost: { restClip: 'think', fidget: 'study', tempo: 0.9, approach: 0.8, lean: 0.08 },
  iris: { restClip: 'idle', fidget: 'breathe', tempo: 1.0, approach: 0, lean: 0 },
});

/** How long (seconds) a reaction to a public event stays on the agent. */
export const REACTION_SECONDS = Object.freeze({ celebrate: 4, defeat: 5, talk: 6 });

/**
 * Cue for one clan.
 * @param {string} clan API clan id (not iris)
 * @param {object} obs controller observation
 * @param {{reaction?: {clip:string, until:number}, now?: number, talking?: boolean, irisNear?: boolean}} [o]
 * @returns {{clan, state, clip, approach, face, tempo, glyph, trust, mood}}
 */
export function clanCue(clan, obs, { reaction = null, now = 0, talking = false, irisNear = false } = {}) {
  const T = TEMPERAMENT[clan] || TEMPERAMENT.moss;
  const rel = ((obs.relationships && obs.relationships.clans) || []).find((c) => c.clan === clan) || null;
  const tension = obs.season ? obs.season.tension : 0;
  const offer = (obs.offers || []).some((o) => o.from === clan);
  const trust = rel ? rel.trustInIris : 50;
  const cue = { clan, state: 'rest', clip: T.restClip, approach: 0, face: 'plaza', tempo: T.tempo, glyph: null, trust, mood: 'neutral' };

  if (rel && rel.isolated) Object.assign(cue, { state: 'isolated', clip: 'defeat', approach: -1.6, face: 'away', glyph: 'isolated', mood: 'hostile', tempo: T.tempo * 1.3 });
  else if (rel && rel.linkBroken) Object.assign(cue, { state: 'broken', clip: 'defeat', approach: -1.0, face: 'away', glyph: 'broken', mood: 'hostile' });
  else if (talking) Object.assign(cue, { state: 'talk', clip: 'talk', approach: 0.6 * T.approach, face: 'iris', glyph: offer ? 'offer' : null, mood: trust >= 60 ? 'warm' : trust < 35 ? 'cold' : 'neutral' });
  else if (offer) Object.assign(cue, { state: 'offer', clip: 'gesture_offer', approach: 1.6 * T.approach, face: irisNear ? 'iris' : 'plaza', glyph: 'offer', mood: 'eager' });
  else if (trust >= 60) Object.assign(cue, { state: 'warm', approach: 1.0 * T.approach, face: irisNear ? 'iris' : 'plaza', glyph: 'warm', mood: 'warm' });
  else if (trust < 35) Object.assign(cue, { state: 'cold', approach: -0.6, face: irisNear ? 'away' : 'plaza', glyph: 'cold', mood: 'cold' });
  else if (irisNear) cue.face = 'iris';

  // World tension makes every clan restless; Ash most of all (paranoid).
  if (tension >= 40 && cue.state !== 'talk') cue.tempo *= clan === 'ash' ? 1.5 : 1.15;
  if (tension >= 70 && clan === 'ash' && cue.state === 'rest') Object.assign(cue, { clip: 'think', mood: 'uneasy' });

  // A fresh public event overrides the pose for a few seconds (celebrate a contribution, slump at a break).
  if (reaction && reaction.until > now && !(cue.state === 'isolated' && reaction.clip === 'celebrate')) cue.clip = reaction.clip;

  if (rel && rel.fragment === 'scroll' && !cue.glyph) cue.glyph = 'given';
  if (rel && rel.fragment === 'dark' && !cue.glyph) cue.glyph = 'dark';
  return cue;
}

/**
 * Turns public room events into short reactions per clan: {clan: {clip, until}}.
 * @param {object} ev a view event (room.viewEvent) @param {number} now seconds (client clock)
 */
export function reactionsFor(ev, now) {
  const out = {};
  const d = ev.data || {};
  const set = (clan, clip) => { if (clan && clan !== 'iris') out[clan] = { clip, until: now + (REACTION_SECONDS[clip] || 4) }; };
  if (ev.type === 'scroll.fragment_changed') {
    if (d.to === 'scroll') set(d.clan, 'celebrate');
    if (d.to === 'dark') set(d.clan, 'defeat');
  } else if (ev.type === 'relationships.link_changed') {
    set(d.a, d.broken ? 'defeat' : 'celebrate');
    set(d.b, d.broken ? 'defeat' : 'celebrate');
  } else if (ev.type === 'fx' && d.fx) {
    const f = d.fx;
    if (f.type === 'crisis') set('ash', 'defeat');
    if (f.type === 'key_spoken') set('ash', 'celebrate');
    if (f.type === 'pact' || f.type === 'escrow') set(CLAN_ORDER[f.with], 'celebrate');
  }
  return out;
}

/** Finds a clip for a contract name in a glTF animation list ("idle", "agent_moh|idle", "Idle.001"…). */
export function findClip(clips, name) {
  if (!clips || !clips.length) return null;
  const want = name.toLowerCase();
  const norm = (n) => String(n || '').toLowerCase().replace(/[.\d]+$/, '').split(/[|:/]/).pop().trim();
  return clips.find((c) => norm(c.name) === want) || clips.find((c) => String(c.name || '').toLowerCase().includes(want)) || null;
}

/** Fallback chain when a clip is missing: a related clip, else idle, else none (procedural only). */
export const CLIP_FALLBACK = Object.freeze({ gesture_offer: ['talk', 'idle'], celebrate: ['gesture_offer', 'idle'], defeat: ['think', 'idle'], think: ['idle'], talk: ['gesture_offer', 'idle'], walk: ['idle'], idle: [] });

export function resolveClip(clips, name) {
  const direct = findClip(clips, name);
  if (direct) return { clip: direct, name };
  for (const alt of CLIP_FALLBACK[name] || ['idle']) { const c = findClip(clips, alt); if (c) return { clip: c, name: alt }; }
  return { clip: null, name: null };
}

/* ---------- a living island: idle life, look-at, purposeful errands (docs/npcs.md) ---------- */

/** Small seeded PRNG (xmur3 + mulberry32): the same seed gives the same life, two seeds never sync. */
export function seededRng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (let i = 0; i < String(seed).length; i++) { h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0 || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Idle-life micro-actions by temperament: which gestures a clan reaches for when nothing happens. */
export const IDLE_GESTURES = Object.freeze({
  salt: ['talk', 'think'], ash: ['think', 'think', 'talk'], moss: ['think', 'gesture_offer'], amber: ['gesture_offer', 'talk'], frost: ['think', 'think', 'gesture_offer'], iris: ['think'],
});

/**
 * Seeded scheduler of idle variations for one agent: glances (a head turn), weight shifts (a lean to
 * one foot) and short gestures (a clip for a couple of seconds), with randomized gaps scaled by the
 * temperament's tempo. `update(now, canGesture)` returns the action in progress or {kind: 'none'}; the
 * director passes `canGesture = false` to stagger gestures so no two agents start one together.
 */
export class IdleLife {
  constructor({ seed = 'life', clan = 'moss', tempo = 1, gapMin = 4, gapMax = 12 } = {}) {
    this.rng = seededRng(seed + ':' + clan);
    this.clan = clan; this.tempo = tempo; this.gapMin = gapMin; this.gapMax = gapMax;
    this.gestures = IDLE_GESTURES[clan] || ['think'];
    this.nextAt = 1 + this.rng() * 7; // a seeded first offset so the agents never start in step
    this.current = { kind: 'none', until: 0 };
    this.count = 0;
  }

  update(now, canGesture = true) {
    if (this.current.kind !== 'none' && now < this.current.until) return this.current;
    if (this.current.kind !== 'none') { this.current = { kind: 'none', until: 0 }; this.nextAt = now + (this.gapMin + this.rng() * (this.gapMax - this.gapMin)) / this.tempo; }
    if (now < this.nextAt) return this.current;
    const r = this.rng();
    let kind = r < 0.45 ? 'glance' : r < 0.8 ? 'shift' : 'gesture';
    if (kind === 'gesture' && !canGesture) kind = 'shift';
    this.count++;
    if (kind === 'glance') this.current = { kind, yaw: (this.rng() - 0.5) * 1.6, pitch: (this.rng() - 0.6) * 0.3, until: now + 1.2 + this.rng() * 1.2 };
    else if (kind === 'shift') this.current = { kind, side: this.rng() < 0.5 ? -1 : 1, until: now + 2.5 + this.rng() * 2 };
    else this.current = { kind, clip: this.gestures[Math.floor(this.rng() * this.gestures.length)], until: now + 1.8 + this.rng() * 1 };
    this.current.startedAt = now;
    return this.current;
  }
}

const DEG = Math.PI / 180;
export const LOOK_LIMITS = Object.freeze({ maxYaw: 70 * DEG, maxPitch: 30 * DEG, fadeYaw: 110 * DEG, eyeHeight: 1.55 });

/**
 * Head look-at angles toward a world point, relative to the body's facing: yaw (positive = to the
 * agent's left) and pitch (positive = up), clamped to the limits, with a weight that fades to zero as
 * the target passes behind the agent (no head snapping round the back). Pure.
 * @returns {{yaw:number, pitch:number, weight:number}}
 */
export function lookAtAngles(rootPos, rootYaw, target, limits = LOOK_LIMITS) {
  const dx = target[0] - rootPos[0], dz = target[2] - rootPos[2];
  const dy = (target[1] ?? limits.eyeHeight) - (rootPos[1] + limits.eyeHeight);
  const flat = Math.hypot(dx, dz);
  if (flat < 1e-6 && Math.abs(dy) < 1e-6) return { yaw: 0, pitch: 0, weight: 0 };
  const rel = Math.atan2(Math.sin(Math.atan2(dx, dz) - rootYaw), Math.cos(Math.atan2(dx, dz) - rootYaw));
  const pitch = Math.atan2(dy, Math.max(flat, 0.3));
  const a = Math.abs(rel);
  const weight = a <= limits.maxYaw ? 1 : a >= limits.fadeYaw ? 0 : 1 - (a - limits.maxYaw) / (limits.fadeYaw - limits.maxYaw);
  const clamp = (v, m) => Math.max(-m, Math.min(m, v));
  return { yaw: clamp(rel, limits.maxYaw), pitch: clamp(pitch, limits.maxPitch), weight };
}

/** Public lines the agents may re-speak as a conversation beat (keys exist in src/locales/*.js). */
const BEAT = {
  silk: (from, to) => ({ speakerId: from, key: 'line.walk.silk', args: { to: { $agentId: to } } }),
  mend: (from, to) => ({ speakerId: from, key: 'line.mend', args: { other: { $agentId: to } } }),
  fragment: (from) => ({ speakerId: from, key: 'line.fragment', args: {} }),
  pact: (from) => ({ speakerId: from, key: 'line.pact', args: {} }),
  escrow: () => ({ speakerId: 'amber', key: 'line.escrow', args: {} }),
};

const ERRAND = Object.freeze({ hold: 3.5, auctionHold: 14, bidHold: 8, meetHold: 7, talkBeat: 2.4, meetDistance: 2.4, waitCap: 60 });

/**
 * The director: turns what the room shows (observation diffs, public events) into purposeful goals per
 * clan, as a small deterministic state machine. Presentation only: it never changes what the engine
 * decided, it only sends the agents where the engine says they acted.
 *
 * Goals: {kind:'errand', place, act, hold, say} walk to a named place (world-map place names), act there
 * for `hold` seconds, walk home; {kind:'meet', partner, role, say} visitor walks to the host's camp, both
 * face each other and talk in turns, then the visitor walks home; {kind:'gather'} stand on the plaza ring
 * facing the Scroll for the vote. The agents report `arrived(clan, now)`; `directive(clan, now)` is what
 * they follow this frame.
 */
export class NpcDirector {
  constructor({ seed = 'ftf', now = 0, clans = CLAN_ORDER.filter((c) => c !== 'iris') } = {}) {
    this.seed = seed; this.clans = clans;
    this.rng = seededRng(seed + ':director');
    this.s = new Map(clans.map((c) => [c, { queue: [], goal: null, phase: 'idle', until: 0, arrived: false, life: new IdleLife({ seed, clan: c, tempo: (TEMPERAMENT[c] || TEMPERAMENT.moss).tempo }) }]));
    this.prev = null;
    this.seenAuctions = new Set(); this.seenBids = new Set();
    this.sky = { shell: 0, until: 0 };
    this.lastGestureAt = -10;
    this.gathered = false;
    this.events = [];
    void now;
  }

  state(clan) { return this.s.get(clan); }

  /** Queues a goal (at most two waiting; duplicates of the same place and act are dropped). */
  push(clan, goal) {
    const st = this.s.get(clan);
    if (!st || clan === 'iris') return false;
    if (st.goal && st.goal.kind === goal.kind && st.goal.place === goal.place && st.goal.partner === goal.partner) return false;
    if (st.queue.some((g) => g.kind === goal.kind && g.place === goal.place && g.partner === goal.partner)) return false;
    if (st.queue.length >= 2) st.queue.shift();
    st.queue.push(goal);
    this.events.push({ clan, goal: goal.kind, place: goal.place || goal.partner || null });
    return true;
  }

  errand(clan, place, act = 'gesture_offer', hold = ERRAND.hold, say = null) { return this.push(clan, { kind: 'errand', place, act, hold, say }); }

  /** Two clans meet: the visitor walks to the host's camp; both talk in turns. */
  meet(visitor, host, say = null) {
    if (visitor === host || visitor === 'iris' || host === 'iris') return false;
    const ok = this.push(visitor, { kind: 'meet', partner: host, role: 'visitor', say });
    if (ok) this.push(host, { kind: 'meet', partner: visitor, role: 'host', say: null });
    return ok;
  }

  clear(clan) { const st = this.s.get(clan); if (st) { st.queue = []; st.goal = null; st.phase = 'idle'; st.arrived = false; } }

  /** A public room event (optional fast path; the observation diff below covers the same ground). */
  onEvent(ev, now) {
    const d = ev.data || {}, f = d.fx;
    if (ev.type === 'fx' && f) {
      if (f.type === 'event') this.sky = { shell: (f.place ?? 0) + 1, until: now + 4 };
      if (f.type === 'fragment' && f.i > 0) this.errand(CLAN_ORDER[f.i], 'scroll', 'gesture_offer', ERRAND.hold, BEAT.fragment(CLAN_ORDER[f.i]));
      if (f.type === 'walk' && f.from > 0 && f.to > 0) this.meet(CLAN_ORDER[f.from], CLAN_ORDER[f.to], BEAT.silk(CLAN_ORDER[f.from], CLAN_ORDER[f.to]));
      if (f.type === 'walk' && f.from > 0 && f.to === 0) this.errand(CLAN_ORDER[f.from], 'camp:iris', 'gesture_offer', ERRAND.hold, BEAT.silk(CLAN_ORDER[f.from], 'iris'));
      if (f.type === 'pact') this.errand(CLAN_ORDER[f.with], 'scroll', 'gesture_offer', ERRAND.hold, BEAT.pact(CLAN_ORDER[f.with]));
      if (f.type === 'escrow') this.errand('amber', 'shard_pedestal', 'gesture_offer', ERRAND.hold + 1, BEAT.escrow());
      if (f.type === 'crisis') this.clear('ash');
    } else if (ev.type === 'auction.opened' && d.from && d.from !== 'iris') {
      this.seenAuctions.add(d.auctionId);
      this.errand(d.from, 'shard_pedestal', 'gesture_offer', ERRAND.auctionHold);
    } else if (ev.type === 'relationships.link_changed' && d.broken === false) this.meet(d.a, d.b, BEAT.mend(d.a, d.b));
    else if (ev.type === 'season.phase_changed' && d.to === 'vote') this.gather();
  }

  gather() { if (this.gathered) return; this.gathered = true; for (const c of this.clans) { this.clear(c); this.push(c, { kind: 'gather', place: 'gather' }); } }

  /** Observation diff → goals (the same inferences as the events, from public state only). */
  observe(obs, now) {
    if (!obs) return;
    const p = this.prev; this.prev = obs;
    const clansOf = (o) => ((o && o.relationships && o.relationships.clans) || []);
    if (obs.season && obs.season.phase === 'vote') this.gather();
    for (const a of obs.auctions || []) {
      if (!a.open || !a.from || a.from === 'iris') continue;
      if (!this.seenAuctions.has(a.id)) { this.seenAuctions.add(a.id); this.errand(a.from, 'shard_pedestal', 'gesture_offer', ERRAND.auctionHold); }
      if (a.topBid && a.topBid.clan && a.topBid.clan !== 'iris' && a.topBid.clan !== a.from && !this.seenBids.has(a.id + ':' + a.topBid.clan)) { this.seenBids.add(a.id + ':' + a.topBid.clan); this.errand(a.topBid.clan, 'shard_pedestal', 'think', ERRAND.bidHold); }
    }
    if (!p) return;
    const before = new Map(clansOf(p).map((c) => [c.clan, c])), after = clansOf(obs);
    const silkDown = [], silkUp = [];
    for (const c of after) {
      const b = before.get(c.clan); if (!b) continue;
      if (b.fragment !== 'scroll' && c.fragment === 'scroll') this.errand(c.clan, 'scroll', 'gesture_offer', ERRAND.hold, BEAT.fragment(c.clan));
      if (b.fragment !== 'dark' && c.fragment === 'dark') this.clear(c.clan);
      if (b.linkBroken && !c.linkBroken && !c.isolated) this.errand(c.clan, 'camp:iris', 'talk', ERRAND.hold, BEAT.mend(c.clan, 'iris'));
      if (typeof c.silk === 'number' && typeof b.silk === 'number') { const dS = c.silk - b.silk; if (dS < 0) silkDown.push([c.clan, -dS]); else if (dS > 0) silkUp.push([c.clan, dS]); }
    }
    // A silk transfer between two clans shows as one clan losing what another gained: they meet.
    for (const [from, amount] of silkDown) { const to = silkUp.find(([, a]) => a === amount); if (to) this.meet(from, to[0], BEAT.silk(from, to[0])); }
    // Mended links between clans (relationships.edges carries {a, b, broken}).
    const edgeKey = (e) => [e.a, e.b].sort().join('-');
    const brokenBefore = new Set(((p.relationships && p.relationships.edges) || []).filter((e) => e.broken).map(edgeKey));
    for (const e of (obs.relationships && obs.relationships.edges) || []) if (!e.broken && brokenBefore.has(edgeKey(e)) && e.a !== 'iris' && e.b !== 'iris') this.meet(e.a, e.b, BEAT.mend(e.a, e.b));
    void now;
  }

  /** The agent reached its current destination (or its partner). */
  arrived(clan, now) {
    const st = this.s.get(clan); if (!st || !st.goal) return;
    const g = st.goal;
    if (st.phase === 'go') {
      st.arrived = true;
      if (g.kind === 'errand') { st.phase = 'act'; st.until = now + g.hold; }
      else if (g.kind === 'gather') { st.phase = 'act'; st.until = Infinity; }
      else if (g.kind === 'meet') {
        const other = this.s.get(g.partner);
        if (other && other.goal && other.goal.kind === 'meet' && other.goal.partner === clan && other.arrived) {
          // Both are there: the visitor speaks first, turns every talkBeat seconds, for meetHold seconds.
          for (const [c, s] of [[clan, st], [g.partner, other]]) { s.phase = 'act'; s.until = now + ERRAND.meetHold; s.talkStart = now; void c; }
        } else { st.phase = 'wait'; st.until = now + ERRAND.waitCap; } // the partner is still on its way (see directive)
      }
    } else if (st.phase === 'return') { st.goal = null; st.phase = 'idle'; st.arrived = false; }
  }

  /**
   * What the clan does this frame: {move, act, face, partner, say, look, speaking}.
   * move: a place name, 'gather', 'home' or null; act: a clip or null; face: 'partner'|'scroll'|null.
   */
  directive(clan, now) {
    const st = this.s.get(clan);
    if (!st) return { move: null, act: null, face: null, partner: null, say: null, look: null };
    if (!st.goal && st.queue.length) { st.goal = st.queue.shift(); st.phase = 'go'; st.arrived = false; st.said = false; }
    const g = st.goal;
    const look = this.sky.until > now ? 'sky:' + this.sky.shell : null;
    if (!g) return { move: null, act: null, face: null, partner: null, say: null, look, idle: st.life.update(now, now - this.lastGestureAt > 0.7) };
    if (st.phase === 'wait') {
      // Wait while the partner still means to come (a matching goal, active or queued); give up otherwise or at the cap.
      const other = g.kind === 'meet' ? this.s.get(g.partner) : null;
      const coming = !!other && ((other.goal && other.goal.kind === 'meet' && other.goal.partner === clan) || other.queue.some((q) => q.kind === 'meet' && q.partner === clan));
      if (now > st.until || !coming) st.phase = 'return';
    }
    if (st.phase === 'act' && now > st.until) {
      if (g.kind === 'gather') return { move: null, act: null, face: 'scroll', partner: null, say: null, look };
      st.phase = 'return'; st.arrived = false;
      // The host of a meeting stays home (it is home already); the visitor walks back.
      if (g.kind === 'meet' && g.role === 'host') { st.goal = null; st.phase = 'idle'; return this.directive(clan, now); }
    }
    const partner = g.kind === 'meet' ? g.partner : null;
    if (st.phase === 'go') {
      const move = g.kind === 'errand' ? g.place : g.kind === 'gather' ? 'gather' : g.role === 'visitor' ? 'camp:' + g.partner : 'edge';
      return { move, act: null, face: null, partner, say: null, look };
    }
    if (st.phase === 'wait') return { move: null, act: 'idle', face: partner ? 'partner' : null, partner, say: null, look };
    if (st.phase === 'act') {
      let act = g.act || null, say = null, speaking = false;
      if (g.kind === 'meet') {
        // Alternate speakers: visitor, host, visitor...
        const beat = Math.floor((now - st.talkStart) / ERRAND.talkBeat);
        speaking = (beat % 2 === 0) === (g.role === 'visitor');
        act = speaking ? 'talk' : 'idle';
      }
      if (!st.said && g.say && (g.kind !== 'meet' || g.role === 'visitor')) { st.said = true; say = g.say; }
      if (g.kind === 'gather') return { move: null, act: null, face: 'scroll', partner: null, say: null, look };
      return { move: null, act, face: g.kind === 'meet' ? 'partner' : g.place === 'scroll' ? 'scroll' : null, partner, say, look, speaking };
    }
    // return
    return { move: 'home', act: null, face: null, partner: null, say: null, look };
  }

  /** Records a gesture start so other agents hold theirs for a moment (never in sync). */
  gestureStarted(now) { this.lastGestureAt = now; }
}
