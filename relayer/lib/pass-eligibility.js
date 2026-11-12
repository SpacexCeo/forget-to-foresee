// Whitelist pass eligibility from the guest's stored expedition log (story TZ §3.4, §11.3): the log is read from
// FTF_EXPEDITION_DIR/<guest>.jsonl (append-only, one entry per line), its hash chain is verified with the shared rules
// (expedition-rules/expedition-log.js verifyLog), then expedition-rules/portal-eligibility.js decides: exactly one
// portal_paid of 10,000 silk, covered by verifiable income earned before it. The client can never supply a number.
// The rules modules are loaded lazily; where they are absent, nobody is eligible (an honest default, never a guess).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GUEST_RE = /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*(\.[a-z0-9]+([-_][a-z0-9]+)*)*$/;

/** The stored log of one guest, or null when there is none (or the name is not a plain account id). */
export function loadLog(dir, guest) {
  if (!dir || !GUEST_RE.test(String(guest))) return null;
  let text;
  try { text = readFileSync(join(dir, guest + '.jsonl'), 'utf8'); } catch { return null; }
  const out = [];
  for (const line of text.split('\n')) { if (!line.trim()) continue; try { out.push(JSON.parse(line)); } catch { return null; } }
  return out;
}

export async function loadRules() {
  try {
    const [log, el] = await Promise.all([import('./expedition-rules/expedition-log.js'), import('./expedition-rules/portal-eligibility.js')]);
    return typeof log.verifyLog === 'function' && typeof el.portalEligibility === 'function' ? { verifyLog: log.verifyLog, portalEligibility: el.portalEligibility, feeC: el.PORTAL_FEE_C } : null;
  } catch { return null; }
}

/**
 * (guest) => Promise<{eligible, paid, earned, needed, reason}> in whole silk.
 * @param {{dir: string, rules?: object|Promise<object|null>, load?: (dir: string, guest: string) => object[]|null}} o
 */
export function createLogEligibility({ dir, rules = loadRules(), load = loadLog }) {
  return async (guest) => {
    const r = await rules;
    const needed = r && r.feeC ? r.feeC / 100 : 10_000;
    if (!r) return { eligible: false, paid: false, earned: 0, needed, reason: 'rules_unavailable' };
    const log = load(dir, guest);
    if (!log || !log.length) return { eligible: false, paid: false, earned: 0, needed, reason: 'no_log' };
    const v = r.verifyLog(log);
    if (!v || !v.ok) return { eligible: false, paid: false, earned: 0, needed, reason: 'log_invalid' };
    const e = r.portalEligibility(log);
    return { eligible: !!e.eligible, paid: !!e.paid, earned: Math.floor((e.earnedC || 0) / 100), needed: Math.round((e.neededC || needed * 100) / 100), reason: e.reason || null };
  };
}
