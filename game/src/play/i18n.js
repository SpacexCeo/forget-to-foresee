// i18n for the play layer: the game messages (src/locales) plus the play strings
// (src/play/locales) in one i18n instance.
// Only the public UI API (src/ui/index.js, docs/ui.md) is used: the UI shell is owned by another
// agent (docs/collab.md).
import { createUiContext, i18n as uiI18n } from '../ui/index.js';
import playEn from './locales/en.js';
import playRu from './locales/ru.js';

const { MESSAGES, createI18n, detectLocale, BASE_LOCALE, resolveArg } = uiI18n;

export const PLAY_MESSAGES = { en: playEn, ru: playRu };
export const MERGED_MESSAGES = { en: { ...MESSAGES.en, ...playEn }, ru: { ...MESSAGES.ru, ...playRu } };

export function createPlayI18n(locale, { onMissing } = {}) {
  const preferred = locale || (typeof navigator !== 'undefined' ? detectLocale(navigator.languages || [navigator.language]) : BASE_LOCALE);
  return createI18n({ messages: MERGED_MESSAGES, locale: preferred, onMissing: onMissing || ((key, loc) => { if (typeof console !== 'undefined') console.warn(`[i18n] missing ${loc}:${key}`); }) });
}

/**
 * The UI shell's context (createUiContext: storage, prefs, guest id, tournament) with its i18n
 * replaced by one that also knows the play strings. Locale changes stay in sync both ways with the
 * prefs, so the lobby, onboarding, HUD and play UI switch language together and mid-season.
 */
export function createPlayContext({ storage, locale } = {}) {
  const base = createUiContext({ storage, locale });
  const i18n = createPlayI18n(base.i18n.locale);
  base.prefs.subscribe((p) => { if (p.locale && p.locale !== i18n.locale) i18n.setLocale(p.locale); });
  i18n.subscribe((l) => { if (base.prefs.get().locale !== l) base.prefs.set({ locale: l }); if (base.i18n.locale !== l) base.i18n.setLocale(l); });
  return { ...base, i18n };
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
