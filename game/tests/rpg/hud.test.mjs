// HUD pieces (sprint plan 5.5 / 5.9 / 5.10 / 5.12): the silk chip text for every silkView() case, the hotbar slot
// states, the tree node states and tooltips, the character panel's main branch, the minimap projection, the strings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { silkChipText, fmtSilk, ledgerSilkView } from '../../src/rpg/silk-chip.js';
import { hudT, EN_HUD } from '../../src/rpg/hud-text.js';
import { initialProgress } from '../../src/rpg/progression.js';
import * as S from '../../src/rpg/skills.js';

const t = hudT(null);
const view = (o) => ({ totalC: 0, gateC: 0, onChainC: 0, pendingC: 0, playC: 0, feeC: 20000, enoughForGate: false, syncing: false, lastSyncAt: 0, chainOk: true, ...o });

test('silk numbers: whole when whole, at most 2 decimals', () => {
  assert.equal(fmtSilk(12864), '128.64'); assert.equal(fmtSilk(3800), '38'); assert.equal(fmtSilk(1234500), '12,345'); assert.equal(fmtSilk(150), '1.5'); assert.equal(fmtSilk(0), '0');
});

test('silk chip: line 1 is the Gate number; pending, syncing and offline lines; the exact tooltip lines', () => {
  const a = silkChipText(view({ totalC: 12864, gateC: 3800, onChainC: 3800, pendingC: 300, playC: 8764 }), t);
  assert.equal(a.line1, '38'); assert.equal(a.line2, '+3 waiting'); assert.equal(a.line2Kind, 'pending'); assert.ok(a.showSync);
  assert.deepEqual(a.tooltip.map((x) => x.text), ['Silk that counts for the Gate-Loom: 38', 'Recorded on NEAR: 38', 'Waiting to be recorded: 3', 'Play silk (saved on this device only): 87.64',
    'All silk you hold: 128.64', 'Gate price: 200', 'Press Sync to record the waiting silk now. It also syncs by itself every minute.']);
  assert.ok(a.tooltip[0].bold); assert.equal(a.link, 'What is silk?');
  const b = silkChipText(view({ gateC: 5000, onChainC: 5000, totalC: 5000 }), t);
  assert.equal(b.line2, null); assert.equal(b.showSync, false); assert.equal(b.tooltip.length, 5, 'pending and play lines hidden at 0');
  const c = silkChipText(view({ pendingC: 100, syncing: true, chainOk: true }), t); assert.equal(c.line2, 'Syncing…'); assert.equal(c.showSync, false);
  const d = silkChipText(view({ pendingC: 100, chainOk: false, localTotalC: 10000, totalC: 10100 }), t); assert.equal(d.line2, 'Playing locally'); assert.equal(d.line2Kind, 'local'); assert.equal(d.line1, '100', 'local: this device\'s silk');
  assert.equal(silkChipText(view({ noAccount: true, localTotalC: 12345 }), t).line1, '123.45');
  const l = ledgerSilkView({ silk: 4200 }, 20000); assert.equal(l.gateC, 4200); assert.equal(l.playC, 4200); assert.equal(l.feeC, 20000);
});

test('hotbar slot states: empty, ready, cooldown with seconds and sweep, global sweep only, no mana', async () => {
  const { slotView } = await import('../../src/rpg/hud.js');
  assert.equal(slotView({ id: null }).state, 'empty');
  assert.equal(slotView({ id: 'lance', cd: null, mana: 60, manaCost: 8 }).state, 'ready');
  const c = slotView({ id: 'lance', cd: { ms: 550, total: 1100, global: false }, mana: 60, manaCost: 8 });
  assert.equal(c.state, 'cooldown'); assert.equal(c.seconds, '0.6'); assert.equal(c.sweep, 0.5);
  assert.equal(slotView({ id: 'x', cd: { ms: 7200, total: 12000 }, mana: 0, manaCost: 0 }).seconds, '8');
  const g = slotView({ id: 'strike', cd: { ms: 300, total: 500, global: true }, mana: 0, manaCost: 0 }); assert.equal(g.seconds, null); assert.ok(g.sweep > 0);
  assert.equal(slotView({ id: 'snare', cd: null, mana: 5, manaCost: 12 }).state, 'nomana');
});

test('tree node states and tooltips; the main branch of the sheet', async () => {
  const { nodeState, nodeTip } = await import('../../src/rpg/skill-tree-ui.js');
  const { mainBranch } = await import('../../src/rpg/character-panel.js');
  const mk = (L, learned) => { const rec = { ...initialProgress(), learned }; return { level: L, rec, canLearn: (id) => S.canLearn(L, rec, id), pointsLeft: () => S.pointsLeft(L, rec) }; };
  const a = mk(3, ['ling_diction']);
  assert.equal(nodeState(a, 'ling_diction'), 'learned'); assert.equal(nodeState(a, 'ling_echo'), 'available'); assert.equal(nodeState(a, 'ling_hush'), 'locked-req');
  assert.equal(nodeState(mk(2, []), 'ling_echo'), 'locked-req'); assert.equal(nodeState(mk(4, ['ling_diction', 'ling_echo']), 'ling_hush'), 'locked-level');
  assert.equal(nodeState(mk(2, ['war_stance']), 'sch_notes'), 'poor');
  const tip = nodeTip(a, 'ling_echo', t);
  assert.equal(tip.title, 'Echo Word'); assert.deepEqual(tip.lines.slice(0, 3), ['Active · Linguist · Tier 2', 'Mana 12 · Cooldown 12 s', 'Say it again. Repeats your last attack at 60% power.']);
  assert.equal(nodeTip(a, 'ling_hush', t).lines[3], 'Learn Echo Word first');
  assert.equal(nodeTip(mk(2, ['war_stance']), 'sch_notes', t).lines[3], 'Costs 1 skill point(s). You have 0.');
  assert.equal(nodeTip(a, 'ling_diction', t).lines[1], 'Always on');
  assert.equal(mainBranch({ learned: [] }), ''); assert.equal(mainBranch({ learned: ['war_stance', 'war_brace', 'ling_diction'] }), 'warden');
});

test('minimap projection: north up, metres to pixels', async () => {
  const { toMap, ZOOMS } = await import('../../src/rpg/minimap.js');
  assert.deepEqual(ZOOMS, [40, 60, 100]);
  assert.deepEqual(toMap([10, 0, 0], [0, 0, 0], 50, 200), [120, 100]); assert.deepEqual(toMap([0, 0, -25], [0, 0, 0], 50, 200), [100, 50]);
});

test('HUD strings: every key the HUD uses is in en-hud, the fallback fills placeholders, no banned jargon', () => {
  assert.equal(t('hud.levelup.log', { n: 3, sp: 2, tp: 6 }), 'You reached level 3. You have 2 skill point(s) and 6 stat points.');
  assert.equal(hudT((k) => (k === 'hud.fail.mana' ? 'Mana!' : k))('hud.fail.mana'), 'Mana!', 'the game table wins');
  for (const k of Object.values(S.CAST_FAIL)) assert.ok(EN_HUD[k], k);
  const banned = /\b(NEP-245|NEP-171|relayer|RPC|testnet|TEE|Merkle|commit-reveal|gas|nonce|wool)\b/i;
  for (const [k, v] of Object.entries(EN_HUD)) assert.ok(!banned.test(v), k);
  assert.ok(!Object.values(EN_HUD).some((v) => /\b200\b|20000|10,000/.test(v)), 'no literal portal price');
});

test('F1 cheat sheet rows: every bindable action once, grouped, with its current key', async () => {
  const { cheatRows } = await import('../../src/rpg/cheat-sheet.js');
  const KB = await import('../../src/ui/keybinds.js');
  const rows = cheatRows({ ...KB.defaultBindings(), strike: 'KeyG' });
  assert.deepEqual(rows.map((g) => g.group), [...KB.KEY_GROUPS]);
  assert.equal(rows.flatMap((g) => g.rows).length, KB.KEY_ACTIONS.length);
  assert.equal(rows.flatMap((g) => g.rows).find((r) => r.id === 'strike').key, 'G');
});

test('stamina bar: shown below full, while just spent or flashing; a full, rested bar fades', async () => {
  const { staminaShown } = await import('../../src/rpg/hud.js');
  const { createStamina, STAMINA } = await import('../../src/game/stamina.js');
  assert.equal(staminaShown(null), false, 'no stamina model: no bar');
  const s = createStamina();
  s.update(2); s.update(2); assert.equal(staminaShown(s), false, 'full and idle for 4 s: hidden');
  s.spend(STAMINA.dash); assert.equal(staminaShown(s), true, 'a dash: shown');
  for (let i = 0; i < 40; i++) s.update(0.1);
  assert.equal(s.ratio, 1); assert.equal(staminaShown(s), true, 'just refilled: still shown');
  for (let i = 0; i < 40; i++) s.update(0.1);
  assert.equal(staminaShown(s), false, 'rested 3 s at full: fades');
  assert.equal(staminaShown({ ratio: 1, idle: 10, flash: 0.4 }), true, 'a refused action flashes it back');
});

test('minimap rim clamp: inside points stay, outside points sit on the rim', async () => {
  const { clampToRim } = await import('../../src/rpg/minimap.js');
  assert.deepEqual(clampToRim(110, 100, 200, 10), [110, 100, false]);
  const [x, y, off] = clampToRim(300, 100, 200, 10);
  assert.equal(off, true); assert.equal(Math.round(x), 190); assert.equal(y, 100);
});

test('the tray uses the owner GPT icon family; the menu keeps both groups (14.11)', async () => {
  const { TRAY } = await import('../../src/rpg/hud.js');
  const { readFileSync } = await import('node:fs');
  const inner = (n) => readFileSync(new URL('../../../docs/art/requests/in/hud/' + n + '.svg', import.meta.url), 'utf8').match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1].trim();
  for (const id of ['character', 'skills', 'journal', 'map', 'bag', 'market']) assert.ok(TRAY.find((x) => x.id === id).icon.includes(inner(id)), id);
  const menu = TRAY.find((x) => x.id === 'menu').icon;
  assert.ok(menu.includes('<g class="i-menu">' + inner('menu') + '</g>'));
  assert.ok(menu.includes('<g class="i-gear">' + inner('settings') + '</g>'));
});
