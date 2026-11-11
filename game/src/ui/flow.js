// Onboarding order (spec §1): lobby → entitlement (synthetic demo) → tutorial →
// customization → first contact. Tutorial and customization never swap: a step
// can only be entered once every earlier step is done.
//
// This module is the whole first-time-experience state machine and has no DOM:
//   - the step flow (gating, persistence, skip, resume, a returning player goes straight in);
//   - the tutorial beats (`createTutorial`): five show-don't-tell beats, each one action with
//     immediate feedback, resumable at the saved beat, skippable at any beat.
// docs/tutorial.md describes the design; tests/tutorial.test.mjs drives both machines.
import { STORAGE_KEYS } from './storage.js';

export const FLOW_STEPS = Object.freeze(['lobby', 'entitlement', 'tutorial', 'customization', 'firstContact']);
const GATED = FLOW_STEPS.slice(1);
const DONE_STEPS = ['entitlement', 'tutorial', 'customization'];

/** Tutorial beats in order (docs/tutorial.md §2.1). */
export const TUTORIAL_BEATS = Object.freeze(['slots', 'dots', 'read', 'stake', 'price']);

/**
 * The tutorial example "Shell II · Gift · 20 · +2": one dot, so reading starts at the right-hand
 * slot. `read` lists [slot index, form index, meaning index] in reading order.
 */
export const TUTORIAL_SIGN = Object.freeze({
  dots: 1,
  read: Object.freeze([[0, 2, 1], [1, 0, 0], [2, 1, 1], [3, 3, 1]]),
  /** Silk before and after the staged stake of beat 4: 10 staked; trial 3 pays the Gift of 20 and returns the stake (the only anchor takes the whole pot, engine resolveEvent). */
  silk: Object.freeze({ start: 63, staked: 53, paid: 83 }),
  /** The trial the example lands on: published on trial 1, Delay "+2" → trial 3. */
  trial: 3,
  shell: 2,
});

export function createOnboardingFlow(storage) {
  const saved = storage ? storage.getJSON(STORAGE_KEYS.flow) : null;
  const done = { entitlement: false, tutorial: false, customization: false };
  const skipped = { tutorial: false };
  let beat = 0;
  if (saved && saved.done) for (const k of Object.keys(done)) done[k] = saved.done[k] === true;
  if (saved && saved.skipped) skipped.tutorial = saved.skipped.tutorial === true;
  if (saved && Number.isInteger(saved.beat)) beat = Math.min(Math.max(0, saved.beat), TUTORIAL_BEATS.length - 1);
  // A later step can never be marked done without the earlier ones (repairs tampered storage).
  if (!done.entitlement) done.tutorial = false;
  if (!done.tutorial) done.customization = false;
  // "Returning" is decided once, from what was saved before this session started.
  const returning = DONE_STEPS.every((k) => done[k]);
  let step = 'lobby';
  const subs = new Set();
  const persist = () => { if (storage) storage.setJSON(STORAGE_KEYS.flow, { done, skipped, beat }); };
  const emit = () => { for (const fn of [...subs]) fn(step); };

  function canEnter(s) {
    const i = FLOW_STEPS.indexOf(s);
    if (i < 0) return false;
    if (i <= 1) return true;
    return GATED.slice(0, i - 1).every((k) => done[k]);
  }
  function goto(s) {
    if (!canEnter(s)) return false;
    step = s; emit();
    return true;
  }

  return {
    get step() { return step; },
    get done() { return { ...done }; },
    get skipped() { return { ...skipped }; },
    /** True when every onboarding step was already done when this flow was created. */
    get returning() { return returning; },
    /** Saved tutorial beat (resume point). */
    get beat() { return beat; },
    setBeat(i) { beat = Math.min(Math.max(0, i | 0), TUTORIAL_BEATS.length - 1); persist(); },
    canEnter,
    goto,
    /** From the lobby: a returning player goes straight to first contact; otherwise the first unfinished step. */
    enter() { return goto(GATED.find((k) => k !== 'firstContact' && !done[k]) || 'firstContact'); },
    /** Marks the current step done and moves to the next one. Ignored if `s` is not current. */
    complete(s) {
      if (s !== step || !(s in done)) return false;
      done[s] = true;
      if (s === 'tutorial') beat = 0;
      persist();
      return goto(FLOW_STEPS[FLOW_STEPS.indexOf(s) + 1]);
    },
    /** Skips the tutorial (the only skippable step): done, remembered as skipped, next step. */
    skip(s) {
      if (s !== 'tutorial' || step !== s) return false;
      skipped.tutorial = true;
      return this.complete(s);
    },
    toLobby() { step = 'lobby'; emit(); },
    reset() { for (const k of Object.keys(done)) done[k] = false; skipped.tutorial = false; beat = 0; persist(); step = 'lobby'; emit(); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

/**
 * The tutorial's beat machine. Each beat is one idea and one action; `done()` tells the view when
 * "Next" may light up. Pure: the view calls the actions and renders `view()`.
 * @param {{beat?: number}} [o]
 */
export function createTutorial({ beat = 0 } = {}) {
  let i = Math.min(Math.max(0, beat | 0), TUTORIAL_BEATS.length - 1);
  const slots = new Set();             // beat 1: slots tapped (0..3)
  let dots = i > 1 ? TUTORIAL_SIGN.dots : 0; // beat 2: dots in the core (the example's dot once that beat is behind)
  let readIndex = 0;                   // beat 3: strokes read so far, in reading order
  let lastRead = null;                 // {ok, slot, meaning} of the last tap in beat 3
  let lastSlot = null;                 // the slot last picked in beat 1 (drives the one-line slot hint)
  let staked = false, trial = 0, sealed = false; // beat 4
  let forgotten = false;               // beat 5
  const subs = new Set();
  const emit = () => { for (const fn of [...subs]) fn(); };

  const order = TUTORIAL_SIGN.read; // [slot, form, meaning] in reading order
  function done(id = TUTORIAL_BEATS[i]) {
    switch (id) {
      case 'slots': return slots.size === 4;
      case 'dots': return dots === TUTORIAL_SIGN.dots;
      case 'read': return readIndex === 4;
      case 'stake': return sealed;
      case 'price': return forgotten;
      default: return false;
    }
  }

  return {
    get index() { return i; },
    get id() { return TUTORIAL_BEATS[i]; },
    get count() { return TUTORIAL_BEATS.length; },
    done,
    /** Moves on when the current beat is done; returns false otherwise or at the last beat. */
    next() { if (!done() || i >= TUTORIAL_BEATS.length - 1) return false; i++; emit(); return true; },
    back() { if (i === 0) return false; i--; emit(); return true; },
    /** Beat 1: tap a stroke. Beat 3: tap the strokes in reading order (wrong taps are reported, not punished). */
    tap(slot) {
      if (!(slot >= 0 && slot <= 3)) return { ok: false };
      if (this.id === 'slots') { slots.add(slot); lastSlot = slot; emit(); return { ok: true, slot }; }
      if (this.id === 'read') {
        if (readIndex >= 4) return { ok: false, slot, finished: true };
        const [want, , meaning] = order[readIndex];
        if (slot !== want) { lastRead = { ok: false, slot, expected: want, step: readIndex + 1 }; emit(); return lastRead; }
        readIndex++;
        lastRead = { ok: true, slot, meaning, step: readIndex };
        emit();
        return lastRead;
      }
      return { ok: false, slot };
    },
    /** A slot's name (Place, Action, Power, Delay) is the same hit target as its stroke, in both beats. */
    tapLabel(slot) { return this.tap(slot); },
    /**
     * The slot whose one-line hint is on screen: beat 1 explains the slot just picked (the first one before
     * any pick), beat 3 the stroke to read next (the last one once the sign is read). Null in other beats.
     */
    hintSlot() {
      if (this.id === 'slots') return lastSlot ?? 0;
      if (this.id === 'read') return order[Math.min(readIndex, 3)][0];
      return null;
    },
    /** Beat 2: tapping the core cycles the dots 0 → 1 → 2 → 3 → 0. */
    tapCore() { if (this.id !== 'dots') return dots; dots = (dots + 1) % 4; emit(); return dots; },
    /** Beat 4: stake 10 silk (once). */
    stake() { if (this.id !== 'stake' || staked) return false; staked = true; trial = 0; emit(); return true; },
    /** Beat 4: one trial passes; at the example's trial the sign is revealed and sealed. */
    tickTrial() {
      if (!staked || sealed) return trial;
      trial++;
      if (trial >= TUTORIAL_SIGN.trial) { trial = TUTORIAL_SIGN.trial; sealed = true; }
      emit();
      return trial;
    },
    /** Beat 5: forget the example memory for a vision (once). */
    forget() { if (this.id !== 'price' || forgotten) return false; forgotten = true; emit(); return true; },
    /** Beat 1 and 3: the strokes already tapped / read (slot indices). */
    tapped() { return this.id === 'read' ? order.slice(0, readIndex).map(([s]) => s) : [...slots]; },
    /** Beat 3: the slot the next tap should hit, or null when finished. */
    expected() { return this.id === 'read' && readIndex < 4 ? order[readIndex][0] : null; },
    view() {
      const silk = !staked ? TUTORIAL_SIGN.silk.start : sealed ? TUTORIAL_SIGN.silk.paid : TUTORIAL_SIGN.silk.staked;
      return { index: i, id: TUTORIAL_BEATS[i], count: TUTORIAL_BEATS.length, done: done(), slots: [...slots], hintSlot: this.hintSlot(), dots, readIndex, lastRead, staked, trial, sealed, silk, forgotten };
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
