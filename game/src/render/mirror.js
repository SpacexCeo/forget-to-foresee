// Asset mirror (owner, 11.11: players in China saw the greybox because GitHub Pages is slow or blocked there).
// The same files are served by jsDelivr from the repository (nodes reachable in China). A model download tries the
// page's own host first with a time limit for the response; on an error or a timeout it switches to the mirror for the
// rest of the session (sticky in sessionStorage). Players whose clock is set to a mainland China time zone, and
// ?mirror=1, start on the mirror; ?mirror=0 turns it off. VITE_FTF_ASSET_MIRROR overrides the URL.
// jsDelivr serves GitHub files up to 20 MiB; larger files always come from the page's host.
export const DEFAULT_MIRROR = 'https://cdn.jsdelivr.net/gh/SpacexCeo/forget-to-foresee@main/game/public/';
export const MIRROR_MAX_BYTES = 20 * 1024 * 1024;
const STICKY = 'ftf.mirror.v1';
const CN_ZONES = /^Asia\/(Shanghai|Chongqing|Chungking|Harbin|Urumqi|Kashgar)$/;

/** Whether this browser should start on the mirror. */
export function preferMirrorAtStart({ param = null, timeZone = null, sticky = null } = {}) {
  if (param === '0') return false;
  if (param === '1' || sticky === '1') return true;
  return CN_ZONES.test(String(timeZone || ''));
}

/** The mirror URL of a page-relative asset URL, or null (absolute elsewhere, or not under the base). */
export function mirrorUrl(url, base, mirror = DEFAULT_MIRROR) {
  if (!mirror || typeof url !== 'string') return null;
  const b = base || '/';
  let rel = null;
  if (url.startsWith(b)) rel = url.slice(b.length);
  else if (!/^[a-z]+:|^\//i.test(url)) rel = url;
  if (rel == null || rel.startsWith('..')) return null;
  return mirror.replace(/\/?$/, '/') + rel.replace(/^\//, '');
}

/**
 * @param {{base: string, mirror?: string|null, fetch?: Function, storage?: object, preferMirror?: boolean, timeoutMs?: number}} o
 * @returns {{fetch(url: string, bytes?: number): Promise<Response>, readonly onMirror: boolean, readonly mirror: string|null}}
 */
export function createMirrorFetch({ base, mirror = DEFAULT_MIRROR, fetch = globalThis.fetch, storage = null, preferMirror = false, timeoutMs = 15000 }) {
  let onMirror = !!(mirror && preferMirror);
  const timed = (url) => {
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
    return fetch(url, ac ? { signal: ac.signal } : undefined).then((r) => { if (timer) clearTimeout(timer); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r; }, (e) => { if (timer) clearTimeout(timer); throw e; });
  };
  const goMirror = () => { if (!onMirror) { onMirror = true; try { if (storage) storage.setItem(STICKY, '1'); } catch { /* memory only */ } console.warn('[assets] switching to the mirror'); } };
  return {
    get onMirror() { return onMirror; },
    get mirror() { return mirror; },
    async fetch(url, bytes = 0) {
      const alt = bytes && bytes > MIRROR_MAX_BYTES ? null : mirrorUrl(url, base, mirror);
      if (!alt) return fetch(url);
      if (onMirror) { try { return await timed(alt); } catch { return fetch(url); } }
      try { return await timed(url); } catch (e) { goMirror(); try { return await timed(alt); } catch { throw e; } }
    },
  };
}

export const MIRROR_STICKY_KEY = STICKY;
