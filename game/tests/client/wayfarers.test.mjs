// The Wayfarer from Kallima (flag `wayfarers`): ONE visitor (owner 14.11: no character twice on screen), the Lost Tourist
// on the main street, who looks around, takes a picture and haggles; never overlaps anybody, never trades at the Exchange.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PersonPlan, TOWNSFOLK, WAYFARERS, PROGRAMS, CLIP_FALLBACK, MIN_GAP, pickClip } from '../../src/play/townsfolk-plan.js';
import { DEFAULT_FLAGS } from '../../src/features.js';

const MODEL = new URL('../../public/assets/models/townsfolk_wayfarer.glb', import.meta.url);

test('wayfarers: one Lost Tourist, tall and springy, behind a flag that ships on; no model walks the town twice', () => {
  assert.deepEqual(WAYFARERS.map((w) => w.key), ['wayfarer']);
  const assets = [...TOWNSFOLK, ...WAYFARERS].map((p) => p.asset);
  assert.equal(new Set(assets).size, assets.length, 'every person on screen is a different character');
  for (const w of WAYFARERS) {
    assert.equal(w.asset, 'townsfolk_wayfarer'); assert.equal(w.height, 1.9); assert.ok(w.walk > 1.2 && w.walk < 1.7);
    assert.ok(!(w.key in PROGRAMS) && w.program && w.program.steps.length, w.key + ' has its own program');
    assert.ok(w.visitor && !w.scale && !w.placeholder, w.key + ' wears the real model');
  }
  assert.equal(TOWNSFOLK.some((p) => p.key.startsWith('wayfarer')), false, 'the town cast itself is unchanged');
  assert.equal(DEFAULT_FLAGS.wayfarers, false);
  assert.equal(JSON.parse(readFileSync(new URL('../../public/features.json', import.meta.url), 'utf8')).flags.wayfarers, true);
});

test('wayfarers: every stop plays a clip the fallback table knows', () => {
  const acts = new Set();
  for (const st of WAYFARERS[0].program.steps) { assert.ok(st.clip === 'idle' || CLIP_FALLBACK[st.clip], st.clip); acts.add(st.clip); }
  assert.ok(acts.has('take_photo') && acts.has('haggle') && acts.has('idle'));
  assert.equal(pickClip(['idle', 'walk', 'talk', 'think'], 'take_photo'), 'think', 'without the own clip it thinks');
  assert.equal(pickClip(['idle', 'take_photo'], 'take_photo'), 'take_photo');
});

test('wayfarers: four minutes of the whole town with the visitor: nobody overlaps anybody', () => {
  const plans = [...TOWNSFOLK.map((d) => new PersonPlan(d)), ...WAYFARERS.map((d) => new PersonPlan(d, d.program))];
  const map = new Map(plans.map((p) => [p.key, p])); const bad = [];
  for (let i = 0; i < 240 * 30; i++) {
    for (const p of plans) p.step(1 / 30, { iris: null, reduced: false, others: map });
    for (let a = 0; a < plans.length; a++) for (let b = a + 1; b < plans.length; b++) {
      const A = plans[a], B = plans[b];
      if (Math.abs(A.y - B.y) < 1.2 && Math.hypot(A.x - B.x, A.z - B.z) < MIN_GAP - 1e-6 && bad.length < 5) bad.push(`${A.key}/${B.key} at ${i}`);
    }
  }
  assert.deepEqual(bad, []);
});

const glbJson = (url) => { const b = readFileSync(url); return { b, json: JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) }; };

test('wayfarer model: the Tripo model (mesh + skin) and its baked clip file from the pack, inside the budget', { skip: !existsSync(MODEL) && 'model not built yet' }, () => {
  const clips = glbJson(new URL('../../public/assets/anim/townsfolk_wayfarer.glb', import.meta.url));
  const names = clips.json.animations.map((a) => a.name);
  for (const c of ['idle', 'idle_shift', 'idle_look', 'walk', 'wave', 'nod', 'talk', 'think', 'take_photo', 'haggle']) assert.ok(names.includes(c), 'the clip file has ' + c);
  assert.ok(clips.b.length <= 8e6, 'the clip file is ' + clips.b.length + ' bytes');
  for (const [file, maxBytes, maxTris] of [['townsfolk_wayfarer.glb', 6e6, 20000], ['townsfolk_wayfarer_m.glb', 2.5e6, 20000]]) {
    const { b, json } = glbJson(new URL('../../public/assets/models/' + file, import.meta.url));
    assert.ok(b.length <= maxBytes, file + ' is ' + b.length + ' bytes');
    assert.equal(json.skins.length, 1, file + ' is skinned');
    const bones = new Set(json.skins[0].joints.map((j) => json.nodes[j].name));
    for (const n of clips.json.nodes.map((x) => x.name)) if (/Hips|Spine|Head|Hand|Foot/.test(n)) assert.ok(bones.has(n), file + ' has the bone ' + n + ' the clips move');
    const tris = json.meshes.flatMap((m) => m.primitives).reduce((n, p) => n + json.accessors[p.indices].count / 3, 0);
    assert.ok(tris <= maxTris, file + ' has ' + tris + ' triangles');
  }
});
