// Novice hints, A to Z (docs/design/clarity-layers.md §5, §9): one hint engine over the room's
// observation and a few client actions. No engine change and no hidden state: every trigger reads the
// same per-viewer observation the agent API serves, so a hint never tells the player more than the
// screen could. Novice: toasts (top right), Iris lines (dialogue strip) and the Hints tab. Pro: only
// the Lore entries of the story beats. Flags persist per device (`ftf.hints.v1`): a "once" hint never
// fires again, in any season; `reset()` (or ?hints=reset, ?demo=judge) clears them.
//
//   const hints = createHints({ storage, mode: () => prefs.get().hudMode });
//   session.on('obs', () => hints.observe(session.obs));
//   hints.action('moved'); hints.tick(dt); hints.view();

export const HINTS_KEY = 'ftf.hints.v1';

const TOAST_MS = 9000, TOAST_LONG_MS = 14000, LONG_CHARS = 60;
const GAP_MS = 6000, SAME_MS = 30000, PER_TRIAL = 3;
const STUCK_L0_MS = 25000, STUCK_MS = 45000;
const PRIORITY = { untilDone: 1, once: 2, repeat: 3 };

/** First visible prophecy with a full reading, as args for the hint text. */
function firstReading(obs, i18n) {
  const p = (obs.prophecies || []).find((x) => x.reading && x.impliedAnchor);
  if (!p) return null;
  const [pl, ac, pw] = p.reading.slots;
  return {
    shell: i18n ? i18n.t('shell.' + (p.impliedAnchor.shell - 1)) : String(p.impliedAnchor.shell),
    action: i18n ? i18n.t('meaning.1.' + ac.meaning) : String(ac.meaning),
    power: [10, 20, 40, 80][pw.meaning],
    place: i18n ? i18n.t('meaning.0.' + pl.meaning) : String(pl.meaning),
    trial: p.impliedAnchor.tick,
  };
}

/**
 * The hint matrix (§9.1, the demo-critical rows first). `when(obs, st)` returns args (an object) when
 * the hint should fire, `done(obs, st)` marks an untilDone hint finished. `type`: toast | iris.
 * `lore`: the beat also lands in the Lore tab (both modes).
 */
export const HINTS = [
  { id: 'welcome', type: 'iris', stop: 'once', priority: 0, when: () => ({}) },
  { id: 'move', type: 'toast', stop: 'repeat', max: 2, when: (o, st) => (!st.acts.moved && st.ms > 6000 ? {} : null), done: (o, st) => !!st.acts.moved },
  { id: 'firstSign', type: 'toast', stop: 'untilDone', max: 3, when: (o, st) => firstReading(o, st.i18n), done: (o, st) => !!st.acts.signsOpen },
  { id: 'anchor', type: 'toast', stop: 'untilDone', max: 3, when: (o, st) => (st.acts.signsOpen && !(o.iris.anchors || []).length && o.season.phase === 'play' ? firstReading(o, st.i18n) : null), done: (o) => (o.iris.anchors || []).length > 0 },
  { id: 'anchored', type: 'iris', stop: 'once', when: (o) => ((o.iris.anchors || []).length ? {} : null) },
  { id: 'verified', type: 'toast', stop: 'once', lore: true, when: (o) => ((o.proofs || []).some((p) => p.verified) ? {} : null) },
  { id: 'endTick', type: 'toast', stop: 'repeat', max: 2, when: (o) => (o.season.phase === 'play' && o.iris.attention === 0 ? {} : null) },
  { id: 'offer', type: 'iris', stop: 'once', when: (o, st) => { const f = (o.offers || [])[0]; return f ? { who: st.i18n ? st.i18n.t('agent.' + f.from) : f.from } : null; } },
  { id: 'memory', type: 'toast', stop: 'once', lore: true, when: (o) => (o.season.tick >= 4 && (o.memories || []).length ? {} : null) },
  { id: 'words', type: 'toast', stop: 'once', when: (o) => (o.dictionary && o.dictionary.confidentCells >= 4 ? { n: o.dictionary.confidentCells } : null) },
  { id: 'silkLow', type: 'toast', stop: 'repeat', max: 2, when: (o) => (o.season.phase === 'play' && o.iris.silk < 20 ? {} : null) },
  { id: 'tension', type: 'toast', stop: 'once', lore: true, when: (o) => (o.season.tension >= 40 ? { n: o.season.tension } : null) },
  { id: 'crisis', type: 'toast', stop: 'once', lore: true, when: (o) => (o.season.tick >= (o.season.crisisTick || 13) ? {} : null) },
  { id: 'vote', type: 'toast', stop: 'once', lore: true, when: (o) => (o.season.phase === 'vote' ? {} : null) },
  { id: 'end', type: 'iris', stop: 'once', lore: true, when: (o) => (o.season.phase === 'end' ? {} : null) },
];

/**
 * @param {object} o
 * @param {{getJSON: Function, setJSON: Function}} [o.storage]
 * @param {() => 'novice'|'pro'} [o.mode]
 * @param {object} [o.i18n]  for the reading args (shell numerals, meanings) and text length
 * @param {() => number} [o.now] milliseconds (tests)
 */
export function createHints({ storage = null, mode = () => 'novice', i18n = null, now = () => Date.now() } = {}) {
  const flags = (storage && storage.getJSON(HINTS_KEY)) || {};
  const subs = new Set();
  const st = { i18n, acts: {}, ms: 0, lastAct: 0, lastToast: -Infinity, trial: 0, perTrial: 0 };
  const start = now();
  let obs = null, active = null, activeUntil = 0, coach = null;
  const queue = [];               // pending {def, args}
  const journal = [], lore = [];   // newest first
  const lastShown = {};

  const save = () => { if (storage) storage.setJSON(HINTS_KEY, flags); };
  const flag = (id) => (flags[id] || (flags[id] = { seen: 0, done: false }));
  const emit = () => { for (const fn of [...subs]) fn(); };
  const novice = () => mode() !== 'pro';
  const textOf = (def, args) => ({ key: 'wh.hint.' + def.id, args });
  const entry = (def, args) => ({ id: def.id + '-' + flag(def.id).seen + '-' + st.trial, time: i18n ? i18n.t('wh.log.trial', { n: st.trial }) : 'T' + st.trial, text: textOf(def, args) });

  function eligible(def) {
    const f = flag(def.id);
    if (f.done) return false;
    if (def.stop === 'once') return f.seen === 0;
    return f.seen < (def.max || 1);
  }

  function enqueue(def, args) {
    if (queue.some((q) => q.def.id === def.id) || (active && active.id === def.id)) return;
    queue.push({ def, args });
    const pr = (d) => d.priority ?? PRIORITY[d.stop];
    queue.sort((a, b) => pr(a.def) - pr(b.def));
  }

  /** Re-evaluates every trigger against the latest observation. */
  function evaluate() {
    if (!obs) return false;
    let changed = false;
    if (obs.season.tick !== st.trial) { st.trial = obs.season.tick; st.perTrial = 0; }
    // a queued hint whose action already happened is dropped before it shows
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].def.done && queue[i].def.done(obs, st)) { queue.splice(i, 1); changed = true; }
    for (const def of HINTS) {
      const f = flag(def.id);
      if (def.done && !f.done && f.seen > 0 && def.done(obs, st)) {
        f.done = true; save(); changed = true;
        if (active && active.id === def.id) { active = null; changed = true; }
        const qi = queue.findIndex((q) => q.def.id === def.id);
        if (qi >= 0) queue.splice(qi, 1);
      }
      if (!eligible(def)) continue;
      if (def.done && def.done(obs, st)) continue; // the player is ahead of the hint
      const args = def.when(obs, st);
      if (!args) continue;
      if (!novice()) {
        // Pro: no coaching; story beats still reach the Lore tab once
        if (def.lore && f.seen === 0) { f.seen = 1; f.done = true; save(); lore.unshift(entry(def, args)); changed = true; }
        continue;
      }
      if (def.stop !== 'once' && f.seen > 0 && now() - (lastShown[def.id] || 0) < SAME_MS) continue;
      enqueue(def, args);
    }
    return pump() || changed;
  }

  /** Shows the next queued hint when the toast slot is free and the pacing allows it. */
  function show(item, t) {
    const { def, args } = item;
    const f = flag(def.id);
    f.seen++; save();
    lastShown[def.id] = t;
    journal.unshift(entry(def, args));
    if (def.lore) lore.unshift(entry(def, args));
    return textOf(def, args);
  }

  function pump() {
    const t = now();
    let changed = false;
    // Iris lines go to the dialogue strip at once: they never wait for, or use up, the toast slot.
    const ii = queue.findIndex((q) => q.def.type === 'iris');
    if (ii >= 0 && !coach) { coach = show(queue.splice(ii, 1)[0], t); changed = true; }
    if (active && t >= activeUntil) { active = null; changed = true; }
    const ti = queue.findIndex((q) => q.def.type !== 'iris');
    if (active || ti < 0) return changed;
    if (t - st.lastToast < GAP_MS || st.perTrial >= PER_TRIAL) return changed;
    const item = queue.splice(ti, 1)[0];
    const text = show(item, t);
    st.lastToast = t; st.perTrial++;
    const len = i18n ? i18n.t(text.key, text.args).length : 0;
    active = { id: item.def.id, text, shown: flag(item.def.id).seen };
    activeUntil = t + (len > LONG_CHARS ? TOAST_LONG_MS : TOAST_MS);
    return true;
  }

  /** Stuck detector (§9.2 rule 5): no meaningful action for a while → the oldest unfinished untilDone hint again. */
  function stuck() {
    if (!obs || !novice() || active || queue.length) return false;
    const layer0 = obs.season.tick <= 3;
    if (now() - st.lastAct < (layer0 ? STUCK_L0_MS : STUCK_MS)) return false;
    st.lastAct = now();
    for (const def of HINTS) {
      if (def.stop !== 'untilDone') continue;
      const f = flag(def.id);
      if (f.seen > 0 && !f.done && f.seen < (def.max || 1)) {
        const args = def.when(obs, st);
        if (args) { lastShown[def.id] = 0; enqueue(def, args); return pump(); }
      }
    }
    return false;
  }

  return {
    observe(next) { obs = next; if (evaluate()) emit(); },
    /** Client actions the observation cannot see: 'moved', 'signsOpen', 'panel', 'command'. */
    action(name) {
      st.acts[name] = true;
      st.lastAct = now();
      if (evaluate()) emit();
    },
    /** Per frame; returns true when the view changed (the caller re-renders; no subscriber call). */
    tick(dt) {
      st.ms = now() - start;
      return !!(pump() || stuck() || (obs && st.ms > 6000 && !st.acts.moved && evaluate()));
    },
    view() { return { active, journal: journal.slice(0, 40), lore: lore.slice(0, 40), coach }; },
    /** Clears the coach line once the dialogue strip showed it. */
    takeCoach() { const c = coach; coach = null; return c; },
    dismiss() { if (active) { active = null; emit(); } },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    reset() { for (const k of Object.keys(flags)) delete flags[k]; save(); journal.length = 0; lore.length = 0; queue.length = 0; active = null; coach = null; },
    flags: () => JSON.parse(JSON.stringify(flags)),
  };
}
