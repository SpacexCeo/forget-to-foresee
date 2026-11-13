import test from 'node:test';
import assert from 'node:assert/strict';
import { wanted, stepView, STEPS } from '../../src/ui/judge-path.js';
import en from '../../src/play/locales/en.js';

const t = (k, a = {}) => String(en[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => a[x]);

test('judge path: only ?judge=1 turns it on', () => {
  assert.equal(wanted('?judge=1'), true);
  assert.equal(wanted('?judge=0'), false);
  assert.equal(wanted(''), false);
  assert.equal(wanted('?demo=judge'), false);
});

test('judge path: every step has English text and an https proof link', () => {
  for (let i = 0; i < STEPS; i++) {
    const v = stepView(t, i);
    assert.equal(v.n, i + 1);
    assert.ok(!v.text.startsWith('judge.'), v.text);
    assert.match(v.proof, /^https:\/\//);
  }
  assert.equal(stepView(t, 99).n, STEPS);
});
