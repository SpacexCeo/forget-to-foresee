// Design system of the jury video's motion graphics (docs/submission/jury-video.md): one palette, one type scale, one
// surface, one connector language and one material motif per clan, shared by every scene.
//
// Palette (restrained): charcoal ground, deep grey-green surfaces, pearl/ivory type, muted silver structure, warm amber
// only for what is confirmed or discovered. Each clan owns one quiet accent and one material, drawn procedurally (no stock
// imagery): Salt mineral crystals, Iris a violet iris petal, Frost frost dendrites, Ash drifting particulate ash, Moss
// organic tufts, Amber translucent resin. The material sits on the right of the card behind a fade, never under the text.
// Everything is deterministic: a seeded generator draws each motif the same way on every frame and every run.

export const T = Object.freeze({
  charcoal: '#0b0f10', ground: '#0f1716', surface: '#142020', surface2: '#18262533',
  pearl: '#ece6d8', ivory: '#f3ead6', mist: '#9aa8a4', silver: '#a9b0ad', hair: 'rgba(220, 214, 196, .16)',
  amber: '#e8b25a', amberSoft: 'rgba(232, 178, 90, .55)', amberGlow: 'rgba(232, 178, 90, .22)',
  broken: 'rgba(154, 168, 164, .38)', verified: '#e8b25a',
  radius: 18, line: 3, anchor: 6,
});

export const CLAN = Object.freeze({
  iris: { name: 'Iris', temper: 'You', accent: '#b49be6' },
  salt: { name: 'Salt', temper: 'Cunning', accent: '#d9dcd6' },
  ash: { name: 'Ash', temper: 'Wary', accent: '#bdb6ad' },
  moss: { name: 'Moss', temper: 'Honest', accent: '#9cba7c' },
  amber: { name: 'Amber', temper: 'Greedy', accent: '#e6a84a' },
  frost: { name: 'Frost', temper: 'Scholar', accent: '#a9c6d4' },
});

const NS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null) el.append(c);
  return el;
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
let uid = 0;
const id = (p) => `${p}${++uid}`;

/* ---------- materials: each returns an SVG <g> drawn in a w×h box; `update(t, state)` animates it where it means something ---------- */
const MATERIAL = {
  salt(w, h) { // mineral prisms: cool, faceted, a little light on the upper faces
    const r = rng(11), g = s('g');
    for (let i = 0; i < 9; i++) {
      const x = w * (0.58 + r() * 0.38), base = h * (0.95 + r() * 0.1), hh = h * (0.35 + r() * 0.5), ww = 18 + r() * 26, lean = (r() - 0.5) * 30;
      const tip = [x + lean, base - hh], l = [x - ww / 2, base], rr = [x + ww / 2, base], sh = [x - ww / 2 + lean * 0.8, base - hh * 0.82], sh2 = [x + ww / 2 + lean * 0.8, base - hh * 0.82];
      const pts = (a) => a.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
      g.append(s('polygon', { points: pts([l, sh, tip, sh2, rr]), fill: 'rgba(214,218,212,.10)', stroke: 'rgba(230,232,226,.42)', 'stroke-width': 1.3 }));
      g.append(s('polygon', { points: pts([sh, tip, [x + lean * 0.9, base - hh * 0.8]]), fill: 'rgba(240,242,238,.20)' }));
      g.append(s('line', { x1: (x + lean * 0.9).toFixed(1), y1: (base - hh * 0.8).toFixed(1), x2: x.toFixed(1), y2: base.toFixed(1), stroke: 'rgba(240,242,238,.18)', 'stroke-width': 1 }));
    }
    return { g };
  },
  iris(w, h) { // three falls of an iris flower, violet with one gold vein each
    const g = s('g'), gid = id('ir');
    g.append(s('defs', {}, s('linearGradient', { id: gid, x1: 0, y1: 0, x2: 1, y2: 1 }, s('stop', { offset: 0, 'stop-color': '#c9b4f2', 'stop-opacity': 0.55 }), s('stop', { offset: 1, 'stop-color': '#5b3f9e', 'stop-opacity': 0.25 }))));
    const cx = w * 0.78, cy = h * 0.62;
    [[-60, 1], [10, 0.92], [80, 0.8]].forEach(([deg, k]) => {
      const p = s('path', { d: `M0,0 C${40 * k},${-30 * k} ${120 * k},${-40 * k} ${150 * k},${-6 * k} C${120 * k},${30 * k} ${50 * k},${30 * k} 0,0 Z`, fill: `url(#${gid})`, stroke: 'rgba(214,198,246,.35)', 'stroke-width': 1, transform: `translate(${cx},${cy}) rotate(${deg})` });
      const v = s('path', { d: `M8,0 C${50 * k},-6 ${90 * k},-8 ${120 * k},-4`, fill: 'none', stroke: 'rgba(232,178,90,.55)', 'stroke-width': 1.4, transform: `translate(${cx},${cy}) rotate(${deg})` });
      g.append(p, v);
    });
    return { g };
  },
  frost(w, h) { // a six-fold dendrite and a few smaller ones: thin, cold, precise
    const g = s('g'), r = rng(23);
    const branch = (x, y, ang, len, depth) => {
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      g.append(s('line', { x1: x.toFixed(1), y1: y.toFixed(1), x2: x2.toFixed(1), y2: y2.toFixed(1), stroke: `rgba(196,220,232,${0.18 + depth * 0.09})`, 'stroke-width': 0.6 + depth * 0.45, 'stroke-linecap': 'round' }));
      if (depth > 0) for (let k = 1; k <= 3; k++) { const f = k / 4, bx = x + (x2 - x) * f, by = y + (y2 - y) * f; branch(bx, by, ang + 1.05, len * 0.36 * (1 - f * 0.4), depth - 1); branch(bx, by, ang - 1.05, len * 0.36 * (1 - f * 0.4), depth - 1); }
    };
    [[w * 0.78, h * 0.5, 62, 2], [w * 0.64, h * 0.84, 28, 1], [w * 0.97, h * 0.15, 26, 1]].forEach(([x, y, L, d]) => { for (let i = 0; i < 6; i++) branch(x, y, (i * Math.PI) / 3 + r() * 0.05, L, d); });
    return { g };
  },
  ash(w, h) { // particulate ash drifting off a pale stone edge; `update` carries it away while Ash is isolated
    const g = s('g'), r = rng(37), dots = [];
    g.append(s('path', { d: `M${w * 0.38},${h} C${w * 0.55},${h * 0.62} ${w * 0.8},${h * 0.7} ${w},${h * 0.38} L${w},${h} Z`, fill: 'rgba(189,182,173,.10)', stroke: 'rgba(189,182,173,.22)', 'stroke-width': 1 }));
    for (let i = 0; i < 150; i++) {
      const x = w * (0.55 + Math.pow(r(), 0.7) * 0.45), y = h * (0.15 + r() * 0.85), rr = 0.6 + r() * 1.9;
      const c = s('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: rr.toFixed(2), fill: `rgba(214,208,198,${(0.18 + r() * 0.5).toFixed(2)})` });
      dots.push({ c, x, y, vx: 10 + r() * 40, vy: -8 - r() * 26, ph: r() * 6.28 }); g.append(c);
    }
    return { g, update(t, { drift = 0 } = {}) { for (const d of dots) { d.c.setAttribute('cx', (d.x + d.vx * drift + Math.sin(t * 0.9 + d.ph) * 1.5).toFixed(1)); d.c.setAttribute('cy', (d.y + d.vy * drift).toFixed(1)); } } };
  },
  moss(w, h) { // organic tufts along a low mound, two greens, a few fronds
    const g = s('g'), r = rng(51);
    for (let i = 0; i < 70; i++) {
      const x = w * (0.56 + r() * 0.44), y = h * (0.62 + r() * 0.38) + Math.sin(x * 0.02) * 6, rr = 5 + r() * 11;
      g.append(s('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: rr.toFixed(1), fill: r() < 0.5 ? 'rgba(112,146,86,.22)' : 'rgba(156,186,124,.16)' }));
    }
    for (let i = 0; i < 14; i++) {
      const x = w * (0.5 + r() * 0.48), y = h * (0.66 + r() * 0.2), L = 18 + r() * 26, a = -Math.PI / 2 + (r() - 0.5) * 0.9;
      g.append(s('path', { d: `M${x.toFixed(1)},${y.toFixed(1)} q${(Math.cos(a) * L * 0.5 + 6).toFixed(1)},${(Math.sin(a) * L * 0.5).toFixed(1)} ${(Math.cos(a) * L).toFixed(1)},${(Math.sin(a) * L).toFixed(1)}`, fill: 'none', stroke: 'rgba(172,204,138,.35)', 'stroke-width': 1.2, 'stroke-linecap': 'round' }));
    }
    return { g };
  },
  amber(w, h) { // a translucent resin drop with inclusions and one restrained highlight
    const g = s('g'), gid = id('am'), r = rng(67);
    g.append(s('defs', {}, s('radialGradient', { id: gid, cx: '40%', cy: '35%', r: '70%' }, s('stop', { offset: 0, 'stop-color': '#f7d08a', 'stop-opacity': 0.55 }), s('stop', { offset: 0.55, 'stop-color': '#c97f22', 'stop-opacity': 0.35 }), s('stop', { offset: 1, 'stop-color': '#5a3208', 'stop-opacity': 0.25 }))));
    const cx = w * 0.8, cy = h * 0.58;
    g.append(s('path', { d: `M${cx - 70},${cy + 10} C${cx - 72},${cy - 50} ${cx - 10},${cy - 78} ${cx + 40},${cy - 56} C${cx + 86},${cy - 34} ${cx + 82},${cy + 40} ${cx + 30},${cy + 62} C${cx - 20},${cy + 80} ${cx - 68},${cy + 56} ${cx - 70},${cy + 10} Z`, fill: `url(#${gid})`, stroke: 'rgba(240,190,110,.45)', 'stroke-width': 1.2 }));
    for (let i = 0; i < 9; i++) g.append(s('circle', { cx: (cx - 40 + r() * 90).toFixed(1), cy: (cy - 40 + r() * 80).toFixed(1), r: (0.8 + r() * 2.2).toFixed(2), fill: 'rgba(60,30,6,.55)' }));
    g.append(s('path', { d: `M${cx - 40},${cy - 30} C${cx - 30},${cy - 52} ${cx},${cy - 60} ${cx + 18},${cy - 54}`, fill: 'none', stroke: 'rgba(255,236,200,.5)', 'stroke-width': 2, 'stroke-linecap': 'round' }));
    return { g };
  },
};

/**
 * A clan card: the name in the display face (tinted by the clan's accent), the temper as a tracked label, the clan's
 * material on the right behind a fade. Returns { el, anchor(side) → [x, y] in stage px, set(state) }.
 */
export function clanCard(clan, { x, y, w = 440, h = 164, player = false } = {}) {
  const c = CLAN[clan];
  const el = document.createElement('div');
  el.className = 'ds-card' + (player ? ' ds-player' : '');
  Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  const mask = id('mk');
  const art = s('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, class: 'ds-art' },
    s('defs', {}, s('linearGradient', { id: mask + 'g', x1: 0, y1: 0, x2: 1, y2: 0 }, s('stop', { offset: 0.45, 'stop-color': '#fff', 'stop-opacity': 0 }), s('stop', { offset: 0.8, 'stop-color': '#fff', 'stop-opacity': 1 })),
      s('mask', { id: mask }, s('rect', { width: w, height: h, fill: `url(#${mask}g)` }))));
  const mat = MATERIAL[clan](w, h);
  const mg = s('g', { mask: `url(#${mask})` }, mat.g);
  art.append(mg);
  const name = document.createElement('div'); name.className = 'ds-name'; name.textContent = c.name; name.style.color = c.accent;
  const temper = document.createElement('div'); temper.className = 'ds-temper'; temper.textContent = c.temper;
  const note = document.createElement('div'); note.className = 'ds-note';
  el.append(art, name, temper, note);
  if (player) el.style.setProperty('--ds-edge', c.accent);
  const anchor = (side) => side === 'top' ? [x + w / 2, y] : side === 'bottom' ? [x + w / 2, y + h] : side === 'left' ? [x, y + h / 2] : [x + w, y + h / 2];
  return {
    el, x, y, w, h, anchor,
    /** state: { cool 0..1 (isolated: the material and name cool down), drift 0..1 (Ash's particles carried off), note } */
    set(t, st = {}) {
      const cool = st.cool || 0;
      el.style.setProperty('--ds-cool', cool.toFixed(3));
      name.style.opacity = (1 - 0.45 * cool).toFixed(3);
      art.style.opacity = (1 - 0.6 * cool).toFixed(3);
      if (mat.update) mat.update(t, st);
      if (st.note != null) { note.textContent = st.note; note.style.opacity = (st.noteAlpha ?? 1).toFixed(3); }
    },
  };
}

/** An anchor node: a small ring on a card edge where a relationship attaches. */
export function anchorNode(svg, [x, y]) { const g = s('g', { transform: `translate(${x},${y})` }, s('circle', { r: T.anchor + 3, fill: T.ground }), s('circle', { r: T.anchor, fill: 'none', stroke: T.silver, 'stroke-width': 1.6 })); svg.append(g); return g; }

/** An orthogonal route between two points with rounded elbows (one bend at mid-x or mid-y). */
export function route([x1, y1], [x2, y2], { via = 'h', r = 22, mid = null } = {}) {
  if (x1 === x2 || y1 === y2) return `M${x1},${y1} L${x2},${y2}`;
  if (via === 'h') { const mx = (x1 + x2) / 2, sx = Math.sign(x2 - x1), sy = Math.sign(y2 - y1), rr = Math.min(r, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2);
    return `M${x1},${y1} L${mx - sx * rr},${y1} Q${mx},${y1} ${mx},${y1 + sy * rr} L${mx},${y2 - sy * rr} Q${mx},${y2} ${mx + sx * rr},${y2} L${x2},${y2}`; }
  const my = mid ?? (y1 + y2) / 2, sx = Math.sign(x2 - x1), sy = Math.sign(y2 - y1), rr = Math.min(r, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2);
  return `M${x1},${y1} L${x1},${my - sy * rr} Q${x1},${my} ${x1 + sx * rr},${my} L${x2 - sx * rr},${my} Q${x2},${my} ${x2},${my + sy * rr} L${x2},${y2}`;
}

/** The key glyph of the system: a fine-line key (ring bow, shaft, two bits), drawn at the origin, ~84 px long. */
export function keyGlyph(color = T.amber) {
  return s('g', { fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    s('circle', { cx: 0, cy: 0, r: 15 }), s('circle', { cx: 0, cy: 0, r: 5 }),
    s('path', { d: 'M15,0 L84,0 M66,0 L66,14 M76,0 L76,10' }));
}

export const CSS = `
.ds-card { position: absolute; border-radius: ${T.radius}px; overflow: hidden;
  background: linear-gradient(180deg, rgba(24,36,35,.96), rgba(14,22,22,.96));
  box-shadow: 0 1px 0 rgba(255,255,255,.05) inset, 0 0 0 1px ${T.hair}, 0 18px 40px rgba(0,0,0,.45);
  filter: saturate(calc(1 - var(--ds-cool, 0) * .85)) brightness(calc(1 - var(--ds-cool, 0) * .22)); }
.ds-card.ds-player { box-shadow: 0 1px 0 rgba(255,255,255,.06) inset, 0 0 0 1.5px color-mix(in srgb, var(--ds-edge) 70%, transparent), 0 0 46px color-mix(in srgb, var(--ds-edge) 18%, transparent), 0 18px 40px rgba(0,0,0,.45); }
.ds-art { position: absolute; inset: 0; }
.ds-name { position: absolute; left: 30px; top: 22px; font: 400 66px/1 "Libre Caslon Text", Georgia, serif; letter-spacing: .005em; }
.ds-temper { position: absolute; left: 32px; top: 100px; font: 600 40px/1 "Source Sans 3", sans-serif; letter-spacing: .26em; text-transform: uppercase; color: ${T.mist}; }
.ds-note { display: none; position: absolute; right: 26px; top: 100px; font: 600 40px/1 "Source Sans 3", sans-serif; letter-spacing: .18em; text-transform: uppercase; color: ${T.mist}; opacity: 0; }
`;
