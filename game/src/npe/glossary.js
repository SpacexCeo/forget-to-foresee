// The in-game glossary (sprint 1.4, 7.7): a window with a search field and the 15 entries, opened from the menu
// ("Glossary"), from F1's cheat sheet, or from any underlined term (`<abbr data-glossary="silk">`). An entry may end
// with a "For the curious" fold that names the technical thing (never as its first line).
import NPE from '../play/locales/en-npe.js';

export const TERMS = Object.freeze(['silk', 'silk_chain', 'silk_pending', 'silk_play', 'gate', 'burn', 'testnet', 'chest', 'loot_nft', 'pass', 'agent', 'season', 'level', 'mana', 'cooldown']);
const fmt = (s, a) => String(s).replace(/\{(\w+)\}/g, (m, k) => (a && a[k] != null ? String(a[k]) : m));
const tx = (t, k, a) => { const r = t ? t(k, a) : k; return r === k && NPE[k] != null ? fmt(NPE[k], a) : r; };

/** The entries (term, text, curious?) filtered by a search string (term or text, case-insensitive). */
export function entries(t, vars = {}, q = '') {
  const needle = String(q || '').trim().toLowerCase();
  return TERMS.map((id) => ({ id, term: tx(t, `gloss.${id}.term`), text: tx(t, `gloss.${id}.text`, vars), curious: NPE['curious.gloss.' + id] ? tx(t, 'curious.gloss.' + id) : null }))
    .filter((e) => !needle || e.term.toLowerCase().includes(needle) || e.text.toLowerCase().includes(needle));
}

const CSS = `
.npe-gl-wrap { position: fixed; inset: 0; z-index: 9970; display: grid; place-items: center; padding: 12px; background: rgba(0, 0, 0, .5); }
.npe-gl { width: min(100%, 640px); max-height: min(560px, calc(100vh - 24px)); display: flex; flex-direction: column; box-sizing: border-box; padding: 18px; background: #0e1018; border: 1px solid #3a3f55; border-radius: 14px; color: #eef0f6; font: 15px/1.45 system-ui, sans-serif; }
.npe-gl h2 { margin: 0 0 10px; font: 700 22px/1.2 Georgia, serif; color: #f6c860; }
.npe-gl input { height: 40px; box-sizing: border-box; padding: 0 12px; border-radius: 8px; border: 1px solid #3a3f55; background: #070910; color: #eef0f6; font: 15px system-ui, sans-serif; }
.npe-gl ul { list-style: none; margin: 10px 0 0; padding: 0; overflow: auto; }
.npe-gl li { padding: 10px 2px; border-top: 1px solid rgba(255, 255, 255, .07); }
.npe-gl li.hit { background: rgba(246, 200, 96, .12); }
.npe-gl li b { display: block; font-size: 16px; font-weight: 700; }
.npe-gl details { margin-top: 4px; color: #aab1c5; font-size: 13px; }
.npe-gl .x { align-self: flex-end; margin-top: 10px; min-height: 40px; padding: 0 18px; border-radius: 10px; border: 1px solid #3a3f55; background: transparent; color: #eef0f6; font: 600 14px system-ui, sans-serif; cursor: pointer; }
abbr[data-glossary] { text-decoration: underline dotted 1px #7fb6ff; cursor: help; }
`;

/**
 * @param {{doc?: Document, t?: Function, vars?: object, term?: string}} o
 * @returns {{close(): void, search(q: string): number, readonly isOpen: boolean}}
 */
export function openGlossary({ doc = globalThis.document, t = null, vars = {}, term = null } = {}) {
  if (!(doc.getElementById && doc.getElementById('npe-gl-style'))) { const s = doc.createElement('style'); s.id = 'npe-gl-style'; s.textContent = CSS; (doc.head || doc.body).append(s); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const wrap = el('div', 'npe-gl-wrap'); const box = el('div', 'npe-gl'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  const h = el('h2', null, tx(t, 'gloss.title')); box.setAttribute('aria-label', h.textContent);
  const q = el('input'); q.type = 'search'; q.placeholder = tx(t, 'gloss.search'); q.setAttribute('aria-label', q.placeholder);
  const list = el('ul'); const x = el('button', 'x', tx(t, 'quest.close') === 'quest.close' ? 'Close' : tx(t, 'quest.close')); x.type = 'button';
  function render(needle) {
    const es = entries(t, vars, needle);
    list.replaceChildren(...(es.length ? es.map((e) => {
      const li = el('li', e.id === term ? 'hit' : null); li.dataset.term = e.id; li.append(el('b', null, e.term), el('span', null, e.text));
      if (e.curious) { const d = el('details'); d.append(el('summary', null, tx(t, 'gloss.curious')), el('span', null, e.curious)); li.append(d); }
      return li;
    }) : [el('li', null, tx(t, 'gloss.none'))]));
    return es.length;
  }
  q.addEventListener('input', () => render(q.value));
  box.append(h, q, list, x); wrap.append(box); doc.body.append(wrap);
  render('');
  let open = true;
  const close = () => { if (!open) return; open = false; wrap.remove(); if (doc.removeEventListener) doc.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  x.addEventListener('click', close); wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
  if (doc.addEventListener) doc.addEventListener('keydown', onKey, true);
  if (term) { const hit = list.querySelector('.hit'); try { if (hit && hit.scrollIntoView) hit.scrollIntoView({ block: 'nearest' }); } catch { /* */ } } else { try { q.focus(); } catch { /* */ } }
  return { close, search: (s) => { q.value = s; return render(s); }, get isOpen() { return open; } };
}

/** Makes every `abbr[data-glossary]` under `root` open the glossary at its term. Returns the number wired. */
export function attach(root, { doc = globalThis.document, t = null, vars = {} } = {}) {
  let n = 0;
  for (const a of root.querySelectorAll('abbr[data-glossary]')) {
    if (a.dataset.glossaryWired) continue;
    a.dataset.glossaryWired = '1'; a.tabIndex = 0; a.setAttribute('role', 'button'); n++;
    const go = () => openGlossary({ doc, t, vars, term: a.dataset.glossary });
    a.addEventListener('click', go);
    a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  }
  return n;
}
