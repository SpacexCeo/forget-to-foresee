// Weekly tournament card (spec §7). Simulation only: synthetic enrollment,
// no money, no prizes; results stay sealed until the results barrier.
import { h, tx, bindI18n } from './dom.js';
import { splitDuration } from './tournament.js';

export function mountTournamentCard(root, ctx, { headingLevel = 2 } = {}) {
  const { i18n, tournament, guestId } = ctx;
  const uid = 'ftf-tour-' + Math.random().toString(36).slice(2, 8);
  const heading = h('h' + headingLevel, { i18n: 'tour.title', attrs: { id: uid } });
  const week = h('p', { class: 'ftf-muted' });
  const phase = h('p', { class: 'ftf-tour-phase' });
  const countdown = h('p', { class: 'ftf-muted' });
  const action = h('div', { class: 'ftf-row' });
  const status = h('p', { class: 'ftf-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const results = h('div');
  const card = h('section', { class: 'ftf-card ftf-tour-card', attrs: { 'aria-labelledby': uid } },
    h('div', { class: 'ftf-spread' }, heading, h('span', { class: 'ftf-badge', i18n: 'tour.badge' })),
    week, phase, countdown,
    h('p', { i18n: 'tour.desc' }),
    h('p', { class: 'ftf-muted', i18n: 'tour.trophy', args: () => ({ name: i18n.t('tour.trophyName') }) }),
    action, status, results);
  root.appendChild(card);

  const dur = (ms) => () => i18n.t('tour.duration', splitDuration(ms));
  function render() {
    const now = Date.now();
    const sch = tournament.schedule(now);
    const ph = tournament.phase(now);
    const entry = tournament.entryFor(sch.weekId, guestId);
    tx(week, i18n, 'tour.week', { week: String(sch.week), year: String(sch.year) });
    phase.dataset.phase = ph;
    tx(phase, i18n, 'tour.phase.' + ph);
    const left = ph === 'open' ? ['tour.closesIn', sch.closesAt] : ph === 'running' ? ['tour.resultsIn', sch.resultsAt] : ph === 'upcoming' ? ['tour.opensIn', sch.opensAt] : null;
    countdown.hidden = !left;
    if (left) { const d = dur(left[1] - now); tx(countdown, i18n, left[0], () => ({ time: d() })); }

    action.replaceChildren();
    if (entry) {
      action.append(h('p', { i18n: 'tour.enrolled', args: { id: entry.entryId } }), h('p', { class: 'ftf-muted', i18n: 'tour.enrolledNote' }));
    } else if (ph === 'open') {
      action.append(h('button', { class: 'ftf-btn', i18n: 'tour.enroll', attrs: { type: 'button' }, on: { click: enroll } }));
    } else {
      action.append(h('p', { class: 'ftf-muted', i18n: 'tour.closed' }));
    }

    results.replaceChildren();
    if (ph === 'results' || ph === 'running') {
      const res = tournament.results({ playerId: guestId, now });
      results.append(h('h' + (headingLevel + 1), { i18n: 'tour.results.title' }));
      if (!res) results.append(h('p', { class: 'ftf-muted', i18n: 'tour.results.sealed' }));
      else {
        const rows = res.rows.map((r) => h('tr', { attrs: { 'data-you': r.kind === 'you' } },
          h('td', { text: String(r.rank) + (r.trophy ? ' ◆' : '') }),
          h('td', r.kind === 'you' ? { i18n: 'tour.results.you' } : { i18n: 'tour.results.sim', args: { letter: r.letter } }),
          h('td', { i18n: 'outcome.' + r.outcome })));
        results.append(h('table', { class: 'ftf-table' },
          h('thead', {}, h('tr', {}, h('th', { i18n: 'tour.results.rank', attrs: { scope: 'col' } }), h('th', { i18n: 'tour.results.entrant', attrs: { scope: 'col' } }), h('th', { i18n: 'tour.results.outcome', attrs: { scope: 'col' } }))),
          h('tbody', {}, rows)));
      }
    }
    bindOnce();
  }

  function enroll() {
    const requestId = 'req-' + Math.random().toString(36).slice(2, 10);
    const r = tournament.enroll({ playerId: guestId, requestId });
    render();
    tx(status, i18n, r.ok ? 'tour.enrolled' : 'tour.closed', r.ok ? { id: r.entry.entryId } : {});
    const focusable = action.querySelector('p, button');
    if (focusable) { focusable.tabIndex = -1; focusable.focus(); }
  }

  let unbind = null;
  function bindOnce() { if (unbind) unbind(); unbind = bindI18n(card, i18n); }
  render();
  const timer = setInterval(render, 30000);
  const unsub = tournament.subscribe(render);
  return { el: card, refresh: render, destroy() { clearInterval(timer); unsub(); if (unbind) unbind(); card.remove(); } };
}
