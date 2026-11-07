import * as E from '../../src/game/engine.js';
import { POLICIES, makeChooser } from './policies.mjs';
import { applyToEngine } from './engine-apply.mjs';

/** Plays one full season headless with a scripted policy; yields every intermediate state via onStep. */
export function playSeason(seed, policy, rules, onStep = () => {}) {
  E.newSeason(seed, { rules });
  const pr = makeChooser(seed);
  let guard = 0;
  while (E.S.phase !== 'end' && guard++ < 400) {
    let n = 0, it, step = 0;
    while (step++ < 15 && (it = POLICIES[policy](E.S, E, pr, n))) {
      if (it.type === 'anchor') n++;
      applyToEngine(it);
      onStep(E.S);
      if (it.type === 'vote') break;
    }
    if (E.S.phase === 'play') { E.endTick(); onStep(E.S); }
  }
  return E.S;
}
