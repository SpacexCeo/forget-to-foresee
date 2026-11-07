// Tiny DOM helpers. Translatable text is stored on the element (data-i18n + args),
// so a language switch re-renders in place: no reload, no lost state.

/**
 * h('button', {class: 'x', i18n: 'lobby.enter', attrs: {type: 'button'}, on: {click}}, ...children)
 * Props: class, i18n, args (object or () => object), i18nAttrs ({attr: key}), attrs, on, text, dataset.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'i18n') el.dataset.i18n = v;
    else if (k === 'args') el._i18nArgs = v;
    else if (k === 'i18nAttrs') { el.dataset.i18nAttrs = JSON.stringify(v); }
    else if (k === 'attrArgs') el._i18nAttrArgs = v;
    else if (k === 'attrs') for (const [a, av] of Object.entries(v)) { if (av != null && av !== false) el.setAttribute(a, av === true ? '' : av); }
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el[k] = v;
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

const argsOf = (v) => (typeof v === 'function' ? v() : v) || {};

/** Sets translatable text on an element and renders it now. */
export function tx(el, i18n, key, args) {
  el.dataset.i18n = key;
  el._i18nArgs = args;
  el.textContent = i18n.t(key, argsOf(args));
  return el;
}

/** Re-renders every translatable node under `root` (and root itself). */
export function applyI18n(root, i18n) {
  const nodes = [root, ...root.querySelectorAll('[data-i18n], [data-i18n-attrs]')];
  for (const el of nodes) {
    if (el.dataset && el.dataset.i18n) el.textContent = i18n.t(el.dataset.i18n, argsOf(el._i18nArgs));
    if (el.dataset && el.dataset.i18nAttrs) {
      const map = JSON.parse(el.dataset.i18nAttrs);
      for (const [attr, key] of Object.entries(map)) el.setAttribute(attr, i18n.t(key, argsOf(el._i18nAttrArgs)));
    }
  }
}

/** Renders now and on every locale change. Returns an unsubscribe function. */
export function bindI18n(root, i18n, onChange) {
  applyI18n(root, i18n);
  if (typeof document !== 'undefined') document.documentElement.lang = i18n.locale;
  return i18n.subscribe(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = i18n.locale;
    applyI18n(root, i18n);
    if (onChange) onChange();
  });
}

let stylesAdded = false;
/** Adds the UI stylesheet once (works under Vite dev, build, and plain static serving). */
export function ensureStyles(doc = document) {
  if (stylesAdded || doc.querySelector('link[data-ftf-ui]')) { stylesAdded = true; return; }
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./styles.css', import.meta.url).href;
  link.dataset.ftfUi = '';
  doc.head.appendChild(link);
  stylesAdded = true;
}

/** A modal <dialog> with a heading and close button. Focus returns to the opener on close. */
export function createDialog(i18n, { id, titleKey, body }) {
  const titleId = id + '-title';
  const close = h('button', { class: 'ftf-btn ftf-btn-small', i18n: 'common.close', attrs: { type: 'button' } });
  const dlg = h('dialog', { class: 'ftf-dialog', attrs: { id, 'aria-labelledby': titleId } },
    h('div', { class: 'ftf-dialog-head' }, h('h2', { i18n: titleKey, attrs: { id: titleId } }), close),
    h('div', { class: 'ftf-dialog-body' }, body));
  let opener = null;
  close.addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { if (opener && opener.isConnected) opener.focus(); });
  applyI18n(dlg, i18n);
  return {
    el: dlg,
    open(from) {
      opener = from || document.activeElement;
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      const first = dlg.querySelector('.ftf-dialog-body input, .ftf-dialog-body select, .ftf-dialog-body button') || close;
      first.focus();
    },
    close: () => dlg.close(),
  };
}

/** Arrow-key navigation between the focusable items of a menu (Tab still works). */
export function rovingArrows(container, selector = 'button') {
  container.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const items = [...container.querySelectorAll(selector)].filter((b) => !b.disabled && b.offsetParent !== null);
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    let j = i;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % items.length;
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i - 1 + items.length) % items.length;
    if (e.key === 'Home') j = 0;
    if (e.key === 'End') j = items.length - 1;
    items[j].focus();
  });
}
