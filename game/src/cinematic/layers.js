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
      const e = el(doc, 'div', 'cl-abs', `<div style="font:700 56px/1.1 'Atkinson Hyperlegible',sans-serif">${esc(it.title)}</div><div class="cl-mono" style="margin-top:8px">${esc(it.sub || '')}</div>`);
      e.style.transform = 'translate(-50%, -100%)'; e.style.textAlign = 'center'; root.append(e);
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
