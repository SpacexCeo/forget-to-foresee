// Entering and leaving a Shell must not rebuild the world (owner 12.11, docs/qa/shell-transitions.md): the island is
// held resident during a visit, and the hall is warmed ahead of the first visit with its own lights on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL('../../src/' + p, import.meta.url), 'utf8');

test('the streamer holds loaded assets while Iris is inside a Shell, and releases the hold on leaving', () => {
  const game = src('play/game.js');
  const enter = game.slice(game.indexOf('function enterShell('), game.indexOf('function enterShell(') + 600);
  const exit = game.slice(game.indexOf('function exitShell('), game.indexOf('function exitShell(') + 400);
  assert.match(enter, /streamer\.hold\(true\)/); assert.match(exit, /streamer\.hold\(false\)/);
  const assets = src('render/assets.js');
  assert.match(assets, /!\(this\.holding && e\.state === 'loaded'\)/, 'a held, loaded asset never accumulates unwanted time');
});

test('the hall is prewarmed with its lights on, the whole scene compiled, and one hidden frame rendered inside', () => {
  const shell = src('scenes/shell.js');
  assert.match(shell, /prewarmHidden\(root, \{ wholeScene: true \}\)/);
  assert.match(shell, /renderHiddenOnce\(root,/);
  const warm = src('render/warmup.js');
  const pre = warm.slice(warm.indexOf('export function prewarmHidden'), warm.indexOf('export function renderHiddenOnce'));
  assert.ok(pre.indexOf('root.visible = true') < pre.indexOf('active.compile(what)'), 'visible (lights counted) before compiling');
  assert.match(pre, /finally \{ root\.visible = was; \}/, 'hidden again whatever happens');
});
