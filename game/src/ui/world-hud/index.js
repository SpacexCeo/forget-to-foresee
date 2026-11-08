// World HUD (docs/ui-world-hud.md §9.2): composes the four package mounts over the 3D canvas.
// Layout follows matchMedia('(max-width: 700px)'); every package re-renders its own DOM for it.
import { h, bindI18n } from '../dom.js';
import { getUiContext } from '../context.js';
import { mountStatus } from './status.js';
import { mountSigns } from './signs.js';
import { mountLog } from './log.js';
import { mountActions } from './actions.js';

export { DEMO_MODEL } from './model.js';

const MOBILE_QUERY = '(max-width: 700px)';

/** Adds a stylesheet next to this module once (Vite dev, build and static serving). */
export function ensureWhStyle(name, href, doc = document) {
  if (doc.querySelector(`link[data-wh-css="${name}"]`)) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.whCss = name;
  doc.head.appendChild(link);
}

/**
 * @param {HTMLElement} root  positioned container over the canvas
 * @param {{model: object, ctx?: object, onAction?: (action: string, ...args: any[]) => void, layout?: 'desktop'|'mobile', keys?: boolean}} o
 *   `keys: false` when the host routes the keyboard (the 3D client): the HUD then only shows the letters
 */
export function mountWorldHud(root, o) {
  const ctx = o.ctx || getUiContext();
  const { i18n, prefs } = ctx;
  ensureWhStyle('tokens', new URL('./tokens.css', import.meta.url).href);
  import('./fonts.js').catch(() => { /* fonts are progressive; system serif fallback */ });

  const mq = typeof matchMedia === 'function' ? matchMedia(MOBILE_QUERY) : null;
  let layout = o.layout || (mq && mq.matches ? 'mobile' : 'desktop');
  let model = o.model;
  const wrap = h('div', { class: 'wh-root', dataset: { layout } });
  root.appendChild(wrap);

  let api;
  const onAction = (action, ...args) => {
    if (action === 'hotkey' && args[0] === 'signs') api.signs.toggle && api.signs.toggle();
    else if (action === 'tile' && args[0] === 'signs') api.signs.open && api.signs.open();
    if (o.onAction) o.onAction(action, ...args);
  };
  const opts = () => ({ model, i18n, layout, onAction, keys: o.keys, prefs: { reducedMotion: () => (prefs && prefs.reducedMotion ? prefs.reducedMotion() : matchReduced()) } });
  const status = mountStatus(wrap, opts());
  const log = mountLog(wrap, opts());
  const actions = mountActions(wrap, opts());
  const signs = mountSigns(wrap, opts());
  const parts = [status, log, actions, signs];

  const unbind = bindI18n(wrap, i18n);
  const onMq = () => { if (!o.layout) api.setLayout(mq.matches ? 'mobile' : 'desktop'); };
  if (mq && mq.addEventListener) mq.addEventListener('change', onMq);

  api = {
    el: wrap, status, signs, log, actions,
    get layout() { return layout; },
    update(next) { model = next; for (const p of parts) p.update(model, layout); },
    setLayout(l) {
      if (l === layout) return;
      layout = l; wrap.dataset.layout = l;
      for (const p of parts) p.update(model, layout);
    },
    destroy() {
      if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq);
      unbind();
      for (const p of parts) p.destroy();
      wrap.remove();
    },
  };
  return api;
}

function matchReduced() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
