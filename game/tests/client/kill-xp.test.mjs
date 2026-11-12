// Level from killing monsters (owner 12.11): the town ledger credits per-type XP for a kill (game/town-economy.js
// killMob), the first fight beyond the walls reaches level 2, about 15 minutes of hunting reaches level 5, a level up
// is reported once, the XP is saved with the economy state, and play/kill-xp.js turns the window events into it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTownLedger, levelOf, MOB_XP, FIRST_KILL_XP, xpForKill } from '../../src/game/town-economy.js';
import { PACKS } from '../../src/play/mobs.js';
import { createKillXp } from '../../src/play/kill-xp.js';
import { memoryStorage } from '../../src/ui/storage.js';

test('kill XP: each type has its value; the elite flag never pays less than the crownrift; unknown types count as a skitter', () => {
  for (const [type, v] of Object.entries(MOB_XP)) assert.equal(xpForKill(type), v);
  assert.equal(xpForKill('skitter', true), MOB_XP.crownrift);
  assert.equal(xpForKill('something_new'), MOB_XP.skitter);
  assert.ok(MOB_XP.skitter < MOB_XP.veilbell && MOB_XP.veilbell < MOB_XP.hulker && MOB_XP.hulker < MOB_XP.crownrift);
});

test('kill XP: a kill credits the ledger, counts in the stats and is saved; the first-kill bonus comes once', () => {
  const storage = memoryStorage();
  const l = createTownLedger({ storage });
  const a = l.killMob('skitter');
  assert.equal(a.gained, MOB_XP.skitter + FIRST_KILL_XP);
  const b = l.killMob('skitter');
  assert.equal(b.gained, MOB_XP.skitter);
  assert.equal(l.xp, 2 * MOB_XP.skitter + FIRST_KILL_XP);
  assert.equal(l.stats.mobsKilled, 2);
  const again = createTownLedger({ storage });
  assert.equal(again.xp, l.xp, 'persisted with the economy state');
  assert.equal(again.stats.mobsKilled, 2);
  assert.equal(again.killMob('skitter').gained, MOB_XP.skitter, 'no second first-kill bonus after a reload');
});

test('kill XP: the first fight (the first pack, desktop and phone counts) reaches level 2', () => {
  const first = PACKS[0];
  assert.equal(first.type, 'skitter');
  for (const count of [first.count, first.phone]) {
    const l = createTownLedger();
    let ups = [];
    for (let i = 0; i < count; i++) { const r = l.killMob(first.type); if (r.levelUp) ups.push(r.levelUp); }
    assert.ok(l.level.level >= 2, `${count} kills: level ${l.level.level} (${l.xp} XP)`);
    assert.deepEqual(ups, [2], 'level 2 reported once');
  }
});

test('kill XP: about 15 minutes of hunting (4 kills a minute in the packs\' mix) reaches level 5, not before ~8 minutes', () => {
  // the mix of a loop round the hillside packs: per pack its count, weighted by how often it comes back
  const loop = [];
  for (const p of PACKS) if (p.type !== 'crownrift') for (let i = 0; i < p.count; i++) loop.push(p.type);
  const l = createTownLedger();
  let minute = 0, kills = 0, at5 = null;
  while (minute < 30 && at5 == null) {
    for (let k = 0; k < 4; k++) { l.killMob(loop[kills % loop.length]); kills++; }
    minute++;
    if (l.level.level >= 5) at5 = minute;
  }
  assert.ok(at5 != null && at5 >= 8 && at5 <= 16, `level 5 after ${at5} min`);
});

test('kill XP: a level up is reported exactly once, on the kill that crosses the threshold', () => {
  const l = createTownLedger();
  const seen = [];
  for (let i = 0; i < 200; i++) { const before = l.level.level; const r = l.killMob('hulker'); if (r.levelUp) { seen.push(r.levelUp); assert.equal(r.levelUp, before + 1); } else assert.equal(l.level.level, before); }
  assert.deepEqual(seen, [...new Set(seen)], 'no level reported twice');
  assert.equal(seen[seen.length - 1], levelOf(l.xp).level);
});

function fakeWindow() {
  const handlers = {};
  return { innerWidth: 800, innerHeight: 600, addEventListener: (n, f) => { (handlers[n] ||= []).push(f); }, removeEventListener: (n, f) => { handlers[n] = (handlers[n] || []).filter((x) => x !== f); }, fire: (n, detail) => { for (const f of handlers[n] || []) f({ detail }); }, handlers };
}

test('kill XP view: the window events credit the ledger; a level up toasts once and chimes; inactive outside the town', () => {
  const win = fakeWindow();
  const ledger = createTownLedger();
  const toasts = [];
  const sounds = [];
  const prevWin = globalThis.window;
  globalThis.window = { dispatchEvent: (e) => { sounds.push(e.detail); return true; } };
  globalThis.CustomEvent ||= class { constructor(type, o) { this.type = type; this.detail = o && o.detail; } };
  let active = true;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const k = createKillXp({ THREE, scene, camera, player: { pos: [0, 0, 0] }, ledger, t: (key, a) => key + JSON.stringify(a || {}), toast: (x) => toasts.push(x), active: () => active, win, doc: null });
  try {
    for (let i = 0; i < 4; i++) win.fire('ftf:mob-killed', { type: 'skitter', pos: [0, 0, 0], elite: false });
    assert.equal(ledger.stats.mobsKilled, 4);
    assert.equal(toasts.length, 1);
    assert.match(toasts[0], /xp\.levelUp.*"level":2/);
    assert.ok(sounds.some((d) => d && d.name === 'gift_chime'), 'the level-up chime');
    win.fire('ftf:critter-killed', { pos: [1, 0, 1] });
    assert.equal(ledger.stats.mobsKilled, 5, 'the moss critters count too');
    active = false;
    win.fire('ftf:mob-killed', { type: 'hulker', pos: [0, 0, 0] });
    assert.equal(ledger.stats.mobsKilled, 5, 'no XP outside the town');
    k.update(0.5); k.update(1.0);
    k.dispose();
    assert.equal((win.handlers['ftf:mob-killed'] || []).length, 0);
  } finally { globalThis.window = prevWin; }
});
