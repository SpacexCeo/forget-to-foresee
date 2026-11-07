// Edge cases from the spec (docs/spec.md §2, appendix G) and crypto test vectors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as E from '../src/game/engine.js';
import { sha256, merkle, proofFor, verifyProof } from '../src/game/crypto.js';
import { stateHash } from './lib/normalize.mjs';
import { loadPrototype } from './lib/prototype.mjs';
import { POLICIES, makeChooser } from './lib/policies.mjs';
import { applyToEngine } from './lib/engine-apply.mjs';

/** Plays the coop policy on the prototype until `tick`, returns a deep copy of the state. */
function snapshotAt(seed, tick) {
  const P = loadPrototype(), pr = makeChooser(seed);
  P.newSeason(seed);
  while (P.state().phase !== 'end' && !(P.state().phase === 'play' && P.state().tick >= tick)) {
    let n = 0, it, step = 0;
    while (step++ < 15 && (it = POLICIES.coop(P.state(), P.api, pr, n))) { if (it.type === 'anchor') n++; P.apply(it); }
    if (P.state().phase === 'play' && P.state().tick < tick) P.apply({ type: 'end' });
  }
  return JSON.parse(JSON.stringify(P.state()));
}
/** Applies the same intent to the prototype and the engine from one snapshot. */
function both(snap, intent) {
  const P = loadPrototype();
  P.setState(JSON.parse(JSON.stringify(snap)));
  P.apply(intent);
  E.loadState(JSON.parse(JSON.stringify(snap)));
  const r = applyToEngine(intent);
  return { proto: P.state(), r };
}

test('tension reaching 100 on a player action ends the season (prototype click handler)', () => {
  const snap = snapshotAt(1001, 5);
  const s = 0, f = [0, 1, 2, 3].find((x) => !snap.pins[s + '_' + x]);
  const wrong = (snap.perm[s][f] + 1) % 4;
  snap.H = 90; snap.broken = snap.broken.filter((k) => k !== '0-1');
  snap.bought.push({ s, f, m: wrong, from: 1, honest: false, revealed: false });
  const { proto, r } = both(snap, { type: 'ask', s, f, m: wrong });
  assert.ok(r.ok);
  assert.equal(proto.outcome, 'gone');
  assert.equal(E.S.outcome, 'gone');
  assert.equal(stateHash(E.S), stateHash(proto));
});

test('anchor without silk is rejected and changes nothing', () => {
  const snap = snapshotAt(1002, 4);
  snap.silk[0] = 5; snap.ap = 3;
  const before = stateHash(snap);
  const { proto, r } = both(snap, { type: 'anchor', p: 0, t: snap.tick + 1 });
  assert.deepEqual(r, { ok: false, reason: 'no_silk' });
  assert.equal(stateHash(E.S), before);
  assert.equal(stateHash(proto), before);
});

test('second contribution is rejected', () => {
  const snap = snapshotAt(1003, 7);
  E.loadState(JSON.parse(JSON.stringify(snap)));
  if (E.S.frag[0].st === 'held') assert.ok(E.contributeMine().ok);
  assert.equal(E.contributeMine().reason, E.S.frag[0].st === 'scroll' ? 'no_fragment' : 'no_fragment');
});

test('tick 12 → 13 runs the crisis exactly once', () => {
  const snap = snapshotAt(1004, 12);
  const { proto } = both(snap, { type: 'end' });
  assert.equal(E.S.tick, 13);
  assert.equal(E.S.isolated[2], true);
  assert.equal(stateHash(E.S), stateHash(proto));
});

test('engine guards what the 2D UI only hid: key vision needs the language', () => {
  const snap = snapshotAt(1005, 13);
  E.loadState(JSON.parse(JSON.stringify(snap)));
  E.S.pins = {}; E.S.chron = []; E.S.bought = []; E.S.isolated[2] = true; E.S.pepelKeyKnown = false; E.S.ap = 3;
  const heavy = E.S.mem.find((m) => m.w >= 3) || E.S.mem[0];
  const before = stateHash(E.S);
  const r = E.forget(heavy.id, 'key');
  assert.equal(r.ok, false);
  assert.equal(stateHash(E.S), before);
});

test('parity test detects a changed intent', () => {
  E.newSeason(1006); E.startGame('x'); E.setRule('dots');
  const a = stateHash(E.S);
  E.newSeason(1006); E.startGame('x'); E.setRule('top');
  assert.notEqual(stateHash(E.S), a);
});

test('sha256 matches node:crypto, including Cyrillic', () => {
  for (const s of ['', 'abc', 'Ирис', 'вода помнит камень' + 'a1b2c3d4', 'x'.repeat(1000)]) {
    assert.equal(sha256(s), createHash('sha256').update(s, 'utf8').digest('hex'));
  }
});

test('every season leaf verifies against the root; tampering is rejected', () => {
  const S = E.newSeason(4242);
  S.events.forEach((e, i) => assert.ok(verifyProof(e.leaf, proofFor(S.levels, i), S.root)));
  const p = proofFor(S.levels, 3);
  assert.equal(verifyProof(S.events[4].leaf, p, S.root), false, 'wrong leaf');
  assert.equal(verifyProof(S.events[3].leaf, p, sha256('other')), false, 'wrong root');
  const bad = p.map((x, k) => (k === 0 ? { ...x, h: sha256('x') } : x));
  assert.equal(verifyProof(S.events[3].leaf, bad, S.root), false, 'wrong path');
  const odd = merkle(['a', 'b', 'c'].map(sha256));
  [0, 1, 2].forEach((i) => assert.ok(verifyProof(sha256('abc'[i]), proofFor(odd, i), odd[odd.length - 1][0])));
});
