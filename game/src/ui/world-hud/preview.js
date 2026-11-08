// Dev page for the world HUD (game/hud-preview.html). Renders DEMO_MODEL over a dark backdrop or,
// for parity checks, over the owner's mockup (?ref=1; the PNG lives in git-ignored .scratch/ref/).
// Query: layout=desktop|mobile  ref=1  dim=0..1  lang=en|ru  sheet=1  tab=log|hints|lore
import { mountWorldHud, DEMO_MODEL } from './index.js';
import { getUiContext } from '../context.js';

const q = new URLSearchParams(location.search);
const ctx = getUiContext();
if (q.get('lang')) ctx.i18n.setLocale(q.get('lang'));
const layout = q.get('layout') === 'mobile' ? 'mobile' : q.get('layout') === 'desktop' ? 'desktop' : undefined;
const sheet = q.get('sheet') === '1';

// Mobile reference: left phone screen at image x 28–582, y 14–1261; right phone (sheet) at x 634.
const MOBILE_SCALE = 1.4231;
if (q.get('ref') === '1') {
  const img = document.createElement('img');
  img.className = 'wh-preview-ref';
  img.alt = '';
  img.style.opacity = q.get('dim') || '1';
  if ((layout || (innerWidth <= 700 ? 'mobile' : 'desktop')) === 'mobile') {
    img.src = '/.scratch/ref/mobile.png';
    const x0 = sheet ? 634 : 28, y0 = 14;
    Object.assign(img.style, { width: 1219 / MOBILE_SCALE + 'px', height: 1290 / MOBILE_SCALE + 'px', left: -x0 / MOBILE_SCALE + 'px', top: -y0 / MOBILE_SCALE + 'px' });
  } else {
    img.src = '/.scratch/ref/desktop.png';
    Object.assign(img.style, { inset: '0', width: '100%', height: '100%', objectFit: 'fill' });
  }
  document.body.prepend(img);
}

const hud = mountWorldHud(document.getElementById('hud'), {
  model: DEMO_MODEL, ctx, layout,
  onAction: (a, ...args) => console.debug('[wh action]', a, ...args),
});
if (sheet && hud.signs.open) hud.signs.open();
if (q.get('tab') && hud.log.setTab) hud.log.setTab(q.get('tab'));
window.__wh = { hud, ctx, DEMO_MODEL };
document.documentElement.dataset.whReady = '1';
