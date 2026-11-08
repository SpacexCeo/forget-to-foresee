// Records before/after trajectories of the player controller for docs/movement/ (CSV per physics step and
// an SVG chart): `node tests/client/movement-trajectories.mjs <outDir>`. Scenario: 2 s walk +Z, release
// (stop), 1 s rest, run +Z for 2 s, reverse to −Z at a run for 2 s, 90° turn to +X at a run for 2 s, stop.
import { writeFileSync, mkdirSync } from 'node:fs';
import { floorWorld, makePlayer, simulate } from './movement-measure.mjs';

const DEG = 180 / Math.PI;
const SCENARIO = [[2, [0, 1], false], [1, [0, 0], false], [2, [0, 1], true], [2, [0, -1], true], [2, [1, 0], true], [1, [0, 0], true]];
const phase = (t) => { let acc = 0; for (const [len, wish, run] of SCENARIO) { acc += len; if (t < acc - 1e-9) return { wish, run }; } return { wish: [0, 0], run: false }; };
const total = SCENARIO.reduce((a, [l]) => a + l, 0);

export function record(legacy) {
  const ch = makePlayer(floorWorld(), legacy ? { legacyAccel: 8 } : {});
  // simulate() takes one run flag; drive the flag per step through the wish callback instead.
  return simulate(ch, (t, c) => { const p = phase(t); c.run = p.run; return p.wish; }, total);
}

export function toCsv(rows) {
  return 'time_s,x_m,z_m,speed_m_s,heading_deg,grounded\n' + rows.map((r) => [r.t.toFixed(4), r.x.toFixed(4), r.z.toFixed(4), r.speed.toFixed(4), (r.heading * DEG).toFixed(2), r.grounded ? 1 : 0].join(',')).join('\n') + '\n';
}

/** Two panels (speed, heading) over time, before in grey, after in gold; plus the XZ path. */
export function toSvg(before, after) {
  const W = 960, H = 720, L = 60, R = 20, pad = 16;
  const panels = [
    { y0: 20, h: 200, label: 'ground speed, m/s', get: (r) => r.speed, min: 0, max: 4 },
    { y0: 250, h: 200, label: 'heading, degrees', get: (r) => r.heading * DEG, min: -200, max: 200 },
  ];
  const X = (t) => L + (t / total) * (W - L - R);
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" font-size="12">`;
  out += `<rect width="${W}" height="${H}" fill="#14191b"/>`;
  const line = (rows, p, color, dash = '') => `<polyline fill="none" stroke="${color}" stroke-width="1.6" ${dash ? `stroke-dasharray="${dash}"` : ''} points="${rows.map((r) => `${X(r.t).toFixed(1)},${(p.y0 + p.h - ((p.get(r) - p.min) / (p.max - p.min)) * p.h).toFixed(1)}`).join(' ')}"/>`;
  for (const p of panels) {
    out += `<rect x="${L}" y="${p.y0}" width="${W - L - R}" height="${p.h}" fill="#1c2326" stroke="#2c3639"/>`;
    out += `<text x="${L + 6}" y="${p.y0 + 14}" fill="#d9c9a0">${p.label}</text>`;
    for (const [i, [len]] of SCENARIO.entries()) { const t = SCENARIO.slice(0, i + 1).reduce((a, [l]) => a + l, 0); out += `<line x1="${X(t)}" y1="${p.y0}" x2="${X(t)}" y2="${p.y0 + p.h}" stroke="#2c3639"/>`; void len; }
    for (const v of [p.min, (p.min + p.max) / 2, p.max]) { const y = p.y0 + p.h - ((v - p.min) / (p.max - p.min)) * p.h; out += `<text x="${L - 6}" y="${y + 4}" fill="#8a9a9c" text-anchor="end">${v}</text>`; }
    out += line(before, p, '#8a9a9c', '4 3') + line(after, p, '#e0b25a');
  }
  const labels = ['walk', 'rest', 'run', 'reverse (run)', '90° (run)', 'stop'];
  labels.forEach((l, i) => { const t0 = SCENARIO.slice(0, i).reduce((a, [len]) => a + len, 0); out += `<text x="${X(t0) + 4}" y="${panels[1].y0 + panels[1].h + 16}" fill="#8a9a9c">${l}</text>`; });
  // XZ path panel.
  const py0 = 490, ph = 210;
  const all = [...before, ...after];
  const minX = Math.min(...all.map((r) => r.x)) - pad / 50, maxX = Math.max(...all.map((r) => r.x)) + pad / 50;
  const minZ = Math.min(...all.map((r) => r.z)) - pad / 50, maxZ = Math.max(...all.map((r) => r.z)) + pad / 50;
  const sc = Math.min((W - L - R - 2 * pad) / (maxX - minX), (ph - 2 * pad) / (maxZ - minZ));
  const PX = (x) => L + pad + (x - minX) * sc, PZ = (z) => py0 + ph - pad - (z - minZ) * sc;
  out += `<rect x="${L}" y="${py0}" width="${W - L - R}" height="${ph}" fill="#1c2326" stroke="#2c3639"/>`;
  out += `<text x="${L + 6}" y="${py0 + 14}" fill="#d9c9a0">path on the ground (x right, z up), 1 m grid</text>`;
  for (let g = Math.ceil(minX); g <= maxX; g++) out += `<line x1="${PX(g)}" y1="${py0}" x2="${PX(g)}" y2="${py0 + ph}" stroke="#263033"/>`;
  for (let g = Math.ceil(minZ); g <= maxZ; g++) out += `<line x1="${L}" y1="${PZ(g)}" x2="${W - R}" y2="${PZ(g)}" stroke="#263033"/>`;
  const path = (rows, color, dash = '') => `<polyline fill="none" stroke="${color}" stroke-width="1.8" ${dash ? `stroke-dasharray="${dash}"` : ''} points="${rows.map((r) => `${PX(r.x).toFixed(1)},${PZ(r.z).toFixed(1)}`).join(' ')}"/>`;
  out += path(before, '#8a9a9c', '4 3') + path(after, '#e0b25a');
  out += `<text x="${L + 6}" y="${H - 8}" fill="#8a9a9c">dashed grey: before (08.11, exponential smoothing) · gold: after (locomotion model). 30 Hz steps.</text>`;
  return out + '</svg>';
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const dir = process.argv[2] || '.';
  mkdirSync(dir, { recursive: true });
  const before = record(true), after = record(false);
  writeFileSync(`${dir}/trajectory-before.csv`, toCsv(before));
  writeFileSync(`${dir}/trajectory-after.csv`, toCsv(after));
  writeFileSync(`${dir}/trajectories.svg`, toSvg(before, after));
  console.log(`wrote ${dir}/trajectory-before.csv, trajectory-after.csv, trajectories.svg (${before.length} steps each)`);
}
