// The world layer: navigation-bound movement over the same colliders the client walks on.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../../game/src/net/world-map.js';
import { newDirect, manualClock } from './helpers.mjs';

test('every island place has a route from the spawn and the walk stays on walkable ground', () => {
  const world = W.buildIslandWorld();
  for (const name of W.placeNames()) {
    if (W.placePosition(name).zone !== 'island') continue;
    const route = W.planRoute(W.SPAWN, name);
    assert.ok(route && route.length, `no route to ${name}`);
    const walk = W.simulateWalk(world, W.SPAWN, route);
    assert.ok(walk.ok !== false, `walk to ${name} failed: ${walk.reason}`);
  }
});

test('walking takes simulated time at walk speed, scaled by timeScale', () => {
  const clock = manualClock();
  const { p } = newDirect({ timeScale: 1 }, { clock });
  const r = p.cmd('move', { to: 'scroll' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const o = p.obs();
  assert.ok(o.you.walking, 'avatar is walking');
  assert.equal(p.cmd('move', { to: 'balcony' }).body.error.reason, 'in_transit');
  const seconds = o.you.walking.arriveAt - o.simTime;
  assert.ok(seconds > 10 && seconds < 60, `walk of ${seconds}s`);
  clock.add(Math.ceil(seconds * 1000) + 10);
  const after = p.obs();
  assert.equal(after.you.walking, null);
  assert.ok(W.nearScroll(after.you.position));
});

test('free path waypoints off the island are refused', () => {
  const { p } = newDirect();
  const r = p.cmd('move', { path: [[150, 150]] });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.source, 'world');
});

test('entering a Shell moves the avatar inside; exiting returns it to that anchor zone', () => {
  const { p } = newDirect({ worldRules: 'free' });
  assert.equal(p.cmd('enter_shell', { shell: 2 }).status, 200);
  assert.equal(p.obs().you.zone, 'shell');
  assert.equal(p.cmd('exit_shell').status, 200);
  const o = p.obs();
  assert.equal(o.you.zone, 'island');
  assert.ok(W.nearAnchorZone(o.you.position, 2));
});
