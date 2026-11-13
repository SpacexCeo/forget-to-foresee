// The skill tree window (N; sprint plan 5.9): three branch columns of five nodes, node states (learned, available,
// locked by requirement, by level, cannot afford), click to learn, drag onto the hotbar or select and press 5 to 9,
// the points chips and the respec with its confirm. DOM over `api` (rpg/index.js).
import { NODES, NODE, BRANCHES } from './skills-data.js';

const CSS = `
.rpg-modal { position: fixed; z-index: 40; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(1100px, calc(100vw - 24px)); max-height: calc(100vh - 24px);
  display: flex; flex-direction: column; background: var(--ftf-panel-solid, #101f1a); border: 1px solid var(--ftf-border, rgba(197,164,105,.4)); border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,.55);
  color: var(--ftf-text, #eef0ea); font: 16px/1.4 "Atkinson Hyperlegible", system-ui, sans-serif; }
.rpg-modal[hidden] { display: none; }
.rpg-modal header, .rpg-modal footer { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 0 16px; }
.rpg-modal header { border-bottom: 1px solid var(--ftf-border, rgba(197,164,105,.4)); } .rpg-modal footer { border-top: 1px solid var(--ftf-border, rgba(197,164,105,.4)); justify-content: space-between; flex-wrap: wrap; padding: 8px 16px; }
.rpg-modal h2 { margin: 0; flex: 1; font: 600 28px "Cormorant Garamond", Georgia, serif; color: var(--ftf-gold, #c5a469); }
.rpg-modal .chip { padding: 4px 10px; border-radius: 999px; background: rgba(197,164,105,.15); color: var(--ftf-gold, #c5a469); font-weight: 700; font-size: 14px; }
.rpg-modal .x { width: 40px; height: 40px; border-radius: 8px; border: 1px solid var(--ftf-border, rgba(197,164,105,.4)); background: transparent; color: inherit; font-size: 20px; cursor: pointer; }
.rpg-modal .btn { min-height: 44px; padding: 0 18px; border-radius: 10px; border: 1px solid var(--ftf-border, rgba(197,164,105,.4)); background: transparent; color: inherit; cursor: pointer; font: inherit; }
.rpg-modal .btn.primary { background: var(--ftf-gold, #c5a469); color: #14110a; border-color: var(--ftf-gold, #c5a469); font-weight: 700; }
.rpg-modal .btn:disabled { opacity: .45; cursor: not-allowed; }
.rpg-modal .hint { color: var(--ftf-muted, #aab6b0); font-size: 14px; }
.rpg-tree { display: grid; grid-template-columns: repeat(3, minmax(0, 340px)); gap: 20px; justify-content: center; padding: 16px; overflow: auto; }
.rpg-branch h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font-size: 18px; }
.rpg-node-row { display: grid; grid-template-columns: 56px 64px 1fr; align-items: center; gap: 10px; position: relative; }
.rpg-node-row + .rpg-node-row { margin-top: 24px; }
.rpg-node-row + .rpg-node-row::before { content: ""; position: absolute; left: 87px; top: -24px; width: 2px; height: 24px; background: var(--ftf-border, rgba(197,164,105,.4)); }
.rpg-node-row[data-learned="1"] + .rpg-node-row::before { background: var(--bc); }
.rpg-node-row .tier { font-size: 12px; color: var(--ftf-muted, #aab6b0); }
.rpg-node { width: 64px; height: 64px; border-radius: 10px; border: 2px solid var(--ftf-border, rgba(197,164,105,.4)); background: rgba(255,255,255,.04); color: inherit; font: 700 22px "Cormorant Garamond", Georgia, serif; cursor: pointer; position: relative; }
.rpg-node:focus-visible { outline: 2px solid var(--ftf-gold, #c5a469); outline-offset: 2px; }
.rpg-node[data-state="learned"] { border-color: var(--bc); }
.rpg-node[data-state="learned"]::after { content: "✓"; position: absolute; right: -6px; top: -6px; width: 20px; height: 20px; border-radius: 50%; background: var(--bc); color: var(--ftf-panel-solid, #101f1a); font: 700 13px/20px system-ui; }
.rpg-node[data-state="available"] { border-color: var(--bc); animation: rpg-avail 1.2s ease-in-out infinite; }
.rpg-node[data-state^="locked"], .rpg-node[data-state="poor"] { filter: grayscale(1); opacity: .6; cursor: not-allowed; }
.rpg-node[data-state^="locked"]::before { content: "🔒"; position: absolute; left: -6px; top: -8px; font-size: 14px; }
.rpg-node[data-flash="1"] { box-shadow: 0 0 0 4px var(--bc); }
.rpg-node[aria-selected="true"] { outline: 2px dashed var(--ftf-gold, #c5a469); outline-offset: 3px; }
@keyframes rpg-avail { 50% { box-shadow: 0 0 10px var(--bc); } }
.rpg-node-name { font-size: 14px; } .rpg-node-name small { display: block; color: var(--ftf-muted, #aab6b0); font-size: 12px; }
html[data-motion="reduce"] .rpg-node { animation: none; }
@media (max-width: 899px) { .rpg-tree { grid-template-columns: 1fr; } }
`;

/** Node state for the UI: learned | available | locked-req | locked-level | poor. Pure. */
export function nodeState(api, id) {
  if ((api.rec.learned || []).includes(id)) return 'learned';
  const c = api.canLearn(id);
  if (c.ok) return 'available';
  return c.reason === 'requires' ? 'locked-req' : c.reason === 'level' ? 'locked-level' : 'poor';
}

/** Tooltip lines for a node (plan 5.9). */
export function nodeTip(api, id, t) {
  const n = NODE[id], st = nodeState(api, id), kind = t('hud.kind.' + (n.kind === 'passive' ? 'passive' : 'active'));
  const lines = [t('tree.line2', { kind, branch: t('tree.branch.' + n.branch), tier: n.tier }), n.kind === 'passive' && !n.mana ? t('tree.line3free') : t('tree.line3', { mana: n.mana, cd: n.cooldownMs / 1000 }), n.text];
  if (st === 'locked-req') lines.push(t('tree.needs', { name: NODE[n.requires].name }));
  else if (st === 'locked-level') lines.push(t('tree.needLevel', { n: n.level }));
  else if (st === 'poor') lines.push(t('tree.needPoints', { cost: n.cost, have: api.pointsLeft() }));
  else lines.push(t(st === 'learned' ? 'tree.learned' : 'tree.learn'));
  return { title: n.name, lines };
}

/** The shared modal styles (the tree and the character sheet). */
export function ensureModalCss(doc) { if (!doc.getElementById('rpg-tree-css')) { const s = doc.createElement('style'); s.id = 'rpg-tree-css'; s.textContent = CSS; doc.head.append(s); } }

export function createSkillTree({ doc = globalThis.document, t, api }) {
  ensureModalCss(doc);
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const box = el('section', 'rpg-modal'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', t('tree.title'));
  const head = el('header'), title = el('h2', null, t('tree.title')), sp = el('span', 'chip'), tp = el('span', 'chip'), x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
  head.append(title, sp, tp, x);
  const grid = el('div', 'rpg-tree');
  const foot = el('footer'), reset = el('button', 'btn', t('tree.reset')), hint = el('span', 'hint', t('tree.hint')); reset.type = 'button';
  foot.append(reset, hint);
  box.append(head, grid, foot); doc.body.append(box);
  let selected = null; const nodes = {};
  for (const b of BRANCHES) {
    const col = el('div', 'rpg-branch'); col.style.setProperty('--bc', b.color);
    const h = el('h3', null, t('tree.branch.' + b.id)); h.style.color = b.color; col.append(h);
    for (const n of NODES.filter((x) => x.branch === b.id)) {
      const row = el('div', 'rpg-node-row'); row.style.setProperty('--bc', b.color);
      const btn = el('button', 'rpg-node', n.name.slice(0, 1)); btn.type = 'button'; btn.dataset.id = n.id; btn.draggable = true;
      btn.addEventListener('click', () => { selected = n.id; const r = api.learn(n.id); if (r.ok) { btn.dataset.flash = '1'; setTimeout(() => { btn.dataset.flash = '0'; }, 200); } refresh(); });
      btn.addEventListener('dragstart', (e) => { if (e.dataTransfer && n.kind === 'active' && api.rec.learned.includes(n.id)) e.dataTransfer.setData('text/x-ftf-skill', n.id); else e.preventDefault(); });
      btn.addEventListener('keydown', (e) => { const m = /^Digit([5-9])$/.exec(e.code); if (m && n.kind === 'active' && api.rec.learned.includes(n.id)) { e.preventDefault(); e.stopPropagation(); api.place(Number(m[1]) - 1, n.id); } });
      btn.addEventListener('focus', () => { selected = n.id; refresh(); });
      const name = el('div', 'rpg-node-name', n.name); name.append(el('small', null, nodeTip(api, n.id, t).lines[0]));
      row.append(el('span', 'tier', t('tree.tier', { n: n.tier })), btn, name);
      nodes[n.id] = { btn, row }; col.append(row);
    }
    grid.append(col);
  }
  const close = () => { box.hidden = true; if (box.contains(doc.activeElement)) doc.activeElement.blur(); };
  x.addEventListener('click', close);
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
  reset.addEventListener('click', () => {
    if (globalThis.confirm && !globalThis.confirm(t('tree.resetConfirm'))) return;
    const r = api.respec(); if (!r.ok) hint.textContent = t('tree.resetWait', { m: Math.ceil(r.waitMs / 60000) }); refresh();
  });
  function refresh() {
    sp.textContent = t('tree.sp', { n: api.pointsLeft() }); tp.textContent = t('tree.tp', { n: api.statLeft() });
    for (const id in nodes) {
      const st = nodeState(api, id), { btn, row } = nodes[id], tip = nodeTip(api, id, t);
      if (btn.dataset.state !== st) btn.dataset.state = st;
      row.dataset.learned = st === 'learned' ? '1' : '0'; btn.setAttribute('aria-selected', String(selected === id));
      const lbl = tip.title + '. ' + tip.lines.join(' '); if (btn.title !== lbl) { btn.title = lbl; btn.setAttribute('aria-label', lbl); }
    }
  }
  return {
    get isOpen() { return !box.hidden; },
    toggle() { if (!box.hidden) return close(); box.hidden = false; if (!box.hidden) { refresh(); const f = grid.querySelector('.rpg-node'); if (f) f.focus(); } },
    refresh, close, el: box,
    dispose() { box.remove(); },
  };
}
