// Rules v2: strong salts must not change gameplay; each approved defect fix is pinned by a test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as E from '../src/game/engine.js';
import { sha256, proofFor, verifyProof } from '../src/game/crypto.js';
import { normalize } from './lib/normalize.mjs';
import { loadPrototype } from './lib/prototype.mjs';
import { applyToEngine } from './lib/engine-apply.mjs';
import { POLICIES, makeChooser } from './lib/policies.mjs';

const DIR = fileURLToPath(new URL('./fixtures/parity/', import.meta.url));
const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));

/** Gameplay view: the normalized state without salts, hashes and commitments. */
function gameplay(S) {
  const n = normalize(S);
  for (const k of ['levels', 'root', 'seedCommit', 'seasonId', 'seedSalt']) delete n[k];
  n.events = n.events.map(({ salt, leaf, ...rest }) => rest);
  n.proofs = n.proofs.map(({ leaf, ...rest }) => rest);
  if (n.pepelKey) n.pepelKey = { phrase: n.pepelKey.phrase };
  if (n.pKey) n.pKey = { phrase: n.pKey.phrase };
  return JSON.stringify(n);
}

test('v2 salts leave every recorded season unchanged (v2-crypto vs prototype)', () => {
  for (const f of files) {
    const fx = JSON.parse(readFileSync(DIR + f, 'utf8'));
    const P = loadPrototype();
    P.newSeason(fx.seed);
    E.newSeason(fx.seed, { rules: 'v2-crypto' });
    assert.equal(gameplay(E.S), gameplay(P.state()), `${f}: initial`);
    fx.intents.slice(1).forEach((it, k) => {
      P.apply(it);
      assert.ok(applyToEngine(it).ok, `${f}: intent #${k + 1} rejected`);
      if (it.type === 'end' || it.type === 'vote') assert.equal(gameplay(E.S), gameplay(P.state()), `${f}: diverged at #${k + 1}`);
    });
  }
});

test('v2 commitments: 32-byte salts, domain-separated leaves that verify, hidden seed', () => {
  const S = E.newSeason(777);
  assert.equal(S.rulesVersion, 'v2');
  assert.match(S.seasonId, /^[0-9a-f]{16}$/);
  assert.notEqual(S.seedCommit, sha256('seed:777'));
  S.events.forEach((e, i) => {
    assert.match(e.salt, /^[0-9a-f]{64}$/);
    assert.notEqual(e.leaf, sha256(JSON.stringify({ t: e.t, place: e.place, action: e.action, power: e.power, delay: e.delay, dots: e.dots }) + e.salt));
    assert.ok(verifyProof(e.leaf, proofFor(S.levels, i), S.root));
  });
  assert.match(S.pepelKey.salt, /^[0-9a-f]{64}$/);
  assert.equal(S.pepelKey.hash, E.keyCommit(S.pepelKey.phrase, S.pepelKey.salt));
  E.startGame('my phrase');
  assert.equal(S.pKey.hash, E.keyCommit('my phrase', S.pKey.salt));
});

test('injected randomBytes makes v2 commitments reproducible', () => {
  const bytes = (n) => new Uint8Array(n).fill(7);
  const a = E.newSeason(55, { randomBytes: bytes }).root;
  const b = E.newSeason(55, { randomBytes: bytes }).root;
  assert.equal(a, b);
  assert.notEqual(E.newSeason(55).root, a);
});

test('speaking the key works under v2 commitments', () => {
  E.newSeason(9001); E.startGame('');
  E.S.isolated[2] = true; E.S.pepelKeyKnown = true; E.S.ap = 3;
  E.S.broken.push('0-2');
  assert.ok(E.speakKey().ok);
  assert.equal(E.S.isolated[2], false);
  assert.equal(E.S.T[2][0], 90);
});

test('fix: mediation never pushes trust above 100', () => {
  E.newSeason(31); E.startGame('');
  E.S.broken.push('1-3'); E.S.T[1][0] = 98; E.S.T[3][0] = 99; E.S.ap = 3; E.S.silk[0] = 50;
  assert.ok(E.mediate(1, 3).ok);
  assert.equal(E.S.T[1][0], 100);
  assert.equal(E.S.T[3][0], 100);
});

test('fix: AI balances never go negative over 60 full v2 seasons', () => {
  const api = { ...E, TICKS: E.TICKS, DEADLINE: E.DEADLINE };
  let minSilk = Infinity;
  for (const policy of Object.keys(POLICIES)) for (let seed = 1001; seed <= 1020; seed++) {
    const pr = makeChooser(seed);
    E.newSeason(seed);
    for (let guard = 0; guard < 400 && E.S.phase !== 'end'; guard++) {
      let n = 0, it, step = 0;
      while (step++ < 15 && (it = POLICIES[policy](E.S, api, pr, n))) {
        if (it.type === 'anchor') n++;
        assert.ok(applyToEngine(it).ok, `${policy}-${seed}: ${JSON.stringify(it)}`);
        minSilk = Math.min(minSilk, ...E.S.silk.slice(1));
        if (E.S.phase === 'end') break;
      }
      if (E.S.phase === 'play') E.endTick();
      minSilk = Math.min(minSilk, ...E.S.silk.slice(1));
    }
  }
  assert.ok(minSilk >= 0, `min AI silk ${minSilk}`);
});

test('fix: changing the reading rule settles tension at 100 (baseline does not)', () => {
  E.newSeason(12); E.startGame(''); E.S.H = 100;
  E.setRule('dots');
  assert.equal(E.S.outcome, 'gone');
  E.newSeason(12, { rules: 'baseline-2d-1' }); E.startGame(''); E.S.H = 100;
  E.setRule('dots');
  assert.equal(E.S.phase, 'play');
});
