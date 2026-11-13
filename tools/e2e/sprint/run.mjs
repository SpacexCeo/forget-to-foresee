#!/usr/bin/env node
// Runs the sprint e2e scenarios against a served build: node tools/e2e/sprint/run.mjs <base-url> [name ...]
const base = (process.argv[2] || 'http://127.0.0.1:4179/').replace(/\/?$/, '/');
const names = process.argv.slice(3).length ? process.argv.slice(3) : ['flags-off', 'flags-on', 'chunk-retry', 'first-ten'];
let failed = 0;
for (const n of names) {
  const t0 = Date.now();
  try { const mod = await import(new URL(`./${n}.mjs`, import.meta.url)); const msg = await mod.default(base); console.log(`ok   ${n} (${Math.round((Date.now() - t0) / 1000)} s): ${msg}`); }
  catch (e) { failed++; console.log(`FAIL ${n} (${Math.round((Date.now() - t0) / 1000)} s): ${e.message}`); }
}
console.log(`e2e: ${names.length - failed} of ${names.length} passed`);
process.exit(failed ? 1 : 0);
