// Town tales (owner 14.11 night: "surprise me: scenes, quests"): small story lines told by townsfolk who give no other
// quests. Pure rules here, the scene in scenes/town-tales.js. Stored under ftf.tales.v1.
//
// "The Ink That Remembers" (flag `tales`): the Scribe's ledger loses words at night. The veilbells beyond the walls
// ring with them; silencing three quiets the bells but brings nothing back. After dark the Sweeper, who sweeps the
// letters that fall off the town's signs, owns up: the Scribe once asked her to sweep away the words of a grief and
// never to tell. Iris brings the jar back and chooses: give the words back, or keep the jar closed.

export const TALES_KEY = 'ftf.tales.v1';
export const INK = Object.freeze({ bells: 3, minLevel: 2, reward: { xp: 150, chest: 'common' } });
/** The stages of the ink tale, in order. */
export const INK_STAGES = Object.freeze(['none', 'bells', 'heard', 'sweeper', 'jar', 'done']);
/** The day-cycle keys (render/daycycle.js) that count as after dark. */
export const DARK_KEYS = Object.freeze(['dusk', 'twilight', 'night']);

export const freshTales = () => ({ v: 1, ink: { stage: 'none', bells: 0, choice: null } });

/** A stored state, cleaned (unknown stages and bad counts reset). */
export function cleanTales(s) {
  const out = freshTales();
  const k = s && s.ink;
  if (k && INK_STAGES.includes(k.stage)) out.ink.stage = k.stage;
  if (k && Number.isInteger(k.bells) && k.bells >= 0) out.ink.bells = Math.min(INK.bells, k.bells);
  if (k && (k.choice === 'return' || k.choice === 'keep')) out.ink.choice = k.choice;
  if (out.ink.stage === 'done' && !out.ink.choice) out.ink.choice = 'keep';
  return out;
}

/** After dark by the day cycle's current key; no cycle (a fixed hour, the jury path) never blocks the tale. */
export const isDark = (key) => key == null || DARK_KEYS.includes(key);

/**
 * One action on the ink tale. Returns {state, events}: events are what the scene shows or grants
 * ('accepted', 'bell' {n}, 'quiet', 'sent', 'jar', 'reward' {choice}). An action that does not fit the stage changes nothing.
 * @param {object} state freshTales() shape @param {{type: string, mob?: string, choice?: string, level?: number, dark?: boolean}} a
 */
export function inkDo(state, a) {
  const s = cleanTales(state), k = s.ink, ev = [];
  switch (a && a.type) {
    case 'ACCEPT': if (k.stage === 'none' && (a.level ?? INK.minLevel) >= INK.minLevel) { k.stage = 'bells'; k.bells = 0; ev.push({ e: 'accepted' }); } break;
    case 'KILL': if (k.stage === 'bells' && a.mob === 'veilbell') { k.bells = Math.min(INK.bells, k.bells + 1); ev.push({ e: 'bell', n: k.bells }); if (k.bells >= INK.bells) { k.stage = 'heard'; ev.push({ e: 'quiet' }); } } break;
    case 'ASK_SWEEPER': if (k.stage === 'heard') { k.stage = 'sweeper'; ev.push({ e: 'sent' }); } break;
    case 'TAKE_JAR': if (k.stage === 'sweeper' && a.dark !== false) { k.stage = 'jar'; ev.push({ e: 'jar' }); } break;
    case 'CHOOSE': if (k.stage === 'jar' && (a.choice === 'return' || a.choice === 'keep')) { k.stage = 'done'; k.choice = a.choice; ev.push({ e: 'reward', choice: a.choice }); } break;
    default: break;
  }
  return { state: s, events: ev };
}

/**
 * What a townsperson says about the tale (pure): {lines: [key], args?, choices: [{key, act}]} or null when they have
 * nothing to say about it (their ordinary talk stays). acts: 'close', 'accept', 'ask', 'jar', 'return', 'keep'.
 */
export function inkTalk(state, npc, { level = 1, dark = true } = {}) {
  const k = cleanTales(state).ink, bye = { key: 'tale.bye', act: 'close' };
  if (npc === 'scribe') {
    switch (k.stage) {
      case 'none': return level >= INK.minLevel
        ? { lines: ['tale.ink.offer.1', 'tale.ink.offer.2'], choices: [{ key: 'tale.ink.accept', act: 'accept' }, { key: 'tale.notNow', act: 'close' }] }
        : null;
      case 'bells': return { lines: ['tale.ink.bells'], args: { n: k.bells, count: INK.bells }, choices: [bye] };
      case 'heard': return { lines: ['tale.ink.heard.1', 'tale.ink.heard.2'], choices: [{ key: 'tale.ink.ask', act: 'ask' }] };
      case 'sweeper': return { lines: ['tale.ink.waiting'], choices: [bye] };
      case 'jar': return { lines: ['tale.ink.jar.1', 'tale.ink.jar.2'], choices: [{ key: 'tale.ink.return', act: 'return' }, { key: 'tale.ink.keep', act: 'keep' }] };
      default: return { lines: [k.choice === 'return' ? 'tale.ink.after.return' : 'tale.ink.after.keep'], choices: [bye] };
    }
  }
  if (npc === 'sweeper') {
    if (k.stage === 'sweeper') return dark
      ? { lines: ['tale.ink.sweeper.1', 'tale.ink.sweeper.2', 'tale.ink.sweeper.3'], choices: [{ key: 'tale.ink.take', act: 'jar' }] }
      : { lines: ['tale.ink.sweeper.day'], choices: [bye] };
    if (k.stage === 'jar') return { lines: ['tale.ink.sweeper.go'], choices: [bye] };
    if (k.stage === 'done') return { lines: [k.choice === 'return' ? 'tale.ink.sweeper.return' : 'tale.ink.sweeper.keep'], choices: [bye] };
  }
  return null;
}

/** The marks over heads (scenes/quest-markers.js): [{giver, sym}]. */
export function inkMarkers(state, { level = 1, dark = true } = {}) {
  const k = cleanTales(state).ink;
  if (k.stage === 'none') return level >= INK.minLevel ? [{ giver: 'scribe', sym: '!' }] : [];
  if (k.stage === 'heard' || k.stage === 'jar') return [{ giver: 'scribe', sym: '?' }];
  if (k.stage === 'sweeper') return dark ? [{ giver: 'sweeper', sym: '!' }] : [];
  return [];
}

/** Every locale key the tale uses (tests check all five locales). */
export const INK_KEYS = Object.freeze([
  'tale.bye', 'tale.notNow', 'tale.prompt', 'tale.ink.title',
  'tale.ink.offer.1', 'tale.ink.offer.2', 'tale.ink.accept', 'tale.ink.bells', 'tale.ink.heard.1', 'tale.ink.heard.2', 'tale.ink.ask',
  'tale.ink.waiting', 'tale.ink.sweeper.day', 'tale.ink.sweeper.1', 'tale.ink.sweeper.2', 'tale.ink.sweeper.3', 'tale.ink.take',
  'tale.ink.sweeper.go', 'tale.ink.jar.1', 'tale.ink.jar.2', 'tale.ink.return', 'tale.ink.keep',
  'tale.ink.after.return', 'tale.ink.after.keep', 'tale.ink.sweeper.return', 'tale.ink.sweeper.keep',
  'tale.ink.toast.accepted', 'tale.ink.toast.bell', 'tale.ink.toast.quiet', 'tale.ink.toast.dark', 'tale.ink.toast.reward',
]);
