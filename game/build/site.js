// Where the game is published (build time; vite.config.js reads it): GitHub Pages today, the owner's own domain once he
// names it. One repository variable switches it: FTF_DOMAIN (e.g. "play.example.com") makes the build serve from "/" and
// every public link point to https://<domain>/; FTF_BASE / FTF_SITE_URL override each part on their own.
// Pure (node tests import it).

export const PAGES_BASE = '/forget-to-foresee/';
export const PAGES_URL = 'https://spacexceo.github.io/forget-to-foresee/';

/**
 * The public path the build serves from and the site's own URL (share links, og: tags).
 * Local dev (no FTF_* at all) serves from "/" and still links to the live Pages site.
 * @param {Record<string, string|undefined>} env
 * @returns {{base: string, siteUrl: string}}
 */
export function siteConfig(env = {}) {
  const domain = String(env.FTF_DOMAIN || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const slash = (s) => (s.endsWith('/') ? s : s + '/');
  const base = env.FTF_BASE ? slash(String(env.FTF_BASE).trim()) : '/'; // a domain of its own serves from the root
  const siteUrl = env.FTF_SITE_URL ? slash(String(env.FTF_SITE_URL).trim()) : domain ? `https://${domain}/` : PAGES_URL;
  return { base, siteUrl };
}
