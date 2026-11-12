// The one pass claim service of this process (api/pass/*.js share it): config from the environment, the store in
// FTF_PASS_DIR, and the eligibility source: the guest's stored expedition log in FTF_EXPEDITION_DIR replayed with the
// shared rules (lib/pass-eligibility.js). Without a log directory, nobody is eligible.
import { createPassService, notYetEligible, passEnv } from './pass.js';
import { createLogEligibility } from './pass-eligibility.js';

let eligibility = process.env.FTF_EXPEDITION_DIR ? createLogEligibility({ dir: process.env.FTF_EXPEDITION_DIR }) : notYetEligible;
let service = null;
/** Wires the replayed-log eligibility (story module): (guest) => Promise<{eligible, paid, earned, needed}>. */
export function setPassEligibility(fn) { eligibility = fn; service = null; }
export function passService(env = process.env) {
  if (!service) service = createPassService({ cfg: passEnv(env), eligibility: (g) => eligibility(g) });
  return service;
}
