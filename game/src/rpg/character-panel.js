// The character panel (C; sprint plan 5.10): portrait, name, level and the branch with the most points, the XP bar,
// Voice / Mind / Grit with "+" buttons, the derived numbers, stat points left. Up/Down select a stat, Enter adds.
import { NODE, BRANCHES } from './skills-data.js';
import { STATS } from './progression.js';
import { ensureModalCss } from './skill-tree-ui.js';
import { lockedCompanionSlot } from '../ui/companion-slot.js';

/** The branch with the most points spent ("" when none). Pure. */
export function mainBranch(rec) {
  const by = {}; for (const id of rec.learned || []) { const n = NODE[id]; if (n) by[n.branch] = (by[n.branch] || 0) + n.cost; }
  let best = '', most = 0; for (const b of BRANCHES) if ((by[b.id] || 0) > most) { most = by[b.id]; best = b.id; }
  return best;
}

export function createCharacterPanel({ doc = globalThis.document, t, api }) {
  ensureModalCss(doc);
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const box = el('section', 'rpg-modal rpg-sheet'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', t('char.title'));
  box.style.width = 'min(720px, calc(100vw - 24px))';
  const head = el('header'), title = el('h2', null, t('char.title')), x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); head.append(title, x);
  const body = el('div'); body.style.cssText = 'display:grid;grid-template-columns:minmax(0,280px) 1fr;gap:20px;padding:16px;';
  const left = el('div'), right = el('div');
  const portrait = el('div'); portrait.style.cssText = 'width:160px;height:160px;border-radius:50%;border:2px solid var(--ftf-gold-dim, #8e7a50);background:#13241e center/cover;';
  const nm = el('div', null, 'Iris'); nm.style.cssText = 'font-weight:700;font-size:20px;margin-top:10px;';
  const lvl = el('div', 'hint'), xpb = el('div'); xpb.style.cssText = 'position:relative;height:10px;margin-top:8px;border-radius:5px;background:#1d1230;overflow:hidden;';
  const xpf = el('i'); xpf.style.cssText = 'position:absolute;inset:0 auto 0 0;background:#b06cff;'; xpb.append(xpf);
  const xpt = el('div', 'hint'); const pet = lockedCompanionSlot(doc, t); pet.style.marginTop = '14px'; // the companion slot: locked for now (owner 13.11)
  left.append(portrait, nm, lvl, xpb, xpt, pet);
  const statRows = {}; let sel = 0;
  for (const s of STATS) {
    const r = el('div'); r.style.cssText = 'display:flex;align-items:center;gap:10px;min-height:44px;border-bottom:1px solid var(--ftf-border, rgba(197,164,105,.4));';
    const lab = el('span', null, t('char.stat.' + s)); lab.style.flex = '1'; lab.title = t('char.tip.' + s);
    const note = el('small', 'hint', t('char.tip.' + s)); note.style.cssText = 'display:block;font-size:12px;'; lab.append(note);
    const val = el('b'); const plus = el('button', 'btn', '+'); plus.type = 'button'; plus.style.cssText = 'min-height:28px;width:28px;padding:0;';
    plus.setAttribute('aria-label', t('char.add', { stat: t('char.stat.' + s) }));
    plus.addEventListener('click', () => { if (api.spend(s).ok) { plus.style.boxShadow = '0 0 0 3px var(--ftf-gold, #c5a469)'; setTimeout(() => { plus.style.boxShadow = ''; }, 150); } refresh(); });
    r.append(lab, val, plus); statRows[s] = { r, val, plus }; right.append(r);
  }
  const derivedList = el('dl'); derivedList.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:6px 12px;margin:14px 0 0;';
  right.append(derivedList);
  body.append(left, right);
  const foot = el('footer'), leftPts = el('span', 'chip'); foot.append(leftPts);
  box.append(head, body, foot); doc.body.append(box);
  const close = () => { box.hidden = true; if (box.contains(doc.activeElement)) doc.activeElement.blur(); };
  x.addEventListener('click', close);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : STATS.length - 1)) % STATS.length; statRows[STATS[sel]].plus.focus(); }
    else if (e.key === 'Enter' && doc.activeElement && doc.activeElement.tagName !== 'BUTTON') { e.preventDefault(); statRows[STATS[sel]].plus.click(); }
  });
  function refresh() {
    const L = api.level, rec = api.rec, d = api.stats, xi = api.xp, b = mainBranch(rec);
    lvl.textContent = t('char.level', { n: L, branch: b ? t('tree.branch.' + b) : t('char.newcomer') });
    xpf.style.width = (xi.need ? (xi.into / xi.need) * 100 : 100).toFixed(1) + '%';
    xpt.textContent = xi.need ? t('hud.xp.tip', { level: L, into: xi.into.toLocaleString('en-US'), need: xi.need.toLocaleString('en-US') }) : t('hud.xp.cap', { level: L });
    const left = api.statLeft();
    for (const s of STATS) { statRows[s].val.textContent = String(rec.stats[s] || 0); statRows[s].plus.disabled = left <= 0; }
    const rows = [['char.maxHp', String(d.maxHP)], ['char.maxMana', String(d.maxMana)], ['char.regen', t('char.regenVal', { n: d.manaRegen.toFixed(1) })], ['char.crit', Math.round(d.crit * 100) + '%'], ['char.dmg', '+' + Math.round(d.damageBonus * 100) + '%']];
    const k = rows.map((r) => r[1]).join('|');
    if (derivedList.dataset.k !== k) { derivedList.dataset.k = k; derivedList.replaceChildren(...rows.flatMap(([key, v]) => [el('dt', 'hint', t(key)), el('dd', null, v)])); for (const dd of derivedList.querySelectorAll('dd')) dd.style.margin = '0'; }
    leftPts.textContent = t('char.left', { n: left });
  }
  return {
    get isOpen() { return !box.hidden; },
    toggle() { if (!box.hidden) return close(); box.hidden = false; if (!box.hidden) { refresh(); statRows[STATS[0]].plus.focus(); } },
    refresh, close, el: box, dispose() { box.remove(); },
  };
}
