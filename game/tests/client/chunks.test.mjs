// The entry's static imports must not pull a lazy chunk forward (owner, 11.11: main.js importing a module that the
// chunk rules placed in `ui` made `ui` evaluate before `play`, a TDZ error in the live bundle only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chunkFor } from '../../build/chunks.js';

// Lead, 13.11: features.js had no rule ("undefined"), Rollup put it into client-core, and the loading page then
// preloaded three, ui, play and client-core (first load 1085 KB gz instead of 12). Every relative static import of the
// entry is pinned to "boot" now; "let Rollup decide" is not allowed for them.
test('every module main.js imports statically is pinned to the boot chunk', () => {
  const main = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  const statics = [...main.matchAll(/^import\s+(?:[^'"]+from\s+)?['"](\.[^'"]+)['"]/gm)].map((m) => m[1]);
  assert.ok(statics.length >= 2);
  for (const rel of statics) {
    const id = '/repo/game/src/' + rel.replace(/^\.\//, '');
    const chunk = chunkFor(id);
    assert.equal(chunk, 'boot', `${rel} → chunk ${chunk}: a static import from the entry must be pinned to "boot" in build/chunks.js`);
  }
});

// Lead, 14.11: play/locales/en-quests.js imported game/journal-data.js (a ui-chunk module) while ui imports the locales,
// so locales <-> ui became a chunk cycle and the build died at boot. Rule: a locale module only imports modules that the
// plan puts in the locales chunk, and those import nothing outside it.
test('the locales chunk imports nothing from another chunk', async () => {
  const { readdirSync } = await import('node:fs');
  const root = new URL('../../src/', import.meta.url);
  const bad = [];
  const seen = new Set();
  const visit = (rel) => {
    if (seen.has(rel)) return; seen.add(rel);
    const src = readFileSync(new URL(rel, root), 'utf8');
    for (const m of src.matchAll(/^import\s+(?:[^'"]+from\s+)?['"](\.\.?\/[^'"]+)['"]/gm)) {
      const target = new URL(m[1], new URL(rel, root)).pathname.replace(/^.*\/src\//, '');
      if (chunkFor('/repo/game/src/' + target) !== 'locales') bad.push(`${rel} -> ${m[1]} (${chunkFor('/repo/game/src/' + target)})`);
      else visit(target);
    }
  };
  for (const dir of ['locales', 'play/locales']) for (const f of readdirSync(new URL(dir + '/', root)).filter((n) => n.endsWith('.js'))) visit(`${dir}/${f}`);
  assert.equal(chunkFor('/repo/game/src/game/journal-data.js'), 'locales');
  assert.deepEqual(bad, []);
});

// Lead, 12.11: the merged build died at boot with "Cannot access 'TOWNSFOLK' before initialization": scenes/barks.js
// (client-core) read a play-chunk export at module level, and play imports client-core, so the cycle evaluated it
// first. Rule: render/, physics/, scenes/ may import play/ or net/ values but only use them inside functions.
test('client-core modules never read a play/ or net/ import at module level', async () => {
  const { readdirSync } = await import('node:fs');
  const root = new URL('../../src/', import.meta.url);
  const bad = [];
  for (const dir of ['render', 'physics', 'scenes']) {
    for (const f of readdirSync(new URL(dir + '/', root)).filter((n) => n.endsWith('.js'))) {
      const src = readFileSync(new URL(`${dir}/${f}`, root), 'utf8');
      const names = [];
      for (const m of src.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]\.\.\/(play|net)\/[^'"]+['"]/gm)) {
        for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) names.push(n); }
      }
      if (!names.length) continue;
      // column-0 statements are module level; function, class and export-function bodies are indented
      const top = src.split('\n').filter((l) => /^\S/.test(l) && !/^(import|export \{|\/\/|\/\*|\s*\*|\}|function|async function|export (async )?function|export default function|class|export class)/.test(l));
      for (const l of top) for (const n of names) {
        const at = l.search(new RegExp(`\\b${n}\\b`)); if (at < 0) continue;
        const arrow = l.indexOf('=>'); if (arrow >= 0 && arrow < at) continue; // inside an arrow function's body: read on call
        bad.push(`${dir}/${f}: ${n} in "${l.slice(0, 80)}"`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

// Sprint 13.11: scenes/player-hud.js imported net/silk-core.js, which the rules put in `play`; client-core then imported
// play and the live bundle died with a TDZ error at boot. Rule: no static import from client-core lands in play.
test('client-core never statically imports a module of the play chunk', async () => {
  const { readdirSync } = await import('node:fs');
  const { chunkFor } = await import('../../build/chunks.js');
  const root = new URL('../../src/', import.meta.url);
  const bad = [];
  for (const dir of ['render', 'physics', 'scenes']) {
    for (const f of readdirSync(new URL(dir + '/', root)).filter((n) => n.endsWith('.js'))) {
      const src = readFileSync(new URL(`${dir}/${f}`, root), 'utf8');
      for (const m of src.matchAll(/^import\s+(?:[^'"]+from\s+)?['"](\.\.?\/[^'"]+)['"]/gm)) {
        const target = new URL(m[1], new URL(`${dir}/${f}`, root)).pathname.replace(/^.*\/src\//, '/repo/game/src/');
        if (chunkFor(target) === 'play') bad.push(`${dir}/${f} -> ${m[1]}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
