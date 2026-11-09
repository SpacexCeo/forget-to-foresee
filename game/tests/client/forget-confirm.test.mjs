// Cancel before a memory burn (spec appendix G): the Memories panel asks "Forget “…” forever?" with what
// changes, what Iris gains and that it cannot be undone; only "Forget this memory" sends sacrifice_memory.
// The model runs on a real local season; the panel wiring is pinned from the source like ui-polish.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLocalTransport } from '../../src/play/transport-local.js';
import { PlaySession } from '../../src/play/session.js';
import { createPlayI18n, renderMsg } from '../../src/play/i18n.js';
import { forgetConfirmModel } from '../../src/play/forget-confirm.js';

const SEED = '0123456789abcdef0123456789abcdef';
const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

async function session() {
  const s = new PlaySession({ transport: createLocalTransport({ seedHex: SEED }) });
  await s.start();
  return s;
}

test('forget confirmation: names the memory, the vision it buys and the cost; nothing is sent by asking', async () => {
  const s = await session();
  const m = s.obs.memories[0];
  assert.ok(m, 'Iris starts with memories');
  const before = s.obs.memories.map((x) => x.id);
  const fc = forgetConfirmModel(s.obs, { id: m.id, purpose: 'vision' });
  assert.equal(fc.memory.id, m.id);
  assert.equal(fc.purpose, 'vision');
  assert.equal(fc.canConfirm, true);
  assert.equal(fc.reason, null);
  assert.deepEqual(fc.gain, { key: 'forget.gain.vision', args: { n: m.weight } }, 'a vision opens as many signs as the memory weighs');
  const en = createPlayI18n('en'), ru = createPlayI18n('ru');
  assert.equal(renderMsg(en, fc.title.key, fc.title.args), `Forget “${m.text}” forever?`);
  assert.match(renderMsg(en, fc.gain.key, { n: 1 }), /^She sees the next future sign/);
  assert.match(renderMsg(en, fc.gain.key, { n: 3 }), /next 3 future signs/);
  assert.match(renderMsg(ru, fc.gain.key, { n: 3 }), /следующие 3 знака/);
  assert.match(renderMsg(en, fc.cost.key), /cannot be undone/);
  assert.match(renderMsg(ru, 'forget.keep'), /Оставить/);
  assert.deepEqual(s.obs.memories.map((x) => x.id), before, 'building the confirmation changes nothing');
});

test('forget confirmation: no request or a memory that is gone gives nothing to confirm', async () => {
  const s = await session();
  assert.equal(forgetConfirmModel(s.obs, null), null);
  assert.equal(forgetConfirmModel(s.obs, { id: 999, purpose: 'vision' }), null);
  assert.equal(forgetConfirmModel(null, { id: 1, purpose: 'vision' }), null);
});

test('forget confirmation: the confirm button is off when the engine would refuse (no attention, Key closed, season over)', async () => {
  const s = await session();
  const m = s.obs.memories[0];
  const tired = { ...s.obs, iris: { ...s.obs.iris, attention: 0 } };
  assert.deepEqual(pick(forgetConfirmModel(tired, { id: m.id, purpose: 'vision' })), { canConfirm: false, reason: 'no_ap' });
  assert.equal(s.obs.iris.keyVision.open, false, 'the Key vision is closed before the crisis');
  const key = forgetConfirmModel(s.obs, { id: m.id, purpose: 'key' });
  assert.deepEqual(pick(key), { canConfirm: false, reason: 'key_closed' });
  assert.deepEqual(key.gain, { key: 'forget.gain.key', args: {} });
  const over = { ...s.obs, season: { ...s.obs.season, phase: 'end' } };
  assert.deepEqual(pick(forgetConfirmModel(over, { id: m.id, purpose: 'vision' })), { canConfirm: false, reason: 'phase' });
});
const pick = (fc) => ({ canConfirm: fc.canConfirm, reason: fc.reason });

test('forget confirmation: after the burn the memory is gone and the confirmation closes itself', async () => {
  const s = await session();
  const m = s.obs.memories[0];
  assert.equal((await s.send('sacrifice_memory', { memoryId: m.id, purpose: 'vision' })).ok, true);
  assert.equal(forgetConfirmModel(s.obs, { id: m.id, purpose: 'vision' }), null);
});

test('Memories panel: "Forget it" only asks; sacrifice_memory goes out only from "Forget this memory"; Esc keeps the memory', () => {
  const ui = read('../../src/play/ui.js');
  assert.match(ui, /'data-forget': m\.id, text: t\('memory\.forget'\), onclick: \(\) => askForget\(m\.id, 'vision'\)/, 'the vision button asks first');
  assert.match(ui, /text: t\('memory\.forgetKey'\), onclick: \(\) => askForget\(m\.id, 'key'\)/, 'the Key button asks first');
  assert.equal(ui.match(/session\.send\('sacrifice_memory'/g).length, 1, 'one place sends the burn');
  const calls = [...ui.matchAll(/[^.\w]forget\(m\.id/g)];
  assert.equal(calls.length, 1, 'forget() is called from one button only');
  assert.match(ui, /'data-forget-confirm': m\.id, disabled: !fc\.canConfirm, text: t\('forget\.confirm'\), onclick: \(\) => forget\(m\.id, fc\.purpose\)/);
  assert.match(ui, /'data-forget-keep': m\.id, text: t\('forget\.keep'\), onclick: keepMemory/);
  assert.match(ui, /if \(code === 'Escape'\) \{ if \(panel === 'memory' && forgetAsk\) \{ keepMemory\(\); return true; \}/, 'Esc on the question keeps the memory');
  assert.match(ui, /function askForget\(id, purpose\) \{\s*forgetAsk = \{ id, purpose \};\s*renderPanel\(\);[\s\S]{0,120}keep\.focus\(\)/, '"Keep it" takes the focus, so Enter does not burn');
});
