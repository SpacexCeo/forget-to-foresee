// Chapter films in the 3D client (Task P): the director decides when a film is due (play/chapters.js),
// this module plays it at a safe moment, pauses the season clock around it (the Shell hub's automatic
// trials stop and resume), keeps every panel closed under it, offers the Chronicle replay menu and the
// optional narration. game.js calls attachChapters() once and forwards update/handleKey; nothing else in
// the play layer changes. Dev parameters: ?films=off disables the films, ?films=full|cheap forces the shot
// profile, ?film=<chapter> plays one film right away on a season advanced to that chapter (still frames for
// docs/chapters.md use it with &stills=1).
import { createChapterDirector, chapterFor, CHAPTER_IDS, SHOT_SECONDS, TITLE_SECONDS, CARD_SECONDS } from '../../play/chapters.js';
import { renderMsg, resolvePlayArg } from '../../play/i18n.js';
import { resolveLineArgs } from '../../play/chapters.js';
import { createFilmOverlay } from './overlay.js';
import { createFilmPlayer } from './player.js';
import { createChronicleMenu } from './chronicle.js';

// Task Q's narration API (play/narration.js): present → spoken lines; absent → subtitles only.
const NARRATION_MODULES = import.meta.glob('../../play/narration.js');
/** Seconds after the world opens before the Arrival film may start (assets stream in meanwhile). */
const SETTLE_SECONDS = 1.6;

/**
 * @param {object} o
 * @param {object} o.session PlaySession  @param {object|null} o.hub ShellHub or null (walking mode)
 * @param {object} o.ui play UI  @param {object|null} o.worldHud  @param {object|null} o.map island map panel
 * @param {object} o.ctx play context  @param {object} o.lookdev  @param {THREE.Camera} o.camera
 * @param {object} o.player CharacterController  @param {THREE.Object3D} o.avatar  @param {object} o.shell  @param {object} o.agents
 * @param {HTMLElement} o.uiRoot  @param {object} o.hooks play hooks (audio)  @param {() => number} o.now play clock
 * @param {() => void} [o.afterFilm] re-sync visuals the film touched (the glass sign)
 * @param {object} [o.guests] Task O's Guests stage, if the play layer has one
 * @param {object} [o.narration] a narration instance to share (else one is created when the module exists)
 * @param {string} [o.search] the page's query string (tests pass their own)
 */
export function attachChapters({ session, hub, ui, worldHud, map, ctx, lookdev, camera, player, avatar, shell, agents, uiRoot, hooks, now, afterFilm = () => {}, guests = null, narration = null, search }) {
  const doc = uiRoot.ownerDocument || document;
  const params = new URLSearchParams(search != null ? search : (doc.location ? doc.location.search : ''));
  const devFilm = params.get('film');
  const filmsParam = params.get('films'); // off | full | cheap (full/cheap force the shot profile: QA on SwiftShader)
  const enabled = filmsParam !== 'off' && !devFilm;
  const mode = hub ? 'hub' : 'walk';
  const director = createChapterDirector({
    obs: session.obs, storage: ctx.storage, mode, enabled,
    profile: () => (filmsParam === 'full' || filmsParam === 'cheap' ? filmsParam : lookdev.profile === 'phone' || lookdev.tier === 'low' ? 'cheap' : 'full'),
    reducedMotion: () => !!lookdev.reducedMotion,
  });
  const { i18n } = ctx;
  const renderArg = (v) => resolvePlayArg(i18n, v);
  const renderLine = (line) => (line ? renderMsg(i18n, line.key, resolveLineArgs(line.args, i18n, renderArg)) : '');
  const overlay = createFilmOverlay(doc, { reducedMotion: () => !!lookdev.reducedMotion });
  let narrator = narration;
  loadNarration().then((n) => { if (n && !narrator) narrator = n; }).catch(() => {});
  const filmPlayer = createFilmPlayer({
    camera, player, avatar, shell, agents, overlay, now, hooks, guests,
    get narration() { return narrator; },
    renderLine,
    texts: (f) => ({ chapter: i18n.t('chapter.ui.chapter', { n: f.numeral }), title: renderLine(f.title), matters: i18n.t('chapter.ui.matters'), hold: i18n.t('chapter.ui.hold'), skip: i18n.t('chapter.ui.skip') }),
    win: doc.defaultView || globalThis,
  });
  const chronicle = createChronicleMenu({
    root: uiRoot, ctx, rows: () => director.rows(), onReplay: (id) => api.replay(id),
    titleOf: (id) => { const f = director.films.get(id); if (f) return f.title; const o = session.obs; const cur = o && chapterFor(o); return id === 'ending' && cur === 'ending' && o.season.outcome ? { key: 'chapter.title.ending.' + o.season.outcome } : { key: 'chapter.title.' + id }; },
    canOpen: () => !filmPlayer.playing && !(hub && (hub.busy || hub.advancing)),
    filmSeconds: Math.round(TITLE_SECONDS + 5 * SHOT_SECONDS + CARD_SECONDS),
  });

  const state = { pending: null, stoppedHub: false, lastAdvance: null, opened: now(), playing: null };

  async function loadNarration() {
    const loader = Object.values(NARRATION_MODULES)[0];
    if (!loader) return null;
    const m = await loader();
    return m && m.createNarration ? m.createNarration({ prefs: ctx.prefs, i18n }) : null;
  }

  /** A film became due: the hub's automatic trials stop after the current one, the film starts when safe. */
  function request(id) {
    if (!id || state.pending === id || (state.playing && state.playing.id === id)) return;
    state.pending = id;
    if (hub && hub.advancing) { hub.stop(); state.stoppedHub = true; }
  }

  function safe() {
    if (filmPlayer.playing) return false;
    if (hub && (hub.busy || hub.advancing)) return false;
    if (now() - state.opened < SETTLE_SECONDS) return false;
    return true;
  }

  function closePanels() {
    try { ui.close(); } catch { /* ok */ }
    try { if (worldHud && worldHud.hud) worldHud.hud.signs.close(); } catch { /* ok */ }
    try { if (map && map.isOpen()) map.close(); } catch { /* ok */ }
    chronicle.close();
  }

  async function start(id, { replay = false } = {}) {
    const film = director.build(id, { fresh: !replay && !director.films.has(id) });
    if (!film) return null;
    if (!replay) director.markSeen(id);
    state.pending = null;
    state.playing = film;
    closePanels();
    const stills = params.get('stills') === '1';
    const result = await filmPlayer.play(film, { paused: stills });
    state.playing = null;
    try { afterFilm(); } catch { /* presentation */ }
    // the season clock resumes: the hub goes on with its automatic trials when it was the film that stopped them
    if (state.stoppedHub && hub && !hub.card && !hub.inShell && session.obs.season.phase === 'play' && !hub.busy && !hub.advancing) hub.advance();
    state.stoppedHub = false;
    return result;
  }

  const offs = [
    session.on('event', (ev) => director.event(ev)),
    session.on('result', (r) => director.command(r.type, r.args, r.ok)),
    session.on('obs', (o) => request(director.observe(o))),
  ];
  if (hub) offs.push(hub.on('advanced', ({ reason }) => { state.lastAdvance = reason; if (reason !== 'stopped') state.stoppedHub = false; }));
  request(director.observe(session.obs));

  const api = {
    director, player: filmPlayer, chronicle, overlay,
    get playing() { return filmPlayer.playing; },
    get pending() { return state.pending; },
    /** Per frame after the camera rig (the film overrides the camera here). */
    update(dt) {
      filmPlayer.update(dt);
      if (state.pending && safe()) start(state.pending);
    },
    /** Keys while a film plays are swallowed; otherwise the Chronicle may take C / Escape. */
    handleKey(code) {
      if (filmPlayer.playing) return filmPlayer.handleKey(code);
      return chronicle.handleKey(code);
    },
    /** Replays (or watches for the first time) a chapter from the Chronicle. */
    replay(id) {
      if (!CHAPTER_IDS.includes(id) || filmPlayer.playing) return Promise.resolve(null);
      if (hub && hub.advancing) { hub.stop(); state.stoppedHub = true; }
      return new Promise((resolve) => {
        const tick = () => { if (safe()) resolve(start(id, { replay: director.films.has(id) })); else setTimeout(tick, 120); };
        tick();
      });
    },
    openChronicle: () => chronicle.open(),
    build: (id) => director.build(id, { fresh: true }),
    /** Dev/capture: advance the local season to a chapter and play its film (?film=<id>). */
    async dev(id = devFilm) {
      if (!CHAPTER_IDS.includes(id)) return null;
      let guard = 0;
      while (chapterFor(session.obs) !== id && guard++ < 40) {
        const s = session.obs.season;
        if (s.phase === 'end') break;
        if (s.phase === 'vote') { await session.send('move', { to: 'scroll' }, { silent: true }); await session.send('cast_vote', { accept: true }); }
        else await session.send('end_tick', {});
      }
      director.observe(session.obs);
      state.opened = -Infinity;
      return start(id, { replay: false });
    },
    destroy() { offs.forEach((f) => f()); filmPlayer.destroy(); chronicle.destroy(); overlay.destroy(); },
  };
  if (devFilm) setTimeout(() => api.dev(devFilm), 50);
  return api;
}
