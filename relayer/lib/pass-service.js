// The one pass claim service of this process (api/pass/*.js share it): config from the environment, the store in
// FTF_PASS_DIR, and the eligibility source. Until the story module is wired (setPassEligibility), nobody is eligible.
import { createPassService, notYetEligible, passEnv } from './pass.js';

let eligibility = notYetEligible;
let service = null;
/** Wires the replayed-log eligibility (story module): (guest) => Promise<{eligible, paid, earned, needed}>. */
export function setPassEligibility(fn) { eligibility = fn; service = null; }
export function passService(env = process.env) {
  if (!service) service = createPassService({ cfg: passEnv(env), eligibility: (g) => eligibility(g) });
  return service;
}
