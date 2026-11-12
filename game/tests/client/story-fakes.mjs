// Minimal DOM, storage and i18n fakes for the Expedition's town views (tests only).
export function memStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; }
export function fakeDoc() {
  const el = (tag) => {
    const e = { tagName: tag.toUpperCase(), children: [], style: {}, attrs: {}, hidden: false, textContent: '', className: '', parent: null, listeners: {},
      setAttribute(k, v) { this.attrs[k] = String(v); }, append(...cs) { for (const c of cs) { c.parent = this; this.children.push(c); } },
      remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } },
      addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }, click() { for (const f of this.listeners.click || []) f({ stopPropagation() {} }); },
      querySelector(sel) { return all(this).find((c) => c.tagName === sel.toUpperCase()) || null; },
      querySelectorAll(sel) { return all(this).filter((c) => c.tagName === sel.toUpperCase() || (sel.startsWith('.') && c.className === sel.slice(1))); } };
    return e;
  };
  const all = (n) => n.children.flatMap((c) => [c, ...all(c)]);
  const body = el('body');
  return { body, createElement: el, find: (cls) => all(body).filter((c) => c.className === cls) };
}
export const fakeI18n = () => ({ t: (k, a) => (a && Object.keys(a).length ? k + ' ' + JSON.stringify(a) : k) });
