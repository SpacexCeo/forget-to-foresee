// i18n core: locale registry, lookup with English fallback, runtime switching.
// A missing key never shows the raw key: it renders a neutral placeholder and
// is recorded in `missing` (tests assert that set stays empty).
import { format } from './icu.js';

export const SUPPORTED_LOCALES = ['en', 'uk', 'ru', 'it', 'zh'];
export const BASE_LOCALE = 'en';
/** Shown instead of a raw key when a message is missing everywhere. */
export const MISSING_TEXT = '…';

/** Picks a supported locale from a list such as navigator.languages. */
export function detectLocale(preferred = []) {
  for (const tag of preferred) {
    const base = String(tag || '').toLowerCase().split('-')[0];
    if (SUPPORTED_LOCALES.includes(base)) return base;
  }
  return BASE_LOCALE;
}

/**
 * @param {{messages: Record<string, Record<string,string>>, locale?: string, fallback?: string,
 *          onMissing?: (key: string, locale: string) => void}} opts
 */
export function createI18n({ messages, locale = BASE_LOCALE, fallback = BASE_LOCALE, onMissing } = {}) {
  let current = SUPPORTED_LOCALES.includes(locale) && messages[locale] ? locale : fallback;
  const subs = new Set();
  const missing = new Set();
  const miss = (key) => {
    const tag = `${current}:${key}`;
    if (!missing.has(tag)) { missing.add(tag); if (onMissing) onMissing(key, current); }
  };

  /** Formats `key` with ICU `args` in the current locale. */
  function t(key, args) {
    let msg = messages[current] && messages[current][key];
    if (msg == null) {
      msg = messages[fallback] && messages[fallback][key];
      miss(key);
      if (msg == null) return MISSING_TEXT;
    }
    try { return format(msg, args || {}, msg === (messages[current] || {})[key] ? current : fallback); }
    catch { miss(key); return MISSING_TEXT; }
  }

  return {
    t,
    has: (key) => !!(messages[current] && messages[current][key] != null),
    get locale() { return current; },
    locales: SUPPORTED_LOCALES.filter((l) => messages[l]),
    missing,
    /** Switches language in place; subscribers re-render. No reload, no new season. */
    setLocale(next) {
      if (!messages[next] || next === current) return false;
      current = next;
      for (const fn of [...subs]) fn(current);
      return true;
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
