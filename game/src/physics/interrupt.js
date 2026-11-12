// Actions interrupt locomotion (owner, 12.11: "casting a skill must interrupt running"). A cast (Lance, Snare) or a
// strike stops Iris where she is: the click-to-walk target, the walk route and the run it started are cancelled, the
// stick and keys are ignored while she is rooted, and afterwards she stands until the player moves again (a key held
// through the cast may carry on once the root ends; nothing resumes by itself). The dash stays a movement action. Pure.

/** Seconds a strike roots her (the swing's step and follow-through; the casts are rooted by town-casting.js). */
export const STRIKE_ROOT = 0.32;

/**
 * Stops the walk orders and roots her for `seconds`.
 * @param {{moveTarget: any, moveRun: boolean, rootUntil: number}} s locomotion state (mutated)
 * @param {{now: number, seconds?: number, cancel?: () => void, character?: {vel: number[], speed?: number}}} o
 *   now in ms; cancel stops the walk routes (play / town flow) and hides the marker; character's velocity is zeroed (she plants)
 */
export function interruptLocomotion(s, { now, seconds = 0, cancel = null, character = null }) {
  s.moveTarget = null;
  s.moveRun = false;
  s.rootUntil = Math.max(s.rootUntil || 0, now + seconds * 1000);
  if (cancel) cancel();
  if (character) { character.vel = [0, 0]; if ('speed' in character) character.speed = 0; }
  return s;
}

/** Whether movement input counts now (false while rooted by a strike or while a cast winds up and lets go). */
export const canMove = (s, now, casting = false) => !casting && now >= (s.rootUntil || 0);
