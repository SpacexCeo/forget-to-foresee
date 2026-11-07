// Gate G1: the headless engine must reproduce the 2D prototype exactly.
// Each fixture is a season recorded from prototype-2d/index.html (npm run fixtures).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as E from '../src/game/engine.js';
import { stateHash, normalize } from './lib/normalize.mjs';
import { loadPrototype } from './lib/prototype.mjs';
import { applyToEngine } from './lib/engine-apply.mjs';

const DIR = fileURLToPath(new URL('./fixtures/parity/', import.meta.url));
const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));

/** Names the top-level fields that differ, replaying the prototype to the same point. */
function explain(fx, upto) {
  const P = loadPrototype();
  P.newSeason(fx.seed);
  for (const it of fx.intents.slice(1, upto + 1)) P.apply(it);
  const a = normalize(P.state()), b = normalize(E.S);
  return Object.keys({ ...a, ...b }).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => `${k}: 2D=${JSON.stringify(a[k])?.slice(0, 160)} engine=${JSON.stringify(b[k])?.slice(0, 160)}`).join('\n');
}

assert.ok(files.length >= 60, 'expected at least 60 parity fixtures');

for (const f of files) {
  test(`parity ${f}`, () => {
    const fx = JSON.parse(readFileSync(DIR + f, 'utf8'));
    E.newSeason(fx.seed, { rules: 'baseline-2d-1' });
    assert.equal(stateHash(E.S), fx.intents[0].h, 'initial state differs');
    fx.intents.slice(1).forEach((it, k) => {
      const r = applyToEngine(it);
      assert.ok(r.ok, `intent #${k + 1} ${JSON.stringify(it)} rejected by engine: ${r.reason}`);
      if (stateHash(E.S) !== it.h) assert.fail(`diverged after intent #${k + 1} ${it.type} (tick ${E.S.tick})\n${explain(fx, k + 1)}`);
    });
    assert.equal(E.S.outcome, fx.final.outcome);
  });
}
