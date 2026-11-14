// The Wayfarers from Kallima (flag `wayfarers`): three visitors on one model, touring the town along the path graph,
// stopping to look around, take a picture and haggle; they never overlap anybody and never trade at the Exchange.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PersonPlan, TOWNSFOLK, WAYFARERS, WAYFARER_PROGRAMS, PROGRAMS, CLIP_FALLBACK, MIN_GAP, mayTrade, pickClip } from '../../src/play/townsfolk-plan.js';
import { townPaths, pathBetween, nearestNode } from '../../src/play/town-paths.js';
import { DEFAULT_FLAGS } from '../../src/features.js';

const MODEL = new URL('../../public/assets/models/townsfolk_wayfarer.glb', import.meta.url);

test('wayfarers: the Lost Tourist and three touring visitors on one model, tall and springy, behind a flag that ships on', () => {
  assert.equal(WAYFARERS.length, 4);
  assert.equal(new Set(WAYFARERS.map((w) => w.key)).size, 4);
  assert.deepEqual(Object.keys(WAYFARER_PROGRAMS), ['wayfarer_a', 'wayfarer_b', 'wayfarer_c']);
  for (const w of WAYFARERS) {
    assert.equal(w.asset, 'townsfolk_wayfarer'); assert.equal(w.height, 1.9); assert.ok(w.walk > 1.2 && w.walk < 1.7);
    assert.ok(!(w.key in PROGRAMS) && w.program && w.program.steps.length, w.key + ' has its own program');
    assert.ok(w.visitor && !w.scale && !w.placeholder, w.key + ' wears the real model');
    if (w.key !== 'wayfarer') assert.equal(mayTrade(w.key, 0), false, 'a touring visitor does not walk off to trade');
  }
  assert.equal(TOWNSFOLK.some((p) => p.key.startsWith('wayfarer')), false, 'the town cast itself is unchanged');
  assert.equal(DEFAULT_FLAGS.wayfarers, false);
  assert.equal(JSON.parse(readFileSync(new URL('../../public/features.json', import.meta.url), 'utf8')).flags.wayfarers, true);
});

test('wayfarers: every walk leg runs along the path graph; every stop plays a clip the fallback table knows', () => {
  const g = townPaths(), flat = (p, q) => Math.hypot(q[0] - p[0], q[2] - p[2]);
  const onGraph = (a, b) => {
    const ia = nearestNode(g, a), ib = nearestNode(g, b);
    if (flat(g.nodes[ia], a) > 0.06 || flat(g.nodes[ib], b) > 0.06) return false;
    const path = pathBetween(g, g.nodes[ia], g.nodes[ib]); let len = 0;
    for (let i = 0; i + 1 < path.length; i++) len += flat(path[i], path[i + 1]);
    return len <= flat(a, b) + 0.1;
  };
  const acts = new Set();
  for (const [k, prog] of Object.entries(WAYFARER_PROGRAMS)) for (const st of prog.steps) {
    if (st.walk) for (let i = 0; i + 1 < st.walk.length; i++) assert.ok(onGraph(st.walk[i], st.walk[i + 1]), `${k} walk leg ${i}`);
    else { assert.ok(st.clip === 'idle' || CLIP_FALLBACK[st.clip], k + ' ' + st.clip); acts.add(st.clip); }
  }
  assert.ok(acts.has('take_photo') && acts.has('haggle') && acts.has('idle'));
  assert.equal(pickClip(['idle', 'walk', 'talk', 'think'], 'take_photo'), 'think', 'without the own clip it thinks');
  assert.equal(pickClip(['idle', 'take_photo'], 'take_photo'), 'take_photo');
});

test('wayfarers: four minutes of the whole town with the visitors: nobody overlaps anybody, the visitors keep touring', () => {
  const plans = [...TOWNSFOLK.map((d) => new PersonPlan(d)), ...WAYFARERS.map((d) => new PersonPlan(d, d.program))];
  const map = new Map(plans.map((p) => [p.key, p])); const bad = []; const far = new Map(); const start = new Map(plans.map((p) => [p.key, [p.x, p.z]]));
  for (let i = 0; i < 240 * 30; i++) {
    for (const p of plans) p.step(1 / 30, { iris: null, reduced: false, others: map });
    for (let a = 0; a < plans.length; a++) for (let b = a + 1; b < plans.length; b++) {
      const A = plans[a], B = plans[b];
      if (Math.abs(A.y - B.y) < 1.2 && Math.hypot(A.x - B.x, A.z - B.z) < MIN_GAP - 1e-6 && bad.length < 5) bad.push(`${A.key}/${B.key} at ${i}`);
    }
    for (const w of WAYFARERS) { const p = map.get(w.key), s = start.get(w.key); far.set(w.key, Math.max(far.get(w.key) || 0, Math.hypot(p.x - s[0], p.z - s[1]))); }
  }
  assert.deepEqual(bad, []);
  for (const w of WAYFARERS) if (w.key !== 'wayfarer') assert.ok(far.get(w.key) > 5, w.key + ' toured ' + far.get(w.key).toFixed(1) + ' m from its start');
});

test('wayfarer model: both files ship with the own clips on the townsfolk rig, inside the budget', { skip: !existsSync(MODEL) && 'model not built yet' }, () => {
  for (const [file, maxBytes, maxTris] of [['townsfolk_wayfarer.glb', 6e6, 20000], ['townsfolk_wayfarer_m.glb', 2.5e6, 20000]]) {
    const b = readFileSync(new URL('../../public/assets/models/' + file, import.meta.url));
    const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
    assert.ok(b.length <= maxBytes, file + ' is ' + b.length + ' bytes');
    const names = json.animations.map((a) => a.name);
    for (const c of ['idle', 'walk', 'take_photo', 'haggle']) assert.ok(names.includes(c), file + ' has ' + c);
    for (const bone of ['pelvis', 'chest', 'head', 'hand_R', 'prop_R', 'foot_L']) assert.ok(json.nodes.some((n) => n.name === bone), file + ' has the bone ' + bone);
    const tris = json.meshes.flatMap((m) => m.primitives).reduce((n, p) => n + json.accessors[p.indices].count / 3, 0);
    assert.ok(tris <= maxTris, file + ' has ' + tris + ' triangles');
  }
});
