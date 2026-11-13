// The quest tracker, the starter guide and the journal speak the player's language (owner 13.11: a Ukrainian UI showed
// "Road home", "0 / 200 silk", "Starter guide 4/8", "Press J to open your Journal." and "Show more" in English, and
// the journal's quest copy came from journal-data.js as English literals). Every en-quests.js key (the journal's
// jq.<id>.* copy included) exists in all five locales, and the rendered tracker and journal in 'uk' and 'ru' hold none
// of the known English strings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDoc, makeWin } from './dom.mjs';
import { journalModel, questView } from '../../src/quests/journal-model.js';
import { createJournalUI } from '../../src/quests/journal-ui.js';
import { createTrackerUI } from '../../src/quests/tracker-ui.js';
import { guideView, initialGuide, GUIDE_STEPS } from '../../src/quests/guide.js';
import { questMarkers } from '../../src/quests/markers-feed.js';
import { applyQuest, initialQuests } from '../../src/game/quest-rules.js';
import { createSay, giverName } from '../../src/quests/say.js';
import { GIVER_NAMES, JOURNAL } from '../../src/game/journal-data.js';
import { createPlayI18n, PLAY_MESSAGES } from '../../src/play/i18n.js';
import EN_QUESTS from '../../src/play/locales/en-quests.js';
import RU from '../../src/play/locales/ru-quests.js';
import UK from '../../src/play/locales/uk-quests.js';
import IT from '../../src/play/locales/it-quests.js';
import ZH from '../../src/play/locales/zh-quests.js';

const T0 = 20_000 * 86_400_000 + 3600_000;
const act = (s, a) => { const r = applyQuest(s, a, { now: T0 }); return r.rejected ? s : r.state; };
const TABLES = { ru: RU, uk: UK, it: IT, zh: ZH };
const holes = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

// the English the owner saw, the tracker's and journal's chrome, and every quest's copy from journal-data.js
const KNOWN = ['Road home', ' silk', 'Starter guide', 'Press J to open your Journal.', 'Show more', 'Show less', 'Town errand', 'Ready: turn in',
  'OBJECTIVES', 'REWARDS', 'HOW TO GET IT', 'From: ', 'Walk to', 'Track on HUD', 'Stone spider field', 'Gate-Loom',
  ...JOURNAL.flatMap((j) => [j.title, j.summary, j.description, ...j.objectives.map((o) => o.text), ...j.hints.map((h) => h.text)]),
  ...GUIDE_STEPS.map((s) => s.text.replace('{fee}', '200'))];

test('i18n: every en-quests key (with the journal copy) exists in ru, uk, it and zh, non-empty, with the same placeholders', () => {
  assert.ok(Object.keys(EN_QUESTS).some((k) => k.startsWith('jq.q_spiders.')), 'the journal copy is keyed');
  for (const j of JOURNAL) assert.equal(EN_QUESTS['jq.' + j.id + '.title'], j.title, 'English stays the source: ' + j.id);
  for (const [loc, table] of Object.entries(TABLES)) {
    assert.deepEqual(Object.keys(table).sort(), Object.keys(EN_QUESTS).sort(), loc + ' mirrors en-quests.js');
    for (const [k, en] of Object.entries(EN_QUESTS)) {
      assert.ok(String(table[k]).trim(), `${loc}:${k} is empty`);
      assert.deepEqual(holes(table[k]), holes(en), `${loc}:${k} placeholders`);
      assert.equal(PLAY_MESSAGES[loc][k], table[k], `${loc}:${k} reaches the play table (spread last)`);
    }
    const i18n = createPlayI18n(loc, { onMissing: (key) => assert.fail(`${loc} missing ${key}`) });
    for (const k of Object.keys(EN_QUESTS)) { const v = i18n.t(k, { n: 1, total: 8, fee: 200, gate: 0, giver: 'X', title: 'Y', time: '01:00:00', q: 'z', level: 2, tier: 'T', area: 'A', target: 'B', m: 3 }); assert.ok(v && v !== k && !/\{\w+\}/.test(v), `${loc}:${k} renders (${v})`); }
  }
});

for (const loc of ['uk', 'ru']) {
  test(`i18n: the tracker, the guide, the journal and the map markers in '${loc}' hold no English`, () => {
    const i18n = createPlayI18n(loc), say = createSay(i18n), gname = (k) => giverName(say, k, GIVER_NAMES);
    let s = act(initialQuests(), { type: 'KILL', mob: 'veilbell', killId: 'k0' }); s = act(s, { type: 'ACCEPT', questId: 'q_spiders' });
    const guide = { ...initialGuide(), done: ['move', 'camera', 'talk'] };
    const seen = [];
    for (const w of [{ innerWidth: 1920, innerHeight: 1080 }, { innerWidth: 830, innerHeight: 630 }]) { // full and compact
      const doc = makeDoc();
      const tr = createTrackerUI({ doc, say, giverName: gname, storage: null, win: w, onOpen: () => {}, onWalk: () => {},
        data: () => ({ tracked: ['q_spiders', 's_sign'].map((id) => questView(id, { qs: s, now: T0, tracked: ['q_spiders', 's_sign'], tr: say })), road: { gateC: 0, feeC: 20_000 }, errand: null, guide: guideView(guide, 200, say) }) });
      tr.refresh(true);
      const more = doc.querySelector('.ft-showmore'); if (more && w.innerWidth > 1000) { seen.push(more.textContent); more.click(); }
      const x = doc.querySelector('.ft-expand'); if (x) x.click();
      seen.push(doc.body.textContent, ...doc.querySelectorAll('button').map((b) => b.title));
    }
    assert.match(seen.join('\n'), loc === 'uk' ? /Дорога додому/ : /Дорога домой/);
    assert.ok(seen.join('\n').includes(loc === 'uk' ? 'Натисніть J, щоб відкрити журнал.' : 'Нажмите J, чтобы открыть журнал.'), 'the guide step is translated');

    const doc = makeDoc(), win = makeWin();
    const j = createJournalUI({ doc, win, say, giverName: gname, now: () => T0, onWalk: () => {}, onTrack: () => ({ ok: true }),
      model: (q) => journalModel({ qs: s, now: T0, search: q, giverName: gname, tr: say }) });
    j.open();
    for (const tab of doc.querySelectorAll('.fj-tab').map((b) => b.dataset.tab)) {
      doc.querySelector(`[data-tab="${tab}"]`).click();
      for (const id of doc.querySelectorAll('.fj-row').map((r) => r.dataset.quest)) { doc.querySelector(`[data-quest="${id}"]`).click(); seen.push(doc.body.textContent); }
    }
    for (const id of JOURNAL.map((q) => q.id)) { j.close(); j.open(null, id); seen.push(doc.body.textContent); } // every quest's detail
    const marks = questMarkers({ qs: s, now: T0, giverAt: () => [0, 0], portal: [1, 1], giverName: gname, tr: say });
    seen.push(...marks.map((m) => m.label));
    const text = seen.join('\n');
    assert.ok(text.includes(say('jq.q_spiders.title')), 'the spider quest title is translated');
    for (const en of KNOWN) assert.ok(!text.includes(en), `'${loc}' still shows English: ${en}`);
  });
}
