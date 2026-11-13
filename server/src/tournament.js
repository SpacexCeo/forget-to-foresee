// The Season Cup on the agent API (sprint 7.9). The cup itself is shared with the browser's cup card:
// game/src/ui/tournament-cup.js (pure, no DOM). This file only re-exports it for server.js.
export { createTournament, ENTER_ACTION, NAME_RE, DRIVERS, ENTRY_LIMIT } from '../../game/src/ui/tournament-cup.js';
