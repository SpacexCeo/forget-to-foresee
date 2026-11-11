// Collapsible town panels (src/scenes/panel-pills.js): minimise into pills that stack, expand by click or the newest
// with O, remembered in storage (quest talks excepted), live labels; town-flow wires the chevron, Esc and remote panels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPillStack, PILLS_KEY, pillKey, parsePillKey } from '../../src/scenes/panel-pills.js';
import { installDom } from '../lib/mini-dom.mjs';
import { memoryStorage } from '../../src/ui/storage.js';
import { PLAY_MESSAGES } from '../../src/play/i18n.js';

test('pills stack, expand, remember and relabel', () => {
  const { doc } = installDom();
  const storage = memoryStorage();
  const expanded = [];
  let progress = 3;
  const label = (k) => (k === 'folk:innkeeper' ? `Innkeeper · ${progress}/5` : k);
  const p = createPillStack({ doc, storage, label, onExpand: (k) => expanded.push(k) });
  p.add(pillKey('folk', 'innkeeper')); p.add(pillKey('spot', 'board')); p.add(pillKey('quest', 'baker')); p.add('folk:innkeeper');
  assert.deepEqual(p.keys, ['folk:innkeeper', 'spot:board', 'quest:baker'], 'stacked, no duplicates');
  assert.equal(p.element.childNodes.length, 3);
  assert.deepEqual(JSON.parse(storage.getItem(PILLS_KEY)), ['folk:innkeeper', 'spot:board'], 'quest talks are not remembered');
  progress = 4; p.refresh();
  assert.equal(p.element.childNodes[0].textContent, 'Innkeeper · 4/5', 'live label');
  assert.equal(p.expandLatest(), true); assert.deepEqual(expanded, ['quest:baker']);
  assert.equal(p.expand('spot:board'), true); assert.equal(p.expand('spot:board'), false);
  assert.deepEqual(p.keys, ['folk:innkeeper']);
  // a reload brings the remembered pills back
  const again = createPillStack({ doc, storage, label, onExpand: () => {} });
  assert.deepEqual(again.keys, ['folk:innkeeper']);
  assert.deepEqual(parsePillKey('spot:exchange'), { kind: 'spot', id: 'exchange' });
  assert.equal(parsePillKey('nope'), null);
});

test('town-flow: chevron on every panel, Esc closes, O expands, remote panels stay open; 40 px targets; five locales', () => {
  const src = readFileSync(new URL('../../src/scenes/town-flow.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('talkEl.replaceChildren(...kids)'), 'every panel render goes through setTalk (the chevron)');
  assert.match(src, /closePanel: \(\) => closeOpen\(\)/); assert.match(src, /expandPill: \(\) => pills\.expandLatest\(\)/);
  assert.match(src, /spotPanel && !sp && !remote/); assert.match(src, /folkTalk && !remote/);
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(boot, /townFlow\.closePanel\(\)/); assert.match(boot, /input\.hit\('KeyO'\)\) townFlow\.expandPill\(\)/);
  const css = readFileSync(new URL('../../src/scenes/panel-pills.js', import.meta.url), 'utf8');
  assert.match(css, /\.ftf-pill \{[^}]*min-height: 40px/); assert.match(css, /\.ftf-panel-min \{[^}]*width: 40px; height: 40px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  for (const loc of ['en', 'ru', 'uk', 'it', 'zh']) for (const k of ['panel.minimise', 'panel.expand', 'panel.pill.hire', 'panel.pill.ready']) assert.ok(PLAY_MESSAGES[loc][k], `${loc} ${k}`);
});
