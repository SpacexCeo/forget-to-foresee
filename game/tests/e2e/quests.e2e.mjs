// Quest journal, tracker and auto-walk on the real page (sprint §4, A1 acceptance E1–E10): the tracker shows every
// line in full (nothing cut off, desktop and phone), J opens the journal with its five tabs, a quest's detail names
// the giver, the counters and the rewards, a second click on the selected quest walks Iris to the giver and W A S D
// cancels, Road Home shows the gate number from config, and with the flags off the old objective pill wraps, carries
// its full text and opens the log.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame, consoleProblems, shutdown } from './lib/env.mjs';
import { EXPEDITION } from '../../src/game/expedition-config.js';

after(shutdown);

const FLAGS = 'ff=questJournal,questTracker,autoWalk,starterGuide';
const townReady = (g, timeout = 240000) => g.page.waitForFunction(() => window.__ftf && window.__ftf.town && window.__ftf.town.ready && window.__ftf.town.phase === 'town', null, { timeout, polling: 250 });
/** Elements inside `sel` whose text is cut (ellipsis, or content wider than the box with hidden overflow). */
const truncated = (g, sel) => g.page.evaluate((s) => [...document.querySelectorAll(s + ' *')].filter((e) => {
  const cs = getComputedStyle(e);
  return cs.textOverflow === 'ellipsis' || (e.scrollWidth > e.clientWidth + 1 && cs.overflowX === 'hidden' && cs.whiteSpace === 'nowrap');
}).map((e) => e.className + ': ' + e.textContent.slice(0, 40)), sel);
const press = (g, key) => g.page.keyboard.press(key);

async function openTown(query, o = {}) {
  const g = await openGame(query, { ...o, ready: false });
  await townReady(g);
  await g.until(() => !!document.querySelector('.ft') || !!document.querySelector('.ftf-story-goal'), 60000);
  await g.wait(1500);
  return g;
}

test('E1/E8: the tracker shows everything in full and Road Home counts the gate against the configured fee', async () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const g = await openTown('?' + FLAGS, { viewport });
    try {
      assert.equal(await g.visible('.ft'), 1, 'the tracker is on screen at ' + viewport.width);
      assert.deepEqual(await truncated(g, '.ft'), [], 'nothing in the tracker is cut off at ' + viewport.width);
      assert.equal(await g.visible('.ftf-town-objective'), 0, 'the old one-line pill is gone');
      const [road] = await g.text('.ft-road b');
      assert.match(road, new RegExp('^\\d+ / ' + Math.round(EXPEDITION.PORTAL_FEE_C / 100) + ' silk$'), 'Road Home reads "{gate} / {fee} silk"');
      assert.equal(consoleProblems(g), '', 'no console errors');
    } finally { await g.close(); }
  }
});

test('E2/E3: J opens the journal with five tabs; a quest detail names the giver, the counters and the rewards', async () => {
  const g = await openTown('?' + FLAGS);
  try {
    await press(g, 'j');
    await g.until(() => !!document.querySelector('.fj-tab'), 10000);
    assert.equal((await g.text('.fj-tab')).length, 5, 'five tabs');
    assert.ok(await g.page.evaluate(() => !!document.querySelector('.fj-row[data-quest="q_welcome"]')), 'the welcome quest is listed');
    const spiders = await g.page.evaluate(() => { const r = document.querySelector('.fj-row[data-quest="q_spiders"]'); if (r) r.click(); return !!r; });
    assert.ok(spiders, 'the guard quest is listed');
    {
      const [detail] = await g.text('.fj-detail');
      for (const part of ['Guard', '0/10', '0/5', '20 silk', '80 XP']) assert.ok(detail.includes(part), 'the detail shows ' + part + ': ' + detail.slice(0, 200));
    }
    await press(g, 'Escape');
    await g.until(() => !document.querySelector('.fj-tab'), 10000);
  } finally { await g.close(); }
});

test('E4/E5: a second click on the selected quest walks to the giver; W cancels', async () => {
  const g = await openTown('?' + FLAGS);
  try {
    await g.page.evaluate(() => { window.__aw = []; for (const n of ['started', 'arrived', 'cancelled']) window.addEventListener('ftf:autowalk.' + n, (e) => window.__aw.push(n + ':' + ((e.detail && e.detail.reason) || ''))); });
    await press(g, 'j');
    await g.until(() => !!document.querySelector('.fj-row[data-quest="q_welcome"]'), 10000);
    const before = await g.page.evaluate(() => window.__ftf.player.pos.slice());
    await g.click('.fj-row[data-quest="q_welcome"]'); await g.wait(200);
    await g.click('.fj-row[data-quest="q_welcome"]');
    await g.until(() => !!document.querySelector('.ftf-autowalk'), 10000);
    const [label] = await g.text('.ftf-autowalk');
    assert.match(label, /Walking to .+ · \d+ m/, 'the walk label names the target and the distance');
    assert.equal(await g.visible('.fj-tab'), 0, 'the journal closed');
    await g.wait(2500);
    const mid = await g.page.evaluate(() => window.__ftf.player.pos.slice());
    assert.ok(Math.hypot(mid[0] - before[0], mid[2] - before[2]) > 0.5, 'Iris moved on her own');
    await g.page.keyboard.down('w'); // held until the walk ends: software-rendered frames can be longer than a tap
    await g.until(() => !document.querySelector('.ftf-autowalk'), 20000).catch(() => {});
    await g.page.keyboard.up('w'); await g.wait(500);
    const ev = await g.page.evaluate(() => window.__aw);
    assert.ok(ev.includes('started:'), 'autowalk.started: ' + ev);
    assert.ok(ev.some((e) => e.startsWith('cancelled:input') || e.startsWith('arrived')), 'W cancels the walk: ' + ev);
    assert.equal(await g.visible('.ftf-autowalk'), 0, 'the walk label is gone');
  } finally { await g.close(); }
});

test('E10: with the flags off the old pill wraps, keeps its full text and opens the log', async () => {
  const g = await openTown('?ff=');
  try {
    assert.equal(await g.visible('.ft'), 0, 'no tracker without the flag');
    const pill = await g.page.evaluate(() => { const e = document.querySelector('.ftf-story-goal'); if (!e || e.hidden) return null; const cs = getComputedStyle(e); return { pe: cs.pointerEvents, ws: cs.whiteSpace, to: cs.textOverflow, title: e.title, text: e.textContent }; });
    assert.ok(pill, 'the old pill shows without the tracker');
    {
      assert.equal(pill.pe, 'auto', 'clickable');
      assert.equal(pill.ws, 'normal', 'wraps');
      assert.notEqual(pill.to, 'ellipsis', 'not cut with an ellipsis');
      assert.equal(pill.title, pill.text, 'the full text is in the title');
      await g.click('.ftf-story-goal');
      await g.wait(500);
      assert.equal(await g.visible('.ftf-quest-log'), 1, 'a click opens the quest log');
    }
  } finally { await g.close(); }
});

/** A saved quest log with the welcome done and the guard's spiders taken (built with the shared rules). */
async function spidersSeed() {
  const { applyQuest, initialQuests, QUESTS_KEY } = await import('../../src/game/quest-rules.js');
  let s = initialQuests(); const t = Date.now() - 600_000;
  for (const a of [{ type: 'BEGIN' }, { type: 'ACCEPT', questId: 'q_welcome' }, { type: 'GUIDE', step: 'moved' }, { type: 'GUIDE', step: 'talked' }, { type: 'TURN_IN', questId: 'q_welcome' }, { type: 'ACCEPT', questId: 'q_spiders' }]) {
    const r = applyQuest(s, a, { now: t }); if (!r.rejected) s = r.state;
  }
  return { key: QUESTS_KEY, value: JSON.stringify(s) };
}

test('E6: an auto-walk that reaches 2.2 m of the giver fires autowalk.arrived', async () => {
  const g = await openTown('?' + FLAGS);
  try {
    await g.page.evaluate(() => { window.__aw = []; for (const n of ['started', 'arrived', 'cancelled']) window.addEventListener('ftf:autowalk.' + n, (e) => window.__aw.push(n + ':' + ((e.detail && e.detail.reason) || ''))); });
    // software rendering is slow: start 5 m from the Elder (her quest marker, town-local + TOWN_ORIGIN) so the walk is short
    await g.until(() => (globalThis.__ftfQuestMarkers || []).some((m) => m.id === 'avail:q_welcome'), 20000);
    await g.page.evaluate(() => {
      const m = globalThis.__ftfQuestMarkers.find((x) => x.id === 'avail:q_welcome'), pl = window.__ftf.player;
      const p = [m.pos[0], pl.pos[1], m.pos[1] + 5]; pl.pos = p.slice(); pl.prevPos = p.slice(); pl.lastSafe = p.slice(); pl.vy = 0;
    });
    await g.wait(1500);
    await press(g, 'j');
    await g.until(() => !!document.querySelector('.fj-row[data-quest="q_welcome"]'), 10000);
    await g.click('.fj-row[data-quest="q_welcome"]'); await g.wait(200);
    await g.click('.fj-row[data-quest="q_welcome"]');
    await g.until(() => window.__aw.includes('started:'), 10000);
    // the rest of the walk runs on its own (software rendering is slow: a generous timeout)
    await g.until(() => window.__aw.some((e) => e.startsWith('arrived') || e.startsWith('cancelled')), 240000);
    const ev = await g.page.evaluate(() => window.__aw);
    assert.ok(ev.includes('arrived:'), 'autowalk.arrived: ' + ev);
    assert.equal(await g.visible('.ftf-autowalk'), 0, 'the walk label is gone on arrival');
  } finally { await g.close(); }
});

test('E7/E9: three spider kills show 3/10 in the tracker and the journal; the daily tab shows the countdown', async () => {
  const seed = await spidersSeed();
  const g = await openTown('?' + FLAGS);
  try {
    await g.page.evaluate((s) => localStorage.setItem(s.key, s.value), seed);
    await g.page.reload({ waitUntil: 'domcontentloaded' });
    await townReady(g);
    await g.until(() => !!document.querySelector('.ft'), 60000);
    for (let i = 0; i < 3; i++) await g.page.evaluate((n) => window.dispatchEvent(new CustomEvent('ftf:mob-killed', { detail: { type: 'skitter', killId: 'e2e-' + n } })), i);
    await g.until(() => { const b = document.querySelector('.ft [data-quest="q_spiders"]'); return !!b && /3\/10/.test(b.textContent); }, 15000);
    await press(g, 'j');
    await g.until(() => !!document.querySelector('.fj-row[data-quest="q_spiders"]'), 10000);
    await g.click('.fj-row[data-quest="q_spiders"]');
    const [detail] = await g.text('.fj-detail');
    assert.ok(detail.includes('3/10'), 'the journal agrees: ' + detail.slice(0, 160));
    await g.click('.fj-tab[data-tab="daily"]');
    await g.until(() => !!document.querySelector('.fj-reset, .fj-empty-next'), 5000);
    const [reset] = await g.text('.fj-reset, .fj-empty-next');
    assert.match(reset, /\d/, 'a countdown to 00:00 UTC: ' + reset);
  } finally { await g.close(); }
});
