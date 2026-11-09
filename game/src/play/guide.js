// The persistent three-step guide of the Shell hub: Read → Choose → See what changed. It names the
// step the player is on, from state the hub already has (no new rule, no hidden data):
//   read    inside a Shell with a sign, nothing chosen yet; on the island before the first visit or
//           after flying back in,
//   choose  inside a Shell after a choice this visit: a stake placed on this sign, or a memory forgotten,
//   see     after leaving a Shell: trials pass and the outcomes land (until the next flight).
// No DOM: node tests drive it (tests/client/reasons.test.mjs).

export const GUIDE_STEPS = ['read', 'choose', 'see'];

/**
 * @param {{inShell: boolean, chose?: boolean, afterLeave?: boolean}} s
 * @returns {'read'|'choose'|'see'}
 */
export function guideStep({ inShell, chose = false, afterLeave = false }) {
  if (inShell) return chose ? 'choose' : 'read';
  return afterLeave ? 'see' : 'read';
}

/**
 * Whether the player chose something during this visit to a Shell: a stake on the sign's target
 * (placed now or earlier), a stake placed this visit, or a memory forgotten since flying in.
 * @param {object} obs controller observation
 * @param {{staked?: boolean, forgotten?: number}|null} visit what the hub recorded on landing
 * @param {{shell:number, tick:number}|null} target the (Shell, trial) the reading card points at
 */
export function choseThisVisit(obs, visit, target) {
  if (!obs || !obs.iris) return false;
  if (visit && visit.staked) return true;
  if (visit && (obs.iris.forgotten || []).length > (visit.forgotten || 0)) return true;
  return !!(target && (obs.iris.anchors || []).some((a) => a.shell === target.shell && a.tick === target.tick));
}
