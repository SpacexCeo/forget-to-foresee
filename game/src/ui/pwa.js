// The installable game (PWA; owner 14.11): the manifest and icons are in public/, the app shell's service worker is
// public/sw.js (registered here in production builds only, never in dev or on capture links), and phones get a quiet
// "Install the game" pill once the town is on screen: Android / Chrome through its own install prompt, iPhone / iPad
// with the Share -> Add to Home Screen line. Dismissed or installed, it stays away on this device. Plain DOM.

export const PWA_KEY = 'ftf.pwa.v1';

/** Whether the install pill may show. Pure. */
export function installHintFor({ phone = false, standalone = false, ios = false, prompt = false, dismissed = false } = {}) {
  if (!phone || standalone || dismissed) return null;
  if (prompt) return 'prompt';
  return ios ? 'ios' : null;
}

/** Registers the shell worker under the build's base (production only). */
export function registerShell({ base = '/', prod = false, params = null, nav = globalThis.navigator } = {}) {
  if (!prod || !nav || !('serviceWorker' in nav)) return false;
  if (params && (params.get('sw') === '0' || params.has('capture') || params.has('cinematic') || params.has('film'))) return false;
  nav.serviceWorker.register(base + 'sw.js', { scope: base }).catch((e) => console.warn('[pwa] the shell worker did not register', e));
  return true;
}

const CSS = `
.ftf-pwa { position: fixed; left: 50%; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 14; display: flex; align-items: center; gap: 4px;
  max-width: calc(100vw - 24px); padding: 4px 4px 4px 14px; border-radius: 20px; border: 1px solid rgba(233,180,76,.5); background: rgba(14,18,20,.88);
  color: #f3ead6; font: 500 13px/1.3 system-ui, -apple-system, sans-serif; }
.ftf-pwa[hidden] { display: none; }
.ftf-pwa button { min-height: 34px; padding: 4px 12px; border-radius: 16px; border: 0; background: rgba(233,180,76,.2); color: #f3ead6; font: 600 13px system-ui, sans-serif; }
.ftf-pwa .x { background: none; padding: 4px 10px; font-size: 16px; opacity: .75; }
`;

/**
 * The phone's install pill. `busy()` holds it while a first-time overlay owns the screen.
 * @param {{t: (k: string) => string, busy?: () => boolean, doc?: Document, win?: Window, storage?: Storage|null}} o
 */
export function mountInstallHint({ t, busy = () => false, doc = globalThis.document, win = globalThis.window, storage = null }) {
  const mm = (q) => { try { return !!(win.matchMedia && win.matchMedia(q).matches); } catch { return false; } };
  const nav = win.navigator || {};
  const phone = mm('(pointer: coarse)') && !mm('(any-pointer: fine)');
  const standalone = mm('(display-mode: fullscreen)') || mm('(display-mode: standalone)') || nav.standalone === true;
  const ios = /iPhone|iPad|iPod/i.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  let dismissed = false; try { dismissed = !!(storage && storage.getItem(PWA_KEY)); } catch { /* */ }
  let deferred = null, el = null, timer = 0;
  const done = (why) => { try { if (storage) storage.setItem(PWA_KEY, why); } catch { /* */ } dismissed = true; if (el) el.remove(); el = null; clearInterval(timer); };
  function show(kind) {
    if (el || dismissed) return;
    if (!doc.getElementById('ftf-pwa-css')) { const s = doc.createElement('style'); s.id = 'ftf-pwa-css'; s.textContent = CSS; doc.head.append(s); }
    el = doc.createElement('div'); el.className = 'ftf-pwa'; el.setAttribute('role', 'note'); el.hidden = true;
    const text = doc.createElement('span'); text.textContent = t(kind === 'ios' ? 'pwa.ios' : 'pwa.install.line');
    el.append(text);
    if (kind === 'prompt') {
      const go = doc.createElement('button'); go.type = 'button'; go.textContent = t('pwa.install');
      go.addEventListener('click', async () => { const d = deferred; deferred = null; if (!d) return; try { d.prompt(); const c = await d.userChoice; done(c && c.outcome === 'accepted' ? 'installed' : 'dismissed'); } catch { done('dismissed'); } });
      el.append(go);
    }
    const x = doc.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', t('pwa.close'));
    x.addEventListener('click', () => done('dismissed'));
    el.append(x); doc.body.append(el);
    timer = setInterval(() => { if (el) el.hidden = !!busy() || !!doc.querySelector('dialog[open], .gm, .mk2-wrap'); }, 700);
  }
  const decide = () => { const k = installHintFor({ phone, standalone, ios, prompt: !!deferred, dismissed }); if (k) show(k); };
  win.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; decide(); });
  win.addEventListener('appinstalled', () => done('installed'));
  setTimeout(decide, 20000); // after the first look round the town (iPhone has no prompt event: the Share line)
  return { get shown() { return !!el; }, dispose() { clearInterval(timer); if (el) el.remove(); } };
}
