// QA-001: the Guests' spoken line for a verified reveal must say the reveal matches the root.
// Part 1 renders the line the way the HUD does (fxToLine → renderLine) in every locale, no browser needed.
// Part 2 reads the live dialogue strip at trial 3 of the judge season in walk mode.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createGameI18n, fxToLine, renderLine, SUPPORTED_LOCALES } from '../../src/ui/i18n/index.js';
import { openGame, consoleProblems, shutdown } from './lib/env.mjs';

after(shutdown);

test('QA-001 line.event: verified reveal renders the "matches" branch in every locale', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const i18n = createGameI18n(locale, { onMissing: () => {} });
    const ok = renderLine(fxToLine({ type: 'event', place: 1, action: 0, power: 1, idx: 0, verified: true }), i18n).text;
    const bad = renderLine(fxToLine({ type: 'event', place: 1, action: 0, power: 1, idx: 0, verified: false }), i18n).text;
    assert.notEqual(ok, bad, `${locale}: the verified and the failed reveal render the same line: "${ok}"`);
    const negative = { en: /does not match/, ru: /не совпало/, uk: /не збіглося/, it: /non corrisponde/, zh: /不符/ }[locale];
    assert.ok(!negative.test(ok), `${locale}: a verified reveal says "${ok}"`);
  }
});

test('QA-001 live: the dialogue strip at the trial-3 reveal does not contradict the ✓ in the log', { timeout: 600000 }, async () => {
  const g = await openGame('?demo=judge&mode=walk&play=direct');
  try {
    // Every line spoken into the dialogue strip (lines replace each other within one event burst, so a DOM snapshot can miss the reveal).
    await g.page.evaluate(() => { window.__lines = []; const ws = window.__ftf.play.worldHud; const orig = ws.say.bind(ws); ws.say = (l) => { orig(l); const e = document.querySelector('.wh-dialogue__text'); window.__lines.push((l.speakerId || 'iris') + ': ' + (e ? e.textContent.trim() : '?')); }; });
    // End trials 1 and 2 (T twice each: the second press confirms while attention is left).
    for (let i = 0; i < 6; i++) {
      const o = await g.obs();
      if (o.tick >= 3 && o.chronicle >= 1) break;
      await g.key('KeyT'); await g.wait(300); await g.key('KeyT'); await g.busIdle(); await g.wait(1200);
    }
    const o = await g.obs();
    assert.ok(o.chronicle >= 1, 'a revealed event is in the chronicle by trial 3');
    const strip = (await g.page.evaluate(() => window.__lines)).join(' | ');
    const log = (await g.text('.wh-log__row')).join(' | ');
    await g.shot('proof-line-trial3');
    assert.match(log, /checked against the root ✓/, 'the log shows the proof check');
    assert.match(strip, /Shell II: Gift, power 20/, 'the Guests spoke the trial-3 reveal: ' + strip);
    assert.ok(!/does not match the root/.test(strip), `the Guests say: "${strip}"`);
    assert.equal(consoleProblems(g), '');
  } finally { await g.close(); }
});
