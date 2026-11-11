// POST /api/agent/decide {npc, echo, bars, position} -> {decision: {action, reason, decision_hash}, tee: {...}}
import { teeHandler } from '../../lib/tee-http.js';
export default teeHandler('decide');
