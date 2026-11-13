// scripts/lint-sprint.mjs: each rule fails on a bad fixture and passes on a good one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const LINT = new URL('../../../scripts/lint-sprint.mjs', import.meta.url).pathname;
function run(files) {
  const root = mkdtempSync(join(tmpdir(), 'ftf-lint-'));
  for (const [p, text] of Object.entries(files)) { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), text); }
  return spawnSync(process.execPath, [LINT, '--root', root], { encoding: 'utf8' });
}
test('lint-sprint: good passes, every rule catches its bad fixture', () => {
  assert.equal(run({ 'game/src/sprint/a.js': 'export const fee = portalFee().feeC;\n', 'game/src/play/locales/en-tips.js': "export default {\n  'tip.a': 'Press J to open your journal.',\n};\n" }).status, 0);
  const bad = {
    'game/src/sprint/w.js': '// pay in wool\n',
    'game/src/quests/f.js': "const fee = 20000;\n",
    'game/src/rpg/r.js': "const t = 'Привет';\n",
    'game/src/market/m.js': "label(silk.toFixed(2) + ' silk');\n",
    'game/src/play/locales/en-npe.js': "export default {\n  'npe.a': 'Your relayer is ready.',\n};\n",
    'game/src/ui/x.js': "const s = 'Local: kept in this browser only';\n",
  };
  const r = run(bad);
  assert.equal(r.status, 1);
  for (const needle of ['wool', 'literal fee', 'non-English', 'format silk', 'jargon', 'Local: kept']) assert.match(r.stdout, new RegExp(needle), needle);
});
