// Quest markers and the waypoint arrow (sprint §4.9): ! at givers with an offer, ? where a quest is turned in (needs met),
// objective areas of active quests, the portal; tracked quests pinned. The arrow sits on the screen edge when the target
// is off screen or behind, and over it when on screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { questMarkers } from '../../src/quests/markers-feed.js';
import { edgeArrow, createWaypoint } from '../../src/quests/waypoint-ui.js';
import { applyQuest, initialQuests } from '../../src/game/quest-rules.js';
import { makeDoc } from './dom.mjs';

const at = { elder: [0, 10], guard: [5, 40], lamplighter: [8, 30], shardkeeper: [2, 20] };
const giverAt = (k) => at[k] || null;
const act = (s, a) => { const r = applyQuest(s, a, { now: 1 }); return r.rejected ? s : r.state; };

test('markers: offers, the spider field while active, the portal; ? only with the needs met; pinned when tracked', () => {
  let s = initialQuests();
  assert.deepEqual(questMarkers({ qs: s, giverAt, portal: [4.4, 24.8] }).map((m) => [m.kind, m.label]), [['quest-available', 'elder'], ['portal', 'Gate-Loom']]);
  s = act(s, { type: 'KILL', mob: 'skitter', killId: 'k0' }); s = act(s, { type: 'ACCEPT', questId: 'q_spiders' });
  for (let i = 1; i <= 10; i++) s = act(s, { type: 'KILL', mob: 'skitter', killId: 'k' + i });
  const short = questMarkers({ qs: s, giverAt, tracked: ['q_spiders'] });
  assert.ok(short.some((m) => m.kind === 'quest-area' && m.id === 'field_spiders' && m.pinned && m.radius === 14));
  assert.ok(!short.some((m) => m.kind === 'quest-ready'), 'threads missing: no ?');
  const ready = questMarkers({ qs: s, giverAt, have: { spider_silk_thread: 5 } });
  assert.deepEqual(ready.find((m) => m.kind === 'quest-ready').pos, [5, 40]);
});

test('waypoint: on screen over the target, off screen and behind on the edge circle, hidden near or when asked', () => {
  assert.deepEqual(edgeArrow({ sx: 0, sy: 0, w: 1000, h: 800, r: 304 }), { onScreen: true, x: 500, y: 400, angle: 0 });
  const right = edgeArrow({ sx: 4, sy: 0, w: 1000, h: 800, r: 304 }); assert.equal(right.onScreen, false); assert.equal(Math.round(right.x), 804);
  const back = edgeArrow({ sx: 0.2, sy: 0, behind: true, w: 1000, h: 800, r: 304 }); assert.equal(back.onScreen, false); assert.ok(back.x < 500, 'behind: flipped to the other side');
  const doc = makeDoc(); let hide = false, t = { pos: [30, 0, 0], from: [0, 0, 0] };
  const wp = createWaypoint({ doc, win: { innerWidth: 1000, innerHeight: 800 }, view: { project: () => ({ x: 3, y: 0, z: 0.5, behind: false }) }, target: () => t, hidden: () => hide });
  assert.equal(wp.update().onScreen, false); const el = doc.querySelector('.ftf-waypoint'); assert.equal(el.style.display, 'block'); assert.match(el.textContent, /30 m/);
  t = { pos: [3, 0, 0], from: [0, 0, 0] }; assert.equal(wp.update(), null); assert.equal(el.style.display, 'none');
  t = { pos: [30, 0, 0], from: [0, 0, 0] }; hide = true; assert.equal(wp.update(), null);
  wp.dispose(); assert.equal(doc.querySelector('.ftf-waypoint'), null);
});

test('the town feeds its quest markers into the shared seam (sprint/markers.js) for the minimap', async () => {
  const { getMarkers, setMarkers, _reset } = await import('../../src/sprint/markers.js');
  const { questMarkers } = await import('../../src/quests/markers-feed.js');
  _reset();
  const list = questMarkers({ qs: initialQuests(), now: 0, have: {}, tracked: [], giverAt: () => [1, 2], portal: [5, 6], giverName: (k) => k });
  setMarkers('quests', list);
  assert.ok(getMarkers().length >= 1 && getMarkers().every((m) => m.pos.length === 2), 'the seam accepts every feed marker');
  assert.equal(getMarkers().length, list.length, 'nothing in the feed is rejected by the seam');
  _reset();
});

test('ground trail: a dot every 2 m along the route for the next 40 m, in one instanced mesh', async () => {
  const { trailDots, createTrail } = await import('../../src/quests/waypoint-ui.js');
  const THREE = await import('three');
  const dots = trailDots([0, 0, 0], [[10, 0, 0], [10, 0, 100]]);
  assert.equal(dots.length, 20, '40 m / 2 m');
  assert.deepEqual(dots[0], [2, 0, 0]); assert.deepEqual(dots[4], [10, 0, 0]); assert.deepEqual(dots[19], [10, 0, 30]);
  assert.equal(trailDots([0, 0, 0], [[3, 0, 0]]).length, 1, 'a short route: only the dots that fit');
  assert.deepEqual(trailDots([0, 0, 0], null), []);
  const scene = new THREE.Scene(), t = createTrail({ THREE, scene });
  t.set(dots); assert.equal(t.mesh.count, 20); assert.ok(t.mesh.visible); assert.equal(scene.children.length, 1, 'one draw call');
  assert.equal(t.mesh.material.blending, THREE.AdditiveBlending); assert.equal(t.mesh.material.opacity, 0.55);
  t.set(null); assert.equal(t.mesh.visible, false);
  t.dispose(); assert.equal(scene.children.length, 0);
});
