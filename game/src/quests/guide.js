// The starter guide (sprint §4.11): eight steps a stranger can follow, in order, persisted (ftf.guide.v2). Pure: the
// host feeds events (moved, camera, talked:elder, journal, hit, bag, market, portal) and shows the active step in the
// tracker. Steps complete in order, but an event that comes before its step is remembered (`seen`): when that step
// becomes the active one it completes at once, so nothing the player already did blocks the guide (owner P0 14.11:
// the chest was always picked up during the fight, before the loot step, and the step never counted). The last step
// names the fee from config.
export const GUIDE_KEY = 'ftf.guide.v2';
export const GUIDE_STEPS = Object.freeze([
  Object.freeze({ id: 'move', text: 'Move with W A S D. Hold Shift to run.', on: 'moved' }),
  Object.freeze({ id: 'camera', text: 'Press R to turn the camera.', on: 'camera' }),
  Object.freeze({ id: 'talk', text: 'Walk up to the Elder and press E.', on: 'talked:elder' }),
  Object.freeze({ id: 'journal', text: 'Press J to open your Journal.', on: 'journal' }),
  Object.freeze({ id: 'fight', text: 'Find a stone spider. Press F to strike, Q to fire your Lance.', on: 'hit' }),
  Object.freeze({ id: 'loot', text: 'Walk over a chest to pick it up. Press I to open your bag.', on: Object.freeze(['pickup', 'bag']) }), // the pickup itself, or the bag
  Object.freeze({ id: 'market', text: 'Press B to open the Market and sell a resource for silk.', on: 'market' }),
  Object.freeze({ id: 'home', text: 'Collect {fee} silk on chain, then step into the Gate-Loom to go home.', on: 'portal' }),
]);
export const GUIDE_XP = 10;

export const initialGuide = () => ({ v: 2, done: [], hidden: false, rewarded: false });
export function loadGuide(storage) { try { const g = JSON.parse((storage && storage.getItem(GUIDE_KEY)) || 'null'); return g && g.v === 2 && Array.isArray(g.done) ? g : initialGuide(); } catch { return initialGuide(); } }

/** The active step (or null when all are done). */
export const activeStep = (g) => GUIDE_STEPS.find((s) => !g.done.includes(s.id)) || null;

/**
 * Feeds one event; only the active step can complete. {state, completed: stepId|null, finished: boolean, reward: xp}
 * (`reward` is GUIDE_XP once, when the last step completes).
 */
/** Whether `event` completes `step` (a step may listen for one event or several). */
export const stepHears = (step, event) => (Array.isArray(step.on) ? step.on.includes(event) : step.on === event);

export function guideEvent(g, event) {
  const seen = Array.isArray(g.seen) ? g.seen : [];
  const step = activeStep(g);
  const known = GUIDE_STEPS.some((s) => stepHears(s, event));
  if (!step || !stepHears(step, event)) {
    // a later step's event, early: remembered for when that step comes up (the active one is still to do)
    const later = step && known && GUIDE_STEPS.slice(GUIDE_STEPS.indexOf(step) + 1).some((s) => stepHears(s, event)) && !seen.includes(event);
    return { state: later ? { ...g, seen: [...seen, event] } : g, completed: null, finished: false, reward: 0 };
  }
  // this step, then every next step whose event already happened
  const done = [...g.done, step.id], completedAll = [step.id];
  for (let s = activeStep({ ...g, done }); s && seen.some((e) => stepHears(s, e)); s = activeStep({ ...g, done })) { done.push(s.id); completedAll.push(s.id); }
  const finished = done.length === GUIDE_STEPS.length;
  const reward = finished && !g.rewarded ? GUIDE_XP : 0;
  return { state: { ...g, done, seen, rewarded: g.rewarded || finished }, completed: step.id, completedAll, finished, reward };
}

/** A step's text: the locale's guide.step.<id> through `tr(key, args)` (quests/say.js), else the English above. */
export function stepText(step, fee, tr = null) {
  const key = 'guide.step.' + step.id, v = tr ? tr(key, { fee }) : null;
  return v && v !== key ? v : step.text.replace('{fee}', String(fee));
}

/** What the tracker shows: {n, total, text} or null when finished or hidden. */
export function guideView(g, fee, tr = null) {
  const step = activeStep(g); if (!step || g.hidden) return null;
  return { n: g.done.length + 1, total: GUIDE_STEPS.length, id: step.id, text: stepText(step, fee, tr) };
}

/** Coach marks (sprint §4.11): steps 4, 6 and 7 point at their HUD button (the seam's first-seen bubble, once each). */
export const GUIDE_COACH = Object.freeze({ journal: '#rpg-tray-journal, .ftf-quest-log-btn', loot: '#rpg-tray-bag', market: '#rpg-tray-market' });
export const coachId = (stepId) => 'guide.' + stepId;
/** Registers the three coach marks with sprint/first-seen.js: registerTip({id, trigger: null, anchor, title, body}). */
export function registerGuideCoach(registerTip, title = (n, total) => `Guide ${n}/${total}`, tr = null) {
  for (const [id, anchor] of Object.entries(GUIDE_COACH)) {
    const n = GUIDE_STEPS.findIndex((s) => s.id === id) + 1;
    registerTip({ id: coachId(id), trigger: null, anchor, title: title(n, GUIDE_STEPS.length), body: stepText(GUIDE_STEPS[n - 1], '', tr) });
  }
}
/** The coach mark to show for the guide's active step, or null. */
export function coachFor(g) { const s = activeStep(g); return s && !g.hidden && GUIDE_COACH[s.id] ? coachId(s.id) : null; }
