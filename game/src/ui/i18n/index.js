// Public i18n entry for the game client.
import { MESSAGES } from '../../locales/index.js';
import { createI18n, detectLocale, SUPPORTED_LOCALES, BASE_LOCALE, MISSING_TEXT } from './i18n.js';

export { createI18n, detectLocale, SUPPORTED_LOCALES, BASE_LOCALE, MISSING_TEXT, MESSAGES };
export { format, parse, argNames } from './icu.js';
export * from './engine-adapter.js';

/** The game's i18n instance with both bundled locales. */
export function createGameI18n(locale, opts = {}) {
  const preferred = locale || (typeof navigator !== 'undefined' ? detectLocale(navigator.languages || [navigator.language]) : BASE_LOCALE);
  return createI18n({
    messages: MESSAGES,
    locale: preferred,
    onMissing: opts.onMissing || ((key, loc) => { if (typeof console !== 'undefined') console.warn(`[i18n] missing ${loc}:${key}`); }),
  });
}
