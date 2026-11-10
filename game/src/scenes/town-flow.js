// The flow of the town on the ground (docs/town.md): Iris walks from the gate to the Tournament altar, registers,
// and is carried up to the archipelago, where the season (the play layer) starts exactly as it always did.
// This module owns the little UI the town has (an objective line, the altar prompt, the transition cover) and
// the registration sequence; boot-world.js owns the frame loop and tells it what "leaving the town" means.
// No world HUD, no hub and no hints exist here: the season has not begun. No game rule is evaluated.
import { steerTo } from '../physics/character.js';
import { TOWN_ROUTE, inAltarRange } from './town-layout.js';

const CSS = `
.ftf-town { position: fixed; inset: 0; pointer-events: none; z-index: 9; font-family: "Libre Caslon Text", "WH Cyrillic", "Palatino Linotype", Palatino, Georgia, serif; }
.ftf-town-objective { position: absolute; top: calc(14px + env(safe-area-inset-top, 0px)); left: calc(18px + env(safe-area-inset-left, 0px)); max-width: calc(100% - 190px);
  padding: 7px 14px 7px 12px; border-radius: 999px; background: rgba(12, 20, 21, .62); color: #f4ead0; font-size: 16px; line-height: 1.3;
  border: 1px solid rgba(232, 214, 172, .28); text-shadow: 0 1px 2px rgba(0, 0, 0, .5); transition: opacity .4s ease; }
.ftf-town-objective::before { content: ""; display: inline-block; width: 8px; height: 8px; margin-right: 9px; border-radius: 50%; background: #e9b44c; box-shadow: 0 0 8px #e9b44c; vertical-align: 1px; }
.ftf-town-objective[hidden], .ftf-town-prompt[hidden] { display: none; }
.ftf-town-prompt { position: fixed; left: 50%; bottom: calc(132px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 12; pointer-events: auto;
  display: inline-flex; align-items: center; gap: 10px; max-width: calc(100vw - 156px); min-height: 48px; padding: 10px 20px; border-radius: 999px; cursor: pointer;
  border: 1.5px solid #fbe6a6; background: rgba(217, 164, 65, .92); color: #1d1708; font: 600 17px/1.2 "Libre Caslon Text", "WH Cyrillic", "Palatino Linotype", Palatino, Georgia, serif;
  box-shadow: 0 0 0 4px rgba(251, 230, 166, .22), 0 6px 18px rgba(0, 0, 0, .4); touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.ftf-town-prompt:hover { background: rgba(232, 182, 84, .97); }
.ftf-town-prompt:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
.ftf-town-prompt kbd { border: 1px solid rgba(29, 23, 8, .55); border-bottom-width: 2px; border-radius: 5px; padding: 1px 8px; font: 600 14px ui-monospace, Consolas, monospace; color: #1d1708; background: rgba(255, 255, 255, .35); }
.ftf-town-prompt kbd[hidden] { display: none; }
.ftf-town-cover { position: fixed; inset: 0; z-index: 9000; display: flex; align-items: center; justify-content: center; text-align: center; padding: 24px; pointer-events: auto;
  background: radial-gradient(circle at 50% 54%, #fffaf0 0%, #fbe7b4 46%, #eebf6c 100%); color: #3a2a0d; opacity: 0; transition: opacity var(--ftf-town-fade, .9s) ease-in-out;
  font: 400 clamp(24px, 4.2vw, 40px)/1.25 "Libre Caslon Text", "WH Cyrillic", "Palatino Linotype", Palatino, Georgia, serif; letter-spacing: .02em; }
.ftf-town-cover.is-on { opacity: 1; }
.ftf-town-cover span { opacity: 0; transform: translateY(6px); transition: opacity .7s ease .25s, transform .7s ease .25s; }
.ftf-town-cover.is-on span { opacity: 1; transform: none; }
html[data-motion="reduce"] .ftf-town-cover span, .ftf-town-cover.is-plain span { transform: none; transition: opacity .3s linear; }
@media (max-width: 700px) { .ftf-town-objective { font-size: 14px; max-width: calc(100% - 120px); } .ftf-town-prompt { font-size: 16px; bottom: calc(112px + env(safe-area-inset-bottom, 0px)); } }
@media (max-height: 440px) { .ftf-town-prompt { bottom: calc(64px + env(safe-area-inset-bottom, 0px)); } }
`;

/** Seconds of the registration sequence (docs/town.md): flare and camera lift, cover in, hold, cover out. */
export const TOWN_TRANSITION = Object.freeze({ flare: 0.8, fade: 0.9, hold: 0.45, reducedFade: 0.4, islandWait: 20 });

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

/**
 * @param {object} o
 * @param {object} o.town scenes/town.js handle @param {object} o.player CharacterController @param {object} o.rig camera rig
 * @param {() => boolean} o.reducedMotion @param {object} o.ctx play context (i18n) @param {Document} [o.doc]
 * @param {() => Promise<void>} o.leave moves Iris to the archipelago and starts the season (called under the cover)
 * @param {() => boolean} [o.islandReady] the archipelago's first models are in (the cover waits for it, bounded)
 * @param {boolean} [o.coarse] a touch device: the prompt shows no key cap
 * @param {() => void} [o.onRegister] the registration begins: Iris reaches for the altar ring (her `register` clip)
 */
export function createTownFlow({ town, player, rig, reducedMotion, ctx, doc = globalThis.document, leave, islandReady = () => true, coarse = false, onRegister = null }) {
  const i18n = ctx.i18n;
  if (!doc.getElementById('ftf-town-style')) { const st = doc.createElement('style'); st.id = 'ftf-town-style'; st.textContent = CSS; doc.head.append(st); }
  const root = doc.createElement('div'); root.className = 'ftf-town'; root.hidden = true;
  const objective = doc.createElement('div'); objective.className = 'ftf-town-objective'; objective.setAttribute('role', 'status');
  const prompt = doc.createElement('button'); prompt.type = 'button'; prompt.className = 'ftf-town-prompt'; prompt.hidden = true;
  const cap = doc.createElement('kbd'); const promptText = doc.createElement('span');
  prompt.append(cap, promptText);
  root.append(objective);
  doc.body.append(root, prompt);
  let cover = null;

  // phase: 'off' (not entered yet) -> 'town' -> 'transition' -> 'done'
  const state = { phase: 'off', ready: false, near: false, device: coarse ? 'touch' : 'keyboard', route: null, lift: 0, liftFrom: 0, focusK: 0, registering: null, startedAt: 0, arrivedAt: 0 };

  function renderText() {
    objective.textContent = i18n.t(state.ready ? 'town.objective' : 'town.loading');
    promptText.textContent = i18n.t('town.altar.prompt');
    cap.textContent = state.device === 'gamepad' ? 'A' : 'E';
    cap.hidden = state.device === 'touch';
    if (cover) cover.firstChild.textContent = i18n.t('town.transition.title');
  }
  function renderVisibility() {
    const on = state.phase === 'town';
    root.hidden = !on;
    prompt.hidden = !(on && state.ready && state.near);
  }
  const unsubscribe = typeof i18n.subscribe === 'function' ? i18n.subscribe(renderText) : null;
  prompt.addEventListener('click', () => { prompt.blur(); interact(); });
  prompt.addEventListener('pointerdown', (e) => e.stopPropagation()); // never a walk order
  renderText();

  /** The player is in the town from now on (the lobby closed, or the direct path began). */
  function begin() {
    if (state.phase !== 'off') return;
    state.phase = 'town'; state.startedAt = performance.now();
    renderText(); renderVisibility();
  }

  /**
   * Per frame, after physics. No allocations; the DOM is touched only when something changed.
   * @param {number} dt @param {{device?: string}} o device: 'keyboard' | 'gamepad' (the last input device)
   */
  function update(dt, { device = 'keyboard' } = {}) {
    if (state.phase === 'transition') {
      if (state.lift > 0) {
        // the camera lifts off Iris toward the altar while the core flares
        state.focusK = Math.min(1, state.focusK + dt / TOWN_TRANSITION.flare);
        rig.dist = Math.min(state.liftFrom + 7, rig.dist + dt * 5.5);
        rig.tilt(dt * 0.3);
      }
      return;
    }
    if (state.phase !== 'town') return;
    const dev = coarse && device !== 'gamepad' ? 'touch' : device === 'gamepad' ? 'gamepad' : 'keyboard';
    const ready = !!town.ready, near = ready && inAltarRange(player.pos);
    if (near && !state.arrivedAt) state.arrivedAt = performance.now();
    if (dev !== state.device || ready !== state.ready) { state.device = dev; state.ready = ready; renderText(); }
    if (near !== state.near || prompt.hidden === (ready && near)) { state.near = near; renderVisibility(); }
  }

  /** E, the gamepad's interact button or a tap on the prompt: registers when the prompt is offered. */
  function interact() { return register(); }

  /** The registration sequence. Resolves true once the season runs on the archipelago, false when not offered. */
  function register() {
    if (state.registering) return state.registering;
    if (state.phase !== 'town' || !town.ready || !inAltarRange(player.pos)) return Promise.resolve(false);
    state.registering = run();
    return state.registering;
  }

  async function run() {
    const reduced = !!reducedMotion();
    state.phase = 'transition'; state.route = null;
    renderVisibility();
    cover = doc.createElement('div'); cover.className = 'ftf-town-cover' + (reduced ? ' is-plain' : '');
    cover.setAttribute('role', 'status');
    cover.style.setProperty('--ftf-town-fade', (reduced ? TOWN_TRANSITION.reducedFade : TOWN_TRANSITION.fade) + 's');
    cover.append(doc.createElement('span'));
    renderText();
    doc.body.append(cover);
    town.setFlare(1);
    if (onRegister) { try { onRegister(); } catch (e) { console.warn('[town] register cue failed', e); } }
    if (!reduced) { state.lift = 1; state.liftFrom = rig.dist; await sleep(TOWN_TRANSITION.flare); }
    void cover.offsetWidth; // the opacity transition starts from 0
    cover.classList.add('is-on');
    await sleep(reduced ? TOWN_TRANSITION.reducedFade : TOWN_TRANSITION.fade);
    // The screen is covered: move to the archipelago and start the season.
    state.lift = 0; state.focusK = 0;
    town.setFlare(0);
    try { await leave(); } catch (e) { console.error('[town] the season failed to start', e); }
    const t0 = performance.now();
    while (!islandReady() && performance.now() - t0 < TOWN_TRANSITION.islandWait * 1000) await sleep(0.1);
    await sleep(TOWN_TRANSITION.hold);
    state.phase = 'done';
    cover.classList.remove('is-on');
    const gone = cover;
    setTimeout(() => { gone.remove(); root.remove(); prompt.remove(); if (unsubscribe) unsubscribe(); }, (reduced ? TOWN_TRANSITION.reducedFade : TOWN_TRANSITION.fade) * 1000 + 100);
    cover = null;
    return true;
  }

  /** QA: follow the jury route from the nearest remaining point to the altar stand (the same physics as a player). */
  function walkRoute() {
    if (state.phase !== 'town') return false;
    let first = 0, best = Infinity;
    for (let i = 0; i < TOWN_ROUTE.length; i++) { const d = Math.hypot(TOWN_ROUTE[i][0] - player.pos[0], TOWN_ROUTE[i][2] - player.pos[2]); if (d < best) { best = d; first = i; } }
    state.route = TOWN_ROUTE.slice(Math.min(first + (best < 1 ? 1 : 0), TOWN_ROUTE.length - 1)).map((p) => p.slice());
    const stand = town.altar.stand;
    state.route[state.route.length - 1] = [stand[0], stand[1], stand[2]];
    return true;
  }
  function cancelRoute() { state.route = null; }

  /** Steering for the frame loop while the QA route is active; null when idle. */
  function routeWish() {
    while (state.route) {
      const last = state.route.length === 1;
      const w = steerTo(player.pos, state.route[0], last ? 0.3 : 0.7);
      if (w) { const l = Math.hypot(w[0], w[1]); return last || l === 0 ? w : [w[0] / l, w[1] / l]; }
      state.route.shift();
      if (!state.route.length) state.route = null;
    }
    return null;
  }

  return {
    begin, update, interact, register, walkRoute, cancelRoute, routeWish,
    get phase() { return state.phase; },
    /** Input and physics are held: the registration sequence is running. */
    get busy() { return state.phase === 'transition'; },
    get registered() { return state.phase === 'done'; },
    get routeActive() { return !!state.route; },
    get promptVisible() { return !prompt.hidden; },
    /** 0..1: how far the camera focus has left Iris for the altar during the flare. */
    get focusK() { return state.focusK; },
    /** Milliseconds from entering the town to first standing in the prompt radius (QA: the jury walk), or null. */
    get walkMs() { return state.arrivedAt ? Math.round(state.arrivedAt - state.startedAt) : null; },
    elements: { root, objective, prompt },
  };
}
