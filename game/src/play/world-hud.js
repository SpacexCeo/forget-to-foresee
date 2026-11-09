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
import { panelArbiterFor } from './panels.js';
import { createNearWatcher } from '../net/near.js';
import { createShardWatcher } from '../net/shard-nft.js';
import { shardCards, createMintMoments } from '../ui/world-hud/shard-card-model.js';
import { createMintToast } from '../ui/world-hud/shard-card.js';
import { createOutcomeTracker } from './outcome.js';
import { createOutcomeToast } from './outcome-ui.js';

const LINE_TTL = 12; // seconds a spoken line stays in the dialogue strip

/**
 * @param {object} o
 * @param {HTMLElement} o.uiRoot @param {object} o.ctx play context @param {object} o.session PlaySession
 * @param {object} o.ui play UI (createPlayUi) @param {object} [o.hints] hint engine (play/hints.js)
 * @param {{onGo?: Function, onSettings?: Function, onMap?: Function}} [o.handlers]
 *   `onMap` (task H, play/map-ui.js): the hotbar shows a Map button (N) only when it is given; the map panel takes
 *   part in the one-panel-at-a-time rule through panelArbiterFor(uiRoot).claim('map', close)
 */
export function attachWorldHud({ uiRoot, ctx, session, ui, hints = null, handlers = {} }) {
  const { i18n, prefs } = ctx;
  const arb = panelArbiterFor(uiRoot); // Signs is one of the exclusive surfaces (panels.js)
  const doc = uiRoot.ownerDocument || document;
  const host = doc.createElement('div');
  host.className = 'wh-host';
  uiRoot.appendChild(host);
  doc.body.classList.add('wh-on');

  // NEAR testnet badges (net/near.js, request 9): read-only views, idempotent per season and per revealed sign
  let near = null;
  try { near = createNearWatcher({ season: () => session.obs && session.obs.season, proof: (i) => session.transport.proof(i) }); } catch (e) { console.warn('[play] NEAR watcher off', e); }
  const render = (k, a) => renderMsg(i18n, k, a);
  // Shard NFTs (net/shard-nft.js, request 9): one read-only view per season; cards in the Memories panel and the
  // "Minted on NEAR testnet" toast when a shard that exists on-chain is sold in this playthrough. Silent otherwise.
  let shards = null, moments = null, mintToast = null;
  try {
    shards = createShardWatcher();
    moments = createMintMoments();
    mintToast = createMintToast(host, { t: render, doc, onOpen: () => ui.open('memory') });
    if (ui.setShardSource) ui.setShardSource((obs) => shardCards({ status: shards.status, obs }));
  } catch (e) { console.warn('[play] shard NFT watcher off', e); shards = null; }
  const showMints = () => { if (moments && mintToast) for (const m of moments.take(shards.status, session.obs)) mintToast.show(m.card); };
  // "See what changed" (readiness audit P2): what each reveal did to the staked reading, the stake and Iris's
  // dictionary, and what each forget changed; presentation state kept from consecutive observations (outcome.js)
  const outcomes = createOutcomeTracker();
  let outcomeToast = null;
  try { outcomeToast = createOutcomeToast(host, { i18n, doc, onDetails: () => { if (hud) hud.signs.open(); } }); } catch (e) { console.warn('[play] outcome card off', e); }
  function observeOutcomes(obs) {
    const { outcomes: fresh, forgets } = outcomes.observe(obs);
    if (!outcomeToast) return;
    const last = fresh[fresh.length - 1];
    if (last) outcomeToast.showOutcome(last, (obs.chronicle || []).find((c) => c.index === last.index));
    if (forgets.length) outcomeToast.showForget(forgets[forgets.length - 1]);
  }
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
      map: !!handlers.onMap,
      near,
      outcomes: outcomes.reports(),
    });
  }

  function refresh() {
    const m = model();
    if (!m) return;
    if (!hud) {
      hud = mountWorldHud(host, { model: m, ctx, onAction, keys: false });
      if (hud.signs.isOpen()) claimSigns(); // Pro starts with the panel open (no signsOpen action fires on mount)
    } else hud.update(m);
    prev = m;
  }

  function onAction(action, id) {
    if (action === 'prompt') ui.handleKey('KeyE');
    else if (action === 'hotkey' || action === 'top') {
      if (id === 'memory' || id === 'journal') ui.handleKey('KeyM');
      else if (id === 'endTick') ui.handleKey('KeyT');
      else if (id === 'help') ui.handleKey('KeyH');
      else if (id === 'map' && handlers.onMap) handlers.onMap();
      else if ((id === 'settings' || id === 'menu') && handlers.onSettings) handlers.onSettings();
    } else if (action === 'sign') ui.open('vision');
    else if (action === 'quest') { const g = session.goal; if (g && g.target && handlers.onGo) handlers.onGo(g.target); }
    else if (action === 'signsOpen') { claimSigns(); if (hints) hints.action('signsOpen'); }
    else if (action === 'signsClose') arb.release('signs');
    if (hints && action !== 'signsClose') hints.action('ui');
  }

  /** The desktop Signs panel reads alongside the hub dock (not modal); the phone sheet covers the screen (modal). */
  function claimSigns() { arb.claim('signs', () => { if (hud) hud.signs.close(); }, { modal: hud ? hud.layout === 'mobile' : false }); }

  const offs = [
    session.on('obs', () => {
      observeOutcomes(session.obs);
      if (hints) hints.observe(session.obs); if (near) near.observe(session.obs);
      if (shards) { shards.observe(session.obs); moments.observe(session.obs); showMints(); }
      refresh();
    }),
    near ? near.subscribe(() => refresh()) : null,
    shards ? shards.subscribe(() => { showMints(); if (ui.panel === 'memory') ui.update(); }) : null,
    session.on('goal', refresh),
    session.on('spot', refresh),
    prefs ? prefs.subscribe(() => refresh()) : null,
    hints ? hints.subscribe(refresh) : null,
  ].filter(Boolean);
  if (hints && session.obs) hints.observe(session.obs);
  if (shards && session.obs) { shards.observe(session.obs); moments.observe(session.obs); }
  if (session.obs) outcomes.observe(session.obs);
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
    /** Outcome reports by chronicle index (play/outcome.js), for other surfaces and tests. */
    outcomes,
    destroy() { offs.forEach((f) => f()); if (outcomeToast) outcomeToast.destroy(); if (near && near.destroy) near.destroy(); if (mintToast) mintToast.destroy(); if (hud) hud.destroy(); host.remove(); doc.body.classList.remove('wh-on'); },
  };
}
