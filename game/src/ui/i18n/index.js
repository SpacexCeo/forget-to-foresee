// Public i18n entry for the game client.
import { MESSAGES } from '../../locales/index.js';
import { createI18n, detectLocale, SUPPORTED_LOCALES, BASE_LOCALE, MISSING_TEXT } from './i18n.js';

export { createI18n, detectLocale, SUPPORTED_LOCALES, BASE_LOCALE, MISSING_TEXT, MESSAGES };
export { format, parse, argNames } from './icu.js';
export * from './engine-adapter.js';

/**
 * The game's i18n instance with every bundled locale. English is the release language: without an explicit
 * `locale` (the player's saved choice or `?lang=`) the game starts in English for everyone. The browser's language is
 * never used to pick one (readiness audit 09.11: the public build opened in Russian); `detectLocale` stays exported
 * for tools only.
 */
export function createGameI18n(locale, opts = {}) {
  const preferred = locale || BASE_LOCALE;
  return createI18n({
    messages: MESSAGES,
    locale: preferred,
    onMissing: opts.onMissing || ((key, loc) => { if (typeof console !== 'undefined') console.warn(`[i18n] missing ${loc}:${key}`); }),
  });
}
