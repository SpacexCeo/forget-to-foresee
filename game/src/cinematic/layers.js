// Data layers anchored in depth for the cinematic capture (docs/submission/jury-video.md, v3). A shot's `layers` list
// draws the interface into the world: every item is placed by projecting a world point (or a live agent's head)
// through the shot camera on every frame, so a clan's name rides on that clan's head, a link runs between two real
// camps, the token assembles out of the shard's own screen position. Everything is a pure function of the shot time t
// and the frame's camera, driven by the same virtual clock as the render: no frame depends on the one before.
//
// Design units are a 1920×1080 stage scaled to the viewport. Type and colour follow the game's tokens: Libre Caslon
// for names and titles, Atkinson Hyperlegible for lines, Source Sans 3 for tracked labels; ink, pearl and nacre with
// gold #e4c272 as the rare accent.
import { drawLogogram } from '../play/logogram.js';
import { MATERIAL } from '../../cine/jury-ds.js';

const GOLD = '#e4c272', PEARL = '#ece6d8', MIST = '#a3b0ac', RUST = '#d0806a', NACRE = '#a9c6d4';
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const P = (t, a, d) => clamp((t - a) / d);
const out = (k) => 1 - Math.pow(1 - clamp(k), 4);
const inOut = (k) => { k = clamp(k); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
const settle = (k) => { k = clamp(k); return 1 - Math.exp(-6 * k) * Math.cos(9 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
/** Envelope of an item: fades in over `din` from `from`, out over `dout` before `to`. */
const env = (t, it, din = 0.45, dout = 0.3) => Math.min(out(P(t, it.from, it.fadeIn ?? din)), 1 - P(t, (it.to ?? 1e9) - (it.fadeOut ?? dout), it.fadeOut ?? dout));

const CSS = `
#cine-layers { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: 0 0; pointer-events: none; z-index: 49; color: ${PEARL}; }
#cine-layers svg { position: absolute; left: 0; top: 0; overflow: visible; }
.cl-abs { position: absolute; white-space: nowrap; }
.cl-title { left: 0; right: 0; text-align: center; font: 400 112px/1 'Libre Caslon Text', Georgia, serif; text-shadow: 0 4px 40px rgba(0,0,0,.7); }
.cl-eyebrow { font: 600 44px/1 'Source Sans 3', sans-serif; letter-spacing: .5em; color: ${GOLD}; text-transform: uppercase; margin-bottom: 26px; }
.cl-name { font: 400 120px/1 'Libre Caslon Text', Georgia, serif; text-shadow: 0 3px 30px rgba(0,0,0,.75); transform: translate(-50%, -100%); text-align: center; }
.cl-temper { display: block; font: 600 44px/1 'Source Sans 3', sans-serif; letter-spacing: .3em; text-transform: uppercase; color: ${PEARL}; margin-top: 14px; text-shadow: 0 2px 16px rgba(0,0,0,.8); }
.cl-line { font: 700 56px/1.15 'Atkinson Hyperlegible', 'Source Sans 3', sans-serif; text-shadow: 0 2px 24px rgba(0,0,0,.85); transform: translate(-50%, -50%); text-align: center; }
.cl-small { font: 400 44px/1.2 'Atkinson Hyperlegible', 'Source Sans 3', sans-serif; color: ${MIST}; text-shadow: 0 2px 16px rgba(0,0,0,.85); }
.cl-glass { background: linear-gradient(160deg, rgba(236,230,216,.12), rgba(16,24,24,.42) 55%, rgba(10,16,16,.5)); -webkit-backdrop-filter: blur(18px) saturate(1.15) brightness(.85); backdrop-filter: blur(18px) saturate(1.15) brightness(.85); border-radius: 24px; box-shadow: inset 0 0 0 1px rgba(236,230,216,.20), inset 0 1px 0 rgba(255,255,255,.22), 0 24px 60px rgba(0,0,0,.35); overflow: hidden; }
.cl-lock { left: 0; right: 0; text-align: center; }
.cl-lock .t { font: 400 112px/1 'Libre Caslon Text', Georgia, serif; text-shadow: 0 4px 40px rgba(0,0,0,.6); }
.cl-lock .s { font: 600 44px/1 'Source Sans 3', sans-serif; letter-spacing: .42em; text-transform: uppercase; color: ${PEARL}; opacity: .9; margin-top: 30px; text-shadow: 0 2px 18px rgba(0,0,0,.7); }
.cl-card { width: 560px; height: 210px; transform: translate(-50%, -100%); }
.cl-card .n { position: absolute; left: 40px; top: 34px; font: 400 92px/1 'Libre Caslon Text', Georgia, serif; }
.cl-card .m { position: absolute; left: 44px; top: 142px; font: 600 44px/1 'Source Sans 3', sans-serif; letter-spacing: .36em; text-transform: uppercase; color: ${PEARL}; opacity: .85; }
.cl-card svg.v { position: absolute; left: 0; top: 0; }
.cl-quote { font: italic 400 96px/1.1 'Libre Caslon Text', Georgia, serif; text-shadow: 0 4px 40px rgba(0,0,0,.75); transform: translate(-50%, -50%); text-align: center; }
.cl-amount { transform: translate(-50%, -50%); text-align: center; }
.cl-amount .v { font: 400 150px/1 'Libre Caslon Text', Georgia, serif; color: ${GOLD}; text-shadow: 0 4px 40px rgba(0,0,0,.7); }
.cl-amount .u { font: 600 44px/1 'Source Sans 3', sans-serif; letter-spacing: .5em; color: ${PEARL}; margin-top: 6px; }
.cl-amount .w { font: 700 52px/1.1 'Atkinson Hyperlegible', sans-serif; margin-bottom: 14px; text-shadow: 0 2px 20px rgba(0,0,0,.8); }
.cl-label { font: 600 40px/1 'Source Sans 3', sans-serif; letter-spacing: .3em; text-transform: uppercase; color: ${GOLD}; }
.cl-value { font: 400 50px/1.15 'Libre Caslon Text', Georgia, serif; color: ${PEARL}; margin: 8px 0 24px; white-space: nowrap; }
.cl-quote::before, .cl-amount::before, .cl-lock::before { content: ''; position: absolute; left: -30%; right: -30%; top: -35%; bottom: -35%; z-index: -1; background: radial-gradient(closest-side, rgba(6,10,10,.42), rgba(6,10,10,0)); }
.cl-lock::before { left: 22%; right: 22%; }
.cl-mono { font: 400 44px/1.2 'DejaVu Sans Mono', Menlo, monospace; color: ${NACRE}; text-shadow: 0 2px 16px rgba(0,0,0,.85); }
`;

const NS = 'http://www.w3.org/2000/svg';
function el(doc, tag, cls, html) { const e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function sv(doc, tag, attrs = {}) { const e = doc.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** createLayers(doc) → { set(items), update(t, project, target) }. project(world) → [x, y, onScreen] in stage px. */
export function createLayers(doc = document) {
  if (!doc.getElementById('cine-layers-style')) { const s = el(doc, 'style', null, CSS); s.id = 'cine-layers-style'; doc.head.appendChild(s); }
  const root = el(doc, 'div'); root.id = 'cine-layers';
  const svg = sv(doc, 'svg', { width: 1920, height: 1080, viewBox: '0 0 1920 1080' });
  root.append(svg);
  (doc.getElementById('cine') || doc.body).appendChild(root);
  let nodes = [];

  const builders = {
    lockup(it) { // chapter lockup (style sheet): thin ring with a small top circle, serif title, wide-tracked caps line
      const e = el(doc, 'div', 'cl-abs cl-lock', `<div class="t">${esc(it.text)}</div><div class="s">${esc(it.sub || '')}</div>`); e.style.top = (it.y ?? 390) + 'px'; root.append(e);
      const R = it.r ?? 260, cx = 960, cy = (it.y ?? 390) + 60;
      const ring = sv(doc, 'circle', { cx, cy, r: R, fill: 'none', stroke: 'rgba(236,230,216,.55)', 'stroke-width': 1.5 });
      const top = sv(doc, 'circle', { cx, cy: cy - R, r: 9, fill: 'none', stroke: GOLD, 'stroke-width': 2 });
      const num = el(doc, 'div', 'cl-abs', esc(it.eyebrow || '')); Object.assign(num.style, { left: '0', right: '0', textAlign: 'center', top: (cy - R - 70) + 'px', font: "600 44px/1 'Source Sans 3', sans-serif", letterSpacing: '.3em', color: GOLD }); root.append(num);
      svg.append(ring, top);
      return (t) => {
        const a = env(t, it, 0.9, 0.4), k = out(P(t, it.from, 1.3)), C = 2 * Math.PI * R;
        e.style.opacity = a.toFixed(3); e.style.filter = `blur(${(12 * (1 - k)).toFixed(2)}px)`; e.style.letterSpacing = `${(0.06 * (1 - k)).toFixed(3)}em`;
        ring.setAttribute('stroke-dasharray', `${C}`); ring.setAttribute('stroke-dashoffset', (C * (1 - inOut(P(t, it.from - 0.1, 1.4)))).toFixed(1)); ring.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
        ring.style.opacity = (a * 0.8).toFixed(3); top.style.opacity = num.style.opacity = env(t, { ...it, from: it.from + 0.6 }).toFixed(3);
      };
    },
    clanCard(it) { // a clan identity pinned above its agent: frosted glass, the clan's material, focus when it nears centre
      const e = el(doc, 'div', 'cl-abs cl-glass cl-card', `<div class="n" style="color:${it.color}">${esc(it.name)}</div><div class="m">${esc(it.sub || '')}</div>`);
      const W = 560, H = 210, mat = MATERIAL[it.clan] ? MATERIAL[it.clan](W, H) : null;
      if (mat) { const v = sv(doc, 'svg', { class: 'v', width: W, height: H, viewBox: `0 0 ${W} ${H}` }); const id = 'm' + it.clan + Math.random().toString(36).slice(2, 6);
        const defs = sv(doc, 'defs'), lg = sv(doc, 'linearGradient', { id: id + 'g', x1: 0, y1: 0, x2: 1, y2: 0 }); lg.append(sv(doc, 'stop', { offset: 0.4, 'stop-color': '#fff', 'stop-opacity': 0 }), sv(doc, 'stop', { offset: 0.85, 'stop-color': '#fff', 'stop-opacity': 1 }));
        const mk = sv(doc, 'mask', { id }); mk.append(sv(doc, 'rect', { width: W, height: H, fill: `url(#${id}g)` })); defs.append(lg, mk); v.append(defs); const g = sv(doc, 'g', { mask: `url(#${id})` }); g.append(mat.g); v.append(g); e.prepend(v); }
      root.append(e);
      const stem = sv(doc, 'line', { stroke: 'rgba(236,230,216,.6)', 'stroke-width': 1.5 }), dot = sv(doc, 'circle', { r: 7, fill: 'none', stroke: it.color, 'stroke-width': 2 }); svg.append(stem, dot);
      return (t, project, target) => {
        const w = it.target ? (target(it.target) || {}).pos : it.world; if (!w) return;
        const [x, y, on] = project(w); const a = on ? env(t, it, 0.5, 0.35) : 0, k = out(P(t, it.from, 0.7));
        const focus = clamp(1 - Math.abs(x - 960) / 900); // nearer the centre: larger, brighter (only one card leads)
        const sc = lerp(0.82, 1.06, focus) * lerp(0.94, 1, k), ty = y - (it.lift ?? 120) - (1 - k) * 30;
        e.style.left = x.toFixed(1) + 'px'; e.style.top = ty.toFixed(1) + 'px'; e.style.transform = `translate(-50%, -100%) scale(${sc.toFixed(4)})`; e.style.transformOrigin = '50% 100%';
        e.style.opacity = (a * lerp(0.55, 1, focus)).toFixed(3);
        if (mat && mat.update) mat.update(t, {});
        stem.setAttribute('x1', x.toFixed(1)); stem.setAttribute('y1', ty.toFixed(1)); stem.setAttribute('x2', x.toFixed(1)); stem.setAttribute('y2', (y - 10).toFixed(1));
        dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1)); stem.style.opacity = dot.style.opacity = (a * 0.8).toFixed(3);
      };
    },
    transfer(it) { // a thing moves between two places on a silk thread (Event A: the shard from Iris to Frost, 13 silk)
      const gid = 'rib' + Math.random().toString(36).slice(2, 7), defs = sv(doc, 'defs'), lg = sv(doc, 'linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse' });
      lg.append(sv(doc, 'stop', { offset: 0, 'stop-color': it.c0 || '#b49be6' }), sv(doc, 'stop', { offset: 1, 'stop-color': it.c1 || NACRE })); defs.append(lg); svg.append(defs);
      const thread = sv(doc, 'path', { fill: 'none', stroke: `url(#${gid})`, 'stroke-width': 3 }), glow = sv(doc, 'path', { fill: 'none', stroke: `url(#${gid})`, 'stroke-width': 12, opacity: 0.18 });
      const shard = sv(doc, 'polygon', { points: '0,-26 12,-4 6,26 -7,24 -12,-2', fill: 'rgba(214,226,236,.85)', stroke: GOLD, 'stroke-width': 1.5 });
      svg.append(glow, thread, shard);
      // a silk spool beside the amount (the badge of Event A): two flanges, the wound thread, a loose end
      const spool = `<svg width="70" height="90" viewBox="0 0 70 90" style="vertical-align:middle;margin-right:18px"><ellipse cx="35" cy="12" rx="26" ry="8" fill="none" stroke="${GOLD}" stroke-width="2"/><ellipse cx="35" cy="78" rx="26" ry="8" fill="none" stroke="${GOLD}" stroke-width="2"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<line x1="13" y1="${20 + i * 7.5}" x2="57" y2="${22 + i * 7.5}" stroke="#ece6d8" stroke-opacity=".75" stroke-width="2.4"/>`).join('')}<path d="M57,60 C70,62 66,82 52,88" fill="none" stroke="#b49be6" stroke-width="2"/></svg>`;
      const amt = el(doc, 'div', 'cl-abs cl-amount', `<div class="w">${esc(it.label)}</div><div>${spool}<span class="v">${esc(it.amount)}</span></div><div class="u">${esc(it.unit || 'SILK')}</div>`); root.append(amt);
      return (t, project) => {
        const [x1, y1] = project(it.a), [x2, y2] = project(it.b), mx = (x1 + x2) / 2, my = Math.min(y1, y2) - (it.arc ?? 220);
        const d = `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`; thread.setAttribute('d', d); glow.setAttribute('d', d);
        lg.setAttribute('x1', x1.toFixed(1)); lg.setAttribute('y1', y1.toFixed(1)); lg.setAttribute('x2', x2.toFixed(1)); lg.setAttribute('y2', y2.toFixed(1));
        const a = env(t, it), L = thread.getTotalLength(), k = out(P(t, it.from, 0.5)), u = inOut(P(t, it.from + 0.25, 0.9));
        thread.setAttribute('stroke-dasharray', `${(L * k).toFixed(1)} ${L}`); thread.style.opacity = a.toFixed(3); glow.style.opacity = (a * 0.2).toFixed(3); glow.setAttribute('stroke-dasharray', `${(L * u).toFixed(1)} ${L}`);
        const q = thread.getPointAtLength(L * u); shard.setAttribute('transform', `translate(${q.x.toFixed(1)},${q.y.toFixed(1)}) rotate(${(u * 220).toFixed(1)})`); shard.style.opacity = (u > 0 ? a : 0).toFixed(3);
        amt.style.left = (it.ax ?? mx) + 'px'; amt.style.top = (it.ay ?? my + 40) + 'px'; amt.style.opacity = env(t, { ...it, from: it.from + 0.55 }).toFixed(3);
      };
    },
    quote(it) { // a declaration given the weight of a line of dialogue (Event B: Salt, "It is a weapon")
      const e = el(doc, 'div', 'cl-abs cl-quote', `“${esc(it.text)}”${it.who ? `<div style="font:600 44px/1 'Source Sans 3',sans-serif;letter-spacing:.36em;text-transform:uppercase;font-style:normal;color:${it.color || PEARL};margin-top:22px">${esc(it.who)}</div>` : ''}`); root.append(e);
      const rs = [0, 1].map(() => sv(doc, 'ellipse', { fill: 'none', stroke: it.color || PEARL, 'stroke-width': 2 })); rs.forEach((r) => svg.append(r));
      // the badge of Event B: a reticle disc on Salt with a crystal blade through it
      const ret = sv(doc, 'g', {}); ret.append(sv(doc, 'circle', { r: 46, fill: 'rgba(16,24,24,.35)', stroke: it.color || PEARL, 'stroke-width': 1.6 }), sv(doc, 'circle', { r: 30, fill: 'none', stroke: 'rgba(236,230,216,.4)', 'stroke-width': 1 }));
      [0, 90, 180, 270].forEach((d) => ret.append(sv(doc, 'line', { x1: 0, y1: -52, x2: 0, y2: -40, stroke: GOLD, 'stroke-width': 2, transform: `rotate(${d})` })));
      ret.append(sv(doc, 'polygon', { points: '-6,30 0,-40 6,30 0,36', fill: 'rgba(220,232,240,.85)', stroke: GOLD, 'stroke-width': 1.2, transform: 'rotate(28)' })); svg.append(ret);
      return (t, project) => {
        const [x, y] = project(it.world), a = env(t, it, 0.5, 0.3), k = out(P(t, it.from, 0.8));
        ret.setAttribute('transform', `translate(${x.toFixed(1)},${(y - 70).toFixed(1)}) scale(${lerp(0.6, 1, settle(P(t, it.from, 0.8))).toFixed(3)}) rotate(${(t * 12).toFixed(1)})`); ret.style.opacity = a.toFixed(3);
        e.style.left = (it.x ?? x) + 'px'; e.style.top = (it.y ?? y - 220) + 'px'; e.style.opacity = a.toFixed(3); e.style.filter = `blur(${(8 * (1 - k)).toFixed(2)}px)`;
        rs.forEach((r, i) => { const q = P(t, it.from + i * 0.35, 1.3); r.setAttribute('cx', x.toFixed(1)); r.setAttribute('cy', y.toFixed(1)); r.setAttribute('rx', (30 + 520 * out(q)).toFixed(1)); r.setAttribute('ry', (10 + 180 * out(q)).toFixed(1)); r.style.opacity = (q > 0 && q < 1 ? a * (1 - q) * 0.8 : 0).toFixed(3); });
      };
    },
    fracture(it) { // a transfer, then the tie breaks (Event C: Ash cheats Amber of 16 silk; the tie cracks, amber flakes fall)
      const line = sv(doc, 'path', { fill: 'none', stroke: 'rgba(236,230,216,.7)', 'stroke-width': 2.5 }); svg.append(line);
      const crack = sv(doc, 'path', { fill: 'none', stroke: RUST, 'stroke-width': 3, 'stroke-linejoin': 'round' }); svg.append(crack);
      const coin = sv(doc, 'circle', { r: 12, fill: GOLD }); svg.append(coin);
      const spark = sv(doc, 'path', { d: 'M0,-26 L5,-5 L26,0 L5,5 L0,26 L-5,5 L-26,0 L-5,-5 Z', fill: '#ffe2b0' }); svg.append(spark);
      let a0 = 11; const r = () => { a0 = (a0 * 16807) % 2147483647; return a0 / 2147483647; };
      const flakes = Array.from({ length: 14 }, () => ({ p: sv(doc, 'polygon', { points: `0,-${4 + r() * 6} ${3 + r() * 5},${r() * 4} -${3 + r() * 4},${2 + r() * 4}`, fill: `rgba(${200 + r() * 40 | 0},${140 + r() * 40 | 0},60,.85)` }), vx: (r() - 0.5) * 160, vy: 40 + r() * 140, rot: r() * 360 }));
      flakes.forEach((f) => svg.append(f.p));
      const amt = el(doc, 'div', 'cl-abs cl-amount', `<div class="w" style="color:#f0b9a8">${esc(it.label)}</div><div class="v">${esc(it.amount)}</div><div class="u">SILK</div>`); root.append(amt);
      return (t, project) => {
        const [x1, y1] = project(it.a), [x2, y2] = project(it.b), mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - (it.arc ?? 60);
        const a = env(t, it), k = out(P(t, it.from, 0.45));
        const sn = out(P(t, it.snap, 0.3)), gap = 90 * sn;
        const d = `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`; line.setAttribute('d', d);
        const L = line.getTotalLength(); line.setAttribute('stroke-dasharray', sn > 0 ? `${(L / 2 - gap / 2).toFixed(1)} ${gap.toFixed(1)} ${L}` : `${(L * k).toFixed(1)} ${L}`);
        line.setAttribute('stroke', sn > 0 ? 'rgba(208,128,106,.65)' : 'rgba(236,230,216,.7)'); line.style.opacity = a.toFixed(3);
        // the silk moves from the victim to the cheat before the break (Amber → Ash)
        const u = inOut(P(t, it.from + 0.2, it.snap - it.from - 0.25)); if (u > 0 && u < 1) { const q = line.getPointAtLength(L * (1 - u)); coin.setAttribute('cx', q.x.toFixed(1)); coin.setAttribute('cy', q.y.toFixed(1)); coin.style.opacity = a.toFixed(3); } else coin.style.opacity = 0;
        const c = line.getPointAtLength(L / 2); let zz = `M${(c.x - 6).toFixed(1)},${(c.y - 40 * sn).toFixed(1)}`; for (let i = 1; i <= 5; i++) zz += ` L${(c.x + (i % 2 ? 10 : -10) * sn).toFixed(1)},${(c.y - 40 * sn + i * 16 * sn).toFixed(1)}`;
        crack.setAttribute('d', zz); crack.style.opacity = (a * sn).toFixed(3);
        const sp = P(t, it.snap, 0.45); spark.setAttribute('transform', `translate(${c.x.toFixed(1)},${c.y.toFixed(1)}) scale(${(sp > 0 && sp < 1 ? Math.sin(Math.PI * sp) * 1.3 : 0).toFixed(3)})`); spark.style.opacity = (a * (sp > 0 && sp < 1 ? 1 : 0)).toFixed(3);
        flakes.forEach((f) => { const q = P(t, it.snap, 1.2); f.p.setAttribute('transform', `translate(${(c.x + f.vx * q).toFixed(1)},${(c.y + f.vy * q + 120 * q * q).toFixed(1)}) rotate(${(f.rot + q * 200).toFixed(1)})`); f.p.style.opacity = (q > 0 ? a * (1 - q) : 0).toFixed(3); });
        amt.style.left = (it.ax ?? mx) + 'px'; amt.style.top = (it.ay ?? my - 170) + 'px'; amt.style.opacity = env(t, { ...it, from: it.from + 0.3 }).toFixed(3);
      };
    },
    panel(it) { // the token panel (style sheet "on-chain proof"): frosted glass, the contract's own art drawing in, the fields
      const S = it.art ?? 380, W = it.w ?? 1240, H = it.h ?? 560;
      const e = el(doc, 'div', 'cl-abs cl-glass'); Object.assign(e.style, { left: it.x + 'px', top: it.y + 'px', width: W + 'px', height: H + 'px' });
      const art = el(doc, 'div', 'cl-abs'); Object.assign(art.style, { left: '60px', top: ((H - S) / 2) + 'px', width: S + 'px', height: S + 'px', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 0 0 1px rgba(236,230,216,.18), 0 0 60px rgba(127,179,213,.25)' });
      art.innerHTML = it.svg.replace(/width="\d+" height="\d+"/, `width="${S}" height="${S}"`);
      const strokes = [...art.querySelectorAll('circle, line')].map((n, i) => ({ n, i, L: 0 })); // lengths are read once mounted
      const col = el(doc, 'div', 'cl-abs', `<div style="font:400 58px/1.1 'Libre Caslon Text',Georgia,serif;margin-bottom:30px;white-space:nowrap">${it.title}</div>` + (it.fields || []).map(([k, v]) => `<div class="cl-label">${esc(k)}</div><div class="cl-value">${esc(v)}</div>`).join(''));
      Object.assign(col.style, { left: (60 + S + 70) + 'px', top: '56px' });
      e.append(art, col); root.append(e);
      const rows = [...col.children];
      return (t) => {
        const a = env(t, it, 0.6, 0.4), k = out(P(t, it.from, 0.8)); e.style.opacity = a.toFixed(3); e.style.transform = `translateY(${((1 - k) * 30).toFixed(1)}px) scale(${lerp(0.97, 1, k).toFixed(4)})`;
        strokes.forEach((o) => { if (!o.L) { o.L = o.n.getTotalLength(); o.n.setAttribute('stroke-dasharray', `${o.L}`); } o.n.setAttribute('stroke-dashoffset', (o.L * (1 - out(P(t, it.from + 0.2 + o.i * 0.06, 0.7)))).toFixed(1)); });
        rows.forEach((r, i) => { const q = out(P(t, it.from + 0.5 + i * 0.09, 0.5)); r.style.opacity = q.toFixed(3); r.style.transform = `translateY(${((1 - q) * 14).toFixed(1)}px)`; });
      };
    },
    crumb(it) { // breadcrumb "Iris · Memory" with a five-dot progress rail, the current dot gold
      const e = el(doc, 'div', 'cl-abs', `<span style="font:400 48px/1 'Libre Caslon Text',Georgia,serif;color:#b49be6">Iris</span> <span style="font:600 44px/1 'Source Sans 3',sans-serif;letter-spacing:.2em;color:${PEARL}"> · ${esc(it.text || 'Memory')}</span>`);
      Object.assign(e.style, { right: '96px', top: '86px', textAlign: 'right' }); root.append(e);
      const rail = sv(doc, 'line', { x1: 1430, y1: 170, x2: 1824, y2: 170, stroke: 'rgba(236,230,216,.4)', 'stroke-width': 1.5 }); svg.append(rail);
      const dots = [0, 1, 2, 3, 4].map((i) => { const c = sv(doc, 'circle', { cx: 1430 + i * 98.5, cy: 170, r: i === (it.at ?? 3) ? 9 : 6, fill: i === (it.at ?? 3) ? GOLD : '#0b0f10', stroke: i === (it.at ?? 3) ? GOLD : 'rgba(236,230,216,.6)', 'stroke-width': 1.5 }); svg.append(c); return c; });
      return (t) => { const a = env(t, it); e.style.opacity = a.toFixed(3); rail.style.opacity = a.toFixed(3); dots.forEach((d, i) => { d.style.opacity = (a * out(P(t, it.from + 0.1 + i * 0.08, 0.4))).toFixed(3); }); };
    },
    rule(it) { // a caption between thin gold rules with a centre diamond ("to see the future *first*")
      const e = el(doc, 'div', 'cl-abs', `<div style="font:italic 400 72px/1.1 'Libre Caslon Text',Georgia,serif;text-shadow:0 3px 30px rgba(0,0,0,.8)">${it.html}</div>`);
      Object.assign(e.style, { left: '0', right: '0', textAlign: 'center', top: (it.y ?? 860) + 'px' }); root.append(e);
      const l1 = sv(doc, 'line', { stroke: GOLD, 'stroke-width': 1.2 }), l2 = sv(doc, 'line', { stroke: GOLD, 'stroke-width': 1.2 }), dm = sv(doc, 'rect', { width: 10, height: 10, fill: GOLD }); svg.append(l1, l2, dm);
      return (t) => { const a = env(t, it), k = out(P(t, it.from, 0.8)), Y = (it.y ?? 860) + 120; [[l1, -1], [l2, 1]].forEach(([l, sgn]) => { l.setAttribute('x1', 960 + sgn * 24); l.setAttribute('x2', (960 + sgn * (24 + 360 * k)).toFixed(1)); l.setAttribute('y1', Y); l.setAttribute('y2', Y); l.style.opacity = a.toFixed(3); }); dm.setAttribute('transform', `translate(960,${Y}) rotate(45) translate(-5,-5)`); dm.style.opacity = a.toFixed(3); e.style.opacity = a.toFixed(3); };
    },
    title(it) { // the chapter title emerging from the atmosphere: blur sharpens, the letters breathe apart a little
      const e = el(doc, 'div', 'cl-abs cl-title', (it.eyebrow ? `<div class="cl-eyebrow">${esc(it.eyebrow)}</div>` : '') + esc(it.text));
      e.style.top = (it.y ?? 400) + 'px'; root.append(e);
      return (t) => { const a = env(t, it, 0.9, 0.4), k = out(P(t, it.from, 1.2)); e.style.opacity = a.toFixed(3); e.style.filter = `blur(${(14 * (1 - k)).toFixed(2)}px)`; e.style.letterSpacing = `${(0.08 * (1 - k)).toFixed(3)}em`; };
    },
    pin(it) { // a clan's identity above its head: name, temper, a hairline stem down to the head
      const e = el(doc, 'div', 'cl-abs cl-name', `${esc(it.name)}<span class="cl-temper">${esc(it.sub || '')}</span>`); e.style.color = it.color || PEARL; root.append(e);
      const stem = sv(doc, 'line', { stroke: it.color || PEARL, 'stroke-width': 2, opacity: 0.7 }); const dot = sv(doc, 'circle', { r: 6, fill: 'none', stroke: it.color || PEARL, 'stroke-width': 2 });
      svg.append(stem, dot);
      return (t, project, target) => {
        const w = it.target ? (target(it.target) || {}).pos : it.world; if (!w) return;
        const [x, y, on] = project(w); const a = on ? env(t, it) : 0, k = out(P(t, it.from, 0.6));
        const lift = it.lift ?? 150, ty = y - lift - (1 - k) * 24;
        e.style.left = x.toFixed(1) + 'px'; e.style.top = ty.toFixed(1) + 'px'; e.style.opacity = a.toFixed(3);
        stem.setAttribute('x1', x.toFixed(1)); stem.setAttribute('y1', (ty + 12).toFixed(1)); stem.setAttribute('x2', x.toFixed(1)); stem.setAttribute('y2', lerp(ty + 12, y - 14, k).toFixed(1));
        dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1)); stem.style.opacity = dot.style.opacity = (a * 0.8).toFixed(3);
      };
    },
    link(it) { // a relationship between two real places: draws on, a packet travels, it can snap
      const glow = sv(doc, 'path', { fill: 'none', stroke: it.color || GOLD, 'stroke-width': 14, 'stroke-linecap': 'round', opacity: 0.18 });
      const p = sv(doc, 'path', { fill: 'none', stroke: it.color || GOLD, 'stroke-width': 4, 'stroke-linecap': 'round' });
      const pk = sv(doc, 'circle', { r: 9, fill: it.color || GOLD }), pkg = sv(doc, 'circle', { r: 22, fill: it.color || GOLD, opacity: 0.2 });
      svg.append(glow, p, pkg, pk);
      const lab = it.label ? el(doc, 'div', 'cl-abs cl-line', esc(it.label)) : null; if (lab) { lab.style.color = it.labelColor || PEARL; root.append(lab); }
      const sub = it.sub ? el(doc, 'div', 'cl-abs cl-small', esc(it.sub)) : null; if (sub) { sub.style.transform = 'translate(-50%, 0)'; root.append(sub); }
      return (t, project, target) => {
        const A = it.aTarget ? (target(it.aTarget) || {}).pos : it.a, B = it.bTarget ? (target(it.bTarget) || {}).pos : it.b; if (!A || !B) return;
        const [x1, y1] = project(A), [x2, y2] = project(B);
        const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - (it.arc ?? 120);
        const d = `M${x1.toFixed(1)},${y1.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
        p.setAttribute('d', d); glow.setAttribute('d', d);
        const a = env(t, it), L = p.getTotalLength(), k = out(P(t, it.from, 0.55));
        const snapK = it.snap != null ? out(P(t, it.snap, 0.35)) : 0, gap = 80 * snapK;
        p.setAttribute('stroke-dasharray', snapK > 0 ? `${(L / 2 - gap / 2).toFixed(1)} ${gap.toFixed(1)} ${L}` : (it.dashed ? '12 14' : `${(L * k).toFixed(1)} ${L}`));
        glow.setAttribute('stroke-dasharray', p.getAttribute('stroke-dasharray'));
        p.style.opacity = (a * (1 - 0.45 * snapK)).toFixed(3); glow.style.opacity = (a * 0.18 * (1 - snapK)).toFixed(3);
        const u = it.packet === false ? -1 : P(t, it.from + 0.35, 0.8);
        if (u > 0 && u < 1 && snapK === 0) { const q = p.getPointAtLength(L * u); pk.setAttribute('cx', q.x.toFixed(1)); pk.setAttribute('cy', q.y.toFixed(1)); pkg.setAttribute('cx', q.x.toFixed(1)); pkg.setAttribute('cy', q.y.toFixed(1)); pk.style.opacity = pkg.style.opacity = a.toFixed(3); }
        else pk.style.opacity = pkg.style.opacity = 0;
        const la = env(t, { ...it, from: it.from + 0.4 });
        if (lab) { lab.style.left = mx.toFixed(1) + 'px'; lab.style.top = (my + (it.labelDy ?? -10)).toFixed(1) + 'px'; lab.style.opacity = la.toFixed(3); }
        if (sub) { sub.style.left = mx.toFixed(1) + 'px'; sub.style.top = (my + (it.labelDy ?? -10) + 40).toFixed(1) + 'px'; sub.style.opacity = la.toFixed(3); }
      };
    },
    ring(it) { // a broadcast: a ring expands from a place over the island
      const rs = [0, 1, 2].map(() => sv(doc, 'ellipse', { fill: 'none', stroke: it.color || PEARL, 'stroke-width': 3 })); rs.forEach((r) => svg.append(r));
      const lab = el(doc, 'div', 'cl-abs cl-line', esc(it.label || '')); root.append(lab);
      return (t, project, target) => {
        const w = it.target ? (target(it.target) || {}).pos : it.world; if (!w) return;
        const [x, y] = project(w), a = env(t, it);
        rs.forEach((r, i) => { const k = P(t, it.from + i * 0.28, 1.4); r.setAttribute('cx', x.toFixed(1)); r.setAttribute('cy', y.toFixed(1)); r.setAttribute('rx', (40 + 700 * out(k)).toFixed(1)); r.setAttribute('ry', (14 + 250 * out(k)).toFixed(1)); r.style.opacity = (k > 0 && k < 1 ? a * (1 - k) * 0.9 : 0).toFixed(3); });
        lab.style.left = x.toFixed(1) + 'px'; lab.style.top = (y - (it.lift ?? 200)).toFixed(1) + 'px'; lab.style.opacity = env(t, { ...it, from: it.from + 0.3 }).toFixed(3);
      };
    },
    cracks(it) { // ink fractures drawn across an object (seeded branches, the Guests' ink)
      const g = sv(doc, 'g', {}); svg.append(g);
      let a = 7; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
      const paths = [];
      for (let i = 0; i < 9; i++) {
        let x = 0, y = 0, ang = r() * Math.PI * 2, d = 'M0,0'; const n = 4 + Math.floor(r() * 4);
        for (let k = 0; k < n; k++) { ang += (r() - 0.5) * 1.1; const step = (it.size ?? 160) / n * (0.6 + r() * 0.8); x += Math.cos(ang) * step; y += Math.sin(ang) * step; d += ` L${x.toFixed(1)},${y.toFixed(1)}`; }
        const p = sv(doc, 'path', { d, fill: 'none', stroke: it.color || PEARL, 'stroke-width': 1.6 + r() * 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); g.append(p); paths.push({ p, L: 0, delay: r() * 0.35 });
      }
      return (t, project) => {
        const [x, y] = project(it.world); g.setAttribute('transform', `translate(${(x + (it.dx ?? 0)).toFixed(1)},${(y + (it.dy ?? 0)).toFixed(1)})`);
        const a = env(t, it, 0.2, 0.5);
        paths.forEach((o) => { if (!o.L) o.L = o.p.getTotalLength(); const k = out(P(t, it.from + o.delay, 0.55)); o.p.setAttribute('stroke-dasharray', `${o.L}`); o.p.setAttribute('stroke-dashoffset', (o.L * (1 - k)).toFixed(1)); o.p.style.opacity = a.toFixed(3); });
      };
    },
    sign(it) { // a real logogram rising out of an object as ink, drawn by the game's own code
      const px = it.size ?? 300, c = el(doc, 'canvas', 'cl-abs'); c.width = c.height = px; root.append(c);
      const lab = it.label ? el(doc, 'div', 'cl-abs cl-small', esc(it.label)) : null; if (lab) root.append(lab);
      return (t, project) => {
        const [x, y] = project(it.world), k = out(P(t, it.from, 0.9)), a = env(t, it);
        const tx = x + (it.dx ?? 0) * k - px / 2, ty = y + (it.dy ?? -200) * k - px / 2;
        c.style.left = tx.toFixed(1) + 'px'; c.style.top = ty.toFixed(1) + 'px'; c.style.opacity = a.toFixed(3); c.style.transform = `scale(${lerp(0.4, 1, k).toFixed(4)})`;
        drawLogogram(c.getContext('2d'), { forms: it.forms, dots: it.dots }, { size: px, progress: inOut(P(t, it.from + 0.15, 1.0)), time: t, glow: 'rgba(196, 220, 232, 0.85)' });
        if (lab) { lab.style.left = (tx + px / 2).toFixed(1) + 'px'; lab.style.top = (ty + px + 6).toFixed(1) + 'px'; lab.style.transform = 'translate(-50%, 0)'; lab.style.opacity = env(t, { ...it, from: it.from + 0.5 }).toFixed(3); }
      };
    },
    token(it) { // the contract's SVG assembling out of a world point: every circle and stroke flies in and locks
      const box = el(doc, 'div', 'cl-abs'); const S = it.size ?? 420; box.style.width = box.style.height = S + 'px';
      box.innerHTML = it.svg.replace(/width="\d+" height="\d+"/, `width="${S}" height="${S}"`);
      box.style.borderRadius = '22px'; box.style.overflow = 'hidden'; box.style.boxShadow = '0 0 0 1px rgba(220,214,196,.18), 0 30px 80px rgba(0,0,0,.6), 0 0 80px rgba(127,179,213,.25)';
      root.append(box);
      const parts = [...box.querySelectorAll('svg > *')].map((e, i) => ({ e, i, sx: Math.sin(i * 12.9898) * 400, sy: Math.cos(i * 78.233) * 300 }));
      const hero = el(doc, 'div', 'cl-abs', `<div style="font:600 44px/1 'Source Sans 3',sans-serif;letter-spacing:.3em;color:${GOLD};text-transform:uppercase">NEP-171 token</div><div style="font:400 72px/1.1 'Libre Caslon Text',Georgia,serif;margin-top:14px;text-shadow:0 3px 24px rgba(0,0,0,.8)">${esc(it.hero)}</div>`);
      const meta = el(doc, 'div', 'cl-abs cl-small', (it.meta || []).map(esc).join('<br>'));
      root.append(hero, meta);
      if (!it.hero) hero.style.display = 'none';
      return (t, project) => {
        const [x, y] = project(it.world), k = inOut(P(t, it.from, it.assemble ?? 1.2));
        const X = it.x ?? 300, Y = it.y ?? 240;
        box.style.left = lerp(x - S / 2, X, k).toFixed(1) + 'px'; box.style.top = lerp(y - S / 2, Y, k).toFixed(1) + 'px';
        box.style.transform = `scale(${lerp(0.2, 1, k).toFixed(4)})`; box.style.transformOrigin = '50% 50%';
        const a = env(t, it, 0.25); box.style.opacity = a.toFixed(3);
        parts.forEach((p) => { const q = out(P(t, it.from + 0.1 + (p.i % 9) * 0.07, 0.8)); p.e.setAttribute('transform', `translate(${(p.sx * (1 - q)).toFixed(1)},${(p.sy * (1 - q)).toFixed(1)})`); p.e.style.opacity = p.i === 0 ? '1' : q.toFixed(3); });
        hero.style.left = (X + S + 60) + 'px'; hero.style.top = (Y + 30) + 'px'; hero.style.opacity = env(t, { ...it, from: it.from + 0.8 }).toFixed(3);
        meta.style.left = (X + S + 60) + 'px'; meta.style.top = (Y + 210) + 'px'; meta.style.opacity = env(t, { ...it, from: it.from + 1.1 }).toFixed(3);
      };
    },
    seal(it) { // the season seal: a gold ring closing around a screen box, its root beside it
      const r = sv(doc, 'circle', { fill: 'none', stroke: GOLD, 'stroke-width': 3 }); svg.append(r);
      const lab = el(doc, 'div', 'cl-abs', `<span style="font:600 44px/1 'Source Sans 3',sans-serif;letter-spacing:.3em;color:${GOLD};text-transform:uppercase">${esc(it.label)}</span> <span class="cl-mono">${esc(it.value)}</span>`); root.append(lab);
      return (t) => {
        const R = it.r ?? 330, C = 2 * Math.PI * R, k = inOut(P(t, it.from, 0.9)), s = settle(P(t, it.from + 0.8, 0.8));
        r.setAttribute('cx', it.cx); r.setAttribute('cy', it.cy); r.setAttribute('r', (R * lerp(1.08, 1, s)).toFixed(1));
        r.setAttribute('stroke-dasharray', `${C}`); r.setAttribute('stroke-dashoffset', (C * (1 - k)).toFixed(1)); r.setAttribute('transform', `rotate(-90 ${it.cx} ${it.cy})`);
        r.style.opacity = env(t, it).toFixed(3);
        lab.style.left = it.lx + 'px'; lab.style.top = it.ly + 'px'; lab.style.opacity = env(t, { ...it, from: it.from + 0.6 }).toFixed(3);
      };
    },
    node(it) { // a place the data goes to, pinned in the world (the season contract over its Shell)
      const e = el(doc, 'div', 'cl-abs cl-glass', `<div style="font:400 60px/1.1 'Libre Caslon Text',Georgia,serif">${esc(it.title)}</div><div class="cl-mono" style="margin-top:10px">${esc(it.sub || '')}</div>`);
      Object.assign(e.style, { transform: 'translate(-50%, -100%)', textAlign: 'center', padding: '24px 40px 26px' }); root.append(e);
      const ring = sv(doc, 'circle', { r: 16, fill: 'none', stroke: NACRE, 'stroke-width': 3 }); svg.append(ring);
      return (t, project) => { const [x, y, on] = project(it.world), a = on ? env(t, it) : 0; e.style.left = x.toFixed(1) + 'px'; e.style.top = (y - 40).toFixed(1) + 'px'; e.style.opacity = a.toFixed(3); ring.setAttribute('cx', x.toFixed(1)); ring.setAttribute('cy', y.toFixed(1)); ring.setAttribute('r', (16 + 10 * Math.sin(t * 3)).toFixed(2)); ring.style.opacity = a.toFixed(3); };
    },
    screenLink(it) { // a dotted link from a screen point to a world point (the token to the season contract)
      const p = sv(doc, 'path', { fill: 'none', stroke: NACRE, 'stroke-width': 3, 'stroke-dasharray': '10 14' }); svg.append(p);
      const pk = sv(doc, 'circle', { r: 8, fill: NACRE }); svg.append(pk);
      return (t, project) => {
        const [x2, y2] = project(it.world), [x1, y1] = it.from2 || [0, 0], k = out(P(t, it.from, 0.8));
        const xe = lerp(x1, x2, k), ye = lerp(y1, y2 + 30, k);
        p.setAttribute('d', `M${x1},${y1} C${x1 + 200},${y1 - 120} ${xe - 160},${ye + 140} ${xe.toFixed(1)},${ye.toFixed(1)}`);
        const a = env(t, it); p.style.opacity = a.toFixed(3);
        const L = p.getTotalLength(), u = ((t - it.from - 0.8) % 1.1) / 1.1; if (t > it.from + 0.8) { const q = p.getPointAtLength(L * u); pk.setAttribute('cx', q.x.toFixed(1)); pk.setAttribute('cy', q.y.toFixed(1)); pk.style.opacity = a.toFixed(3); } else pk.style.opacity = 0;
      };
    },
    text(it) { // a screen-placed line (the climax statement, a caption in the jury style)
      const e = el(doc, 'div', 'cl-abs', `<div style="font:${it.big ? "400 84px/1.1 'Libre Caslon Text',Georgia,serif" : "700 64px/1.15 'Atkinson Hyperlegible',sans-serif"};text-shadow:0 3px 30px rgba(0,0,0,.85)">${it.html || esc(it.text)}</div>${it.sub ? `<div class="cl-small" style="margin-top:14px">${esc(it.sub)}</div>` : ''}`);
      e.style.left = (it.x ?? 0) + 'px'; e.style.right = it.x == null ? '0' : ''; e.style.textAlign = it.x == null ? 'center' : 'left'; e.style.top = (it.y ?? 96) + 'px'; root.append(e);
      return (t) => { const a = env(t, it); e.style.opacity = a.toFixed(3); e.style.transform = `translateY(${((1 - out(P(t, it.from, 0.4))) * 12).toFixed(1)}px)`; };
    },
  };

  return {
    set(items = []) {
      root.querySelectorAll('.cl-abs').forEach((n) => n.remove());
      while (svg.firstChild) svg.firstChild.remove();
      nodes = items.map((it) => (builders[it.kind] ? builders[it.kind](it) : null)).filter(Boolean);
    },
    update(t, project, target) {
      const w = doc.defaultView.innerWidth, h = doc.defaultView.innerHeight;
      root.style.transform = `scale(${w / 1920}, ${h / 1080})`;
      for (const n of nodes) n(t, project, target);
    },
  };
}
