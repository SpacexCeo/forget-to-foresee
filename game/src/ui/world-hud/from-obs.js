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

/**
 * "See what changed" lines for one revealed sign (readiness audit P2): the proof fact apart from the reading
 * fact. `report` is the play layer's outcome report (play/outcome.js); without one (a sign revealed before
 * this page saw it) only the facts the observation still holds are shown. Every line is a TextRef whose
 * args are a function, so a language switch re-renders it. Returns { title, sealed, happened, reading,
 * slots, stake, learned, tutorial } (null where there is nothing to say).
 */
export function outcomeLines(c, report, i18n, proof = null) {
  const meaning = (slot, m) => i18n.t(`meaning.${slot}.${m}`);
  const m = c.meaning;
  const ai = ACTION_INDEX[m.action] ?? 0;
  const truth = () => ({ action: meaning(1, ai), power: m.power, place: meaning(0, m.place - 1), trial: c.tick });
  const state = report ? report.proof : proof ? (proof.verified ? 'ok' : 'fail') : 'pending';
  const out = {
    title: { key: 'wh.outcome.title', args: truth },
    sealed: { key: 'wh.outcome.sealed.' + state, args: {} },
    happened: { key: 'wh.sign.revealed', args: truth },
    reading: null, slots: null, stake: null, learned: null, tutorial: null,
  };
  if (!report) return out;
  const r = report.reading;
  if (r) {
    out.reading = { key: 'wh.outcome.reading', args: () => ({ who: r.who, action: meaning(1, r.slots[1]), power: POWER[r.slots[2]], place: meaning(0, r.slots[0]), trial: r.tick }) };
    if (report.verdict) {
      const v = report.verdict;
      out.slots = { key: 'wh.outcome.slots', args: () => ({ right: v.filter(Boolean).length, list: v.map((ok, k) => i18n.t('slot.' + k) + ' ' + (ok ? '✓' : '✗')).join(' · ') }) };
    }
  }
  const st = report.stake;
  if (st) {
    const args = () => ({
      amount: st.amount ?? 0, stake: st.stake ?? 10, trial: st.tick ?? c.tick,
      place: meaning(0, m.place - 1), staked: st.shell ? meaning(0, st.shell - 1) : '', action: meaning(1, ai),
    });
    out.stake = { key: 'wh.outcome.stake.' + st.result, args };
  }
  const l = report.learned;
  if (l) {
    const args = () => ({
      form: i18n.t('form.' + l.form), slot: i18n.t('slot.' + l.slot), meaning: meaning(l.slot, l.meaning),
      was: l.was != null ? meaning(l.slot, l.was) : '', place: meaning(0, m.place - 1), trial: c.tick,
      from: Math.round((l.from ?? 0) * 100), to: Math.round(l.to * 100),
    });
    out.learned = { key: l.was != null ? 'wh.outcome.learnedSwitch' : 'wh.outcome.learned', args };
  }
  // the first outcome of a season that the reading missed: a labelled teaching line (the season stays as sealed)
  if (report.first && report.verdict && report.verdict.some((ok) => !ok) && st && st.result !== 'paid') out.tutorial = { key: 'wh.outcome.tutorial', args: {} };
  return out;
}

/** Sign cards: visible prophecies (active) and the chronicle (resolved, with the proof check). */
export function signsFromObs(obs, { i18n, mode = 'novice', near = null, outcomes = null } = {}) {
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
    const report = outcomes && outcomes.get ? outcomes.get(c.index) || null : null;
    const lines = outcomeLines(c, report, i18n, proof);
    items.push({
      id: 'sign-' + c.index,
      number: c.index + 1,
      type: 'revealed',
      state: 'resolved',
      // the observation drops Iris's anchors at the reveal; the outcome report remembers the stake
      anchored: mine(m.place, c.tick) || !!(report && report.stake && ['paid', 'burned', 'calm'].includes(report.stake.result)),
      dueTrial: c.tick,
      confidence: 'certain',
      verified: proof ? (proof.verified ? 'ok' : 'fail') : report && report.proof !== 'pending' ? report.proof : 'pending',
      plain: mode === 'pro' ? undefined : lines.happened,
      // two facts kept apart (audit P2): the event matched the sealed season; your reading was right or wrong
      details: [
        { id: 'sealed', tone: lines.sealed.key.endsWith('.ok') ? 'ok' : lines.sealed.key.endsWith('.fail') ? 'miss' : 'muted', text: lines.sealed },
        lines.reading ? { id: 'reading', tone: 'plain', text: lines.reading } : null,
        lines.slots ? { id: 'slots', tone: report.verdict.every(Boolean) ? 'ok' : 'miss', text: lines.slots } : null,
        lines.stake ? { id: 'stake', tone: report.stake.result === 'paid' ? 'ok' : report.stake.result === 'burned' ? 'miss' : 'muted', text: lines.stake } : null,
        lines.learned ? { id: 'learned', tone: 'learn', text: lines.learned } : null,
      ].filter(Boolean),
      stats: mode === 'pro' ? [
        { id: 'place', value: { key: 'wh.raw', args: () => ({ text: meaning(0, m.place - 1) }) } },
        { id: 'action', value: { key: 'wh.raw', args: () => ({ text: meaning(1, ai) }) } },
        { id: 'power', value: { key: 'wh.raw', args: () => ({ text: String(m.power) }) } },
        { id: 'delay', value: { key: 'wh.sign.trialValue', args: { n: c.tick } } },
      ] : [],
      anchor: { shell: ROMAN_SHELL(m.place), trial: c.tick },
      proof: proof ? { index: c.index, leaf: String(proof.leaf).slice(0, 10) } : undefined,
      near: near ? near.leafBadge(c.index) : null,
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
 * @param {boolean} [o.map]  true when the host wires an island map: the hotbar gets a Map button (N)
 * @param {{leafBadge: (index: number) => object|null, seasonBadge: () => object|null}} [o.near]  NEAR testnet badges (net/near.js)
 * @param {boolean} [o.unread]
 * @param {Map<number, object>} [o.outcomes]  outcome reports by chronicle index (play/outcome.js): what the reveal did to your reading and stake
 */
export function buildHudModel(o) {
  const { obs, goal, options = [], defaultIndex = -1, i18n, render, mode = 'novice', hints, line } = o;
  const renderEvent = o.renderEvent || ((e) => render(e.key, e.args));
  const s = obs.season;
  const iris = obs.iris;
  const words = obs.dictionary ? obs.dictionary.confidentCells : 0;
  const signs = signsFromObs(obs, { i18n, mode, near: o.near || null, outcomes: o.outcomes || null });
  const novice = mode !== 'pro';
  const layer = novice ? layerOf(obs) : 2;

  const row = (id, icon, label, value) => ({ id, icon, label, value });
  const num = (n) => ({ key: 'wh.raw', args: { text: String(n) } });
  const trial = {
    n: s.tick, total: s.ticks, phase: phaseOf(goal, obs),
    skillTier: words, attempts: iris.attention, attemptsMax: iris.maxAttention,
    arena: { key: 'wh.trial.zone.' + (obs.you.zone === 'shell' ? 'shell' : 'island') },
    // QA-012: once the season leaves play (vote, end) every trial is done: 17 / 17 · 100 %
    progressDone: s.phase === 'play' ? Math.max(0, s.tick - 1) : s.ticks, progressTotal: s.ticks,
    progressPct: Math.round(((s.phase === 'play' ? Math.max(0, s.tick - 1) : s.ticks) / s.ticks) * 100),
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
    time: { key: 'wh.log.trial', args: { n: e.tick } }, // a TextRef, so a language switch re-renders "T1" (QA-019)
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
      ...(o.map ? [{ id: 'map', hotkey: 'N' }] : []), // the island map (task H, play/map-ui.js); shown once the host wires it
      ...(s.phase === 'play' ? [{ id: 'endTick', hotkey: 'T' }] : []),
      { id: 'help', hotkey: 'H' },
      { id: 'settings' },
    ],
  };
  const sig = {
    trial: JSON.stringify(trial),
    quests: goal ? [goal.id, goal.key, goal.hintKey, JSON.stringify(goal.args), JSON.stringify(goal.hintArgs)].join('|') : '-',
    signs: [obs.version, mode, next.signs.open, next.signs.filter, o.outcomes ? [...o.outcomes.values()].map((r) => r.index + r.proof).join(',') : ''].join('|'),
    journal: [obs.version, (hintState.journal || []).length, (hintState.lore || []).length, next.journal.unread].join('|'),
    prompt: opt ? [opt.id, JSON.stringify(opt.label), promptVisible].join('|') : '-',
    dialogue: line || null,
    hotbar: s.phase + layer + (o.map ? 'm' : ''),
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
