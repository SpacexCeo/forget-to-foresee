// "This season lives in this browser tab" (readiness audit 09.11, continuity): the honest notice that a season is
// local (the room runs in the page; a refresh starts a new season; preferences and tutorial progress are stored on
// the device) and a "Start a new season" control in Settings that asks before discarding the current season.
// The restart is a page reload: the only path that rebuilds the room, the world and every watcher cleanly. A link
// with a fixed seed (?demo=judge, ?seed=) starts the same season again, and the question says so.

/** The confirm question for a restart. */
export const restartAskKey = (fixedSeed) => (fixedSeed ? 'season.restart.askFixed' : 'season.restart.ask');

/** True when the page URL fixes the season (the judge link or ?seed=<32 hex>). */
export function fixedSeedFromSearch(search = '') {
  try {
    const q = new URLSearchParams(search);
    return q.get('demo') === 'judge' || /^[0-9a-f]{32}$/.test(q.get('seed') || '');
  } catch { return false; }
}

/**
 * The Settings section: the notice, "Start a new season", then "Discard and restart" / "Keep playing".
 * @param {{t: (key: string, args?: object) => string, i18n: object, doc?: Document, fixedSeed?: boolean,
 *   onRestart?: () => void}} o  onRestart defaults to reloading the page
 * @returns {{el: HTMLElement, destroy(): void}}
 */
export function buildSeasonSection({ t, i18n, doc = globalThis.document, fixedSeed = false, onRestart } = {}) {
  const restart = onRestart || (() => { try { doc.defaultView.location.reload(); } catch { /* no page */ } });
  const el = doc.createElement('section');
  el.className = 'ftf-field ftf-season';
  el.dataset.season = 'local';
  let asking = false;
  const btn = (text, cls, data, onclick) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'ftf-btn ftf-btn-small' + (cls ? ' ' + cls : '');
    b.dataset.season = data;
    b.textContent = text;
    b.addEventListener('click', onclick);
    return b;
  };
  function render() {
    el.textContent = '';
    const h = doc.createElement('h4');
    h.textContent = t('season.title');
    const note = doc.createElement('p');
    note.className = 'ftf-muted';
    note.textContent = t('season.local.note');
    el.append(h, note);
    const row = doc.createElement('div');
    row.className = 'ftf-row';
    if (!asking) {
      row.append(btn(t('season.restart'), '', 'restart', () => { asking = true; render(); focus('[data-season="keep"]'); }));
    } else {
      const ask = doc.createElement('p');
      ask.setAttribute('role', 'alert');
      ask.textContent = t(restartAskKey(fixedSeed));
      el.append(ask);
      row.append(
        btn(t('season.restart.confirm'), 'ftf-btn-danger', 'confirm', () => restart()),
        btn(t('season.restart.cancel'), 'ftf-btn-primary', 'keep', () => { asking = false; render(); focus('[data-season="restart"]'); }));
    }
    el.append(row);
  }
  function focus(sel) { const b = el.querySelector(sel); if (b && b.focus) b.focus(); }
  render();
  const off = i18n && i18n.subscribe ? i18n.subscribe(render) : null;
  return { el, destroy() { if (off) off(); el.remove(); }, get asking() { return asking; } };
}
