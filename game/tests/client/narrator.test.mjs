// Narrator subtitles (feature 10): the three moments in order, each once per season, none while films tell them,
// none during a film; the lines render in all five locales for every outcome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from '../lib/mini-dom.mjs';
import { narratorMoment, NARRATOR_OUTCOMES } from '../../src/play/narrator.js';
import { createPlayI18n, renderMsg } from '../../src/play/i18n.js';

const obs = (o = {}) => ({ season: { seasonId: 's1', tick: o.tick ?? 3, outcome: o.outcome ?? null }, you: { zone: o.zone ?? 'island' } });

test('moments: the first Shell, the crisis, the finale', () => {
  const seen = new Set();
  assert.equal(narratorMoment(obs(), seen), null);
  assert.equal(narratorMoment(obs({ zone: 'shell' }), seen).id, 'shell');
  seen.add('shell');
  assert.equal(narratorMoment(obs({ zone: 'shell', tick: 12 }), seen), null);
  assert.equal(narratorMoment(obs({ tick: 13 }), seen).id, 'crisis');
  seen.add('crisis');
  const f = narratorMoment(obs({ tick: 17, outcome: 'weapon' }), seen);
  assert.deepEqual(f, { id: 'finale', key: 'narr.finale', args: { outcome: 'weapon' } });
  assert.equal(narratorMoment(obs({ outcome: 'void' }), new Set()).args.outcome, 'other');
  seen.add('finale');
  assert.equal(narratorMoment(obs({ tick: 17, outcome: 'weapon' }), seen), null);
  assert.equal(narratorMoment(null, seen), null);
});

test('every line renders in five locales, every outcome', () => {
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) {
    const m = createPlayI18n(loc);
    for (const k of ['narr.who', 'narr.shell', 'narr.crisis']) { const s = renderMsg(m, k); assert.ok(s && s !== k, `${loc} ${k}`); }
    const seen = new Set();
    for (const o of [...NARRATOR_OUTCOMES, 'other']) {
      const s = renderMsg(m, 'narr.finale', { outcome: o });
      assert.ok(s && !/[{}]/.test(s) && !seen.has(s), `${loc} finale ${o}: ${s}`); seen.add(s);
    }
  }
});

test('the strip: shown once, remembered per season, silent while films are on or playing', async () => {
  installDom();
  globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || ((f) => setTimeout(f, 0));
  const { attachNarrator } = await import('../../src/play/narrator.js');
  const store = new Map(); const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const fns = []; const session = { obs: obs(), on: (ev, f) => { fns.push(f); return () => {}; } };
  const push = (o) => { session.obs = o; fns.forEach((f) => f()); };
  const root = globalThis.document.createElement('div'); globalThis.document.body.append(root);
  const said = [];
  let films = false, playing = false;
  const n = attachNarrator({ root, session, t: (k) => k, storage, filmsOn: () => films, filmPlaying: () => playing, narration: () => ({ say: (k) => said.push(k) }) });
  assert.equal(n.current, null);
  push(obs({ zone: 'shell' }));
  assert.equal(n.current.id, 'shell'); assert.equal(n.el.hidden, false); assert.deepEqual(said, ['narr.shell']);
  playing = true; push(obs({ tick: 13 }));
  assert.equal(n.current.id, 'shell', 'a film plays: the crisis line is dropped');
  playing = false; films = true; push(obs({ tick: 17, outcome: 'gift' }));
  assert.equal(n.current.id, 'shell', 'films tell the finale');
  assert.deepEqual(JSON.parse(store.get('ftf.narrator.s1')), ['shell', 'crisis']);
  n.dispose();
});
