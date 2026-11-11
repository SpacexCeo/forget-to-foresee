// Narrator subtitles (feature 10): one calm line at the three turns of a season when no chapter film tells them —
// the first Shell Iris enters, the trial-13 crisis and the finale (by outcome). A letterboxed subtitle strip at the
// bottom for a few seconds, spoken too when narration is on. Each moment once per season (seed), never during a film.
// Presentation only: the moments are read from the per-viewer observation, nothing is sent.

export const NARRATOR_SECONDS = 7;
export const NARRATOR_OUTCOMES = Object.freeze(['gift', 'weapon', 'lost', 'survived', 'gone']);

/**
 * The narrator moment this observation reaches, or null. `seen` holds the moments already told this season.
 * @param {object} obs @param {Set<string>} seen
 * @returns {{id: string, key: string, args?: object}|null}
 */
export function narratorMoment(obs, seen) {
  const s = obs && obs.season;
  if (!s) return null;
  if (s.outcome && !seen.has('finale')) return { id: 'finale', key: 'narr.finale', args: { outcome: NARRATOR_OUTCOMES.includes(s.outcome) ? s.outcome : 'other' } };
  if (s.outcome) return null;
  if ((s.tick ?? 0) >= 13 && !seen.has('crisis')) return { id: 'crisis', key: 'narr.crisis' };
  if (obs.you && obs.you.zone === 'shell' && !seen.has('shell')) return { id: 'shell', key: 'narr.shell' };
  return null;
}

/**
 * @param {object} o
 * @param {HTMLElement} o.root @param {object} o.session PlaySession (obs + on('obs'))
 * @param {(key: string, args?: object) => string} o.t
 * @param {() => boolean} [o.filmsOn] films tell these turns themselves @param {() => boolean} [o.filmPlaying]
 * @param {() => object|null} [o.narration] play/narration.js instance (spoken when enabled)
 * @param {object} [o.storage] remembers told moments per season
 */
export function attachNarrator({ root, session, t, filmsOn = () => false, filmPlaying = () => false, narration = () => null, storage = null, now = () => Date.now() }) {
  const doc = root.ownerDocument || globalThis.document;
  const strip = doc.createElement('div');
  strip.className = 'ftf-narrator'; strip.hidden = true; strip.setAttribute('role', 'status'); strip.setAttribute('aria-live', 'polite');
  strip.style.cssText = 'position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:25;pointer-events:none;'
    + 'max-width:min(720px,calc(100vw - 32px));padding:10px 18px;border-radius:6px;background:rgba(6,8,10,.72);color:#f3ead8;text-align:center;'
    + 'font:italic 500 17px/1.45 "Cormorant Garamond", Georgia, serif;letter-spacing:.01em;opacity:0;transition:opacity .5s ease';
  const who = doc.createElement('span'); who.style.cssText = 'display:block;font:600 10px/1.2 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#e9b44c;margin-bottom:3px;font-style:normal';
  const line = doc.createElement('span');
  strip.append(who, line);
  root.append(strip);
  const keyFor = () => { const s = session.obs && session.obs.season; return s && s.seasonId ? 'ftf.narrator.' + s.seasonId : null; };
  const load = () => { try { const k = keyFor(); return new Set(k && storage ? JSON.parse(storage.getItem(k) || '[]') : []); } catch { return new Set(); } };
  let seen = load(), seasonKey = keyFor(), timer = 0, current = null;
  const remember = () => { try { const k = keyFor(); if (k && storage) storage.setItem(k, JSON.stringify([...seen])); } catch { /* memory only */ } };

  function show(m) {
    who.textContent = t('narr.who');
    line.textContent = t(m.key, m.args);
    strip.hidden = false; current = m;
    requestAnimationFrame(() => { strip.style.opacity = '1'; });
    clearTimeout(timer);
    timer = setTimeout(hide, NARRATOR_SECONDS * 1000);
    const n = narration();
    if (n && n.say) { try { n.say(m.key, m.args || {}, { channel: 'line' }); } catch { /* subtitles stay */ } }
  }
  function hide() { strip.style.opacity = '0'; current = null; setTimeout(() => { if (!current) strip.hidden = true; }, 520); }

  function check() {
    const k = keyFor();
    if (k !== seasonKey) { seasonKey = k; seen = load(); }
    if (filmsOn()) return;
    const m = narratorMoment(session.obs, seen);
    if (!m) return;
    seen.add(m.id);
    // the first Shell of a season that is already past it (a resumed run) is told no more
    if (m.id === 'finale') { seen.add('crisis'); seen.add('shell'); }
    if (m.id === 'crisis') seen.add('shell');
    remember();
    if (filmPlaying()) return;
    show(m);
  }
  const off = session.on ? session.on('obs', check) : null;
  check();
  return {
    el: strip, get current() { return current; }, check, hide,
    dispose() { clearTimeout(timer); if (typeof off === 'function') off(); strip.remove(); },
  };
}
