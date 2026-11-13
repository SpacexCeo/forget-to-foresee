#!/usr/bin/env node
// Sprint lint (docs/plans/sprint/FTF-5h-Six-Agent-Sprint.md 8.4, step 2). Exit 1 with one line per finding.
//   node scripts/lint-sprint.mjs [--root <dir>]    (tests pass a fixture root)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root') + 1] : join(dirname(fileURLToPath(import.meta.url)), '..');
const SPRINT_DIRS = ['game/src/sprint', 'game/src/quests', 'game/src/rpg', 'game/src/market', 'game/src/npe', 'game/src/scenes/lab'];
const LOCALE_SEAMS = ['en-quests.js', 'en-hud.js', 'en-market.js', 'en-npe.js', 'en-tips.js', 'en-video.js'].map((f) => 'game/src/play/locales/' + f);
const WOOL_ALLOW = new Set(['game/src/game/board-score.js', 'game/src/game/expedition-config.js', 'relayer/lib/expedition-rules/expedition-config.js']);
const JARGON = [/\bNEP-?2?45\b/i, /\bNEP-?171\b/i, /\bmulti-token\b/i, /\brelayer\b/i, /\bcoordinator\b/i, /\bRPC\b/, /\bgas\b/i, /\bnonce\b/i, /\btestnet\b/i, /\bon-chain\b/i, /\boff-chain\b/i, /\bTEE\b/, /\benclave\b/i, /\bMerkle\b/i, /\bcommit-reveal\b/i, /\bguest account\b/i, /\bidempoten/i, /\brequest hash\b/i];

const files = (dir) => { const out = []; const d = join(ROOT, dir); if (!existsSync(d)) return out; for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) out.push(...files(join(dir, e))); else if (/\.(m?js|css|html)$/.test(e)) out.push(join(dir, e)); } return out; };
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const findings = [];
const flag = (f, i, msg) => findings.push(`${f}:${i + 1}: ${msg}`);
const lines = (f) => read(f).split('\n');

/** Player strings of a locale seam file: [key, text, line]. */
function strings(f) {
  const out = [];
  lines(f).forEach((l, i) => { const m = /^\s*['"]([^'"]+)['"]\s*:\s*(['"`])(.*)\2\s*,?\s*$/.exec(l); if (m) out.push([m[1], m[3], i]); });
  return out;
}

// 1. wool anywhere outside the allow-list
for (const f of [...files('game/src'), ...files('relayer/lib'), ...files('relayer/api')]) {
  if (WOOL_ALLOW.has(f)) continue;
  lines(f).forEach((l, i) => { if (/wool/i.test(l)) flag(f, i, 'the currency is silk; "wool" is not allowed'); });
}
const owned = [...SPRINT_DIRS.flatMap(files), ...LOCALE_SEAMS.filter((f) => existsSync(join(ROOT, f)))];
for (const f of owned) {
  lines(f).forEach((l, i) => {
    // 2. the portal fee and other silk amounts come from config
    if (/\b(10,000|10_000|20000|20_000)\b/.test(l)) flag(f, i, 'a literal fee; read it from expedition-config (portalFee) / {fee}');
    if (/\b200\s*silk\b|\bsilk\s*200\b/i.test(l)) flag(f, i, 'a literal 200 silk; use {fee}');
    // 3. English only outside the ru/uk/zh locale files
    if (/[Ѐ-ӿ一-鿿]/.test(l)) flag(f, i, 'non-English letters in an English-only file');
    // 4. silk formatting lives in silk-balance.js
    if (!f.endsWith('silk-balance.js') && /toFixed\(2\)|Math\.floor\([^)]*\/\s*100\)/.test(l) && /silk/i.test(l)) flag(f, i, 'format silk with the shared helper, not toFixed(2) / floor(/100)');
    // 5. ellipsis needs a title or an expand handler on the same rule's element (R7): flag CSS ellipsis in sprint files
    if (/text-overflow:\s*ellipsis/.test(l) && !/title|expand/i.test(l)) flag(f, i, 'text-overflow: ellipsis without a title or an expand handler (R7)');
  });
}
// 6. banned jargon in player strings (keys under curious.* may explain it)
for (const f of LOCALE_SEAMS.filter((x) => existsSync(join(ROOT, x)))) {
  for (const [k, text, i] of strings(f)) {
    if (k.startsWith('curious.')) continue;
    for (const re of JARGON) if (re.test(text)) { flag(f, i, `jargon "${text.match(re)[0]}" in ${k} (plain words, list 1.6)`); break; }
    if (f.endsWith('en-npe.js') && text.length > 140) flag(f, i, `${k} is ${text.length} characters (max 140)`);
  }
}
// 7. a removed string must not come back
for (const f of files('game/src')) lines(f).forEach((l, i) => { if (l.includes('Local: kept in this browser only')) flag(f, i, 'the old "Local: kept in this browser only" label'); });

if (findings.length) { console.log(findings.join('\n')); console.log(`lint-sprint: ${findings.length} finding(s)`); process.exit(1); }
console.log(`lint-sprint: ok (${owned.length} sprint files, ${LOCALE_SEAMS.length} locale seams)`);
