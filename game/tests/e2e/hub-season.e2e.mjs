// A whole hub season at test speed (hub.pauseMs lowered): QA-007 (gold Shell with only past signs),
// QA-003 (two Heir prompts), QA-012 (progress at the end), plus zero console errors and zero rejected commands.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame, consoleProblems, shutdown } from './lib/env.mjs';

after(shutdown);

test('Shell hub season', { timeout: 1500000 }, async (t) => {
  const g = await openGame('?demo=judge&play=direct');
  const dockProblems = [];
  try {
    await g.page.evaluate(() => { window.__ftf.play.hub.pauseMs = 60; });
    let guard = 0;
    while (guard++ < 120) {
      await g.hubIdle();
      const o = await g.obs(); const h = await g.hub();
      if (o.phase === 'end' && o.heir != null) break;
      if (h.card) {
        const choice = { vote: 'accept', heir: 'heir', fragment: 'give', offer: 'decline', speak: 'speak', key: 'later' }[h.card] || 'later';
        const r = await g.click(`.hub-card [data-choice="${choice}"]`);
        assert.equal(r, 'ok', 'card choice ' + h.card + '/' + choice);
        await g.wait(300);
        continue;
      }
      if (o.phase !== 'play') { if (o.phase === 'end') break; await g.wait(500); continue; }
      if (o.zone === 'shell') {
        const can = await g.page.evaluate(() => { const b = document.querySelector('#hub-stake'); return !!b && !b.disabled; });
        if (can) { await g.key('KeyF'); await g.wait(200); await g.hubIdle(); }
        await g.key('KeyT'); await g.wait(200);
        continue;
      }
      // QA-007: every gold Shell button must hold a sign Iris can still stake on.
      const dock = await g.page.evaluate(() => [...document.querySelectorAll('.hub-shells button')].map((b) => ({ shell: Number(b.dataset.shell), gold: b.classList.contains('hub-wait'), label: b.textContent.trim() })));
      for (const d of dock.filter((x) => x.gold)) {
        const open = o.prophecies.filter((p) => p.implied && p.implied.shell === d.shell && p.implied.tick >= o.tick);
        if (!open.length) dockProblems.push(`trial ${o.tick}: Shell ${d.shell} is gold ("${d.label}") but every sign it holds points at a past trial (${o.prophecies.filter((p) => p.implied && p.implied.shell === d.shell).map((p) => 'trial ' + p.implied.tick).join(', ')})`);
      }
      const gold = dock.find((x) => x.gold);
      if (gold) { await g.key('KeyF'); await g.until(() => window.__ftf.play.session.obs.you.zone === 'shell', 30000).catch(() => {}); await g.wait(200); }
      else { await g.key('KeyT'); await g.wait(200); }
    }
    const end = await g.obs();
    await g.shot('hub-season-end');
    await t.test('the season reaches the end phase with the Heir decided', () => {
      assert.equal(end.phase, 'end');
      assert.notEqual(end.heir, null);
    });
    await t.test('QA-007 a gold Shell always holds a stakeable sign', () => {
      assert.deepEqual(dockProblems, []);
    });
    await t.test('QA-012 progress reads complete when the season is over', async () => {
      const trial = (await g.text('.wh-trial')).join(' ');
      assert.match(trial, /17 \/ 17|100 ?%/, 'trial card at the end: ' + trial);
    });
    await t.test('no rejected commands and no console errors over the season', async () => {
      const rejected = (await g.results()).filter((r) => !r.ok);
      assert.deepEqual(rejected, []);
      assert.equal(consoleProblems(g), '');
    });
  } finally { await g.close(); }
});

test('QA-003 one Heir prompt at the season end', { timeout: 1500000 }, async () => {
  const g = await openGame('?demo=judge&play=direct');
  try {
    await g.page.evaluate(() => { window.__ftf.play.hub.pauseMs = 60; });
    // Let every trial pass; answer cards with their primary choice; stop at the Heir question.
    for (let i = 0; i < 120; i++) {
      await g.hubIdle();
      const o = await g.obs(); const h = await g.hub();
      if (h.card === 'heir' || (o.phase === 'end')) break;
      if (h.card) { await g.click('.hub-card .hub-primary'); await g.wait(300); continue; }
      if (o.zone === 'shell') { await g.key('KeyT'); await g.wait(200); continue; }
      await g.key('KeyT'); await g.wait(200);
    }
    await g.wait(800);
    const card = await g.visible('.hub-card');
    const panel = await g.visible('.pl-panel');
    const heirButtons = await g.page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /heir/i.test(b.textContent) && b.offsetWidth > 0).map((b) => b.textContent.trim()));
    await g.shot('season-end-heir');
    assert.ok(heirButtons.length <= 1, 'Heir offered by ' + heirButtons.length + ' buttons at once: ' + heirButtons.join(' | ') + ` (hub card visible: ${card}, play panel visible: ${panel})`);
    assert.ok(!(card && panel), 'the hub card and the Biography panel are open at the same time');
  } finally { await g.close(); }
});
