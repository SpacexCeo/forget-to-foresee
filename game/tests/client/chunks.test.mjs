// The entry's static imports must not pull a lazy chunk forward (owner, 11.11: main.js importing a module that the
// chunk rules placed in `ui` made `ui` evaluate before `play`, a TDZ error in the live bundle only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chunkFor } from '../../build/chunks.js';

test('every module main.js imports statically lands in the boot chunk (or stays in the entry)', () => {
  const main = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  const statics = [...main.matchAll(/^import\s+(?:[^'"]+from\s+)?['"](\.[^'"]+)['"]/gm)].map((m) => m[1]);
  assert.ok(statics.length >= 2);
  for (const rel of statics) {
    const id = '/repo/game/src/' + rel.replace(/^\.\//, '');
    const chunk = chunkFor(id);
    assert.ok(chunk === 'boot' || chunk === undefined, `${rel} → chunk ${chunk}: a static import from the entry must be in "boot"`);
  }
});
