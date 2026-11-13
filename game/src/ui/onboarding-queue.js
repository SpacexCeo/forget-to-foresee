// One onboarding queue (design review 13.11, P0 "overlay pile-up"): the Day-1 name prompt, the "What waits for you"
// card and the guide used to open on top of each other and on top of open windows. Every first-time overlay now runs
// through runOnboarding(id, fn): one at a time, in the fixed order name -> intro (dialogue and card) -> guide, whatever
// order they were asked in. While one runs, open windows are told to close ('ftf:close-windows' on window) and the
// window hotkeys stay blocked (onboardingActive()). Pure apart from the window events.

export const ORDER = Object.freeze(['name', 'intro', 'guide']);
const rank = (id) => { const i = ORDER.indexOf(id); return i < 0 ? ORDER.length : i; };

let active = null;
const pending = [];
const subs = new Set();
let gate = null;   // resolves when the boot has settled, so the earlier steps get the chance to enqueue first
const expected = new Map();   // id -> deadline (ms): a step announced early (boot knows Day 1 will ask the name) holds back later ones

function notify(win) {
  for (const fn of [...subs]) { try { fn(active); } catch { /* a listener's error stays there */ } }
  try { if (win && win.dispatchEvent) win.dispatchEvent(new CustomEvent('ftf:onboarding', { detail: { active } })); } catch { /* */ }
}

/** Wait for the boot (the loading cover lifted) plus a short settle, once. */
function settled(win, settleMs) {
  if (!gate) gate = (async () => {
    const ua = (win && win.navigator && win.navigator.userAgent) || '';
    if (!ua || /Node\.js|jsdom/i.test(ua)) return;                                     // not a browser page (tests): no settle
    for (let i = 0; i < 1200 && !(win.__ftfBootMarks && win.__ftfBootMarks.done); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, settleMs));
  })();
  return gate;
}

async function pump(win) {
  if (active || !pending.length) return;
  pending.sort((a, b) => rank(a.id) - rank(b.id) || a.seq - b.seq);
  const now = Date.now();
  for (const [id, until] of expected) if (until <= now) expected.delete(id);
  const waitFor = [...expected.keys()].filter((id) => rank(id) < rank(pending[0].id));
  if (waitFor.length) { setTimeout(() => pump(win), 250); return; }   // an earlier step is on its way
  const job = pending.shift();
  active = job.id; notify(win);
  try { if (win && win.dispatchEvent) win.dispatchEvent(new CustomEvent('ftf:close-windows', { detail: { by: job.id } })); } catch { /* */ }
  try { job.resolve(await job.fn()); } catch (e) { job.reject(e); }
  active = null; notify(win);
  pump(win);
}

let seq = 0;
/**
 * Queue a first-time overlay. Resolves with fn()'s result when it has run. `wait: false` skips the boot settle
 * (tests). The order is fixed by ORDER, not by who asked first.
 */
export function runOnboarding(id, fn, { win = globalThis.window, wait = true, settleMs = 600 } = {}) {
  if (!win) { try { return Promise.resolve(fn()); } catch (e) { return Promise.reject(e); } }   // no page (unit tests): nothing can pile up
  expected.delete(id);
  return new Promise((resolve, reject) => {
    pending.push({ id, fn, resolve, reject, seq: seq++ });
    (wait ? settled(win, settleMs) : Promise.resolve()).then(() => pump(win));
  });
}

/** Announce a step that will be queued soon (e.g. the Day-1 name): later steps wait for it, at most `ms`. */
export function expectOnboarding(id, ms = 20000) { expected.set(id, Date.now() + ms); }

/** The id of the overlay that runs now, or null. */
export const onboardingActive = () => active;
/** Listen for changes (the running id or null). Returns an unsubscribe. */
export const onOnboarding = (fn) => { subs.add(fn); return () => subs.delete(fn); };
/** Window hotkeys (J, C, N, B, M, I) must not open anything while this is true. */
export const blocksWindows = () => active != null;

/** Tests only: forget everything. */
export function _resetOnboarding() { active = null; pending.length = 0; subs.clear(); gate = null; seq = 0; expected.clear(); }
