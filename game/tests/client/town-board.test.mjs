// The Shell board (story K2): tabs, no scripted row in the human tab, the empty state, the root, the player's own
// row from the local log, the snapshot sources, phone layout, and the flag (boot-world loads it lazily, ?story=1 only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { tabRows, youLine, shortRoot, renderBoardPanel, VERIFY_URL } from '../../src/ui/board-panel.js';
import { createTownBoard, loadSnapshot, validSnapshot, BOARD_TOWN } from '../../src/scenes/town-board.js';
import { makeEntry } from '../../src/game/expedition-log.js';
import { fakeDoc, fakeI18n } from './story-fakes.mjs';
import en from '../../src/play/locales/en.js';

const ROOT = 'ab'.repeat(32);
const row = (rank, account, score, actor = 'human') => ({ rank, account, score, actor, parts: {}, flags: [] });
const SNAP = { v: 1, boardSeason: 1, epoch: 3, createdAt: Date.UTC(2026, 10, 12, 18, 0), rules: 'r', root: ROOT,
  rows: [row(1, 'ann.testnet', 900), row(2, 'bo.testnet', 300), row(3, 'cy.testnet', 40), row(1, 'salt.arena.testnet', 1200, 'scripted'), row(2, 'amber.arena.testnet', 50, 'scripted')] };
const LOCAL = { score: 120, parts: { Q: 140, Sk: 10, Wl: 0, V: 0, P: 0, M: 0.8 } };
const text = (n) => [n.textContent, ...n.children.map(text)].join(' ');

test('tabs: the human tab never lists a scripted row and the scripted tab never a human; top ten in rank order', () => {
  assert.deepEqual(tabRows(SNAP, 'human').map((r) => r.account), ['ann.testnet', 'bo.testnet', 'cy.testnet']);
  assert.deepEqual(tabRows(SNAP, 'scripted').map((r) => r.account), ['salt.arena.testnet', 'amber.arena.testnet']);
  const many = { ...SNAP, rows: Array.from({ length: 15 }, (_, i) => row(15 - i, 'p' + i, i)) };
  assert.deepEqual(tabRows(many, 'human').map((r) => r.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(tabRows(null, 'human'), []);
});

test('your row: ranked among the humans by the local score; a known account shows both scores when they differ; no snapshot = local preview', () => {
  assert.deepEqual(youLine(SNAP, LOCAL), { key: 'lb.you', args: { rank: 3, n: 4, score: 120 }, differs: null });
  assert.deepEqual(youLine(SNAP, LOCAL, 'bo.testnet'), { key: 'lb.you', args: { rank: 2, n: 3, score: 120 }, differs: { snap: 300, local: 120 } });
  assert.deepEqual(youLine(null, LOCAL), { key: 'lb.youLocal', args: { score: 120 }, preview: true });
  assert.equal(shortRoot(ROOT), 'abababab');
});

test('panel: two tabs, the exact scripted label, the root (8 chars), the verify link and the footer; a phone-safe width', () => {
  const doc = fakeDoc(); let closed = 0;
  const v = renderBoardPanel({ doc, i18n: fakeI18n(), snapshot: SNAP, local: LOCAL, onClose: () => closed++ });
  const tabs = v.panel.querySelectorAll('button').filter((b) => b.dataset.tab);
  assert.deepEqual(tabs.map((b) => b.dataset.tab), ['human', 'scripted']);
  const rows = () => v.panel.querySelectorAll('li');
  assert.deepEqual(rows().map((l) => l.dataset.actor), ['human', 'human', 'human']);
  assert.match(text(v.panel), /lb\.you/); assert.match(text(v.panel), /lb\.footer/);
  assert.match(text(v.panel), /"root":"abababab"/);
  assert.equal(v.panel.querySelectorAll('a')[0].href, VERIFY_URL);
  tabs[1].click(); assert.equal(v.tab, 'scripted');
  assert.deepEqual(rows().map((l) => l.dataset.actor), ['scripted', 'scripted']);
  assert.match(text(v.panel), /lb\.scriptedNote/); assert.doesNotMatch(text(v.panel), /lb\.you/);
  assert.equal(en['lb.scriptedNote'], 'scripted NPC activity, owner-run, testnet, public seeds');
  assert.equal(en['lb.footer'], 'Rules and snapshot are committed on NEAR testnet. The score comes from the play log. No prizes.');
  assert.match(v.panel.style.cssText, /width:min\(460px,calc\(100vw - 32px\)\)/); assert.match(v.panel.style.cssText, /overflow:auto/);
  for (const b of v.panel.querySelectorAll('button').filter((b) => b.dataset.tab || b.className === 'ftf-board-close')) assert.match(b.style.cssText, /min-height:44px/);
  v.panel.querySelectorAll('button').find((b) => b.className === 'ftf-board-close').click(); assert.equal(closed, 1);
});

test('panel: no snapshot shows the local preview label and only the local numbers', () => {
  const doc = fakeDoc();
  const v = renderBoardPanel({ doc, i18n: fakeI18n(), snapshot: null, local: LOCAL, onClose: () => {} });
  assert.equal(v.panel.querySelectorAll('li').length, 0);
  assert.match(text(v.panel), /lb\.preview/); assert.match(text(v.panel), /lb\.youLocal \{"score":120\}/);
  assert.doesNotMatch(text(v.panel), /lb\.root|lb\.snapshot/);
});

test('snapshot: only a well-formed one is shown; the published file first, then the relayer, else null', async () => {
  assert.equal(validSnapshot(SNAP), true);
  assert.equal(validSnapshot({ ...SNAP, root: 'nope' }), false);
  assert.equal(validSnapshot({ ...SNAP, rows: [{ ...SNAP.rows[0], actor: 'bot' }] }), false);
  const calls = [];
  const fetch = async (url) => { calls.push(url); return url.includes('relayer') ? { ok: true, json: async () => SNAP } : { ok: false }; };
  assert.equal(await loadSnapshot({ base: '/forget-to-foresee/', relayer: 'https://relayer.example/', fetch }), SNAP);
  assert.deepEqual(calls, ['/forget-to-foresee/board/latest.json', 'https://relayer.example/api/board/latest']);
  assert.equal(await loadSnapshot({ base: '/', relayer: null, fetch: async () => { throw new Error('offline'); } }), null);
});

test('monument: E opens the panel with her local score, loads the snapshot once, Esc and walking off close it, it hides away', async () => {
  const scene = new THREE.Scene(), doc = fakeDoc(), win = new EventTarget();
  const log = []; log.push(makeEntry(log, { t: 1000, kind: 'quest_turned_in', data: { questId: 'q_welcome' }, silkC: 100_000, trust: 'T2' }));
  let loads = 0;
  const b = createTownBoard({ scene, position: [-4, 0, 22.5], i18n: fakeI18n(), log: () => log, load: async () => { loads++; return SNAP; }, doc, win });
  assert.deepEqual(BOARD_TOWN, [-4, 0, 22.5]);
  assert.equal(b.spot.near([-4, 0, 21]), true); assert.equal(b.spot.near([4, 0, 22.5]), false);
  assert.equal(b.spot.prompt(), 'lb.prompt');
  b.spot.onInteract(); await new Promise((r) => setTimeout(r, 0));
  assert.equal(b.open, true); assert.equal(loads, 1); assert.equal(b.spot.busy(), true);
  assert.match(text(doc.find('ftf-board-panel')[0]), /lb\.you \{"rank":4,"n":4,"score":28\}/); // welcome 40 × M 0.7
  win.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' })); assert.equal(b.open, false);
  b.spot.onInteract(); await new Promise((r) => setTimeout(r, 0)); assert.equal(loads, 1, 'loaded once');
  b.update([-4, 0, 30], 1); assert.equal(b.open, false, 'walked off');
  b.setActive(false); assert.equal(b.root.visible, false);
  b.dispose(); assert.equal(scene.children.includes(b.root), false);
});

test('the flag: the default page never loads the board (lazy import behind ?story=1)', () => {
  const src = readFileSync(new URL('../../src/boot-world.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^import .*town-board/m);
  assert.match(src, /params\.get\('story'\) === '1'[^\n]*\n[^\n]*import\('\.\/scenes\/town-board\.js'\)/);
});
