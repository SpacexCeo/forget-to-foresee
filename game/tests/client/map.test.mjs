// The island map model (src/play/map.js): places from the layout, projection and orientation,
// Shell state from the observation, route targets, goal and Iris markers; and the greybox label
// toggle (src/render/greybox.js): play shows no floating text, dev surfaces can turn it on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP_SIZE, MAP_EXTENT, project, scaleLength, mapGeometry, mapPlaces, placeById, shellStates, routeFor,
  goalMarker, irisMarker, buildMapModel,
} from '../../src/play/map.js';
import { CAMPS, ANCHOR_ZONES, BALCONY_CENTER, SHARD, platforms, bridges } from '../../src/scenes/layout.js';
import { placePosition, placeNames, planRoute, SPAWN } from '../../src/net/world-map.js';
import { createLocalTransport } from '../../src/play/transport-local.js';
import { PlaySession } from '../../src/play/session.js';
import { ShellHub, signsByShell } from '../../src/play/hub.js';
import { hubGoal } from '../../src/play/objectives.js';
import { PLAY_MESSAGES, createPlayI18n } from '../../src/play/i18n.js';
import { greyboxLabelsEnabled, setGreyboxLabels } from '../../src/render/greybox.js';

const JUDGE = 'cc161d308faa67539af44205b56b6d4f';

test('map: projection keeps every layout point inside the square and puts +Z at the bottom', () => {
  assert.deepEqual(project([0, 0, 0]), [MAP_SIZE / 2, MAP_SIZE / 2]);
  const moss = CAMPS.find((c) => c.id === 'moh'), iris = CAMPS.find((c) => c.id === 'iris');
  assert.ok(project(moss.position)[1] > MAP_SIZE / 2, 'Moss (angle 90, +Z) sits below the centre');
  assert.ok(project(iris.position)[1] < MAP_SIZE / 2, 'Iris (angle 270, -Z) sits above the centre');
  assert.ok(project(CAMPS.find((c) => c.id === 'yantar').position)[0] > MAP_SIZE / 2, '+X is to the right');
  for (const p of mapPlaces()) for (const k of p.point) assert.ok(k >= 0 && k <= MAP_SIZE, `${p.id} inside the drawing`);
  for (const z of ANCHOR_ZONES) { const [u, v] = project(z.shellPosition); assert.ok(u > 8 && u < MAP_SIZE - 8 && v > 8 && v < MAP_SIZE - 8, 'Shells stay off the edge'); }
  assert.equal(scaleLength(MAP_EXTENT), MAP_SIZE / 2);
});

test('map: the geometry mirrors the layout (platforms, bridges, anchor rings, Shells, the Scroll)', () => {
  const g = mapGeometry();
  assert.equal(g.platforms.length, platforms().length);
  assert.equal(g.bridges.length, bridges().length);
  assert.equal(g.anchors.length, 4); assert.equal(g.shells.length, 4);
  assert.deepEqual(g.platforms[0].center, [MAP_SIZE / 2, MAP_SIZE / 2]);
  for (const b of g.bridges) assert.ok(b.width >= 2, 'bridges stay visible at the map scale');
  assert.deepEqual(g.scroll.center, project([0, 0, 0]));
});

test('map: places cover the Scroll, the balcony, the pedestal, six camps, four anchor zones and four Shells with valid routes', () => {
  const places = mapPlaces();
  const kinds = places.reduce((m, p) => ((m[p.kind] = (m[p.kind] || 0) + 1), m), {});
  assert.deepEqual(kinds, { scroll: 1, balcony: 1, pedestal: 1, camp: 6, anchor: 4, shell: 4 });
  const names = new Set(placeNames());
  for (const p of places) {
    if (p.kind === 'shell') { assert.match(p.route, /^shell:[1-4]$/); continue; }
    assert.ok(names.has(p.route), `${p.id} routes to a room place (${p.route})`);
    const dest = placePosition(p.route);
    assert.equal(dest.zone, 'island');
    assert.ok(planRoute(SPAWN, p.route), `${p.id} is reachable from the spawn over the walk graph`);
  }
  assert.deepEqual(places.filter((p) => p.kind === 'camp').map((p) => p.clan), ['iris', 'salt', 'ash', 'moss', 'amber', 'frost']);
  assert.deepEqual(placeById('camp:moss').position, CAMPS.find((c) => c.id === 'moh').position);
  assert.deepEqual(placeById('balcony').position, [...BALCONY_CENTER]);
  assert.deepEqual(placeById('pedestal').position.map((v, i) => (i === 1 ? 0 : v)), [SHARD.position[0], 0, SHARD.position[2]]);
  assert.equal(placeById('nowhere'), null);
  // Every label key exists in all five locales (camp labels are the agent names from the base messages).
  for (const loc of ['en', 'uk', 'ru', 'it', 'zh']) {
    const i18n = createPlayI18n(loc, { onMissing: (k) => assert.fail(`${loc}: missing ${k}`) });
    for (const p of places) assert.ok(i18n.t(p.labelKey, p.labelArgs).length > 0, `${loc}:${p.labelKey}`);
  }
});

test('map: the Shell state follows the observation (waiting signs per Shell, inside, staked trials)', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  s.flags.hub = true; s.recompute();
  const by = signsByShell(s.obs);
  const st = shellStates(s.obs);
  assert.equal(st.length, 4);
  for (const x of st) {
    assert.equal(x.signs, by.get(x.shell).length);
    assert.equal(x.state, x.signs ? 'waiting' : 'quiet');
    assert.deepEqual(x.anchors, []);
  }
  assert.ok(st.some((x) => x.state === 'waiting'), 'the judge season starts with a sign waiting');
  const hub = new ShellHub({ session: s, sleep: async () => {}, pauseMs: 0 });
  const n = st.find((x) => x.state === 'waiting').shell;
  assert.equal((await hub.flyTo(n)).ok, true);
  const inside = shellStates(s.obs);
  assert.equal(inside[n - 1].state, 'inside');
  const r = await hub.stake();
  assert.equal(r.ok, true, r.reason);
  const staked = shellStates(s.obs).find((x) => x.anchors.length);
  assert.ok(staked, 'the staked trial shows on its Shell');
  assert.deepEqual(staked.anchors, s.obs.iris.anchors.filter((a) => a.shell === staked.shell).map((a) => a.tick));
  assert.deepEqual(shellStates(null).map((x) => x.state), ['quiet', 'quiet', 'quiet', 'quiet']);
  s.dispose();
});

test('map: clicks route over the walk graph, Shells fly in the hub and walk to the anchor zone otherwise', () => {
  assert.deepEqual(routeFor('camp:moss'), { kind: 'walk', place: 'camp:moss' });
  assert.deepEqual(routeFor('scroll'), { kind: 'walk', place: 'scroll' });
  assert.deepEqual(routeFor('anchor:2'), { kind: 'walk', place: 'anchor_zone:2' });
  assert.deepEqual(routeFor('shell:3', { hub: true }), { kind: 'fly', shell: 3 });
  assert.deepEqual(routeFor('shell:3', { hub: false }), { kind: 'walk', place: 'anchor_zone:3' });
  // inside a Shell: only another Shell is reachable, and only by flying
  assert.equal(routeFor('camp:moss', { hub: true, zone: 'shell', shell: 1 }), null);
  assert.equal(routeFor('shell:1', { hub: true, zone: 'shell', shell: 1 }), null);
  assert.deepEqual(routeFor('shell:2', { hub: true, zone: 'shell', shell: 1 }), { kind: 'fly', shell: 2 });
  assert.equal(routeFor('shell:2', { hub: false, zone: 'shell', shell: 1 }), null);
  assert.equal(routeFor('nowhere'), null);
});

test('map: the goal marker lands on the goal place; Iris\'s arrow follows her heading', async () => {
  assert.equal(goalMarker(null), null);
  assert.equal(goalMarker({ target: null }), null);
  const camp = goalMarker({ target: 'camp:frost' });
  assert.deepEqual(camp, { point: placeById('camp:frost').point, placeId: 'camp:frost' });
  const shell = goalMarker({ target: 'shell:2' });
  assert.deepEqual(shell, { point: placeById('shell:2').point, placeId: 'shell:2' });
  const ped = goalMarker({ target: 'shard_pedestal' });
  assert.deepEqual(ped.point, project([SHARD.position[0], 0, SHARD.position[2]]));
  assert.equal(goalMarker({ target: 'guest_glass' }), null, 'places inside a Shell have no island marker');
  // the hub's first goal is the flight into the waiting Shell: the marker sits on that Shell
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  const g = hubGoal(s.obs, s.flags);
  assert.match(g.target, /^shell:/);
  assert.deepEqual(goalMarker(g).placeId, g.target);
  s.dispose();
  // heading 0 faces +Z = down the map: the up-pointing arrow art turns 180°; facing +X (heading 90°) points right (90°)
  assert.equal(irisMarker([0, 0, 0], 0).angle, 180);
  assert.equal(irisMarker([0, 0, 0], Math.PI / 2).angle, 90);
  assert.equal(irisMarker([0, 0, 0], Math.PI).angle, 0);
  assert.equal(irisMarker([0, 0, 0], -Math.PI / 2).angle, 270);
});

test('map: the view model combines places, Shell states, Iris, the goal and the agents', async () => {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: JUDGE }) });
  await s.start();
  s.flags.hub = true; s.recompute();
  const agents = [{ clan: 'moss', position: CAMPS.find((c) => c.id === 'moh').position }, { clan: 'frost', position: null }];
  const m = buildMapModel({ obs: s.obs, hub: true, zone: 'island', playerPos: SPAWN, heading: 0, goal: s.goal, agents });
  assert.equal(m.places.length, 17);
  assert.ok(m.places.find((p) => p.id === 'shell:1').shellState);
  assert.ok(m.places.every((p) => p.route), 'on the island every place has a route');
  assert.deepEqual(m.iris.point, project(SPAWN)); assert.equal(m.iris.angle, 180); assert.equal(m.iris.inside, null);
  assert.ok(m.goal && m.goal.placeId.startsWith('shell:'));
  assert.equal(m.agents.length, 1, 'agents without a position are skipped');
  assert.equal(m.agents[0].color, CAMPS.find((c) => c.id === 'moh').color);
  // inside a Shell: Iris is marked on that Shell, island places are not routable, other Shells fly
  const hub = new ShellHub({ session: s, sleep: async () => {}, pauseMs: 0 });
  const n = shellStates(s.obs).find((x) => x.state === 'waiting').shell;
  await hub.flyTo(n);
  const inside = buildMapModel({ obs: s.obs, hub: true, zone: 'shell', playerPos: [0, 0, 4], heading: 0, goal: s.goal, agents: [] });
  assert.deepEqual(inside.iris, { point: placeById('shell:' + n).point, angle: null, inside: n });
  assert.equal(inside.places.find((p) => p.id === 'camp:moss').route, null);
  assert.equal(inside.places.find((p) => p.id === 'shell:' + n).route, null);
  assert.ok(inside.places.filter((p) => p.kind === 'shell' && p.route).length === 3);
  s.dispose();
});

test('map strings exist in all five play locales', () => {
  const keys = Object.keys(PLAY_MESSAGES.en).filter((k) => k.startsWith('map.'));
  assert.ok(keys.length >= 20);
  for (const loc of ['uk', 'ru', 'it', 'zh']) for (const k of keys) assert.ok(Object.hasOwn(PLAY_MESSAGES[loc], k), `${loc}:${k}`);
  for (const loc of ['en', 'uk', 'ru', 'it', 'zh']) {
    const i18n = createPlayI18n(loc);
    assert.ok(i18n.t('map.shell.waiting', { count: 1 }).length > 0);
    assert.ok(i18n.t('map.shell.waiting', { count: 3 }).includes('3'));
  }
});

test('greybox labels are off unless a dev surface turns them on', () => {
  assert.equal(greyboxLabelsEnabled(), false, 'play never shows text floating in the world');
  setGreyboxLabels(true); assert.equal(greyboxLabelsEnabled(), true);
  setGreyboxLabels(false); assert.equal(greyboxLabelsEnabled(), false);
});
