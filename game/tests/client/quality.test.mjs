// Quality tiers and the phone profile (docs/mobile.md): pure functions, no WebGL.
import assert from 'node:assert/strict';
import test from 'node:test';
import { QUALITY, PHONE_QUALITY, TIERS, PROFILES, GOVERNORS, qualityFor, detectTier, detectProfile, lowerTier, tierForPreference, TierGovernor } from '../../src/render/quality.js';

test('desktop tiers keep their knobs (the phone profile never changes them)', () => {
  assert.deepEqual(TIERS, ['ultra', 'high', 'low']);
  assert.deepEqual(PROFILES, ['desktop', 'phone']);
  assert.equal(QUALITY.ultra.pixelRatioCap, 1.5); assert.equal(QUALITY.ultra.shadowMap, 2048); assert.equal(QUALITY.ultra.shadowFarMap, 4096); assert.equal(QUALITY.ultra.grassBlades, 36000); assert.equal(QUALITY.ultra.ao, true);
  assert.equal(QUALITY.high.pixelRatioCap, 1); assert.equal(QUALITY.high.shadowMap, 2048); assert.equal(QUALITY.high.grassBlades, 18000); assert.equal(QUALITY.high.post, true);
  assert.equal(QUALITY.low.pixelRatioCap, 1); assert.equal(QUALITY.low.shadowMap, 1024); assert.equal(QUALITY.low.grassBlades, 5000); assert.equal(QUALITY.low.post, false);
  for (const t of TIERS) assert.equal(qualityFor(t, 'desktop'), QUALITY[t]);
  assert.equal(qualityFor('bogus', 'desktop'), QUALITY.ultra);
  assert.equal(lowerTier('ultra'), 'high'); assert.equal(lowerTier('high'), 'low'); assert.equal(lowerTier('low'), null);
  assert.equal(tierForPreference('low', 'ultra'), 'low'); assert.equal(tierForPreference('high', 'low'), 'high'); assert.equal(tierForPreference('auto', 'high'), 'high');
});

test('phone profile: ultra and high share the phone-high knobs, low is cheaper still, both below desktop low', () => {
  assert.equal(qualityFor('ultra', 'phone'), PHONE_QUALITY.high);
  assert.equal(qualityFor('high', 'phone'), PHONE_QUALITY.high);
  assert.equal(qualityFor('low', 'phone'), PHONE_QUALITY.low);
  const same = new Set(Object.keys(QUALITY.low));
  for (const cfg of [PHONE_QUALITY.high, PHONE_QUALITY.low]) {
    assert.deepEqual(new Set(Object.keys(cfg)), same, 'every knob the renderer reads exists');
    assert.equal(cfg.post, false); assert.equal(cfg.ao, false); assert.equal(cfg.bloom, false); assert.equal(cfg.godRays, false);
    assert.equal(cfg.transmission, false); assert.equal(cfg.iridescence, false); assert.equal(cfg.pointLights, false);
    assert.equal(cfg.envHdr, false); assert.equal(cfg.cloudLayers, 1);
    assert.ok(cfg.shadowMap <= QUALITY.low.shadowMap);
    assert.ok(cfg.grassBlades < QUALITY.low.grassBlades && cfg.flowers < QUALITY.low.flowers);
    assert.ok(cfg.grassFadeDistance < QUALITY.low.grassFadeDistance);
  }
  assert.equal(PHONE_QUALITY.high.pixelRatioCap, 1.5, 'phones are small: resolution over effects');
  assert.equal(PHONE_QUALITY.low.pixelRatioCap, 1);
  assert.ok(PHONE_QUALITY.low.shadowMap < PHONE_QUALITY.high.shadowMap);
  assert.ok(PHONE_QUALITY.low.grassBlades < PHONE_QUALITY.high.grassBlades);
});

test('detectTier: desktop heuristics unchanged', () => {
  assert.equal(detectTier({ gpu: 'NVIDIA GeForce RTX 2060 SUPER' }), 'high');
  assert.equal(detectTier({ gpu: 'NVIDIA GeForce RTX 3060 Ti' }), 'ultra');
  assert.equal(detectTier({ gpu: 'NVIDIA GeForce RTX 4070' }), 'ultra');
  assert.equal(detectTier({ gpu: 'NVIDIA GeForce GTX 1060' }), 'low');
  assert.equal(detectTier({ gpu: 'NVIDIA GeForce GTX 1660 Ti' }), 'high');
  assert.equal(detectTier({ gpu: 'Intel(R) UHD Graphics 630' }), 'low');
  assert.equal(detectTier({ gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' }), 'low');
  assert.equal(detectTier({ gpu: 'Apple M1' }), 'high');
  assert.equal(detectTier({ gpu: 'Apple M2 Max' }), 'ultra');
  assert.equal(detectTier({ gpu: 'AMD Radeon RX 6800' }), 'ultra');
  assert.equal(detectTier({ gpu: 'Mystery GPU' }), 'high');
  assert.equal(detectTier({ gpu: 'Mystery GPU', deviceMemory: 4 }), 'low');
  assert.equal(detectTier({}), 'high');
});

test('detectTier: phones start on high unless the device signals say weak', () => {
  assert.equal(detectTier({ mobile: true, gpu: 'Apple GPU' }), 'high', 'iPhone: no memory/core numbers, the governor decides');
  assert.equal(detectTier({ mobile: true, gpu: 'ANGLE (ARM, Mali-G710 MC10, OpenGL ES 3.2)', deviceMemory: 8, cores: 8 }), 'high', 'Pixel 7');
  assert.equal(detectTier({ mobile: true, gpu: 'ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)', deviceMemory: 8, cores: 8 }), 'high');
  assert.equal(detectTier({ mobile: true, gpu: 'Adreno (TM) 730', deviceMemory: 2 }), 'low', '3 GB phones report deviceMemory 2');
  assert.equal(detectTier({ mobile: true, gpu: 'Adreno (TM) 730', cores: 2 }), 'low');
  assert.equal(detectTier({ mobile: true, gpu: 'Adreno (TM) 530', deviceMemory: 4 }), 'low', 'Adreno 5xx');
  assert.equal(detectTier({ mobile: true, gpu: 'Adreno (TM) 610', deviceMemory: 4 }), 'high');
  assert.equal(detectTier({ mobile: true, gpu: 'Mali-G52 MC2', deviceMemory: 4 }), 'low');
  assert.equal(detectTier({ mobile: true, gpu: 'Mali-G71 MP20', deviceMemory: 4 }), 'low');
  assert.equal(detectTier({ mobile: true, gpu: 'Mali-G78 MP14', deviceMemory: 8 }), 'high');
  assert.equal(detectTier({ mobile: true, gpu: 'Mali-T880', deviceMemory: 4 }), 'low');
  assert.equal(detectTier({ mobile: true, gpu: 'PowerVR SGX 544MP' }), 'low');
  assert.equal(detectTier({ mobile: true, gpu: 'SwiftShader' }), 'low');
});

test('detectProfile: phone user agents and small touch screens are phones; tablets and desktops are not', () => {
  assert.equal(detectProfile({ mobile: true }), 'phone');
  assert.equal(detectProfile({ coarse: true, screenMin: 390 }), 'phone');
  assert.equal(detectProfile({ coarse: true, screenMin: 600 }), 'phone');
  assert.equal(detectProfile({ coarse: true, screenMin: 820 }), 'desktop', 'iPad-class screen with a desktop user agent');
  assert.equal(detectProfile({ coarse: false, screenMin: 390 }), 'desktop', 'a small desktop window is not a phone');
  assert.equal(detectProfile({}), 'desktop');
  assert.equal(detectProfile({ coarse: true }), 'desktop', 'no screen size: keep the desktop profile');
});

function run(gov, tier, ms, frames) {
  const changes = [];
  for (let i = 0; i < frames; i++) { const c = gov.step(ms, tier); if (c) { changes.push(c); if (c.tier) tier = c.tier; } }
  return { changes, tier };
}

test('desktop governor: steps the tier down once per window, never up, no resolution steps, stops at 40 s', () => {
  const gov = new TierGovernor(GOVERNORS.desktop);
  assert.deepEqual(GOVERNORS.desktop.pixelScales, []);
  let r = run(gov, 'ultra', 25, 60 * 4); // 4 s warm-up at 25 ms: nothing yet
  assert.deepEqual(r.changes, []);
  r = run(gov, 'ultra', 25, 90);
  assert.deepEqual(r.changes, [{ tier: 'high' }]);
  r = run(gov, 'high', 25, 90); // cooldown: 5 s of frames are ignored
  assert.deepEqual(r.changes, []);
  r = run(gov, 'high', 25, 300);
  assert.deepEqual(r.changes, [{ tier: 'low' }]);
  r = run(gov, 'low', 25, 2000);
  assert.deepEqual(r.changes, [], 'at the bottom the desktop governor gives up');
  assert.equal(gov.done, true);
  assert.equal(gov.pixelScale, 1);
  const fine = new TierGovernor(GOVERNORS.desktop);
  assert.deepEqual(run(fine, 'ultra', 15, 3000).changes, [], 'under budget: no change in 45 s');
  assert.equal(fine.sample(15, 'ultra'), null, 'the tier-only view still works');
});

test('phone governor: 30 fps budget, a tier step after three bad seconds, then two resolution steps', () => {
  const g = GOVERNORS.phone;
  assert.ok(Math.abs(g.budgetMs - 1000 / 30) < 1e-9);
  const gov = new TierGovernor(g);
  let r = run(gov, 'high', 45, Math.ceil(g.warmup * 1000 / 45) + 1);
  assert.deepEqual(r.changes, [], 'warm-up covers asset streaming hitches');
  r = run(gov, 'high', 45, 90);
  assert.deepEqual(r.changes, [{ tier: 'low' }], '90 frames over budget is about three seconds at 30 fps');
  r = run(gov, 'low', 45, Math.ceil(g.cooldown * 1000 / 45) + 90);
  assert.deepEqual(r.changes, [{ pixelScale: 0.85 }]);
  r = run(gov, 'low', 45, Math.ceil(g.cooldown * 1000 / 45) + 90);
  assert.deepEqual(r.changes, [{ pixelScale: 0.7 }]);
  r = run(gov, 'low', 45, 1000);
  assert.deepEqual(r.changes, [], 'floor reached: no further steps');
  assert.equal(gov.done, true);
  const ok = new TierGovernor(g);
  assert.deepEqual(run(ok, 'high', 30, 60 * 60).changes, [], '30 ms frames are inside the 30 fps budget (12 % tolerance)');
  const late = new TierGovernor(g);
  run(late, 'high', 20, Math.ceil(g.windowEnd * 1000 / 20) + 1);
  assert.deepEqual(run(late, 'high', 60, 500).changes, [], 'after windowEnd the governor no longer judges');
});
