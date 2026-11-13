// A small timeline runner for the prologue: wall-clock time (performance.now, so a capture's virtual clock drives it),
// cues fired once and in order, skippable (a skip snaps to the end within SKIP_S), deterministic for a given clock.
import { PROLOGUE_S, SKIP_S, CUES, cuesBetween, reducedTime, REDUCED_S } from './shots.js';

/**
 * @param {{duration?: number, cues?: object[], reduced?: boolean, now?: () => number, onCue?: (c: object) => void}} o
 * @returns {{tick(): {t: number, done: boolean, skipping: boolean, k: number}, skip(): void, readonly skipped: boolean}}
 *   tick() returns the film time t (seconds on the full film's clock), whether it ended, and k: 0..1 through the skip.
 */
export function createTimeline({ duration = PROLOGUE_S, cues = CUES, reduced = false, now = () => globalThis.performance.now(), onCue = () => {} } = {}) {
  const start = now(); let last = -1, skipAt = null, skipFrom = 0, skipped = false, done = false;
  const total = reduced && duration === PROLOGUE_S ? REDUCED_S : duration;
  const map = (w) => (reduced && duration === PROLOGUE_S ? reducedTime(w) : w);
  return {
    get skipped() { return skipped; },
    skip() { if (skipAt == null && !done) { skipAt = now(); skipFrom = Math.min(total, (skipAt - start) / 1000); skipped = true; } },
    tick() {
      const w = (now() - start) / 1000;
      let t, k = 0;
      if (skipAt != null) { k = Math.min(1, (now() - skipAt) / 1000 / SKIP_S); t = map(skipFrom) + (duration - map(skipFrom)) * k; done = k >= 1; } else { t = map(Math.min(total, w)); done = w >= total; }
      for (const c of cuesBetween(last, t, cues)) { if (skipAt == null || !c.text) onCue(c); } // a skip fires the silent cues only
      last = t;
      return { t, done, skipping: skipAt != null, k };
    },
  };
}
