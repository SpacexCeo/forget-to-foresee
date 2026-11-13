// Records the town's real ground along every edge of the path graph (play/town-paths.js) into
// tests/fixtures/town-ground.json: for each edge, the ground height every 0.25 m, cast down from 1.2 m above the
// path (the town's own colliders, in a headless browser on a built page). tests/client/town-paths.test.mjs checks the
// graph against it. Usage: FTF_E2E_URL=http://localhost:4173/forget-to-foresee/ node scripts/record-town-ground.mjs
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import '../src/play/townsfolk-plan.js'; // registers the program walks and post connectors
import { townPaths, edgeSamples, edgeKey } from '../src/play/town-paths.js';

const url = process.env.FTF_E2E_URL || 'http://localhost:4173/forget-to-foresee/';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const g = townPaths();
const edges = g.edges.map(([a, b]) => ({ key: edgeKey(g.nodes[a], g.nodes[b]), pts: edgeSamples(g.nodes[a], g.nodes[b]) }));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
await p.goto(url, { timeout: 180000 });
await p.waitForFunction(() => window.__ftf?.town?.ready, null, { timeout: 240000, polling: 500 });
await p.waitForTimeout(8000); // every street piece real
const out = await p.evaluate((edges) => {
  const T = window.__ftf.town.scene, O = 1200, res = {};
  for (const e of edges) res[e.key] = e.pts.map(([x, y, z]) => { const v = T.groundAt(x, z, O + y + 1.2); return v == null ? null : Math.round((v - O) * 1000) / 1000; });
  return res;
}, edges);
await b.close();
writeFileSync(new URL('../tests/fixtures/town-ground.json', import.meta.url), JSON.stringify({ step: 0.25, castFrom: 1.2, edges: out }) + '\n');
console.log('recorded', Object.keys(out).length, 'edges');
