// The Hatchkeeper (owner 13.11) and the switched-off companions: the riddle strings in en and ru, no buy action,
// a valid spot clear of the portal, the board and the lane sellers, dragon loops inside 1.5-2.5 m, no dragon beside
// the heroine even with a token, and the companion slot locked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import EN from '../../src/play/locales/en.js';
import RU from '../../src/play/locales/ru.js';
import { HATCHKEEPER, DRAGON_LOOPS, DRAGON_KINDS, HATCH_LINES, dragonOrbit } from '../../src/scenes/hatchkeeper-rules.js';
import { COMPANIONS_ENABLED, companionsToShow } from '../../src/scenes/companion-rules.js';
import { lockedCompanionSlot } from '../../src/ui/companion-slot.js';
import { PORTAL_TOWN } from '../../src/scenes/town-portal.js';
import { TOWN_SPOTS } from '../../src/scenes/town-layout.js';
import { makeDoc } from '../quests/dom.mjs';

test('the riddle: the exact English strings, the Russian ones, and nothing that sells', () => {
  assert.equal(EN['hatch.title'], 'The Hatchkeeper');
  assert.equal(EN['hatch.line1'], 'These little ones are not for sale. Silk cannot buy them, and neither can a crown.');
  assert.equal(EN['hatch.line2'], 'They follow only one who proves they are real. Not an echo, not a mask, not a script that walks the town at night.');
  assert.equal(EN['hatch.line3'], 'Show me a living hand behind your key, and one of them will choose you.');
  assert.equal(EN['hatch.status'], 'Not available yet. The Hatchkeeper is still listening.');
  assert.equal(EN['hatch.sign'], 'Hatchkeeper · Companions');
  assert.equal(RU['hatch.line1'], 'Эти малыши не продаются. Их не купить ни за шёлк, ни за корону.');
  assert.equal(RU['hatch.status'], 'Пока недоступно. Хранитель гнёзд ещё прислушивается.');
  assert.equal(EN['companion.locked'], 'Companions: locked. The Hatchkeeper decides who is ready.');
  assert.equal(RU['companion.locked'], 'Компаньоны: закрыто. Хранитель гнёзд решает, кто готов.');
  assert.deepEqual(HATCH_LINES, ['hatch.line1', 'hatch.line2', 'hatch.line3']);
  const src = readFileSync(new URL('../../src/scenes/hatchkeeper.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bbuy\(|'buy'|hatch\.buy|createElement\('button'\)/, 'the panel has no buy action and no button');
});

test('the Hatchkeeper stands at a valid spot and the dragons loop inside 1.5-2.5 m', () => {
  const [x, , z] = HATCHKEEPER.pos;
  assert.ok(Math.hypot(x - PORTAL_TOWN[0], z - PORTAL_TOWN[2]) > 6, 'clear of the Gate-Loom');
  assert.ok(Math.hypot(x - TOWN_SPOTS.board[0], z - TOWN_SPOTS.board[2]) > 6, 'clear of the board');
  for (const [cx, cz, r] of HATCHKEEPER.keepClearOf) assert.ok(Math.hypot(x - cx, z - cz) > r, `clear of (${cx}, ${cz})`);
  assert.deepEqual(DRAGON_KINDS, ['nacre', 'rill', 'cinder']); assert.equal(DRAGON_LOOPS.length, 3);
  for (let i = 0; i < 3; i++) for (let k = 0; k < 40; k++) for (const reduced of [false, true]) {
    const o = dragonOrbit(i, k * 0.7, { reduced }), r = Math.hypot(o.pos[0], o.pos[2]);
    assert.ok(r >= 1.5 - 1e-9 && r <= 2.5 + 1e-9, 'radius ' + r);
    assert.ok(o.pos[1] >= 1.4 && o.pos[1] <= 2.5, 'height ' + o.pos[1]);
  }
  const a = dragonOrbit(0, 1), b = dragonOrbit(0, 1, { reduced: true });
  assert.ok(Math.abs(a.yaw - b.yaw) > 1e-6 || a.pos[0] !== b.pos[0], 'reduced motion flies slower');
});

test('companions are off: no dragon beside the heroine even with a token; the slot is locked', () => {
  assert.equal(COMPANIONS_ENABLED, false);
  assert.deepEqual(companionsToShow(['nacre', 'rill']), [], 'a token holder gets no dragon');
  assert.deepEqual(companionsToShow(['nacre', 'rill', 'cinder'], true), ['nacre', 'rill'], 'one constant brings them back');
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.match(boot, /const kinds = companionsToShow\(all\)/); assert.match(boot, /if \(!COMPANIONS_ENABLED\) \{ setCompanions\(\[\]\); return; \}/);
  const doc = makeDoc(), t = (k) => EN[k] || k;
  const slot = lockedCompanionSlot(doc, t);
  assert.equal(slot.dataset.locked, 'true'); assert.equal(slot.title, EN['companion.locked']);
  assert.ok(slot.textContent.includes('🔒')); assert.notEqual(slot.tagName, 'BUTTON');
});
