// README checks (teardown C1, C11, C12): the "Try it" block has Do / You'll see / How to check rows whose commands exist;
// the window facts come from git (a fixture repository) and the README says 0 commits before 1 Nov; the legal and AI
// wording never uses investment words; the AI table keeps Iris a character and the arena label exact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { windowFacts, windowMarkdown } from '../../../scripts/window-facts.mjs';

const ROOT = new URL('../../../', import.meta.url);
const readme = readFileSync(new URL('README.md', ROOT), 'utf8');
const section = (title) => { const i = readme.indexOf('## ' + title); assert.ok(i >= 0, title); const j = readme.indexOf('\n## ', i + 3); return readme.slice(i, j < 0 ? undefined : j); };

test('C1: the "Try it" block has four rows of Do / You\'ll see / How to check, and every command path exists', () => {
  const rows = section('Try it: four checks').split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Do ') && !l.startsWith('|---'));
  assert.equal(rows.length, 4);
  for (const r of rows) assert.equal(r.split(/(?<!\\)\|/).length - 2, 3, r);
  for (const path of ['scripts/verify-all.sh', 'scripts/stats.mjs', 'tools/verify/verify.mjs', 'docs/STATS.md']) assert.ok(existsSync(new URL(path, ROOT)), path);
  assert.match(readme, /"leaf_count":15, "revealed_count":15|leaf_count":15/);
  const hints = section('Tracks');
  assert.match(hints, /\| NEAR Intents \| Not used \|/); assert.match(hints, /\| NEP-245 multi-token \| Built, not deployed/);
});

test('C12: window facts from a fixture repository; the README says 0 commits before 1 Nov', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ftf-window-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (args, date) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { cwd: dir, env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }, stdio: 'ignore' });
  git(['init', '-q'], '2026-11-07T10:00:00+02:00');
  git(['commit', '-q', '--allow-empty', '-m', 'baseline'], '2026-11-07T10:00:00+02:00'); git(['tag', 'pre-hackathon'], '2026-11-07T10:00:00+02:00');
  writeFileSync(join(dir, 'a.txt'), 'a'); git(['add', '.'], '2026-11-08T10:00:00+02:00'); git(['commit', '-q', '-m', 'a'], '2026-11-08T10:00:00+02:00');
  writeFileSync(join(dir, 'b.txt'), 'b'); git(['add', '.'], '2026-11-09T10:00:00+02:00'); git(['commit', '-q', '-m', 'b'], '2026-11-09T10:00:00+02:00');
  const f = windowFacts(dir);
  assert.deepEqual([f.shallow, f.commits, f.before1Nov, f.before19Oct, f.tagIsRoot, f.rootEmpty, f.filesSinceTag], [false, 3, 0, 0, true, true, 2]);
  assert.match(f.first, /^2026-11-07/); assert.match(f.last, /^2026-11-09/);
  assert.match(windowMarkdown(f, 'abc'), /\| Commits before 1 Nov 2026 \| 0 \|/);
  assert.match(section('Baseline, third-party code and AI disclosure'), /0 commits before 1 Nov 2026/);
  assert.match(readFileSync(new URL('docs/window.md', ROOT), 'utf8'), /\| Commits before 1 Nov 2026 \| 0 \|/);
});

test('C12 / C11: no investment words; the legal block is there; Iris is a character; the arena label is exact', () => {
  for (const file of ['README.md', 'docs/window.md', 'docs/ai-use.md']) {
    const text = readFileSync(new URL(file, ROOT), 'utf8');
    assert.doesNotMatch(text, /\b(invest(ment|ing|or)?s?|yield|token sale)\b/i, file);
  }
  assert.match(readme, /\*\*Free to play, nothing to buy\.\*\*/);
  assert.match(readme.split('\n')[2], /Iris\*\*, a doctor-linguist/); assert.doesNotMatch(readme.split('\n')[2], /AI clan agent/);
  assert.match(section('What is AI, what is scripted'), /"scripted NPC activity, owner-run, testnet, public seeds"/);
});
