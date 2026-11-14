// The new Elise (owner 14.11: the Tripo elise_anim_pack.glb): her model on a Mixamo rig and her game clip file cut from
// the pack (art/heroes/elise_game_clips.json → assets/anim/elise.glb), with every clip name and extra play/iris-avatar.js reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heroById } from '../../src/render/asset-catalog.js';

const glb = (rel) => { const b = readFileSync(new URL('../../public/assets/' + rel, import.meta.url)); return { b, json: JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) }; };
const MAP = JSON.parse(readFileSync(new URL('../../../art/heroes/elise_game_clips.json', import.meta.url), 'utf8'));

test('elise: the hero row plays agent_elise with the side-car elise', () => {
  const h = heroById('elise');
  assert.equal(h.model, 'agent_elise'); assert.match(readFileSync(new URL('../../src/play/anim-library.js', import.meta.url), 'utf8'), /SIDECAR = Object\.freeze\(\{[^}]*agent_elise: 'elise'/); assert.ok(h.toon, 'toon: the side-car is looked up by her own model');
});

test('elise: the clip file has the game names, the timing extras inside each clip, and binds to the model bones', () => {
  const { b, json } = glb('anim/elise.glb');
  assert.ok(b.length <= 2e6, 'the clip file is ' + b.length + ' bytes');
  const byName = new Map(json.animations.map((a) => [a.name, a]));
  for (const n of ['idle', 'idle_look', 'walk', 'run', 'register', 'greet', 'dash', 'strike1', 'strike2', 'strike3', 'slash1', 'strike_charge', 'strike_super', 'cast_lance', 'cast_snare']) assert.ok(byName.has(n), 'has ' + n);
  for (const [name, e] of Object.entries(MAP)) {
    if (name === '_') continue;
    const a = byName.get(name), x = a.extras || {}, len = json.accessors[a.samplers[0].input].max[0];
    for (const [k, v] of Object.entries(e.extras)) assert.deepEqual(x[k], v, name + ' ' + k);
    for (const k of ['impact_s', 'release_s', 'step_s']) if (typeof x[k] === 'number') assert.ok(x[k] > 0 && x[k] < len, `${name} ${k} ${x[k]} inside ${len.toFixed(2)} s`);
    if (e.window) assert.ok(Math.abs(len - (e.window[1] - e.window[0])) < 0.06, name + ' is its window');
  }
  assert.ok(byName.get('walk').extras.speed > 0.8 && byName.get('run').extras.speed > byName.get('walk').extras.speed);
  assert.equal(byName.get('strike_charge').extras.hold, true); assert.equal(byName.get('strike_super').extras.from, 'strike_charge');
  for (const file of ['agent_elise.glb', 'agent_elise_m.glb']) {
    const m = glb('models/' + file).json;
    assert.equal(m.skins.length, 1, file + ' is skinned');
    const bones = new Set(m.skins[0].joints.map((j) => m.nodes[j].name));
    for (const n of json.nodes.map((x) => x.name)) if (/Hips|Spine|Head|Hand$|Foot$/.test(n)) assert.ok(bones.has(n), file + ' has ' + n);
    const tris = m.meshes.flatMap((x) => x.primitives).reduce((s, p) => s + m.accessors[p.indices].count / 3, 0);
    assert.ok(tris <= 50000, file + ' has ' + tris + ' triangles');
  }
});
