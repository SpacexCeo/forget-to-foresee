// Walk mode, judge season: QA-004 ("null" text), QA-005 (legacy Signs panel after a vision), QA-006 (stale hint),
// QA-010 (truncated quest text), QA-013 (quest tick vs the E default), QA-019 (mixed languages after L),
// QA-020 (in-world Settings has no language / Novice-Pro switch), QA-022 (help lacks the hub keys).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame, consoleProblems, shutdown } from './lib/env.mjs';
import { ANCHOR_ZONES } from '../../src/scenes/layout.js';

after(shutdown);

test('walk mode panels and text', { timeout: 900000 }, async (t) => {
  const g = await openGame('?demo=judge&mode=walk&play=direct');
  try {
    await t.test('QA-004 the Memories panel has no literal "null"', async () => {
      await g.key('KeyM'); await g.wait(500);
      const txt = (await g.text('.pl-panel')).join(' ');
      assert.ok(txt.length > 50, 'panel rendered');
      assert.ok(!/\bnull\b/.test(txt), 'Memories panel text: …' + txt.slice(-80));
      await g.key('Escape');
    });

    // Text overflow is collected at every stop of this walk (the first loop after Task I: stake → verified → forget).
    const overflowAt = async (label) => (await g.page.evaluate(() => [...document.querySelectorAll('.wh-quest__title, .wh-quest__line, .wh-toast__text, .wh-log__text')].filter((e) => e.offsetWidth > 0 && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2)).map((e) => e.className + ': ' + e.textContent.trim().slice(0, 60) + ` (${e.scrollWidth}x${e.scrollHeight} in ${e.clientWidth}x${e.clientHeight})`))).map((x) => label + ' · ' + x);
    const overflow = [...(await overflowAt('trial 1'))];

    // The pad of Shell I: anchor on the default option, then end trials to trial 4 (the README's steps 2–5).
    {
      const z = ANCHOR_ZONES[0].position;
      await g.teleport([z[0] * 1.21, 0, z[2] * 1.21]);
      await g.until(() => (window.__ftf.play.session.options || []).some((o) => String(o.id).startsWith('anchor:')), 30000);
    }
    await t.test('QA-013 the quest tick matches the highlighted anchor option', async () => {
      const o = await g.obs();
      const def = o.options[o.defaultIndex];
      assert.equal(o.goal, 'goal.anchor');
      assert.equal(def, 'anchor:' + o.goalArgs.tick, `quest says tick ${o.goalArgs.tick}, E anchors ${def}`);
    });
    await g.key('KeyE'); await g.busIdle(); await g.wait(500);
    overflow.push(...(await overflowAt('after the stake')));
    for (let i = 0; i < 6; i++) { if ((await g.obs()).tick >= 4) break; await g.key('KeyT'); await g.wait(250); await g.key('KeyT'); await g.busIdle(); await g.wait(1000); }
    overflow.push(...(await overflowAt('trial 4')));

    await t.test('QA-010 the quest title, quest body, hint toast and log rows are not truncated', async () => {
      const o = await g.obs();
      assert.ok(o.tick >= 4, 'reached trial 4');
      await g.shot('walk-trial4');
      assert.deepEqual(overflow, []);
    });

    await t.test('QA-006 no visible hint names a trial that already passed', async () => {
      const o = await g.obs();
      const hints = (await g.text('.wh-toast:not(.wh-toast--hidden), .wh-dialogue__text')).filter(Boolean);
      const stale = hints.filter((h) => { const m = /trial (\d+)/i.exec(h); return m && Number(m[1]) < o.tick; });
      assert.deepEqual(stale, [], 'at trial ' + o.tick);
    });

    await t.test('QA-005 forgetting for a vision opens the HUD Signs & Visions, not the legacy panel (Novice)', async () => {
      await g.key('KeyM'); await g.wait(400);
      assert.equal(await g.click('.pl-panel [data-forget]'), 'ok');
      assert.ok(await g.visible('.pl-panel [data-forget-confirm]'), 'forgetting asks first (cancel before a memory burn)');
      assert.equal(await g.click('.pl-panel [data-forget-confirm]'), 'ok');
      await g.busIdle(); await g.wait(800);
      const legacy = await g.visible('.pl-panel');
      const legacyText = (await g.text('.pl-panel')).join(' ');
      const hudSigns = await g.page.evaluate(() => { const h = window.__ftf.play.worldHud.hud; return !!(h && h.signs.isOpen()); });
      await g.shot('walk-after-vision');
      assert.ok(!(legacy && /Reading rule|confident/.test(legacyText)), 'the legacy Signs panel opened: ' + legacyText.slice(0, 120));
      assert.ok(hudSigns, 'the HUD Signs & Visions panel is open');
      await g.key('Escape'); await g.key('Escape');
    });

    await t.test('QA-004 the inspect panel has no literal "null"', async () => {
      const o = await g.obs();
      const i = o.options.indexOf('inspect');
      if (i < 0) return; // not at a spot with an inspect option after the walk above
      await g.key('Digit' + (i + 1)); await g.busIdle(); await g.wait(800);
      const txt = (await g.text('.pl-panel')).join(' ');
      assert.ok(!/\bnull\b/.test(txt), 'inspect panel text: ' + txt.slice(0, 160));
      await g.key('Escape');
    });

    await t.test('QA-019 switching the language re-renders every string in the new language', async () => {
      const cyrillic = /[Ѐ-ӿ]/, han = /[一-鿿]/;
      await g.key('KeyL'); await g.wait(600); // uk
      await g.key('KeyL'); await g.wait(600); // ru
      await g.key('KeyL'); await g.wait(600); // it
      await g.key('KeyL'); await g.wait(600); // zh
      const zh = (await g.text('.wh-root')).join(' ');
      await g.shot('walk-lang-zh');
      assert.ok(han.test(zh), 'zh rendered');
      assert.ok(!cyrillic.test(zh), 'Cyrillic left over in the zh HUD: ' + (zh.match(/[^\s]*[Ѐ-ӿ][^\s]*/g) || []).slice(0, 8).join(', '));
      await g.key('KeyL'); await g.wait(600); // en
      const en = (await g.text('.wh-root')).join(' ');
      assert.ok(!cyrillic.test(en) && !han.test(en), 'foreign script left over in the EN HUD: ' + (en.match(/[^\s]*[Ѐ-ӿ一-鿿][^\s]*/g) || []).slice(0, 8).join(', '));
    });

    await t.test('QA-020 the in-world Settings offers the language and Novice/Pro switches the README promises', async () => {
      const r = await g.page.evaluate(() => { const b = [...document.querySelectorAll('.wh-root button')].find((x) => /Settings/.test(x.textContent)); if (!b) return 'missing'; b.click(); return 'ok'; });
      assert.equal(r, 'ok');
      await g.wait(600);
      const dlg = await g.page.evaluate(() => { const d = document.querySelector('dialog[open]'); return d ? d.innerText.replace(/\s+/g, ' ') : ''; });
      await g.shot('walk-settings');
      await g.page.evaluate(() => { const d = document.querySelector('dialog[open]'); if (d) d.close(); });
      assert.ok(dlg.length > 0, 'a settings dialog opened');
      assert.match(dlg, /Novice|Pro/, 'no Novice/Pro switch in: ' + dlg.slice(0, 120));
      assert.match(dlg, /Language|English|中文/, 'no language switch in: ' + dlg.slice(0, 120));
    });

    assert.equal(consoleProblems(g), '', 'console errors');
  } finally { await g.close(); }
});

test('QA-021 the hub help lists the hub keys (F)', { timeout: 600000 }, async () => {
  const g = await openGame('?demo=judge&play=direct');
  try {
    await g.key('KeyH'); await g.wait(400);
    const help = (await g.text('.pl-help')).join(' ');
    await g.shot('hub-help');
    assert.ok(help.length > 20, 'help opened');
    assert.match(help, /\bF\b/, 'help does not mention F (fly / stake): ' + help.slice(0, 200));
  } finally { await g.close(); }
});
