// i18n for the play layer: the UI shell's context (storage, prefs, guest id, tournament) with the
// game messages (src/locales) plus the play strings (src/play/locales) in one i18n instance, so the
// lobby, onboarding, HUD and the 3D play UI switch language together and mid-season.
import { MESSAGES } from '../locales/index.js';
import { createI18n, detectLocale, BASE_LOCALE } from '../ui/i18n/i18n.js';
import { resolveArg } from '../ui/i18n/engine-adapter.js';
import { createSafeStorage } from '../ui/storage.js';
import { createPrefs, applyPrefsToDocument } from '../ui/prefs.js';
import { getGuestId } from '../ui/entitlement.js';
import { createTournamentStore } from '../ui/tournament.js';
import playEn from './locales/en.js';
import playRu from './locales/ru.js';

export const PLAY_MESSAGES = { en: playEn, ru: playRu };
export const MERGED_MESSAGES = { en: { ...MESSAGES.en, ...playEn }, ru: { ...MESSAGES.ru, ...playRu } };

export function createPlayI18n(locale, { onMissing } = {}) {
  const preferred = locale || (typeof navigator !== 'undefined' ? detectLocale(navigator.languages || [navigator.language]) : BASE_LOCALE);
  return createI18n({ messages: MERGED_MESSAGES, locale: preferred, onMissing: onMissing || ((key, loc) => { if (typeof console !== 'undefined') console.warn(`[i18n] missing ${loc}:${key}`); }) });
}

/** Same shape as src/ui/context.js createUiContext(), with the merged messages. */
export function createPlayContext({ storage, locale } = {}) {
  const st = storage || createSafeStorage();
  const prefs = createPrefs(st);
  const i18n = createPlayI18n(locale || prefs.get().locale || undefined);
  const sync = () => applyPrefsToDocument(prefs);
  prefs.subscribe((p) => { if (p.locale && p.locale !== i18n.locale) i18n.setLocale(p.locale); sync(); });
  i18n.subscribe((l) => { if (prefs.get().locale !== l) prefs.set({ locale: l }); });
  try { globalThis.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', sync); } catch { /* old browsers */ }
  sync();
  return { storage: st, prefs, i18n, guestId: getGuestId(st), tournament: createTournamentStore({ storage: st }) };
}

/**
 * Renders {key, args} where args may hold: play tags ({$agentId: 'moss'}), nested messages
 * ({key, args}, e.g. an offer inside "Accept: …") and the engine adapter's tags ($agent, $shell…).
 */
export function renderMsg(i18n, key, args = {}) {
  const out = {};
  for (const [k, v] of Object.entries(args || {})) out[k] = resolvePlayArg(i18n, v);
  return i18n.t(key, out);
}

export function resolvePlayArg(i18n, v) {
  if (v == null || typeof v !== 'object') return v;
  if ('$agentId' in v) return i18n.t('agent.' + v.$agentId);
  if (typeof v.key === 'string' && 'args' in v) return renderMsg(i18n, v.key, v.args);
  return resolveArg(v, i18n);
}

/** A localized reason (rules, world or transport) for a rejected command. */
export function reasonText(i18n, reason) {
  const k = 'reason.' + reason;
  return i18n.has(k) || MERGED_MESSAGES.en[k] ? i18n.t(k) : String(reason || '').replace(/_/g, ' ');
}
