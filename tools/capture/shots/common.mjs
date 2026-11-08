// Shared world coordinates and helpers for the shot scripts, taken from game/src/scenes/layout.js (metres;
// +Y up; the default game camera sits on +Z looking toward −Z, so Moss's camp is in the foreground).
export const PLAZA = [0, 0, 0];
export const GLYPH = [0, 9, 0];                       // the floating glyph over the plaza
export const CAMP = {                                  // camp centres on the 30 m ring
  iris: [0, 0, -30], sol: [-25.98, 0, -15], pepel: [-25.98, 0, 15], moh: [0, 0, 30], yantar: [25.98, 0, 15], iney: [25.98, 0, -15],
};
export const SHELL = {                                 // pivot = the Shell's bottom; bodies are ~18 m tall, radius ~10
  1: [36.77, 14, 36.77], 2: [-35.36, 22, 35.36], 3: [-38.18, 17, -38.18], 4: [35.36, 25, -35.36],
};
export const SHELL_MID = Object.fromEntries(Object.entries(SHELL).map(([k, [x, y, z]]) => [k, [x, y + 8, z]]));
export const BALCONY = [-23, 0, 39.84];
export const SPAWN = [-22.31, 0, 38.64];
export const ANCHOR = { 1: [4.67, 0, 4.67], 2: [-4.67, 0, 4.67], 3: [-4.67, 0, -4.67], 4: [4.67, 0, -4.67] };
// The Shell interior lives at [0, 300, 0]; the real interior's sockets (scenes/shell.js REAL).
export const INTERIOR = { origin: [0, 300, 0], spawn: [0, 301.2, 11.3], glass: [0, 303.95, -10.75], guests: [[-4.4, 299.7, -15.75], [0.4, 299.7, -17.95], [4.6, 299.7, -15.35]] };

export const JUDGE_URL = { play: 'direct', demo: 'judge' };
/** The README judge table's own URL: the walking play. */
export const WALK_URL = { play: 'direct', demo: 'judge', mode: 'walk' };
/** The page's label for a segment: which URL a judge opens to see the same thing. */
export const segmentLabel = (text, from = 0, to = 4.5) => ({ kind: 'word', text, position: 'high', from, to, fadeIn: 0.5, fadeOut: 0.6, small: true });
export const BEAUTY_HIDE = ['labels', 'nameplates', 'marker'];

/** A fade from black at the start and/or to black at the end of a shot. */
export const fadeIn = (dur = 1.0) => ({ kind: 'black', from: -1, to: dur, fadeIn: 0, fadeOut: dur });
export const fadeOut = (shotDuration, dur = 1.0) => ({ kind: 'black', from: shotDuration - dur, to: shotDuration + 1, fadeIn: dur, fadeOut: 0 });

/**
 * The judge-season opening replayed with rendering off, following the README judge table for the Shell hub
 * (08.11, Task I, first loop 73d4e72): Iris pre-fills Delay so the first stake lands on trial 3, where the first Gift of
 * every season lands; F stakes as is.
 */
export const SETUP = {
  /** Inside Shell I at trial 1, Iris's reading pointing at trial 3, 10 silk staked on Shell I, trial 3. */
  stakedInShellI: [
    { do: 'fly', shell: 1 }, { do: 'until', pred: 'inShell', max: 400 }, { do: 'until', pred: 'hubIdle', max: 200 },
    { do: 'frames', n: 9 },
    { do: 'key', code: 'KeyF' }, { do: 'until', pred: 'hubIdle', max: 300 },
  ],
  /** ...then left the Shell: trial 2 on the island, a new sign waiting in Shell I. */
  trial2: [
    { do: 'key', code: 'KeyT' }, { do: 'until', pred: 'onIsland', max: 400 }, { do: 'until', pred: 'hubIdle', max: 400 }, { do: 'frames', n: 20 },
  ],
  /** ...then let trial 2 pass: trial 3 stops on Moss's loan card. */
  trial3card: [
    { do: 'key', code: 'KeyT' }, { do: 'until', pred: 'cardOpen', max: 600 }, { do: 'frames', n: 10 },
  ],
  /** ...declined the loan: trial 3 ends, the Gift falls on Shell II, the reveal is verified, trial 4 stops on the new signs. */
  trial4: [
    { do: 'card', choice: 'decline' }, { do: 'until', pred: 'trial', value: 4, max: 600 }, { do: 'until', pred: 'hubIdle', max: 400 }, { do: 'frames', n: 20 },
  ],
  /** ...then forgot "The Shells' Call" for a vision (two future signs) and closed the panel. */
  forgot: [
    { do: 'key', code: 'KeyM' }, { do: 'frames', n: 4 }, { do: 'forget', index: 1 }, { do: 'frames', n: 12 }, { do: 'key', code: 'Escape' }, { do: 'frames', n: 6 },
  ],
};

/** The walking judge path (README table, `?demo=judge&mode=walk`), replayed with rendering off. */
export const WALK = {
  /** Iris at Shell I's pad on the plaza rim, 10 silk staked on trial 3 through the pad's E option. */
  staked: [
    // on the pad's outer side: inside the zone (2.1 m of the pad), outside the Scroll's reach (4.8 m of the centre), clear of the anchor's collider
    { do: 'teleport', pos: [5.55, 0, 5.55], heading: -Math.PI * 0.75 }, { do: 'frames', n: 12 }, { do: 'until', pred: 'spot', value: 'anchor', max: 60 },
    { do: 'key', code: 'KeyE' }, { do: 'until', pred: 'anchored', max: 300 }, { do: 'frames', n: 10 },
  ],
  /** Three trials ended (T twice each: the second press confirms): trial 4, the reveal verified, silk 72. */
  trial4: [
    { do: 'key', code: 'KeyT' }, { do: 'frames', n: 30 }, { do: 'key', code: 'KeyT' }, { do: 'until', pred: 'trial', value: 2, max: 300 }, { do: 'frames', n: 30 },
    { do: 'key', code: 'KeyT' }, { do: 'frames', n: 30 }, { do: 'key', code: 'KeyT' }, { do: 'until', pred: 'trial', value: 3, max: 300 }, { do: 'frames', n: 30 },
    { do: 'key', code: 'KeyT' }, { do: 'frames', n: 30 }, { do: 'key', code: 'KeyT' }, { do: 'until', pred: 'trial', value: 4, max: 300 }, { do: 'frames', n: 40 },
  ],
  /** Signs & Visions open on the Resolved tab: "Verified ✓". */
  resolved: [
    { do: 'key', code: 'KeyV' }, { do: 'frames', n: 20 }, { do: 'click', selector: '.wh-signs__chip[data-filter="resolved"]' }, { do: 'frames', n: 20 },
  ],
};
