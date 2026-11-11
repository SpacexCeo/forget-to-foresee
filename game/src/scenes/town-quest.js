// The town quest (hackathon spec P1-B): three townsfolk who already stand on the way to the altar teach the loop in
// three short talks before the season: read a sign (innkeeper, lower street), take a purse and trade silk for a word
// (baker, the square), deliver it (shrinekeeper, by the altar), who sends Iris to register. Pure and node-tested:
// no DOM, no engine, no room. The purse is a teaching prop held here, never sent to the engine or to a chain; the
// altar works at every step (the quest never blocks registration). Played once per device (`ftf.townquest.v1`).

/** Steps in order. `read`, `trade` and `deliver` each wait for one townsperson. */
export const QUEST_STEPS = Object.freeze(['start', 'read', 'trade', 'deliver', 'done']);
/** Who each step waits for (keys of play/townsfolk-plan.js PROGRAMS; all three stand at fixed posts). */
export const QUEST_NPC = Object.freeze({ read: 'innkeeper', trade: 'baker', deliver: 'shrinekeeper' });
/** Device flag: 'done' or 'skipped'. */
export const QUEST_KEY = 'ftf.townquest.v1';
/** Metres from a townsperson within which Iris can talk. */
export const TALK_RADIUS = 2.4;
/** Talks close by themselves when Iris walks further than this from the speaker. */
export const TALK_LEAVE = 4.5;
/** The teaching purse: given by the baker, 2 of it paid for the sealed word. */
export const PURSE = Object.freeze({ gift: 5, price: 2 });

/**
 * The talk trees (at most eight short lines each; keys in play/locales). A node: {line, sign?, choices: [{key, to?, act?}]}.
 * `to` moves to another node of the same talk; `act` is applied by the quest: 'purse' (+gift), 'pay' (-price),
 * 'advance' (next step, closes the talk), 'close'.
 */
export const TALKS = Object.freeze({
  innkeeper: Object.freeze({
    ask: { line: 'quest.inn.ask', sign: true, choices: [{ key: 'quest.inn.right', to: 'right' }, { key: 'quest.inn.wrong', to: 'wrong' }] },
    wrong: { line: 'quest.inn.retry', sign: true, choices: [{ key: 'quest.again', to: 'ask' }] },
    right: { line: 'quest.inn.note', choices: [{ key: 'quest.ok', act: 'advance' }] },
  }),
  baker: Object.freeze({
    ask: { line: 'quest.baker.note', choices: [{ key: 'quest.next', to: 'purse' }] },
    purse: { line: 'quest.baker.purse', choices: [{ key: 'quest.baker.take', act: 'purse', to: 'trade' }] },
    trade: { line: 'quest.baker.trade', choices: [{ key: 'quest.baker.pay', act: 'pay', then: 'advance' }] },
  }),
  shrinekeeper: Object.freeze({
    ask: { line: 'quest.shrine.word', choices: [{ key: 'quest.next', to: 'send' }] },
    send: { line: 'quest.shrine.send', choices: [{ key: 'quest.ok', act: 'advance' }] },
  }),
});

/** Every message key the quest can show (the locale test walks this). */
export function questKeys() {
  const keys = new Set(['quest.talk', 'quest.skip', 'quest.purse', 'quest.close', 'quest.signAlt']);
  for (const step of ['read', 'trade', 'deliver']) keys.add('quest.obj.' + step);
  for (const npc of Object.values(QUEST_NPC)) keys.add('quest.name.' + npc);
  for (const talk of Object.values(TALKS)) for (const n of Object.values(talk)) { keys.add(n.line); for (const c of n.choices) keys.add(c.key); }
  return [...keys];
}

/**
 * Whether this session plays the quest: never on the judge link (its 5-minute table goes straight to the altar),
 * `?quest=0` skips, `?quest=1` forces it (QA), otherwise once per device.
 * @param {{demo?: string|null, quest?: string|null, stored?: string|null}} o
 */
export function questPlan({ demo = null, quest = null, stored = null } = {}) {
  if (quest === '0' || quest === 'off') return false;
  if (quest === '1' || quest === 'on') return true;
  if (demo === 'judge') return false;
  return stored !== 'done' && stored !== 'skipped';
}

/**
 * @param {{storage?: {getItem(k: string): string|null, setItem(k: string, v: string): unknown}, enabled?: boolean}} [o]
 */
export function createTownQuest({ storage = null, enabled = true } = {}) {
  const state = { step: enabled ? 'start' : 'done', purse: 0, talk: null, node: null, items: [] };
  const listeners = new Set();
  const emit = () => { for (const fn of [...listeners]) fn(api); };
  const save = (v) => { try { if (storage) storage.setItem(QUEST_KEY, v); } catch { /* memory only */ } };
  const advance = () => {
    const i = QUEST_STEPS.indexOf(state.step);
    state.step = QUEST_STEPS[Math.min(QUEST_STEPS.length - 1, i + 1)];
    state.items = state.step === 'trade' ? ['note'] : state.step === 'deliver' ? ['word'] : [];
    state.talk = null; state.node = null;
    if (state.step === 'done') save('done');
  };
  const api = {
    get step() { return state.step; },
    get active() { return state.step !== 'done'; },
    get purse() { return state.purse; },
    get items() { return state.items.slice(); },
    /** The talk in progress: {npc, node} or null. */
    get talk() { return state.talk ? { npc: state.talk, node: TALKS[state.talk][state.node], id: state.node } : null; },
    /** Who the current step waits for, or null. */
    get npc() { return QUEST_NPC[state.step] || null; },
    /** The objective line's key: the current step's, or the altar's once done. */
    get objective() { return QUEST_NPC[state.step] ? 'quest.obj.' + state.step : 'town.objective'; },
    /** The player entered the town: the quest begins (start -> read). */
    begin() { if (state.step === 'start') { state.step = 'read'; emit(); } },
    /** Starts the talk with `npc` when it is the one the step waits for. Returns true when a talk opened. */
    talkTo(npc) {
      if (state.step === 'start') state.step = 'read';
      if (QUEST_NPC[state.step] !== npc) return false;
      state.talk = npc; state.node = 'ask'; emit(); return true;
    },
    /** Picks choice `i` of the open talk. */
    choose(i) {
      if (!state.talk) return false;
      const c = TALKS[state.talk][state.node].choices[i];
      if (!c) return false;
      if (c.act === 'purse') state.purse += PURSE.gift;
      if (c.act === 'pay') state.purse = Math.max(0, state.purse - PURSE.price);
      if (c.act === 'advance' || c.then === 'advance') advance();
      else if (c.act === 'close') { state.talk = null; state.node = null; }
      else if (c.to) state.node = c.to;
      emit(); return true;
    },
    /** Closes the open talk without a choice (Esc, walking away); the step stays. */
    close() { if (state.talk) { state.talk = null; state.node = null; emit(); } },
    /** Skips the whole quest for this device. */
    skip() { if (state.step === 'done') return; state.step = 'done'; state.talk = null; state.node = null; state.items = []; save('skipped'); emit(); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return api;
}

/**
 * The townsperson Iris can talk to, or null: the one the step waits for, within TALK_RADIUS (horizontal metres).
 * @param {object} quest  createTownQuest()
 * @param {number[]} pos  Iris (world)
 * @param {(key: string) => number[]|null} npcAt  a townsperson's world position
 */
export function talkTarget(quest, pos, npcAt) {
  const npc = quest.active ? quest.npc : null;
  if (!npc) return null;
  const p = npcAt(npc);
  if (!p || Math.abs(p[1] - pos[1]) > 2.5) return null;
  return Math.hypot(p[0] - pos[0], p[2] - pos[2]) <= TALK_RADIUS ? npc : null;
}
