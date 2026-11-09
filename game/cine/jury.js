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
import { T, CLAN, CSS as DS_CSS, clanCard, anchorNode, route, keyGlyph, sealMark, s as sv } from './jury-ds.js';
document.head.append(Object.assign(document.createElement('style'), { textContent: DS_CSS }));

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
// A static film grain (seeded once, identical on every frame: texture without shimmer).
const grain = (() => { const c = document.createElement('canvas'); c.width = 960; c.height = 540; const x = c.getContext('2d'), im = x.createImageData(960, 540); let a = 99; for (let i = 0; i < im.data.length; i += 4) { a = (a * 1103515245 + 12345) & 0x7fffffff; const v = a % 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 10; } x.putImageData(im, 0, 0); return c; })();
function drawBg(t, { tint = [232, 178, 90], heat = 0 } = {}) {
  if (ALPHA) { bgx.clearRect(0, 0, 960, 540); return; }
  const g = bgx.createRadialGradient(480, 230, 30, 480, 300, 640);
  g.addColorStop(0, '#16221f'); g.addColorStop(0.5, '#0f1716'); g.addColorStop(1, '#070a0b');
  bgx.fillStyle = g; bgx.fillRect(0, 0, 960, 540);
  // atmosphere: two slow, faint pools of light; one warms toward rust with the season's heat
  [[0.2, 0.28, 300, 0.06], [0.82, 0.7, 320, 0.05]].forEach(([x, y, r, a], i) => {
    const cx = 960 * x + Math.sin(t * 0.18 + i * 2.1) * 30, cy = 540 * y + Math.cos(t * 0.14 + i) * 18;
    const c = heat > 0 && i === 1 ? [lerp(tint[0], 200, heat), lerp(tint[1], 115, heat), lerp(tint[2], 90, heat)] : tint;
    const rg = bgx.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a + heat * 0.06})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    bgx.fillStyle = rg; bgx.fillRect(0, 0, 960, 540);
  });
  // the horizon of a Shell: one fine arc, warm at its crown, fading at the sides
  const arc = bgx.createLinearGradient(0, 0, 960, 0);
  arc.addColorStop(0, 'rgba(232,178,90,0)'); arc.addColorStop(0.5, 'rgba(232,178,90,.16)'); arc.addColorStop(1, 'rgba(232,178,90,0)');
  bgx.strokeStyle = arc; bgx.lineWidth = 1; bgx.beginPath(); bgx.arc(480, 760, 740, Math.PI * 1.12, Math.PI * 1.88); bgx.stroke();
  const vg = bgx.createRadialGradient(480, 270, 260, 480, 270, 620); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
  bgx.fillStyle = vg; bgx.fillRect(0, 0, 960, 540);
  bgx.drawImage(grain, 0, 0);
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

// 8 · Six clan agents (4.5 s): the same six cards as the crisis scene (one cast, one layout), each with its silk and
// temper; then three real moments of the judge season (its log): Frost wins Iris's shard for 13 silk (trial 6), Ash
// cheats Amber out of 16 silk (trial 8, on their tie), Salt whispers to everyone that it is a weapon (trial 13: a
// broadcast, so no tie is drawn, only a ring around Salt).
SCENES.agents = { duration: 4.5, build() {
  const c1 = cap('Silk, a memory, a temper'), c2 = cap('They trade… and break <em>trust</em>');
  const svg = edgeLayer(stage);
  const TOP = 230, BOT = 700, W = 440, H = 164;
  const cards = {
    salt: clanCard('salt', { x: 110, y: TOP }), iris: clanCard('iris', { x: 740, y: TOP, player: true }), frost: clanCard('frost', { x: 1370, y: TOP }),
    moss: clanCard('moss', { x: 110, y: BOT }), ash: clanCard('ash', { x: 740, y: BOT }), amber: clanCard('amber', { x: 1370, y: BOT }),
  };
  Object.values(cards).forEach((c) => stage.append(c.el));
  const silk = Object.fromEntries(Object.entries(cards).map(([k, c]) => { const el = h('div', { class: 'abs', style: { left: c.x + 'px', width: W + 'px', top: c.y + H + 14 + 'px', textAlign: 'center', font: '400 40px/1 var(--body)', color: 'var(--ink-dim)' }, html: `<b style="color:var(--gold);font-weight:700">60</b> silk · memories` }); stage.append(el); return [k, el]; }));
  const tie = (a, b, via = 'h') => { const p = sv('path', { d: route(a, b, { via }), fill: 'none', stroke: 'rgba(169,176,173,.75)', 'stroke-width': T.line, 'stroke-linecap': 'round' }); svg.append(p); anchorNode(svg, a); anchorNode(svg, b); return p; };
  const e1 = tie(cards.frost.anchor('left'), cards.iris.anchor('right'));
  const ring = sv('circle', { cx: cards.salt.x + W / 2, cy: TOP + H / 2, r: 260, fill: 'none', stroke: 'rgba(217,220,214,.5)', 'stroke-width': 2 }); svg.append(ring);
  const e3 = tie(cards.ash.anchor('right'), cards.amber.anchor('left'));
  const p1 = packet(svg, T.amber, 9), p3 = packet(svg, '#c8735a', 9);
  const ch1 = h('div', { class: 'chip ok', text: 'Frost wins the shard · 13' }); at(ch1, 1150, 448);
  const ch2 = h('div', { class: 'chip', text: 'Salt: “It is a weapon”' }); at(ch2, 110, 520);
  const ch3 = h('div', { class: 'chip bad', text: 'Ash cheats Amber · 16' }); at(ch3, 1040, 905);
  stage.append(ch1, ch2, ch3);
  return (t) => {
    drawBg(t);
    show(c1, t, 0.2, 2.2); show(c2, t, 2.35, 4.45);
    Object.entries(cards).forEach(([k, c], i) => { show(c.el, t, 0.1 + i * 0.07, 99, { scale: 0.97 }); c.set(t, {}); show(silk[k], t, 0.5 + i * 0.07, 2.4); });
    const lit = (p, a, col) => { const L = p.getTotalLength(), k = ease.out(P(t, a, 0.45)); p.setAttribute('stroke-dasharray', `${L}`); p.setAttribute('stroke-dashoffset', (L * (1 - k)).toFixed(1)); if (t > a + 0.45) p.setAttribute('stroke', col); };
    lit(e1, 1.0, T.amber); moveOn(p1, e1, P(t, 1.0, 0.7)); show(ch1, t, 1.3, 99);
    const rk = P(t, 1.9, 0.9); ring.setAttribute('r', (230 + 260 * ease.out(rk)).toFixed(1)); ring.setAttribute('opacity', (rk > 0 ? 0.6 * (1 - rk) : 0).toFixed(3)); show(ch2, t, 2.1, 99);
    lit(e3, 2.9, '#c8735a'); moveOn(p3, e3, P(t, 2.9, 0.7)); show(ch3, t, 3.2, 99);
    if (t > 3.4) e3.setAttribute('stroke-dasharray', '14 14');
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
SCENES.api = { duration: 4.5, build() {
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
    show(c1, t, 0.2, 2.3); show(c2, t, 2.5, 4.45);
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
  svg.append(h('line', { x1: X0, y1: Y, x2: X1, y2: Y, stroke: T.hair, 'stroke-width': 2 }));
  const prog = h('line', { x1: X0, y1: Y, x2: X0, y2: Y, stroke: T.amberSoft, 'stroke-width': 3 }); svg.append(prog);
  const nodes = Array.from({ length: 17 }, (_, i) => {
    const x = X0 + i * step, n = i + 1, special = n === 13 ? '#c8735a' : n === 17 ? T.amber : null;
    const c = h('circle', { cx: x, cy: Y, r: special ? 24 : 14, fill: T.ground, stroke: special || T.silver, 'stroke-width': special ? 3 : 2 });
    const num = h('text', { x, y: Y + 82, 'text-anchor': 'middle', fill: 'var(--ink)', style: 'font: 600 44px var(--label)' }); num.textContent = n;
    const ck = sv('g', { transform: `translate(${x},${Y - 62})` }, n >= 3 ? sealMark(15) : null);
    svg.append(c, num, ck); return { c, ck, x, n, special };
  });
  const cr = h('div', { class: 'abs label', style: { color: '#c8735a' }, text: 'Crisis' }); at(cr, X0 + 12 * step - 80, Y - 150);
  const vt = h('div', { class: 'abs label', style: { color: T.amber }, text: 'Vote' }); at(vt, X0 + 16 * step - 90, Y - 150);
  const tl = h('div', { class: 'abs label', style: { color: 'var(--ink-dim)' }, text: 'Tension' }); at(tl, X0, 700);
  const bar = h('div', { class: 'abs', style: { left: X0 + 'px', top: '770px', width: X1 - X0 + 'px', height: '8px', borderRadius: '4px', background: T.hair, overflow: 'hidden' } });
  const fill = h('div', { style: { height: '100%', width: '0%', background: 'linear-gradient(90deg, #9aa8a4, #e8b25a 60%, #c8735a)' } }); bar.append(fill);
  stage.append(cr, vt, tl, bar);
  // A tension curve shaped like the game's: slow rise, the trial-13 spike, a slight ease before the vote.
  const tension = (x) => x < 12 / 16 ? 0.12 + 0.45 * (x / (12 / 16)) : x < 13 / 16 ? 0.57 + 0.33 * ((x - 12 / 16) * 16) : 0.9 - 0.06 * ((x - 13 / 16) / (3 / 16));
  return (t) => {
    const k = ease.inOut(P(t, 0.25, 3.2));
    drawBg(t, { heat: clamp((k - 0.7) * 3) * 0.8 });
    show(c1, t, 0.2, 2.25); show(c2, t, 2.4, 3.95);
    prog.setAttribute('x2', (X0 + (X1 - X0) * k).toFixed(1));
    nodes.forEach((o, i) => {
      const reached = k * 16 >= i - 1e-6, kk = P(k * 16, i - 0.6, 0.6);
      o.c.setAttribute('fill', reached ? (o.special || T.pearl) : T.ground);
      o.c.setAttribute('r', ((o.special ? 24 : 14) * (1 + 0.25 * Math.sin(Math.PI * clamp(kk)))).toFixed(2));
      o.ck.style.opacity = reached ? ease.out(kk).toFixed(3) : 0;
    });
    show(cr, t, 0.25 + 3.2 * 0.72); show(vt, t, 0.25 + 3.2 * 0.97);
    show(tl, t, 0.3);
    fill.style.width = (100 * tension(k) * ease.out(P(t, 0.2, 0.4))).toFixed(2) + '%';
  };
} };

// 12 · Trial 13 (4.0 s). The central idea: Ash's Key restores Ash's broken ties through a verified commitment.
// Only the judge season's real relationships are drawn (jury-data.json `crisis`): at trial 13 Ash cut ties with Iris
// and Salt; the tie with Amber was already broken at trial 8; Moss and Frost stay linked while Ash is isolated.
// The seal sits on the Iris–Ash tie because Iris speaks the Key to Ash; the browser compares the hash with the
// commitment that was put on NEAR testnet before trial 1 (the phrase itself is not revealed on-chain).
SCENES.ash = { duration: 4.0, build() {
  const c1 = cap('Ash turns away'), c2 = cap('Ash’s Key <em>restores them</em>');
  const svg = edgeLayer(stage);
  const W = 440, H = 164;
  const TOP = 210, BOT = 700;
  const cards = {
    salt: clanCard('salt', { x: 110, y: TOP }), iris: clanCard('iris', { x: 740, y: TOP, player: true }), frost: clanCard('frost', { x: 1370, y: TOP }),
    moss: clanCard('moss', { x: 110, y: BOT }), ash: clanCard('ash', { x: 740, y: BOT }), amber: clanCard('amber', { x: 1370, y: BOT }),
  };
  Object.values(cards).forEach((c) => stage.append(c.el));
  const A = cards.ash;
  // Anchors: Ash's top edge carries Salt, Iris and Frost; its sides carry Moss and Amber on the same row.
  const ends = {
    salt: [[A.x + 70, A.y], cards.salt.anchor('bottom'), 'v'], iris: [[A.x + W / 2, A.y], cards.iris.anchor('bottom'), 'v'],
    frost: [[A.x + W - 70, A.y], cards.frost.anchor('bottom'), 'v'],
    moss: [A.anchor('left'), cards.moss.anchor('right'), 'h'], amber: [A.anchor('right'), cards.amber.anchor('left'), 'h'],
  };
  const isoLabel = h('div', { class: 'abs', style: { left: A.x + 'px', width: W + 'px', top: BOT + H + 18 + 'px', textAlign: 'center', font: '600 40px/1 var(--label)', letterSpacing: '.26em', textTransform: 'uppercase', color: T.mist }, text: 'Isolated' });
  stage.append(isoLabel);
  const state = Object.fromEntries(D.crisis.edges.map((e) => [e.clan, e]));
  const brokenEarly = (c) => state[c].broken && !D.crisis.breaks.some((b) => b.tick === 13 && b.text.toLowerCase().includes(CLAN[c].name.toLowerCase()));
  const edges = Object.entries(ends).map(([clan, [a, b, via]]) => {
    const p = sv('path', { d: route(a, b, { via, mid: BOT - 64 }), fill: 'none', 'stroke-width': T.line, 'stroke-linecap': 'round' });
    const glow = sv('path', { d: p.getAttribute('d'), fill: 'none', 'stroke-width': 12, stroke: T.amberGlow, 'stroke-linecap': 'round', opacity: 0 });
    svg.append(glow, p);
    const n1 = anchorNode(svg, a), n2 = anchorNode(svg, b);
    return { clan, p, glow, n1, n2, len: 0, broken: state[clan].broken, early: brokenEarly(clan) };
  });
  // The seal: a ring with the key, on the Iris–Ash tie; the commitment formula beside it.
  const SX = 960, SY = 486, R = 58;
  const halo = sv('circle', { cx: SX, cy: SY, r: R * 2.2, fill: 'url(#sealHalo)', opacity: 0 });
  svg.append(sv('defs', {}, sv('radialGradient', { id: 'sealHalo' }, sv('stop', { offset: 0, 'stop-color': T.amber, 'stop-opacity': 0.35 }), sv('stop', { offset: 1, 'stop-color': T.amber, 'stop-opacity': 0 }))));
  const disc = sv('circle', { cx: SX, cy: SY, r: R, fill: T.ground, stroke: T.hair, 'stroke-width': 1.5 });
  const ring = sv('circle', { cx: SX, cy: SY, r: R, fill: 'none', stroke: T.amber, 'stroke-width': 3, transform: `rotate(-90 ${SX} ${SY})` });
  const key = sv('g', {}, keyGlyph(T.amber)); // travels from Iris to the seal
  svg.append(halo, disc, ring, key);
  const formula = h('div', { class: 'abs', style: { left: '1060px', top: '418px', width: '780px' } },
    h('div', { style: { font: '400 44px/1 var(--mono)', color: 'var(--ink)' }, text: 'SHA-256(phrase · salt)' }),
    h('div', { style: { font: '400 44px/1 var(--mono)', color: T.amber, marginTop: '16px' }, text: `= ${D.near.ashKey.slice(0, 8)}…${D.near.ashKey.slice(-6)}` }),
    h('div', { style: { font: '600 34px/1.3 var(--label)', color: T.mist, letterSpacing: '.16em', textTransform: 'uppercase', marginTop: '18px' }, html: 'Committed on NEAR testnet<br>before trial 1' }));
  stage.append(formula);
  const T_BREAK = 0.5, T_KEY = 1.7, T_MATCH = 2.35, T_HEAL = 2.6;
  return (t) => {
    const iso = ease.out(P(t, T_BREAK, 0.4)) * (1 - ease.inOut(P(t, T_HEAL + 0.6, 0.6)));
    drawBg(t, { tint: [189, 182, 173], heat: 0 });
    show(c1, t, 0.12, 1.8); show(c2, t, 1.95, 3.95);
    cards.ash.set(t, { cool: iso, drift: iso * (0.4 + 0.6 * P(t, T_BREAK, 2)) });
    isoLabel.style.opacity = iso.toFixed(3);
    for (const c of ['iris', 'salt', 'frost', 'moss', 'amber']) cards[c].set(t, {});
    edges.forEach((e, i) => {
      if (!e.len) e.len = e.p.getTotalLength();
      const L = e.len, healAt = T_HEAL + ['iris', 'salt', 'amber'].indexOf(e.clan) * 0.22;
      const breakK = e.early ? 1 : e.broken ? ease.out(P(t, T_BREAK, 0.35)) : 0;
      const healK = e.broken ? ease.inOut(P(t, healAt, 0.45)) : 0;
      const gap = 70 * breakK * (1 - healK); // the tie opens in the middle and closes again
      e.p.setAttribute('stroke-dasharray', gap > 0.5 ? `${(L / 2 - gap / 2).toFixed(1)} ${gap.toFixed(1)} ${L}` : 'none');
      const col = healK > 0 ? T.amber : breakK > 0 ? T.broken : 'rgba(169,176,173,.75)';
      e.p.setAttribute('stroke', col);
      e.p.style.opacity = (e.broken && healK === 0 ? 1 - 0.35 * breakK : 1).toFixed(3);
      e.glow.setAttribute('opacity', (healK * (1 - 0.6 * P(t, healAt + 0.45, 0.6))).toFixed(3));
      e.n1.style.opacity = e.n2.style.opacity = '1';
      void i;
    });
    // The key comes down from Iris to the seal, the ring closes on a match, a warm light answers once and settles.
    const kk = ease.inOut(P(t, T_KEY, 0.55));
    key.setAttribute('transform', `translate(${(SX - 42).toFixed(1)},${lerp(TOP + H + 20, SY, kk).toFixed(1)})`);
    key.style.opacity = (t < T_KEY ? 0 : Math.min(1, (t - T_KEY) * 6)).toFixed(3);
    const sealIn = ease.out(P(t, T_KEY - 0.1, 0.35));
    disc.style.opacity = halo.style.opacity = '';
    disc.setAttribute('opacity', sealIn.toFixed(3));
    const rc = ease.inOut(P(t, T_KEY + 0.2, T_MATCH - T_KEY - 0.2)), C = 2 * Math.PI * R;
    ring.setAttribute('stroke-dasharray', `${C}`); ring.setAttribute('stroke-dashoffset', (C * (1 - rc)).toFixed(1));
    ring.setAttribute('opacity', sealIn.toFixed(3));
    const flash = P(t, T_MATCH, 0.25) * (1 - 0.6 * ease.out(P(t, T_MATCH + 0.25, 0.8)));
    halo.setAttribute('opacity', flash.toFixed(3));
    show(formula, t, T_KEY + 0.15, 99);
    formula.children[1].style.opacity = (0.45 + 0.55 * P(t, T_MATCH, 0.2)).toFixed(3);
  };
} };

// 14 · How rewards are shared (6.0 s). Top: a Gift's pot as a ring that splits into arcs by how early each stake was
// placed (the engine's weight: trials waited + 1; apportion(20, [3, 2]) = 12 + 8), with what a Storm and a Silence or
// Call do to the stake. Bottom: the four vote outcomes as an editorial row (v3 numbers from the engine).
SCENES.rewards = { duration: 6.0, build() {
  const R = D.rules;
  const c1 = cap('Stake early, <em>bigger share</em>'), c2 = cap('Then the vote pays out');
  const svg = edgeLayer(stage);
  const CX = 470, CY = 420, RR = 130, C = 2 * Math.PI * RR;
  svg.append(sv('circle', { cx: CX, cy: CY, r: RR, fill: 'none', stroke: T.hair, 'stroke-width': 18 }));
  const tot = R.split[0] + R.split[1];
  const arcA = sv('circle', { cx: CX, cy: CY, r: RR, fill: 'none', stroke: T.amber, 'stroke-width': 18, transform: `rotate(-90 ${CX} ${CY})` });
  const arcB = sv('circle', { cx: CX, cy: CY, r: RR, fill: 'none', stroke: 'rgba(232,178,90,.45)', 'stroke-width': 18, transform: `rotate(${-90 + 360 * R.split[0] / tot + 1.5} ${CX} ${CY})` });
  svg.append(arcA, arcB);
  const potN = h('div', { class: 'abs', style: { left: CX - 120 + 'px', width: '240px', top: CY - 62 + 'px', textAlign: 'center' } },
    h('div', { style: { font: '400 84px/1 var(--title)', color: 'var(--ink)' }, text: String(R.pot[1]) }),
    h('div', { class: 'label', style: { fontSize: '30px', marginTop: '6px', color: 'var(--ink-dim)' }, text: 'Gift pot' }));
  const leg = (y, col, big, txt) => { const el = h('div', { class: 'abs', style: { left: '700px', top: y + 'px' } },
    h('span', { style: { display: 'inline-block', width: '44px', height: '6px', background: col, borderRadius: '3px', verticalAlign: 'middle', marginRight: '22px' } }),
    h('span', { style: { font: '400 76px/1 var(--title)', color: col, verticalAlign: 'middle' }, text: big }),
    h('span', { style: { font: '400 44px/1 var(--body)', color: 'var(--ink)', marginLeft: '22px', verticalAlign: 'middle' }, text: txt })); stage.append(el); return el; };
  const lA = leg(300, T.amber, '+' + R.split[0], 'staked at trial 1'), lB = leg(410, 'rgba(232,178,90,.6)', '+' + R.split[1], 'staked at trial 2');
  const rule = h('div', { class: 'abs', style: { left: '700px', top: '520px', width: '1080px', height: '1px', background: 'var(--frame-soft)' } });
  const fates = h('div', { class: 'abs', style: { left: '700px', top: '548px', font: '400 44px/1.25 var(--body)', color: 'var(--ink-dim)' }, html: '<b style="color:#c8735a;font-weight:700">Storm</b> burns the stake · <b style="color:var(--ink);font-weight:700">Silence, Call</b> return it' });
  stage.append(potN, rule, fates);
  const cols = [
    ['Gift', `+${R.finaleGift}`, 'each contributor', T.amber], ['Weapon', '0', 'everyone’s silk', '#c8735a'],
    ['Survived', `+${R.finaleSurvived}`, 'each contributor', T.pearl], ['Lost', '—', 'nothing paid', T.mist],
  ].map(([n, v, sub, col], i) => {
    const x = 150 + i * 420;
    const el = h('div', { class: 'abs', style: { left: x + 'px', top: '650px', width: '380px' } },
      h('div', { class: 'label', style: { color: col }, text: n }),
      h('div', { style: { font: '400 120px/1 var(--title)', color: col, marginTop: '14px' }, text: v }),
      h('div', { style: { font: '400 44px/1 var(--body)', color: 'var(--ink-dim)', marginTop: '14px' }, text: sub }));
    if (i) el.append(h('div', { class: 'abs', style: { left: '-40px', top: '0', width: '1px', height: '250px', background: 'var(--frame-soft)' } }));
    stage.append(el); return el;
  });
  return (t) => {
    drawBg(t);
    show(c1, t, 0.2, 2.75); show(c2, t, 2.95, 5.95);
    const top = 1 - 0.6 * ease.inOut(P(t, 2.8, 0.4));
    const k = ease.out(P(t, 0.3, 0.5)), sp = ease.inOut(P(t, 0.9, 0.6));
    const fa = C * R.split[0] / tot, fb = C * R.split[1] / tot;
    arcA.setAttribute('stroke-dasharray', `${(lerp(C * k, fa - 6, sp)).toFixed(1)} ${C}`);
    arcB.setAttribute('stroke-dasharray', `${(fb - 6) * sp} ${C}`);
    arcA.style.opacity = arcB.style.opacity = top.toFixed(3);
    show(potN, t, 0.25); potN.style.opacity = (Number(potN.style.opacity) * top).toFixed(3);
    [lA, lB, rule, fates].forEach((el, i) => { const a = show(el, t, [1.05, 1.25, 1.5, 1.6][i]); el.style.opacity = (a * top).toFixed(3); });
    cols.forEach((el, i) => show(el, t, 3.0 + i * 0.16, 99));
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
  const box = (x, y, w, title, sub) => {
    const el = h('div', { class: 'card', style: { width: w + 'px', height: '150px' } },
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
  // Approval points: the confirmation seal on the node that approves, its meaning in a tracked label beneath.
  const over = edgeLayer(stage); // above the nodes
  const approve = (b, html) => { const g = sv('g', { transform: `translate(${b.x + b.w - 40},${b.y + 40})` }, sealMark(20)); over.append(g);
    const l = h('div', { class: 'abs label', style: { left: b.x + 'px', top: b.y + 168 + 'px', fontSize: '36px', lineHeight: '1.25' }, html }); stage.append(l);
    return { el: l, g }; };
  const A1 = approve(seas, 'Leaf + path checked'), A2 = approve(brow, 'Verified on<br>NEAR testnet');
  const ck1 = A1.el, ck2 = A2.el;
  const note = h('div', { class: 'abs', style: { font: '400 40px/1.25 var(--body)', color: 'var(--ink-dim)', width: '440px' }, html: 'Only the judge season<br>is on testnet' }); at(note, 60, 450);
  stage.append(note);
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
    show(ck1, t, 2.0); show(ck2, t, 2.55);
    [[A1.g, 2.0], [A2.g, 2.55]].forEach(([g, a]) => { const k = settle(P(t, a, 0.7)); g.style.opacity = t < a ? 0 : 1; g.querySelector('circle').setAttribute('r', (20 * lerp(1.35, 1, k)).toFixed(2)); });
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
