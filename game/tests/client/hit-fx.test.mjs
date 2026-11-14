// Impact feel (src/render/hit-fx-core.js, night 14.11 combat pass): each blow's look, a real crit, the finishing-blow
// extra, reduced motion keeps the information and drops the camera, the kick spring settles, the fragments fly away
// from the attacker; the brain stamps every hit with its source (src/play/mobs.js); the pooled view never grows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { IMPACT, KILL, KICK, impactOf, fragVelocities, kickStep, crackle } from '../../src/render/hit-fx-core.js';
import { createHitFx } from '../../src/render/hit-fx.js';
import { MobBrain, CAST_DAMAGE, ACTIONS } from '../../src/play/mobs.js';

const seeded = (s = 1) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

test('every source has its own look; only the finishers (combo third blow, super strike, Loomblade heavy) are crits; only the super rings the ground', () => {
  assert.deepEqual(Object.keys(IMPACT).sort(), ['blade', 'blade_heavy', 'dragon', 'ember', 'gale', 'lance', 'seed', 'snare', 'strike', 'strike3', 'super']);
  assert.equal(IMPACT.lance.frag, 'ice'); assert.ok(IMPACT.snare.crackle > 0);
  assert.equal(new Set(Object.values(IMPACT).map((i) => i.color)).size, Object.keys(IMPACT).length, 'a colour each');
  assert.deepEqual(Object.entries(IMPACT).filter(([, i]) => i.crit).map(([k]) => k).sort(), ['blade_heavy', 'strike3', 'super']);
  assert.deepEqual(Object.entries(IMPACT).filter(([, i]) => i.ring > 0).map(([k]) => k), ['super']);
});

test('impactOf: size follows the creature, a kill adds, reduced motion keeps flash and fragments but not the camera', () => {
  const small = impactOf('strike', { radius: 0.4 }), big = impactOf('strike', { radius: 1.3 });
  assert.ok(big.flash > small.flash);
  const k = impactOf('lance', { radius: 0.5, kill: true }), n = impactOf('lance', { radius: 0.5 });
  assert.equal(k.frags, n.frags + KILL.frags); assert.ok(k.stop >= KILL.stop); assert.ok(k.shake > n.shake); assert.ok(k.kick > n.kick);
  const r = impactOf('super', { radius: 0.5, kill: true, reduced: true });
  assert.equal(r.shake, 0); assert.equal(r.kick, 0); assert.ok(r.flash > 0 && r.frags > 0);
  assert.equal(impactOf('nonsense').src, 'strike');
  for (const src of Object.keys(IMPACT)) assert.ok(impactOf(src, { kill: true }).kick <= KICK.max);
});

test('fragments fly away from the attacker, upward; the kick spring returns to rest without overshooting far', () => {
  const v = fragVelocities(40, [0, 1], 'ice', seeded(3));
  assert.equal(v.length, 40);
  for (const [x, y, z] of v) { assert.ok(y > 0); assert.ok(Math.atan2(Math.abs(x), z) <= 1.23, 'within ±70° of away'); }
  const s = { x: [0, 0, 0], v: [5, 0, 0] };
  let peak = 0, low = 0;
  for (let i = 0; i < 120; i++) { kickStep(s, 1 / 60); peak = Math.max(peak, s.x[0]); low = Math.min(low, s.x[0]); }
  assert.ok(peak > 0.05, 'it kicks'); assert.ok(Math.abs(s.x[0]) < 1e-3, 'it settles in two seconds'); assert.ok(low > -peak * 0.1, 'barely any overshoot');
});

test('crackle: a jagged line from a to b with the given segments', () => {
  const pts = crackle([0, 0, 0], [1, 0, 0], 6, 0.1, seeded(5));
  assert.equal(pts.length, 7); assert.deepEqual(pts[0], [0, 0, 0]); assert.deepEqual(pts[6], [1, 0, 0]);
  assert.ok(pts.slice(1, 6).some((p) => Math.abs(p[1]) > 1e-6));
});

test('the brain stamps hits with their source and a real crit; a kill holds the creature longer', () => {
  const b = new MobBrain({ origin: [0, 0, 0], seed: 3 });
  const m = b.mobs[0]; m.hp = 1000;
  const ev = [];
  b.damage(m, CAST_DAMAGE.lance, ev, { src: 'lance' });
  assert.deepEqual([ev[0].src, ev[0].crit, ev[0].kill], ['lance', false, false], 'a 40-damage Lance is no longer a crit');
  b.damage(m, ACTIONS.strike.combo[2], ev, { src: 'strike3' }); assert.equal(ev[1].crit, true);
  m.hp = 5; const ev2 = []; b.damage(m, 14, ev2, { src: 'strike' });
  assert.equal(ev2[0].kill, true); assert.ok(m.freeze >= KILL.stop - 1e-9);
  const m2 = b.mobs[1]; const ev3 = []; b.damage(m2, 1, ev3); assert.equal(ev3[0].src, 'strike', 'the default source');
});

test('the pooled view: a hundred impacts keep the same scene objects, update settles everything', () => {
  const scene = new THREE.Scene();
  const fx = createHitFx({ THREE, parent: scene, doc: null, rand: seeded(7) });
  const count = () => { let n = 0; scene.traverse(() => n++); return n; };
  const before = count();
  for (let i = 0; i < 100; i++) fx.impact([i * 0.1, 1, 0], [0, 1], impactOf(['lance', 'snare', 'strike', 'super'][i % 4], { kill: i % 5 === 0 }));
  fx.trail([0, 1, 0], 0xffffff); fx.burst([0, 1, 0], 0xffffff); fx.shock([0, 0, 0], 0xffc36b, 2);
  for (let i = 0; i < 5; i++) fx.slash([0, 1, 0], i, 2, 0xfff4dc, i % 2 ? -1 : 1, 0.2);
  assert.equal(count(), before, 'no new objects');
  for (let i = 0; i < 180; i++) fx.update(1 / 60);
  assert.ok(fx.kick.length() < 1e-3);
  let shown = 0; fx.group.traverse((o) => { if (o !== fx.group && o.visible) shown++; });
  assert.equal(shown, 0, 'everything faded out');
  fx.dispose(); assert.equal(fx.group.parent, null);
});
