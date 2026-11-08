// Chapter films (owner idea 08.11: "films between chapters", so that anyone from 12 to 95 understands the
// story). This module is the pure half: the chapter model of a season, when a film is due (both play
// modes, deterministic per seed), a ledger of what actually happened (built from the per-viewer
// observation and the room's events the player already sees, never from hidden state) and the film
// scripts themselves: a list of shots with a camera, a calm narrator line and a cue, plus a final card
// "What matters now". The scripts are plain data; `src/cinematic/chapters/` performs them in the 3D
// client. Presentation only: nothing here evaluates or changes a rule, and every fact in a line comes
// from the observation, so a film can never contradict the engine.
import { CAMPS, ANCHOR_ZONES, SCROLL_TABLE } from '../scenes/layout.js';
import { CLAN_ASSET, CLAN_ORDER } from './behaviour.js';

/** Chapters of a season by trial; the ending film plays once the outcome is known. */
export const CHAPTERS = Object.freeze([
  Object.freeze({ id: 'arrival', number: 1, from: 1, to: 4 }),
  Object.freeze({ id: 'language', number: 2, from: 5, to: 8 }),
  Object.freeze({ id: 'trust', number: 3, from: 9, to: 12 }),
  Object.freeze({ id: 'crisis', number: 4, from: 13, to: 13 }),
  Object.freeze({ id: 'vote', number: 5, from: 14, to: 17 }),
  Object.freeze({ id: 'ending', number: 6, from: null, to: null }),
]);
export const CHAPTER_IDS = Object.freeze(CHAPTERS.map((c) => c.id));
export const OUTCOMES = Object.freeze(['gift', 'weapon', 'lost', 'survived', 'gone', 'proof_failed']);
export const ROMAN = Object.freeze(['I', 'II', 'III', 'IV', 'V', 'VI']);
/** Storage key: chapters seen per season (`ftf.chapters.v1`). */
export const CHAPTERS_KEY = 'ftf.chapters.v1';

/** Real seconds per shot; a film is 5 shots plus the title and the final card (20–40 s). */
export const SHOT_SECONDS = 6;
export const TITLE_SECONDS = 2.6;
export const CARD_SECONDS = 4.5;
/** Hold a key or a finger this long to skip a film (not an accidental tap). */
export const SKIP_HOLD_MS = 700;

const clanIndex = (clan) => CLAN_ORDER.indexOf(clan);
const clanOf = (i) => CLAN_ORDER[i] || null;
const roman = (n) => ({ key: 'shell.' + ((n || 1) - 1), args: {} });
const agent = (clan) => ({ $agentId: clan });
const actionName = (a) => ({ key: 'meaning.1.' + (a || 0), args: {} });

/** The chapter the season is in: 'ending' once the outcome is known, else by trial; null in the intro. */
export function chapterFor(obs) {
  if (!obs || !obs.season) return null;
  const s = obs.season;
  if (s.phase === 'end' || s.outcome) return 'ending';
  if (s.phase === 'intro') return null;
  const t = s.tick;
  for (const c of CHAPTERS) if (c.from != null && t >= c.from && t <= c.to) return c.id;
  return t > 17 ? 'vote' : null;
}

/** The film due now: the current chapter when it has not been shown in this season, else null. */
export function dueFilm(obs, seen = new Set()) {
  const id = chapterFor(obs);
  return id && !seen.has(id) ? id : null;
}

/** Chapters already passed without their film (listed in the Chronicle as "skipped", still watchable). */
export function missedFilms(obs, seen = new Set()) {
  const cur = chapterFor(obs);
  if (!cur) return [];
  const idx = CHAPTER_IDS.indexOf(cur);
  return CHAPTER_IDS.filter((id, i) => i < idx && !seen.has(id));
}

/** A stable key for the season: its public commitment (the season id is drawn fresh per room), so "seen" survives a reload of the same seed. */
export function seasonKey(obs) {
  const s = obs && obs.season;
  return s ? String((s.merkleRoot || '').slice(0, 16) || s.seasonId || 'season') : 'season';
}

/**
 * What happened in this season, as the player saw it. Fed the same observations and events the HUD gets
 * (`observe(obs)`, `event(ev)`, `command(type, args, ok)`); deterministic for the same sequence.
 */
export class SeasonLedger {
  constructor() {
    this.tick = 0;
    this.reveals = [];        // {tick, shell, action, power, verified}
    this.anchors = new Map(); // 'shell@tick' → {shell, tick, placedAt, outcome: null|'gift'|'storm'|'silence'|'call'|'missed'}
    this.offers = new Map();  // id → {id, from, kind, tick, answer: null|'accepted'|'declined'}
    this.betrayals = [];      // {clan, tick}
    this.repaid = [];         // {clan, tick}
    this.gifts = [];          // {clan, tick}
    this.pacts = [];          // {clan, tick}
    this.burns = [];          // {kind, about, purpose, tick}
    this.shards = [];         // {winner, tick}
    this.links = [];          // {a, b, broken, tick}
    this.contributions = [];  // {clan, tick}
    this.dark = [];           // {clan, tick}
    this.crisisTick = null;
    this.keySpoken = false;
    this.outcome = null;
  }

  observe(obs) {
    if (!obs || !obs.season) return;
    this.tick = obs.season.tick;
    for (const a of (obs.iris && obs.iris.anchors) || []) {
      const k = a.shell + '@' + a.tick;
      if (!this.anchors.has(k)) this.anchors.set(k, { shell: a.shell, tick: a.tick, placedAt: a.placedAt, outcome: null });
    }
    for (const o of obs.offers || []) if (!this.offers.has(o.id)) this.offers.set(o.id, { id: o.id, from: o.from, kind: o.kind, tick: this.tick, answer: null });
    if (obs.season.outcome) this.outcome = obs.season.outcome;
  }

  /** A view event from the room (PlaySession 'event'). */
  event(ev) {
    if (!ev) return;
    const d = ev.data || {};
    const tick = ev.tick ?? this.tick;
    if (ev.type === 'fx' && d.fx) {
      const f = d.fx;
      switch (f.type) {
        // reveals come from the public 'season.event_revealed' event below (it carries the exact trial)
        case 'anchor': { const k = (f.place + 1) + '@' + f.t; if (!this.anchors.has(k)) this.anchors.set(k, { shell: f.place + 1, tick: f.t, placedAt: tick, outcome: null }); break; }
        case 'walk':
          if (f.kind === 'silk' && f.to === 0 && f.from > 0) this.repaid.push({ clan: clanOf(f.from), tick });
          if (f.kind === 'gift' && f.to === 0) this.gifts.push({ clan: clanOf(f.from), tick });
          if (f.kind === 'shard' && f.from === 0) this.shards.push({ winner: clanOf(f.to), tick });
          break;
        case 'break': this.links.push({ a: clanOf(f.i), b: clanOf(f.j), broken: true, tick }); break;
        case 'mend': this.links.push({ a: clanOf(f.i), b: clanOf(f.j), broken: false, tick }); break;
        case 'crisis': this.crisisTick = tick; break;
        case 'key_spoken': this.keySpoken = true; break;
        case 'memory_burned': this.burns.push({ kind: f.kind, about: f.about != null ? clanOf(f.about) : null, purpose: f.purpose, tick }); break;
        case 'pact': this.pacts.push({ clan: clanOf(f.with), tick }); break;
        case 'fragment': this.contributions.push({ clan: clanOf(f.i), tick }); break;
        case 'dark': this.dark.push({ clan: clanOf(f.i), tick }); break;
        case 'end': this.outcome = f.outcome; break;
        default: break;
      }
    } else if (ev.type === 'season.event_revealed' && d.meaning) {
      const shell = d.meaning.place, action = String(d.meaning.action || 'gift');
      this.reveals.push({ tick: d.tick, shell, action, power: d.meaning.power, verified: d.proofVerified !== false });
      // a stake on a trial that had no sign (trials 1–2) is simply returned: it counts as missed here
      for (const a of this.anchors.values()) if (a.tick <= d.tick && a.outcome == null) a.outcome = a.tick === d.tick && a.shell === shell ? action : 'missed';
    } else if (ev.type === 'iris.memory_added' && d.kind === 'betrayal' && d.about) {
      this.betrayals.push({ clan: d.about, tick });
    } else if (ev.type === 'auction.closed' && d.winner) {
      if (!this.shards.some((s) => s.tick === tick && s.winner === d.winner)) this.shards.push({ winner: d.winner, tick });
    }
  }

  /** The player's own answers to offers (PlaySession 'result': type, args, ok). */
  command(type, args = {}, ok = true) {
    if (!ok) return;
    const o = this.offers.get(args.offerId);
    if (o && type === 'accept_offer') o.answer = 'accepted';
    if (o && type === 'decline_offer') o.answer = 'declined';
  }

  /** Stakes that paid: a Gift revealed at the anchored Shell and trial. */
  wins() { return [...this.anchors.values()].filter((a) => a.outcome === 'gift').length; }
  /** Broken links among the five AI clans right now, from the observation's edges. */
  static brokenAmongClans(obs) {
    return (((obs.relationships || {}).edges) || []).filter((e) => e.broken && e.a !== 'iris' && e.b !== 'iris');
  }
}

/* ------------------------------------------------------------------------------------------------ */
/* Camera framing (pure data; the player resolves 'iris' and 'interior' shots at runtime)            */

const campPos = (clan) => { const c = CAMPS.find((x) => x.id === CLAN_ASSET[clan]); return c ? c.position : [0, 0, 0]; };
const pose = (pos, look, fov) => ({ pos: pos.slice(), look: look.slice(), fov });
const path = (from, to) => ({ kind: 'path', from, to });

/** The whole archipelago from high on the camera side, a slow crane down and in. */
export function camWide() { return path(pose([30, 60, 104], [0, 5, 0], 34), pose([9, 46, 82], [0, 8, -4], 34)); }
/** A levitating Shell seen from the plaza side, dolly toward it. */
export function camShell(n) {
  const z = ANCHOR_ZONES[(n || 1) - 1];
  const [sx, sy, sz] = z.shellPosition;
  // from the plaza side, swung 50 degrees around the Shell so its spiral reads in three quarters, dolly in
  const a = Math.atan2(sz, sx) + Math.PI + 0.87;
  const at = (d, h) => [sx + Math.cos(a) * d, sy + h, sz + Math.sin(a) * d];
  const look = [sx, sy + 5.5, sz];
  return path(pose(at(44, 13), look, 34), pose(at(30, 9.5), look, 34));
}
/** A camp from over its bridge, slightly off axis, dolly in. */
export function camCamp(clan) {
  const c = campPos(clan);
  const a = Math.atan2(c[2], c[0]) - 0.32;
  const at = (d, h) => [c[0] - Math.cos(a) * d, h, c[2] - Math.sin(a) * d];
  return path(pose(at(14, 5.8), [c[0], 1.6, c[2]], 38), pose(at(9.5, 4.3), [c[0], 1.9, c[2]], 38));
}
/** The anchor zone of Shell n with the Shell itself rising behind it. */
export function camAnchor(n) {
  const z = ANCHOR_ZONES[(n || 1) - 1];
  const [zx, , zz] = z.position, [sx, sy, sz] = z.shellPosition;
  const l = Math.hypot(zx, zz) || 1, ux = zx / l, uz = zz / l;
  const look = [zx + (sx - zx) * 0.22, 1 + (sy + 6) * 0.22, zz + (sz - zz) * 0.22];
  return path(pose([zx - ux * 9, 3.8, zz - uz * 9], look, 44), pose([zx - ux * 6.5, 3.2, zz - uz * 6.5], look, 44));
}
/** The Scroll medallion on the plaza. */
export function camScroll() {
  const [x, , z] = SCROLL_TABLE.position;
  return path(pose([x + 7, 6.5, z + 9.5], [x, 0.6, z], 40), pose([x + 4, 4.6, z + 6.2], [x, 0.7, z], 40));
}
/** Looking up from the plaza at the Shells and the sky (tension, the vote). */
export function camSky() { return path(pose([0, 1.8, 7.5], [0, 20, -45], 52), pose([0, 2.3, 6.8], [0, 22, -45], 52)); }
/** Iris herself, from the front and a little to the side (resolved from the avatar at runtime). */
export function camIris() { return { kind: 'iris', dist: 6.5, toDist: 4.3, height: 2.3, yaw: 0.55 }; }
/** Inside Shell n: from the entrance toward the glass where the Guests draw `sign` (runtime). */
export function camInterior(n, sign = null) { return { kind: 'interior', shell: n || 1, sign }; }

/* ------------------------------------------------------------------------------------------------ */
/* Film scripts                                                                                      */

const shot = (id, cam, line, extra = {}) => ({ id, seconds: SHOT_SECONDS, cam, line, cue: null, actors: [], ...extra });
const L = (key, args = {}) => ({ key, args });
const scrollCount = (obs) => (obs.scroll || []).filter((f) => f.status === 'scroll').length;
const rel = (obs, clan) => (((obs.relationships || {}).clans) || []).find((c) => c.clan === clan) || null;

function firstVisibleSign(obs) {
  const p = ((obs.prophecies || []).filter((x) => !x.vision).sort((a, b) => a.publishedAt - b.publishedAt || a.index - b.index))[0];
  return p ? { forms: p.forms, dots: p.dots, shell: p.impliedAnchor ? p.impliedAnchor.shell : 1 } : null;
}
const newestSign = (obs) => { const p = (obs.prophecies || []).slice().sort((a, b) => (b.vision - a.vision) || (b.publishedAt - a.publishedAt))[0]; return p ? { forms: p.forms, dots: p.dots, shell: p.impliedAnchor ? p.impliedAnchor.shell : 1 } : null; };

function arrival({ obs, mode }) {
  const sign = firstVisibleSign(obs);
  return {
    shots: [
      shot('island', camWide(), L('chapter.arrival.1'), { cue: 'guest_call' }),
      shot('shells', camShell(sign ? sign.shell : 2), L('chapter.arrival.2')),
      shot('guests', camInterior(sign ? sign.shell : 2, sign), L('chapter.arrival.3', { sign: sign ? 'yes' : 'no', shell: roman(sign ? sign.shell : 1) })),
      shot('iris', camIris(), L('chapter.arrival.4')),
      shot('scroll', camScroll(), L('chapter.arrival.5')),
    ],
    card: L('chapter.arrival.card', { mode: mode === 'hub' ? 'hub' : 'walk' }),
  };
}

function language({ obs, ledger }) {
  const r = ledger.reveals[0] || null;
  const anchors = [...ledger.anchors.values()];
  const offers = [...ledger.offers.values()];
  const pick = offers.find((o) => o.kind === 'sell' && o.answer === 'accepted') || offers.find((o) => o.kind === 'sell') || offers.find((o) => o.kind === 'gift') || offers.find((o) => o.kind === 'loan') || offers[0] || null;
  const lie = (((obs.dictionary || {}).boughtWords) || []).find((w) => w.exposedAsLie) || null;
  const words = obs.dictionary ? obs.dictionary.confidentCells : 0;
  const sign = newestSign(obs);
  return {
    shots: [
      shot('verified', camAnchor(r ? r.shell : 1), r ? L('chapter.language.1', { verified: r.verified ? 'yes' : 'no', tick: r.tick, action: actionName(['gift', 'storm', 'silence', 'call'].indexOf(r.action)), shell: roman(r.shell) }) : L('chapter.language.1.none'), { cue: r && r.verified ? 'gift_chime' : null }),
      shot('stakes', camIris(), L('chapter.language.2', { n: anchors.length, wins: ledger.wins() })),
      shot('words', camInterior(sign ? sign.shell : 1, sign), L('chapter.language.3', { n: words })),
      shot('offer', camCamp(pick ? pick.from : 'salt'), L('chapter.language.4', { kind: pick ? pick.kind : 'none', who: agent(pick ? pick.from : 'salt'), answer: pick && pick.answer ? pick.answer : 'passed' })),
      shot('lie', camCamp(lie ? lie.from : 'moss'), L('chapter.language.5', { lie: lie ? 'yes' : 'no', who: agent(lie ? lie.from : 'moss') })),
    ],
    card: L('chapter.language.card'),
  };
}

function trust({ obs, ledger }) {
  const clans = ((obs.relationships || {}).clans) || [];
  const byTrust = clans.slice().sort((a, b) => b.trustInIris - a.trustInIris || CLAN_ORDER.indexOf(a.clan) - CLAN_ORDER.indexOf(b.clan));
  const most = byTrust[0] ? byTrust[0].clan : 'moss', least = byTrust[byTrust.length - 1] ? byTrust[byTrust.length - 1].clan : 'ash';
  const betrayal = ledger.betrayals[0] || null, repaid = ledger.repaid[0] || null;
  const first = betrayal ? { kind: 'betrayal', clan: betrayal.clan } : repaid ? { kind: 'repaid', clan: repaid.clan } : { kind: 'none', clan: most };
  const forgotten = (obs.iris && obs.iris.forgotten) || [];
  const f0 = forgotten[0] || null;
  const broken = SeasonLedger.brokenAmongClans(obs);
  const mine = obs.iris && obs.iris.fragment ? obs.iris.fragment.status : 'held';
  return {
    shots: [
      shot('word', camCamp(first.clan), L('chapter.trust.1', { kind: first.kind, who: agent(first.clan) }), { actors: first.kind === 'betrayal' ? [{ clan: first.clan, clip: 'defeat' }] : first.kind === 'repaid' ? [{ clan: first.clan, clip: 'celebrate' }] : [] }),
      shot('trust', camCamp(most), L('chapter.trust.2', { who: agent(most), least: agent(least) })),
      shot('memory', camIris(), L('chapter.trust.3', { n: forgotten.length, text: f0 ? f0.text : '', fate: f0 ? f0.fate || '' : '' }), { cue: f0 ? 'memory_dissolve' : null }),
      shot('links', camSky(), L('chapter.trust.4', { n: broken.length, tension: obs.season.tension })),
      shot('scroll', camScroll(), L('chapter.trust.5', { n: scrollCount(obs), iris: mine })),
    ],
    card: L('chapter.trust.card'),
  };
}

function crisis({ obs, ledger }) {
  const ash = rel(obs, 'ash');
  const cut = (((obs.relationships || {}).edges) || []).filter((e) => e.broken && (e.a === 'ash' || e.b === 'ash')).map((e) => (e.a === 'ash' ? e.b : e.a)).filter((c) => c !== 'iris');
  const iris = obs.iris || {};
  const state = ledger.keySpoken || (ash && !ash.isolated && ledger.crisisTick != null) ? 'spoken' : iris.ashKey && iris.ashKey.known ? 'known' : iris.keyVision && iris.keyVision.open ? 'open' : 'closed';
  const kv = iris.keyVision || { confidentCells: 0, needCells: 8 };
  return {
    shots: [
      shot('storm', camSky(), L('chapter.crisis.1'), { cue: 'storm_crack' }),
      shot('ash', camCamp('ash'), L('chapter.crisis.2', { n: cut.length, who: cut.map(agent) }), { actors: [{ clan: 'ash', clip: 'defeat' }] }),
      shot('tension', camWide(), L('chapter.crisis.3', { tension: obs.season.tension })),
      shot('key', camIris(), L('chapter.crisis.4', { state, need: kv.needCells, have: kv.confidentCells })),
      shot('scroll', camScroll(), L('chapter.crisis.5', { n: scrollCount(obs), deadline: obs.season.contributionDeadline })),
    ],
    card: L('chapter.crisis.card'),
  };
}

function vote({ obs, ledger }) {
  const ash = rel(obs, 'ash');
  const ring = (obs.scroll || []).some((f) => f.status === 'scroll' && f.keySign);
  const ashState = ash && ash.isolated ? 'isolated' : ledger.keySpoken ? 'spoken' : 'back';
  const s = obs.season;
  const left = Math.max(1, s.ticks - s.tick);
  return {
    shots: [
      shot('scroll', camScroll(), L('chapter.vote.1', { n: scrollCount(obs) }), { cue: 'vote_stone' }),
      shot('ring', camInterior(newestSign(obs) ? newestSign(obs).shell : 1, newestSign(obs)), L('chapter.vote.2', { ring: ring ? 'yes' : 'no' })),
      shot('ash', camCamp('ash'), L('chapter.vote.3', { ash: ashState }), { actors: ashState === 'isolated' ? [{ clan: 'ash', clip: 'defeat' }] : [] }),
      shot('iris', camIris(), L('chapter.vote.4', { n: obs.dictionary ? obs.dictionary.confidentCells : 0, m: ((obs.iris || {}).forgotten || []).length })),
      shot('sky', camSky(), L('chapter.vote.5', { left, deadline: s.contributionDeadline })),
    ],
    card: L('chapter.vote.card'),
  };
}

function ending({ obs, ledger }) {
  const s = obs.season;
  const outcome = OUTCOMES.includes(s.outcome) ? s.outcome : 'proof_failed';
  const votes = s.votes || null;
  const yes = votes ? votes.filter((v) => v.accept).map((v) => agent(v.clan)) : [];
  const no = votes ? votes.filter((v) => !v.accept).map((v) => agent(v.clan)) : [];
  const iris = obs.iris || {};
  const forgotten = iris.forgotten || [];
  const kept = (obs.memories || []).length;
  const f0 = forgotten[0] || null;
  const cue = outcome === 'gift' ? 'gift_chime' : outcome === 'weapon' ? 'sting_weapon' : outcome === 'survived' ? 'sting_survived' : outcome === 'gone' ? 'sting_gone' : 'vote_stone';
  const contributed = ledger.contributions.map((c) => c.clan);
  return {
    outcome,
    shots: [
      shot('outcome', outcome === 'gone' ? camSky() : camScroll(), L('chapter.ending.1', { outcome }), { cue, actors: contributed.filter((c) => c !== 'iris').map((clan) => ({ clan, clip: outcome === 'gift' ? 'celebrate' : 'defeat' })) }),
      shot('votes', camWide(), L('chapter.ending.2', { has: votes ? 'yes' : 'no', yes, no })),
      shot('iris', camIris(), L('chapter.ending.3', { silk: iris.silk || 0, kept, forgotten: forgotten.length })),
      shot('shards', camCamp(ledger.shards[0] ? ledger.shards[0].winner : 'salt'), L('chapter.ending.4', { n: forgotten.length, text: f0 ? f0.text : '', fate: f0 ? f0.fate || '' : '' })),
      shot('next', outcome === 'gift' ? camScroll() : camShell(4), L('chapter.ending.5', { outcome })),
    ],
    card: L('chapter.ending.card', { outcome }),
  };
}

const BUILDERS = { arrival, language, trust, crisis, vote, ending };

/**
 * Builds the film of one chapter from what happened so far.
 * @param {string} id chapter id
 * @param {{obs: object, ledger?: SeasonLedger, mode?: 'hub'|'walk', profile?: 'full'|'cheap', reducedMotion?: boolean}} o
 * @returns {{id, number, title: {key, args}, shots: object[], card: {key, args}, seconds: number, outcome?: string}}
 */
export function buildFilm(id, { obs, ledger = new SeasonLedger(), mode = 'hub', profile = 'full', reducedMotion = false }) {
  const chapter = CHAPTERS.find((c) => c.id === id);
  if (!chapter || !obs) throw new Error('unknown chapter: ' + id);
  const built = BUILDERS[id]({ obs, ledger, mode });
  const film = {
    id, number: chapter.number, numeral: ROMAN[chapter.number - 1],
    title: id === 'ending' ? L('chapter.title.ending.' + built.outcome) : L('chapter.title.' + id),
    shots: built.shots, card: built.card, outcome: built.outcome,
    profile, reducedMotion: !!reducedMotion,
  };
  // Cheap shots (phones, the low tier): no camera moves and no interior visit, same story.
  // Reduced motion: no camera moves either; the player cross-fades between still frames.
  if (profile === 'cheap' || reducedMotion) {
    for (const s of film.shots) {
      if (s.cam.kind === 'interior' && profile === 'cheap') s.cam = camShell(s.cam.shell);
      if (s.cam.kind === 'path') s.cam = { kind: 'path', from: s.cam.from, to: s.cam.from, still: true };
      if (s.cam.kind === 'iris') s.cam = { ...s.cam, toDist: s.cam.dist, still: true };
      if (s.cam.kind === 'interior') s.cam = { ...s.cam, still: true };
    }
  }
  film.seconds = Math.round(TITLE_SECONDS + film.shots.reduce((a, s) => a + s.seconds, 0) + CARD_SECONDS);
  return film;
}

/**
 * Narrator-line arguments → values for `renderMsg`: arrays become a localized list
 * ("Salt, Moss and Frost"), nothing when empty. Pure; the player passes its i18n.
 */
export function resolveLineArgs(args, i18n, renderArg) {
  const out = {};
  for (const [k, v] of Object.entries(args || {})) {
    if (Array.isArray(v)) {
      const items = v.map((x) => renderArg(x));
      out[k] = items.length === 0 ? i18n.t('chapter.list.none') : items.length === 1 ? items[0] : items.slice(0, -1).join(i18n.t('chapter.list.sep')) + i18n.t('chapter.list.and') + items[items.length - 1];
    } else out[k] = renderArg(v);
  }
  return out;
}

/**
 * Which chapters this season has shown, persisted per season under CHAPTERS_KEY.
 * @param {{getJSON: Function, setJSON: Function}|null} storage
 */
export function createSeenStore(storage, key) {
  const all = (storage && storage.getJSON(CHAPTERS_KEY)) || {};
  const seen = new Set(Array.isArray(all[key]) ? all[key] : []);
  return {
    seen,
    has: (id) => seen.has(id),
    add(id) {
      if (seen.has(id)) return;
      seen.add(id);
      if (!storage) return;
      const cur = storage.getJSON(CHAPTERS_KEY) || {};
      cur[key] = [...seen];
      // keep the store small: the eight most recent seasons
      const keys = Object.keys(cur);
      for (const k of keys.slice(0, Math.max(0, keys.length - 8))) delete cur[k];
      storage.setJSON(CHAPTERS_KEY, cur);
    },
    reset() { seen.clear(); if (storage) { const cur = storage.getJSON(CHAPTERS_KEY) || {}; delete cur[key]; storage.setJSON(CHAPTERS_KEY, cur); } },
  };
}

/**
 * The chapter director: decides when a film is due, builds it from the ledger and remembers what was
 * shown. No DOM and no three.js: the cinematic player (src/cinematic/chapters/player.js) performs the
 * films; node tests drive the director with a headless season.
 */
export function createChapterDirector({ obs = null, storage = null, mode = 'hub', profile = () => 'full', reducedMotion = () => false, enabled = true } = {}) {
  const ledger = new SeasonLedger();
  let store = null, last = null;
  const films = new Map(); // id → the film as it was shown (replays tell the same story)
  const ensure = (o) => { if (!store) store = createSeenStore(storage, seasonKey(o)); return store; };
  if (obs) { ledger.observe(obs); last = obs; ensure(obs); }
  return {
    ledger,
    get films() { return films; },
    /** Feed every observation. Returns the id of a film that became due, or null. */
    observe(o) {
      if (!o) return null;
      ledger.observe(o); last = o; ensure(o);
      return enabled ? dueFilm(o, store.seen) : null;
    },
    event: (ev) => ledger.event(ev),
    command: (type, args, ok) => ledger.command(type, args, ok),
    /** The film due now (not yet shown), or null. */
    due: () => (enabled && last ? dueFilm(last, ensure(last).seen) : null),
    current: () => (last ? chapterFor(last) : null),
    /** Builds (or returns the stored) film for a chapter. `fresh` rebuilds from the ledger now. */
    build(id, { fresh = false } = {}) {
      if (!last) return null;
      if (!fresh && films.has(id)) return films.get(id);
      const film = buildFilm(id, { obs: last, ledger, mode, profile: profile(), reducedMotion: reducedMotion() });
      films.set(id, film);
      return film;
    },
    /** Marks a chapter as shown this season. */
    markSeen(id) { if (last) ensure(last).add(id); },
    seen: () => (last ? [...ensure(last).seen] : []),
    missed: () => (last ? missedFilms(last, ensure(last).seen) : []),
    /** Chronicle rows: every chapter with its state for the replay menu. */
    rows() {
      const cur = last ? chapterFor(last) : null;
      const curIdx = cur ? CHAPTER_IDS.indexOf(cur) : -1;
      return CHAPTERS.map((c, i) => {
        const seen = last ? ensure(last).has(c.id) : false;
        const state = seen ? 'seen' : i === curIdx ? 'now' : i < curIdx ? 'missed' : 'later';
        return { id: c.id, number: c.number, numeral: ROMAN[i], state, watchable: state !== 'later' };
      });
    },
    reset() { if (store) store.reset(); films.clear(); },
  };
}
