// The game's own public link (share cards, postcards, "play" links): this page's origin and the build's base, so it
// follows the site wherever it is published (GitHub Pages or the owner's domain, build/site.js); without a page (node)
// the build's configured site URL.
const env = import.meta.env || {}; // (node tests: no Vite env)

/** https://<host><base> of the running game. */
export function siteLink(loc = globalThis.location, base = env.BASE_URL || '/', fallback = env.VITE_FTF_SITE_URL || '') {
  try { return new URL(base, loc.origin).href; } catch { return fallback; }
}
