// QA-009 overlaps on desktop (1280×800 and 1920×1080) and QA-011 the phone layout (iPhone 13).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openGame, intersects, consoleProblems, shutdown } from './lib/env.mjs';

after(shutdown);

const UI = ['#prompt', '.pl-badge', '.pl-context', '.pl-info', '.pl-panel', '.pl-help', '.hub-dock', '.hub-read', '.hub-card', '.hub-status', '.wh-dialogue', '.wh-quest', '.wh-trial', '.wh-log-root', '.wh-hotbar', '.wh-toast:not(.wh-toast--hidden)', '.wh-quest-m', '.wh-tiles'];

async function overlaps(g) {
  const boxes = (await Promise.all(UI.map((s) => g.boxes(s)))).flat();
  const bad = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    if (boxes[i].sel === boxes[j].sel) continue;
    if (intersects(boxes[i].rect, boxes[j].rect, 3)) bad.push(`${boxes[i].sel} "${boxes[i].text.slice(0, 30)}" × ${boxes[j].sel} "${boxes[j].text.slice(0, 30)}"`);
  }
  return bad;
}

for (const [name, viewport] of [['1280x800', { width: 1280, height: 800 }], ['1920x1080', { width: 1920, height: 1080 }]]) {
  test(`QA-009 no overlapping UI on the hub island at ${name}`, { timeout: 600000 }, async () => {
    const g = await openGame('?demo=judge&play=direct', { viewport });
    try {
      await g.wait(2500);
      const bad = await overlaps(g);
      await g.shot('layout-hub-' + name);
      assert.deepEqual(bad, []);
      // the greybox labels belong to dev only (Task H): none may be visible in play
      const labels = await g.page.evaluate(() => { let n = 0; window.__ftf.scene.traverse((o) => { if (o.visible && o.userData && o.userData.greyboxLabel) n++; }); return n; });
      assert.equal(labels, 0, 'greybox labels visible in the world');
      assert.equal(consoleProblems(g), '');
    } finally { await g.close(); }
  });
}

test('QA-009 no overlapping UI with the context menu open (walk, anchor zone)', { timeout: 600000 }, async () => {
  const g = await openGame('?demo=judge&mode=walk&play=direct');
  try {
    const { ANCHOR_ZONES } = await import('../../src/scenes/layout.js');
    const z = ANCHOR_ZONES[0].position;
    await g.teleport([z[0], 0, z[2]]);
    await g.until(() => (window.__ftf.play.session.options || []).length >= 2, 30000);
    await g.wait(1500);
    const bad = await overlaps(g);
    await g.shot('layout-walk-context');
    assert.deepEqual(bad, []);
  } finally { await g.close(); }
});

test('QA-011 phone: the Shell dock and the quest card do not overlap; the quest copy fits a touch device', { timeout: 600000 }, async () => {
  const g = await openGame('?demo=judge', { device: 'iPhone 13' });
  try {
    await g.wait(2500);
    const dock = await g.boxes('.hub-dock');
    const quest = await g.boxes('.wh-quest-m, .wh-quest--mobile, .wh-quest');
    await g.shot('layout-phone-hub');
    assert.ok(dock.length && quest.length, 'dock and quest card rendered');
    assert.ok(!intersects(dock[0].rect, quest[0].rect, 3), `dock ${JSON.stringify(dock[0].rect)} overlaps quest ${JSON.stringify(quest[0].rect)}`);
    const copy = quest.map((q) => q.text).join(' ');
    assert.ok(!/Press F|on the right/.test(copy), 'quest copy on a phone: ' + copy);
    assert.equal(consoleProblems(g), '');
  } finally { await g.close(); }
});
