// Minimal DOM for World HUD package tests (no dependencies): elements with attributes, dataset,
// classList, text, raw innerHTML, listeners with bubbling, focus, and querySelector(All) for
// compound selectors (tag, .class, [attr], [attr="v"]), descendant combinators and comma groups.
// installDom() sets globalThis.document / window and returns { doc, win }.
export function installDom() {
  const kebab = (k) => 'data-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  class Node {
    constructor() { this.parentNode = null; this.childNodes = []; }
    get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === doc.documentElement; }
    remove() { if (this.parentNode) { const a = this.parentNode.childNodes; a.splice(a.indexOf(this), 1); this.parentNode = null; } }
  }
  class Text extends Node { constructor(t) { super(); this.data = String(t); } get textContent() { return this.data; } }
  class Element extends Node {
    constructor(tag) {
      super();
      this.tagName = tag.toUpperCase();
      this.attributes = new Map();
      this.listeners = {};
      this.rawHTML = '';
      this.scrollTop = 0;
      const self = this;
      this.dataset = new Proxy({}, {
        get: (_, k) => (typeof k === 'string' ? self.getAttribute(kebab(k)) ?? undefined : undefined),
        set: (_, k, v) => { self.setAttribute(kebab(k), String(v)); return true; },
        has: (_, k) => self.hasAttribute(kebab(k)),
        deleteProperty: (_, k) => { self.removeAttribute(kebab(k)); return true; },
      });
      this.classList = {
        add: (...c) => { const s = new Set(self.className.split(/\s+/).filter(Boolean)); c.forEach((x) => s.add(x)); self.className = [...s].join(' '); },
        remove: (...c) => { self.className = self.className.split(/\s+/).filter((x) => x && !c.includes(x)).join(' '); },
        contains: (c) => self.className.split(/\s+/).includes(c),
        toggle: (c, force) => { const on = force === undefined ? !self.classList.contains(c) : !!force; if (on) self.classList.add(c); else self.classList.remove(c); return on; },
      };
    }
    get className() { return this.getAttribute('class') || ''; }
    set className(v) { this.setAttribute('class', v); }
    get id() { return this.getAttribute('id') || ''; }
    set id(v) { this.setAttribute('id', v); }
    get tabIndex() { const v = this.getAttribute('tabindex'); return v == null ? (this.tagName === 'BUTTON' ? 0 : -1) : +v; }
    set tabIndex(v) { this.setAttribute('tabindex', String(v)); }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    hasAttribute(k) { return this.attributes.has(k); }
    removeAttribute(k) { this.attributes.delete(k); }
    get children() { return this.childNodes.filter((n) => n instanceof Element); }
    get firstElementChild() { return this.children[0] || null; }
    appendChild(n) { n.remove(); n.parentNode = this; this.childNodes.push(n); return n; }
    append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? new Text(n) : n); }
    contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
    get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
    set textContent(v) { for (const n of [...this.childNodes]) n.remove(); if (v !== '' && v != null) this.appendChild(new Text(v)); }
    get innerHTML() { return this.rawHTML; }
    set innerHTML(v) { this.textContent = ''; this.rawHTML = String(v); }
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
    removeEventListener(t, fn) { const a = this.listeners[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
    dispatchEvent(e) {
      e.target ||= this;
      e.preventDefault ||= () => { e.defaultPrevented = true; };
      for (let n = this; n; n = n.parentNode) for (const fn of [...(n.listeners?.[e.type] || [])]) fn(e);
      return true;
    }
    click() { this.dispatchEvent({ type: 'click' }); }
    focus() { doc.activeElement = this; }
    get style() { return (this._style ||= { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } }); }
    set style(v) { this._style = v; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    replaceChildren(...ns) { for (const n of [...this.childNodes]) n.remove(); this.append(...ns); }
    get descendants() { return this.children.flatMap((c) => [c, ...c.descendants]); }
    matches(sel) { return sel.split(',').some((s) => matchSel(this, s.trim())); }
    querySelectorAll(sel) { return this.descendants.filter((e) => e.matches(sel)); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  }
  function matchCompound(el, c) {
    const re = /^([a-z0-9]+)?((?:\.[\w-]+|\[[^\]]+\])*)$/i;
    const m = c.match(re);
    if (!m) throw new Error('selector not supported: ' + c);
    if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
    for (const part of m[2].match(/\.[\w-]+|\[[^\]]+\]/g) || []) {
      if (part[0] === '.') { if (!el.classList.contains(part.slice(1))) return false; continue; }
      const [, k, v] = part.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
      if (!el.hasAttribute(k) || (v !== undefined && el.getAttribute(k) !== v)) return false;
    }
    return true;
  }
  function matchSel(el, sel) {
    const parts = sel.split(/\s+/);
    if (!matchCompound(el, parts.pop())) return false;
    let n = el.parentNode;
    while (parts.length && n) { if (n instanceof Element && matchCompound(n, parts[parts.length - 1])) parts.pop(); n = n.parentNode; }
    return parts.length === 0;
  }
  const doc = {
    createElement: (t) => new Element(t),
    createTextNode: (t) => new Text(t),
    querySelector: (s) => doc.documentElement.querySelector(s),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s),
  };
  doc.documentElement = new Element('html');
  doc.head = doc.documentElement.appendChild(new Element('head'));
  doc.body = doc.documentElement.appendChild(new Element('body'));
  doc.activeElement = doc.body;
  const win = { listeners: {}, addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }, removeEventListener(t, fn) { const a = this.listeners[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } };
  globalThis.document = doc;
  globalThis.window = win;
  return { doc, win };
}
