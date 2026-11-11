// The game menu (owner, 11.11; docs/ui-style-and-dialogue.md): one bright, tabbed panel for Profile, Achievements,
// NFTs, Inventory (with the wheel), Agents and Log / Stats. White frosted glass, rarity colour frames, big rounded
// tabs, 40 px+ targets; reduced motion = static (no spin animation, no confetti, no pop). Honest by construction: the
// NFTs tab lists only what a testnet read confirms right now (play/profile.js readOnChain), everything else is
// labelled local. Items come from the items manifest (game/public/assets/items/manifest.json).
import { readOnChain } from './profile.js';
import { createWheel, SEGMENTS, odds } from '../game/wheel.js';
import { createInventory, RARITIES } from '../game/inventory.js';
import { achievementsFor } from '../game/achievements.js';
import { NEAR_DEPLOYMENT } from '../net/near-deployment.js';
import { loadHolder } from '../net/holder.js';
import { holderSection } from './holder-panel.js';
import { cue } from '../audio/town-audio.js';

export const TABS = Object.freeze(['profile', 'achievements', 'nfts', 'inventory', 'agents', 'log']);
const RARITY_COLOR = Object.freeze({ common: '#b9bfc7', uncommon: '#2fc4b2', rare: '#8d5cf6', epic: '#e0479e', legendary: '#f2a516' });
const SEG_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#9775fa', '#da77f2', '#f783ac', '#ff922b', '#20c997'];
let manifestP = null;
/** The items manifest (cached). */
export function loadManifest(base = (import.meta.env && import.meta.env.BASE_URL) || '/', fetch = globalThis.fetch) {
  return (manifestP ||= fetch(base + 'assets/items/manifest.json').then((r) => r.json()).then((m) => (m.items || []).filter((i) => i.kind === 'shard' || i.kind === 'part')).catch(() => []));
}

const CSS = `
.gm { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(18, 22, 40, .45); font: 15px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #1d2340; }
.gm-panel { position: relative; width: min(920px, calc(100vw - 24px)); height: min(640px, calc(100vh - 24px)); display: grid; grid-template-rows: auto auto 1fr; border-radius: 28px; overflow: hidden;
  background: rgba(255, 255, 255, .82); backdrop-filter: blur(18px) saturate(1.3); -webkit-backdrop-filter: blur(18px) saturate(1.3); box-shadow: 0 24px 60px rgba(20, 24, 60, .35), inset 0 0 0 1px rgba(255,255,255,.7); }
@supports not (backdrop-filter: blur(1px)) { .gm-panel { background: #f7f8fc; } }
.gm-head { display: flex; align-items: center; gap: 12px; padding: 16px 18px 8px; }
.gm-head h2 { margin: 0; flex: 1; font: 800 22px/1.1 system-ui, sans-serif; background: linear-gradient(90deg, #6d5efc, #e0479e, #f2a516); -webkit-background-clip: text; background-clip: text; color: transparent; }
.gm-x { width: 44px; height: 44px; border-radius: 50%; border: 0; background: #eef0f8; font: 700 20px/1 system-ui; color: #4a5072; cursor: pointer; }
.gm-tabs { display: flex; gap: 8px; padding: 4px 16px 10px; overflow-x: auto; scrollbar-width: none; }
.gm-tab { flex: 0 0 auto; min-height: 44px; padding: 8px 16px; border-radius: 22px; border: 0; background: #eef0f8; color: #3a4166; font: 700 14px/1 system-ui; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: transform .12s ease, background .12s ease; }
.gm-tab:hover { transform: translateY(-2px); } .gm-tab:active { transform: scale(.96); }
.gm-tab[aria-selected="true"] { background: linear-gradient(135deg, #6d5efc, #9b5cf6); color: #fff; box-shadow: 0 6px 16px rgba(109, 94, 252, .35); }
.gm-body { overflow-y: auto; padding: 4px 18px 18px; }
.gm-note { color: #6a7090; font-size: 13px; margin: 6px 0; }
.gm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 12px; }
.gm-card { position: relative; border-radius: 18px; padding: 10px 8px 8px; text-align: center; background: linear-gradient(160deg, #fff, var(--rb, #eef0f6)); box-shadow: 0 4px 12px rgba(30, 36, 80, .1), inset 0 0 0 2px var(--rc, #d3d7e3); overflow: hidden; }
.gm-card img { width: 72px; height: 72px; object-fit: contain; display: block; margin: 0 auto 4px; filter: drop-shadow(0 4px 6px rgba(0,0,0,.18)); }
.gm-card b { display: block; font: 700 13px/1.2 system-ui; } .gm-card small { display: block; color: #6a7090; font-size: 11px; }
.gm-count { position: absolute; top: 6px; right: 8px; min-width: 22px; padding: 2px 6px; border-radius: 11px; background: #1d2340; color: #fff; font: 700 11px/1.4 system-ui; }
.gm-card[data-rarity="rare"]::after, .gm-card[data-rarity="epic"]::after, .gm-card[data-rarity="legendary"]::after { content: ""; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,.65) 50%, transparent 60%); transform: translateX(-120%); animation: gm-shine 3.2s ease-in-out infinite; }
@keyframes gm-shine { 60%, 100% { transform: translateX(120%); } }
.gm-card.gm-new { animation: gm-pop .5s cubic-bezier(.3, 1.6, .5, 1); }
@keyframes gm-pop { from { transform: scale(.6); } to { transform: scale(1); } }
.gm-btn { min-height: 44px; padding: 10px 20px; border-radius: 22px; border: 0; cursor: pointer; font: 800 15px/1 system-ui; color: #fff; background: linear-gradient(135deg, #ff8a3d, #f2a516); box-shadow: 0 6px 16px rgba(242, 165, 22, .35); transition: transform .12s ease; }
.gm-btn:hover { transform: translateY(-2px); } .gm-btn:active { transform: scale(.96); } .gm-btn[disabled] { opacity: .45; cursor: default; transform: none; }
.gm-btn.gm-ghost { color: #3a4166; background: #eef0f8; box-shadow: none; }
.gm-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 10px 0; }
.gm-prof { display: grid; grid-template-columns: 150px 1fr; gap: 18px; align-items: center; }
.gm-prof img { width: 150px; border-radius: 16px; box-shadow: 0 8px 22px rgba(30, 36, 80, .25); }
.gm-prof img.gm-ring-frame { outline: 4px solid #3fd0c9; outline-offset: 3px; box-shadow: 0 0 0 9px rgba(63, 208, 201, .25), 0 8px 22px rgba(30, 36, 80, .25); }
.gm-holder { margin-top: 18px; } .gm-holder input { flex: 1; min-width: 160px; padding: 8px 10px; border-radius: 10px; border: 1px solid #c9cde0; font: inherit; }
.gm-holder .gm-row { flex-wrap: wrap; gap: 8px; } .gm-holder-list { margin: 6px 0; padding-left: 18px; }
.gm-ring { --p: 0; width: 64px; height: 64px; border-radius: 50%; background: conic-gradient(var(--c, #6d5efc) calc(var(--p) * 1turn), #e6e8f2 0); display: grid; place-items: center; }
.gm-ring > span { width: 50px; height: 50px; border-radius: 50%; background: #fff; display: grid; place-items: center; font: 800 16px/1 system-ui; }
.gm-medal { display: grid; justify-items: center; gap: 6px; text-align: center; padding: 10px 6px; border-radius: 18px; background: #f6f7fc; }
.gm-medal[data-done="true"] { background: linear-gradient(160deg, #fff7e0, #ffe7a8); }
.gm-nft { position: relative; border-radius: 16px; overflow: hidden; background: linear-gradient(135deg, #f0e9ff, #e3f7ff, #fff1f8); box-shadow: 0 6px 18px rgba(30, 36, 80, .15); padding: 10px; }
.gm-nft img { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 10px; }
.gm-chip { display: inline-block; margin: 4px 4px 0 0; padding: 3px 9px; border-radius: 10px; font: 700 11px/1.5 system-ui; background: #1d2340; color: #fff; text-decoration: none; }
.gm-chip.gm-near { background: linear-gradient(135deg, #00c08b, #1a9cf0); }
.gm-agent { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; padding: 12px 14px; border-radius: 18px; background: #f6f7fc; margin-bottom: 10px; }
.gm-agent b { font-size: 15px; }
.gm-wheelwrap { display: grid; grid-template-columns: minmax(240px, 340px) 1fr; gap: 18px; align-items: start; }
.gm-wheel { position: relative; width: 100%; aspect-ratio: 1; }
.gm-wheel svg { width: 100%; height: 100%; }
.gm-wheel .gm-spinner { transform-origin: 50% 50%; transition: transform 4.2s cubic-bezier(.12, .8, .18, 1); }
.gm-pointer { position: absolute; top: -6px; left: 50%; width: 0; height: 0; transform: translateX(-50%); border-left: 14px solid transparent; border-right: 14px solid transparent; border-top: 26px solid #f2a516; filter: drop-shadow(0 3px 4px rgba(0,0,0,.3)); }
.gm-odds { width: 100%; border-collapse: collapse; font-size: 13px; } .gm-odds td { padding: 3px 6px; border-bottom: 1px solid #eceef6; } .gm-odds td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
.gm-confetti { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.gm-confetti i { position: absolute; top: 40%; left: 50%; width: 8px; height: 12px; border-radius: 2px; animation: gm-burst 1.1s ease-out forwards; }
@keyframes gm-burst { to { transform: translate(var(--dx), var(--dy)) rotate(540deg); opacity: 0; } }
.gm-prize { padding: 12px 14px; border-radius: 16px; background: linear-gradient(135deg, #fff7e0, #ffe0f0); font-weight: 700; }
@media (max-width: 640px) { .gm-prof, .gm-wheelwrap { grid-template-columns: 1fr; } .gm-prof img { width: 120px; } }
@media (prefers-reduced-motion: reduce) { .gm-wheel .gm-spinner { transition: none; } .gm-card::after, .gm-card.gm-new, .gm-confetti i { animation: none !important; } .gm-tab, .gm-btn { transition: none; } }
html[data-motion="reduce"] .gm-wheel .gm-spinner { transition: none; } html[data-motion="reduce"] .gm-card::after, html[data-motion="reduce"] .gm-confetti i { animation: none !important; }
`;

/** An SVG element (a plain element where the DOM has no namespaces, e.g. the node tests). */
const svgEl = (doc, tag) => (doc.createElementNS ? doc.createElementNS('http://www.w3.org/2000/svg', tag) : doc.createElement(tag));
const reduced = (doc) => { try { return doc.documentElement.dataset.motion === 'reduce' || (doc.defaultView && doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } };

/** A polyline sparkline in an inline SVG. */
function spark(doc, values, w = 220, h = 44, color = '#6d5efc') {
  const svg = svgEl(doc, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('aria-hidden', 'true');
  if (values && values.length > 1) {
    const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
    const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((v - lo) / span) * (h - 6)).toFixed(1)}`).join(' ');
    const pl = svgEl(doc, 'polyline'); pl.setAttribute('points', pts); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', color); pl.setAttribute('stroke-width', '2.5'); pl.setAttribute('stroke-linejoin', 'round');
    svg.append(pl);
  }
  return svg;
}

/**
 * Opens the menu. Returns {root, close, show(tab)}.
 * @param {{doc?: Document, t: Function, ledger: object, storage?: object, tab?: string, owner?: string|null, exportKey?: Function|null,
 *   nickname?: string|null, eliseMinted?: boolean, onChain?: Promise, base?: string, manifest?: Promise}} o
 */
export function openGameMenu({ doc = document, t, ledger, storage = null, tab = 'profile', owner = null, exportKey = null, nickname = null, eliseMinted = false, onChain = null, base = (import.meta.env && import.meta.env.BASE_URL) || '/', manifest = null }) {
  if (!(doc.getElementById && doc.getElementById('gm-style'))) { const st = doc.createElement('style'); st.id = 'gm-style'; st.textContent = CSS; doc.head.append(st); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (text, fn, cls = 'gm-btn') => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', () => fn(b)); return b; };
  const wheel = createWheel({ storage, earnedFrom: () => Math.max(0, ledger.level.level - 1) + (ledger.stats.trialsVerified || 0) });
  const inv = createInventory({ storage });
  const items = manifest || loadManifest(base);
  const chain = onChain || readOnChain({ owner });

  const root = el('div', 'gm'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', t('menu.title'));
  const panel = el('div', 'gm-panel'); root.append(panel);
  const xBtn = btn('×', () => close(), 'gm-x'); xBtn.setAttribute('aria-label', t('quest.close'));
  const head = el('div', 'gm-head'); head.append(el('h2', null, t('menu.title')), xBtn);
  const tabs = el('div', 'gm-tabs'); tabs.setAttribute('role', 'tablist');
  const body = el('div', 'gm-body'); body.setAttribute('role', 'tabpanel');
  panel.append(head, tabs, body);
  const tabBtns = {};
  for (const id of TABS) { const b = btn(t('menu.tab.' + id), () => show(id), 'gm-tab'); b.setAttribute('role', 'tab'); b.dataset.tab = id; tabBtns[id] = b; tabs.append(b); }
  root.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === root) close(); });
  root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  doc.body.append(root);
  let current = null;
  function close() { root.remove(); }

  const views = {
    profile() {
      const lv = ledger.level, st = ledger.stats;
      const top = el('div', 'gm-prof');
      const holder = loadHolder(storage); // holder access (net/holder.js): cosmetic perks from a read-only NFT check
      const img = el('img'); img.src = base + 'assets/cards/' + (eliseMinted || (holder && holder.perks.includes('elise')) ? 'elise' : 'iris') + '.webp'; img.alt = '';
      if (holder && holder.perks.includes('ring')) img.className = 'gm-ring-frame';
      const info = el('div');
      const ring = el('div', 'gm-ring'); ring.style.setProperty('--p', String(lv.into / lv.need)); ring.append(el('span', null, String(lv.level)));
      const r = el('div', 'gm-row'); r.append(ring, el('div', null, t('profile.heading', { level: lv.level, title: t('profile.title.' + lv.title) })));
      info.append(el('h3', null, nickname || t('menu.traveller')), r,
        ...(holder && holder.title ? [el('span', 'gm-chip gm-near', t('holder.title.' + holder.title))] : []), el('p', 'gm-note', t('profile.xp', { into: lv.into, need: lv.need })), el('p', 'gm-note', t('menu.localProfile')));
      top.append(img, info);
      const g = el('div', 'gm-grid');
      for (const [k, v] of [['signsRead', st.signsRead], ['trialsVerified', st.trialsVerified], ['memoriesForgotten', st.memoriesForgotten], ['agentsHired', st.agentsHired]]) {
        const c = el('div', 'gm-card'); c.append(el('b', null, String(v)), el('small', null, t('profile.stat.' + k))); g.append(c);
      }
      const out = [top, el('h3', null, t('profile.stats')), g];
      if (wheel.titles.length) out.push(el('p', 'gm-note', t('menu.titles', { list: wheel.titles.map((x) => t('wheel.title.' + x)).join(', ') })));
      if (exportKey) {
        const kb = btn(t('profile.exportKey'), async (b) => { try { await navigator.clipboard.writeText(exportKey()); b.textContent = t('profile.exportKey.done'); } catch { b.textContent = t('profile.exportKey.failed'); } }, 'gm-btn gm-ghost');
        out.push(el('p', 'gm-note', t('profile.exportKey.note')), kb);
      }
      return out;
    },
    achievements() {
      return items.then((list) => {
        const st = { ...ledger.stats, spins: wheel.history.length, distinctItems: inv.list(list).length, eliseMinted, level: ledger.level.level };
        const g = el('div', 'gm-grid');
        for (const a of achievementsFor(st)) {
          const m = el('div', 'gm-medal'); m.dataset.done = String(a.done);
          const ring = el('div', 'gm-ring'); ring.style.setProperty('--p', String(a.progress)); ring.style.setProperty('--c', a.done ? '#f2a516' : '#6d5efc');
          ring.append(el('span', null, a.done ? '★' : Math.round(a.progress * 100) + '%'));
          m.append(ring, el('b', null, t('ach.' + a.id)), el('small', 'gm-note', t('ach.' + a.id + '.desc', { goal: a.goal })));
          g.append(m);
        }
        return [el('p', 'gm-note', t('menu.achNote')), g];
      });
    },
    nfts() {
      const box = el('div'); box.append(el('p', 'gm-note', t('inv.onchain.checking')));
      chain.then((r) => {
        box.replaceChildren(el('p', 'gm-note', t('menu.nftNote')));
        if (r.state !== 'loaded' || !r.items.length) { box.append(el('p', 'gm-note', t(r.state === 'offline' ? 'inv.onchain.offline' : 'inv.onchain.none'))); return; }
        const g = el('div', 'gm-grid'); g.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';
        const mine = r.items.filter((x) => x.mine), others = r.items.filter((x) => !x.mine);
        for (const it of [...mine, ...others]) {
          const c = el('div', 'gm-nft');
          if (it.kind === 'heroine') { const img = el('img'); img.src = base + 'assets/cards/elise.webp'; img.alt = ''; c.append(img); }
          c.append(el('b', null, it.mine ? t('inv.elise') : it.label || it.tokenId));
          const chip = el('span', 'gm-chip gm-near', 'NEAR testnet'); c.append(el('br'), chip);
          if (it.href) { const a = el('a', 'gm-chip', t('menu.viewToken')); a.href = it.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; c.append(a); }
          c.append(el('p', 'gm-note', it.mine ? t('menu.ownedByYou') : t('inv.owner', { owner: it.owner || '—' })));
          g.append(c);
        }
        box.append(g);
      });
      return [box, holderSection({ doc, t, storage, owner })];
    },
    inventory() {
      return items.then((list) => {
        const g = el('div', 'gm-grid');
        const owned = inv.list(list);
        if (!owned.length) { const p = el('p', 'gm-note', t('menu.invEmpty')); p.style.gridColumn = '1 / -1'; g.append(p); }
        for (const it of owned) {
          const c = el('div', 'gm-card' + (it.id === inv.newest && fresh.has(it.id) ? ' gm-new' : '')); c.dataset.rarity = it.rarity || 'common';
          c.style.setProperty('--rc', RARITY_COLOR[it.rarity] || RARITY_COLOR.common); c.style.setProperty('--rb', (RARITY_COLOR[it.rarity] || '#eef0f6') + '33');
          const img = el('img'); img.src = base + 'assets/items/' + (it.icon128 || it.icon); img.alt = '';
          c.append(el('span', 'gm-count', '×' + it.n), img, el('b', null, t(it.nameKey)), el('small', null, t('rarity.' + (it.rarity || 'common')) + ' · ' + t('menu.source.' + (it.source || 'wheel'))));
          g.append(c);
        }
        const sum = el('div', 'gm-row');
        sum.append(el('span', 'gm-chip', t('inv.townSilk') + ': ' + (ledger.silk / 100).toFixed(2)), btn(t('menu.openWheel'), () => show('wheel')));
        return [el('p', 'gm-note', t('inv.offchain.note')), sum, g];
      });
    },
    wheel() {
      return items.then((list) => {
        const wrap = el('div', 'gm-wheelwrap');
        const wbox = el('div', 'gm-wheel');
        const svg = svgEl(doc, 'svg'); svg.setAttribute('viewBox', '-110 -110 220 220'); svg.setAttribute('aria-hidden', 'true');
        const spinner = svgEl(doc, 'g'); spinner.setAttribute('class', 'gm-spinner');
        const n = SEGMENTS.length, step = 360 / n;
        SEGMENTS.forEach((s, i) => {
          const a0 = (i * step - 90 - step / 2) * Math.PI / 180, a1 = ((i + 1) * step - 90 - step / 2) * Math.PI / 180;
          const p = svgEl(doc, 'path');
          p.setAttribute('d', `M0 0L${(100 * Math.cos(a0)).toFixed(2)} ${(100 * Math.sin(a0)).toFixed(2)}A100 100 0 0 1 ${(100 * Math.cos(a1)).toFixed(2)} ${(100 * Math.sin(a1)).toFixed(2)}Z`);
          p.setAttribute('fill', SEG_COLORS[i % SEG_COLORS.length]); p.setAttribute('stroke', '#fff'); p.setAttribute('stroke-width', '1.5');
          const tx = svgEl(doc, 'text'); const am = (i * step - 90) * Math.PI / 180;
          tx.setAttribute('x', (66 * Math.cos(am)).toFixed(1)); tx.setAttribute('y', (66 * Math.sin(am)).toFixed(1)); tx.setAttribute('text-anchor', 'middle'); tx.setAttribute('dominant-baseline', 'middle');
          tx.setAttribute('font-size', '9'); tx.setAttribute('font-weight', '800'); tx.setAttribute('fill', '#fff'); tx.setAttribute('transform', `rotate(${i * step} ${(66 * Math.cos(am)).toFixed(1)} ${(66 * Math.sin(am)).toFixed(1)})`);
          tx.textContent = t('wheel.seg.' + s.id);
          spinner.append(p, tx);
        });
        const rim = svgEl(doc, 'circle'); rim.setAttribute('r', '103'); rim.setAttribute('fill', 'none'); rim.setAttribute('stroke', '#f2c14e'); rim.setAttribute('stroke-width', '7');
        svg.append(spinner, rim);
        for (let i = 0; i < 24; i++) { const b = svgEl(doc, 'circle'); const a = i * 15 * Math.PI / 180; b.setAttribute('cx', (103 * Math.cos(a)).toFixed(1)); b.setAttribute('cy', (103 * Math.sin(a)).toFixed(1)); b.setAttribute('r', '2.6'); b.setAttribute('fill', i % 2 ? '#fff8d6' : '#fff'); svg.append(b); }
        const hub = svgEl(doc, 'circle'); hub.setAttribute('r', '16'); hub.setAttribute('fill', '#fff'); hub.setAttribute('stroke', '#f2a516'); hub.setAttribute('stroke-width', '4'); svg.append(hub);
        wbox.append(svg, el('div', 'gm-pointer'));
        const side = el('div');
        const av = wheel.available;
        const status = el('p', 'gm-note', t('wheel.available', { n: av.total }) + (av.free ? ' · ' + t('wheel.freeToday') : ''));
        const seedP = el('p', 'gm-note', t('wheel.seed', { seed: wheel.nextSeed }));
        const prize = el('div'); prize.setAttribute('aria-live', 'polite');
        let angle = 0;
        const go = btn(t('wheel.spin'), () => {
          const r = wheel.spin(list);
          if (!r) return;
          go.disabled = true;
          // land the pointer on the segment: the segment i sits at i·step from the top
          const turns = reduced(doc) ? 0 : 5;
          angle = angle - (angle % 360) + turns * 360 + (360 - r.index * step);
          spinner.style.transform = `rotate(${angle}deg)`;
          if (turns) { let at = 0; for (let k = 0; k < 18; k++) { at += 60 + k * k * 9; setTimeout(() => cue('bid_tick'), at); } } // ticks slowing with the wheel
          const finish = () => {
            cue('gift_chime');
            if (r.item) inv.add(r.item.id, 1, 'wheel');
            if (r.segment.kind === 'silk') ledger.grant({ silk: r.segment.amount });
            if (r.segment.kind === 'xp') ledger.grant({ xp: r.segment.amount });
            fresh.add(r.item ? r.item.id : '');
            prize.replaceChildren(el('div', 'gm-prize', t('wheel.won', { prize: r.item ? t(r.item.nameKey) : r.title ? t('wheel.title.' + r.title) : t('wheel.seg.' + r.segment.id) })), el('p', 'gm-note', t('wheel.seedWas', { seed: r.seed })));
            if (!reduced(doc)) { const cf = el('div', 'gm-confetti'); for (let i = 0; i < 28; i++) { const c = el('i'); c.style.background = SEG_COLORS[i % SEG_COLORS.length]; c.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 360)}px`); c.style.setProperty('--dy', `${Math.round((Math.random() - 0.7) * 300)}px`); cf.append(c); } wbox.append(cf); setTimeout(() => cf.remove(), 1300); }
            const a2 = wheel.available; status.textContent = t('wheel.available', { n: a2.total }) + (a2.free ? ' · ' + t('wheel.freeToday') : '');
            seedP.textContent = t('wheel.seed', { seed: wheel.nextSeed }); go.disabled = a2.total <= 0;
          };
          if (turns) setTimeout(finish, 4300); else finish();
        });
        go.disabled = av.total <= 0;
        const table = el('table', 'gm-odds'); const tb = el('tbody'); table.append(tb);
        odds().forEach((o) => { const tr = el('tr'); tr.append(el('td', null, t('wheel.seg.' + o.id)), el('td', null, (o.p * 100).toFixed(1) + ' %')); tb.append(tr); });
        side.append(status, el('div', 'gm-row'), seedP, prize, el('h3', null, t('wheel.odds')), table, el('p', 'gm-note', t('wheel.rules')));
        side.children[1].append(go, btn(t('menu.tab.inventory'), () => show('inventory'), 'gm-btn gm-ghost'));
        wrap.append(wbox, side);
        return [wrap];
      });
    },
    agents() {
      const known = ledger.agentsKnown();
      if (!known.length) return [el('p', 'gm-note', t('menu.agentsEmpty'))];
      const out = [];
      const open = ledger.hires();
      for (const npc of known) {
        const a = ledger.agent(npc);
        const card = el('div', 'gm-agent');
        const left = el('div');
        left.append(el('b', null, t('folk.name.' + npc)), el('p', 'gm-note', t('hire.temp.' + (ledger.temperamentOf(npc) || 'steady')) + ' · ' + (a.measured == null ? t('spot.inn.novice') : (a.measured * 100).toFixed(1) + ' %') + ' · ' + t('menu.experience', { n: a.experience })));
        const h = open.find((x) => x.npc === npc);
        if (h) left.append(el('p', 'gm-note', t('open.line', { name: t('folk.name.' + npc), done: h.done, total: h.rounds, u: (h.unrealised / 100).toFixed(2) })));
        const recs = ledger.results ? ledger.results(npc) : [];
        if (recs.length) left.append(el('p', 'gm-note', t('menu.lastNet', { net: (recs[0].net >= 0 ? '+' : '') + (recs[0].net / 100).toFixed(2), n: recs.length })));
        card.append(left, spark(doc, (a.recent || []).map((x, i, arr) => arr.slice(0, i + 1).reduce((s, v) => s + v, 0) / (i + 1)), 140, 40, '#2fc4b2'));
        out.push(card);
      }
      return [el('p', 'gm-note', t('menu.agentsNote')), ...out];
    },
    log() {
      const st = ledger.stats;
      const g = el('div', 'gm-grid');
      for (const [k, v] of [['rounds', String(st.rounds || 0)], ['winRate', st.rounds ? Math.round((100 * st.wins) / st.rounds) + ' %' : '—'], ['net', (st.net >= 0 ? '+' : '') + (st.net / 100).toFixed(2)]]) {
        const c = el('div', 'gm-card'); c.append(el('b', null, v), el('small', null, t('profile.stat.' + k))); g.append(c);
      }
      const lines = el('div');
      for (const l of ledger.log().slice(0, 40)) lines.append(el('p', 'gm-note', t('log.line', { time: new Date(l.at).toLocaleTimeString(), name: t('folk.name.' + l.npc), echo: t('exch.echo.' + l.echo), side: t('log.side.' + l.side), size: l.size, entry: (l.entry / 100).toFixed(2), exit: (l.exit / 100).toFixed(2), result: (l.result >= 0 ? '+' : '') + (l.result / 100).toFixed(2), reason: t('log.reason.' + l.reason) })));
      if (!lines.childNodes.length) lines.append(el('p', 'gm-note', t('open.none')));
      return [g, el('h3', null, t('profile.equity')), spark(doc, ledger.equity, 320, 60, '#f2a516'), el('h3', null, t('log.heading')), lines];
    },
  };
  const fresh = new Set();

  function show(id) {
    current = id;
    for (const [k, b] of Object.entries(tabBtns)) b.setAttribute('aria-selected', String(k === id || (id === 'wheel' && k === 'inventory')));
    const r = views[id]();
    const put = (kids) => { if (current === id) body.replaceChildren(...kids.filter(Boolean)); };
    if (r && typeof r.then === 'function') { body.replaceChildren(el('p', 'gm-note', '…')); r.then(put); } else put(r);
  }
  show(TABS.includes(tab) || tab === 'wheel' ? tab : 'profile');
  tabBtns[TABS.includes(tab) ? tab : 'profile'].focus();
  return { root, close, show, get tab() { return current; }, wheel, inventory: inv };
}
