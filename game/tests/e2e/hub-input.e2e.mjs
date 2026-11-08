// Shell hub input: QA-008 (camera after leaving a Shell), QA-002 (keys accepted during the flight fade).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame, consoleProblems, shutdown } from './lib/env.mjs';

after(shutdown);

test('Shell hub input', { timeout: 900000 }, async (t) => {
  const g = await openGame('?demo=judge&play=direct');
  try {
    const distBefore = await g.page.evaluate(() => window.__ftf.rig.dist);

    await t.test('QA-008 leaving a Shell restores the island framing', async () => {
      await g.key('KeyF');
      await g.until(() => window.__ftf.play.session.obs.you.zone === 'shell', 60000);
      await g.hubIdle(); await g.wait(1200);
      await g.key('KeyT'); // leave: ends the trial
      await g.hubIdle(); await g.wait(1500);
      const o = await g.obs();
      assert.equal(o.zone, 'island');
      const dist = await g.page.evaluate(() => window.__ftf.rig.dist);
      await g.shot('hub-after-leave');
      assert.ok(Math.abs(dist - distBefore) <= distBefore * 0.1, `camera distance ${dist.toFixed(1)} m after leaving vs ${distBefore.toFixed(1)} m before the flight`);
    });

    // A card may be waiting after the first trials; answer it with its primary choice so the dock is back.
    const settle = async () => { for (let i = 0; i < 4; i++) { await g.hubIdle(); const h = await g.hub(); if (!h.card) break; await g.click('.hub-card .hub-primary'); await g.wait(400); } await g.hubIdle(); };

    await t.test('QA-002b F then F (fly, then stake as the README says) stakes once the flight lands', async () => {
      await settle();
      const gold = await g.page.evaluate(() => { const b = document.querySelector('.hub-shells .hub-wait'); return b ? Number(b.dataset.shell) : 0; });
      assert.ok(gold, 'a Shell is waiting');
      const anchorsBefore = (await g.obs()).anchors.length;
      await g.key('KeyF'); await g.wait(250); await g.key('KeyF');
      await g.hubIdle(); await g.wait(1500); await g.hubIdle();
      const o = await g.obs();
      assert.equal(o.zone, 'shell', 'Iris is inside the Shell');
      assert.equal(o.anchors.length, anchorsBefore + 1, 'the second F staked 10 silk (anchors ' + anchorsBefore + ' → ' + o.anchors.length + ')');
      await g.key('KeyT'); await g.hubIdle(); await g.wait(800);
    });

    await t.test('QA-002a F then T during the fade never leaves Iris inside a Shell at a later trial', async () => {
      await settle();
      const gold = await g.page.evaluate(() => { const b = document.querySelector('.hub-shells .hub-wait'); return b ? Number(b.dataset.shell) : 0; });
      assert.ok(gold, 'a Shell is waiting');
      const tick = (await g.obs()).tick;
      await g.page.evaluate(() => { window.__qa.cmds = []; });
      await g.key('KeyF'); await g.wait(120); await g.key('KeyT');
      await g.hubIdle(); await g.wait(2000); await g.hubIdle();
      const o = await g.obs();
      const cmds = await g.page.evaluate(() => window.__qa.cmds.map((c) => c.type + '@' + c.tick));
      await g.shot('hub-f-then-t');
      const enteredLater = o.zone === 'shell' && o.tick > tick;
      assert.ok(!enteredLater, `after F+T Iris is inside Shell ${o.shell} at trial ${o.tick} (was trial ${tick}); commands: ${cmds.join(', ')}`);
      const iEnd = cmds.findIndex((c) => c.startsWith('end_tick')), iEnter = cmds.findIndex((c) => c.startsWith('enter_shell'));
      assert.ok(!(iEnd >= 0 && iEnter > iEnd), 'a flight must not run after the trial ended: ' + cmds.join(', '));
    });

    assert.equal(consoleProblems(g), '', 'console errors');
  } finally { await g.close(); }
});
