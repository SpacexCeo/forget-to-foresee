// Pacing of the Gate-Loom fee (TZ §3.6): an idealised focused player (about 4 kills a minute, mostly spiders, the
// quests turned in as they become possible, the bounty when its cooldown allows) under the real rules. Targets:
// 10,000 silk in 90-150 minutes, no single source above 60 % of it. If this fails, change EXPEDITION, not the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyQuest, initialQuests, questStatus } from '../../src/game/quest-rules.js';
import { EXPEDITION } from '../../src/game/expedition-config.js';

export function simulate({ killsPerMin = 4, mix = { skitter: 0.85, veilbell: 0.1, hulker: 0.05 }, minutes = 300 } = {}) {
  let s = initialQuests(); let silkC = 0; const bySource = { quests: 0, bounty: 0, kills: 0 }; const marks = {};
  const t0 = 3 * 24 * 3600e3; let t = t0, k = 0;
  const act = (a) => { const r = applyQuest(s, a, { now: t }); if (r.rejected) return r; s = r.state;
    for (const e of r.events) if (e.silkC > 0) { silkC += e.silkC; bySource[e.kind === 'kill_ticketed' ? 'kills' : e.kind === 'bounty_resolved' ? 'bounty' : 'quests'] += e.silkC; }
    return r; };
  // the guide (two minutes), then the quests as they open
  t += 60e3; act({ type: 'ACCEPT', questId: 'q_welcome' }); act({ type: 'GUIDE', step: 'talked' }); t += 60e3; act({ type: 'GUIDE', step: 'moved' }); act({ type: 'TURN_IN', questId: 'q_welcome' });
  act({ type: 'ACCEPT', questId: 'q_spiders' }); act({ type: 'ACCEPT', questId: 'q_part' });
  const order = Object.entries(mix); let acc = 0; const cum = order.map(([m, p]) => [m, (acc += p)]);
  for (let min = 2; min < minutes && silkC < EXPEDITION.PORTAL_FEE_C; min++) {
    t = t0 + min * 60e3;
    for (let i = 0; i < killsPerMin; i++) { const u = ((k * 0.618034) % 1); const mob = cum.find(([, c]) => u < c)[0]; act({ type: 'KILL', mob, killId: 'k' + (k++) }); }
    if (min === 8) act({ type: 'TURN_IN', questId: 'q_part', partId: 'part_gear', partSource: 'salvage' }); // a part drops within 7 spider kills (Q2 pity)
    if (questStatus(s, 'q_spiders', t) === 'ready') { act({ type: 'TURN_IN', questId: 'q_spiders' }); act({ type: 'ACCEPT', questId: 'q_boss' }); }
    if (min === 25 && questStatus(s, 'q_boss', t) === 'active') act({ type: 'KILL', mob: 'crownrift', killId: 'boss' }); // the lookout, a long fight
    if (questStatus(s, 'q_boss', t) === 'ready') act({ type: 'TURN_IN', questId: 'q_boss' });
    if (questStatus(s, 'b_spiders', t) === 'available') act({ type: 'ACCEPT', questId: 'b_spiders' });
    if (questStatus(s, 'b_spiders', t) === 'ready') act({ type: 'TURN_IN', questId: 'b_spiders' });
    if (!marks.half && silkC >= 500_000) marks.half = min;
    if (!marks.full && silkC >= EXPEDITION.PORTAL_FEE_C) marks.full = min;
  }
  return { marks, silkC, share: Object.fromEntries(Object.entries(bySource).map(([k2, v]) => [k2, +(v / silkC).toFixed(3)])) };
}

test('10,000 town silk takes 90-150 minutes of focused play; no source above 60 %', () => {
  const r = simulate();
  console.log(`pacing: 5,000 silk at ${r.marks.half} min, 10,000 at ${r.marks.full} min; shares ${JSON.stringify(r.share)}`);
  assert.ok(r.marks.full >= 90 && r.marks.full <= 150, 'minutes to 10,000: ' + r.marks.full);
  for (const [k, v] of Object.entries(r.share)) assert.ok(v <= 0.6, `${k} ${v}`);
});
