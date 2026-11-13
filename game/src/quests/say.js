// Strings for the quest modules: the active locale first, else the English table (play/locales/en-quests.js) until the
// locale imports it. `{name}` placeholders are filled from args.
import EN from '../play/locales/en-quests.js';

export const fill = (s, args = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (args[k] != null ? String(args[k]) : m));
export function createSay(i18n = null) {
  return (key, args = {}) => {
    if (i18n && typeof i18n.t === 'function') { const v = i18n.t(key, args); if (v && v !== key && v !== '…' && v !== '...') return v; } // the play i18n shows '…' for a missing key
    return EN[key] != null ? fill(EN[key], args) : key;
  };
}
/** A giver's display name: the locale's folk.name.<key>, else the journal's fallback table. */
export function giverName(say, key, names) { const v = say('folk.name.' + key); return v && v !== 'folk.name.' + key ? v : (names[key] || key); }
