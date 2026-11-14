// The new heroines (owner 14.11: the Tripo elise_anim_pack.glb and the iris_anim_pack FBX): each model on its own rig and
// its game clip file cut from its own pack clips (art/heroes/<id>_game_clips.json → assets/anim/<id>.glb), with every clip name
// and extra play/iris-avatar.js reads. Sheriffchenko (agent rig) keeps the old Iris clips as iris_agent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heroById } from '../../src/render/asset-catalog.js';

const glb = (rel) => { const b = readFileSync(new URL('../../public/assets/' + rel, import.meta.url)); return { b, json: JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) }; };
const mapOf = (id) => JSON.parse(readFileSync(new URL('../../../art/heroes/' + id + '_game_clips.json', import.meta.url), 'utf8'));

test('heroes: Elise plays agent_elise with the side-car elise, Iris agent_iris with iris, Sheriffchenko retargets the agent-rig file', () => {
  assert.equal(heroById('iris').model, 'agent_iris'); assert.equal(heroById('sheriffchenko').sidecar, 'iris_agent');
  readFileSync(new URL('../../public/assets/anim/iris_agent.glb', import.meta.url));
  const h = heroById('elise');
  assert.equal(h.model, 'agent_elise'); assert.match(readFileSync(new URL('../../src/play/anim-library.js', import.meta.url), 'utf8'), /SIDECAR = Object\.freeze\(\{[^}]*agent_elise: 'elise'/); assert.ok(h.toon, 'toon: the side-car is looked up by her own model');
});

for (const id of ['elise', 'iris']) test(id + ': the clip file has the game names, the timing extras inside each clip, and binds to the model bones', () => {
  const MAP = mapOf(id), { b, json } = glb('anim/' + id + '.glb');
  assert.ok(b.length <= 4.5e6, 'the clip file is ' + b.length + ' bytes'); // with fly and the 15 emotes (owner 14.11)
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
  for (const n of ['strike1', 'strike2', 'strike3', 'strike_super']) assert.ok(byName.get(n).extras.impact_s <= 0.2, n + ' lands quickly');
  for (const file of ['agent_' + id + '.glb', 'agent_' + id + '_m.glb']) {
    const m = glb('models/' + file).json;
    assert.equal(m.skins.length, 1, file + ' is skinned');
    const bones = new Set(m.skins[0].joints.map((j) => m.nodes[j].name));
    for (const n of json.nodes.map((x) => x.name)) if (/Hips|Hip$|Spine|Head$|Hand$|Foot$/.test(n)) assert.ok(bones.has(n), file + ' has ' + n);
    const tris = m.meshes.flatMap((x) => x.primitives).reduce((s, p) => s + m.accessors[p.indices].count / 3, 0);
    assert.ok(tris <= 50000, file + ' has ' + tris + ' triangles');
  }
});

test('the rider: every heroine\'s clip file has `ride` (astride, a loop) with the hip joint to seat her on the saddle', () => {
  for (const f of ['iris', 'elise', 'iris_agent']) {
    const { json } = glb('anim/' + f + '.glb'), a = json.animations.find((x) => x.name === 'ride');
    assert.ok(a, f + ' has ride');
    assert.equal(a.extras.loop, true); assert.equal(a.extras.speed, 0);
    const p = a.extras.pelvis; assert.ok(Array.isArray(p) && p[1] > 0.5 && p[1] < 0.8 && Math.abs(p[0]) < 0.05, f + ' hip joint ' + p + ' (seated: lower than standing)');
  }
  const boot = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8'), shoal = readFileSync(new URL('../../src/scenes/glass-shoal.js', import.meta.url), 'utf8');
  assert.match(shoal, /riding: \(\) => mode === 'ride'/);
  assert.match(boot, /if \(shoalSpeed != null && glassShoal\.riding && glassShoal\.riding\(\)\) seatRider\(avatar\);/);
  assert.match(boot, /irisAvatar\.react\('ride', clock\.elapsedTime\)/);
});

test('the run: one stride of the pack run (picked by the owner from five), foot contacts for the footsteps, in phase with the walk', () => {
  for (const id of ['iris', 'elise']) {
    const { json } = glb('anim/' + id + '.glb'), by = new Map(json.animations.map((a) => [a.name, a]));
    const run = by.get('run'), walk = by.get('walk');
    assert.match(run.extras.take, /tripo_pack:run.001/); assert.ok(run.extras.speed > 4 && run.extras.speed < 5, id + ' run ' + run.extras.speed);
    for (const c of [run, walk]) for (const f of ['L', 'R']) assert.ok(c.extras.contact[f][0] >= 0 && c.extras.contact[f][0] < 1, id + ' ' + c.name + ' ' + f);
    const d = Math.abs(run.extras.contact.L[0] - walk.extras.contact.L[0]); assert.ok(Math.min(d, 1 - d) < 0.1, id + ': the left foot lands in the same phase in walk and run');
    assert.ok(walk.extras.speed > 1 && walk.extras.speed < 1.4, id + ' walk ' + walk.extras.speed);
  }
});

test('phones: every hero model and its _m variant has every bone its clip file animates (agent rig for the retargeted one)', () => {
  const tracked = (f) => { const { json } = glb('anim/' + f + '.glb'); return new Set(json.animations.flatMap((a) => a.channels.map((c) => json.nodes[c.target.node].name))); };
  const bonesOf = (f) => { const m = glb('models/' + f).json; return new Set(m.skins[0].joints.map((j) => m.nodes[j].name)); };
  for (const [model, clip] of [['agent_iris', 'iris'], ['agent_elise', 'elise']]) {
    const want = tracked(clip);
    for (const f of [model + '.glb', model + '_m.glb']) { const has = bonesOf(f); const miss = [...want].filter((n) => !has.has(n)); assert.deepEqual(miss, [], f + ' lacks bones ' + miss.slice(0, 5)); }
  }
  // Sheriffchenko is retargeted at load from iris_agent.glb: his body needs the agent rig's core bones
  for (const f of ['agent_sheriffchenko.glb', 'agent_sheriffchenko_m.glb']) { const has = bonesOf(f); for (const n of ['pelvis', 'spine', 'chest', 'head', 'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R', 'upperarm_L', 'forearm_L', 'upperarm_R', 'forearm_R']) assert.ok(has.has(n), f + ' has ' + n); }
});

test('phones: clip file URLs are versioned like the models (a cached old clip file never meets a new model)', async () => {
  const { scanAnims, modelListSource } = await import('../../build/model-list.js');
  const anims = scanAnims(new URL('../../public/assets/anim', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  assert.ok(anims.iris > 0 && anims.elise > 0 && anims.townsfolk_pack > 0);
  assert.match(modelListSource(new URL('../../public/assets/models', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), /export const ANIM_FILES = \{.*"iris":\d+/);
  const lib = readFileSync(new URL('../../src/play/anim-library.js', import.meta.url), 'utf8'), assets = readFileSync(new URL('../../src/render/assets.js', import.meta.url), 'utf8');
  assert.match(lib, /loader\.loadAsync\(animUrl\(name, base\)\)/); assert.match(lib, /'\?v=' \+ n/);
  assert.match(assets, /globalThis\.__ftfAnimFiles = MODEL_LIST\.ANIM_FILES/);
  assert.doesNotMatch(assets, /from '\.\.\/play\//, 'no play/ import in the client core');
  assert.match(lib, /animUrl\(name, base = '\/', files = globalThis\.__ftfAnimFiles/);
});
