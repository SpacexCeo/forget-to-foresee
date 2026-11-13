// The keys that live in the sprint's English-only seam files (en-*.js): other locales fall back to English for them, so
// the locale-parity tests skip exactly these (sprint plan rule 1).
import quests from './en-quests.js';
import hud from './en-hud.js';
import market from './en-market.js';
import npe from './en-npe.js';
import tips from './en-tips.js';
import video from './en-video.js';
import account from './en-account.js';
export const SPRINT_KEYS = new Set([quests, hud, market, npe, tips, video, account].flatMap((o) => Object.keys(o)));
