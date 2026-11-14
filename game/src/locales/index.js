// Locale registry. English is the base for all five UI languages.
import en from './en.js';
import ru from './ru.js';
import uk from './uk.js';
import it from './it.js';
import zh from './zh.js';
import { messagesForNetwork } from '../net/network.js';

// uk, it and zh are full translations (tests/ui-i18n-locales.test.mjs); each spreads en as a safety fallback.
export const MESSAGES = Object.fromEntries(Object.entries({ en, uk, ru, it, zh }).map(([l, m]) => [l, messagesForNetwork(m)])); // a mainnet build says mainnet (net/network.js)
