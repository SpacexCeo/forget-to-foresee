// Proof export ("Copy proof" / "Copy season proof") checked by the independent verifiers in tools/verify (node and
// python, zero dependencies), plus a tamper test: one changed digit must FAIL.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { openGame, consoleProblems, shutdown, GAME_ROOT } from './lib/env.mjs';

after(shutdown);
const OUT = path.join(GAME_ROOT, 'tests/e2e/.shots');
const run = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: path.resolve(GAME_ROOT, '..') }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };

test('proof and season exports verify with tools/verify (node and python); a tampered proof fails', { timeout: 900000 }, async (t) => {
  const g = await openGame('?demo=judge&mode=walk&play=direct');
  try {
    for (let i = 0; i < 6; i++) { const o = await g.obs(); if (o.tick >= 4 && o.chronicle >= 1) break; await g.key('KeyT'); await g.wait(250); await g.key('KeyT'); await g.busIdle(); await g.wait(900); }
    assert.ok((await g.obs()).chronicle >= 1, 'a revealed event exists');
    const docs = await g.page.evaluate(async () => {
      const m = await import('/src/net/verify-export.js');
      const s = window.__ftf.play.session;
      const proof = await m.buildProofExport(s, 0);
      const season = await m.buildSeasonExport(s);
      return { proof, season, text: m.proofExportText(proof), seasonText: m.proofExportText(season) };
    });
    mkdirSync(OUT, { recursive: true });
    const proofFile = path.join(OUT, 'proof.json'), seasonFile = path.join(OUT, 'season.json'), badFile = path.join(OUT, 'proof-tampered.json');
    writeFileSync(proofFile, docs.text); writeFileSync(seasonFile, docs.seasonText);
    const bad = docs.text.replace(/"scheduleRoot": "([0-9a-f])/, (m0, d) => `"scheduleRoot": "${d === 'a' ? 'b' : 'a'}`);
    const badSalt = docs.text.replace(/"salt": "([0-9a-f])/, (m0, d) => `"salt": "${d === 'f' ? '0' : 'f'}`);
    assert.notEqual(bad, docs.text, 'tampered copy differs');
    writeFileSync(badFile, bad);
    const badSaltFile = path.join(OUT, 'proof-tampered-salt.json'); writeFileSync(badSaltFile, badSalt);
    await t.test('node verifier: proof OK', () => { const r = run('node', ['tools/verify/verify.mjs', proofFile]); assert.equal(r.code, 0, r.out); assert.match(r.out, /OK/); assert.ok(!/✗/.test(r.out), r.out); });
    await t.test('node verifier: season OK', () => { const r = run('node', ['tools/verify/verify.mjs', seasonFile]); assert.equal(r.code, 0, r.out); assert.match(r.out, /OK/); });
    await t.test('node verifier: tampered root FAILS', () => { const r = run('node', ['tools/verify/verify.mjs', badFile]); assert.equal(r.code, 1, r.out); assert.match(r.out, /FAIL/); });
    await t.test('node verifier: tampered salt FAILS', () => { const r = run('node', ['tools/verify/verify.mjs', badSaltFile]); assert.equal(r.code, 1, r.out); assert.match(r.out, /FAIL/); });
    await t.test('python verifier: proof OK, tampered FAILS', () => {
      const ok = run('python3', ['-I', 'tools/verify/verify.py', proofFile]); assert.equal(ok.code, 0, ok.out); assert.match(ok.out, /OK/);
      const fail = run('python3', ['-I', 'tools/verify/verify.py', badFile]); assert.equal(fail.code, 1, fail.out); assert.match(fail.out, /FAIL/);
    });
    await t.test('the export names the format and carries the root the HUD shows', () => {
      assert.equal(docs.proof.format, 'ftf-proof/1');
      assert.match(JSON.stringify(docs.proof), /[0-9a-f]{64}/);
    });
    assert.equal(consoleProblems(g), '');
  } finally { await g.close(); }
});
