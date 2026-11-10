// World HUD (docs/ui-world-hud.md §9.2): composes the package mounts over the 3D canvas.
// Desktop: status, log, actions and signs packages. Phones (docs/ui-mobile-hud.md): one touch package
// (mobile.js: status bar, Shell selector, objective, Iris line, navigation, quests and journal sheets)
// plus the Signs sheet from signs.js. The layout follows MOBILE_QUERY and flips live on resize.
import { h, bindI18n } from '../dom.js';
import { getUiContext } from '../context.js';
import { mountStatus } from './status.js';
import { mountSigns } from './signs.js';
import { mountLog } from './log.js';
import { mountActions } from './actions.js';
import { mountMobileHud } from './mobile.js';
import { installMotionStyles } from '../motion/index.js';

export { DEMO_MODEL } from './model.js';

/** Portrait phones by width; landscape phones by height with a touch screen (an 844×390 phone is not a desktop). */
export const MOBILE_QUERY = '(max-width: 700px), ((pointer: coarse) and (max-height: 500px))';

/**
 * Short-viewport tiers (owner 08.11: in-app browsers such as X crop the screen). The real visible height is
 * `visualViewport.height` (toolbars, keyboard), never 100vh. Sets on <html>: `--vvh` (px), `data-vh` =
 * tall | short (< 620) | tiny (< 500), and `data-inapp` as a hint only (the layout follows the measurement).
 */
export const VH_TIERS = Object.freeze({ short: 620, tiny: 500 });
export function viewportTier(height, tiers = VH_TIERS) {
  if (!(height > 0)) return 'tall';
  return height < tiers.tiny ? 'tiny' : height < tiers.short ? 'short' : 'tall';
}
export function inAppBrowser(ua = '') {
  return /\bTwitter|\bX(?:Android|iOS)|FBAN|FBAV|Instagram|Telegram|\bLine\//i.test(ua) ? 'inapp' : '';
}
let vhInstalled = 0;
export function installViewportVars(win = typeof window !== 'undefined' ? window : null) {
  if (!win || !win.document || vhInstalled++) return () => { vhInstalled = Math.max(0, vhInstalled - 1); };
  const root = win.document.documentElement;
  const apply = () => {
    const vv = win.visualViewport;
    const h = Math.round((vv && vv.height) || win.innerHeight || 0);
    root.style.setProperty('--vvh', h + 'px');
    root.dataset.vh = viewportTier(h);
  };
  const hint = inAppBrowser(win.navigator && win.navigator.userAgent);
  if (hint) root.dataset.inapp = hint;
  apply();
  const vv = win.visualViewport;
  if (vv && vv.addEventListener) { vv.addEventListener('resize', apply); vv.addEventListener('scroll', apply); }
  win.addEventListener('resize', apply);
  win.addEventListener('orientationchange', apply);
  return () => {
    if (--vhInstalled > 0) return;
    if (vv && vv.removeEventListener) { vv.removeEventListener('resize', apply); vv.removeEventListener('scroll', apply); }
    win.removeEventListener('resize', apply);
    win.removeEventListener('orientationchange', apply);
  };
}

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
  installMotionStyles(typeof document !== 'undefined' ? document : null); // Task S tokens (--mo-*) feed --wh-dur-* / --pl-dur-*
  import('./fonts.js').catch(() => { /* fonts are progressive; system serif fallback */ });

  const unVh = installViewportVars();
  const mq = typeof matchMedia === 'function' ? matchMedia(MOBILE_QUERY) : null;
  let layout = o.layout || (mq && mq.matches ? 'mobile' : 'desktop');
  let model = o.model;
  const doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const wrap = h('div', { class: 'wh-root', dataset: { layout } });
  root.appendChild(wrap);
  // .wh-root clips (overflow hidden) but still scrolls programmatically: a focus() on a sheet that is translated off
  // screen, or on a control under the keyboard, would shift the whole HUD. The overlay never scrolls.
  wrap.addEventListener('scroll', () => { if (wrap.scrollTop) wrap.scrollTop = 0; if (wrap.scrollLeft) wrap.scrollLeft = 0; });
  // The compact desktop skin (compact.css, docs/ui-compact-hud.md): one-line status and quest pills, the Shell row
  // under the status, a collapsed journal. ?hud=classic keeps the large mockup panels.
  const classic = (() => { try { return new URLSearchParams(doc.defaultView.location.search).get('hud') === 'classic'; } catch { return false; } })();
  if (!classic && doc && doc.head) { try { ensureWhStyle('compact', new URL('./compact.css', import.meta.url).href, doc); } catch { /* no DOM (tests) */ } }
  const bodyClass = (on) => {
    if (!doc || !doc.body || !doc.body.classList) return;
    doc.body.classList.toggle('wh-mobile', on);
    doc.body.classList.toggle('wh-compact', !on && !classic);
  };
  bodyClass(layout === 'mobile');

  let api;
  const onAction = (action, ...args) => {
    if (action === 'hotkey' && args[0] === 'signs') api.signs.toggle && api.signs.toggle();
    else if (action === 'tile' && args[0] === 'signs') api.signs.open && api.signs.open();
    else if (action === 'signsClose') {
      if (api.signs && api.signs.isOpen && api.signs.isOpen()) api.signs.close(); // the nav's second tap (signs.js reports its own close with the same action)
      if (api.mobile && api.mobile.active === 'signs') api.mobile.setActive(null);
    }
    else if (action === 'signsOpen' && api.mobile) api.mobile.setActive('signs');
    if (o.onAction) o.onAction(action, ...args);
  };
  const opts = () => ({ model, i18n, layout, onAction, keys: o.keys, prefs: { reducedMotion: () => (prefs && prefs.reducedMotion ? prefs.reducedMotion() : matchReduced()) } });
  /** Packages of a layout. The phone set is rebuilt on a layout change; the desktop set re-renders itself. */
  let parts = [];
  let mobile = null;
  function mountParts() {
    if (layout === 'mobile') {
      mobile = mountMobileHud(wrap, opts());
      const signs = mountSigns(wrap, opts());
      parts = [mobile, signs];
      api.status = null; api.log = null; api.actions = null; api.signs = signs;
    } else {
      mobile = null;
      const status = mountStatus(wrap, opts());
      const log = mountLog(wrap, opts());
      const actions = mountActions(wrap, opts());
      const signs = mountSigns(wrap, opts());
      parts = [status, log, actions, signs];
      api.status = status; api.log = log; api.actions = actions; api.signs = signs;
    }
  }

  const unbind = bindI18n(wrap, i18n);
  const onMq = () => { if (!o.layout) api.setLayout(mq.matches ? 'mobile' : 'desktop'); };
  if (mq && mq.addEventListener) mq.addEventListener('change', onMq);

  api = {
    el: wrap, status: null, signs: null, log: null, actions: null,
    get layout() { return layout; },
    /** The phone package (mobile.js) while the layout is 'mobile', else null. */
    get mobile() { return mobile; },
    update(next) { model = next; for (const p of parts) p.update(model, layout); },
    setLayout(l) {
      if (l === layout) return;
      layout = l; wrap.dataset.layout = l;
      bodyClass(l === 'mobile');
      for (const p of parts) p.destroy();
      mountParts();
    },
    destroy() {
      if (mq && mq.removeEventListener) mq.removeEventListener('change', onMq);
      unbind();
      unVh();
      for (const p of parts) p.destroy();
      bodyClass(false);
      wrap.remove();
    },
  };
  mountParts();
  return api;
}

function matchReduced() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
