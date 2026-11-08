// Smoke: both modes, every locale, reduced motion, the old HUD and the phone profile load with zero console errors,
// the HUD is present and no raw key or placeholder leaks. Also measures the in-game walk and run speeds (QA-018).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame, consoleProblems, shutdown } from './lib/env.mjs';

after(shutdown);

const CASES = [
  ['hub en', '?demo=judge&play=direct', {}],
  ['walk en', '?demo=judge&mode=walk&play=direct', {}],
  ['hub uk', '?demo=judge&play=direct&lang=uk', {}],
  ['hub ru', '?demo=judge&play=direct&lang=ru', {}],
  ['hub it', '?demo=judge&play=direct&lang=it', {}],
  ['hub zh', '?demo=judge&play=direct&lang=zh', {}],
  ['hub reduced motion, low tier', '?demo=judge&play=direct&motion=reduce&tier=low', { reducedMotion: true }],
  ['walk old HUD', '?demo=judge&mode=walk&play=direct&hud=old', {}],
  ['hub phone (Pixel 7)', '?demo=judge', { device: 'Pixel 7' }],
];

for (const [name, query, opts] of CASES) {
  test(`loads: ${name}`, { timeout: 600000 }, async () => {
    const g = await openGame(query, opts);
    try {
      await g.wait(2000);
      const o = await g.obs();
      assert.equal(o.phase, 'play');
      assert.equal(o.tick, 1);
      assert.equal(o.silk, 63);
      const hud = (await g.text('.wh-root, .pl-goal, .ftf-hud')).join(' ');
      assert.ok(hud.length > 40, 'HUD rendered');
      assert.ok(!/\b(wh|hub|goal|play|tut)\.[a-z]+\.[a-z.]+\b/.test(hud), 'raw key in HUD: ' + hud.slice(0, 200));
      assert.ok(!hud.includes('…') || !hud.includes(' … '), 'missing-message placeholder');
      assert.ok(!/\{[a-z]+\}/.test(hud), 'unrendered placeholder: ' + (hud.match(/\{[a-z]+\}/g) || []).join(','));
      await g.shot('smoke-' + name.replace(/[^a-z0-9]+/gi, '-'));
      assert.equal(consoleProblems(g), '');
      assert.deepEqual(g.log.failed.filter((f) => !/favicon/.test(f)), [], 'failed requests');
    } finally { await g.close(); }
  });
}

test('QA-018 walk and run speeds match the design (1.7 m/s, run ×2.1)', { timeout: 600000 }, async () => {
  const g = await openGame('?demo=judge&mode=walk&play=direct');
  try {
    const measure = async (run) => {
      await g.page.evaluate((r) => { const c = window.__ftf; c.player.run = r; window.__sp = []; let n = 0; const tick = () => { c.player.step([0, -1], 1 / 30); window.__sp.push(Math.hypot(c.player.vel[0], c.player.vel[1])); if (++n < 90) tick(); }; tick(); }, run);
      return g.page.evaluate(() => Math.max(...window.__sp));
    };
    const walk = await measure(false), runSpeed = await measure(true);
    console.log(`walk ${walk.toFixed(2)} m/s, run ${runSpeed.toFixed(2)} m/s`);
    assert.ok(Math.abs(walk - 1.7) < 0.05, 'walk speed ' + walk);
    assert.ok(Math.abs(runSpeed - 1.7 * 2.1) < 0.1, 'run speed ' + runSpeed);
  } finally { await g.close(); }
});
