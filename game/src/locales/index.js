// Locale registry. English is the base for all five UI languages.
import en from './en.js';
import ru from './ru.js';
import uk from './uk.js';
import it from './it.js';
import zh from './zh.js';

// All five are full translations; a key missing in a locale still falls back to English.
export const MESSAGES = { en, uk, ru, it, zh };
