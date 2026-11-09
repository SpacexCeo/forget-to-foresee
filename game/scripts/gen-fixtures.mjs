// Generates parity fixtures from the 2D prototype (the reference; its rules are frozen).
// Usage: npm run fixtures
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPrototype } from '../tests/lib/prototype.mjs';
import { POLICIES, makeChooser } from '../tests/lib/policies.mjs';
import { stateHash } from '../tests/lib/normalize.mjs';

const OUT = fileURLToPath(new URL('../tests/fixtures/parity/', import.meta.url));
const SEEDS = Array.from({ length: 20 }, (_, i) => 1001 + i);
const MAX_PER_TICK = 15;

/** Plays one season with a policy against the prototype and records every intent. */
export function record(seed, policyName, P = loadPrototype()) {
  const policy = POLICIES[policyName], pr = makeChooser(seed);
  P.newSeason(seed);
  const intents = [{ type: 'init', seed, h: stateHash(P.state()) }];
  const burned = new Set();
  let guard = 0;
  while (guard++ < 400) {
    const S = P.state();
    if (S.phase === 'end') break;
    let n = 0, step = 0, it;
    while (step++ < MAX_PER_TICK && (it = policy(P.state(), P.api, pr, n))) {
      if (it.type === 'anchor') n++;
      if (it.type === 'forget') burned.add(P.state().mem.find((m) => m.id === it.id).kind + (it.purpose === 'key' ? ':key' : ''));
      P.apply(it);
      intents.push({ ...it, h: stateHash(P.state()) });
      if (it.type === 'vote' || P.state().phase === 'end') break;
    }
    if (P.state().phase === 'play') { P.apply({ type: 'end' }); intents.push({ type: 'end', h: stateHash(P.state()) }); }
  }
  const S = P.state();
  return {
    seed, policy: policyName, rulesVersion: 'baseline-2d-1', intents,
    final: { tick: S.tick, phase: S.phase, outcome: S.outcome, H: S.H, silk: S.silk, crisis: S.rumor, keySpoken: S.pepelKeyKnown && !S.isolated[2], burned: [...burned].sort(), scroll: S.frag.filter((f) => f.st === 'scroll').length },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
  const cov = { outcomes: {}, burned: {}, crisis: 0, keySpoken: 0, intents: 0 };
  for (const policy of Object.keys(POLICIES)) for (const seed of SEEDS) {
    const fx = record(seed, policy);
    writeFileSync(`${OUT}${policy}-${seed}.json`, JSON.stringify(fx));
    cov.outcomes[fx.final.outcome] = (cov.outcomes[fx.final.outcome] || 0) + 1;
    fx.final.burned.forEach((k) => (cov.burned[k] = (cov.burned[k] || 0) + 1));
    cov.crisis += fx.final.crisis ? 1 : 0; cov.keySpoken += fx.final.keySpoken ? 1 : 0; cov.intents += fx.intents.length;
  }
  writeFileSync(`${OUT}_coverage.json`, JSON.stringify(cov, null, 2) + '\n');
  console.log(JSON.stringify(cov, null, 2));
}
