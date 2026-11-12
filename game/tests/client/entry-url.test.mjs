// One entry (owner 12.11): ?demo=judge is an alias of the default link; main.js normalises the address first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeEntry } from '../../src/entry-url.js';

test('?demo=judge is dropped from the address; other parameters stay; anything else is untouched', () => {
  assert.deepEqual(normalizeEntry('?demo=judge'), { search: '', changed: true });
  assert.deepEqual(normalizeEntry('?demo=judge&mode=walk'), { search: '?mode=walk', changed: true });
  assert.deepEqual(normalizeEntry('?mode=walk&demo=judge&tier=low'), { search: '?mode=walk&tier=low', changed: true });
  assert.deepEqual(normalizeEntry('?story=0'), { search: '?story=0', changed: false });
  assert.deepEqual(normalizeEntry(''), { search: '', changed: false });
});

test('main.js imports the entry module before anything else reads the address', () => {
  const src = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  const first = src.split('\n').find((l) => l.startsWith('import '));
  assert.match(first, /^import '\.\/entry-url\.js';/);
});
