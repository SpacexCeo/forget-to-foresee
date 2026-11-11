// tools/verify-tee/verify.mjs runs offline on the recorded report, and fails a changed answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hex, personalMessageHash, signHashForTest, sha256Hex } from '../lib/tee-crypto.js';

const tool = new URL('../../tools/verify-tee/verify.mjs', import.meta.url).pathname;
const report = new URL('./fixtures/attestation-report.json', import.meta.url).pathname;
const run = (...a) => spawnSync(process.execPath, [tool, ...a], { encoding: 'utf8' });

test('attestation only, offline: PASS', () => {
  const r = run('--model', 'Qwen/Qwen3.8-27B', '--offline', report);
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /PASS\n$/);
});

test('an answer whose response was changed: FAIL', async () => {
  const req = JSON.stringify({ model: 'm', messages: [] }), res = JSON.stringify({ id: 'c1', choices: [{ message: { content: 'hello' } }] });
  const text = `${await sha256Hex(req)}:${await sha256Hex(res)}`;
  const sig = '0x' + hex(signHashForTest(personalMessageHash(text), '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'));
  const dir = mkdtempSync(join(tmpdir(), 'ftf-tee-'));
  const f = join(dir, 'a.json');
  writeFileSync(f, JSON.stringify({ tee: { chat_id: 'c1', request_body: req, response_body: res.replace('hello', 'HELLO'), signed_text: text, signature: sig, signing_address: '0x2c7536e3605d9c16a7a3d7b1898e529396a65c23' } }));
  const r = run(f, '--offline', report);
  assert.equal(r.status, 1); assert.match(r.stdout, /FAIL {2}response body hash/); assert.match(r.stdout, / ok {3}ECDSA signature/);
});
