// The line-art of the loading screen (game/index.html): our world as an instrument diagram.
//
//   node art/ui/loading/build_diagram.mjs          rewrites the two marked blocks in game/index.html
//   node art/ui/loading/build_diagram.mjs --check  exits 1 when index.html is out of date (used by the tests)
//
// Block `diagram`: the four Shells and the floating archipelago as small round drawings on one orbit line, with
// rows of the Guests' round signs above and below (a ring, a core with 0..3 dots, and one of the four stroke
// forms, arc / spike / loop / drop, at each of the four ring positions: the same forms and positions as
// game/src/play/logogram.js). Block `halo`: the fine circles and the crosshair star behind Iris.
// Everything is seeded, so the output is stable; the page inlines it and paints it before any script runs.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const INDEX = fileURLToPath(new URL('../../../game/index.html', import.meta.url));
const f = (n) => String(Math.round(n * 100) / 100);
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** One stroke form at the top of a ring of radius R (the shapes of FORM_PATHS in play/logogram.js). */
const FORMS = [
  (R) => `M${f(-0.3 * R)} ${f(-1.02 * R)}Q0 ${f(-1.3 * R)} ${f(0.3 * R)} ${f(-1.02 * R)}`,
  (R) => `M${f(-0.14 * R)} ${f(-0.97 * R)}L0 ${f(-1.36 * R)}L${f(0.14 * R)} ${f(-0.97 * R)}`,
  (R) => { const r = 0.13 * R, cy = -1.15 * R; return `M${f(-r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`; },
  (R) => `M0 ${f(-1.36 * R)}C${f(0.14 * R)} ${f(-1.14 * R)} ${f(0.14 * R)} ${f(-1.0 * R)} 0 ${f(-0.97 * R)}C${f(-0.14 * R)} ${f(-1.0 * R)} ${f(-0.14 * R)} ${f(-1.14 * R)} 0 ${f(-1.36 * R)}Z`,
];

/** A round sign: forms by ring position (top, right, bottom, left), dots 0..3 in the core. */
function sign(x, y, forms, dots, R = 11) {
  const parts = [`<circle r="${R}"/>`, `<circle r="${f(R * 0.3)}" class="bd-thin"/>`];
  forms.forEach((form, pos) => parts.push(`<path d="${FORMS[form](R)}"${pos ? ` transform="rotate(${pos * 90})"` : ''}${form === 3 ? ' class="bd-ink"' : ''}/>`));
  for (let d = 0; d < dots; d++) parts.push(`<circle cx="${f((d - (dots - 1) / 2) * R * 0.17)}" r="0.9" class="bd-dot"/>`);
  return `<g class="bd-sign" transform="translate(${x} ${y})">${parts.join('')}</g>`;
}

/** A crosshair star: four long thin rays and four short ones. */
function star(x, y, r, cls = 'bd-star') {
  const s = r * 0.32;
  return `<path class="${cls}" d="M${x} ${f(y - r)}V${f(y + r)}M${f(x - r)} ${y}H${f(x + r)}M${f(x - s)} ${f(y - s)}L${f(x + s)} ${f(y + s)}M${f(x - s)} ${f(y + s)}L${f(x + s)} ${f(y - s)}"/>`;
}

/** A Shell: a round hull with the spiral of its chambers and a short keel line under it. */
function shell(x, y, R, turn) {
  const pts = [];
  for (let i = 0; i <= 44; i++) { const t = i / 44, a = turn + t * Math.PI * 3.4, r = R * (0.1 + 0.8 * t); pts.push(`${f(x + Math.cos(a) * r)} ${f(y + Math.sin(a) * r)}`); }
  return `<g class="bd-shell"><circle cx="${x}" cy="${y}" r="${R}"/><polyline class="bd-thin" points="${pts.join(' ')}"/><path class="bd-thin" d="M${f(x - R * 0.5)} ${f(y + R + 5)}H${f(x + R * 0.5)}"/></g>`;
}

/** A floating island: a flat top and a hanging keel of rock. */
const isle = (x, y, w, h) => `M${f(x - w)} ${f(y)}H${f(x + w)}Q${f(x + w * 0.45)} ${f(y + h * 0.5)} ${f(x + w * 0.1)} ${f(y + h)}Q${f(x - w * 0.5)} ${f(y + h * 0.55)} ${f(x - w)} ${f(y)}Z`;

function diagram() {
  const W = 760, H = 300, cy = 150, cx = 380, r = rng(11);
  const o = [];
  const shells = [[112, 15], [206, 21], [554, 21], [648, 15]];
  // the orbit line, broken where a body sits on it, with a bead between neighbours
  const gaps = [...shells.map(([x, R]) => [x - R - 7, x + R + 7]), [cx - 104, cx + 104]].sort((a, b) => a[0] - b[0]);
  let x = 14; const segs = [];
  for (const [a, b] of gaps) { segs.push(`M${x} ${cy}H${a}`); x = b; }
  segs.push(`M${x} ${cy}H${W - 14}`);
  o.push(`<path class="bd-rail" d="${segs.join('')}"/>`);
  o.push(`<path class="bd-rail bd-thin" d="M60 96H${cx - 84}M${cx + 84} 96H700M60 204H${cx - 84}M${cx + 84} 204H700"/>`);
  for (const bx of [38, 159, 268, 492, 601, 722]) o.push(`<circle class="bd-dot" cx="${bx}" cy="${cy}" r="1.5"/>`);
  for (const bx of [60, 700]) o.push(`<circle class="bd-dot" cx="${bx}" cy="96" r="1.3"/><circle class="bd-dot" cx="${bx}" cy="204" r="1.3"/>`);
  // the Shells, two on each side, and the pair arcs that tie neighbours
  shells.forEach(([sx, R], i) => o.push(shell(sx, cy, R, i * 1.7)));
  o.push(`<path class="bd-thin bd-dash" d="M112 ${cy - 40}A62 62 0 0 1 206 ${cy - 40}M554 ${cy + 40}A62 62 0 0 0 648 ${cy + 40}"/>`);
  // the archipelago: the hub island with the Scroll's mast, five more around it, rope bridges between
  o.push(`<g class="bd-hub"><circle cx="${cx}" cy="${cy}" r="47"/>`
    + `<path d="${isle(cx, cy - 4, 17, 15)}${isle(cx - 25, cy - 20, 8, 7)}${isle(cx + 24, cy - 17, 9, 8)}${isle(cx - 21, cy + 16, 9, 8)}${isle(cx + 23, cy + 15, 7, 7)}${isle(cx + 2, cy - 31, 6, 5)}"/>`
    + `<path class="bd-thin" d="M${cx} ${cy - 4}V${cy - 14}M${cx - 3} ${cy - 14}H${cx + 3}M${cx - 17} ${cy - 4}Q${cx - 19} ${cy - 10} ${cx - 17} ${cy - 20}M${cx + 17} ${cy - 4}Q${cx + 18} ${cy - 9} ${cx + 15} ${cy - 17}M${cx - 12} ${cy + 16}Q${cx - 8} ${cy + 12} ${cx - 6} ${cy + 6}M${cx + 16} ${cy + 15}Q${cx + 11} ${cy + 12} ${cx + 8} ${cy + 5}"/></g>`);
  o.push(`<circle class="bd-orbit bd-dash" cx="${cx}" cy="${cy}" r="72"/><circle class="bd-orbit bd-thin" cx="${cx}" cy="${cy}" r="98"/>`);
  o.push(`<path class="bd-thin" d="M${cx} 24V${cy - 47}M${cx} ${cy + 47}V276"/>`);
  o.push(star(cx, 38, 15));
  o.push(`<circle class="bd-dot" cx="${cx}" cy="${cy - 72}" r="1.6"/><circle class="bd-dot" cx="${cx + 72}" cy="${cy}" r="1.6"/><circle cx="${cx + 98}" cy="${cy}" r="5"/><circle class="bd-dot" cx="${cx + 98}" cy="${cy}" r="1.2"/>`);
  o.push(`<circle cx="${cx}" cy="262" r="7"/><circle class="bd-dot" cx="${cx}" cy="262" r="1.6"/>`);
  // the signs: four over each side, three under
  const forms = () => [0, 1, 2, 3].map(() => Math.floor(r() * 4));
  for (const sx of [86, 152, 218, 284, 476, 542, 608, 674]) o.push(sign(sx, 66, forms(), Math.floor(r() * 4)));
  for (const sx of [112, 196, 280, 480, 564, 648]) o.push(sign(sx, 236, forms(), Math.floor(r() * 4)));
  return `<svg class="boot-diagram" viewBox="0 0 ${W} ${H}" aria-hidden="true">${o.join('')}</svg>`;
}

function halo() {
  const o = [];
  o.push('<circle class="bd-thin" cx="200" cy="250" r="150"/><circle class="bd-dash bd-orbit" cx="200" cy="250" r="192"/><circle class="bd-thin" cx="286" cy="150" r="96"/>');
  o.push('<path class="bd-thin" d="M306 8V470M40 110H396"/>');
  o.push(star(306, 110, 20));
  o.push(star(86, 392, 9, 'bd-star bd-thin'));
  for (const [x, y] of [[200, 58], [392, 250], [64, 114], [306, 244], [130, 110], [354, 362]]) o.push(`<circle class="bd-dot" cx="${x}" cy="${y}" r="1.6"/>`);
  o.push(sign(350, 300, [2, 0, 3, 1], 2, 10));
  return `<svg class="boot-halo" viewBox="0 0 400 480" aria-hidden="true">${o.join('')}</svg>`;
}

/** Replaces the body of every `<!-- loading-art:<name> -->…<!-- /loading-art:<name> -->` block. */
export function inject(html, blocks = { diagram: diagram(), halo: halo() }) {
  for (const [name, svg] of Object.entries(blocks)) {
    const re = new RegExp(`(<!-- loading-art:${name} -->)[\\s\\S]*?(<!-- /loading-art:${name} -->)`);
    if (!re.test(html)) throw new Error(`index.html has no loading-art:${name} block`);
    html = html.replace(re, (_, a, b) => `${a}\n      ${svg}\n      ${b}`);
  }
  return html;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const before = readFileSync(INDEX, 'utf8'), after = inject(before);
  if (process.argv.includes('--check')) { if (before !== after) { console.error('game/index.html: loading art is out of date; run node art/ui/loading/build_diagram.mjs'); process.exit(1); } }
  else { writeFileSync(INDEX, after); console.log('loading art written', after.length - before.length, 'bytes changed'); }
}
