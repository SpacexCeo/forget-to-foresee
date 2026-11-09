// Motion-graphics scenes of the jury video (docs/submission/jury-video.md). Every frame is a pure function of t:
// render(t) sets each element's opacity/transform/attributes from t alone, so a frame never depends on the one before
// and two renders are identical (no flicker by construction). The page also runs on the cinematic virtual clock, so a
// stray timer or CSS transition cannot follow the wall clock either. All data comes from jury-data.json
// (tools/capture/jury-data.mjs: the engine, the testnet deployment record, the shard contract's own SVG).
import { installVirtualClock } from '../src/cinematic/clock.js';
import { ease, MOTION } from '../src/ui/motion/index.js';
import { drawLogogram } from '../src/play/logogram.js';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/libre-caslon-text/400.css';
import '@fontsource/libre-caslon-text/700.css';
import D from './jury-data.json';

const Q = new URLSearchParams(location.search);
const W = Number(Q.get('w') || innerWidth), H = Number(Q.get('h') || innerHeight);
const FPS = Number(Q.get('fps') || 60);
const ALPHA = Q.get('alpha') === '1';
const clock = installVirtualClock(window, { fps: FPS, seed: 7 });
if (ALPHA) document.documentElement.classList.add('alpha');

const stage = document.getElementById('stage');
stage.style.transform = `scale(${W / 1920}, ${H / 1080})`;

/* ---------- time helpers (motion tokens) ---------- */
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const P = (t, a, d) => clamp((t - a) / d);
const IN = MOTION.duration.slow / 1000, OUT = MOTION.duration.base / 1000, RISE = MOTION.distance.rise;
const lerp = (a, b, k) => a + (b - a) * k;
/** Visible between a and b with the token enter (ease.out, rise) and exit (ease.in). Returns the alpha. */
function show(el, t, a, b = 1e9, { rise = RISE, din = IN, dout = OUT, scale = null, base = '' } = {}) {
  const i = ease.out(P(t, a, din)), o = 1 - ease.in(P(t, b - dout, dout));
  const al = Math.min(i, o);
  el.style.opacity = al.toFixed(4);
  const s = scale ? lerp(scale, 1, ease.emphasized(P(t, a, din * 1.5))) : 1;
  el.style.transform = `${base} translateY(${((1 - i) * rise).toFixed(2)}px)${s !== 1 ? ` scale(${s.toFixed(4)})` : ''}`;
  el.style.visibility = al <= 0.001 ? 'hidden' : 'visible';
  return al;
}
/** The "settle" spring of the seal, sampled analytically (one visible overshoot). */
function settle(k) { k = clamp(k); return 1 - Math.exp(-6 * k) * Math.cos(9 * k); }

/* ---------- DOM helpers ---------- */
const SVGNS = 'http://www.w3.org/2000/svg';
function h(tag, attrs = {}, ...kids) {
  const svg = ['svg', 'g', 'path', 'line', 'circle', 'rect', 'polygon', 'text', 'defs', 'radialGradient', 'linearGradient', 'stop', 'filter', 'feGaussianBlur'].includes(tag);
  const el = svg ? document.createElementNS(SVGNS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c);
  return el;
}
const at = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; return el; };
const cap = (text) => stage.appendChild(h('div', { class: 'cap', html: text }));

/* ---------- background: deep ink with slow nacre mist (deterministic in t) ---------- */
const bg = document.getElementById('bg'), bgx = bg.getContext('2d');
function drawBg(t, { tint = [232, 190, 110], heat = 0 } = {}) {
  if (ALPHA) { bgx.clearRect(0, 0, 960, 540); return; }
  const g = bgx.createRadialGradient(480, 250, 40, 480, 270, 620);
  g.addColorStop(0, '#13262a'); g.addColorStop(0.55, '#0b171a'); g.addColorStop(1, '#050b0d');
  bgx.fillStyle = g; bgx.fillRect(0, 0, 960, 540);
  const blobs = [[0.22, 0.30, 260, 0.11], [0.78, 0.66, 300, 0.09], [0.55, 0.18, 220, 0.07]];
  blobs.forEach(([x, y, r, a], i) => {
    const cx = 960 * x + Math.sin(t * 0.21 + i * 2.1) * 40, cy = 540 * y + Math.cos(t * 0.17 + i) * 26;
    const c = heat > 0 && i === 1 ? [lerp(tint[0], 255, heat), lerp(tint[1], 90, heat), lerp(tint[2], 70, heat)] : tint;
    const rg = bgx.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a + heat * 0.08})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    bgx.fillStyle = rg; bgx.fillRect(0, 0, 960, 540);
  });
}

/* ---------- shared pieces ---------- */
const CLANS = [
  { id: 'iris', name: 'Iris', color: '#a58be0', temper: 'You' },
  { id: 'salt', name: 'Salt', color: '#e4e6e2', temper: 'Cunning' },
  { id: 'ash', name: 'Ash', color: '#a9a29a', temper: 'Wary' },
  { id: 'moss', name: 'Moss', color: '#8fb46f', temper: 'Honest' },
  { id: 'amber', name: 'Amber', color: '#e2a94a', temper: 'Greedy' },
  { id: 'frost', name: 'Frost', color: '#9fc4d6', temper: 'Scholar' },
];
// Two rows of three, Iris top centre.
const SEAT = { salt: [430, 360], iris: [960, 330], frost: [1490, 360], ash: [430, 760], moss: [960, 790], amber: [1490, 760] };
function clanCards(parent, { compact = false } = {}) {
  const cards = {};
  for (const c of CLANS) {
    const [x, y] = SEAT[c.id];
    const el = h('div', { class: 'card', style: { width: '460px', height: compact ? '128px' : '200px', borderColor: c.color + 'aa', background: 'rgba(8,18,21,.94)' } },
      h('div', { class: 'abs', style: { left: '28px', top: '18px', font: '700 64px/1 var(--title)', color: c.color }, text: c.name }),
      h('div', { class: 'abs', style: { right: '28px', top: '34px', font: '600 44px/1 var(--label)', color: 'var(--ink-dim)' }, text: c.temper }),
      compact ? null : h('div', { class: 'abs', style: { left: '30px', top: '118px', font: '400 46px/1 var(--body)' }, html: 'silk <b style="color:var(--gold)">60</b> · memory' }));
    at(el, x - 230, y - (compact ? 64 : 100));
    parent.append(el); cards[c.id] = el;
  }
  return cards;
}
function edgeLayer(parent) { const s = h('svg', { width: 1920, height: 1080, class: 'abs', style: { left: 0, top: 0 } }); parent.append(s); return s; }
function edge(svg, a, b, { color = 'rgba(232,214,172,.35)', width = 4, dash = null } = {}) {
  const [x1, y1] = SEAT[a], [x2, y2] = SEAT[b];
  const l = h('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': width, 'stroke-linecap': 'round' });
  if (dash) l.setAttribute('stroke-dasharray', dash);
  svg.prepend(l); return l;
}
/** A glowing packet moving along a path element (getPointAtLength is deterministic). */
function packet(svg, color = '#ffe78e', r = 11) {
  const g = h('g', {}, h('circle', { r: r * 2.4, fill: color, opacity: 0.18 }), h('circle', { r, fill: color }));
  svg.append(g); return g;
}
function moveOn(g, path, k) {
  if (k <= 0 || k >= 1) { g.style.opacity = 0; return; }
  const L = path.getTotalLength(), p = path.getPointAtLength(L * k);
  g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
  g.style.opacity = Math.min(1, k * 8, (1 - k) * 8).toFixed(3);
}
function signCanvas(sign, px, opts = {}) {
  const c = h('canvas', { width: px, height: px, style: { width: px + 'px', height: px + 'px' } });
  c.draw = (o) => drawLogogram(c.getContext('2d'), sign, { size: px, ...opts, ...o });
  return c;
}
const short = (s, a = 8, b = 5) => `${s.slice(0, a)}…${s.slice(-b)}`;

/* ---------- scenes ---------- */
const SCENES = {};

// 4 · Read the sign slot by slot, then ask the Guests (6.0 s).
SCENES.decode = { duration: 6.0, build() {
  const c1 = cap('Read it slot by slot'), c2 = cap('Ask the Guests: <em>yes</em> or <em>no</em>');
  const sz = 760, cx = 600, cy = 590;
  const cv = signCanvas(D.sign, sz); at(cv, cx - sz / 2, cy - sz / 2); cv.classList.add('abs'); stage.append(cv);
  const lines = edgeLayer(stage);
  const rows = D.sign.slots.map((s, k) => {
    const y = 300 + k * 168;
    const el = h('div', { class: 'abs', style: { left: '1110px', top: y + 'px' } }, h('div', { class: 'label', text: s.slot }), h('div', { class: 'value', style: { marginTop: '8px' }, text: s.value }));
    stage.append(el);
    // After the turn, slot k sits at k·90° clockwise from the top of the ring.
    const R = sz * 0.3 * 1.18, th = (k * Math.PI) / 2;
    const sx = cx + R * Math.sin(th), sy = cy - R * Math.cos(th);
    const ln = h('path', { d: `M${sx.toFixed(1)},${sy.toFixed(1)} C${(sx + 220).toFixed(1)},${sy.toFixed(1)} ${960},${y + 66} 1090,${y + 66}`, fill: 'none', stroke: 'rgba(246,197,114,.75)', 'stroke-width': 3 });
    lines.append(ln);
    return { el, ln, len: 0 };
  });
  const ask = h('div', { class: 'chip', text: 'Gift?' }); at(ask, cx + 250, cy - 330); stage.append(ask);
  const yes = h('div', { class: 'chip ok', text: 'Yes ✓' }); at(yes, cx + 250, cy - 230); stage.append(yes);
  return (t) => {
    drawBg(t);
    show(c1, t, 0.2, 3.5); show(c2, t, 3.7, 5.95);
    const draw = ease.inOut(P(t, 0, 1.3));
    const slotT = (k) => 1.2 + k * 0.55;
    let hl = null;
    rows.forEach((r, k) => { if (t >= slotT(k) && t < slotT(k) + 0.55) hl = (D.sign.dots + k) % 4; });
    if (t >= 4.1) hl = (D.sign.dots + 1) % 4; // the asked stroke: the Action slot
    cv.draw({ progress: draw, turn: true, highlight: hl, time: t });
    rows.forEach((r, k) => {
      const dim = t > 3.6 ? lerp(1, k === 1 ? 1 : 0.35, ease.out(P(t, 3.6, 0.4))) : 1;
      const a = show(r.el, t, slotT(k) + 0.1, 99);
      r.el.style.opacity = (a * dim).toFixed(3);
      if (!r.len) r.len = r.ln.getTotalLength();
      const k1 = ease.out(P(t, slotT(k), 0.45));
      r.ln.setAttribute('stroke-dasharray', `${r.len}`); r.ln.setAttribute('stroke-dashoffset', `${(r.len * (1 - k1)).toFixed(1)}`);
      // one connector at a time: it draws while its slot lights, then settles to a faint trace
      const live = 1 - 0.85 * ease.inOut(P(t, slotT(k) + 0.6, 0.3));
      r.ln.style.opacity = (0.9 * live * (t > 4.0 && k === 1 ? 6 : 1)).toFixed(3);
    });
    show(ask, t, 4.0, 99, { scale: 0.9 });
    const s = settle(P(t, 4.6, 0.7));
    yes.style.opacity = t < 4.6 ? 0 : 1; yes.style.transform = `scale(${lerp(MOTION.scale.sealFrom, 1, s).toFixed(4)})`;
  };
} };

// 6 · The memory becomes a shard: two future signs seen first, the shard to auction (3.0 s).
SCENES.shard = { duration: 3.0, build() {
  const c1 = cap('…to see the future <em>first</em>');
  const card = h('div', { class: 'card', style: { width: '720px', height: '170px', borderColor: '#a58be0' } },
    h('div', { class: 'abs label', style: { left: '34px', top: '26px', color: '#c4b2f0' }, text: 'Iris · memory' }),
    h('div', { class: 'abs', style: { left: '34px', top: '84px', font: '400 60px/1 var(--title)' }, text: 'A Call · weight 2' }));
  at(card, 600, 300); stage.append(card);
  const shard = h('div', { class: 'abs', html: D.shard.svg, style: { width: '320px', height: '320px', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 0 60px rgba(127,179,213,.35)' } });
  at(shard, 800, 520); stage.append(shard);
  const vis = D.visions.map((v, i) => { const c = signCanvas(v, 300); c.classList.add('abs'); at(c, 170 + i * 280, 520); stage.append(c); return c; });
  const lv = h('div', { class: 'abs label', text: '2 future signs' }); at(lv, 210, 860); stage.append(lv);
  const la = h('div', { class: 'abs label', style: { color: 'var(--chip)' }, text: 'Auction ›' }); at(la, 1600, 640); stage.append(la);
  return (t) => {
    drawBg(t, { tint: [165, 139, 224] });
    show(c1, t, 0.2, 2.95);
    const crack = ease.in(P(t, 0.55, 0.35));
    card.style.opacity = (1 - crack).toFixed(3); card.style.transform = `scale(${lerp(1, 1.06, crack).toFixed(4)})`; card.style.filter = `blur(${(crack * 6).toFixed(2)}px)`;
    const s = settle(P(t, 0.75, 0.9));
    shard.style.opacity = t < 0.75 ? 0 : 1;
    const fly = ease.inOut(P(t, 1.6, 0.9));
    shard.style.transform = `translate(${(fly * 420).toFixed(1)}px, ${(-fly * 20).toFixed(1)}px) scale(${lerp(0.4, 1, s).toFixed(4)}) rotate(${(fly * 8).toFixed(2)}deg)`;
    vis.forEach((c, i) => { const a = show(c, t, 1.0 + i * 0.25, 99, { scale: 0.85 }); c.draw({ progress: ease.out(P(t, 1.0 + i * 0.25, 0.8)), glow: 'rgba(196, 178, 240, 0.9)', time: t }); void a; });
    show(lv, t, 1.4); show(la, t, 2.1);
  };
} };

// 8 · Six clan agents: silk, a memory, a temper; bids, pacts and a lie (4.5 s).
SCENES.agents = { duration: 4.5, build() {
  const c1 = cap('Silk, a memory, a temper'), c2 = cap('They trade… and break <em>trust</em>');
  const svg = edgeLayer(stage);
  const cards = clanCards(stage);
  const e1 = edge(svg, 'frost', 'iris', { color: 'rgba(255,231,142,.9)', width: 6 });
  const e2 = edge(svg, 'ash', 'iris', { color: 'rgba(159,220,140,.9)', width: 6 });
  const e3 = edge(svg, 'salt', 'iris', { color: 'rgba(255,122,102,.95)', width: 6, dash: '18 16' });
  const p1 = packet(svg), p2 = packet(svg, '#9fdc8c'), p3 = packet(svg, '#ff7a66');
  const ch1 = h('div', { class: 'chip gold', text: 'Frost bids 13 silk' }); at(ch1, 1140, 470);
  const ch2 = h('div', { class: 'chip ok', text: 'Ash: pact ✓' }); at(ch2, 500, 560);
  const ch3 = h('div', { class: 'chip bad', text: 'Salt sold a lie ✗' }); at(ch3, 470, 170);
  stage.append(ch1, ch2, ch3);
  const pathOf = (a, b) => { const [x1, y1] = SEAT[a], [x2, y2] = SEAT[b]; const p = h('path', { d: `M${x1},${y1} L${x2},${y2}`, fill: 'none' }); svg.append(p); return p; };
  const q1 = pathOf('frost', 'iris'), q2 = pathOf('ash', 'iris'), q3 = pathOf('salt', 'iris');
  return (t) => {
    drawBg(t);
    show(c1, t, 0.2, 2.2); show(c2, t, 2.35, 4.45);
    CLANS.forEach((c, i) => show(cards[c.id], t, 0.1 + i * 0.07, 99, { scale: 0.96 }));
    e1.style.opacity = ease.out(P(t, 1.0, 0.3)); moveOn(p1, q1, P(t, 1.0, 0.7)); show(ch1, t, 1.25, 99, { scale: 0.92 });
    e2.style.opacity = ease.out(P(t, 2.0, 0.3)); moveOn(p2, q2, P(t, 2.0, 0.7)); show(ch2, t, 2.25, 99, { scale: 0.92 });
    e3.style.opacity = ease.out(P(t, 3.0, 0.3)); moveOn(p3, q3, P(t, 3.0, 0.7)); show(ch3, t, 3.25, 99, { scale: 0.92 });
    e3.setAttribute('stroke-dashoffset', (t * 60).toFixed(1));
  };
} };

// 9 · Split screen: the browser (an in-engine shot composited into the hole) and an AI agent over the HTTP API (5.0 s).
const TERM = [
  ['$ node examples/agent.mjs', 'cmd'],
  ['session s-1a4b6a05… (rules v3)', ''],
  ['tick 1: contribute fragment', ''],
  ['tick 2: anchor Shell 1 @ tick 3', ''],
  ['tick 4: anchor Shell 4 @ tick 5', ''],
  ['vote: accept', ''],
  ['"outcome": "survived"', 'json'],
  ['"rejected": 0', 'json'],
  ['"firstProofVerified": true', 'ok'],
];
SCENES.api = { duration: 5.0, build() {
  const c1 = cap('Humans and agents. <em>Same rules.</em>'), c2 = cap('Open HTTP API · OpenAPI 3.1');
  const BX = 60, BY = 300, BW = 880, BH = 495;
  // The hole for the browser footage (transparent when rendered with alpha), framed like a window.
  const frame = h('div', { class: 'abs', style: { left: BX - 4 + 'px', top: BY - 4 + 'px', width: BW + 'px', height: BH + 'px', border: '4px solid var(--frame)', borderRadius: '10px' } });
  const l1 = h('div', { class: 'abs label', text: 'You · in the browser' }); at(l1, BX, BY - 70);
  const term = h('div', { class: 'card', style: { left: '980px', top: BY + 'px', width: '880px', height: '600px', background: 'rgba(4,10,12,.94)', borderColor: 'rgba(159,196,214,.6)', borderRadius: '10px' } });
  const l2 = h('div', { class: 'abs label', style: { color: '#9fc4d6' }, text: 'AI agent · HTTP API' }); at(l2, 980, BY - 70);
  const rows = TERM.map(([s, k], i) => { const r = h('div', { class: 'abs mono', style: { left: '30px', top: 26 + i * 62 + 'px', font: '400 42px/1.2 var(--mono)', color: k === 'cmd' ? '#ffe78e' : k === 'ok' ? '#9fdc8c' : k === 'json' ? '#cfe3ec' : 'var(--ink)', whiteSpace: 'pre' } }); r.full = s; term.append(r); return r; });
  const foot = h('div', { class: 'abs', style: { font: '400 44px/1 var(--body)', color: 'var(--ink-dim)' }, text: 'replay of a real run' }); at(foot, 1000, BY + 620);
  stage.append(frame, l1, term, l2, foot);
  // In alpha mode the area outside the hole needs its own background (the page background is transparent).
  const shade = h('div', { class: 'abs', style: { inset: 0, zIndex: -1, background: 'transparent' } });
  if (ALPHA) { shade.style.background = 'rgba(7,16,19,1)'; shade.style.clipPath = `polygon(0 0, 1920px 0, 1920px 1080px, 0 1080px, 0 0, ${BX}px ${BY}px, ${BX}px ${BY + BH}px, ${BX + BW}px ${BY + BH}px, ${BX + BW}px ${BY}px, ${BX}px ${BY}px)`; shade.style.clipRule = 'evenodd'; }
  stage.prepend(shade);
  return (t) => {
    drawBg(t, { tint: [159, 196, 214] });
    show(c1, t, 0.2, 2.5); show(c2, t, 2.7, 4.95);
    show(frame, t, 0.0, 99, { rise: 0 }); show(l1, t, 0.15); show(term, t, 0.1, 99, { rise: 0 }); show(l2, t, 0.25); show(foot, t, 0.6);
    // Typed at reading speed: the command letter by letter, then one output line every 0.42 s.
    rows.forEach((r, i) => {
      let n = 0;
      if (i === 0) n = Math.floor(clamp((t - 0.35) / 0.9) * r.full.length);
      else { const ti = 1.35 + (i - 1) * 0.42; n = t >= ti ? r.full.length : 0; }
      r.textContent = r.full.slice(0, n) + (i === 0 && n < r.full.length && Math.floor(t * 2) % 2 === 0 ? '▌' : '');
    });
  };
} };

// 10 · The season: 17 trials, a ✓ on every reveal, the tension meter (4.0 s).
SCENES.season = { duration: 4.0, build() {
  const c1 = cap('17 trials. Every reveal checked <em>✓</em>'), c2 = cap('Tension rises');
  const svg = edgeLayer(stage);
  const X0 = 170, X1 = 1750, Y = 480, step = (X1 - X0) / 16;
  svg.append(h('line', { x1: X0, y1: Y, x2: X1, y2: Y, stroke: 'rgba(232,214,172,.3)', 'stroke-width': 4 }));
  const prog = h('line', { x1: X0, y1: Y, x2: X0, y2: Y, stroke: '#f6c572', 'stroke-width': 6 }); svg.append(prog);
  const nodes = Array.from({ length: 17 }, (_, i) => {
    const x = X0 + i * step, n = i + 1, special = n === 13 ? '#ff7a66' : n === 17 ? '#ffe78e' : null;
    const c = h('circle', { cx: x, cy: Y, r: special ? 26 : 18, fill: '#0e1b1f', stroke: special || 'rgba(232,214,172,.6)', 'stroke-width': 4 });
    const num = h('text', { x, y: Y + 82, 'text-anchor': 'middle', fill: 'var(--ink)', style: 'font: 600 44px var(--label)' }); num.textContent = n;
    const ck = h('text', { x, y: Y - 44, 'text-anchor': 'middle', fill: '#9fdc8c', style: 'font: 700 44px var(--body)' }); ck.textContent = n >= 3 ? '✓' : '';
    svg.append(c, num, ck); return { c, ck, x, n, special };
  });
  const cr = h('div', { class: 'abs label', style: { color: '#ff7a66' }, text: 'Crisis' }); at(cr, X0 + 12 * step - 80, Y - 150);
  const vt = h('div', { class: 'abs label', style: { color: '#ffe78e' }, text: 'Vote' }); at(vt, X0 + 16 * step - 90, Y - 150);
  const tl = h('div', { class: 'abs label', style: { color: 'var(--ink-dim)' }, text: 'Tension' }); at(tl, X0, 700);
  const bar = h('div', { class: 'abs', style: { left: X0 + 'px', top: '770px', width: X1 - X0 + 'px', height: '34px', borderRadius: '17px', background: 'rgba(70,68,58,.7)', overflow: 'hidden' } });
  const fill = h('div', { style: { height: '100%', width: '0%', background: 'linear-gradient(90deg, #cf9846, #f6c572 55%, #ff7a66)' } }); bar.append(fill);
  stage.append(cr, vt, tl, bar);
  // A tension curve shaped like the game's: slow rise, the trial-13 spike, a slight ease before the vote.
  const tension = (x) => x < 12 / 16 ? 0.12 + 0.45 * (x / (12 / 16)) : x < 13 / 16 ? 0.57 + 0.33 * ((x - 12 / 16) * 16) : 0.9 - 0.06 * ((x - 13 / 16) / (3 / 16));
  return (t) => {
    const k = ease.inOut(P(t, 0.25, 3.2));
    drawBg(t, { heat: clamp((k - 0.7) * 3) * 0.8 });
    show(c1, t, 0.2, 2.25); show(c2, t, 2.4, 3.95);
    prog.setAttribute('x2', (X0 + (X1 - X0) * k).toFixed(1));
    nodes.forEach((o, i) => {
      const reached = k * 16 >= i - 1e-6, kk = P(k * 16, i, 0.6);
      o.c.setAttribute('fill', reached ? (o.special || '#f6c572') : '#0e1b1f');
      o.c.setAttribute('r', ((o.special ? 26 : 18) * (1 + 0.35 * Math.sin(Math.PI * clamp(kk)))).toFixed(2));
      o.ck.style.opacity = reached ? ease.out(kk).toFixed(3) : 0;
    });
    show(cr, t, 0.25 + 3.2 * 0.72); show(vt, t, 0.25 + 3.2 * 0.97);
    show(tl, t, 0.3);
    fill.style.width = (100 * tension(k) * ease.out(P(t, 0.2, 0.4))).toFixed(2) + '%';
  };
} };

// 12 · Trial 13: Ash turns away; Ash's Key, checked against Ash's commitment, brings the links back (3.5 s).
SCENES.ash = { duration: 3.5, build() {
  const c1 = cap('Ash turns away'), c2 = cap('Ash’s Key <em>restores them</em>');
  const svg = edgeLayer(stage);
  const cards = clanCards(stage, { compact: true });
  const links = ['iris', 'salt', 'moss'].map((o) => edge(svg, 'ash', o, { color: '#ffe78e', width: 6 }));
  const tag = h('div', { class: 'chip bad', text: 'Isolated' }); at(tag, 300, 880);
  const key = h('div', { class: 'chip gold', text: '🗝 hash = commitment ✓' }); at(key, 560, 520);
  stage.append(tag, key);
  const kp = packet(svg, '#ffe78e', 14); const path = h('path', { d: `M${SEAT.iris[0]},${SEAT.iris[1]} L${SEAT.ash[0]},${SEAT.ash[1]}`, fill: 'none' }); svg.append(path);
  return (t) => {
    const broken = t >= 0.45 && t < 2.1;
    drawBg(t, { heat: broken ? 0.7 : 0.15 });
    show(c1, t, 0.12, 1.75); show(c2, t, 1.9, 3.45);
    CLANS.forEach((c) => { cards[c.id].style.opacity = 1; cards[c.id].style.visibility = 'visible'; });
    cards.ash.style.filter = broken ? 'grayscale(1) brightness(.55)' : 'none';
    const snap = ease.out(P(t, 0.45, 0.3)), heal = ease.out(P(t, 2.1, 0.5));
    links.forEach((l, i) => {
      if (t < 0.45) { l.setAttribute('stroke', 'rgba(232,214,172,.5)'); l.removeAttribute('stroke-dasharray'); l.style.opacity = 1; }
      else if (t < 2.1) { l.setAttribute('stroke', '#ff7a66'); l.setAttribute('stroke-dasharray', `${40 + i * 6} ${lerp(0, 60, snap).toFixed(1)}`); l.style.opacity = (1 - 0.6 * snap).toFixed(3); }
      else { l.setAttribute('stroke', '#ffe78e'); l.removeAttribute('stroke-dasharray'); l.style.opacity = heal.toFixed(3); }
    });
    show(tag, t, 0.55, 2.1, { scale: 0.9 });
    moveOn(kp, path, P(t, 1.5, 0.6));
    show(key, t, 1.95, 99, { scale: 0.9 });
  };
} };

// 14 · How rewards are shared (6.0 s): the stake split, then the four vote outcomes.
SCENES.rewards = { duration: 6.0, build() {
  const R = D.rules;
  const c1 = cap('Stake early, <em>bigger share</em>'), c2 = cap('Then the vote pays out');
  const pot = h('div', { class: 'card', style: { width: '500px', height: '150px', borderColor: '#ffe78e' } },
    h('div', { class: 'abs label', style: { left: '30px', top: '22px' }, text: 'Gift · power 20' }),
    h('div', { class: 'abs value', style: { left: '30px', top: '68px', fontSize: '64px' }, text: `pot ${R.pot[1]}` }));
  at(pot, 140, 250);
  const bar = (label, share, y, w) => {
    const row = h('div', { class: 'abs', style: { left: '720px', top: y + 'px', width: '820px' } },
      h('div', { class: 'body', style: { fontSize: '46px' }, text: label }),
      h('div', { class: 'abs', style: { left: 0, top: '62px', height: '26px', width: w + 'px', borderRadius: '13px', background: 'linear-gradient(90deg,#cf9846,#f6c572)', transformOrigin: '0 50%' } }),
      h('div', { class: 'abs', style: { left: w + 24 + 'px', top: '40px', font: '700 60px/1 var(--title)', color: 'var(--gold)' }, text: '+' + share }));
    stage.append(row); return row;
  };
  const b1 = bar('Staked at trial 1', R.split[0], 230, 480), b2 = bar('Staked at trial 2', R.split[1], 360, 320);
  const storm = h('div', { class: 'chip bad', text: 'Storm: stake burns' }); at(storm, 140, 470);
  const calm = h('div', { class: 'chip', text: 'Silence · Call: stake back' }); at(calm, 760, 470);
  const tiles = [
    ['Gift', `+${R.finaleGift}`, 'each contributor', '#9fdc8c'],
    ['Weapon', '0', 'everyone’s silk', '#ff7a66'],
    ['Survived', `+${R.finaleSurvived}`, 'each contributor', '#ffe78e'],
    ['Lost', '—', 'nothing paid', 'rgba(232,214,172,.8)'],
  ].map(([n, v, s, col], i) => {
    const el = h('div', { class: 'card', style: { width: '400px', height: '300px', borderColor: col } },
      h('div', { class: 'abs label', style: { left: '30px', top: '26px', color: col }, text: n }),
      h('div', { class: 'abs', style: { left: '28px', top: '86px', font: '700 104px/1 var(--title)', color: col }, text: v }),
      h('div', { class: 'abs', style: { left: '30px', top: '220px', font: '400 44px/1 var(--body)' }, text: s }));
    at(el, 120 + i * 440, 620); stage.append(el); return el;
  });
  stage.append(pot, storm, calm);
  return (t) => {
    drawBg(t);
    show(c1, t, 0.2, 2.75); show(c2, t, 2.95, 5.95);
    const up = 2.8, fadeTop = 1 - ease.inOut(P(t, up, 0.4));
    [pot, b1, b2, storm, calm].forEach((el, i) => { const a = show(el, t, [0.2, 0.55, 0.75, 1.5, 1.8][i]); el.style.opacity = (a * lerp(1, 0.32, 1 - fadeTop)).toFixed(3); });
    [b1, b2].forEach((b, i) => { const g = b.children[1]; g.style.transform = `scaleX(${ease.out(P(t, 0.65 + i * 0.2, 0.6)).toFixed(4)})`; });
    tiles.forEach((el, i) => show(el, t, up + 0.15 + i * 0.18, 99, { scale: 0.94 }));
  };
} };

// 15 · The shard as a NEP-171 token, drawn from the real mint data and the contract's own SVG (4.0 s).
SCENES.nft = { duration: 4.0, build() {
  const S = D.shard;
  const c1 = cap('The memory becomes an <em>NFT</em>'), c2 = cap('Minted on NEAR testnet');
  const art = h('div', { class: 'abs', html: S.svg.replace('width="320" height="320"', 'width="560" height="560"'), style: { width: '560px', height: '560px', borderRadius: '28px', overflow: 'hidden', boxShadow: '0 0 90px rgba(127,179,213,.35)' } });
  at(art, 140, 250);
  const fields = [
    ['Token', S.tokenId], ['Memory', 'Iris · Call · weight 2'], ['Forgotten', `trial ${S.forgotten_at_tick}`],
    ['Auction', `Frost · ${S.price} silk`], ['Opened', `sign #${S.unlocked_index + 1} · leaf ${S.unlocked_leaf.slice(0, 8)}…`],
  ].map(([k, v], i) => {
    const el = h('div', { class: 'abs', style: { left: '790px', top: 250 + i * 112 + 'px' } }, h('div', { class: 'label', style: { fontSize: '40px' }, text: k }), h('div', { class: 'body', style: { marginTop: '4px', fontSize: '50px' }, text: v }));
    stage.append(el); return el;
  });
  const foot = h('div', { class: 'abs mono', style: { font: '400 44px/1 var(--mono)', color: '#9fc4d6' }, text: `${D.near.shards} · NEP-171 · mint ${S.mintTx.slice(0, 8)}…` }); at(foot, 140, 860);
  const foot2 = h('div', { class: 'abs', style: { font: '400 44px/1 var(--body)', color: 'var(--ink-dim)' }, text: 'minted by the season coordinator' }); at(foot2, 140, 930);
  stage.append(art, foot, foot2);
  return (t) => {
    drawBg(t, { tint: [127, 179, 213] });
    show(c1, t, 0.15, 2.2); show(c2, t, 2.35, 3.95);
    const s = settle(P(t, 0.1, 0.9)); art.style.opacity = t < 0.1 ? 0 : 1; art.style.transform = `scale(${lerp(0.85, 1, s).toFixed(4)})`;
    fields.forEach((el, i) => show(el, t, 0.5 + i * 0.16));
    show(foot, t, 1.4); show(foot2, t, 1.6);
  };
} };

// 16 · The backend as a data-flow diagram: who sends what where, and where it is checked (4.5 s).
SCENES.backend = { duration: 4.5, build() {
  const N = D.near;
  const c1 = cap('Sealed before trial 1. <em>Checked on NEAR.</em>');
  const svg = edgeLayer(stage);
  const box = (x, y, w, title, sub, col = 'var(--frame-soft)') => {
    const el = h('div', { class: 'card', style: { width: w + 'px', height: '150px', borderColor: col } },
      h('div', { class: 'abs', style: { left: '24px', top: '18px', font: '700 48px/1 var(--body)' }, text: title }),
      h('div', { class: 'abs', style: { left: '24px', top: '86px', font: '400 40px/1 var(--label)', color: 'var(--ink-dim)', whiteSpace: 'nowrap' }, text: sub }));
    at(el, x, y); stage.append(el); return { el, x, y, w, cx: x + w / 2, cy: y + 75 };
  };
  const seed = box(60, 190, 400, 'Seed', 'fixed for the judge'), eng = box(560, 190, 440, 'Engine', '17 trials, 15 signs'), root = box(1100, 190, 560, 'Merkle root', 'SHA-256, before trial 1');
  const api = box(560, 440, 440, 'HTTP agent API', 'same engine'), coord = box(1100, 440, 560, 'Coordinator', 'signs every tx', '#e2a94a');
  const brow = box(60, 700, 420, 'Browser', 'read-only views', '#9fdc8c'), seas = box(560, 700, 600, N.seasons, `commit ${N.commitTx.slice(0, 8)}…`, '#9fc4d6'), shards = box(1240, 700, 620, N.shards, 'mint_shard · same leaf #3', '#9fc4d6');
  const path = (d, col = 'rgba(232,214,172,.55)', dash) => { const p = h('path', { d, fill: 'none', stroke: col, 'stroke-width': 4 }); if (dash) p.setAttribute('stroke-dasharray', dash); svg.append(p); return p; };
  const B = 150; // box height
  const L = [
    path(`M${seed.x + seed.w},${seed.cy} L${eng.x},${eng.cy}`),
    path(`M${eng.x + eng.w},${eng.cy} L${root.x},${root.cy}`),
    path(`M${root.cx},${root.y + B} L${coord.cx},${coord.y}`),
    path(`M${coord.x + 120},${coord.y + B} C${coord.x + 120},${seas.y - 30} ${seas.x + seas.w - 120},${coord.y + B + 20} ${seas.x + seas.w - 120},${seas.y}`),
    path(`M${seas.x},${seas.cy} L${brow.x + brow.w},${brow.cy}`),
    path(`M${api.cx},${api.y} L${eng.cx},${eng.y + B}`),
    path(`M${coord.x + coord.w - 120},${coord.y + B} L${coord.x + coord.w - 120},${shards.y}`),
    path(`M${seas.x + seas.w},${seas.cy + 40} L${shards.x},${shards.cy + 40}`, 'rgba(159,196,214,.8)', '10 12'),
  ];
  const lab = (x, y, s, col = 'var(--ink)') => { const el = h('div', { class: 'abs', style: { font: '600 40px/1 var(--label)', color: col, whiteSpace: 'nowrap' }, text: s }); at(el, x, y); stage.append(el); return el; };
  const la = [lab(1560, 625, 'mint', 'var(--ink-dim)'), lab(640, 628, 'commit + 15 reveals'), lab(-999, 0, '')];
  const lr = lab(-999, 0, '');
  const ck1 = h('div', { class: 'chip ok', text: '✓ leaf + path checked' }); at(ck1, 800, 870);
  const ck2 = h('div', { class: 'chip ok', text: 'Verified on NEAR testnet ✓' }); at(ck2, 40, 870);
  const note = h('div', { class: 'abs', style: { font: '400 40px/1.25 var(--body)', color: 'var(--ink-dim)', width: '440px' }, html: 'Only the judge season<br>is on testnet' }); at(note, 60, 450);
  stage.append(ck1, ck2, note);
  const pk = L.map((_, i) => packet(svg, i === 7 ? '#9fc4d6' : '#ffe78e', 10));
  // Order of the story: seed → engine → root → coordinator → contract → browser; the agent API feeds the engine; the mint.
  const T0 = [0.3, 0.75, 1.15, 1.6, 2.35, 0.9, 2.1, 2.6];
  return (t) => {
    drawBg(t, { tint: [159, 196, 214] });
    show(c1, t, 0.15, 4.45);
    [seed, eng, root, coord, seas, brow, api, shards].forEach((b, i) => show(b.el, t, [0.1, 0.45, 0.85, 1.3, 1.7, 2.3, 0.7, 2.0][i], 99, { scale: 0.96 }));
    L.forEach((p, i) => {
      const len = p.getTotalLength(), k = ease.out(P(t, T0[i] - 0.1, 0.4));
      if (i !== 7) { p.setAttribute('stroke-dasharray', `${len}`); p.setAttribute('stroke-dashoffset', (len * (1 - k)).toFixed(1)); } else p.style.opacity = k.toFixed(3);
      // packets loop along each live line, one every 0.9 s
      moveOn(pk[i], p, t < T0[i] ? 0 : ((t - T0[i]) % 0.9) / 0.9);
    });
    show(la[0], t, 1.25); show(lr, t, 1.75); show(la[2], t, 2.75);
    show(ck1, t, 2.0, 99, { scale: 0.9 }); show(ck2, t, 2.55, 99, { scale: 0.9 });
    show(note, t, 1.0);
  };
} };

// 17 · End card (3.0 s).
SCENES.end = { duration: 3.0, build() {
  const cv = signCanvas(D.sign, 900); cv.classList.add('abs'); at(cv, 510, 90); stage.append(cv);
  const title = h('div', { class: 'abs', style: { left: 0, right: 0, top: '300px', textAlign: 'center', font: '700 132px/1 var(--title)', textShadow: '0 4px 40px rgba(0,0,0,.8)' }, text: 'Forget to Foresee' });
  const url = h('div', { class: 'abs', style: { left: 0, right: 0, top: '500px', textAlign: 'center', font: '600 52px/1 var(--label)', color: 'var(--gold)' }, text: 'spacexceo.github.io/forget-to-foresee/?demo=judge' });
  const built = h('div', { class: 'abs label', style: { left: 0, right: 0, top: '640px', textAlign: 'center', color: 'var(--ink)' }, text: 'Built at NEAR HACKATHON' });
  const by = h('div', { class: 'abs', style: { left: 0, right: 0, top: '730px', textAlign: 'center', font: '400 50px/1 var(--body)', color: 'var(--ink-dim)' }, text: 'Made by Lambada_eth' });
  stage.append(title, url, built, by);
  return (t) => {
    drawBg(t);
    cv.style.opacity = (0.22 * ease.out(P(t, 0, 0.8))).toFixed(3); cv.style.transform = `rotate(${(t * 3).toFixed(2)}deg)`;
    cv.draw({ progress: 1, time: t });
    show(title, t, 0.1, 99, { scale: 0.97 }); show(url, t, 0.45); show(built, t, 0.7); show(by, t, 0.85);
    // the last 0.5 s fade to black
    stage.style.opacity = (1 - ease.in(P(t, 2.5, 0.5))).toFixed(3);
  };
} };

/* ---------- harness interface ---------- */
const name = Q.get('scene') || 'decode';
const scene = SCENES[name];
if (!scene) throw new Error('unknown scene ' + name);
let render = null;
const ready = (async () => {
  await document.fonts.ready;
  await Promise.all(['700 64px "Atkinson Hyperlegible"', '400 46px "Atkinson Hyperlegible"', '600 44px "Source Sans 3"', '400 76px "Libre Caslon Text"', '700 132px "Libre Caslon Text"'].map((f) => document.fonts.load(f)));
  render = scene.build();
  render(0);
})();
window.__cine = { ready, duration: scene.duration, scenes: Object.fromEntries(Object.entries(SCENES).map(([k, v]) => [k, v.duration])), render: (t) => render && render(t), step: () => clock.step ? clock.step() : null };
if (Q.get('t') != null) ready.then(() => render(Number(Q.get('t'))));
