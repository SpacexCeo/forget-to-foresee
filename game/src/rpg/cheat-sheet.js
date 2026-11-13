// The F1 cheat sheet (sprint plan 5.11): a read-only view of the current key bindings, grouped like the rebind screen,
// the drawn keyboard (ui/keyboard-map.js), a link to change them (Settings -> Controls) and to the glossary (A4).
import { KEY_ACTIONS, KEY_GROUPS, bindings, keyLabel } from '../ui/keybinds.js';
import { controlsDiagram } from '../ui/keyboard-map.js';
import { ensureModalCss } from './skill-tree-ui.js';

/** The rows of the sheet: [{group, rows: [{id, label, key}]}] from a bindings object. Pure. */
export function cheatRows(b = bindings()) {
  return KEY_GROUPS.map((g) => ({ group: g, rows: KEY_ACTIONS.filter((a) => a.group === g).map((a) => ({ id: a.id, label: a.label, key: keyLabel(b[a.id]) })) }));
}

export function createCheatSheet({ doc = globalThis.document, t, touch = () => false, onRebind = null, onGlossary = null }) {
  ensureModalCss(doc);
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const box = el('section', 'rpg-modal rpg-cheat'); box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', t('help.title'));
  box.style.width = 'min(980px, calc(100vw - 24px))';
  const head = el('header'), x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); head.append(el('h2', null, t('help.title')), x);
  const body = el('div'); body.style.cssText = 'overflow:auto;padding:12px 16px;';
  const foot = el('footer'), rebind = el('button', 'btn', t('set.rebind')), gloss = el('button', 'btn', t('help.glossary')); rebind.type = gloss.type = 'button';
  foot.append(rebind, gloss);
  box.append(head, body, foot); doc.body.append(box);
  const close = () => { box.hidden = true; if (box.contains(doc.activeElement)) doc.activeElement.blur(); };
  x.addEventListener('click', close);
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'F1') { e.preventDefault(); e.stopPropagation(); close(); } });
  rebind.addEventListener('click', () => { close(); if (onRebind) onRebind(); });
  gloss.addEventListener('click', () => { close(); if (onGlossary) onGlossary(); });
  function paint() {
    const b = bindings(), cols = el('div'); cols.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:4px 18px;';
    for (const g of cheatRows(b)) {
      const sec = el('div'); sec.append(el('h3', null, t('set.grp.' + g.group))); sec.firstChild.style.cssText = 'margin:8px 0 4px;color:var(--ftf-gold, #c5a469);font-size:14px;letter-spacing:.06em;text-transform:uppercase;';
      for (const r of g.rows) {
        const row = el('div'); row.style.cssText = 'display:flex;justify-content:space-between;gap:10px;min-height:28px;align-items:center;font-size:14px;';
        const cap = el('b', null, r.key); cap.style.cssText = 'min-width:44px;padding:2px 8px;border:1px solid var(--ftf-border, rgba(197,164,105,.4));border-bottom-width:3px;border-radius:6px;text-align:center;font:700 13px ui-monospace,monospace;';
        row.append(el('span', null, t(r.label)), cap); sec.append(row);
      }
      cols.append(sec);
    }
    body.replaceChildren(cols, controlsDiagram({ doc, b, t, touch: touch() }));
  }
  return {
    get isOpen() { return !box.hidden; },
    toggle() { if (!box.hidden) return close(); paint(); box.hidden = false; x.focus(); },
    close, el: box, dispose() { box.remove(); },
  };
}
