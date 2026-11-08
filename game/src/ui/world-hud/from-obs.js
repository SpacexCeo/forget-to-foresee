// World HUD view model from the room's observation (the orchestrator side of docs/ui-world-hud.md §8
// and docs/design/clarity-layers.md §7). Pure: no DOM, no engine import, no rule evaluated here;
// every number comes from the per-viewer observation the agent API also serves. Text that the play
// layer renders (goals, log events, option labels) travels as a `wh.raw` TextRef whose args are a
// function, so a language switch re-renders it in place.
//
//   const model = buildHudModel({ obs, goal, options, defaultIndex, i18n, render, mode, hints, line });
//
// `render(key, args)` is the play layer's message renderer (play/i18n.js renderMsg / the engine
// adapter's renderEvent), injected so this module stays independent of the play layer.

const ROMAN_SHELL = (n) => n - 1; // observation shells are 1-based, `shell.N` keys are 0-based
const SLOTS = ['place', 'action', 'power', 'delay'];
const POWER = [10, 20, 40, 80];
const ACTION_INDEX = { gift: 0, storm: 1, silence: 2, call: 3 };

/** A TextRef that shows already-rendered play text and re-renders it on a locale switch. */
export const raw = (fn) => ({ key: 'wh.raw', args: () => ({ text: fn() }) });

/** Confidence band of a reading: the weakest slot decides (clarity-layers §7). */
export function confidenceBand(slots) {
  const min = Math.min(...slots.map((s) => (s.certain ? 1 : s.confidence)));
  return min >= 0.8 ? 'certain' : min >= 0.5 ? 'likely' : 'unsure';
}

/** Phase of the current trial, from the goal the session derived (presentation only). */
export function phaseOf(goal, obs) {
  const id = goal && goal.id;
  if (obs && obs.season.phase === 'vote') return 'resolve';
  if (id === 'anchor' || id === 'anchor_next') return 'anchor';
  if (id === 'forget' || id === 'ask' || id === 'speak_key' || id === 'ash_key') return 'interpret';
  if (id === 'end_tick' || id === 'next_tick' || id === 'season_over' || id === 'vote') return 'resolve';
  return 'explore';
}

/** Sign cards: visible prophecies (active) and the chronicle (resolved, with the proof check). */
export function signsFromObs(obs, { i18n, mode = 'novice' } = {}) {
  const mine = (shell, t) => (obs.iris.anchors || []).some((a) => a.shell === shell && a.tick === t);
  const meaning = (slot, m) => i18n.t(`meaning.${slot}.${m}`);
  const items = [];

  for (const p of obs.prophecies || []) {
    const slots = p.reading ? p.reading.slots : [];
    const due = p.impliedAnchor ? p.impliedAnchor.tick : null;
    const shell = p.impliedAnchor ? p.impliedAnchor.shell : null;
    const band = slots.length ? confidenceBand(slots) : 'unsure';
    const card = {
      id: 'sign-' + p.index,
      number: p.index + 1,
      type: p.vision ? 'vision' : 'published',
      state: 'active', // unresolved until it appears in the chronicle (the implied trial is only a reading)
      anchored: shell != null && mine(shell, due),
      publishedTrial: p.publishedAt,
      dueTrial: due,
      confidence: band,
      verified: 'pending',
      stats: [],
      anchor: shell != null ? { shell: ROMAN_SHELL(shell), trial: due } : null,
    };
    if (slots.length === 4) {
      const [pl, ac, pw] = slots;
      if (mode !== 'pro') card.plain = {
        key: 'wh.sign.plain',
        args: () => ({ band, action: meaning(1, ac.meaning), power: POWER[pw.meaning], place: meaning(0, pl.meaning), trial: due ?? '?' }),
      };
      if (mode === 'pro') {
        card.stats = slots.map((s, k) => ({
          id: SLOTS[k],
          value: { key: 'wh.sign.reading', args: () => ({ meaning: meaning(k, s.meaning), pct: Math.round(s.confidence * 100) }) },
        }));
      }
    }
    items.push(card);
  }

  const proofs = new Map((obs.proofs || []).map((p) => [p.index, p]));
  for (const c of obs.chronicle || []) {
    const proof = proofs.get(c.index);
    const m = c.meaning;
    const ai = ACTION_INDEX[m.action] ?? 0;
    items.push({
      id: 'sign-' + c.index,
      number: c.index + 1,
      type: 'revealed',
      state: 'resolved',
      anchored: mine(m.place, c.tick),
      dueTrial: c.tick,
      confidence: 'certain',
      verified: proof ? (proof.verified ? 'ok' : 'fail') : 'pending',
      plain: mode === 'pro' ? undefined : { key: 'wh.sign.revealed', args: () => ({ action: meaning(1, ai), power: m.power, place: meaning(0, m.place - 1), trial: c.tick }) },
      stats: mode === 'pro' ? [
        { id: 'place', value: { key: 'wh.raw', args: () => ({ text: meaning(0, m.place - 1) }) } },
        { id: 'action', value: { key: 'wh.raw', args: () => ({ text: meaning(1, ai) }) } },
        { id: 'power', value: { key: 'wh.raw', args: () => ({ text: String(m.power) }) } },
        { id: 'delay', value: { key: 'wh.sign.trialValue', args: { n: c.tick } } },
      ] : [],
      anchor: { shell: ROMAN_SHELL(m.place), trial: c.tick },
      proof: proof ? { index: c.index, leaf: String(proof.leaf).slice(0, 10) } : undefined,
    });
  }
  // newest first: active by due trial, then resolved by trial (descending)
  items.sort((a, b) => (a.state === b.state ? (a.state === 'active' ? a.dueTrial - b.dueTrial : b.dueTrial - a.dueTrial) : a.state === 'active' ? -1 : 1));
  return items;
}

/**
 * @param {object} o
 * @param {object} o.obs           room observation (net/projection.js)
 * @param {object} [o.goal]        PlaySession.goal
 * @param {object[]} [o.options]   PlaySession.options (context actions at the current spot)
 * @param {number} [o.defaultIndex]
 * @param {object} o.i18n
 * @param {(key: string, args?: object) => string} o.render   play message renderer
 * @param {(ev: {key: string, args?: object}) => string} [o.renderEvent]  log event renderer
 * @param {'novice'|'pro'} [o.mode]
 * @param {{active: object|null, journal: object[], lore: object[]}} [o.hints]
 * @param {{speaker: string, text: object}|null} [o.line]   last spoken line (subtitle)
 * @param {boolean} [o.promptVisible]
 * @param {{open?: boolean, filter?: string}} [o.signsState]
 * @param {boolean} [o.unread]
 */
export function buildHudModel(o) {
  const { obs, goal, options = [], defaultIndex = -1, i18n, render, mode = 'novice', hints, line } = o;
  const renderEvent = o.renderEvent || ((e) => render(e.key, e.args));
  const s = obs.season;
  const iris = obs.iris;
  const words = obs.dictionary ? obs.dictionary.confidentCells : 0;
  const signs = signsFromObs(obs, { i18n, mode });
  const novice = mode !== 'pro';
  const layer = novice ? layerOf(obs) : 2;

  const row = (id, icon, label, value) => ({ id, icon, label, value });
  const num = (n) => ({ key: 'wh.raw', args: { text: String(n) } });
  const trial = {
    n: s.tick, total: s.ticks, phase: phaseOf(goal, obs),
    skillTier: words, attempts: iris.attention, attemptsMax: iris.maxAttention,
    arena: { key: 'wh.trial.zone.' + (obs.you.zone === 'shell' ? 'shell' : 'island') },
    progressDone: Math.max(0, s.tick - 1), progressTotal: s.ticks,
    progressPct: Math.round((Math.max(0, s.tick - 1) / s.ticks) * 100),
    silk: iris.silk, wordsKnown: words,
    // Novice layers (clarity-layers §2): L0 shows only Phase and Silk; L1 adds Attention and Words known;
    // L2 adds Tension. Pro always shows Phase, Silk, Attention and Tension.
    rows: [
      row('phase', 'crosshair', 'wh.trial.phase', { key: 'wh.trial.phase.' + phaseOf(goal, obs) }),
      row('silk', 'sparkle', 'wh.trial.silk', num(iris.silk)),
      ...(!novice || layer >= 1 ? [row('attention', 'bookmark', 'wh.trial.attention', { key: 'wh.trial.attemptsValue', args: { n: iris.attention, max: iris.maxAttention } })] : []),
      ...(novice && layer >= 1 ? [row('words', 'book', 'wh.trial.words', { key: 'wh.trial.wordsValue', args: { n: words, total: 16 } })] : []),
      ...(!novice || layer >= 2 ? [row('tension', 'bar-chart', 'wh.trial.tension', num(s.tension))] : []),
    ],
    mobileStats: [
      { id: 'silk', icon: 'sparkle', label: 'wh.trial.silk', value: num(iris.silk) },
      { id: 'attention', icon: 'bookmark', label: 'wh.trial.attention', value: { key: 'wh.trial.attemptsValue', args: { n: iris.attention, max: iris.maxAttention } } },
    ],
  };

  const quests = goal ? [{
    id: 'goal-' + goal.id,
    title: raw(() => render(goal.key, goal.args || {})),
    body: [raw(() => render(goal.hintKey, { ...(goal.args || {}), ...(goal.hintArgs || {}) }))],
    recommended: true,
  }] : [{ id: 'goal-none', title: { key: 'wh.quest.none' }, body: [] }];

  // the clock column already says the trial, so the "— Tick N —" separators are dropped
  const logEntries = (obs.log || []).filter((e) => e.tone !== 'tick').slice(0, 30).map((e, i) => ({
    id: 'log-' + e.tick + '-' + i + '-' + e.key,
    time: i18n.t('wh.log.trial', { n: e.tick }),
    tone: e.tone,
    text: raw(() => renderEvent({ key: e.key, args: e.args })),
  }));

  const opt = defaultIndex >= 0 ? options[defaultIndex] : null;
  const promptVisible = !!opt && opt.available !== false && o.promptVisible !== false;

  const hintState = hints || { active: null, journal: [], lore: [] };
  const next = {
    mode,
    layer,
    unlocks: { memory: layer >= 1, words: layer >= 1, tension: layer >= 2 },
    trial,
    quests,
    questIndex: 0,
    // a finished toast keeps its text while it fades out (status.js toggles visibility in place)
    hint: hintState.active ? { text: hintState.active.text, visible: true, id: hintState.active.id }
      : { text: o.prev && o.prev.hint ? o.prev.hint.text : null, visible: false },
    signs: { open: o.signsState ? !!o.signsState.open : !novice, filter: (o.signsState && o.signsState.filter) || 'all', items: signs },
    journal: {
      tab: 'log',
      log: logEntries,
      hints: hintState.journal || [],
      lore: hintState.lore || [],
      unread: !!o.unread,
    },
    prompt: opt
      ? { text: raw(() => render(opt.label.key, opt.label.args)), hotkey: 'E', visible: promptVisible }
      : { text: null, hotkey: 'E', visible: false },
    dialogue: line
      ? { speaker: line.speaker, line: line.text, replies: line.replies || [], expanded: false }
      : { speaker: 'iris', line: { key: 'wh.dialogue.idle' }, replies: [], expanded: false },
    hotbar: [
      ...(layer >= 1 ? [{ id: 'memory', hotkey: 'M' }] : []),
      { id: 'signs', hotkey: 'V' },
      ...(s.phase === 'play' ? [{ id: 'endTick', hotkey: 'T' }] : []),
      { id: 'help', hotkey: 'H' },
      { id: 'settings' },
    ],
  };
  const sig = {
    trial: JSON.stringify(trial),
    quests: goal ? [goal.id, goal.key, goal.hintKey, JSON.stringify(goal.args), JSON.stringify(goal.hintArgs)].join('|') : '-',
    signs: [obs.version, mode, next.signs.open, next.signs.filter].join('|'),
    journal: [obs.version, (hintState.journal || []).length, (hintState.lore || []).length, next.journal.unread].join('|'),
    prompt: opt ? [opt.id, JSON.stringify(opt.label), promptVisible].join('|') : '-',
    dialogue: line || null,
    hotbar: s.phase + layer,
    hint: hintState.active ? hintState.active.id + ':' + (hintState.active.shown || 0) : 'off',
  };
  return o.prev ? reuse(o.prev, next, sig) : withSig(next, sig);
}

/**
 * Keeps the previous model's sub-objects whose signature did not change, so the HUD packages (which
 * compare sub-objects by reference) leave their DOM, focus and animations alone.
 */
function reuse(prev, next, sig) {
  const ps = prev._sig || {};
  for (const k of Object.keys(sig)) if (ps[k] !== undefined && ps[k] === sig[k] && prev[k] !== undefined) next[k] = prev[k];
  return withSig(next, sig);
}
const withSig = (m, sig) => Object.defineProperty(m, '_sig', { value: sig || {}, enumerable: false });

/** Clarity layer for Novice (clarity-layers §2): L0 trials 1–3, L1 from trial 4, L2 at crisis/vote. */
export function layerOf(obs) {
  const s = obs.season;
  if (s.phase === 'vote' || s.phase === 'end' || s.tick >= (s.crisisTick || 13) || s.tension >= 40) return 2;
  if (s.tick >= 4 || (obs.dictionary && obs.dictionary.confidentCells > 0) || (obs.iris.forgotten || []).length) return 1;
  return 0;
}
