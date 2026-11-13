// The starter guide (sprint §4.11): eight steps a stranger can follow, in order, persisted (ftf.guide.v2). Pure: the
// host feeds events (moved, camera, talked:elder, journal, hit, bag, market, portal) and shows the active step in the
// tracker. A step is done only when it is the active one (the order holds). The last step names the fee from config.
export const GUIDE_KEY = 'ftf.guide.v2';
export const GUIDE_STEPS = Object.freeze([
  Object.freeze({ id: 'move', text: 'Move with W A S D. Hold Shift to run.', on: 'moved' }),
  Object.freeze({ id: 'camera', text: 'Press R to turn the camera.', on: 'camera' }),
  Object.freeze({ id: 'talk', text: 'Walk up to the Elder and press E.', on: 'talked:elder' }),
  Object.freeze({ id: 'journal', text: 'Press J to open your Journal.', on: 'journal' }),
  Object.freeze({ id: 'fight', text: 'Find a stone spider. Press F to strike, Q to fire your Lance.', on: 'hit' }),
  Object.freeze({ id: 'loot', text: 'Walk over a chest to pick it up. Press I to open your bag.', on: 'bag' }),
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
export function guideEvent(g, event) {
  const step = activeStep(g);
  if (!step || step.on !== event) return { state: g, completed: null, finished: false, reward: 0 };
  const done = [...g.done, step.id], finished = done.length === GUIDE_STEPS.length;
  const reward = finished && !g.rewarded ? GUIDE_XP : 0;
  return { state: { ...g, done, rewarded: g.rewarded || finished }, completed: step.id, finished, reward };
}

/** What the tracker shows: {n, total, text} or null when finished or hidden. */
export function guideView(g, fee) {
  const step = activeStep(g); if (!step || g.hidden) return null;
  return { n: g.done.length + 1, total: GUIDE_STEPS.length, id: step.id, text: step.text.replace('{fee}', String(fee)) };
}
