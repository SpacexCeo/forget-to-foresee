// The wheel of fortune's screen (owner, 12.11: "nobody can see the prizes"): twelve sectors that show their prize (the
// item's icon, a silk coin, an XP star, a chest, a title scroll, the grand prize's sheriff star) with its amount and a
// rarity colour; a pointer that flicks on every peg with a tick; a spin with a wind-up, a fast turn and a long ease-out
// whose ticks slow with the wheel; a landing flash; a reward card in the prize's rarity frame with Claim, which puts
// the prize into the real stores (game/wheel.js claimPrize) and flies its icon to the bag. Unclaimed results wait
// (persisted) and come back on the next visit. The rules, odds and seeds are game/wheel.js; this is presentation.
// Placeholder visuals until GPT's WHEEL-001 frames arrive (restyle here, the mechanics stay).
import { SEGMENTS, SKIN_CAP, odds, claimPrize } from '../game/wheel.js';

export const RARITY_COLORS = Object.freeze({
  common: ['#5b6b66', '#3d4a46'], uncommon: ['#3f8f5e', '#2a6342'], rare: ['#3f73c4', '#2a4f8c'],
  epic: ['#8a52c9', '#5f3591'], legendary: ['#d08a2a', '#94601a'], mythic: ['#1b1410', '#0b0806'],
});
export const RARITY_FRAME = Object.freeze({ common: '#9fb3ad', uncommon: '#5fd08a', rare: '#6aa8ff', epic: '#c08bff', legendary: '#ffbe55', mythic: '#ffd76a' });
const STEP = 360 / SEGMENTS.length;
export const SPIN = Object.freeze({ windup: 0.38, windupDeg: 14, turns: 6, seconds: 5.6 });

/** The pointer's angle for segment i at the top (the wheel turns, segment i sits at i·STEP clockwise). */
export const landingAngle = (from, index, turns = SPIN.turns) => from - (((from % 360) + 360) % 360) + turns * 360 + ((360 - index * STEP) % 360);
/** Ease-out over the main turn: fast at first, a long slow end (quartic). */
export const easeOut = (u) => 1 - (1 - u) ** 4;
/** Which peg the pointer is over at a wheel angle (ticks fire when it changes). */
export const pegAt = (deg) => Math.floor((deg + STEP / 2) / STEP);

/** A sector's shown amount: silk in whole silk, XP, ×1 for items and chests; the grand prize says NFT. */
export function sectorLabel(seg, t) {
  if (seg.kind === 'silk') return String(seg.amount / 100);
  if (seg.kind === 'xp') return seg.amount + ' XP';
  if (seg.kind === 'skin') return 'NFT';
  if (seg.kind === 'title') return t('wheel.kind.title');
  return ''; // items and chests: the icon says it
}

const NS = 'http://www.w3.org/2000/svg';
// Placeholder glyphs (24-unit boxes), drawn in SVG so the wheel needs no extra files.
const GLYPH = {
  silk: '<circle r="10" fill="#f2c14e" stroke="#8a5a12" stroke-width="2"/><circle r="6" fill="none" stroke="#8a5a12" stroke-width="1.6"/><path d="M-2.5-3h5M-2.5 3h5M0-5v10" stroke="#8a5a12" stroke-width="1.6"/>',
  xp: '<path d="M0-11 3.2-3.6 11-3.4 4.8 1.6 7 9.6 0 5 -7 9.6 -4.8 1.6 -11-3.4 -3.2-3.6Z" fill="#9fe6ff" stroke="#2b6f8a" stroke-width="1.6"/>',
  chest: '<rect x="-10" y="-4" width="20" height="13" rx="2" fill="#a0612b" stroke="#4a2a0e" stroke-width="1.6"/><path d="M-10-4q0-8 10-8t10 8Z" fill="#c07a38" stroke="#4a2a0e" stroke-width="1.6"/><rect x="-2.5" y="-2" width="5" height="6" rx="1" fill="#f2c14e"/>',
  title: '<path d="M-9-8h16a3 3 0 0 1 0 6h-2v10h-14a3 3 0 0 1 0-6h0Z" fill="#efe2c2" stroke="#6b5530" stroke-width="1.6"/><path d="M-5-3h9M-5 1h9M-5 5h6" stroke="#6b5530" stroke-width="1.2"/>',
  skin: '<path d="M0-12 2.9-4 11-4 4.6 1 7 9.5 0 4.6 -7 9.5 -4.6 1 -11-4 -2.9-4Z" fill="#ffd76a" stroke="#7a4d00" stroke-width="1.6"/><circle r="3" fill="#7a4d00"/>',
  part: '<circle r="9" fill="#c9ced6" stroke="#4b5563" stroke-width="2"/><circle r="3.5" fill="#4b5563"/>',
  shard: '<path d="M0-12 7-2 0 12 -7-2Z" fill="#c4b5fd" stroke="#4c3d8a" stroke-width="1.6"/>',
};

/**
 * Renders the wheel screen into a container. Returns {root, spin(), claim(seed), destroy()} (spin/claim for tests).
 * @param {{doc?: Document, t: Function, wheel: object, items: object[], base: string, inventory: object, ledger: object,
 *   chests?: object, mintSkin?: Function, cue?: Function, reduced?: boolean, bagTarget?: () => Element|null, onChange?: Function,
 *   raf?: Function, now?: () => number}} o
 */
export function renderWheel({ doc = document, t, wheel, items = [], base = '/', inventory, ledger, chests = null, mintSkin = null, cue = () => {}, reduced = false, bagTarget = () => null, onChange = () => {}, raf = (f) => globalThis.requestAnimationFrame(f), now = () => performance.now(), supply = null, retryMs = 60000 }) {
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const svg = (tag, attrs = {}) => { const e = doc.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); return e; };
  const btn = (text, fn, cls = 'gm-btn') => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', () => fn(b)); return b; };
  const iconOf = (seg) => {
    if (seg.kind !== 'part' && seg.kind !== 'shard') return null;
    const it = items.find((i) => i.kind === seg.kind && i.rarity === seg.rarity);
    return it ? base + 'assets/items/' + (it.icon128 || it.icon) : null;
  };
  const itemIcon = (id) => { const it = items.find((i) => i.id === id); return it ? base + 'assets/items/' + (it.icon || it.icon128) : null; };
  const nameOf = (p, seg) => (p.item ? t((items.find((i) => i.id === p.item) || {}).nameKey || 'wheel.seg.' + seg.id) : p.title ? t('wheel.title.' + p.title) : t('wheel.seg.' + seg.id));

  const root = el('div', 'gm-wheelwrap wv');
  const box = el('div', 'gm-wheel wv-box');
  const face = svg('svg', { viewBox: '-120 -120 240 240', 'aria-hidden': 'true' });
  const defs = svg('defs');
  for (const [r, [a, b]] of Object.entries(RARITY_COLORS)) {
    const g = svg('radialGradient', { id: 'wv-' + r, cx: 0, cy: 0, r: 110, gradientUnits: 'userSpaceOnUse' });
    g.append(svg('stop', { offset: '0.25', 'stop-color': b }), svg('stop', { offset: '1', 'stop-color': a }));
    defs.append(g);
  }
  face.append(defs);
  const spinner = svg('g', { class: 'wv-spinner' });
  const sectors = [];
  SEGMENTS.forEach((s, i) => {
    const a0 = (i * STEP - 90 - STEP / 2) * Math.PI / 180, a1 = ((i + 1) * STEP - 90 - STEP / 2) * Math.PI / 180;
    const g = svg('g', { class: 'wv-sector' + (s.grand ? ' wv-grand' : ''), 'data-seg': s.id });
    const path = svg('path', { d: `M0 0L${(100 * Math.cos(a0)).toFixed(2)} ${(100 * Math.sin(a0)).toFixed(2)}A100 100 0 0 1 ${(100 * Math.cos(a1)).toFixed(2)} ${(100 * Math.sin(a1)).toFixed(2)}Z`,
      fill: `url(#wv-${s.rarity})`, stroke: s.grand ? '#ffd76a' : 'rgba(255,240,200,.55)', 'stroke-width': s.grand ? 2.2 : 1 });
    const rot = svg('g', { transform: `rotate(${i * STEP})` }); // content laid out along the sector's axis (pointing up)
    const href = iconOf(s);
    const icon = svg('g', { transform: 'translate(0 -58)' });
    if (href) icon.append(svg('image', { href, x: -17, y: -17, width: 34, height: 34 }));
    else { const gl = svg('g', { transform: 'scale(1.35)' }); gl.innerHTML = GLYPH[s.kind] || GLYPH.part; icon.append(gl); }
    const label = svg('text', { x: 0, y: -86, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'wv-amt' });
    label.textContent = sectorLabel(s, t);
    const ang = i * STEP; if (ang > 90 && ang < 270) label.setAttribute('transform', 'rotate(180 0 -86)'); // lower half: read upright, not upside down
    rot.append(icon, label);
    g.append(path, rot);
    spinner.append(g); sectors.push(g);
  });
  const rim = svg('circle', { r: 104, fill: 'none', stroke: '#d9b26a', 'stroke-width': 7 });
  const rim2 = svg('circle', { r: 108, fill: 'none', stroke: '#6b4e1c', 'stroke-width': 2 });
  spinner.append(rim);
  for (let i = 0; i < SEGMENTS.length; i++) { const a = (i * STEP - 90 - STEP / 2) * Math.PI / 180; spinner.append(svg('circle', { cx: (104 * Math.cos(a)).toFixed(2), cy: (104 * Math.sin(a)).toFixed(2), r: 3, fill: '#fff6d8', stroke: '#6b4e1c', 'stroke-width': 0.8 })); }
  const hub = svg('g'); hub.append(svg('circle', { r: 17, fill: '#1c1712', stroke: '#d9b26a', 'stroke-width': 4 }), svg('circle', { r: 5, fill: '#d9b26a' }));
  const pointer = svg('g', { class: 'wv-pointer', transform: 'translate(0 -112)' });
  pointer.append(svg('path', { d: 'M-9-6h18L0 14Z', fill: '#ffd76a', stroke: '#6b4e1c', 'stroke-width': 1.5 }));
  face.append(rim2, spinner, hub, pointer);
  box.append(face);

  const side = el('div', 'wv-side');
  const status = el('p', 'gm-note');
  const seedP = el('p', 'gm-note wv-seed');
  const card = el('div', 'wv-card'); card.hidden = true; card.setAttribute('aria-live', 'polite');
  const go = btn(t('wheel.spin'), () => spin(), 'gm-btn wv-go');
  const row = el('div', 'gm-row'); row.append(go);
  const table = el('table', 'gm-odds'); const tb = el('tbody'); table.append(tb);
  odds().forEach((o) => {
    const seg = SEGMENTS.find((s) => s.id === o.id);
    const tr = el('tr'); const sw = el('i', 'wv-swatch'); sw.style.background = RARITY_FRAME[seg.rarity];
    const name = el('td'); const label = doc.createTextNode(' ' + (seg.grand ? t('wheel.skinNft') : t('wheel.seg.' + o.id)) + (seg.grand ? ' · ' + t('wheel.cap', { n: SKIN_CAP }) : ''));
    name.append(sw, label);
    // the live supply from the skin contract: "N of 100 left" (the cap alone until it answers)
    if (seg.grand && supply && supply.then) supply.then((sp) => { if (sp) label.textContent = ' ' + t('wheel.skinNft') + ' · ' + t('wheel.left', { n: sp.left, cap: sp.cap }); }).catch(() => {});
    tr.append(name, el('td', null, (o.p * 100).toFixed(1) + ' %')); tb.append(tr);
  });
  // sprint 6.8: what the wheel is, before anything else; the odds come from SEGMENTS, so the table cannot drift
  const odd = el('details', 'wv-odds'); odd.append(el('summary', null, t('wheel.seeOdds')), table);
  side.append(el('p', 'wv-head', t('wheel.header')), status, row, seedP, card, el('h3', null, t('wheel.odds')), odd, el('p', 'gm-note', t('wheel.rules')));
  root.append(box, side);

  let angle = 0, spinning = false, destroyed = false;
  const setAngle = (a) => { angle = a; spinner.setAttribute('transform', `rotate(${a.toFixed(2)})`); };
  const refresh = () => {
    const av = wheel.available;
    // no spins: when the next free one comes (local midnight, game/wheel.js dayOf), counted down each second
    const d = new Date(Date.now()), next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(), left = Math.max(0, Math.floor((next - d.getTime()) / 1000));
    const hms = [Math.floor(left / 3600), Math.floor(left / 60) % 60, left % 60].map((x) => String(x).padStart(2, '0')).join(':');
    status.textContent = av.total > 0 ? t('wheel.available', { n: av.total }) + (av.free ? ' · ' + t('wheel.freeToday') : '') : t('wheel.none', { time: hms });
    seedP.textContent = t('wheel.seed', { seed: wheel.nextSeed });
    go.disabled = spinning || av.total <= 0 || wheel.pending.length > 0; // claim first, then spin again
  };
  const flick = () => { pointer.classList.remove('wv-flick'); void pointer.getBBox; pointer.classList.add('wv-flick'); };

  function showCard(p) {
    const seg = SEGMENTS.find((s) => s.id === p.segment) || SEGMENTS[0];
    card.hidden = false; card.replaceChildren();
    card.style.setProperty('--wv-frame', RARITY_FRAME[seg.rarity]);
    card.className = 'wv-card wv-r-' + seg.rarity;
    const art = el('div', 'wv-art');
    const href = p.item ? itemIcon(p.item) : null;
    if (href) { const img = el('img'); img.src = href; img.alt = ''; art.append(img); }
    else { const s = svg('svg', { viewBox: '-16 -16 32 32', width: 72, height: 72, 'aria-hidden': 'true' }); s.innerHTML = GLYPH[seg.kind] || GLYPH.part; art.append(s); }
    const name = el('b', 'wv-name', nameOf(p, seg));
    const meta = el('span', 'wv-meta', t('wheel.rarity.' + seg.rarity) + (seg.kind === 'silk' || seg.kind === 'xp' ? ' · ' + sectorLabel(seg, t) : ''));
    const note = el('p', 'gm-note', seg.grand ? t(p.status === 'minting' ? 'wheel.skin.pending' : 'wheel.skin.note', { reason: p.reason ? t('wheel.skin.reason.' + p.reason) : '' }) : (seg.kind === 'silk' ? t('wheel.playSilk') + ' ' : '') + t('wheel.seedWas', { seed: p.seed }));
    const claimB = btn(t(seg.grand && p.status === 'minting' ? 'wheel.claimRetry' : 'wheel.claim'), (b) => { b.disabled = true; claim(p.seed, art).finally(() => { b.disabled = false; }); }, 'gm-btn wv-claim');
    card.append(art, name, meta, note, claimB);
  }

  function flyToBag(art) {
    const target = bagTarget();
    if (reduced || !target || !art.getBoundingClientRect) return;
    const a = art.getBoundingClientRect(), b = target.getBoundingClientRect();
    const ghost = art.cloneNode(true); ghost.className = 'wv-fly';
    Object.assign(ghost.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
    doc.body.append(ghost);
    raf(() => { ghost.style.transform = `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(.25)`; ghost.style.opacity = '0.2'; });
    setTimeout(() => { ghost.remove(); target.classList.add('wv-bump'); setTimeout(() => target.classList.remove('wv-bump'), 600); }, 750);
  }

  let retryT = null;
  async function claim(seed, art = null) {
    const r = await claimPrize(wheel, seed, { inventory, ledger, chests, mintSkin });
    if (destroyed) return r;
    if (r.ok || r.reason === 'already_owned') {
      cue(r.kind === 'skin' ? 'ui_confirm' : 'gift_chime');
      if (art) flyToBag(art);
      const next = wheel.pending[0];
      if (next) showCard(next); else { card.hidden = true; }
    } else {
      if (r.reason !== 'recorded') cue('ui_error'); // a verified win waiting for the minter is not an error
      const p = wheel.pending.find((x) => x.seed === seed); if (p) showCard(p);
      if (r.kind === 'skin' && retryMs > 0) { clearTimeout(retryT); retryT = setTimeout(() => { if (!destroyed) claim(seed); }, retryMs); } // periodic retry while open
    }
    refresh(); onChange(r);
    return r;
  }

  function land(r) {
    spinning = false;
    sectors.forEach((g) => g.classList.remove('wv-win'));
    const g = sectors[r.index]; if (g) { g.classList.add('wv-win'); setTimeout(() => g.classList.remove('wv-win'), 2400); }
    cue(r.segment.grand ? 'ui_confirm' : 'gift_chime');
    const p = wheel.pending.find((x) => x.seed === r.seed);
    if (p) { showCard(p); try { card.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); } catch { /* old browsers */ } } // phones: the card sits below the wheel
    refresh();
  }

  function spin() {
    if (spinning || wheel.pending.length) return null;
    const r = wheel.spin(items);
    if (!r) return null;
    spinning = true; card.hidden = true; refresh();
    const from = angle, to = landingAngle(from, r.index);
    if (reduced) { setAngle(to); land(r); return r; }
    const t0 = now(), W = SPIN.windup * 1000, M = SPIN.seconds * 1000;
    let lastPeg = pegAt(from), lastTick = 0;
    const frame = () => {
      if (destroyed) return;
      const e = now() - t0;
      let a;
      if (e < W) a = from - SPIN.windupDeg * Math.sin((e / W) * Math.PI / 2); // pull back
      else { const u = Math.min(1, (e - W) / M); a = from - SPIN.windupDeg + (to - from + SPIN.windupDeg) * easeOut(u); }
      setAngle(a);
      const peg = pegAt(a);
      if (peg !== lastPeg && e > W) { lastPeg = peg; if (e - lastTick > 28) { lastTick = e; cue('bid_tick'); flick(); } }
      if (e < W + M) raf(frame); else { setAngle(to); land(r); }
    };
    raf(frame);
    return r;
  }

  refresh();
  const waiting = wheel.pending[0];
  if (waiting) {
    const i = SEGMENTS.findIndex((s) => s.id === waiting.segment); setAngle(landingAngle(0, Math.max(0, i), 0)); showCard(waiting);
    if (waiting.status === 'minting' && retryMs > 0) retryT = setTimeout(() => { if (!destroyed) claim(waiting.seed); }, 1500); // back with a skin awaiting its mint: ask again
  }
  const clock = setInterval(() => { if (destroyed) { clearInterval(clock); return; } if (wheel.available.total <= 0) refresh(); }, 1000); // the countdown to the next free spin; destroy() stops it
  if (clock && clock.unref) clock.unref();
  return { root, spin, claim, get angle() { return angle; }, destroy() { destroyed = true; clearTimeout(retryT); clearInterval(clock); } };
}

export const WHEEL_CSS = `
.wv { grid-template-columns: minmax(260px, 400px) 1fr; }
.wv-box { filter: drop-shadow(0 10px 24px rgba(0,0,0,.45)); }
.wv-box svg { overflow: visible; }
.wv-amt { font: 800 11px/1 system-ui, sans-serif; fill: #fff8e6; paint-order: stroke; stroke: rgba(0,0,0,.55); stroke-width: 2.4px; }
.wv-card[hidden] { display: none; }
.wv-grand path { filter: drop-shadow(0 0 4px rgba(255,215,106,.8)); }
.wv-win path { animation: wv-flash .3s ease-in-out 6 alternate; }
@keyframes wv-flash { to { fill: #fff3c4; } }
.wv-pointer { transform-box: fill-box; transform-origin: 50% 0; }
.wv-flick path { animation: wv-flick .12s ease-out; transform-box: fill-box; transform-origin: 50% 0; }
@keyframes wv-flick { 30% { transform: rotate(-22deg); } 100% { transform: rotate(0); } }
.wv-card { margin: 10px 0; padding: 14px; border-radius: 14px; border: 2px solid var(--wv-frame, #d9b26a); background: radial-gradient(circle at 50% 0, rgba(255,255,255,.08), rgba(0,0,0,.25)); box-shadow: 0 0 22px color-mix(in srgb, var(--wv-frame, #d9b26a) 45%, transparent); display: grid; justify-items: center; gap: 6px; text-align: center; animation: wv-pop .35s cubic-bezier(.2,1.4,.4,1); }
@keyframes wv-pop { from { transform: scale(.7); opacity: 0; } }
.wv-art img, .wv-art svg { width: 84px; height: 84px; display: block; }
.wv-name { font: 700 17px/1.2 system-ui; color: #f3ead8; }
.wv-meta { font: 600 12px/1 system-ui; letter-spacing: .08em; text-transform: uppercase; color: var(--wv-frame, #d9b26a); }
.wv-r-mythic { background: radial-gradient(circle at 50% 0, rgba(255,215,106,.22), rgba(0,0,0,.4)); }
.wv-claim { min-width: 140px; }
.wv .gm-odds td:last-child { white-space: nowrap; text-align: right; }
.wv-swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; vertical-align: -1px; }
.wv-fly { position: fixed; z-index: 99; pointer-events: none; transition: transform .7s cubic-bezier(.5,0,.75,0), opacity .7s ease-in; }
.wv-bump { animation: wv-bump .5s ease; }
@keyframes wv-bump { 40% { transform: scale(1.18); } }
@media (max-width: 640px) { .wv { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .wv-win path, .wv-flick path, .wv-card, .wv-bump { animation: none !important; } }
html[data-motion="reduce"] .wv-win path, html[data-motion="reduce"] .wv-flick path, html[data-motion="reduce"] .wv-card { animation: none !important; }
`;
