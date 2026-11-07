// Locale registry. English is the base; Russian is the second UI language.
import en from './en.js';
import ru from './ru.js';
import uk from './uk.js';
import it from './it.js';
import zh from './zh.js';

// uk, it and zh cover the lobby and core labels; untranslated keys fall back to English.
export const MESSAGES = { en, uk, ru, it, zh };
