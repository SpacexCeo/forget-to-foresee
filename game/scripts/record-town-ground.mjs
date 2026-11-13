// Records the town's real ground along every edge of the path graph (play/town-paths.js) into
// tests/fixtures/town-ground.json: for each edge, the ground height every 0.25 m, cast down from 1.2 m above the
// path, and whether anything solid stands within a 0.35 m body at knee or chest height (the town's own colliders, in a
// headless browser on a built page). tests/client/town-paths.test.mjs checks the
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
  const solid = [];
  const dirs = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), 0, Math.sin(i * Math.PI / 4)]);
  for (const e of edges) {
    const ground = [], blocked = [];
    e.pts.forEach(([x, y, z], i) => {
      const v = T.groundAt(x, z, O + y + 1.2), gy = v == null ? null : v - O; ground.push(gy == null ? null : Math.round(gy * 1000) / 1000);
      const base = gy == null ? y : gy; // a body 0.35 m round: nothing solid at knee or chest height within it
      let hit = null; for (const d of dirs) for (const h of [0.4, 1.1]) { const r = T.rayHit([x, O + base + h, z], d, 0.35); if (r && (!hit || r.distance < hit.distance)) hit = r; }
      if (hit) { blocked.push(i); solid.push({ edge: e.key, at: [x, base, z].map((v) => Math.round(v * 100) / 100), hit: [hit.point[0], hit.point[2]].map((v) => Math.round(v * 100) / 100) }); }
    });
    res[e.key] = { ground, blocked };
  }
  return { res, solid };
}, edges);
await b.close();
writeFileSync(new URL('../tests/fixtures/town-ground.json', import.meta.url), JSON.stringify({ step: 0.25, castFrom: 1.2, body: 0.35, edges: out.res }) + '\n');
// the solid points, by edge, for whoever fixes the route data (tests/fixtures/town-solid.json)
writeFileSync(new URL('../tests/fixtures/town-solid.json', import.meta.url), JSON.stringify(out.solid) + '\n');
console.log('blocked samples', out.solid.length);
console.log('recorded', Object.keys(out.res).length, 'edges');
