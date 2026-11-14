// The Hollow Tide: the clip choice (game/shoal-boss-anim.js) against the fight rules, and the shipped model files
// (clips and their lengths, the skin, budgets). The model is made by art/shoal/boss/ (docs/art/manifest.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bossAnimStep, freshBossAnim, fadeWeights, BOSS_CLIPS, BOSS_ANIM } from '../../src/game/shoal-boss-anim.js';
import * as R from '../../src/game/shoal-rules.js';

const glb = (name) => {
  const b = readFileSync(new URL('../../public/assets/models/' + name, import.meta.url));
  const jl = b.readUInt32LE(12); const json = JSON.parse(b.subarray(20, 20 + jl).toString());
  return { json, bytes: b.length, bin: b.subarray(20 + jl + 8) };
};

test('boss anim: it rises on entry, then idles; a return visit finds it already down', () => {
  let a = freshBossAnim(); const b = R.freshBoss(0);
  assert.deepEqual([a.clip, a.time], ['rise', 0]);
  for (let t = 0; t < BOSS_ANIM.len.rise + 0.1; t += 1 / 60) a = bossAnimStep(a, { ...b, t: 3 }, 1 / 60, 1.4);
  assert.equal(a.clip, 'idle');
  const down = freshBossAnim(true);
  assert.deepEqual([down.clip, down.time], ['death', BOSS_ANIM.len.death]);
});

test('boss anim: the blow in the clip lands when the rules strike, in every phase', () => {
  for (const phase of [0, 1, 2]) {
    const P = R.BOSS.phases[phase]; let b = { ...R.freshBoss(phase), t: 0.01 }; let a = { clip: 'idle', time: 0, phase };
    const seen = new Set(); let strikes = 0;
    for (let i = 0; i < 60 * 40; i++) {
      const r = R.bossStep(b, 1 / 60, [0, 20]); b = r.boss; a = bossAnimStep(a, b, 1 / 60, P.telegraph);
      for (const e of r.events) if (e.type === 'strike') {
        strikes++; seen.add(e.attack.kind);
        assert.equal(a.clip, e.attack.kind);
        assert.ok(Math.abs(a.time - BOSS_ANIM.wind) < 0.05, 'phase ' + phase + ' ' + a.clip + ' strikes at ' + a.time);
      }
      if (b.state === 'telegraph' && b.attack.kind !== 'adds') assert.ok(a.time <= BOSS_ANIM.wind + 1e-9);
      assert.ok(BOSS_CLIPS.includes(a.clip)); assert.ok(a.time >= 0 && a.time <= BOSS_ANIM.len[a.clip] + 1e-9);
    }
    assert.ok(strikes > 5); assert.ok(seen.has('slam') && seen.has('sweep'));
  }
});

test('boss anim: a broken phase makes it recoil, a win plays the death once and holds its last frame', () => {
  let a = { clip: 'idle', time: 1, phase: 0 }; const b = { ...R.freshBoss(1), state: 'rest', t: 2 };
  a = bossAnimStep(a, b, 1 / 60, 1.15); assert.equal(a.clip, 'hit'); assert.equal(a.phase, 1);
  let r = a; const seen = [];                                   // left alone it roars after the recoil, then idles
  for (let i = 0; i < 60 * 4; i++) { r = bossAnimStep(r, b, 1 / 60, 1.15); if (seen[seen.length - 1] !== r.clip) seen.push(r.clip); }
  assert.deepEqual(seen, ['hit', 'roar', 'idle']);
  const dead = { ...b, dead: true };
  a = bossAnimStep(a, dead, 1 / 60, 1.15, true); assert.deepEqual([a.clip, a.time], ['death', 0]);
  for (let i = 0; i < 600; i++) a = bossAnimStep(a, dead, 1 / 60, 1.15, true);
  assert.deepEqual([a.clip, a.time], ['death', BOSS_ANIM.len.death]);
});

test('boss anim: cross-fade weights stay normalised and reach the clip', () => {
  const w = {}; fadeWeights(w, 'idle', 1);
  assert.equal(w.idle, 1);
  for (let i = 0; i < 30; i++) { fadeWeights(w, 'slam', 1 / 60); assert.ok(Math.abs(Object.values(w).reduce((x, y) => x + y, 0) - 1) < 1e-9); }
  assert.ok(w.slam > 0.9);
});

test('boss model: both files carry the eight clips with the lengths the game times them by, inside the budget', () => {
  for (const [file, maxBytes, maxTris] of [['hollow_tide.glb', 8e6, 50000], ['hollow_tide_m.glb', 3e6, 22000]]) {
    const { json, bytes, bin } = glb(file);
    assert.ok(bytes <= maxBytes, file + ' is ' + bytes + ' bytes');
    assert.deepEqual(json.animations.map((x) => x.name).sort(), [...BOSS_CLIPS].sort());
    assert.equal(json.skins.length, 1); assert.ok(json.skins[0].joints.length <= 32);
    const tris = json.meshes.flatMap((m) => m.primitives).reduce((n, p) => n + json.accessors[p.indices].count / 3, 0);
    assert.ok(tris <= maxTris, file + ' has ' + tris + ' triangles');
    for (const an of json.animations) {            // the clip's length = the largest key time of its samplers
      const end = Math.max(...an.samplers.map((sm) => json.accessors[sm.input].max[0]));
      assert.ok(Math.abs(end - BOSS_ANIM.len[an.name]) < 0.05, file + ' ' + an.name + ' is ' + end + ' s');
    }
    assert.ok(json.materials.some((m) => m.emissiveTexture), file + ' has the glowing core');
    void bin;
  }
});
