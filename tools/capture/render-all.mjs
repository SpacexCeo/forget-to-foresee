#!/usr/bin/env node
// Renders every video in tools/capture/shots one after another with the same options, e.g.
//   node tools/capture/render-all.mjs --draft --parallel 2
//   node tools/capture/render-all.mjs --final --gpu
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const videos = readdirSync(join(HERE, 'shots')).filter((f) => f.endsWith('.mjs') && f !== 'common.mjs').map((f) => f.replace(/\.mjs$/, '')).sort((a, b) => (a === 'demo' ? -1 : b === 'demo' ? 1 : a.localeCompare(b)));
const args = process.argv.slice(2);
for (const v of videos) {
  console.log(`\n===== ${v} =====`);
  const code = await new Promise((resolve) => spawn(process.execPath, [join(HERE, 'capture.mjs'), v, ...args], { stdio: 'inherit' }).on('close', resolve));
  if (code !== 0) { console.error(`${v} failed with code ${code}`); process.exit(code); }
}
