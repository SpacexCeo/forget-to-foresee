// Dev page for the UI shell (game/ui-preview.html). Runs without the 3D scene:
// first contact mounts the HUD over a local headless season (labeled local demo).
import * as E from '../game/engine.js';
import { mountShell, mountHud, createEngineStore, mountConstructor, mountTournamentCard, getUiContext } from './index.js';
import { h, bindI18n, ensureStyles } from './dom.js';
import { bindGamepadMenus } from './gamepad-menu.js';
import { mountUiReference } from './ui-reference.js';
import { POLICY } from './preview-policy.js';

const app = document.getElementById('app');
const ctx = getUiContext();
const view = new URLSearchParams(location.search).get('view');

function mountWorldPreview() {
  ensureStyles();
  app.replaceChildren();
  E.newSeason((Math.random() * 1e9) | 0, { rules: 'v2' });
  E.startGame('');
  const store = createEngineStore(E);
  const stage = h('div', { class: 'ftf-stage' });
  const bar = h('div', { class: 'ftf-preview-bar' },
    h('span', { class: 'ftf-badge ftf-badge-demo', i18n: 'preview.localDemo' }),
    h('button', { class: 'ftf-btn ftf-btn-small', i18n: 'preview.autoPlay', attrs: { type: 'button' }, on: { click: autoTick } }),
    h('button', { class: 'ftf-btn ftf-btn-small', i18n: 'preview.endTick', attrs: { type: 'button' }, on: { click: endTick } }),
    h('button', { class: 'ftf-btn ftf-btn-small', i18n: 'preview.newSeason', attrs: { type: 'button' }, on: { click: mountWorldPreview } }));
  const page = h('div', { class: 'ftf-root' }, bar, stage);
  app.append(page);
  bindI18n(page, ctx.i18n);
  const hud = mountHud(stage, store, { ctx });
  function flush() { hud.pushFx(store.takeFx()); store.notify(); }
  function endTick() {
    if (E.S.phase === 'vote') E.castVote(true);
    else if (E.S.phase === 'play') E.endTick();
    flush();
  }
  function autoTick() {
    let n = 0, guard = 0, it;
    while (guard++ < 12 && (it = POLICY(E.S, E, n))) {
      if (it.type === 'anchor') n++;
      const res = it.run();
      if (res && res.ok === false) { hud.showRejection(res.reason); break; }
    }
    endTick();
  }
  flush();
  window.__ftf = { E, store, hud, ctx };
}

if (view === 'reference') mountUiReference(app);
else if (view === 'world') mountWorldPreview();
else if (view === 'constructor') { ensureStyles(); const w = h('div', { class: 'ftf-root', attrs: { style: 'padding:24px' } }); app.append(w); mountConstructor(w, { ctx }); bindI18n(w, ctx.i18n); }
else if (view === 'tournament') { ensureStyles(); const w = h('div', { class: 'ftf-root', attrs: { style: 'padding:24px;max-width:480px' } }); app.append(w); mountTournamentCard(w, ctx); bindI18n(w, ctx.i18n); }
else mountShell(app, { ctx, onFirstContact: mountWorldPreview, firstContactNoteKey: 'fc.previewNote' });

bindGamepadMenus(app);
