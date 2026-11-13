// A small DOM for the quest UI tests: elements with classList, dataset, attributes, events, and querySelector for
// tags, .classes and [data-x="y"] / [attr=value]. Enough for the journal, the tracker and the auto-walk label.
export function makeDoc() {
  const all = (n) => n.children.flatMap((c) => [c, ...all(c)]);
  const matches = (e, sel) => {
    if (sel.startsWith('.')) return e.classList.contains(sel.slice(1));
    const m = sel.match(/^\[([\w-]+)(?:="?([^"\]]*)"?)?\]$/);
    if (m) { const k = m[1]; const v = k.startsWith('data-') ? e.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] : e.attrs[k]; return m[2] == null ? v != null : String(v) === m[2]; }
    return e.tagName === sel.toUpperCase();
  };
  const el = (tag) => {
    const listeners = {};
    const e = {
      tagName: tag.toUpperCase(), children: [], parent: null, attrs: {}, dataset: {}, style: {}, hidden: false, disabled: false, title: '', type: '', value: '', placeholder: '', id: '', _text: '', _cls: new Set(),
      get className() { return [...this._cls].join(' '); }, set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); },
      classList: null,
      get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }, set textContent(v) { this._text = String(v); this.children = []; },
      get firstChild() { return this.children[0] || null; },
      setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
      append(...cs) { for (const c of cs) { if (c.parent) c.remove(); c.parent = this; this.children.push(c); } },
      prepend(c) { if (c.parent) c.remove(); c.parent = this; this.children.unshift(c); },
      remove() { if (this.parent) { this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; } },
      replaceChildren(...cs) { for (const c of this.children) c.parent = null; this.children = []; this.append(...cs); },
      addEventListener(t, f) { (listeners[t] ||= []).push(f); }, removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
      dispatch(t, ev = {}) { for (const f of [...(listeners[t] || [])]) f({ target: this, stopPropagation() {}, preventDefault() {}, ...ev }); },
      click() { if (!this.disabled) this.dispatch('click'); }, dblclick() { this.dispatch('dblclick'); },
      focus() {}, setSelectionRange() {},
      querySelector(sel) { return all(this).find((c) => matches(c, sel)) || null; },
      querySelectorAll(sel) { return all(this).filter((c) => matches(c, sel)); },
      get offsetWidth() { return 1; },
    };
    e.classList = { add: (...c) => c.forEach((x) => e._cls.add(x)), remove: (...c) => c.forEach((x) => e._cls.delete(x)), contains: (c) => e._cls.has(c), toggle: (c, on) => { const v = on === undefined ? !e._cls.has(c) : !!on; if (v) e._cls.add(c); else e._cls.delete(c); return v; } };
    return e;
  };
  const head = el('head'), body = el('body');
  const doc = { head, body, createElement: el, getElementById: (id) => all(head).concat(all(body)).find((c) => c.id === id) || null,
    querySelector: (sel) => body.querySelector(sel), querySelectorAll: (sel) => body.querySelectorAll(sel) };
  return doc;
}
export function makeWin() { const t = new EventTarget(); return Object.assign(t, { key(code, key = '') { t.dispatchEvent(Object.assign(new Event('keydown'), { code, key: key || code })); } }); }
