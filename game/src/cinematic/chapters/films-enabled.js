// Pure: whether chapter films play automatically for this page's query (tested in node; index.js uses Vite globs).
/**
 * Films play in a normal season. The judge link (?demo=judge) skips them unless ?films=full|cheap asks for them:
 * the README judge table is a timed, gameplay-first path (juror notes), and a film swallows input while it runs.
 * ?films=off and ?film=<chapter> (a single dev film) also disable the automatic ones.
 * @param {URLSearchParams} params
 */
export function filmsEnabled(params) {
  const films = params.get('films');
  if (films === 'off' || params.get('film')) return false;
  if (params.get('demo') === 'judge') return films === 'full' || films === 'cheap';
  return true;
}
