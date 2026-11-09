// "Iris thinks this because…": the dictionary cell behind each slot of a reading, classified for the
// glossary on the glass (16 cells: rows = slots Place/Action/Power/Delay, columns = strokes
// arc/spike/loop/drop) and turned into one plain line for the reading card.
// Public data only: obs.dictionary (pins, the Guests' "no"s, Iris's guess, bought words), obs.chronicle
// (revealed signs, already public) and the reading rule. No rule is evaluated here, nothing hidden is
// read, and no information is added: the lines only explain numbers the observation already shows.
// No DOM: node tests drive it (tests/client/reasons.test.mjs).
import { MEANING_NAMES } from '../net/catalog.js';

const ACTIONS = MEANING_NAMES[1];       // ['gift', 'storm', 'silence', 'call']
const POWERS = [10, 20, 40, 80];

/** The projection's English pin sources (net/text.js pinSource) → stable ids. */
const PIN_SOURCE = { 'the Guests': 'guests', Frost: 'frost', 'a shard': 'shard' };

/** A chronicle meaning ({place, action, power, delay}) as the four slot indices, or null. */
export function meaningIndex(m) {
  if (!m) return null;
  const out = [m.place - 1, ACTIONS.indexOf(m.action), POWERS.indexOf(m.power), m.delay - 1];
  return out.every((v) => Number.isInteger(v) && v >= 0 && v <= 3) ? out : null;
}

/** Rotations a revealed sign can be read with under the reading rule (the engine's dictVotes). */
function rotations(rule, dots) {
  if (rule === 'dots') return [dots];
  if (rule === 'top') return [0];
  return [0, 1, 2, 3];
}

/**
 * How often a stroke stood in a slot in the revealed chronicle, by the meaning that slot turned out to
 * have: counts[m] = revealed signs where `form` can be read in `slot` and the slot meant m; `total` =
 * revealed signs where `form` can be read in `slot` at all.
 */
export function sightings(obs, slot, form) {
  const counts = [0, 0, 0, 0];
  let total = 0;
  const rule = (obs && obs.dictionary && obs.dictionary.readingRule) || 'unknown';
  for (const c of (obs && obs.chronicle) || []) {
    const m = meaningIndex(c.meaning);
    if (!m || !c.forms) continue;
    if (!rotations(rule, c.dots).some((r) => c.forms[(r + slot) % 4] === form)) continue;
    total++;
    counts[m[slot]]++;
  }
  return { counts, total };
}

function cellOf(obs, slot, form) {
  const cells = (obs && obs.dictionary && obs.dictionary.cells) || [];
  return cells.find((c) => c.slot === slot && c.form === form) || null;
}

/**
 * One glossary cell. kind:
 *   'guests'  silver: the Guests said yes (or ruled out the three others),
 *   'outcome' gold: a true word from outside the Guests (Frost's word from the chronicle, a memory shard),
 *   'guess'   plain: Iris's guess with its confidence, backed by some evidence,
 *   'unknown' empty: no evidence at all (Iris's guess is the flat prior).
 * @returns {{slot:number, form:number, kind:'guests'|'outcome'|'guess'|'unknown', source:string|null, meaning:number|null,
 *   confidence:number, excluded:number[], taken:number[], seen:number, total:number, bought:{from:string, lie:boolean}|null, lastLeft:boolean}}
 */
export function cellState(obs, slot, form) {
  const c = cellOf(obs, slot, form);
  const base = { slot, form, kind: 'unknown', source: null, meaning: null, confidence: 0, excluded: [], taken: [], seen: 0, total: 0, bought: null, lastLeft: false };
  if (!c) return base;
  const excluded = (c.excluded || []).slice().sort();
  const sg = sightings(obs, slot, form);
  if (c.known != null) {
    const source = PIN_SOURCE[c.source] || 'outcome';
    return { ...base, kind: source === 'guests' ? 'guests' : 'outcome', source, meaning: c.known, confidence: 1, excluded,
      seen: sg.counts[c.known], total: sg.total, lastLeft: source === 'guests' && excluded.length === 3 };
  }
  // meanings other strokes of this slot already hold (the language is a permutation: one meaning per stroke)
  const taken = ((obs.dictionary && obs.dictionary.cells) || [])
    .filter((o) => o.slot === slot && o.form !== form && o.known != null).map((o) => o.known).sort();
  const b = ((obs.dictionary && obs.dictionary.boughtWords) || []).find((w) => w.slot === slot && w.form === form) || null;
  const meaning = c.guess ? c.guess.meaning : 0;
  const evidence = sg.total > 0 || excluded.length > 0 || taken.length > 0 || !!b;
  return { ...base, kind: evidence ? 'guess' : 'unknown', meaning, confidence: c.guess ? c.guess.confidence : 0, excluded, taken,
    seen: sg.counts[meaning], total: sg.total, bought: b ? { from: b.from, meaning: b.meaning, lie: !!b.exposedAsLie } : null };
}

/** The 16 cells as rows of slots, columns of strokes. */
export function glossary(obs) {
  return [0, 1, 2, 3].map((s) => [0, 1, 2, 3].map((f) => cellState(obs, s, f)));
}

/** Words Iris knows for certain (silver + gold). */
export function knownCount(obs) {
  return glossary(obs).flat().filter((c) => c.kind === 'guests' || c.kind === 'outcome').length;
}

/** The stroke a reading uses for slot k (the engine's readGlyph: forms[(offset + k) % 4]), or null. */
export function formForSlot(p, k) {
  if (!p || !p.forms || !p.reading) return null;
  return p.forms[((p.reading.offset || 0) + k) % 4];
}

/** The four cells a sign's reading uses, as "slot_form" keys (outlined in the glossary). */
export function signCells(p) {
  if (!p || !p.reading) return new Set();
  return new Set([0, 1, 2, 3].map((k) => k + '_' + formForSlot(p, k)));
}

const ref = (key) => ({ key, args: {} });
const meaningRef = (slot, m) => ref(`meaning.${slot}.${m}`);

/**
 * One plain line explaining slot k of sign p, as {key, args} (args hold nested message refs).
 * `chosen` is the meaning on the card: when the player changed the slot, the line compares it with
 * what the dictionary says instead.
 * @returns {{key:string, args:object}|null}
 */
export function slotReason(obs, p, k, chosen = null) {
  const form = formForSlot(p, k);
  if (form == null) return null;
  const c = cellState(obs, k, form);
  const args = { form: ref('form.' + form), slot: ref('slot.' + k), meaning: c.meaning != null ? meaningRef(k, c.meaning) : '' };
  if (chosen != null && c.meaning != null && chosen !== c.meaning) {
    const yours = { ...args, meaning: meaningRef(k, chosen) };
    if (c.kind === 'guests' || c.kind === 'outcome') return { key: 'hub.why.yoursKnown', args: { ...yours, known: meaningRef(k, c.meaning) } };
    if (c.excluded.includes(chosen)) return { key: 'hub.why.yoursRuledOut', args: yours };
    if (c.taken.includes(chosen)) return { key: 'hub.why.yoursTaken', args: yours };
    return { key: 'hub.why.yours', args: { ...yours, known: meaningRef(k, c.meaning), confidence: Math.round(c.confidence * 100) } };
  }
  switch (c.kind) {
    case 'guests': return c.lastLeft ? { key: 'hub.why.lastLeft', args } : { key: 'hub.why.guests', args };
    case 'outcome': return { key: c.source === 'shard' ? 'hub.why.shard' : 'hub.why.frost', args };
    case 'guess':
      if (c.bought && !c.bought.lie && c.bought.meaning === c.meaning) return { key: 'hub.why.bought', args: { ...args, who: { $agentId: c.bought.from } } };
      if (c.seen > 0) return { key: 'hub.why.seen', args: { ...args, count: c.seen, total: c.total } };
      if (c.excluded.length || c.taken.length) return { key: 'hub.why.narrowed', args: { ...args, count: 4 - new Set([...c.excluded, ...c.taken]).size } };
      if (c.total > 0) return { key: 'hub.why.unseen', args: { ...args, total: c.total } };
      return { key: 'hub.why.none', args };
    default: return { key: 'hub.why.none', args };
  }
}
