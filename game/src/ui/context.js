// Shared UI context: storage, preferences, i18n, guest id, tournament store.
import { createSafeStorage } from './storage.js';
import { createPrefs, applyPrefsToDocument } from './prefs.js';
import { createGameI18n } from './i18n/index.js';
import { getGuestId } from './entitlement.js';
import { createTournamentStore } from './tournament.js';

export function createUiContext({ storage, locale } = {}) {
  const st = storage || createSafeStorage();
  const prefs = createPrefs(st);
  const i18n = createGameI18n(locale || prefs.get().locale || undefined);
  const sync = () => applyPrefsToDocument(prefs);
  prefs.subscribe((p) => { if (p.locale && p.locale !== i18n.locale) i18n.setLocale(p.locale); sync(); });
  i18n.subscribe((l) => { if (prefs.get().locale !== l) prefs.set({ locale: l }); });
  try { globalThis.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', sync); } catch { /* old browsers */ }
  sync();
  return { storage: st, prefs, i18n, guestId: getGuestId(st), tournament: createTournamentStore({ storage: st }) };
}

let shared = null;
/** The page-wide context used when a mount function is called without one. */
export function getUiContext() { if (!shared) shared = createUiContext(); return shared; }
