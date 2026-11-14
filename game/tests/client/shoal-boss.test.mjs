// The Hollow Tide: the clip choice (game/shoal-boss-anim.js) against the fight rules, and the shipped model files
// (clips and their lengths, the skin, budgets). The model is made by art/shoal/boss/ (docs/art/manifest.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bossAnimStep, freshBossAnim, fadeWeights, BOSS_CLIPS, BOSS_ANIM, ALL_CLIPS, CLIP_STANDIN, clipOn } from '../../src/game/shoal-boss-anim.js';
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
      assert.ok(ALL_CLIPS.includes(a.clip)); assert.ok(a.time >= 0 && a.time <= BOSS_ANIM.len[a.clip] + 1e-9);
    }
    assert.ok(strikes > 5); assert.ok(seen.size >= 3, 'phase ' + phase + ': ' + [...seen]);
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

test('the killing blow clears the boss\'s attack: no telegraph is left glowing after the win (GPU bench run 14.11)', async () => {
  const R = await import('../../src/game/shoal-rules.js');
  let b = R.freshBoss(2);
  b = R.bossStep(b, 10, [0, 0]).boss;                       // rest -> telegraph
  assert.equal(b.state, 'telegraph'); assert.ok(b.attack);
  const r = R.hitBoss({ ...b, exposed: 1 }, 1e9);
  assert.equal(r.boss.dead, true); assert.equal(r.boss.state, 'dead'); assert.equal(r.boss.attack, null);
  assert.deepEqual(R.bossStep(r.boss, 5, [0, 0]).events, [], 'a dead boss does nothing');
});


// ---- the ice serpent (owner 14.11): ice breath (inhale, then a cone) and a stagger when its crest opens; the winged
// moves (claw, takeoff, dive) stay in the rules for another boss; any clip the model lacks plays its stand-in
test('the ice serpent: breath in every phase, the cone, a stagger once per opening, stand-in clips', () => {
  const B = R.BOSS;
  for (const P of B.phases) { assert.ok(P.rotation.includes('breath')); for (const k of ['claw', 'takeoff', 'dive']) assert.ok(!P.rotation.includes(k), k); }
  const breath = { kind: 'breath', at: [0, 0], dir: [0, 1] };
  assert.equal(R.inDanger(breath, 0, 20), true, 'in the cone'); assert.equal(R.inDanger(breath, 12, 8), false, 'beside it');
  assert.equal(R.inDanger(breath, 0, -5), false, 'behind it'); assert.equal(R.inDanger(breath, 0, 20, B, 6), false, 'flying over the breath');
  // the rules still carry the winged moves (a dragon later): claw near, breath far
  const claw = { kind: 'claw', at: [0, 0], dir: [0, 1] }; assert.equal(R.inDanger(claw, 0, 6), true); assert.equal(R.inDanger(claw, 0, 14), false);
  // a breath strikes at the end of its telegraph, aimed at her
  let b = { ...R.freshBoss(0), t: 0.01, idx: 2 }; let aimed = null, struck = false;
  for (let i = 0; i < 600 && !struck; i++) { const s = R.bossStep(b, 1 / 60, [5, 20]); b = s.boss; for (const e of s.events) { if (e.type === 'telegraph') aimed = e.attack; if (e.type === 'strike') struck = e.attack.kind === 'breath'; } }
  assert.ok(struck && aimed.kind === 'breath' && aimed.dir[0] > 0 && aimed.dir[1] > 0);
  // stagger: once when the crest opens, then back to idle while it stays open
  let a = { clip: 'idle', time: 0, phase: 0 }; const rest = { ...R.freshBoss(0), state: 'rest', t: 2 };
  a = bossAnimStep(a, { ...rest, exposed: 2 }, 1 / 60, 1.4); assert.equal(a.clip, 'stagger');
  for (let i = 0; i < 90; i++) a = bossAnimStep(a, { ...rest, exposed: 1 }, 1 / 60, 1.4);
  assert.equal(a.clip, 'idle', 'it plays once per opening');
  a = bossAnimStep(a, { ...rest, exposed: 0 }, 1 / 60, 1.4); a = bossAnimStep(a, { ...rest, exposed: 2 }, 1 / 60, 1.4); assert.equal(a.clip, 'stagger', 'and again at the next opening');
  const tide = (n) => BOSS_CLIPS.includes(n);
  for (const [c, s2] of Object.entries(CLIP_STANDIN)) { assert.equal(clipOn(c, tide), s2); assert.equal(clipOn(c, () => true), c); }
});
