// Onboarding order (spec §1): lobby → entitlement (synthetic demo) → tutorial →
// customization → first contact. Tutorial and customization never swap: a step
// can only be entered once every earlier step is done.
import { STORAGE_KEYS } from './storage.js';

export const FLOW_STEPS = Object.freeze(['lobby', 'entitlement', 'tutorial', 'customization', 'firstContact']);
const GATED = FLOW_STEPS.slice(1);

export function createOnboardingFlow(storage) {
  const saved = storage ? storage.getJSON(STORAGE_KEYS.flow) : null;
  const done = { entitlement: false, tutorial: false, customization: false };
  if (saved && saved.done) for (const k of Object.keys(done)) done[k] = saved.done[k] === true;
  // A later step can never be marked done without the earlier ones (repairs tampered storage).
  if (!done.entitlement) done.tutorial = false;
  if (!done.tutorial) done.customization = false;
  let step = 'lobby';
  const subs = new Set();
  const persist = () => { if (storage) storage.setJSON(STORAGE_KEYS.flow, { done }); };
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
    canEnter,
    goto,
    /** From the lobby: resume at the first unfinished step. */
    enter() { return goto(GATED.find((k) => k !== 'firstContact' && !done[k]) || 'firstContact'); },
    /** Marks the current step done and moves to the next one. Ignored if `s` is not current. */
    complete(s) {
      if (s !== step || !(s in done)) return false;
      done[s] = true; persist();
      return goto(FLOW_STEPS[FLOW_STEPS.indexOf(s) + 1]);
    },
    toLobby() { step = 'lobby'; emit(); },
    reset() { for (const k of Object.keys(done)) done[k] = false; persist(); step = 'lobby'; emit(); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
