// The sprint module list (sprint plan 3.2, 8.3). Each module exports mount(ctx) -> {dispose, update?(dt)}; it loads
// only when its flag is on, through retryImport. Mount order: first-seen, rpg, quests, market, lab, npe (npe last: it
// starts the flow once everything it needs exists).
import { retryImport } from './retry-import.js';

export const MODULES = [
  { id: 'firstSeenTips', flag: 'firstSeenTips', load: () => retryImport(() => import('./first-seen.js')) },
  { id: 'rpgHud', flag: 'rpgHud', load: () => retryImport(() => import('../rpg/index.js')) },
  { id: 'quests', flag: 'questJournal', load: () => retryImport(() => import('../quests/index.js')) },
  { id: 'market', flag: 'marketplace', load: () => retryImport(() => import('../market/index.js')) },
  { id: 'lab', flag: 'labPrologue', load: () => retryImport(() => import('../scenes/lab/index.js')) },
  { id: 'npe', flag: 'newPlayerIntro', load: () => retryImport(() => import('../npe/index.js')) },
];
