// The shrinekeeper's animated guide (owner, 11.11): one small looping SVG per guide page, so the talk shows what it
// says. Page 1: a sign draws itself. 2: the four strokes light up in reading order from the dot. 3: a stake of silk
// flies to a Shell and the seal checks the reveal. 4: a memory card dissolves into a shard. 5: the path to the altar.
// CSS animations only; reduced motion shows the last frame still.

const CSS = `
.ftf-guide-anim { display: block; width: 100%; max-width: 260px; height: 120px; margin: 4px auto 8px; overflow: visible; }
.ftf-guide-anim * { vector-effect: non-scaling-stroke; }
.ga-ring { fill: none; stroke: rgba(243, 234, 214, .55); stroke-width: 1.6; }
.ga-stroke { fill: none; stroke: #e9b44c; stroke-width: 3; stroke-linecap: round; stroke-dasharray: 40; stroke-dashoffset: 40; animation: ga-draw 3.2s ease-in-out infinite; }
.ga-stroke.s2 { animation-delay: .35s; } .ga-stroke.s3 { animation-delay: .7s; } .ga-stroke.s4 { animation-delay: 1.05s; }
.ga-dot { fill: #f3ead6; }
.ga-num { fill: rgba(243, 234, 214, .35); font: 700 11px system-ui, sans-serif; text-anchor: middle; dominant-baseline: middle; animation: ga-lit 4s steps(1) infinite; }
.ga-num.n2 { animation-delay: 1s; } .ga-num.n3 { animation-delay: 2s; } .ga-num.n4 { animation-delay: 3s; }
.ga-coin { fill: #e9b44c; animation: ga-fly 3s ease-in-out infinite; }
.ga-shell { fill: none; stroke: rgba(243, 234, 214, .7); stroke-width: 1.6; }
.ga-check { fill: none; stroke: #7fd18b; stroke-width: 3.5; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 30; stroke-dashoffset: 30; animation: ga-check 3s ease-in-out infinite; }
.ga-card { fill: #3a2f5a; stroke: #e9b44c; stroke-width: 1.4; animation: ga-fade 3.4s ease-in-out infinite; }
.ga-shard { fill: #9fd8ff; animation: ga-shard 3.4s ease-in-out infinite; }
.ga-path { fill: none; stroke: #e9b44c; stroke-width: 2.4; stroke-dasharray: 6 6; animation: ga-march 1.2s linear infinite; }
.ga-altar { fill: none; stroke: rgba(243, 234, 214, .75); stroke-width: 1.6; }
.ga-glow { fill: #e9b44c; animation: ga-pulse 1.6s ease-in-out infinite; transform-origin: 200px 60px; }
@keyframes ga-draw { 0% { stroke-dashoffset: 40; } 45%, 85% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: 40; } }
@keyframes ga-lit { 0% { fill: #e9b44c; } 25% { fill: rgba(243, 234, 214, .35); } }
@keyframes ga-fly { 0% { transform: translate(0, 0); opacity: 0; } 15% { opacity: 1; } 55%, 100% { transform: translate(100px, -10px); opacity: 0; } }
@keyframes ga-check { 0%, 55% { stroke-dashoffset: 30; } 75%, 100% { stroke-dashoffset: 0; } }
@keyframes ga-fade { 0%, 30% { opacity: 1; } 60%, 100% { opacity: 0; } }
@keyframes ga-shard { 0%, 35% { opacity: 0; transform: translate(0, 0) rotate(0deg); } 70%, 100% { opacity: 1; transform: translate(40px, -6px) rotate(25deg); } }
@keyframes ga-march { to { stroke-dashoffset: -12; } }
@keyframes ga-pulse { 0%, 100% { transform: scale(.85); opacity: .6; } 50% { transform: scale(1.15); opacity: 1; } }
html[data-motion="reduce"] .ftf-guide-anim * { animation: none !important; stroke-dashoffset: 0 !important; opacity: 1 !important; }
@media (prefers-reduced-motion: reduce) { .ftf-guide-anim * { animation: none !important; stroke-dashoffset: 0 !important; opacity: 1 !important; } }
`;

/** A sign: a ring, a dot in the core, four strokes at the top, right, bottom and left. */
const ring = (cx, cy, numbers = false) => `<circle class="ga-ring" cx="${cx}" cy="${cy}" r="34"/><circle class="ga-dot" cx="${cx}" cy="${cy}" r="3.5"/>`
  + `<path class="ga-stroke" d="M${cx - 9} ${cy - 40} Q${cx} ${cy - 50} ${cx + 9} ${cy - 40}"/>`
  + `<path class="ga-stroke s2" d="M${cx + 40} ${cy - 8} L${cx + 50} ${cy} L${cx + 40} ${cy + 8}"/>`
  + `<circle class="ga-stroke s3" cx="${cx}" cy="${cy + 44}" r="5"/>`
  + `<path class="ga-stroke s4" d="M${cx - 50} ${cy} C${cx - 44} ${cy - 6} ${cx - 42} ${cy + 6} ${cx - 40} ${cy}"/>`
  + (numbers ? `<text class="ga-num" x="${cx}" y="${cy - 20}">1</text><text class="ga-num n2" x="${cx + 20}" y="${cy}">2</text><text class="ga-num n3" x="${cx}" y="${cy + 22}">3</text><text class="ga-num n4" x="${cx - 20}" y="${cy}">4</text>` : '');

const PAGES = [
  () => ring(200, 60),
  () => ring(200, 60, true),
  () => `<circle class="ga-coin" cx="90" cy="70" r="9"/><text x="90" y="74" text-anchor="middle" font="700 9px system-ui" fill="#1d1708" style="font:700 9px system-ui">10</text>`
    + `<path class="ga-shell" d="M196 24 C214 40 216 80 200 98 C186 80 184 40 196 24 Z"/><path class="ga-shell" d="M190 50 Q200 56 208 48M188 66 Q200 72 210 64M190 82 Q200 88 208 80"/>`
    + `<path class="ga-check" d="M232 62 L242 72 L262 48"/>`,
  () => `<rect class="ga-card" x="150" y="30" width="44" height="60" rx="6"/><path class="ga-shard" d="M196 48 L210 40 L218 60 L204 74 Z"/>`,
  () => `<path class="ga-path" d="M60 100 C110 100 120 60 180 60"/><path class="ga-altar" d="M184 82 H216 M190 82 V50 H210 V82 M186 50 H214"/><circle class="ga-glow" cx="200" cy="60" r="6"/>`,
];

/** The animated picture for guide page `n` (1-based), or null. */
export function guideAnim(doc, n) {
  const make = PAGES[n - 1];
  if (!make) return null;
  if (!doc.getElementById('ftf-guide-anim-style')) { const st = doc.createElement('style'); st.id = 'ftf-guide-anim-style'; st.textContent = CSS; doc.head.append(st); }
  const wrap = doc.createElement('div');
  wrap.innerHTML = `<svg class="ftf-guide-anim" viewBox="0 0 400 120" role="img" aria-hidden="true">${make()}</svg>`;
  return wrap.firstChild;
}
export const GUIDE_ANIM_PAGES = PAGES.length;
