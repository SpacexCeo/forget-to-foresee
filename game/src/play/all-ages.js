// "Playable from 12 to 95" wiring (Task Q, docs/accessibility.md): attaches the accessibility layer to a
// running play session without touching the play layer's own files. One call from main.js after
// startPlay():
//   attachAllAges({ play, ctx, uiRoot, settingsDialog: controls.dialog });
// It mounts the recap ("What is happening?", key `?` and a button), Simple mode (Iris proposes one
// action per trial), the full Settings form inside the in-world controls dialog (so the mode, the
// language and every accessibility option are reachable mid-season), and narration of what the HUD
// shows: Iris's lines in the dialogue strip and the coaching toasts are spoken when narration is on.
// Keys are read on the window in the capture phase, so a key the layer consumes (Escape while the
// recap is open, Enter / P in Simple mode) never also reaches the world controls.
import { attachA11y, ensureA11yStyles } from '../ui/a11y.js';
import { buildSettings } from '../ui/settings.js';
import { createRecap } from './recap.js';
import { createSimpleMode } from './simple.js';
import { buildSeasonSection, fixedSeedFromSearch } from './season-local.js';
import { renderMsg } from './i18n.js';

/**
 * @param {object} o
 * @param {object} o.play   the object startPlay() returns (session, hub, ui, worldHud, map, fly, hud)
 * @param {object} o.ctx    play context (i18n, prefs, storage)
 * @param {HTMLElement} o.uiRoot
 * @param {HTMLDialogElement} [o.settingsDialog]  the scene controls dialog; the Settings form is appended to its body
 * @param {Window} [o.win]
 */
export function attachAllAges({ play, ctx, uiRoot, settingsDialog = null, win = globalThis.window }) {
  const doc = uiRoot.ownerDocument || document;
  ensureA11yStyles(doc);
  const narration = attachA11y(ctx, doc);
  const { session, hub } = play;

  const closeOthers = () => {
    try { play.ui.close(); } catch { /* optional */ }
    try { if (play.map && play.map.isOpen()) play.map.close(); } catch { /* optional */ }
    try { if (play.worldHud && play.worldHud.hud) play.worldHud.hud.signs.close(); } catch { /* optional */ }
  };

  let recap = null;
  const simple = hub ? createSimpleMode({
    root: uiRoot, ctx, session, hub, narration,
    fly: (n) => play.fly(n),
    onOpenMemories: () => play.ui.open('memory'),
    onRejected: (reason) => play.hud.showRejection(reason),
    onOpen: closeOthers,
    onRecap: () => recap && recap.toggle(),
  }) : null;

  recap = createRecap({
    root: uiRoot, ctx, session, hub, narration,
    nextOverride: () => { const p = simple && simple.proposal(); return p && p.kind !== 'passing' ? { key: p.title.key, args: p.title.args } : null; },
    onOpen: closeOthers,
  });

  // Settings inside the world: the same form the lobby shows (language, motion, subtitles, interface mode,
  // size, quality, accessibility), appended to the controls dialog body before its Resume button.
  let settingsEl = null, season = null;
  if (settingsDialog) {
    const body = settingsDialog.querySelector('.ftf-dialog-body') || settingsDialog;
    settingsEl = doc.createElement('section');
    settingsEl.className = 'ftf-a11y-settings';
    settingsEl.setAttribute('aria-labelledby', 'ftf-a11y-settings-title');
    const title = doc.createElement('h3');
    title.id = 'ftf-a11y-settings-title';
    title.dataset.i18n = 'settings.title';
    title.textContent = ctx.i18n.t('settings.title');
    // the season is local (season-local.js): the notice and "Start a new season", asked before discarding
    season = buildSeasonSection({ t: (k, a) => renderMsg(ctx.i18n, k, a), i18n: ctx.i18n, doc, fixedSeed: fixedSeedFromSearch(doc.defaultView ? doc.defaultView.location.search : '') });
    settingsEl.append(title, season.el, buildSettings(ctx));
    const last = body.lastElementChild;
    if (last && last.tagName === 'BUTTON') body.insertBefore(settingsEl, last); else body.append(settingsEl);
    ctx.i18n.subscribe(() => { title.textContent = ctx.i18n.t('settings.title'); });
  }

  // Narration of the HUD's spoken surfaces: whatever the dialogue strip or the hint toast shows is read
  // aloud (lines interrupt nothing of higher rank; hints never stack). Idle filler is skipped.
  let lastLine = '', lastToast = '';
  const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => {
    if (!narration.enabled()) return;
    const line = uiRoot.querySelector('.wh-dialogue__line');
    const toast = uiRoot.querySelector('.wh-toast__text');
    const lt = line ? line.textContent.trim() : '';
    if (lt && lt !== lastLine) {
      lastLine = lt;
      if (lt !== ctx.i18n.t('wh.dialogue.idle')) narration.speak(lt, { channel: 'line' });
    }
    const tt = toast ? toast.textContent.trim() : '';
    const toastVisible = toast && !toast.closest('[hidden], [aria-hidden="true"], .wh-toast--hidden');
    if (tt && toastVisible && tt !== lastToast) { lastToast = tt; narration.speak(tt, { channel: 'hint' }); }
  }) : null;
  if (observer) observer.observe(uiRoot, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'class'] });

  function onKey(e) {
    if (e.defaultPrevented) return;
    const tgt = e.target;
    if (tgt && tgt.tagName && /^(INPUT|SELECT|TEXTAREA)$/.test(tgt.tagName)) return;
    if (doc.querySelector('dialog[open]')) return;
    let used = false;
    if (recap.handleKey(e.code, e.key)) used = true;
    else if (simple && !recap.isOpen() && simple.handleKey(e.code, e.key)) used = true;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  }
  if (win && win.addEventListener) win.addEventListener('keydown', onKey, true);

  const api = {
    narration, recap, simple, settingsEl, season,
    /** True while one of this layer's sheets is open (hosts may route gamepad navigation to `panel`). */
    get panelOpen() { return recap.isOpen() || !!(simple && simple.active && uiRoot.querySelector('.a11y-simple')); },
    get panel() { return uiRoot.querySelector('.a11y-recap') || uiRoot.querySelector('.a11y-simple'); },
    destroy() {
      if (win && win.removeEventListener) win.removeEventListener('keydown', onKey, true);
      if (observer) observer.disconnect();
      recap.destroy(); if (simple) simple.destroy(); if (season) season.destroy(); if (settingsEl) settingsEl.remove();
    },
  };
  play.allAges = api;
  play.narration = narration;
  return api;
}
