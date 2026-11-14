// The Tripo townsfolk pack in town: one shared clip file (assets/anim/townsfolk_pack.glb) retargeted at load onto every
// body, and the social clips wired into the plans: idle variety, two greetings, pairs that talk, agree and laugh.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PersonPlan, TOWNSFOLK, PROGRAMS, PACK_FILE, PACK_CLIPS, IDLE_VARIETY, LISTENER_CLIPS, TALKER_CLIPS, CLIP_FALLBACK, pickClip, DANCE_RADIUS } from '../../src/play/townsfolk-plan.js';

const glbJson = (url) => { const b = readFileSync(url); return { b, json: JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) }; };
const BODY = /^(pelvis|spine|chest|neck|head|shoulder_[LR]|upperarm_[LR]|forearm_[LR]|hand_[LR]|thumb_[LR]|index_[LR]|fingers_[LR]|thigh_[LR]|shin_[LR]|foot_[LR]|toe_[LR])$/;

test('townsfolk pack: one small shared file with the social clips, body tracks only, extras the retarget reads', () => {
  const { b, json } = glbJson(new URL(`../../public/assets/anim/${PACK_FILE}.glb`, import.meta.url));
  assert.ok(!PACK_CLIPS.some((n) => /make_a_call_01|take_photo|wave_goodbye/.test(n)), 'no seated idle clip in the pack (owner 14.11)');
  assert.ok(b.length <= 2.2e6, 'the pack is ' + b.length + ' bytes');
  assert.deepEqual(json.animations.map((a) => a.name).sort(), [...PACK_CLIPS].sort());
  assert.ok(json.nodes.some((n) => n.name === 'pelvis'), 'the agent rig skeleton the game retargets from');
  for (const a of json.animations) {
    assert.equal(typeof a.extras.loop, 'boolean', a.name); assert.equal(a.extras.speed, 0, a.name + ' stands');
    // the retarget reads every track at the first track's key times: different key counts gave NaN poses (bodies gone)
    const counts = new Set(a.channels.map((c) => json.accessors[a.samplers[c.sampler].input].count));
    assert.equal(counts.size, 1, a.name + ' tracks share their key times: ' + [...counts]);
    assert.equal(a.samplers.length, a.channels.length, a.name + ' carries no unused tracks');
    for (const c of a.channels) {
      const n = json.nodes[c.target.node].name;
      assert.ok(BODY.test(n), a.name + ' moves only body bones, not ' + n);
      assert.ok(c.target.path === 'rotation' || (c.target.path === 'translation' && n === 'pelvis'), a.name + ' ' + n + '.' + c.target.path);
    }
  }
});

test('townsfolk pack: every wanted clip falls back to an older one until the pack arrives', () => {
  const before = ['idle', 'idle_shift', 'walk', 'talk', 'talk_b', 'wave', 'nod', 'salute'];
  for (const want of [...IDLE_VARIETY, ...LISTENER_CLIPS, ...TALKER_CLIPS, 'greet', 'goodbye', 'clap', 'cheer', 'dance']) {
    assert.ok(CLIP_FALLBACK[want], want + ' has a chain');
    assert.ok(pickClip(before, want), want + ' plays something before the pack');
  }
  const after = [...before, ...PACK_CLIPS];
  assert.equal(pickClip(after, 'greet'), 'greet_04'); assert.equal(pickClip(after, 'laugh'), 'laugh_01');
  assert.equal(pickClip(after, 'scratch'), 'scratch'); assert.equal(pickClip(after, 'arms_folded'), 'think');
  for (const [want, got] of [['angry', 'angry_01'], ['laugh_b', 'laugh_02'], ['goodbye', 'wave'], ['phone', 'make_a_call_02'], ['relax', 'standing_relax'], ['take_photo', 'make_a_call_02'], ['dance', 'dance_03'], ['clap', 'clap'], ['cheer', 'cheer'], ['sit', 'sit']]) assert.equal(pickClip(after, want), got);
});

test('townsfolk pack: a standing idle varies, the talkers cycle talk/complain and listen/agree/laugh, greetings alternate', () => {
  const map = new Map(TOWNSFOLK.map((d) => [d.key, new PersonPlan(d)]));
  const seen = new Map([...map.keys()].map((k) => [k, new Set()]));
  for (let i = 0; i < 240 * 30; i++) for (const [k, p] of map) { p.step(1 / 30, { iris: null, reduced: false, others: map }); seen.get(k).add(p.clip); }
  const guard = seen.get('guard');
  assert.ok(IDLE_VARIETY.filter((c) => guard.has(c)).length >= 2, 'the guard varies his idle: ' + [...guard]);
  const talk = new Set([...seen.get('scribe'), ...seen.get('shardkeeper')]);
  for (const c of ['talk', 'talk_b', 'haggle', 'angry', 'listen', 'nod', 'laugh', 'laugh_b']) assert.ok(talk.has(c), 'the pair at the chat point plays ' + c);
  // the innkeeper greets Iris twice: a wave, then the pack's greeting
  const inn = new PersonPlan(TOWNSFOLK.find((d) => d.key === 'innkeeper')), home = PROGRAMS.innkeeper.home, got = [];
  for (const far of [false, true, false, true, false]) for (let i = 0; i < 30; i++) {
    inn.step(1 / 30, { iris: far ? [home[0] + 20, home[1], home[2]] : [home[0] + 1.5, home[1], home[2]], reduced: false, others: new Map() });
    if (!far && (inn.clip === 'wave' || inn.clip === 'greet') && got[got.length - 1] !== inn.clip) got.push(inn.clip);
  }
  assert.deepEqual(got.slice(0, 2), ['wave', 'greet']);
});

test('townsfolk pack: a goodbye wave when Iris walks off, a cheer for her win, a dance by the playing musician', () => {
  const inn = new PersonPlan(TOWNSFOLK.find((d) => d.key === 'innkeeper')), home = PROGRAMS.innkeeper.home, seen = new Set();
  const run = (frames, at) => { for (let i = 0; i < frames; i++) { inn.step(1 / 30, { iris: at, reduced: false, others: new Map() }); seen.add(inn.clip); } };
  run(30, [home[0] + 1.5, home[1], home[2]]); run(60, [home[0] + 6.5, home[1], home[2]]);
  assert.ok(seen.has('goodbye'), 'waves goodbye: ' + [...seen]);
  seen.clear(); run(100, [home[0] + 30, home[1], home[2]]); inn.react('cheer'); run(30, [home[0] + 30, home[1], home[2]]);
  assert.ok(seen.has('cheer'));
  // a listener by the musician while she plays: the idle turns into a dance
  const mu = new PersonPlan(TOWNSFOLK.find((d) => d.key === 'musician')); mu.clip = 'play';
  const guard = new PersonPlan(TOWNSFOLK.find((d) => d.key === 'guard')); guard.x = mu.x + DANCE_RADIUS / 2; guard.z = mu.z; guard.y = mu.y;
  const danced = new Set(); const others = new Map([['musician', { ...mu, clip: 'play', x: mu.x, y: mu.y, z: mu.z }]]);
  for (let i = 0; i < 60 * 30; i++) { guard.step(1 / 30, { iris: null, reduced: false, others }); danced.add(guard.clip); }
  assert.ok(danced.has('dance'), 'dances: ' + [...danced]);
});

test('the girl (child_a, the owner\'s Tripo model): her bones carry the agent rig names the shared clips retarget onto', () => {
  for (const f of ['townsfolk_child_a.glb', 'townsfolk_child_a_m.glb']) {
    const { b, json } = glbJson(new URL('../../public/assets/models/' + f, import.meta.url));
    assert.ok(b.length <= 3e6, f + ' is ' + b.length + ' bytes');
    const bones = new Set(json.skins[0].joints.map((j) => json.nodes[j].name));
    for (const n of ['pelvis', 'spine', 'chest', 'neck', 'head', 'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R', 'upperarm_L', 'forearm_L', 'hand_L', 'upperarm_R', 'forearm_R', 'hand_R']) assert.ok(bones.has(n), f + ' has ' + n);
  }
});

test('the owner\'s Tripo townsfolk face forward like the town (glTF +Z): the boy and the Sweeper came in turned 90 degrees', () => {
  for (const f of ['child_a', 'child_b', 'sweeper'].flatMap((k) => ['townsfolk_' + k + '.glb', 'townsfolk_' + k + '_m.glb'])) {
    const { json } = glbJson(new URL('../../public/assets/models/' + f, import.meta.url));
    const parent = {}; json.nodes.forEach((n, i) => (n.children || []).forEach((c) => { parent[c] = i; }));
    const local = (n) => { const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], t = n.translation || [0, 0, 0];
      return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, t[0], t[1], t[2], 1]; };
    const mul = (a, b) => { const r = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) for (let l = 0; l < 4; l++) r[k * 4 + i] += a[l * 4 + i] * b[k * 4 + l]; return r; };
    const at = (name) => { let i = json.nodes.findIndex((x) => x.name === name), m = local(json.nodes[i]); for (let p = parent[i]; p !== undefined; p = parent[p]) m = mul(local(json.nodes[p]), m); return [m[12], m[13], m[14]]; };
    let dx = 0, dz = 0; for (const s of ['L', 'R']) { const a = at('foot_' + s), b = at('toe_' + s); dx += b[0] - a[0]; dz += b[2] - a[2]; }
    assert.ok(dz > 0 && Math.abs(Math.atan2(dx, dz)) < 0.35, f + ' toes point ' + Math.round(Math.atan2(dx, dz) * 57.3) + ' deg off forward');
  }
});
