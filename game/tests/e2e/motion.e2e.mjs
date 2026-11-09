// Motion system (worker G, 5563cfc): nothing stays invisible after an animation, input is not blocked during
// transitions, reduced motion (system and setting) is honoured, QA-008 camera after a flight.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame, consoleProblems, shutdown } from './lib/env.mjs';

after(shutdown);

/** Elements that take space but are fully transparent 1.5 s after the last change: a stuck enter/exit animation. */
const stuck = (g, scope) => g.page.evaluate((sel) => [...document.querySelectorAll(sel + ' *')].filter((e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || e.closest('[hidden], [aria-hidden="true"]')) return false; const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 12 && Number(cs.opacity) === 0 && e.textContent.trim().length > 0; }).map((e) => (e.className && String(e.className).slice(0, 50)) + ' "' + e.textContent.trim().slice(0, 40) + '"').slice(0, 12), scope);

test('lobby and onboarding: input works at once, nothing stays transparent, reduced motion honoured', { timeout: 900000 }, async (t) => {
  for (const reduced of [false, true]) {
    const g = await openGame('?demo=judge&mode=walk', { ready: false, reducedMotion: reduced });
    try {
      const label = reduced ? ' (reduced motion)' : '';
      await g.page.waitForSelector('#ftf-enter', { timeout: 60000 });
      await t.test('ENTER right after the lobby appears is not blocked' + label, async () => {
        const t0 = Date.now();
        assert.equal(await g.click('#ftf-enter'), 'ok');
        await g.page.waitForFunction(() => !!document.querySelector('.ftf-step'), null, { timeout: 5000 });
        assert.ok(Date.now() - t0 < 5000);
      });
      await g.wait(1600);
      await t.test('access card: no element stuck at opacity 0' + label, async () => { assert.deepEqual(await stuck(g, '.ftf-root'), []); });
      // Fast path through the tutorial: Play as guest → beat 1 (tap four strokes) with no waits between clicks.
      assert.equal(await g.click('.ftf-step .ftf-btn-primary'), 'ok');
      for (let i = 0; i < 4; i++) await g.page.evaluate((i) => { const b = document.querySelectorAll('.ftf-slotbtn')[i]; if (b) b.click(); }, i);
      await g.wait(1600);
      await t.test('tutorial beat 1 after rapid taps: all four strokes registered, Next enabled' + label, async () => {
        const n = await g.page.evaluate(() => document.querySelectorAll('.ftf-slotbtn[aria-pressed="true"]').length);
        assert.equal(n, 4, 'strokes lit');
        const next = await g.page.evaluate(() => { const b = [...document.querySelectorAll('.ftf-step button')].find((x) => /Next/.test(x.textContent)); return b ? !b.disabled : null; });
        assert.equal(next, true, 'Next enabled');
        assert.deepEqual(await stuck(g, '.ftf-root'), []);
      });
      if (reduced) {
        await t.test('reduced motion: the motion module reports reduced and animations are off', async () => {
          const r = await g.page.evaluate(async () => { const m = await import('/src/ui/motion/index.js'); return { reduced: m.isReduced(), animations: document.getAnimations ? document.getAnimations().filter((a) => a.playState === 'running').length : -1 }; });
          assert.equal(r.reduced, true);
          assert.equal(r.animations, 0, 'running animations under reduced motion');
        });
      }
      assert.equal(consoleProblems(g), '', 'console errors' + label);
    } finally { await g.close(); }
  }
});

test('world: HUD and map transitions leave nothing transparent; QA-008 camera distance returns after a flight', { timeout: 900000 }, async (t) => {
  const g = await openGame('?demo=judge&play=direct');
  try {
    await g.wait(2500);
    await t.test('HUD after load', async () => { assert.deepEqual(await stuck(g, '#ui'), []); });
    const distBefore = await g.page.evaluate(() => window.__ftf.rig.dist);
    await g.key('KeyN'); await g.wait(1500);
    await t.test('map open', async () => { assert.ok(await g.visible('[role=dialog]'), 'map visible'); assert.deepEqual(await stuck(g, '#ui'), []); });
    await g.key('KeyN'); await g.wait(1500);
    await t.test('map closed: the HUD is back and nothing is stuck', async () => { assert.deepEqual(await stuck(g, '#ui'), []); assert.ok(await g.visible('.hub-dock'), 'dock visible again'); });
    await g.key('KeyF');
    await g.until(() => window.__ftf.play.session.obs.you.zone === 'shell', 60000); await g.hubIdle(); await g.wait(1500);
    await t.test('inside the Shell: reading card visible, nothing stuck', async () => { assert.ok(await g.visible('.hub-read')); assert.deepEqual(await stuck(g, '#ui'), []); });
    await g.key('KeyT'); await g.hubIdle(); await g.wait(2500);
    await t.test('QA-008 after leaving the Shell the camera distance is back', async () => {
      const dist = await g.page.evaluate(() => window.__ftf.rig.dist);
      assert.ok(Math.abs(dist - distBefore) <= distBefore * 0.1, `camera distance ${dist.toFixed(1)} m after leaving vs ${distBefore.toFixed(1)} m before the flight`);
      assert.deepEqual(await stuck(g, '#ui'), []);
    });
    await t.test('a key pressed during the flight fade is not lost for good: the dock answers after the fade', async () => {
      // settle to a gold Shell
      for (let i = 0; i < 8; i++) { await g.hubIdle(); const h = await g.hub(); if (h.card) { await g.click('.hub-card .hub-primary'); await g.wait(300); continue; } if (await g.page.evaluate(() => !!document.querySelector('.hub-shells .hub-wait'))) break; await g.key('KeyT'); await g.wait(300); }
      await g.key('KeyF'); await g.wait(100); await g.key('KeyF');
      await g.until(() => window.__ftf.play.session.obs.you.zone === 'shell', 60000); await g.hubIdle(); await g.wait(1200);
      const fade = await g.page.evaluate(() => { const f = document.querySelector('.hub-fade'); return f ? getComputedStyle(f).opacity : null; });
      assert.equal(fade, '0', 'the fade is gone');
      await g.key('KeyF'); await g.hubIdle(); await g.wait(500);
      assert.ok((await g.obs()).anchors.length >= 1, 'a settled F stakes');
    });
    assert.equal(consoleProblems(g), '');
  } finally { await g.close(); }
});
