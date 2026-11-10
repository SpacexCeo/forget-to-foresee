// The "fun layer" (docs/fun-layer.md, owner request 10.11): six presentation pieces over facts the observation
// already holds. The dictionary as a collection that fills up, the moment a word is learned, a streak of right
// readings with an insight score, the picture of a memory as it burns, the case file of bought words ("who lied
// to me?"), and a first-chapter checkpoint after seven trials. Pure logic, tested in Node; the DOM is fun-ui.js.
// Nothing here evaluates or changes a rule: silk, stakes and the season's 17 trials are the engine's alone. The
// streak multiplies insight (a score shown to the player), never silk.
import { glossary } from './reasons.js';

/** Trials in the first chapter: the first event lands on trial 3, so seven trials hold four or five reveals. */
export const CHAPTER_ONE_TRIALS = 7;
export const INSIGHT_PER_HIT = 10;

const sure = (c) => c.kind === 'guests' || c.kind === 'outcome';

/** The 16 dictionary cells, row by row (slot * 4 + form). */
export function dictionaryCells(obs) {
  return glossary(obs).flat();
}

/**
 * How far the whole dictionary is from a blind guess, 0..100: a certain word counts 1, a guess counts by how far
 * its confidence stands above the flat prior of one in four. This is the number that moves every time a sign is
 * revealed, even while no word is certain yet.
 */
export function understanding(obs) {
  const cells = dictionaryCells(obs);
  if (!cells.length) return 0;
  const part = (c) => (sure(c) ? 1 : Math.max(0, Math.min(1, ((c.confidence || 0.25) - 0.25) / 0.75)));
  return Math.round((cells.reduce((a, c) => a + part(c), 0) / cells.length) * 100);
}

/**
 * The question the book offers for a cell that is not certain: Iris's best guess first, never a meaning the
 * Guests already ruled out or one another stroke of the slot already holds. Null for a certain word.
 */
export function askFor(cell) {
  if (!cell || sure(cell)) return null;
  const open = [0, 1, 2, 3].filter((m) => !(cell.excluded || []).includes(m) && !(cell.taken || []).includes(m));
  if (!open.length) return null;
  const first = cell.kind === 'guess' && open.includes(cell.meaning) ? cell.meaning : open[0];
  return { slot: cell.slot, form: cell.form, meaning: first, options: [first, ...open.filter((m) => m !== first)] };
}

/** Words that became certain between two observations: [{slot, form, meaning, source}]. */
export function newWords(prev, obs) {
  if (!prev || !obs || !prev.dictionary || !obs.dictionary) return [];
  const before = new Set(dictionaryCells(prev).filter(sure).map((c) => c.slot + '_' + c.form));
  return dictionaryCells(obs).filter((c) => sure(c) && !before.has(c.slot + '_' + c.form))
    .map((c) => ({ slot: c.slot, form: c.form, meaning: c.meaning, source: c.source }));
}

/**
 * A reading the player staked counts as right when it named the Shell and the trial of the event: the two slots
 * a stake depends on (outcome.js `verdict` = [place, action, power, trial]). Iris's own unstaked reading and a
 * trial without a stake neither extend nor end the streak.
 * @returns {'hit'|'miss'|null}
 */
export function readingResult(report) {
  if (!report || !report.reading || report.reading.who !== 'you' || !report.verdict) return null;
  return report.verdict[0] && report.verdict[3] ? 'hit' : 'miss';
}

/** The streak of right readings and the insight it earns: a hit is worth INSIGHT_PER_HIT times the streak. */
export function createStreak() {
  const s = { streak: 0, best: 0, insight: 0, hits: 0, misses: 0 };
  return {
    get state() { return { ...s }; },
    /** @returns {{result:'hit'|'miss', streak:number, gained:number, ended:number}|null} */
    observe(report) {
      const result = readingResult(report);
      if (!result) return null;
      if (result === 'hit') {
        s.streak++; s.hits++;
        s.best = Math.max(s.best, s.streak);
        const gained = INSIGHT_PER_HIT * s.streak;
        s.insight += gained;
        return { result, streak: s.streak, gained, ended: 0 };
      }
      const ended = s.streak;
      s.streak = 0; s.misses++;
      return { result, streak: 0, gained: 0, ended };
    },
    reset() { s.streak = 0; s.best = 0; s.insight = 0; s.hits = 0; s.misses = 0; },
  };
}

/**
 * The case file: every word Iris bought, who sold it, and where the evidence stands.
 * status: 'lie' (the signs exposed it), 'true' (the dictionary now holds the same meaning for certain),
 * 'open' (nothing has contradicted or confirmed it yet).
 */
export function caseFile(obs) {
  const d = obs && obs.dictionary;
  if (!d) return [];
  return (d.boughtWords || []).map((w) => {
    const cell = (d.cells || []).find((c) => c.slot === w.slot && c.form === w.form);
    const status = w.exposedAsLie ? 'lie' : cell && cell.known != null ? (cell.known === w.meaning ? 'true' : 'lie') : 'open';
    return { from: w.from, slot: w.slot, form: w.form, meaning: w.meaning, status, truth: cell && cell.known != null ? cell.known : null };
  });
}

/** Bought words that turned out to be lies between two observations. */
export function newLies(prev, obs) {
  if (!prev) return [];
  const key = (c) => c.from + ':' + c.slot + '_' + c.form + '=' + c.meaning;
  const before = new Set(caseFile(prev).filter((c) => c.status === 'lie').map(key));
  return caseFile(obs).filter((c) => c.status === 'lie' && !before.has(key(c)));
}

/** The memory Iris gave up between two observations (it left her memories and her forgotten count rose), or null. */
export function forgottenMemory(prev, obs) {
  if (!prev || !obs || !prev.iris || !obs.iris) return null;
  if (((obs.iris.forgotten || []).length) <= ((prev.iris.forgotten || []).length)) return null;
  const left = new Set((obs.memories || []).map((m) => m.id));
  return (prev.memories || []).find((m) => !left.has(m.id)) || null;
}

/** The picture drawn for a memory kind (fun-ui.js memoryPicture). */
export function memoryMotif(kind) {
  return ({ first: 'word', call: 'call', gift: 'gift', betrayal: 'crack', debt: 'knot', promise: 'ring' })[kind] || 'thread';
}

/**
 * The first-chapter checkpoint: shown once, to a first-time player, when trial CHAPTER_ONE_TRIALS + 1 begins.
 * The season itself goes on to 17 trials; the card is a place to stop, with what the player has built so far.
 */
export function chapterOneDue({ tick, phase, firstRun, shown }) {
  return !!firstRun && !shown && phase === 'play' && tick > CHAPTER_ONE_TRIALS;
}

/** The numbers on the checkpoint card. */
export function chapterSummary(obs, streakState) {
  const cells = dictionaryCells(obs);
  return {
    words: cells.filter(sure).length,
    streak: streakState.best,
    insight: streakState.insight,
    silk: obs.iris ? obs.iris.silk : 0,
    verified: (obs.proofs || []).filter((p) => p.verified).length,
    left: Math.max(0, (obs.season.ticks || 17) - obs.season.tick + 1),
  };
}
