// The way back from a season to the city: a reload that lands in Evermind. The season lives in the browser tab
// and does not survive leaving it, so the link drops everything that names a season.

/** @param {string} href the current page URL @returns {string} the same page, opening in the city */
export function cityUrl(href) {
  const u = new URL(href);
  for (const k of ['demo', 'seed', 'mode', 'cinematic', 'film', 'films', 'hints']) u.searchParams.delete(k);
  u.searchParams.set('play', 'direct'); u.searchParams.set('start', 'city');
  u.hash = '';
  return u.toString();
}
