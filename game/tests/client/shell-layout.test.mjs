// The Shell hall's layout (docs/hackathon-tz.md P0-A): Iris arrives on the hall side of the glass facing it,
// reads between the stairs and the glass, the Guests stand behind the glass; the numbers agree with the nodes
// of shell_interior.glb; the streamer keeps the Shells and the hall wanted so the first flight is not a greybox.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REAL, GREY, HALL, layoutFor, layoutProblems, shouldRespawn } from '../../src/scenes/shell-layout.js';
import { JUDGE_PINS, HEAVY_HEROES, pinnedPriority, heroLast, planStreaming, planUpgrade, instancePriority } from '../../src/render/streaming.js';

/** Node table of a .glb (JSON chunk only): name -> {translation, scale, half-extents of its first mesh}. */
function glbNodes(file) {
  const buf = readFileSync(new URL(file, import.meta.url));
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const out = new Map();
  for (const n of json.nodes) {
    let half = null;
    if (n.mesh != null) {
      const acc = json.accessors[json.meshes[n.mesh].primitives[0].attributes.POSITION];
      const q = acc.normalized ? 32767 : 1, s = n.scale || [1, 1, 1];
      half = acc.max.map((v, i) => (v / q) * s[i]);
    }
    out.set(n.name, { t: n.translation || [0, 0, 0], half });
  }
  return out;
}

test('shell layout: both layouts are sound (spawn on the hall side facing the glass, reading spot between, Guests behind)', () => {
  assert.deepEqual(layoutProblems(REAL), []);
  assert.deepEqual(layoutProblems(GREY), []);
  assert.equal(layoutFor(true), REAL);
  assert.equal(layoutFor(false), GREY);
  for (const L of [REAL, GREY]) {
    assert.ok(L.spawn[2] > L.stand[1] && L.stand[1] > L.glass[2], 'spawn, reading spot, glass in that order along -Z');
    for (const g of L.guests) assert.ok(g[2] < L.glass[2], 'every Guest stand is behind the glass');
  }
});

test('shell layout: a mixed-up layout is reported (the glass where the entrance should be)', () => {
  const swapped = { ...REAL, spawn: [0, 0, -12], stand: [0, 8] };
  const problems = layoutProblems(swapped);
  assert.ok(problems.includes('spawn is not on the hall side of the glass'));
  assert.ok(problems.includes('the reading spot is not between the spawn and the glass'));
  assert.ok(layoutProblems({ ...REAL, heading: 0 }).includes('spawn does not face the glass (-Z)'));
  assert.ok(layoutProblems({ ...REAL, guests: [[0, 0, -5, 0, 1]] }).some((p) => /not behind the glass/.test(p)));
});

test('shell layout: the real numbers agree with shell_interior.glb (glass, entrance, landing, stairs, floor)', () => {
  const nodes = glbNodes('../../public/assets/models/shell_interior.glb');
  const glass = nodes.get('logogram_glass'), door = nodes.get('vestibule_door_col'), entrance = nodes.get('endwall_entrance_l_col');
  const landing = nodes.get('landing_col'), stairs = nodes.get('stairs_col'), floor = nodes.get('floor_col'), endGlass = nodes.get('endwall_glass_col');
  for (const [name, n] of Object.entries({ glass, door, entrance, landing, stairs, floor, endGlass })) assert.ok(n, `node for ${name} exists in the model`);
  // the glass: centre and size
  assert.ok(Math.abs(glass.t[0] - REAL.glass[0]) < 0.05 && Math.abs(glass.t[1] - REAL.glass[1]) < 0.05 && Math.abs(glass.t[2] - REAL.glass[2]) < 0.05, 'the sign plane sits on the model\'s glass');
  assert.ok(Math.abs(glass.half[0] * 2 - REAL.glassSize[0]) < 0.2 && Math.abs(glass.half[1] * 2 - REAL.glassSize[1]) < 0.2, 'glass size');
  assert.ok(Math.abs(endGlass.t[2] - HALL.glassZ) < 0.05 && Math.abs(entrance.t[2] - HALL.entranceZ) < 0.05 && Math.abs(door.t[2] - HALL.doorZ) < 0.05);
  // the entrance is at +Z and the glass at -Z: Iris arrives at the entrance end, not at the glass
  assert.ok(door.t[2] > entrance.t[2] && entrance.t[2] > 0 && glass.t[2] < 0);
  const [sx, sy, sz] = REAL.spawn;
  assert.ok(sz < entrance.t[2] - 4, 'inside the hall, with at least 4 m behind Iris for the camera before the entrance wall');
  assert.ok(sz < stairs.t[2] - stairs.half[2] && sz > stairs.t[2] - stairs.half[2] - 2, 'on the hall floor at the foot of the stairs');
  assert.ok(Math.abs(sy - HALL.floorY) < 1e-9 && Math.abs(sx) < landing.half[0], 'on the floor, on the centre line');
  assert.ok(Math.abs(landing.t[1] + landing.half[1] - HALL.landingY) < 0.05, 'landing height');
  assert.ok(Math.abs(floor.t[1] + floor.half[1] - HALL.floorY) < 0.05, 'hall floor height');
  // the reading spot is on the hall floor, in front of the glass, inside the walls
  assert.ok(REAL.stand[1] > glass.t[2] + 1 && REAL.stand[1] < stairs.t[2] - stairs.half[2], 'the reading spot is on the hall floor between the stairs and the glass');
  assert.ok(Math.abs(REAL.stand[0]) < HALL.halfWidth);
  // the chamber starts behind the glass end wall
  assert.ok(REAL.chamber.zNear < endGlass.t[2] - endGlass.half[2]);
});

test('shell layout: a late swap to the real hall moves Iris only if she still stands at the greybox spawn', () => {
  assert.equal(shouldRespawn(GREY.spawn), true);
  assert.equal(shouldRespawn([0.3, 0, 4.2]), true);
  assert.equal(shouldRespawn([0, 0, 1.5]), false, 'the player walked on: keep their place');
  assert.equal(shouldRespawn([3, 0, 4.5]), false);
});

test('streaming order: the Shells and the hall are pinned under the first view and above prefetch and upgrades', () => {
  assert.deepEqual(Object.keys(JUDGE_PINS).sort(), ['shell_1', 'shell_2', 'shell_3', 'shell_4', 'shell_interior']);
  for (const p of Object.values(JUDGE_PINS)) assert.ok(p >= 2 && p < 100, 'below everything on screen, above the prefetch class');
  assert.ok(JUDGE_PINS.shell_1 > JUDGE_PINS.shell_interior, 'the Shell of the first sign before the hall');
  assert.equal(pinnedPriority(-1, 90), 90, 'off screen but pinned: wanted');
  assert.equal(pinnedPriority(104, 90), 104, 'on screen: the camera decides');
  assert.equal(pinnedPriority(-1, undefined), -1);
  const prefetch = instancePriority({ inFrustum: false, distance: 5, radius: 2, loadDistance: 80, focusDistance: 3, prefetchRadius: 14 });
  assert.ok(prefetch < JUDGE_PINS.shell_interior);
  // one tick on arrival: island and a camp on screen, the hall pinned, a prop in the prefetch ring
  const rows = [
    { name: 'prop_lamp', state: 'idle', priority: prefetch, unwantedFor: 0 },
    { name: 'shell_interior', state: 'idle', priority: pinnedPriority(-1, JUDGE_PINS.shell_interior), unwantedFor: 0 },
    { name: 'shell_1', state: 'idle', priority: pinnedPriority(-1, JUDGE_PINS.shell_1), unwantedFor: 0 },
    { name: 'island', state: 'idle', priority: 108, unwantedFor: 0 },
    { name: 'camp_iris', state: 'idle', priority: 101, unwantedFor: 0 },
    { name: 'scroll_table', state: 'idle', priority: heroLast('scroll_table', 104), unwantedFor: 0 },
  ];
  assert.deepEqual(planStreaming(rows, { maxConcurrent: 6 }).load, ['island', 'camp_iris', 'scroll_table', 'shell_1', 'shell_interior', 'prop_lamp']);
  // a pinned hall is never released, however long it is off screen
  assert.deepEqual(planStreaming([{ name: 'shell_interior', state: 'loaded', priority: pinnedPriority(-1, 90), unwantedFor: 999 }]).release, []);
  // the full-resolution upgrades (the 20 MB hero files on desktop) wait while the hall is still pending
  const shown = [{ name: 'scroll_table', state: 'loaded', priority: heroLast('scroll_table', 104), lite: true }];
  assert.equal(planUpgrade([...shown, { name: 'shell_interior', state: 'idle', priority: 90 }]), null);
  assert.equal(planUpgrade([...shown, { name: 'shell_interior', state: 'loaded', priority: 90 }]), 'scroll_table');
});

test('streaming order: the two heavy heroes go last among what is on screen but stay in the on-screen class', () => {
  assert.deepEqual([...HEAVY_HEROES], ['anchor', 'scroll_table']);
  assert.ok(heroLast('anchor', 109) >= 100 && heroLast('anchor', 109) < 100.01);
  assert.equal(heroLast('anchor', -1), -1, 'not wanted stays not wanted');
  assert.equal(heroLast('anchor', 1.02), 1.02, 'prefetch class untouched');
  assert.equal(heroLast('shell_1', 109), 109);
  assert.ok(heroLast('scroll_table', 110) < 100.2, 'a hero filling the screen still loads after a small visible prop');
});
