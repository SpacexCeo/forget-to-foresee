// The RPG HUD frame (sprint plan 5.4 / 5.5): player frame (portrait, name, level, HP and mana bars), buff row, target
// frame, cast bar, the 9-slot hotbar with cooldown sweeps, the XP bar, the chat/log container, the silk chip, the
// menu tray and the level-up banner. DOM only: `render(view)` paints a plain view object built by rpg/index.js.
import { HUD_CSS } from './hud-style.js';
import { silkChipText } from './silk-chip.js';
import { skillById } from './skills-data.js';

/** Icon art per skill (the game's UI icons; tree nodes without art get a branch glyph). */
export const SKILL_ART = Object.freeze({ strike: 'strike', lance: 'shard_burst', snare: 'mark', dash: 'dash', ling_echo: 'call_companion', ling_hush: 'glide', ling_babel: 'shard_burst',
  sch_insight: 'read_sign', sch_eye: 'mark', war_brace: 'ward', war_shield: 'herbal_tea' });

const SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const TRAY = Object.freeze([
  { id: 'character', action: 'character', icon: SVG('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>') },
  { id: 'skills', action: 'skills', icon: SVG('<path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z"/>') },
  { id: 'journal', action: 'journal', icon: SVG('<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M9 8h6M9 12h6"/>') },
  { id: 'map', action: 'map', icon: SVG('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>') },
  { id: 'bag', action: 'bag', icon: SVG('<path d="M6 8h12l-1 12H7z"/><path d="M9 8a3 3 0 016 0"/>') },
  { id: 'market', action: 'market', icon: SVG('<path d="M4 9l2-5h12l2 5"/><path d="M5 9v11h14V9"/><path d="M4 9h16"/>') },
  { id: 'menu', action: null, key: 'Esc', icon: SVG('<path d="M4 7h16M4 12h16M4 17h16"/>') },
]);

/** What a hotbar slot shows: {state, label, seconds, sweep (0..1 left), global}. Pure. */
export function slotView({ id, cd, mana, manaCost, flash = false, active = false }) {
  if (!id) return { state: 'empty', seconds: null, sweep: 0 };
  if (cd && cd.ms > 0) {
    const s = cd.ms / 1000;
    return { state: 'cooldown', seconds: cd.global ? null : (s < 3 ? s.toFixed(1) : String(Math.ceil(s))), sweep: cd.total ? Math.min(1, cd.ms / cd.total) : 0, global: !!cd.global, flash, active };
  }
  if (manaCost > mana) return { state: 'nomana', seconds: null, sweep: 0, flash, active };
  return { state: 'ready', seconds: null, sweep: 0, flash, active };
}

/**
 * @param {{doc?: Document, t: Function, base?: string, onSlot: (i:number)=>void, onTray: (id:string)=>void, onSync: ()=>void, onSilk: ()=>void,
 *   onMap: ()=>void, onZoom: (d:number)=>void, onFrame: ()=>void, keyOf: (action:string)=>string, reduced: ()=>boolean}} o
 */
export function createHud(o) {
  const doc = o.doc || globalThis.document, t = o.t, base = o.base || '/';
  if (!doc.getElementById('rpg-css')) { const s = doc.createElement('style'); s.id = 'rpg-css'; s.textContent = HUD_CSS; doc.head.append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const root = el('div', 'rpg'); root.id = 'rpg-hud';
  // tooltip (sprint/tooltip.js when the seam has it; a small local one otherwise)
  const tip = el('div', 'rpg-tip'); tip.hidden = true; tip.setAttribute('role', 'tooltip');
  let tipFor = null, tipTimer = 0;
  const showTip = (anchor, content) => {
    tip.replaceChildren(); if (content.title) tip.append(el('b', null, content.title));
    for (const l of content.lines || []) { const p = el('div', l.cls || null, l.text || l); if (l.bold) p.style.fontWeight = '700'; tip.append(p); }
    tip.hidden = false; const r = anchor.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, vw = doc.defaultView.innerWidth;
    let x = r.left + r.width / 2 - w / 2, y = r.top - h - 8; if (y < 8) y = r.bottom + 8; x = Math.max(8, Math.min(vw - w - 8, x));
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  const attachTip = (node, get) => {
    const on = () => { clearTimeout(tipTimer); tipTimer = setTimeout(() => { tipFor = node; const c = get(); if (c) showTip(node, c); }, 250); };
    const off = () => { clearTimeout(tipTimer); if (tipFor === node) { tip.hidden = true; tipFor = null; } };
    node.addEventListener('pointerenter', on); node.addEventListener('pointerleave', off); node.addEventListener('focus', on); node.addEventListener('blur', off);
    node.addEventListener('keydown', (e) => { if (e.key === 'Escape') off(); });
  };
  const bar = (cls) => { const b = el('div', 'rpg-bar px ' + cls); const ghost = el('i', 'ghost'), fill = el('i', 'fill'), txt = el('b'); b.append(ghost, fill, txt); return { b, ghost, fill, txt }; };

  // player frame
  const frame = el('div', 'rpg-frame px panel'); frame.tabIndex = 0; frame.setAttribute('role', 'button');
  const portrait = el('div', 'rpg-portrait'), name = el('div', 'rpg-name', 'Iris'), lv = el('div', 'rpg-lv');
  const hp = bar('rpg-hp'), mana = bar('rpg-mana');
  frame.append(portrait, name, lv, hp.b, mana.b);
  frame.addEventListener('click', () => o.onFrame && o.onFrame());
  const vignette = el('div', 'rpg-vignette');
  const buffs = el('div', 'rpg-buffs px');
  // target
  const target = el('div', 'rpg-target px panel'); target.hidden = true;
  const tn = el('div', 'tn'), tl = el('div', 'tl'), thp = bar(''); thp.b.className = 'rpg-bar';
  target.append(tn, tl, thp.b);
  // minimap
  const map = el('div', 'rpg-map px'); map.setAttribute('role', 'button'); map.tabIndex = 0; map.setAttribute('aria-label', t('hud.map.open'));
  const canvas = el('canvas'); canvas.width = 200; canvas.height = 200; map.append(canvas, el('div', 'n', 'N'));
  map.addEventListener('click', () => o.onMap && o.onMap());
  const zoom = el('div', 'rpg-zoom px'), zin = el('button', null, '+'), zout = el('button', null, '−');
  zin.type = zout.type = 'button'; zin.setAttribute('aria-label', t('hud.map.zoomIn')); zout.setAttribute('aria-label', t('hud.map.zoomOut'));
  zin.addEventListener('click', (e) => { e.stopPropagation(); o.onZoom && o.onZoom(-1); }); zout.addEventListener('click', (e) => { e.stopPropagation(); o.onZoom && o.onZoom(1); });
  zoom.append(zin, zout);
  const coords = el('div', 'rpg-coords px');
  // cast bar
  const cbar = bar('rpg-castbar'); cbar.b.hidden = true;
  // hotbar
  const hotbar = el('div', 'rpg-hotbar px'); hotbar.setAttribute('role', 'toolbar'); hotbar.setAttribute('aria-label', 'Hotbar');
  const slots = Array.from({ length: 9 }, (_, i) => {
    const b = el('button', 'rpg-slot'); b.type = 'button'; b.dataset.slot = String(i + 1);
    const ic = el('span', 'ic'), sw = el('span', 'sw'), cd = el('span', 'cd'), k = el('span', 'k');
    b.append(ic, sw, cd, k);
    b.addEventListener('click', () => o.onSlot && o.onSlot(i));
    b.addEventListener('dragover', (e) => { e.preventDefault(); });
    b.addEventListener('drop', (e) => { e.preventDefault(); const id = e.dataTransfer && e.dataTransfer.getData('text/x-ftf-skill'); if (id && o.onDropSkill) o.onDropSkill(i, id); });
    const s = { b, ic, sw, cd, k, id: undefined, view: null };
    attachTip(b, () => slotTip(s.id));
    hotbar.append(b); return s;
  });
  const slotTip = (id) => {
    if (!id) return { lines: [t('hud.slot.empty')] };
    const sk = skillById(id); if (!sk) return null;
    const cd = (sk.cooldownMs / 1000).toFixed(sk.cooldownMs % 1000 ? 1 : 0), kind = t('hud.kind.' + (sk.kind === 'active' || sk.kind === 'passive' ? sk.kind : sk.kind));
    return { title: sk.name, lines: [{ text: sk.mana ? t('hud.slot.tip', { kind, mana: sk.mana, cd }) : t('hud.slot.tipFree', { kind, cd }), cls: 'm' }, sk.text] };
  };
  // xp
  const xp = bar('rpg-xp'); xp.txt.remove(); for (const p of [25, 50, 75]) { const tk = el('span', 'tick'); tk.style.left = p + '%'; xp.b.append(tk); }
  let xpTip = null; attachTip(xp.b, () => xpTip);
  // chat / log
  const log = el('div', 'rpg-log px panel'); const tabs = el('div', 'tabs'); tabs.setAttribute('role', 'tablist'); const body = el('div', 'body'); body.setAttribute('aria-live', 'polite');
  const lines = { log: [], chat: [], loot: [] }; let tab = 'log';
  const tabBtn = {};
  for (const id of ['log', 'chat', 'loot']) { const b = el('button', null, t('hud.log.tab.' + id)); b.type = 'button'; b.setAttribute('role', 'tab'); b.addEventListener('click', () => { tab = id; paintLog(); }); tabBtn[id] = b; tabs.append(b); }
  log.append(tabs, body);
  const paintLog = () => {
    for (const id in tabBtn) tabBtn[id].setAttribute('aria-selected', String(id === tab));
    tabBtn.chat.hidden = !lines.chat.length; if (tab === 'chat' && !lines.chat.length) { tab = 'log'; tabBtn.log.setAttribute('aria-selected', 'true'); tabBtn.chat.setAttribute('aria-selected', 'false'); }   // no empty chat tab
    const list = lines[tab]; body.replaceChildren(...(list.length ? list : (tab === 'chat' ? [{ text: t('hud.log.chatEmpty'), kind: 'sys' }] : [])).map((l) => el('p', l.kind, l.text)));
    body.scrollTop = body.scrollHeight;
  };
  // silk chip
  const silk = el('div', 'rpg-silk px panel'); silk.tabIndex = 0; silk.setAttribute('role', 'button'); silk.id = 'rpg-silk';
  const coin = el('span', 'coin'), l1 = el('span', 'l1'), l2 = el('span', 'l2'), sync = el('button', 'sync', '⟳'); sync.type = 'button'; sync.setAttribute('aria-label', t('silk.sync'));
  coin.style.backgroundImage = `url(${base}assets/ui/icons/silk_coin_48.webp)`; coin.style.backgroundSize = 'cover';
  sync.addEventListener('click', (e) => { e.stopPropagation(); o.onSync && o.onSync(); });
  silk.addEventListener('click', () => o.onSilk && o.onSilk());
  silk.append(coin, l1, l2, sync);
  let silkTip = null; attachTip(silk, () => silkTip);
  // tray
  const tray = el('div', 'rpg-tray px'); const trayBtn = {};
  for (const it of TRAY) {
    const b = el('button', it.id === 'menu' ? 'menu' : null); b.type = 'button'; b.id = 'rpg-tray-' + it.id; b.innerHTML = it.icon;
    const k = el('span', 'k'), dot = el('span', 'dot'), lbl = el('span', 'lbl', t('hud.tray.' + it.id)); b.append(k, dot, lbl); b.setAttribute('aria-label', t('hud.tray.' + it.id));
    b.addEventListener('click', () => o.onTray && o.onTray(it.id));
    attachTip(b, () => (b.disabled ? { title: t('hud.tray.' + it.id), lines: [b.dataset.why || t('hud.tray.notNow')] } : null));   // the label shows on hover; the tooltip only says why it is off
    trayBtn[it.id] = b; tray.append(b);
  }
  // banner
  const banner = el('div', 'rpg-banner px');
  root.append(vignette, frame, buffs, target, map, zoom, coords, cbar.b, hotbar, xp.b, log, silk, tray, banner);
  doc.body.append(root, tip); doc.documentElement.classList.add('rpg-on');
  paintLog();

  let lastHp = null, ghostTimer = 0;
  return {
    root, slots, tray: trayBtn, canvas, map,
    /** Paint everything from a view (rpg/index.js builds it every frame; only changed text is written). */
    render(v) {
      root.dataset.reduced = o.reduced && o.reduced() ? '1' : '0';
      lv.textContent = t('hud.level', { n: v.level });
      if (v.name && name.textContent !== v.name) { name.textContent = v.name; name.title = v.name; }
      if (v.portrait && portrait.dataset.src !== v.portrait) { portrait.dataset.src = v.portrait; portrait.style.backgroundImage = `url(${v.portrait})`; }
      const hpPct = v.maxHP ? Math.max(0, Math.min(1, v.hp / v.maxHP)) : 0;
      hp.fill.style.width = (hpPct * 100).toFixed(1) + '%'; hp.txt.textContent = `${Math.ceil(v.hp)} / ${v.maxHP}`;
      if (lastHp != null && v.hp < lastHp - 0.01) { clearTimeout(ghostTimer); hp.ghost.style.transition = 'none'; hp.ghost.style.width = ((lastHp / v.maxHP) * 100).toFixed(1) + '%'; ghostTimer = setTimeout(() => { hp.ghost.style.transition = ''; hp.ghost.style.width = (hpPct * 100).toFixed(1) + '%'; }, 30); }
      else if (lastHp == null || v.hp > lastHp) hp.ghost.style.width = (hpPct * 100).toFixed(1) + '%';
      lastHp = v.hp;
      hp.b.dataset.low = hpPct < 0.25 && hpPct > 0 ? '1' : '0'; vignette.dataset.on = hp.b.dataset.low;
      mana.fill.style.width = (v.maxMana ? (v.mana / v.maxMana) * 100 : 0).toFixed(1) + '%'; mana.txt.textContent = `${Math.floor(v.mana)} / ${v.maxMana}`;
      mana.b.dataset.pulse = v.manaPulse ? '1' : '0';
      // target
      if (v.target) {
        target.hidden = false; tn.textContent = v.target.name; tl.textContent = v.target.elite ? t('hud.target.elite') : '';
        target.dataset.elite = v.target.elite ? '1' : '0'; thp.fill.style.width = ((v.target.hp / v.target.maxHp) * 100).toFixed(1) + '%'; thp.txt.textContent = `${Math.ceil(v.target.hp)} / ${v.target.maxHp}`;
      } else target.hidden = true;
      // buffs
      const bk = (v.buffs || []).map((b) => b.id + ':' + Math.ceil(b.left)).join(',');
      if (buffs.dataset.k !== bk) { buffs.dataset.k = bk; buffs.replaceChildren(...(v.buffs || []).map((b) => { const d = el('div', 'rpg-buff', String(Math.ceil(b.left))); d.dataset.debuff = b.debuff ? '1' : '0'; d.title = b.name; return d; })); }
      // cast bar
      if (v.cast) { cbar.b.hidden = false; cbar.fill.style.width = (v.cast.p * 100).toFixed(1) + '%'; cbar.txt.textContent = v.cast.name; cbar.b.dataset.int = v.cast.interrupted ? '1' : '0'; } else cbar.b.hidden = true;
      // hotbar (empty slots show only while the Skills window is open)
      hotbar.dataset.edit = v.open && v.open.skills ? '1' : '0';
      v.slots.forEach((sv, i) => {
        const s = slots[i];
        if (s.id !== sv.id) { s.id = sv.id; const art = sv.id && SKILL_ART[sv.id]; s.ic.style.backgroundImage = art ? `url(${base}assets/ui/icons/${art}.webp)` : 'none'; s.ic.textContent = sv.id && !art ? (skillById(sv.id) || {}).name.slice(0, 1) : ''; s.b.setAttribute('aria-label', (sv.id ? skillById(sv.id).name : t('hud.slot.empty')) + ' (' + sv.key + ')'); }
        s.k.textContent = sv.key;
        s.b.dataset.state = sv.state; s.b.dataset.flash = sv.flash ? '1' : '0'; s.b.dataset.nomana = sv.state === 'nomana' ? '1' : '0'; s.b.dataset.active = sv.active ? '1' : '0'; s.b.dataset.pressed = sv.pressed ? '1' : '0';
        s.cd.textContent = sv.seconds || '';
        const deg = Math.round(sv.sweep * 360);
        s.sw.style.background = sv.state === 'cooldown' && deg > 0 ? `conic-gradient(rgba(0,0,0,.6) ${deg}deg, transparent ${deg}deg)` : 'none';
      });
      // xp
      xp.fill.style.width = (v.xpNeed ? (v.xpInto / v.xpNeed) * 100 : 100).toFixed(1) + '%';
      xpTip = { lines: [v.xpNeed ? t('hud.xp.tip', { level: v.level, into: v.xpInto.toLocaleString('en-US'), need: v.xpNeed.toLocaleString('en-US') }) : t('hud.xp.cap', { level: v.level })] };
      // silk
      const st = silkChipText(v.silk, t);
      l1.textContent = st.line1; l2.textContent = st.line2 || ''; l2.dataset.off = st.line2Kind === 'local' ? '1' : '0'; sync.hidden = !st.showSync;
      silkTip = { lines: [...st.tooltip.map((x) => ({ text: x.text, bold: x.bold })), { text: st.link, cls: 'm' }] };
      silk.setAttribute('aria-label', st.tooltip.map((x) => x.text).join('. '));
      if (v.silkPop) { silk.dataset.pop = '0'; void silk.offsetWidth; silk.dataset.pop = '1'; }
      // tray
      for (const it of TRAY) { const b = trayBtn[it.id]; b.querySelector('.k').textContent = it.key || o.keyOf(it.action); b.setAttribute('aria-pressed', String(!!(v.open && v.open[it.id]))); b.dataset.badge = v.badges && v.badges[it.id] ? '1' : '0'; b.disabled = !!v.cinematic; b.dataset.why = v.cinematic ? t('hud.tray.notNow') : ''; }
      coords.textContent = v.coords ? t('hud.map.coords', { x: v.coords[0], z: v.coords[1] }) : '';
      zin.disabled = !!v.zoomMin; zout.disabled = !!v.zoomMax; zin.title = v.zoomMin ? t('hud.map.limit') : t('hud.map.zoomIn'); zout.title = v.zoomMax ? t('hud.map.limit') : t('hud.map.zoomOut');
    },
    log(text, kind = 'sys', channel = 'log') {
      const list = lines[channel] || lines.log; list.push({ text, kind }); if (list.length > 200) list.shift();
      if (channel === 'loot') { lines.log.push({ text, kind }); if (lines.log.length > 200) lines.log.shift(); }
      paintLog();
    },
    get lines() { return lines; },
    levelUp(n) { banner.textContent = t('hud.levelup.banner', { n }); banner.dataset.show = '0'; void banner.offsetWidth; banner.dataset.show = '1'; },
    setVisible(on) { if (root.hidden === !on) return; root.hidden = !on; doc.documentElement.classList.toggle('rpg-on', !!on); if (!on) tip.hidden = true; },
    dispose() { root.remove(); tip.remove(); doc.documentElement.classList.remove('rpg-on'); },
  };
}
