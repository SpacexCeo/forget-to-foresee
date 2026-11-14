// The app shell for the installed game (PWA; ui/pwa.js registers it in production builds). It keeps only what opens the
// game: the page itself (network first, the cached copy when offline) and the build's hashed scripts and styles
// (cache first: a hashed name never changes). It never touches anything else: models, textures, sound, the NEAR RPC,
// the relayer, presence, features.json or any other host go straight to the network as if it were not here.
const CACHE = 'ftf-shell-v1';
const MAX_ASSETS = 80;
const scope = new URL(self.registration.scope);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(new Request(scope.href, { cache: 'reload' }))).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ftf-shell-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

/** Whether a request belongs to the shell: same origin, GET, the page or a hashed script / style of this build. */
function shellKind(req) {
  if (req.method !== 'GET') return null;
  const u = new URL(req.url);
  if (u.origin !== scope.origin || !u.pathname.startsWith(scope.pathname)) return null;
  if (req.mode === 'navigate') return 'page';
  if (/\/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(js|css)$/.test(u.pathname)) return 'asset';
  return null;
}

async function trim(cache) {
  const keys = await cache.keys();
  const assets = keys.filter((r) => /\/assets\//.test(new URL(r.url).pathname));
  for (const r of assets.slice(0, Math.max(0, assets.length - MAX_ASSETS))) await cache.delete(r);
}

self.addEventListener('fetch', (e) => {
  const kind = shellKind(e.request);
  if (!kind) return; // everything else: the network, untouched
  if (kind === 'page') {
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(scope.href, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(scope.href).then((r) => r || Response.error())));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy).then(() => trim(c))).catch(() => {}); }
    return res;
  })));
});
