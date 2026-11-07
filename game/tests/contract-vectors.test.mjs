// The NEAR contract's test vectors must be exactly what engine.js + crypto.js produce today.
// If this fails after a rules change, run `npm run vectors` and re-run the contract tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildVectors, serialize, OUT } from '../scripts/gen-contract-vectors.mjs';
import { verifyProof } from '../src/game/crypto.js';

test('contract vectors are up to date with engine.js v2 and crypto.js', () => {
  assert.equal(readFileSync(OUT, 'utf8'), serialize(buildVectors()));
});

test('contract vectors: every path verifies with crypto.js, salts are 32 bytes', () => {
  const v = JSON.parse(readFileSync(OUT, 'utf8'));
  for (const s of [...v.seasons, ...v.edgeTrees]) {
    assert.equal(s.leaves.length, s.leafCount);
    for (const l of s.leaves) {
      assert.match(l.salt, /^[0-9a-f]{64}$/);
      assert.ok(verifyProof(l.leaf, l.path, s.scheduleRoot), `${s.seasonId}#${l.index}`);
    }
  }
});