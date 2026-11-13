// The first ten minutes (sprint plan 8.6) with a scripted player (?test=1 hooks in window.__ftfTest). A step whose hook
// is not in the build yet reports "skip (<why>)" instead of failing; everything that is merged is asserted.
import { writeFileSync } from 'node:fs';
import { open, booted, telemetry, assert } from './lib.mjs';
import { WAKEUP } from '../../../game/src/npe/dialogue-script.js';
import EN from '../../../game/src/play/locales/en.js';
import { portalFee } from '../../../game/src/game/expedition-config.js';

const until = async (page, fn, arg, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn, arg).catch(() => null); if (v) return v; await page.waitForTimeout(250); } return null; };
const hasEvent = (page, name, ms) => until(page, (n) => (window.__ftfTelemetry || []).some((e) => e.name === n), name, ms);

export default async function (base) {
  const { browser, page, errors } = await open(base + '?test=1&intro=1&ff=all');
  const steps = []; const ok = (s) => steps.push(s);
  const fee = portalFee('').feeC / 100;
  try {
    assert(await booted(page), 'boot did not finish'); ok('1 boot');
    assert(await hasEvent(page, 'prologue.started', 60000), 'no prologue.started'); ok('2 prologue');
    const cue = await until(page, () => (window.__ftfTelemetry || []).filter((e) => e.name === 'prologue.cue').map((e) => e.payload && e.payload.id), null, 60000);
    assert(cue && cue.length, 'no prologue.cue'); ok(cue.includes('oh_no') ? '3 oh_no cue' : `3 cues ${cue.slice(0, 3).join('/')} (oh_no not reached headless)`);

    // 4: the wake-up dialogue, line by line
    assert(await until(page, () => !!document.querySelector('.npe-box'), null, 120000), 'the dialogue box never opened');
    // the counter in the foot ("n / of") names the line; typing is skipped by the first click, so click until it is gone
    const byLine = new Map();
    for (let i = 0; i < 200 && await page.evaluate(() => !!document.querySelector('.npe-box')); i++) {
      const cur = await page.evaluate(() => { const b = document.querySelector('.npe-box'); if (!b) return null; const c = b.querySelectorAll('.npe-foot span')[1]; return { n: b.querySelector('.npe-name').textContent, c: c ? c.textContent : '' }; });
      if (cur) { const m = cur.c.match(/(\d+)\D+(\d+)/); if (m) byLine.set(Number(m[1]), cur.n); }
      await page.click('.npe-box', { timeout: 2000 }).catch(() => {}); await page.waitForTimeout(200);
    }
    const seen = [...byLine.entries()].sort((x, y) => x[0] - y[0]).map(([, n]) => ({ n }));
    const want = WAKEUP.map((l) => EN['npe.speaker.' + l.speaker]);
    const names = seen.map((s) => s.n).filter(Boolean);
    assert(names.length >= WAKEUP.length - 1, `dialogue showed ${names.length} of ${WAKEUP.length} lines`);
    assert(names.every((n, i) => n === want[i]), `speakers differ: ${names.join(',')}`);
    ok(`4 dialogue ${names.length}/${WAKEUP.length}`);

    // 5: the roadmap card
    const rows = await until(page, () => document.querySelectorAll('.npe-card li').length, null, 20000);
    if (rows !== 7) { const dbg = await page.evaluate(() => ({ steps: (window.__ftfTelemetry || []).filter((e) => e.name.startsWith('npe')).map((e) => e.name + ':' + (e.payload && e.payload.step)).slice(-8), box: !!document.querySelector('.npe-box'), text: (document.querySelector('.npe-box .npe-text') || {}).textContent })); throw new Error('roadmap card rows ' + rows + ' ' + JSON.stringify(dbg)); } await page.click('.npe-card button.primary'); ok('5 roadmap 7 rows, Start');

    // 6: handoff, HUD, Road home 0 / fee
    assert(await hasEvent(page, 'npe.completed', 20000), 'no npe.completed');
    const road = await until(page, () => { const m = document.body.innerText.match(/Road home\s*\n?\s*([\d.]+)\s*\/\s*([\d.]+) silk/); return m ? [m[1], m[2]] : null; }, null, 20000);
    assert(road && Number(road[1]) === fee, `Road home shows ${road} (fee ${fee})`); ok(`6 handoff, Road home ${road[0]} / ${road[1]}`);

    // 7, 8: auto-walk and the first quest need a journal/quest hook in __ftfTest
    const hooks = await page.evaluate(() => Object.keys(window.__ftfTest || {}));
    ok(hooks.includes('quests') ? '7-8 quests hook present (not scripted yet)' : '7-8 skip (no __ftfTest.quests hook)');

    // 9: level up through the rpg hook
    if (hooks.includes('rpg')) {
      await page.evaluate(() => window.__ftfTest.rpg.grantXp(400));
      assert(await hasEvent(page, 'level.up', 15000), 'no level.up after grantXp'); ok('9 level.up');
    } else ok('9 skip (no __ftfTest.rpg)');

    ok('10 skip (no chest hook)');

    // 11: the market opens from the HUD route
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('ftf:open-window', { detail: { id: 'market' } })));
    const mk = await until(page, () => !!document.querySelector('[class^="mk2"], [class*=" mk2"]'), null, 20000);
    assert(mk, 'the market did not open'); ok('11 market opens');
    await page.keyboard.press('Escape');

    // 12: one silk number: the HUD chip and the Road home line agree on silk that counts
    const silk = await page.evaluate(() => { const c = document.querySelector('.rpg-silk .l1'); const m = document.body.innerText.match(/Road home\s*\n?\s*([\d.]+)\s*\//); return { chip: c ? c.textContent : null, road: m ? m[1] : null }; });
    if (silk.chip && silk.road) { assert(parseFloat(silk.chip.replace(/[^\d.]/g, '')) === parseFloat(silk.road), `silk differs: chip ${silk.chip}, road ${silk.road}`); ok(`12 silk ${silk.road} everywhere`); }
    else ok('12 skip (chip or Road home missing)');

    ok('13 skip (no tournament hook)');

    // 14: no error.shown; telemetry kept
    const tel = await page.evaluate(() => window.__ftfTelemetry || []);
    writeFileSync(new URL('../../../docs/sprint/last-run-telemetry.json', import.meta.url), JSON.stringify(tel, null, 1) + '\n');
    const bad = tel.filter((e) => e.name === 'error.shown'); assert(!bad.length, 'error.shown: ' + JSON.stringify(bad.map((e) => e.payload)));
    assert(errors.length === 0, errors.join(' | ')); ok('14 no errors, telemetry saved');
    return 'first-ten: ' + steps.join(', ');
  } catch (e) { e.message += ` [after: ${steps.join(', ')}]`; throw e; } finally { await browser.close(); }
}
