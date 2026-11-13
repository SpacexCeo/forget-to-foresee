#!/usr/bin/env node
// Sprint bundle budget (plan 8.4 step 4, 8.7). Measures game/dist after a build, gzipped:
//   first-load JS = the scripts index.html loads or preloads; all JS = every .js in dist/assets.
// Compared with docs/sprint/bundle-baseline.json (the sprint start): first-load may grow by at most 40 KB, all JS by
// at most 250 KB (the sprint's lazy chunks), and no single chunk that did not exist at the baseline may exceed 120 KB.
//   node scripts/bundle-budget.mjs [--write-baseline]
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'game/dist'), BASE = join(ROOT, 'docs/sprint/bundle-baseline.json');
const KB = 1024, LIMITS = { firstLoad: 40 * KB, total: 250 * KB, newChunk: 120 * KB };
if (!existsSync(join(DIST, 'index.html'))) { console.log('bundle-budget: no game/dist (run the build first)'); process.exit(1); }
const gz = (f) => gzipSync(readFileSync(join(DIST, f))).length;
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const first = [...new Set([...html.matchAll(/(?:src|href)="[^"]*?(assets\/[^"]+\.js)"/g)].map((m) => m[1]))];
const all = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js')).map((f) => 'assets/' + f);
const stem = (f) => f.replace(/^assets\//, '').replace(/-[A-Za-z0-9_-]{8}\.js$/, '');
const now = { firstLoad: first.reduce((s, f) => s + gz(f), 0), total: all.reduce((s, f) => s + gz(f), 0), chunks: Object.fromEntries(all.map((f) => [stem(f), gz(f)])) };
if (process.argv.includes('--write-baseline')) { writeFileSync(BASE, JSON.stringify({ date: new Date().toISOString().slice(0, 10), ...now }, null, 2) + '\n'); console.log('bundle-budget: baseline written'); process.exit(0); }
if (!existsSync(BASE)) { console.log('bundle-budget: no baseline (node scripts/bundle-budget.mjs --write-baseline at the sprint start)'); process.exit(1); }
const base = JSON.parse(readFileSync(BASE, 'utf8'));
const bad = [];
const d = (k) => now[k] - base[k];
if (d('firstLoad') > LIMITS.firstLoad) bad.push(`first-load JS grew ${(d('firstLoad') / KB).toFixed(1)} KB gz (max 40)`);
if (d('total') > LIMITS.total) bad.push(`all JS grew ${(d('total') / KB).toFixed(1)} KB gz (max 250)`);
for (const [k, v] of Object.entries(now.chunks)) if (!(k in base.chunks) && v > LIMITS.newChunk) bad.push(`new chunk ${k} is ${(v / KB).toFixed(1)} KB gz (max 120)`);
console.log(`bundle-budget: first-load ${(now.firstLoad / KB).toFixed(1)} KB gz (${d('firstLoad') >= 0 ? '+' : ''}${(d('firstLoad') / KB).toFixed(1)}), all JS ${(now.total / KB).toFixed(1)} KB gz (${d('total') >= 0 ? '+' : ''}${(d('total') / KB).toFixed(1)})`);
if (bad.length) { console.log(bad.join('\n')); process.exit(1); }
