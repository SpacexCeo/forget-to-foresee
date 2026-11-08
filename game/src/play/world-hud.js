// The world HUD in the 3D client: mounts src/ui/world-hud over the canvas, rebuilds its view model
// from the room's observation (from-obs.js) whenever the session changes, and routes HUD actions to
// the play layer. The keyboard stays with main.js → play.handleKey (the HUD only shows the letters),
// so a key never fires twice. The play UI keeps its panels (memories, sign details, ask, dialogue,
// end) and its context menu for spots with several actions; its goal card, chronicle, action bar and
// the old status/subtitle HUD give way to the world HUD (body.wh-on in index.html).
import { mountWorldHud } from '../ui/world-hud/index.js';
import { buildHudModel, raw } from '../ui/world-hud/from-obs.js';
import { renderMsg } from './i18n.js';
import { i18n as uiI18n } from '../ui/index.js';

const LINE_TTL = 12; // seconds a spoken line stays in the dialogue strip

/**
 * @param {object} o
 * @param {HTMLElement} o.uiRoot @param {object} o.ctx play context @param {object} o.session PlaySession
 * @param {object} o.ui play UI (createPlayUi) @param {object} [o.hints] hint engine (play/hints.js)
 * @param {{onGo?: Function, onSettings?: Function}} [o.handlers]
 */
export function attachWorldHud({ uiRoot, ctx, session, ui, hints = null, handlers = {} }) {
  const { i18n, prefs } = ctx;
  const doc = uiRoot.ownerDocument || document;
  const host = doc.createElement('div');
  host.className = 'wh-host';
  uiRoot.appendChild(host);
  doc.body.classList.add('wh-on');

  const render = (k, a) => renderMsg(i18n, k, a);
  const renderEvent = (e) => uiI18n.renderEvent(e, i18n);
  const mode = () => (prefs && prefs.get().hudMode === 'pro' ? 'pro' : 'novice');
  let line = null, lineAge = 0, prev = null, hud = null;

  function model() {
    const obs = session.obs;
    if (!obs) return null;
    const c = hints && hints.takeCoach();
    if (c) { line = { speaker: 'iris', text: c }; lineAge = 0; }
    const opts = session.options || [];
    return buildHudModel({
      obs, goal: session.goal, options: opts, defaultIndex: session.defaultIndex, i18n, mode: mode(),
      render, renderEvent, prev,
      hints: hints ? hints.view() : null,
      line,
      // one action: the prompt is enough; several: the play UI's context menu lists them
      promptVisible: opts.length === 1 && !ui.panel,
      signsState: hud ? { open: hud.signs.isOpen() } : { open: mode() === 'pro' },
    });
  }

  function refresh() {
    const m = model();
    if (!m) return;
    if (!hud) {
      hud = mountWorldHud(host, { model: m, ctx, onAction, keys: false });
    } else hud.update(m);
    prev = m;
  }

  function onAction(action, id) {
    if (action === 'prompt') ui.handleKey('KeyE');
    else if (action === 'hotkey' || action === 'top') {
      if (id === 'memory' || id === 'journal') ui.handleKey('KeyM');
      else if (id === 'endTick') ui.handleKey('KeyT');
      else if (id === 'help') ui.handleKey('KeyH');
      else if ((id === 'settings' || id === 'menu') && handlers.onSettings) handlers.onSettings();
    } else if (action === 'sign') ui.open('vision');
    else if (action === 'quest') { const g = session.goal; if (g && g.target && handlers.onGo) handlers.onGo(g.target); }
    else if (action === 'signsOpen' && hints) hints.action('signsOpen');
    if (hints && action !== 'signsClose') hints.action('ui');
  }

  const offs = [
    session.on('obs', () => { if (hints) hints.observe(session.obs); refresh(); }),
    session.on('goal', refresh),
    session.on('spot', refresh),
    prefs ? prefs.subscribe(() => refresh()) : null,
    hints ? hints.subscribe(refresh) : null,
  ].filter(Boolean);
  if (hints && session.obs) hints.observe(session.obs);
  refresh();

  return {
    get hud() { return hud; },
    /** A spoken line from the room's fx (speakerId, key, args) → the dialogue strip. */
    say(l) {
      line = { speaker: l.speakerId || 'iris', text: raw(() => render(l.key, l.args || {})) };
      lineAge = 0;
      refresh();
    },
    /** Iris's own coaching line (hints), with optional replies. */
    coach(text, replies = []) { line = { speaker: 'iris', text, replies }; lineAge = 0; refresh(); },
    /** Keys the HUD owns in the world: V toggles Signs, Escape closes it. Returns true when used. */
    handleKey(code) {
      if (!hud) return false;
      if (code === 'KeyV') { hud.signs.toggle(); return true; } // opening reports 'signsOpen' through onAction
      if (code === 'Escape' && hud.signs.isOpen()) { hud.signs.close(); return true; }
      return false;
    },
    /** Player activity the observation cannot see (movement, commands). */
    activity(name) { if (hints) hints.action(name); },
    update(dt) {
      if (line && (lineAge += dt) > LINE_TTL) { line = null; refresh(); }
      if (hints && hints.tick(dt)) refresh();
    },
    refresh,
    destroy() { offs.forEach((f) => f()); if (hud) hud.destroy(); host.remove(); doc.body.classList.remove('wh-on'); },
  };
}
