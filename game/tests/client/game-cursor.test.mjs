// The game's own cursor (owner 14.11, cursor pack v2): the state under the mouse, the shipped files and hotspots,
// reduced motion and phones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { cursorFor, CURSORS, CURSOR_BASE } from '../../src/ui/game-cursor.js';

/** A DOM-like node: closest() over a chain of {tag, attrs, data}. */
function node(chain) {
  const nodes = chain.map((c) => ({ ...c }));
  const matches = (n, sel) => sel.split(',').map((s) => s.trim()).some((s) => {
    const m = s.match(/^([a-z]*)(\[([a-z-]+)(="([^"]*)")?\])?$/);
    if (!m) return false;
    if (m[1] && m[1] !== n.tag) return false;
    if (m[3]) { const v = m[3].startsWith('data-') ? (n.data || {})[m[3].slice(5)] : (n.attrs || {})[m[3]]; if (v === undefined) return false; if (m[5] !== undefined && String(v) !== m[5]) return false; }
    return !!(m[1] || m[3]);
  });
  nodes.forEach((n, i) => { n.dataset = n.data || {}; n.closest = (sel) => nodes.slice(i).find((x) => matches(x, sel)) || null; });
  return nodes[0];
}

test('cursor: an explicit data-cursor wins, then disabled, text fields, controls, the loading screen, the scene', () => {
  assert.equal(cursorFor(node([{ tag: 'span' }, { tag: 'div', data: { cursor: 'talk' } }])), 'talk');
  assert.equal(cursorFor(node([{ tag: 'button', attrs: { disabled: '' } }])), 'forbidden');
  assert.equal(cursorFor(node([{ tag: 'input' }])), 'interact');
  assert.equal(cursorFor(node([{ tag: 'span' }, { tag: 'button' }])), 'link');
  assert.equal(cursorFor(node([{ tag: 'a', attrs: { href: '#' } }])), 'link');
  assert.equal(cursorFor(node([{ tag: 'div' }]), { booting: true }), 'loading');
  assert.equal(cursorFor(node([{ tag: 'button' }]), { booting: true }), 'link', 'the entry gate button is a button');
  const canvas = node([{ tag: 'canvas' }]);
  assert.equal(cursorFor(canvas, { canvas, scene: 'grab' }), 'grab');
  assert.equal(cursorFor(canvas, { canvas, scene: 'attack' }), 'attack');
  assert.equal(cursorFor(canvas, { canvas, scene: null }), 'default');
  assert.equal(cursorFor(canvas, { canvas, scene: 'nonsense' }), 'default');
  assert.equal(cursorFor(null), 'default');
  assert.equal(cursorFor(node([{ tag: 'div', data: { cursor: 'nonsense' } }])), 'default', 'an unknown state falls back');
});

test('cursor: every state ships its 32x32 icon and 12-frame strip, with the pack\'s hotspots', () => {
  const dir = new URL('../../public/' + CURSOR_BASE, import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
  assert.deepEqual(Object.keys(CURSORS).sort(), Object.keys(manifest.states).sort());
  for (const [n, hot] of Object.entries(CURSORS)) {
    assert.deepEqual(hot, manifest.states[n].hotspot, n);
    for (const [f, w] of [[`cursor_${n}.png`, 32], [`cursor_${n}_frames.png`, 384]]) {
      const b = readFileSync(new URL(f, dir));
      assert.equal(b.readUInt32BE(16), w, f + ' width'); assert.equal(b.readUInt32BE(20), 32, f + ' height');
    }
  }
  assert.equal(readdirSync(dir).length, 19, 'only the nine icons, nine strips and the manifest ship (not the 39 MB source pack)');
});

test('cursor: reduced motion holds the icons still; phones keep no cursor; the crosshair owns pointer lock', () => {
  const src = readFileSync(new URL('../../src/ui/game-cursor.js', import.meta.url), 'utf8');
  assert.match(src, /@media \(prefers-reduced-motion: reduce\) \{ \.ftf-gc i, \.ftf-gc\.press i, \.ftf-gc\[data-state="loading"\] i \{ animation: none !important;/);
  assert.match(src, /if \(!mm\('\(any-pointer: fine\)'\)\) return null;/);
  assert.match(src, /const locked = \(\) => !!doc\.pointerLockElement;/);
});

test('cursor: the town prompt names its cursor and the scene reports grab / attack / prompt', () => {
  assert.match(readFileSync(new URL('../../src/scenes/town-flow.js', import.meta.url), 'utf8'), /prompt\.dataset\.cursor = talkNpc \? 'talk' : 'interact';/);
  const bw = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(bw, /function cursorScene\(\) \{\n  if \(input\.dragPointer != null\) return 'grab';\n  if \(townMobs && townMobs\.locked\) return 'attack';/);
});
