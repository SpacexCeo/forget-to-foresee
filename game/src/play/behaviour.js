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
