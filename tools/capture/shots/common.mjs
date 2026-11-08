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
export const INTERIOR = { origin: [0, 300, 0], spawn: [0, 301.2, 311.3], glass: [0, 303.95, 289.25], guests: [[-4.4, 299.7, 284.25], [0.4, 299.7, 282.05], [4.6, 299.7, 284.65]] };

export const JUDGE_URL = { play: 'direct', demo: 'judge' };
export const BEAUTY_HIDE = ['labels', 'nameplates', 'marker'];

/** A fade from black at the start and/or to black at the end of a shot. */
export const fadeIn = (dur = 1.0) => ({ kind: 'black', from: -1, to: dur, fadeIn: 0, fadeOut: dur });
export const fadeOut = (shotDuration, dur = 1.0) => ({ kind: 'black', from: shotDuration - dur, to: shotDuration + 1, fadeIn: dur, fadeOut: 0 });

/** The judge-season opening replayed with rendering off (see the trace in docs/submission/trailer.md). */
export const SETUP = {
  /** Inside Shell I at trial 1, the human reading set to Shell II / +2, 10 silk staked. */
  stakedInShellI: [
    { do: 'fly', shell: 1 }, { do: 'until', pred: 'inShell', max: 400 }, { do: 'until', pred: 'hubIdle', max: 200 },
    { do: 'frames', n: 6 }, { do: 'slot', k: 0, dir: 1 }, { do: 'slot', k: 3, dir: 1 }, { do: 'frames', n: 3 },
    { do: 'key', code: 'KeyF' }, { do: 'until', pred: 'hubIdle', max: 300 },
  ],
  /** ...then left the Shell: trial 2 on the island, the new sign waiting in Shell I. */
  trial2: [
    { do: 'key', code: 'KeyT' }, { do: 'until', pred: 'onIsland', max: 400 }, { do: 'until', pred: 'hubIdle', max: 400 }, { do: 'frames', n: 20 },
  ],
  /** ...then forgot "The Shells' Call" for a vision (two future signs) and closed the panel. */
  forgot: [
    { do: 'key', code: 'KeyM' }, { do: 'frames', n: 4 }, { do: 'forget', index: 1 }, { do: 'frames', n: 12 }, { do: 'key', code: 'Escape' }, { do: 'frames', n: 6 },
  ],
};
