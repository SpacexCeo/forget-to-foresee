// Owner rule 13.11: on a phone (touch) nothing pops up on its own. First-seen tips (sprint/first-seen.js, which also
// carries A4's npe/tips.js) show only from an explicit "?" tap (force); tips and the tooltip close on a tap anywhere or
// on Esc and stay inside the viewport; no animation keyframe overrides a positioning transform.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { installDom } from '../lib/mini-dom.mjs';
import { emit, _reset as resetBus } from '../../src/sprint/bus.js';
import { placeTooltip, onDocDown, onDocKey, hideTooltip } from '../../src/sprint/tooltip.js';
import { memoryStorage } from '../../src/ui/storage.js';

test('touch: first-seen tips never auto-show, only from the "?" (force)', async () => {
  const { doc } = installDom(); resetBus();
  const fs = await import('../../src/sprint/first-seen.js'); fs._reset();
  fs._configure({ storage: memoryStorage(), doc, touch: true });
  fs.registerTip({ id: 'tt1', trigger: 'quest.accepted', title: 'T', body: 'B' });
  emit('quest.accepted', {});
  assert.equal(doc.body.querySelectorAll('.ftf-tip').length, 0, 'bus trigger shows nothing on touch');
  assert.equal(fs.showTip('tt1'), false, 'a plain showTip shows nothing on touch');
  assert.equal(fs.showTip('tt1', { force: true }), true, 'the ? tap shows it');
  assert.equal(doc.body.querySelectorAll('.ftf-tip').length, 1);
  fs._configure({ storage: memoryStorage(), doc, touch: null });
  doc.body.classList.add('ts-touch');
  fs._reset(); fs.registerTip({ id: 'tt2', title: 'T', body: 'B' });
  assert.equal(fs.isTouch(doc), true, 'body.ts-touch counts as touch');
  assert.equal(fs.showTip('tt2'), false);
  doc.body.classList.remove('ts-touch');
});

test('tooltip: clamped inside a phone viewport; a tap elsewhere or Esc closes it', () => {
  const view = { width: 375, height: 667 };
  for (const a of [{ left: 0, top: 0, width: 20, height: 20, bottom: 20 }, { left: 360, top: 650, width: 15, height: 15, bottom: 665 }]) {
    const p = placeTooltip(a, { width: 320, height: 140 }, view);
    assert.ok(p.left >= 8 && p.left + 320 <= view.width - 8 + 0.5, `left ${p.left}`);
    assert.ok(p.top >= 8 && p.top + 140 <= view.height - 8 + 0.5, `top ${p.top}`);
  }
  installDom();
  // onDocDown/onDocKey are no-ops without an open tooltip and never throw
  onDocDown({ target: {} }); onDocKey({ key: 'Escape' }); hideTooltip();
});

test('tooltip: an open tooltip hides on an outside pointerdown and on Esc, not on its anchor', async () => {
  const { doc } = installDom();
  const tt = await import('../../src/sprint/tooltip.js');
  const mk = doc.createElement.bind(doc);
  doc.createElement = (tag) => { const n = mk(tag); n.getBoundingClientRect = () => ({ left: 10, top: 300, width: 40, height: 40, bottom: 340 }); return n; };
  const anchor = doc.createElement('button'); doc.body.append(anchor);
  const open = () => { tt.showTooltip(anchor, { title: 'X', lines: ['y'] }); return doc.body.children.find((n) => n.id === 'ftf-tooltip'); };
  const t = open();
  assert.equal(t.hidden, false);
  tt.onDocDown({ target: anchor }); assert.equal(t.hidden, false, 'tap on the anchor keeps it');
  tt.onDocDown({ target: doc.body }); assert.equal(t.hidden, true, 'tap anywhere else closes');
  open(); tt.onDocKey({ key: 'Escape' }); assert.equal(t.hidden, true, 'Esc closes');
});

function walk(dir, out = []) { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(js|css)$/.test(f)) out.push(p); } return out; }

test('no animation keyframe overrides a positioning transform', () => {
  const bad = [];
  for (const file of walk(new URL('../../src', import.meta.url).pathname)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)) {
      const [, name, body] = m; if (!/transform\s*:/.test(body)) continue;
      // every rule that runs this animation: its own transform must be repeated inside the keyframes
      const re = new RegExp(`([^{}]+)\\{([^{}]*animation(?:-name)?\\s*:[^;{}]*\\b${name}\\b[^{}]*)\\}`, 'g');
      for (const r of src.matchAll(re)) {
        const tr = /(?:^|[;\s])transform\s*:\s*([^;]+)/.exec(r[2]);
        const sel = r[1].trim().split('\n').pop();
        // the base rule of the same selector (without state suffixes) may also position it
        const baseSel = sel.replace(/\[[^\]]*\]|:[\w-]+(\([^)]*\))?|\.\w[\w-]*-anim/g, '').trim();
        const base = baseSel ? new RegExp(`(?:^|[}\\s])${baseSel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^{}]*)\\}`).exec(src) : null;
        const pos = (tr && tr[1]) || (base && (/(?:^|[;\s])transform\s*:\s*([^;]+)/.exec(base[1]) || [])[1]);
        if (!pos || /none/.test(pos)) continue;
        // a centring translate (-50 %) is positioning; a sweep's own start offset is not
        const xOf = (str) => [...str.matchAll(/translate(X|3d)?\(\s*([^,)\s]+)/g)].map((x) => x[2]);
        const centre = xOf(pos).filter((x) => x === '-50%');
        const frames = [...body.matchAll(/transform\s*:\s*([^;}]+)/g)].map((f) => f[1]);
        if (centre.length && !frames.every((f) => xOf(f).includes('-50%'))) bad.push(`${file.split('/src/')[1]}: ${name} on "${sel}" drops translateX(-50%)`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
